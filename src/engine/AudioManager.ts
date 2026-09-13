/**
 * AudioManager — WebAudio-based mixer with three logical channels:
 *   bgm  : background music (cross-fades, looped)
 *   sfx  : world / combat sound effects (overlapping playback)
 *   ui   : UI clicks / hovers
 *
 * Recovered WAV effects and MIDI music share decoded buffers by source.
 * Missing optional assets are skipped with one warning per file.
 *
 * The manager auto-subscribes to SettingsManager so mute toggles and volume
 * slider changes take effect immediately.
 */

import { SettingsManager } from './SettingsManager';
import { renderMidiToAudioBuffer } from './MidiSynth';
import { getRecordedFootstepKey, type FieldFootstepSurface } from '../field/FieldFootsteps';

type Channel = 'bgm' | 'sfx' | 'ui';

interface BufferEntry {
    buffer: AudioBuffer | null;
    /** True after a load attempt completed (success or failure). */
    settled: boolean;
    /** True if the asset is missing — we warn once and never retry. */
    missing: boolean;
    loading?: Promise<void>;
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
const originalSfx = (id: string): string => `/assets/sounds/original/${id}.wav`;
const SFX_OUTPUT_TRIM = 0.88;
const UI_OUTPUT_TRIM = 0.9;

export const AUDIO_CATALOG: Record<string, { src: string; channel: Channel }> = {
    // UI
    'ui.confirm':  { src: '/assets/sounds/ui/confirm.wav', channel: 'ui' },
    'ui.cancel':   { src: '/assets/sounds/ui/cancel.wav',  channel: 'ui' },
    'ui.hover':    { src: '/assets/sounds/ui/hover.wav',   channel: 'ui' },
    'ui.error':    { src: '/assets/sounds/ui/error.wav',   channel: 'ui' },
    'ui.open':     { src: '/assets/sounds/ui/open.wav',    channel: 'ui' },
    'ui.close':    { src: '/assets/sounds/ui/close.wav',   channel: 'ui' },

    // Combat
    'sfx.swing':       { src: originalSfx('07'), channel: 'sfx' },
    'sfx.hit_flesh':   { src: originalSfx('07'), channel: 'sfx' },
    'sfx.hit_metal':   { src: originalSfx('03'), channel: 'sfx' },
    'sfx.crit':        { src: originalSfx('15'), channel: 'sfx' },
    'sfx.miss':        { src: originalSfx('10'), channel: 'sfx' },
    'sfx.heal':        { src: originalSfx('24'), channel: 'sfx' },
    'sfx.levelup':     { src: originalSfx('21'), channel: 'sfx' },
    'sfx.loot_pickup': { src: originalSfx('01'), channel: 'sfx' },
    'sfx.coin':        { src: originalSfx('01'), channel: 'sfx' },
    'sfx.equip':       { src: '/assets/sounds/sfx/equip.wav', channel: 'sfx' },
    'sfx.unequip':     { src: '/assets/sounds/sfx/unequip.wav', channel: 'sfx' },
    'sfx.deploy':      { src: '/assets/sounds/sfx/deploy.wav', channel: 'sfx' },

    // Original magic / state effects inferred from gameres_unpacked/set/MagicPtn.atr
    'sfx.magic.fire':        { src: originalSfx('00'), channel: 'sfx' },
    'sfx.magic.ice':         { src: originalSfx('02'), channel: 'sfx' },
    'sfx.magic.ice_burst':   { src: originalSfx('03'), channel: 'sfx' },
    'sfx.magic.thunder':     { src: originalSfx('05'), channel: 'sfx' },
    'sfx.magic.wind_cutter': { src: originalSfx('06'), channel: 'sfx' },
    'sfx.magic.slash':       { src: originalSfx('07'), channel: 'sfx' },
    'sfx.magic.tornado':     { src: originalSfx('08'), channel: 'sfx' },
    'sfx.magic.quake':       { src: originalSfx('09'), channel: 'sfx' },
    'sfx.magic.drain':       { src: originalSfx('12'), channel: 'sfx' },
    'sfx.magic.atomic_wave': { src: originalSfx('15'), channel: 'sfx' },
    'sfx.magic.status':      { src: originalSfx('17'), channel: 'sfx' },
    'sfx.magic.mute':        { src: originalSfx('18'), channel: 'sfx' },
    'sfx.magic.resist':      { src: originalSfx('19'), channel: 'sfx' },
    'sfx.magic.protection':  { src: originalSfx('20'), channel: 'sfx' },
    'sfx.magic.buff':        { src: originalSfx('21'), channel: 'sfx' },
    'sfx.magic.quick_poison': { src: originalSfx('22'), channel: 'sfx' },
    'sfx.magic.heal':        { src: originalSfx('24'), channel: 'sfx' },

    // Low-confidence originals not referenced by MagicPtn.atr, kept as semantic aliases.
    'sfx.event.reward': { src: originalSfx('01'), channel: 'sfx' },
    'sfx.event.device': { src: originalSfx('04'), channel: 'sfx' },
    'sfx.event.tick':   { src: originalSfx('10'), channel: 'sfx' },

    // Raw numbered aliases for tools/tests and future remapping.
    'sfx.original.00': { src: originalSfx('00'), channel: 'sfx' },
    'sfx.original.01': { src: originalSfx('01'), channel: 'sfx' },
    'sfx.original.02': { src: originalSfx('02'), channel: 'sfx' },
    'sfx.original.03': { src: originalSfx('03'), channel: 'sfx' },
    'sfx.original.04': { src: originalSfx('04'), channel: 'sfx' },
    'sfx.original.05': { src: originalSfx('05'), channel: 'sfx' },
    'sfx.original.06': { src: originalSfx('06'), channel: 'sfx' },
    'sfx.original.07': { src: originalSfx('07'), channel: 'sfx' },
    'sfx.original.08': { src: originalSfx('08'), channel: 'sfx' },
    'sfx.original.09': { src: originalSfx('09'), channel: 'sfx' },
    'sfx.original.10': { src: originalSfx('10'), channel: 'sfx' },
    'sfx.original.12': { src: originalSfx('12'), channel: 'sfx' },
    'sfx.original.15': { src: originalSfx('15'), channel: 'sfx' },
    'sfx.original.17': { src: originalSfx('17'), channel: 'sfx' },
    'sfx.original.18': { src: originalSfx('18'), channel: 'sfx' },
    'sfx.original.19': { src: originalSfx('19'), channel: 'sfx' },
    'sfx.original.20': { src: originalSfx('20'), channel: 'sfx' },
    'sfx.original.21': { src: originalSfx('21'), channel: 'sfx' },
    'sfx.original.22': { src: originalSfx('22'), channel: 'sfx' },
    'sfx.original.24': { src: originalSfx('24'), channel: 'sfx' },

    // World
    'sfx.footstep_grass': { src: '/assets/sounds/community/step-grass-1.wav', channel: 'sfx' },
    'sfx.footstep_grass_2': { src: '/assets/sounds/community/step-grass-2.wav', channel: 'sfx' },
    'sfx.footstep_grass_3': { src: '/assets/sounds/community/step-grass-3.wav', channel: 'sfx' },
    'sfx.footstep_stone': { src: '/assets/sounds/community/step-concrete-1.wav', channel: 'sfx' },
    'sfx.footstep_stone_2': { src: '/assets/sounds/community/step-concrete-2.wav', channel: 'sfx' },
    'sfx.footstep_stone_3': { src: '/assets/sounds/community/step-concrete-3.wav', channel: 'sfx' },
    'sfx.footstep_snow': { src: '/assets/sounds/community/step-snow-1.wav', channel: 'sfx' },
    'sfx.footstep_snow_2': { src: '/assets/sounds/community/step-snow-2.wav', channel: 'sfx' },
    'sfx.footstep_snow_3': { src: '/assets/sounds/community/step-snow-3.wav', channel: 'sfx' },
    'sfx.footstep_water': { src: '/assets/sounds/world/footstep_water.ogg', channel: 'sfx' },
    'sfx.repair': { src: '/assets/sounds/community/repair.wav', channel: 'sfx' },
    'sfx.unsocket': { src: '/assets/sounds/community/unsocket.wav', channel: 'sfx' },
    'sfx.book_open': { src: '/assets/sounds/community/book-open.wav', channel: 'sfx' },
    'sfx.book_close': { src: '/assets/sounds/community/book-close.wav', channel: 'sfx' },
    'sfx.complete': { src: '/assets/sounds/community/complete.wav', channel: 'sfx' },
    'sfx.defeat': { src: '/assets/sounds/community/defeat.wav', channel: 'sfx' },
    'sfx.door':           { src: originalSfx('04'), channel: 'sfx' },
    'sfx.extract_start':  { src: originalSfx('09'), channel: 'sfx' },
    'sfx.extract_done':   { src: originalSfx('01'), channel: 'sfx' },

    // Music
    'bgm.town.village': { src: '/assets/sounds/community/village.ogg', channel: 'bgm' },
    'bgm.town.port': { src: '/assets/sounds/community/port.ogg', channel: 'bgm' },
    'bgm.town.market': { src: '/assets/sounds/community/desert.ogg', channel: 'bgm' },
    'bgm.desert': { src: '/assets/sounds/community/desert.ogg', channel: 'bgm' },
    'bgm.mines': { src: '/assets/sounds/community/mines.ogg', channel: 'bgm' },
    'bgm.title':   { src: '/assets/sounds/bgm/story/01.mid',   channel: 'bgm' },
    'bgm.world':   { src: '/assets/sounds/bgm/story/04.mid',   channel: 'bgm' },
    'bgm.town':    { src: '/assets/sounds/bgm/tutorial/Sh-Fil2.mid',    channel: 'bgm' },
    'bgm.raid':    { src: '/assets/sounds/bgm/story/02.mid',    channel: 'bgm' },
    'bgm.boss':    { src: '/assets/sounds/bgm/story/09.mid',    channel: 'bgm' },
    'bgm.victory': { src: '/assets/sounds/bgm/story/05.mid', channel: 'bgm' },
    'bgm.gameover':{ src: '/assets/sounds/bgm/story/03.mid',channel: 'bgm' },
    'bgm.forest': { src: '/assets/sounds/bgm/story/05.mid', channel: 'bgm' },
    'bgm.cave': { src: '/assets/sounds/bgm/story/03.mid', channel: 'bgm' },
    'bgm.tutorial.training': { src: '/assets/sounds/bgm/tutorial/Sh-Fil2.mid', channel: 'bgm' },
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
    // Late story episodes do not have separate recovered MIDI assets yet; keep their quest BGM keys playable.
    'bgm.story.episode21': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode22': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode23': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode24': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode25': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode26': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode27': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode28': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode29': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode30': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
    'bgm.story.episode31': { src: '/assets/sounds/bgm/story/20.mid', channel: 'bgm' },
};

export class AudioManagerClass {
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
    private requestedBgmKey: string | null = null;
    private bgmRequest = 0;
    private unlockListening = false;
    private lastOneShot = new Map<string, number>();
    private activeOneShots = 0;
    private footstepIndex = 0;
    private unlock = (): void => {
        if (this.ensureContext() && this.ctx?.state === 'suspended') {
            void this.ctx.resume().catch(() => undefined);
        }
    };

