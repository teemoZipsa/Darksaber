/**
 * Global settings manager for user preferences.
 * Saves and loads from localStorage to persist user choices across reloads.
 */
export class SettingsManager {
    private static showGrid: boolean = true;
    private static showFPS: boolean = false;
    private static showHelp: boolean = true;
    private static muteBGM: boolean = false;
    private static muteSFX: boolean = false;
    private static uiScale: number = 1.0;
    private static fpsLimit: number = 0; // 0 = unlimited
    private static vsync: boolean = true;

    private static readonly SCALE_PRESETS = [0.8, 0.9, 1.0, 1.1, 1.2];
    private static readonly FPS_PRESETS = [30, 60, 120, 0]; // 0 = unlimited

    public static lastUpdated: number = Date.now();

    public static init(): void {
        this.showGrid = localStorage.getItem('setting_grid') !== 'false';
        this.showFPS = localStorage.getItem('setting_fps') === 'true';
        this.showHelp = localStorage.getItem('setting_help') !== 'false';
        this.muteBGM = localStorage.getItem('setting_muteBgm') === 'true';
        this.muteSFX = localStorage.getItem('setting_muteSfx') === 'true';
        const savedScale = localStorage.getItem('setting_uiScale');
        if (savedScale) this.uiScale = parseFloat(savedScale) || 1.0;
        const savedFps = localStorage.getItem('setting_fpsLimit');
        if (savedFps) this.fpsLimit = parseInt(savedFps) || 0;
        this.vsync = localStorage.getItem('setting_vsync') !== 'false';
    }

    public static getGrid(): boolean { return this.showGrid; }
    public static setGrid(v: boolean) { this.showGrid = v; localStorage.setItem('setting_grid', v.toString()); this.lastUpdated = Date.now(); }

    public static getFPS(): boolean { return this.showFPS; }
    public static setFPS(v: boolean) { this.showFPS = v; localStorage.setItem('setting_fps', v.toString()); this.lastUpdated = Date.now(); }

    public static getHelp(): boolean { return this.showHelp; }
    public static setHelp(v: boolean) { this.showHelp = v; localStorage.setItem('setting_help', v.toString()); this.lastUpdated = Date.now(); }

    public static getMuteBGM(): boolean { return this.muteBGM; }
    public static setMuteBGM(v: boolean) { this.muteBGM = v; localStorage.setItem('setting_muteBgm', v.toString()); this.lastUpdated = Date.now(); }

    public static getMuteSFX(): boolean { return this.muteSFX; }
    public static setMuteSFX(v: boolean) { this.muteSFX = v; localStorage.setItem('setting_muteSfx', v.toString()); this.lastUpdated = Date.now(); }

    public static getUIScale(): number { return this.uiScale; }
    public static setUIScale(v: number) { this.uiScale = v; localStorage.setItem('setting_uiScale', v.toString()); this.lastUpdated = Date.now(); }

    /** Cycle through scale presets */
    public static cycleUIScale(): void {
        const idx = this.SCALE_PRESETS.indexOf(this.uiScale);
        const next = (idx + 1) % this.SCALE_PRESETS.length;
        this.setUIScale(this.SCALE_PRESETS[next]);
    }

    public static getScaleLabel(): string {
        return `${Math.round(this.uiScale * 100)}%`;
    }

    // ─── FPS LIMIT ─────────────────
    public static getFPSLimit(): number { return this.fpsLimit; }
    public static setFPSLimit(v: number) { this.fpsLimit = v; localStorage.setItem('setting_fpsLimit', v.toString()); this.lastUpdated = Date.now(); }

    public static cycleFPSLimit(): void {
        const idx = this.FPS_PRESETS.indexOf(this.fpsLimit);
        const next = (idx + 1) % this.FPS_PRESETS.length;
        this.setFPSLimit(this.FPS_PRESETS[next]);
    }

    public static getFPSLimitLabel(): string {
        return this.fpsLimit === 0 ? '무제한' : `${this.fpsLimit}`;
    }

    /** Minimum frame interval in ms (0 = no limit) */
    public static getFrameInterval(): number {
        return this.fpsLimit > 0 ? 1000 / this.fpsLimit : 0;
    }

    // ─── VSYNC ─────────────────────
    public static getVSync(): boolean { return this.vsync; }
    public static setVSync(v: boolean) { this.vsync = v; localStorage.setItem('setting_vsync', v.toString()); this.lastUpdated = Date.now(); }
}
