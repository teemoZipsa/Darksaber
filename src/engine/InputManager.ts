import { SettingsManager } from './SettingsManager';

export class InputManager {
    private keysDown: Set<string> = new Set();
    private keysJustPressed: Set<string> = new Set();

    public mouseScreenX: number = 0;
    public mouseScreenY: number = 0;
    public mouseClicked: boolean = false;
    public mouseJustDown: boolean = false;
    public mouseJustUp: boolean = false;
    public mouseIsDown: boolean = false;
    public mouseWheelDelta: number = 0;

    /** Mouse X in UI-scaled virtual coordinates */
    public get uiMouseX(): number { return this.mouseScreenX / SettingsManager.getUIScale(); }
    /** Mouse Y in UI-scaled virtual coordinates */
    public get uiMouseY(): number { return this.mouseScreenY / SettingsManager.getUIScale(); }

    constructor(canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', (e) => {
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','Tab','KeyI'].includes(e.code)) {
                e.preventDefault();
            }
            if (!this.keysDown.has(e.code)) {
                this.keysJustPressed.add(e.code);
            }
            this.keysDown.add(e.code);
        });

        window.addEventListener('keyup', (e) => {
            this.keysDown.delete(e.code);
        });

        const updateMousePos = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseScreenX = e.clientX - rect.left;
            this.mouseScreenY = e.clientY - rect.top;
        };

        canvas.addEventListener('mousemove', updateMousePos);

        canvas.addEventListener('mousedown', (e) => {
            updateMousePos(e);
            if (e.button === 0) {
                this.mouseJustDown = true;
                this.mouseIsDown = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                const rect = canvas.getBoundingClientRect();
                this.mouseScreenX = e.clientX - rect.left;
                this.mouseScreenY = e.clientY - rect.top;
                
                this.mouseJustUp = true;
                this.mouseIsDown = false;
            }
        });

        canvas.addEventListener('click', () => {
            this.mouseClicked = true;
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
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
        this.mouseJustUp = false;
        this.mouseWheelDelta = 0;
    }
}