    /**
     * Playback requests create the context lazily. Browsers may leave it
     * suspended until a real pointer or keyboard gesture resumes it.
     */
    public init(): void {
        if (!this.unlockListening && typeof document !== 'undefined') {
            document.addEventListener('pointerdown', this.unlock, true);
            document.addEventListener('keydown', this.unlock, true);
            this.unlockListening = true;
        }
        // Subscribe so volume changes propagate immediately, even before the
        // AudioContext is created.
        if (!this.settingsUnsub) {
            this.settingsUnsub = SettingsManager.onChange(() => this.applySettings());
        }
    }

    public dispose(): void {
        if (this.unlockListening) {
            document.removeEventListener('pointerdown', this.unlock, true);
            document.removeEventListener('keydown', this.unlock, true);
            this.unlockListening = false;
        }
        if (this.settingsUnsub) {
            this.settingsUnsub();
            this.settingsUnsub = null;
        }
        this.stopBgm(0);
        this.buffers.clear();
        this.lastOneShot.clear();
        this.activeOneShots = 0;
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
     * Alternate quiet recorded steps; wet ground retains its procedural splash.
     */
    public playFootstep(surface: FieldFootstepSurface): void {
        if (!this.ensureContext() || SettingsManager.getMuteSFX()) return;
        const ctx = this.ctx!;
        if (ctx.state !== 'running') return;
        const key = getRecordedFootstepKey(surface, this.footstepIndex++);
        if (key) {
            this.playSfx(key, { volume: 0.22, rate: 0.06 });
            return;
        }
        const profile = { duration: 0.075, frequency: 720, gain: 0.065 };
        const frameCount = Math.max(1, Math.floor(ctx.sampleRate * profile.duration));
        const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
        const samples = buffer.getChannelData(0);

        for (let i = 0; i < frameCount; i++) {
            const progress = i / frameCount;
            const envelope = Math.pow(1 - progress, 1.5);
            samples[i] = (Math.random() * 2 - 1) * envelope;
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        source.buffer = buffer;
        source.playbackRate.value = 0.94 + Math.random() * 0.12;
        filter.type = 'lowpass';
        filter.frequency.value = profile.frequency * (0.9 + Math.random() * 0.2);
        filter.Q.value = 0.5;
        gain.gain.value = profile.gain;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
        source.start();
    }

    /**
     * Switch BGM with a cross-fade. Calling with the same key as the current
     * track is a no-op.
     */
    public playBgm(key: string, options: CrossfadeOptions = {}): void {
        if (AUDIO_CATALOG[key]?.channel !== 'bgm' || !this.ensureContext()) return;
        if (this.requestedBgmKey === key) return;
        this.requestedBgmKey = key;
        const request = ++this.bgmRequest;
        const src = this.bufferKey(key);
        // Aliases of the same recovered track should keep playing seamlessly.
        if (this.currentBgmKey && this.bufferKey(this.currentBgmKey) === src) {
            this.currentBgmKey = key;
            return;
        }
        void this.loadBuffer(key).then(() => {
            if (request !== this.bgmRequest || !this.ctx) return;
            const entry = this.buffers.get(src);
            if (!entry?.buffer) return;
            const ctx = this.ctx;
            const fadeMs = Math.max(0, options.fadeMs ?? 600);
            this.fadeOutBgm(fadeMs);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, ctx.currentTime);
            // Muting belongs to the channel gain so unmuting restores playback.
            gain.gain.linearRampToValueAtTime(options.volume ?? 1, ctx.currentTime + fadeMs / 1000);
            gain.connect(this.bgmGain!);
            const source = ctx.createBufferSource();
            source.buffer = entry.buffer;
            source.loop = true;
            source.connect(gain);
            source.onended = () => { source.disconnect(); gain.disconnect(); };
            source.start();
            this.currentBgmKey = key;
            this.currentBgmSource = source;
            this.currentBgmGain = gain;
        });
    }

    public stopBgm(fadeMs: number = 300): void {
        ++this.bgmRequest; // Also invalidate music that is still decoding.
        this.requestedBgmKey = null;
        this.fadeOutBgm(Math.max(0, fadeMs));
    }

    private fadeOutBgm(fadeMs: number): void {
        if (this.ctx && this.currentBgmSource && this.currentBgmGain) {
            const now = this.ctx.currentTime;
            const gain = this.currentBgmGain;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
            try { this.currentBgmSource.stop(now + fadeMs / 1000 + 0.02); } catch { /* already stopped */ }
        }
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
        const context = this.ctx;

        const src = this.bufferKey(key);
        const requestedAt = Date.now();
        const lastPlayed = this.lastOneShot.get(src);
        if (lastPlayed !== undefined && requestedAt - lastPlayed < (channel === 'ui' ? 70 : 90)) return;
        this.lastOneShot.set(src, requestedAt);
        void this.loadBuffer(key).then(() => {
            if (!this.ctx || this.ctx !== context || this.ctx.state !== 'running'
                || SettingsManager.getMuteSFX() || Date.now() - requestedAt > 750 || this.activeOneShots >= 12) return;
            const entry = this.buffers.get(src);
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

            let voiceGain: GainNode | null = null;
            if ((options.volume ?? 1) !== 1) {
                const g = ctx.createGain();
                voiceGain = g;
                g.gain.value = options.volume ?? 1;
                node.connect(g);
                g.connect(dest);
            } else {
                node.connect(dest);
            }
            this.activeOneShots++;
            node.onended = () => {
                if (this.ctx === ctx) this.activeOneShots = Math.max(0, this.activeOneShots - 1);
                node.disconnect();
                voiceGain?.disconnect();
            };
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
        const sfx = SettingsManager.getMuteSFX() ? 0 : SettingsManager.getSfxVolume() * SFX_OUTPUT_TRIM;
        const ui  = SettingsManager.getMuteSFX() ? 0 : SettingsManager.getUiVolume() * UI_OUTPUT_TRIM;
        this.bgmGain.gain.setValueAtTime(bgm, t);
        this.sfxGain.gain.setValueAtTime(sfx, t);
        this.uiGain.gain.setValueAtTime(ui, t);
    }

    private bufferKey(key: string): string {
        const src = AUDIO_CATALOG[key]?.src ?? key;
        // These groups are byte-identical SHA-256 matches in the recovered files.
        const match = src.match(/\/story\/(\d+)\.mid$/);
        if (!match) return src;
        const canonical: Record<number, string> = {
            11: '01', 7: '02', 12: '02', 17: '02', 18: '02',
            8: '03', 13: '03', 6: '04', 14: '04', 16: '04',
            10: '05', 15: '05', 20: '05', 19: '09',
        };
        return canonical[Number(match[1])]
            ? src.replace(/\d+\.mid$/, canonical[Number(match[1])] + '.mid')
            : src;
    }

    private async loadBuffer(key: string): Promise<void> {
        const cat = AUDIO_CATALOG[key];
        if (!cat || !this.ensureContext()) return;
        const src = this.bufferKey(key);
        const existing = this.buffers.get(src);
        if (existing) return existing.loading;
        const context = this.ctx!;
        const entry: BufferEntry = { buffer: null, settled: false, missing: false };
        this.buffers.set(src, entry);
        entry.loading = (async () => {
            try {
                const response = await fetch(src);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const arr = await response.arrayBuffer();
                entry.buffer = this.isMidiSource(src)
                    ? await renderMidiToAudioBuffer(context, arr)
                    : await context.decodeAudioData(arr);
            } catch {
                entry.missing = true;
                if (!this.warnedMissing.has(src)) {
                    this.warnedMissing.add(src);
                    console.warn('[AudioManager] Unable to load ' + src);
                }
            } finally {
                entry.settled = true;
            }
        })();
        return entry.loading;
    }

    private isMidiSource(src: string): boolean {
        const lower = src.toLowerCase();
        return lower.endsWith('.mid') || lower.endsWith('.midi');
    }
}

export const AudioManager = new AudioManagerClass();
