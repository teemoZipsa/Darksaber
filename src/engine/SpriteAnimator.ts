import { SpriteSheet } from './SpriteSheet';

export type Direction = 'down' | 'left' | 'right' | 'up';

export class SpriteAnimator {
    private spriteSheet: SpriteSheet;
    public direction: Direction = 'down';
    public isPlaying: boolean = false;
    
    private currentFrame: number = 0;
    private timer: number = 0;
    private framePacingMs: number;

    // Standard RPG Maker mapping: down=0, left=1, right=2, up=3
    private readonly rowMap: Record<Direction, number> = {
        'down': 0,
        'left': 1,
        'right': 2,
        'up': 3
    };

    constructor(spriteSheet: SpriteSheet, framePacingMs: number = 150) {
        this.spriteSheet = spriteSheet;
        this.framePacingMs = framePacingMs;
    }

    public play(): void {
        this.isPlaying = true;
    }

    public stop(): void {
        this.isPlaying = false;
        // Reset to standing frame (column 1 in standard 3-column sheets)
        // Adjust this if your sprite sheet format differs.
        this.currentFrame = this.spriteSheet.cols > 1 ? 1 : 0;
    }

    public setDirection(dir: Direction): void {
        this.direction = dir;
    }

    public update(dt: number): void {
        if (!this.isPlaying || !this.spriteSheet.isLoaded()) return;

        this.timer += dt * 1000; // ms
        if (this.timer >= this.framePacingMs) {
            this.timer = 0;
            
            // Loop through all columns
            this.currentFrame = (this.currentFrame + 1) % this.spriteSheet.cols;
        }
    }

    public render(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
        if (!this.spriteSheet.isLoaded()) return;

        let row = this.rowMap[this.direction];
        if (row >= this.spriteSheet.rows) {
            row = 0; // Fallback to row 0 for single-image sprites or missing directions
        }
        const frameIndex = this.isPlaying ? this.currentFrame : (this.spriteSheet.cols > 1 ? 1 : 0);

        const rect = this.spriteSheet.getFrameRect(row, frameIndex);

        ctx.drawImage(
            this.spriteSheet.image,
            rect.x, rect.y, rect.w, rect.h,
            dx, dy, dw, dh
        );
    }
}
