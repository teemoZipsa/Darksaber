/**
 * CursorManager — Generates pixel-art cursors for the game canvas.
 *
 * Uses an off-screen canvas to draw a sword sprite,
 * converts it to a data-URL, and applies it via CSS `cursor`.
 */

export class CursorManager {
    private static dataUrl: string | null = null;

    /**
     * Generate a 32×32 sword cursor as a data-URL.
     * Thicker 3px-wide blade for better visibility.
     */
    private static generateSwordCursor(): string {
        if (this.dataUrl) return this.dataUrl;

        const size = 32;
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d')!;

        // Helper: draw a filled rect
        const px = (x: number, y: number, w: number, h: number, color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
        };

        // ── Blade outline (dark border, 1px around the blade) ──
        const outline = '#111122';
        // Left edge of blade
        px(0, 0, 1, 3, outline);
        px(1, 2, 1, 3, outline);
        px(2, 4, 1, 3, outline);
        px(3, 6, 1, 3, outline);
        px(4, 8, 1, 3, outline);
        px(5, 10, 1, 3, outline);
        px(6, 12, 1, 3, outline);
        px(7, 14, 1, 3, outline);
        px(8, 16, 1, 2, outline);
        // Right edge of blade
        px(3, 0, 1, 3, outline);
        px(4, 2, 1, 3, outline);
        px(5, 4, 1, 3, outline);
        px(6, 6, 1, 3, outline);
        px(7, 8, 1, 3, outline);
        px(8, 10, 1, 3, outline);
        px(9, 12, 1, 3, outline);
        px(10, 14, 1, 2, outline);
        px(9, 16, 1, 2, outline);

        // ── Blade fill (gold/yellow center, 2px wide) ──
        px(1, 0, 2, 3, '#ffd700');
        px(2, 2, 2, 3, '#ffd700');
        px(3, 4, 2, 3, '#ffd700');
        px(4, 6, 2, 3, '#ffd700');
        px(5, 8, 2, 3, '#ffd700');
        px(6, 10, 2, 3, '#ffd700');
        px(7, 12, 2, 3, '#ffd700');
        px(8, 14, 2, 3, '#ffd700');

        // ── Blade highlight (brighter stripe) ──
        px(1, 0, 1, 2, '#fff8dc');
        px(2, 2, 1, 2, '#fff8dc');
        px(3, 4, 1, 2, '#fff8dc');
        px(4, 6, 1, 2, '#fff8dc');
        px(5, 8, 1, 2, '#fff8dc');
        px(6, 10, 1, 2, '#fff8dc');
        px(7, 12, 1, 2, '#fff8dc');

        // ── Tip (bright point) ──
        px(1, 0, 1, 1, '#ffffff');

        // ── Crossguard (wider, red/dark) ──
        px(7, 16, 5, 2, outline);      // outline
        px(8, 16, 3, 2, '#cc3333');     // red fill
        px(9, 17, 1, 1, '#ff4444');     // gem highlight

        // ── Handle (brown, thicker) ──
        px(9, 18, 3, 1, outline);
        px(10, 19, 3, 1, outline);
        px(11, 20, 3, 1, outline);
        px(10, 18, 1, 1, '#8b4513');
        px(11, 19, 1, 1, '#8b4513');
        px(12, 20, 1, 1, '#8b4513');
        px(9, 19, 1, 1, outline);
        px(10, 20, 1, 1, outline);

        // ── Pommel (gold dot) ──
        px(12, 21, 2, 2, outline);
        px(12, 21, 1, 1, '#ffd700');
        px(13, 22, 1, 1, '#ffd700');

        this.dataUrl = c.toDataURL('image/png');
        return this.dataUrl;
    }

    /** Apply the sword cursor to the given canvas element. */
    static applySwordCursor(canvas: HTMLCanvasElement): void {
        const url = this.generateSwordCursor();
        canvas.style.cursor = `url(${url}) 1 1, auto`;
    }

    /** Reset cursor back to default. */
    static resetCursor(canvas: HTMLCanvasElement): void {
        canvas.style.cursor = 'default';
    }
}
