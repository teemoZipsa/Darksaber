/** The same generated nine-slice skin is used by the DOM field HUD and Canvas
 * controls. Load once; the dark fallback keeps controls usable before the art. */
let panelImage: HTMLImageElement | undefined;

export function drawFieldPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, edge = 18): void {
    if (!panelImage && typeof Image !== 'undefined') {
        panelImage = new Image();
        panelImage.src = '/assets/ui/field-forged/panel.png';
    }
    ctx.save();
    ctx.fillStyle = '#151512';
    ctx.fillRect(x + 2, y + 2, width - 4, height - 4);
    if (panelImage?.complete && panelImage.naturalWidth) {
        const size = panelImage.naturalWidth;
        const slice = 160;
        const border = Math.min(edge, width / 2, height / 2);
        const source = [0, slice, size - slice, size];
        const dx = [x, x + border, x + width - border, x + width];
        const dy = [y, y + border, y + height - border, y + height];
        ctx.imageSmoothingEnabled = true;
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
            ctx.drawImage(panelImage, source[col], source[row], source[col + 1] - source[col], source[row + 1] - source[row],
                dx[col], dy[row], dx[col + 1] - dx[col], dy[row + 1] - dy[row]);
        }
    } else {
        ctx.strokeStyle = '#776345';
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    }
    ctx.restore();
}
