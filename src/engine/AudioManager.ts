/**
 * AudioManager — WebAudio-based mixer with three logical channels:
 *   bgm  : background music (cross-fades, looped)
 *   sfx  : world / combat sound effects (overlapping playback)
 *   ui   : UI clicks / hovers (highest priority, low-latency)
 *
 * The manager is **graceful**: if no audio files exist on disk yet, every
 * call becomes a no-op and logs at most one warning per missing asset. This
 * lets game code wire up sound hooks now and have them activate the moment
 * the artist drops files into the catalogue paths below.
 *
 * The manager auto-subscribes to SettingsManager so mute toggles and volume
 * slider changes take effect immediately.
 */

import { SettingsManager } from './SettingsManager';

type Channel = 'bgm' | 'sfx' | 'ui';

interface BufferEntry {
    buffer: AudioBuffer | null;
    /** True after a load attempt completed (success or failure). */
    settled: boolean;
    /** True if the asset is missing — we warn once and never retry. */
    missing: boolean;
}

interface PlayOptions {
    /** 0..1 volume multiplier on top of the channel master. */
    volume?: number;
    /** Random pitch jitter (1 ± rate). Useful for footsteps. */
    rate?: number;
    /** When true, the sound loops until stopped. */
    loop?: boolean;
}

interface CrossfadeOptions {
    fadeMs?: number;
    volume?: number;
}

/**
 * Catalogue of known sound assets, keyed by short id. Add new entries here
 * as the artist provides files. Paths are relative to /public.
 */
export const AUDIO_CATALOG: Record<string, { src: string; channel: Channel }> = {
    // UI
    'ui.confirm':  { src: '/Sound/ui/confirm.ogg',  channel: 'ui' },
    'ui.cancel':   { src: '/Sound/ui/cancel.ogg',   channel: 'ui' },
    'ui.hover':    { src: '/Sound/ui/hover.ogg',    channel: 'ui' },
    'ui.error':    { src: '/Sound/ui/error.ogg',    channel: 'ui' },
    'ui.open':     { src: '/Sound/ui/open.ogg',     channel: 'ui' },
    'ui.close':    { src: '/Sound/ui/close.ogg',    channel: 'ui' },

    // Combat
    'sfx.swing':       { src: '/Sound/sfx/swing.ogg',       channel: 'sfx' },
    'sfx.hit_flesh':   { src: '/Sound/sfx/hit_flesh.ogg',   channel: 'sfx' },
    'sfx.hit_metal':   { src: '/Sound/sfx/hit_metal.ogg',   channel: 'sfx' },
    'sfx.crit':        { src: '/Sound/sfx/crit.ogg',        channel: 'sfx' },
    'sfx.miss':        { src: '/Sound/sfx/miss.ogg',        channel: 'sfx' },
    'sfx.heal':        { src: '/Sound/sfx/heal.ogg',        channel: 'sfx' },
    'sfx.levelup':     { src: '/Sound/sfx/levelup.ogg',     channel: 'sfx' },
    'sfx.loot_pickup': { src: '/Sound/sfx/loot_pickup.ogg', channel: 'sfx' },
    'sfx.coin':        { src: '/Sound/sfx/coin.ogg',        channel: 'sfx' },

    // World
    'sfx.footstep_grass': { src: '/Sound/world/footstep_grass.ogg', channel: 'sfx' },
    'sfx.footstep_stone': { src: '/Sound/world/footstep_stone.ogg', channel: 'sfx' },
    'sfx.footstep_water': { src: '/Sound/world/footstep_water.ogg', channel: 'sfx' },
    'sfx.door':           { src: '/Sound/world/door.ogg',           channel: 'sfx' },
    'sfx.extract_start':  { src: '/Sound/world/extract_start.ogg',  channel: 'sfx' },
    'sfx.extract_done':   { src: '/Sound/world/extract_done.ogg',   channel: 'sfx' },

    // Music
    'bgm.title':   { src: '/Sound/bgm/title.ogg',   channel: 'bgm' },
    'bgm.world':   { src: '/Sound/bgm/world.ogg',   channel: 'bgm' },
    'bgm.town':    { src: '/Sound/bgm/town.ogg',    channel: 'bgm' },
    'bgm.raid':    { src: '/Sound/bgm/raid.ogg',    channel: 'bgm' },
    'bgm.boss':    { src: '/Sound/bgm/boss.ogg',    channel: 'bgm' },
    'bgm.victory': { src: '/Sound/bgm/victory.ogg', channel: 'bgm' },
    'bgm.gameover':{ src: '/Sound/bgm/gameover.ogg',channel: 'bgm' },
};

