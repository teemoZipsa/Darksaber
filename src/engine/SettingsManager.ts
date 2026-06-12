/**
 * Global settings manager for user preferences.
 * Saves and loads from localStorage to persist user choices across reloads.
 */
import { t } from '../i18n/LanguageManager';

export class SettingsManager {
    private static showGrid: boolean = false;
    private static showFPS: boolean = false;
    private static showHelp: boolean = true;
    private static muteBGM: boolean = false;
    private static muteSFX: boolean = false;
    private static bgmVolume: number = 0.7;   // 0..1
    private static sfxVolume: number = 0.85;  // 0..1
    private static uiVolume: number = 0.85;   // 0..1
    private static motionReduce: boolean = false;
    private static uiScale: number = 1.0;
    private static fpsLimit: number = 0; // 0 = unlimited
    private static vsync: boolean = true;

    private static readonly SCALE_PRESETS = [0.8, 0.9, 1.0, 1.1, 1.2];
    private static readonly FPS_PRESETS = [30, 60, 120, 0]; // 0 = unlimited

    public static lastUpdated: number = Date.now();
    /** Subscribers fire whenever any setting changes (used by AudioManager etc.). */
    private static changeListeners: Array<() => void> = [];

    public static init(): void {
        this.showGrid = localStorage.getItem('setting_grid') === 'true';
        this.showFPS = localStorage.getItem('setting_fps') === 'true';
        this.showHelp = localStorage.getItem('setting_help') !== 'false';
        this.muteBGM = localStorage.getItem('setting_muteBgm') === 'true';
        this.muteSFX = localStorage.getItem('setting_muteSfx') === 'true';
        const savedBgm = localStorage.getItem('setting_bgmVolume');
        if (savedBgm) this.bgmVolume = clamp01(Number.parseFloat(savedBgm));
        const savedSfx = localStorage.getItem('setting_sfxVolume');
        if (savedSfx) this.sfxVolume = clamp01(Number.parseFloat(savedSfx));
        const savedUi = localStorage.getItem('setting_uiVolume');
        if (savedUi) this.uiVolume = clamp01(Number.parseFloat(savedUi));
        this.motionReduce = localStorage.getItem('setting_motionReduce') === 'true';
        const savedScale = localStorage.getItem('setting_uiScale');
        if (savedScale) this.uiScale = Number.parseFloat(savedScale) || 1.0;
        const savedFps = localStorage.getItem('setting_fpsLimit');
        if (savedFps) this.fpsLimit = Number.parseInt(savedFps, 10) || 0;
        this.vsync = localStorage.getItem('setting_vsync') !== 'false';
    }

    /** Subscribe to setting changes. Returns an unsubscribe function. */
    public static onChange(cb: () => void): () => void {
        this.changeListeners.push(cb);
        return () => {
            this.changeListeners = this.changeListeners.filter((listener) => listener !== cb);
        };
    }

    private static notifyChange(): void {
        this.lastUpdated = Date.now();
        for (const cb of this.changeListeners) cb();
    }

    public static getGrid(): boolean { return this.showGrid; }
    public static setGrid(v: boolean) { this.showGrid = v; localStorage.setItem('setting_grid', v.toString()); this.notifyChange(); }

    public static getFPS(): boolean { return this.showFPS; }
    public static setFPS(v: boolean) { this.showFPS = v; localStorage.setItem('setting_fps', v.toString()); this.notifyChange(); }

    public static getHelp(): boolean { return this.showHelp; }
    public static setHelp(v: boolean) { this.showHelp = v; localStorage.setItem('setting_help', v.toString()); this.notifyChange(); }

    public static getMuteBGM(): boolean { return this.muteBGM; }
    public static setMuteBGM(v: boolean) { this.muteBGM = v; localStorage.setItem('setting_muteBgm', v.toString()); this.notifyChange(); }

    public static getMuteSFX(): boolean { return this.muteSFX; }
    public static setMuteSFX(v: boolean) { this.muteSFX = v; localStorage.setItem('setting_muteSfx', v.toString()); this.notifyChange(); }

    public static getBgmVolume(): number { return this.bgmVolume; }
    public static setBgmVolume(v: number) { this.bgmVolume = clamp01(v); localStorage.setItem('setting_bgmVolume', this.bgmVolume.toString()); this.notifyChange(); }

    public static getSfxVolume(): number { return this.sfxVolume; }
    public static setSfxVolume(v: number) { this.sfxVolume = clamp01(v); localStorage.setItem('setting_sfxVolume', this.sfxVolume.toString()); this.notifyChange(); }

    public static getUiVolume(): number { return this.uiVolume; }
    public static setUiVolume(v: number) { this.uiVolume = clamp01(v); localStorage.setItem('setting_uiVolume', this.uiVolume.toString()); this.notifyChange(); }

    public static getMotionReduce(): boolean { return this.motionReduce; }
    public static setMotionReduce(v: boolean) { this.motionReduce = v; localStorage.setItem('setting_motionReduce', v.toString()); this.notifyChange(); }

    public static getUIScale(): number { return this.uiScale; }
    public static setUIScale(v: number) { this.uiScale = v; localStorage.setItem('setting_uiScale', v.toString()); this.notifyChange(); }

    /** Cycle through scale presets */
    public static cycleUIScale(): void {
        let idx = this.SCALE_PRESETS.findIndex((preset) => Math.abs(preset - this.uiScale) < 0.001);
        if (idx < 0) {
            idx = this.SCALE_PRESETS.reduce((bestIndex, preset, index) => (
                Math.abs(preset - this.uiScale) < Math.abs(this.SCALE_PRESETS[bestIndex] - this.uiScale) ? index : bestIndex
            ), 0);
        }
        const next = (idx + 1) % this.SCALE_PRESETS.length;
        this.setUIScale(this.SCALE_PRESETS[next]);
    }

    public static getScaleLabel(): string {
        return `${Math.round(this.uiScale * 100)}%`;
    }

    // ─── FPS LIMIT ─────────────────
    public static getFPSLimit(): number { return this.fpsLimit; }
    public static setFPSLimit(v: number) { this.fpsLimit = v; localStorage.setItem('setting_fpsLimit', v.toString()); this.notifyChange(); }

    public static cycleFPSLimit(): void {
        const idx = this.FPS_PRESETS.indexOf(this.fpsLimit);
        const next = (idx + 1) % this.FPS_PRESETS.length;
        this.setFPSLimit(this.FPS_PRESETS[next]);
    }

    public static getFPSLimitLabel(): string {
        return this.fpsLimit === 0 ? t('settings.fpsUnlimited') : `${this.fpsLimit}`;
    }

    /** Minimum frame interval in ms (0 = no limit) */
    public static getFrameInterval(): number {
        return this.fpsLimit > 0 ? 1000 / this.fpsLimit : 0;
    }

    // ─── VSYNC ─────────────────────
    public static getVSync(): boolean { return this.vsync; }
    public static setVSync(v: boolean) { this.vsync = v; localStorage.setItem('setting_vsync', v.toString()); this.notifyChange(); }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}
