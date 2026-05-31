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
import { renderMidiToAudioBuffer } from './MidiSynth';

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
    'ui.confirm':  { src: '/assets/sounds/ui/confirm.ogg',  channel: 'ui' },
    'ui.cancel':   { src: '/assets/sounds/ui/cancel.ogg',   channel: 'ui' },
    'ui.hover':    { src: '/assets/sounds/ui/hover.ogg',    channel: 'ui' },
    'ui.error':    { src: '/assets/sounds/ui/error.ogg',    channel: 'ui' },
    'ui.open':     { src: '/assets/sounds/ui/open.ogg',     channel: 'ui' },
    'ui.close':    { src: '/assets/sounds/ui/close.ogg',    channel: 'ui' },

    // Combat
    'sfx.swing':       { src: '/assets/sounds/sfx/swing.ogg',       channel: 'sfx' },
    'sfx.hit_flesh':   { src: '/assets/sounds/sfx/hit_flesh.ogg',   channel: 'sfx' },
    'sfx.hit_metal':   { src: '/assets/sounds/sfx/hit_metal.ogg',   channel: 'sfx' },
    'sfx.crit':        { src: '/assets/sounds/sfx/crit.ogg',        channel: 'sfx' },
    'sfx.miss':        { src: '/assets/sounds/sfx/miss.ogg',        channel: 'sfx' },
    'sfx.heal':        { src: '/assets/sounds/sfx/heal.ogg',        channel: 'sfx' },
    'sfx.levelup':     { src: '/assets/sounds/sfx/levelup.ogg',     channel: 'sfx' },
    'sfx.loot_pickup': { src: '/assets/sounds/sfx/loot_pickup.ogg', channel: 'sfx' },
    'sfx.coin':        { src: '/assets/sounds/sfx/coin.ogg',        channel: 'sfx' },

    // World
    'sfx.footstep_grass': { src: '/assets/sounds/world/footstep_grass.ogg', channel: 'sfx' },
    'sfx.footstep_stone': { src: '/assets/sounds/world/footstep_stone.ogg', channel: 'sfx' },
    'sfx.footstep_water': { src: '/assets/sounds/world/footstep_water.ogg', channel: 'sfx' },
    'sfx.door':           { src: '/assets/sounds/world/door.ogg',           channel: 'sfx' },
    'sfx.extract_start':  { src: '/assets/sounds/world/extract_start.ogg',  channel: 'sfx' },
    'sfx.extract_done':   { src: '/assets/sounds/world/extract_done.ogg',   channel: 'sfx' },

    // Music
    'bgm.title':   { src: '/assets/sounds/bgm/title.ogg',   channel: 'bgm' },
    'bgm.world':   { src: '/assets/sounds/bgm/world.ogg',   channel: 'bgm' },
    'bgm.town':    { src: '/assets/sounds/bgm/town.ogg',    channel: 'bgm' },
    'bgm.raid':    { src: '/assets/sounds/bgm/raid.ogg',    channel: 'bgm' },
    'bgm.boss':    { src: '/assets/sounds/bgm/boss.ogg',    channel: 'bgm' },
    'bgm.victory': { src: '/assets/sounds/bgm/victory.ogg', channel: 'bgm' },
    'bgm.gameover':{ src: '/assets/sounds/bgm/gameover.ogg',channel: 'bgm' },
    'bgm.story.episode01': { src: '/assets/sounds/bgm/story/01.mid', channel: 'bgm' },
    'bgm.story.episode02': { src: '/assets/sounds/bgm/story/02.mid', channel: 'bgm' },
    'bgm.story.episode03': { src: '/assets/sounds/bgm/story/03.mid', channel: 'bgm' },
    'bgm.story.episode04': { src: '/assets/sounds/bgm/story/04.mid', channel: 'bgm' },
    'bgm.story.episode05': { src: '/assets/sounds/bgm/story/05.mid', channel: 'bgm' },
    'bgm.story.episode06': { src: '/assets/sounds/bgm/story/06.mid', channel: 'bgm' },
    'bgm.story.episode07': { src: '/assets/sounds/bgm/story/07.mid', channel: 'bgm' },
    'bgm.story.episode08': { src: '/assets/sounds/bgm/story/08.mid', channel: 'bgm' },
    'bgm.story.episode09': { src: '/assets/sounds/bgm/story/09.mid', channel: 'bgm' },
    'bgm.story.episode10': { src: '/assets/sounds/bgm/story/10.mid', channel: 'bgm' },
    'bgm.story.episode11': { src: '/assets/sounds/bgm/story/11.mid', channel: 'bgm' },
    'bgm.story.episode12': { src: '/assets/sounds/bgm/story/12.mid', channel: 'bgm' },
    'bgm.story.episode13': { src: '/assets/sounds/bgm/story/13.mid', channel: 'bgm' },
    'bgm.story.episode14': { src: '/assets/sounds/bgm/story/14.mid', channel: 'bgm' },
    'bgm.story.episode15': { src: '/assets/sounds/bgm/story/15.mid', channel: 'bgm' },
    'bgm.story.episode16': { src: '/assets/sounds/bgm/story/16.mid', channel: 'bgm' },
    'bgm.story.episode17': { src: '/assets/sounds/bgm/story/17.mid', channel: 'bgm' },
    'bgm.story.episode18': { src: '/assets/sounds/bgm/story/18.mid', channel: 'bgm' },
    'bgm.story.episode19': { src: '/assets/sounds/bgm/story/19.mid', channel: 'bgm' },
    'bgm.story.episode20': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
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
            entry.buffer = this.isMidiSource(cat.src)
                ? await renderMidiToAudioBuffer(this.ctx!, arr)
                : await this.ctx!.decodeAudioData(arr);
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

    private isMidiSource(src: string): boolean {
        const lower = src.toLowerCase();
        return lower.endsWith('.mid') || lower.endsWith('.midi');
    }
}

export const AudioManager = new AudioManagerClass();