class AudioManagerClass {
    private ctx: AudioContext | null = null;
    private bgmGain: GainNode | null = null;
    private sfxGain: GainNode | null = null;
    private uiGain: GainNode | null = null;
    private buffers = new Map<string, BufferEntry>();
    private currentBgmKey: string | null = null;
    private currentBgmSource: AudioBufferSourceNode | null = null;
    private currentBgmGain: GainNode | null = null;
    private settingsUnsub: (() => void) | null = null;
    private warnedMissing = new Set<string>();

    /**
     * Lazily creates the AudioContext on first user interaction. Browsers
     * block AudioContext.create() until the user has gestured, so we don't
     * eagerly call this at boot — instead `ensureContext` is called by the
     * first playSfx/playBgm/playUi call.
     */
    public init(): void {
        // Subscribe so volume changes propagate immediately, even before the
        // AudioContext is created.
        if (!this.settingsUnsub) {
            this.settingsUnsub = SettingsManager.onChange(() => this.applySettings());
        }
    }

    public dispose(): void {
        if (this.settingsUnsub) {
            this.settingsUnsub();
            this.settingsUnsub = null;
        }
        this.stopBgm();
        if (this.ctx) {
            void this.ctx.close().catch(() => undefined);
            this.ctx = null;
        }
    }

    /**
     * Preload a list of sound keys. Missing files settle as `missing: true`
     * after the first failed load and are silently skipped from then on.
     */
    public async preload(keys: string[]): Promise<void> {
        await Promise.all(keys.map((k) => this.loadBuffer(k)));
    }

    public playSfx(key: string, options: PlayOptions = {}): void {
        this.playOnChannel(key, 'sfx', options);
    }

    public playUi(key: string, options: PlayOptions = {}): void {
        this.playOnChannel(key, 'ui', options);
    }

