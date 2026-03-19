/**
 * InputManager — centralized keyboard and mouse input handler.
 * Tracks key states, mouse grid position, and click events.
 */

export class InputManager {
    private keysDown: Set<string> = new Set();
    private keysJustPressed: Set<string> = new Set();

    public mouseScreenX: number = 0;
    public mouseScreenY: number = 0;
    public mouseClicked: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', (e) => {
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
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

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseScreenX = e.clientX - rect.left;
            this.mouseScreenY = e.clientY - rect.top;
        });

        canvas.addEventListener('click', () => {
            this.mouseClicked = true;
        });
    }

    /** Check if a key is currently held */
    public isDown(code: string): boolean {
        return this.keysDown.has(code);
    }

    /** Check if a key was just pressed this frame (single fire) */
    public justPressed(code: string): boolean {
        return this.keysJustPressed.has(code);
    }

    /** Clear per-frame states (call at end of each update) */
    public endFrame(): void {
        this.keysJustPressed.clear();
        this.mouseClicked = false;
    }
}
