import { SettingsManager } from './SettingsManager';

export class InputManager {
    private keysDown: Set<string> = new Set();
    private keysJustPressed: Set<string> = new Set();
    private activePrimaryPointerId: number | null = null;

    public mouseScreenX: number = 0;
    public mouseScreenY: number = 0;
    public mouseClicked: boolean = false;
    public mouseJustDown: boolean = false;
    public mouseRightJustDown: boolean = false;
    public mouseJustUp: boolean = false;
    public mouseIsDown: boolean = false;
    public mouseWheelDelta: number = 0;

    /** Mouse X in UI-scaled virtual coordinates */
    public get uiMouseX(): number { return this.mouseScreenX / SettingsManager.getUIScale(); }
    /** Mouse Y in UI-scaled virtual coordinates */
    public get uiMouseY(): number { return this.mouseScreenY / SettingsManager.getUIScale(); }

    constructor(canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', (e) => {
            if (isEditableTarget(e.target) || e.isComposing) return;
            if (SettingsManager.getPreventDefaultKeyCodes().includes(e.code)) {
                e.preventDefault();
            }
            if (!this.keysDown.has(e.code)) {
                this.keysJustPressed.add(e.code);
            }
            this.keysDown.add(e.code);
        });

        window.addEventListener('keyup', (e) => {
            if (isEditableTarget(e.target) || e.isComposing) return;
            this.keysDown.delete(e.code);
        });

        const updatePointerPos = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseScreenX = e.clientX - rect.left;
            this.mouseScreenY = e.clientY - rect.top;
        };

        canvas.addEventListener('pointermove', (e) => {
            if (!e.isPrimary) return;
            updatePointerPos(e);
        });

        canvas.addEventListener('pointerdown', (e) => {
            if (!e.isPrimary) return;
            updatePointerPos(e);
            if (e.button === 0) {
                this.activePrimaryPointerId = e.pointerId;
                this.mouseJustDown = true;
                this.mouseIsDown = true;
            } else if (e.button === 2) {
                this.mouseRightJustDown = true;
            }
        });

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        window.addEventListener('pointerup', (e) => {
            if (!e.isPrimary || e.button !== 0 || e.pointerId !== this.activePrimaryPointerId) return;
            updatePointerPos(e);
            this.activePrimaryPointerId = null;
            this.mouseJustUp = true;
            this.mouseIsDown = false;
            this.mouseClicked = true;
        });

        window.addEventListener('pointercancel', (e) => {
            if (e.pointerId !== this.activePrimaryPointerId) return;
            this.activePrimaryPointerId = null;
            this.mouseIsDown = false;
            this.mouseJustUp = true;
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY === 0) return;
            this.mouseWheelDelta += e.deltaY > 0 ? 1 : -1;
        }, { passive: false });
    }

    public isDown(code: string): boolean {
        return this.keysDown.has(code);
    }

    public justPressed(code: string): boolean {
        return this.keysJustPressed.has(code);
    }

    public endFrame(): void {
        this.keysJustPressed.clear();
        this.mouseClicked = false;
        this.mouseJustDown = false;
        this.mouseRightJustDown = false;
        this.mouseJustUp = false;
        this.mouseWheelDelta = 0;
    }
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