    /**
     * Switch BGM with a cross-fade. Calling with the same key as the current
     * track is a no-op.
     */
    public playBgm(key: string, options: CrossfadeOptions = {}): void {
        if (this.currentBgmKey === key) return;
        if (!this.ensureContext()) return;

        void this.loadBuffer(key).then(() => {
            if (this.currentBgmKey === key) return;
            const entry = this.buffers.get(key);
            if (!entry || !entry.buffer) return;
            const ctx = this.ctx!;
            const fadeMs = options.fadeMs ?? 600;
            const fadeSec = fadeMs / 1000;
            const targetVol = (options.volume ?? 1) * (SettingsManager.getMuteBGM() ? 0 : 1);

            // Fade-out previous
            if (this.currentBgmSource && this.currentBgmGain) {
                const prevGain = this.currentBgmGain;
                const prevSource = this.currentBgmSource;
                prevGain.gain.cancelScheduledValues(ctx.currentTime);
                prevGain.gain.setValueAtTime(prevGain.gain.value, ctx.currentTime);
                prevGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSec);
                window.setTimeout(() => {
                    try { prevSource.stop(); } catch { /* already stopped */ }
                }, fadeMs + 50);
            }

            // Fade-in next
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + fadeSec);
            gain.connect(this.bgmGain!);

            const source = ctx.createBufferSource();
            source.buffer = entry.buffer;
            source.loop = true;
            source.connect(gain);
            source.start();

            this.currentBgmKey = key;
            this.currentBgmSource = source;
            this.currentBgmGain = gain;
        });
    }

    public stopBgm(fadeMs: number = 300): void {
        if (!this.ctx || !this.currentBgmSource || !this.currentBgmGain) return;
        const fadeSec = Math.max(0, fadeMs) / 1000;
        const prevGain = this.currentBgmGain;
        const prevSource = this.currentBgmSource;
        prevGain.gain.cancelScheduledValues(this.ctx.currentTime);
        prevGain.gain.setValueAtTime(prevGain.gain.value, this.ctx.currentTime);
        prevGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeSec);
        window.setTimeout(() => {
            try { prevSource.stop(); } catch { /* already stopped */ }
        }, fadeMs + 50);
        this.currentBgmKey = null;
        this.currentBgmSource = null;
        this.currentBgmGain = null;
    }

    // ─── Internal ────────────────────────────────────────────────

    private playOnChannel(key: string, channel: Channel, options: PlayOptions): void {
        if (!this.ensureContext()) return;
        if (channel === 'sfx' && SettingsManager.getMuteSFX()) return;
        if (channel === 'ui' && SettingsManager.getMuteSFX()) return;  // UI sounds tied to SFX mute for simplicity
        const cat = AUDIO_CATALOG[key];
        if (!cat || cat.channel !== channel) return;

        void this.loadBuffer(key).then(() => {
            const entry = this.buffers.get(key);
            if (!entry || !entry.buffer) return;
            const ctx = this.ctx!;
            const dest = channel === 'ui' ? this.uiGain! : this.sfxGain!;

            const node = ctx.createBufferSource();
            node.buffer = entry.buffer;
            node.loop = options.loop ?? false;
            if (options.rate && options.rate > 0) {
                const jitter = (Math.random() * 2 - 1) * options.rate;
                node.playbackRate.value = Math.max(0.25, 1 + jitter);
            }

            if ((options.volume ?? 1) !== 1) {
                const g = ctx.createGain();
                g.gain.value = options.volume ?? 1;
                node.connect(g);
                g.connect(dest);
            } else {
                node.connect(dest);
            }
            node.start();
        });
    }

    private ensureContext(): boolean {
        if (this.ctx) return true;
        try {
            const ContextCtor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
                || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!ContextCtor) return false;
            this.ctx = new ContextCtor();
        } catch {
            return false;
        }

        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.uiGain = this.ctx.createGain();
        this.bgmGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.ctx.destination);
        this.uiGain.connect(this.ctx.destination);

        this.applySettings();
        return true;
    }

    private applySettings(): void {
        if (!this.ctx || !this.bgmGain || !this.sfxGain || !this.uiGain) return;
        const t = this.ctx.currentTime;
        const bgm = SettingsManager.getMuteBGM() ? 0 : SettingsManager.getBgmVolume();
        const sfx = SettingsManager.getMuteSFX() ? 0 : SettingsManager.getSfxVolume();
        const ui  = SettingsManager.getMuteSFX() ? 0 : SettingsManager.getUiVolume();
        this.bgmGain.gain.setValueAtTime(bgm, t);
        this.sfxGain.gain.setValueAtTime(sfx, t);
        this.uiGain.gain.setValueAtTime(ui, t);
    }

    private async loadBuffer(key: string): Promise<void> {
        const existing = this.buffers.get(key);
        if (existing && existing.settled) return;
        if (existing && !existing.settled) {
            // Another loadBuffer is already in flight — let it finish first.
            await new Promise<void>((resolve) => {
                const check = () => {
                    const e = this.buffers.get(key);
                    if (e?.settled) resolve();
                    else window.setTimeout(check, 30);
                };
                check();
            });
            return;
        }
        const cat = AUDIO_CATALOG[key];
        if (!cat) return;
        const entry: BufferEntry = { buffer: null, settled: false, missing: false };
        this.buffers.set(key, entry);
        if (!this.ensureContext()) {
            entry.settled = true;
            entry.missing = true;
            return;
        }

        try {
            const response = await fetch(cat.src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arr = await response.arrayBuffer();
            entry.buffer = await this.ctx!.decodeAudioData(arr);
        } catch {
            entry.missing = true;
            if (!this.warnedMissing.has(key)) {
                this.warnedMissing.add(key);
                console.warn(`[AudioManager] '${key}' not available at ${cat.src} — silenced.`);
            }
        } finally {
            entry.settled = true;
        }
    }
}

export const AudioManager = new AudioManagerClass();
