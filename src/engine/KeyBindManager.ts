/**
 * KeyBindManager — Manages customizable key bindings.
 * Stores bindings in localStorage. Game code checks actions via getKey().
 */

export type KeyAction =
    | 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
    | 'inventory' | 'shop' | 'party' | 'minimap'
    | 'skipTurn' | 'cancel' | 'confirm';

interface KeyBind {
    action: KeyAction;
    label: string;
    labelKo: string;
    defaultCode: string;
    code: string;
}

const STORAGE_KEY = 'darksaber_keybinds';

const DEFAULT_BINDS: Omit<KeyBind, 'code'>[] = [
    { action: 'moveUp',    label: 'Move Up',       labelKo: '위로 이동',    defaultCode: 'KeyW' },
    { action: 'moveDown',  label: 'Move Down',     labelKo: '아래로 이동',  defaultCode: 'KeyS' },
    { action: 'moveLeft',  label: 'Move Left',     labelKo: '왼쪽 이동',   defaultCode: 'KeyA' },
    { action: 'moveRight', label: 'Move Right',    labelKo: '오른쪽 이동',  defaultCode: 'KeyD' },
    { action: 'inventory', label: 'Inventory',     labelKo: '인벤토리',    defaultCode: 'KeyI' },
    { action: 'shop',      label: 'Shop',          labelKo: '상점',       defaultCode: 'KeyS' },
    { action: 'party',     label: 'Party',         labelKo: '파티 편성',   defaultCode: 'KeyP' },
    { action: 'minimap',   label: 'Minimap',       labelKo: '미니맵',     defaultCode: 'KeyM' },
    { action: 'skipTurn',  label: 'Skip Turn',     labelKo: '턴 넘기기',   defaultCode: 'Space' },
    { action: 'cancel',    label: 'Cancel / Close', labelKo: '취소 / 닫기', defaultCode: 'Escape' },
    { action: 'confirm',   label: 'Confirm',       labelKo: '확인',       defaultCode: 'Enter' },
];

class _KeyBindManager {
    private binds: KeyBind[] = [];
    private _waitingForKey: KeyAction | null = null;
    private _onKeyBound: (() => void) | null = null;

    constructor() {
        this.load();
        // Listen for key rebinding
        window.addEventListener('keydown', (e) => {
            if (this._waitingForKey) {
                e.preventDefault();
                e.stopPropagation();
                this.setBind(this._waitingForKey, e.code);
                this._waitingForKey = null;
                if (this._onKeyBound) this._onKeyBound();
            }
        }, true); // capture phase to intercept before game
    }

    private load(): void {
        this.binds = DEFAULT_BINDS.map(b => ({ ...b, code: b.defaultCode }));
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as Record<string, string>;
                for (const bind of this.binds) {
                    if (parsed[bind.action]) {
                        bind.code = parsed[bind.action];
                    }
                }
            }
        } catch { /* ignore */ }
    }

    private save(): void {
        const data: Record<string, string> = {};
        for (const bind of this.binds) {
            data[bind.action] = bind.code;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    /** Get the current key code for an action */
    public getKey(action: KeyAction): string {
        const bind = this.binds.find(b => b.action === action);
        return bind ? bind.code : '';
    }

    /** Get all bindings */
    public getAll(): readonly KeyBind[] {
        return this.binds;
    }

    /** Set a binding */
    public setBind(action: KeyAction, code: string): void {
        const bind = this.binds.find(b => b.action === action);
        if (bind) {
            bind.code = code;
            this.save();
        }
    }

    /** Reset all to defaults */
    public resetAll(): void {
        for (const bind of this.binds) {
            const def = DEFAULT_BINDS.find(d => d.action === bind.action);
            if (def) bind.code = def.defaultCode;
        }
        this.save();
    }

    /** Start waiting for a key press to rebind an action */
    public startRebind(action: KeyAction, onDone?: () => void): void {
        this._waitingForKey = action;
        this._onKeyBound = onDone || null;
    }

    /** Whether we're currently waiting for key input */
    public isWaitingForKey(): boolean {
        return this._waitingForKey !== null;
    }

    /** Which action we're rebinding */
    public getWaitingAction(): KeyAction | null {
        return this._waitingForKey;
    }

    /** Cancel rebinding */
    public cancelRebind(): void {
        this._waitingForKey = null;
        this._onKeyBound = null;
    }

    /** Readable key name for display */
    public keyDisplayName(code: string): string {
        const map: Record<string, string> = {
            'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D',
            'KeyE': 'E', 'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H',
            'KeyI': 'I', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
            'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O', 'KeyP': 'P',
            'KeyQ': 'Q', 'KeyR': 'R', 'KeyS': 'S', 'KeyT': 'T',
            'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X',
            'KeyY': 'Y', 'KeyZ': 'Z',
            'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
            'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8',
            'Digit9': '9', 'Digit0': '0',
            'Space': 'Space', 'Enter': 'Enter', 'Escape': 'Esc',
            'Tab': 'Tab', 'ShiftLeft': 'L-Shift', 'ShiftRight': 'R-Shift',
            'ControlLeft': 'L-Ctrl', 'ControlRight': 'R-Ctrl',
            'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
            'Backspace': 'Back', 'Delete': 'Del',
        };
        return map[code] || code;
    }
}

export const KeyBindManager = new _KeyBindManager();
