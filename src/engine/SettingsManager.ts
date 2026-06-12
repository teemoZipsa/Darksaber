/**
 * Global settings manager for user preferences.
 * Saves and loads from localStorage to persist user choices across reloads.
 */
export type KeybindingId =
    | 'action.move'
    | 'action.tool'
    | 'action.attack'
    | 'action.magic'
    | 'action.defend'
    | 'action.rest'
    | 'action.fanfare'
    | 'action.open'
    | 'world.inventory'
    | 'world.party'
    | 'world.character'
    | 'world.magicLoadout'
    | 'world.questJournal'
    | 'world.minimap'
    | 'world.nextActor';

export interface KeybindingDefinition {
    id: KeybindingId;
    labelKey: string;
    defaultCode: string;
    group: 'action' | 'world';
}

export const KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
    { id: 'action.move', labelKey: 'action.label.move', defaultCode: 'KeyQ', group: 'action' },
    { id: 'action.tool', labelKey: 'action.label.tool', defaultCode: 'KeyW', group: 'action' },
    { id: 'action.attack', labelKey: 'action.label.attack', defaultCode: 'KeyE', group: 'action' },
    { id: 'action.magic', labelKey: 'action.label.magic', defaultCode: 'KeyR', group: 'action' },
    { id: 'action.defend', labelKey: 'action.label.defend', defaultCode: 'KeyA', group: 'action' },
    { id: 'action.rest', labelKey: 'action.label.rest', defaultCode: 'KeyS', group: 'action' },
    { id: 'action.fanfare', labelKey: 'action.label.fanfare', defaultCode: 'KeyD', group: 'action' },
    { id: 'action.open', labelKey: 'action.label.open', defaultCode: 'KeyF', group: 'action' },
    { id: 'world.inventory', labelKey: 'settings.key.inventory', defaultCode: 'KeyI', group: 'world' },
    { id: 'world.party', labelKey: 'settings.key.party', defaultCode: 'KeyP', group: 'world' },
    { id: 'world.character', labelKey: 'settings.key.character', defaultCode: 'KeyC', group: 'world' },
    { id: 'world.magicLoadout', labelKey: 'settings.key.magicLoadout', defaultCode: 'KeyK', group: 'world' },
    { id: 'world.questJournal', labelKey: 'settings.key.questJournal', defaultCode: 'KeyJ', group: 'world' },
    { id: 'world.minimap', labelKey: 'settings.key.minimap', defaultCode: 'KeyM', group: 'world' },
    { id: 'world.nextActor', labelKey: 'settings.key.nextActor', defaultCode: 'Tab', group: 'world' },
] as const;

const KEYBINDING_STORAGE_KEY = 'setting_keybindings';
const KEYBINDING_IDS = new Set<KeybindingId>(KEYBINDING_DEFINITIONS.map((definition) => definition.id));
const RESERVED_KEY_CODES = new Set(['Escape', 'Enter', 'Space']);

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
    private static keybindings: Record<KeybindingId, string> = createDefaultKeybindings();

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
        this.keybindings = normalizeSavedKeybindings(localStorage.getItem(KEYBINDING_STORAGE_KEY));
        this.persistKeybindings();
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
        return this.fpsLimit === 0 ? '무제한' : `${this.fpsLimit}`;
    }

    /** Minimum frame interval in ms (0 = no limit) */
    public static getFrameInterval(): number {
        return this.fpsLimit > 0 ? 1000 / this.fpsLimit : 0;
    }

    // ─── VSYNC ─────────────────────
    public static getVSync(): boolean { return this.vsync; }
    public static setVSync(v: boolean) { this.vsync = v; localStorage.setItem('setting_vsync', v.toString()); this.notifyChange(); }

    // ─── KEYBINDINGS ────────────────
    public static getKeybindingDefinitions(group?: KeybindingDefinition['group']): readonly KeybindingDefinition[] {
        return group ? KEYBINDING_DEFINITIONS.filter((definition) => definition.group === group) : KEYBINDING_DEFINITIONS;
    }

    public static getKeybinding(id: KeybindingId): string {
        return this.keybindings[id] ?? getDefaultKeybinding(id);
    }

    public static setKeybinding(id: KeybindingId, code: string): void {
        if (!isValidKeybindingId(id) || !isAllowedKeyCode(code)) return;
        const previous = this.getKeybinding(id);
        for (const definition of KEYBINDING_DEFINITIONS) {
            if (definition.id !== id && this.keybindings[definition.id] === code) {
                this.keybindings[definition.id] = previous;
            }
        }
        this.keybindings[id] = code;
        this.persistKeybindings();
        this.notifyChange();
    }

    public static resetKeybinding(id: KeybindingId): void {
        this.keybindings[id] = getDefaultKeybinding(id);
        this.persistKeybindings();
        this.notifyChange();
    }

    public static resetKeybindings(): void {
        this.keybindings = createDefaultKeybindings();
        this.persistKeybindings();
        this.notifyChange();
    }

    public static isKeybindingJustPressed(id: KeybindingId, input: { justPressed(code: string): boolean }): boolean {
        const code = this.getKeybinding(id);
        return input.justPressed(code);
    }

    public static getPreventDefaultKeyCodes(): string[] {
        return [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            ...Object.values(this.keybindings),
        ];
    }

    public static getKeyLabel(code: string): string {
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code === 'Tab') return 'Tab';
        if (code === 'Escape') return 'Esc';
        if (code === 'Space') return 'Space';
        if (code.startsWith('Arrow')) return code.slice(5);
        return code;
    }

    public static isAllowedKeybindingCode(code: string): boolean {
        return isAllowedKeyCode(code);
    }

    private static persistKeybindings(): void {
        localStorage.setItem(KEYBINDING_STORAGE_KEY, JSON.stringify(this.keybindings));
    }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function createDefaultKeybindings(): Record<KeybindingId, string> {
    return KEYBINDING_DEFINITIONS.reduce((acc, definition) => {
        acc[definition.id] = definition.defaultCode;
        return acc;
    }, {} as Record<KeybindingId, string>);
}

function getDefaultKeybinding(id: KeybindingId): string {
    return KEYBINDING_DEFINITIONS.find((definition) => definition.id === id)?.defaultCode ?? '';
}

function normalizeSavedKeybindings(raw: string | null): Record<KeybindingId, string> {
    const bindings = createDefaultKeybindings();
    if (!raw) return bindings;
    try {
        const parsed = JSON.parse(raw) as Partial<Record<KeybindingId, unknown>>;
        const used = new Set<string>();
        for (const definition of KEYBINDING_DEFINITIONS) {
            const saved = parsed[definition.id];
            const code = typeof saved === 'string' && isAllowedKeyCode(saved) ? saved : definition.defaultCode;
            bindings[definition.id] = used.has(code) ? definition.defaultCode : code;
            used.add(bindings[definition.id]);
        }
    } catch {
        return bindings;
    }
    return bindings;
}

function isValidKeybindingId(id: string): id is KeybindingId {
    return KEYBINDING_IDS.has(id as KeybindingId);
}

function isAllowedKeyCode(code: string): boolean {
    if (RESERVED_KEY_CODES.has(code)) return false;
    return /^(Key[A-Z]|Digit[1-9]|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(code);
}
