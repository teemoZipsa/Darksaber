import { t } from '../i18n/LanguageManager';
import type { TacticalCommand, TacticalMenuItem } from '../field/TacticalMarkers';
import { drawGlassPanel, UI } from './UITheme';

export class TacticalContextMenuUI {
    private visible = false;
    private items: TacticalMenuItem[] = [];
    private x = 0;
    private y = 0;
    private width = 132;
    private rowHeight = 24;
    private pad = 6;
    private hoveredIndex = -1;

    public open(x: number, y: number, items: TacticalMenuItem[], viewportW: number, viewportH: number): void {
        this.items = items;
        this.visible = items.length > 0;
        this.hoveredIndex = -1;

        const h = this.getHeight();
        this.x = clamp(x + 8, 6, Math.max(6, viewportW - this.width - 6));
        this.y = clamp(y + 8, 6, Math.max(6, viewportH - h - 6));
    }

    public close(): void {
        this.visible = false;
        this.hoveredIndex = -1;
    }

    public getIsOpen(): boolean {
        return this.visible;
    }

    public onMouseMove(mx: number, my: number): void {
        if (!this.visible) {
            this.hoveredIndex = -1;
            return;
        }
        this.hoveredIndex = this.getItemIndexAt(mx, my);
    }

    public onClick(mx: number, my: number): TacticalCommand | 'outside' | null {
        if (!this.visible) return null;
        const index = this.getItemIndexAt(mx, my);
        if (index >= 0) return this.items[index].command;
        if (this.contains(mx, my)) return null;
        return 'outside';
    }

    public render(ctx: CanvasRenderingContext2D): void {
        if (!this.visible) return;

        const h = this.getHeight();
        drawGlassPanel(ctx, this.x, this.y, this.width, h, {
            bg: 'rgba(12, 15, 24, 0.92)',
            border: UI.borderAccent,
            radius: 6,
            shadow: true,
        });

        ctx.save();
        ctx.font = `11px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < this.items.length; i++) {
            const rowX = this.x + this.pad;
            const rowY = this.y + this.pad + i * this.rowHeight;
            const rowW = this.width - this.pad * 2;
            const isHovered = i === this.hoveredIndex;

            if (isHovered) {
                ctx.fillStyle = 'rgba(240, 192, 80, 0.18)';
                ctx.fillRect(rowX, rowY, rowW, this.rowHeight);
                ctx.strokeStyle = 'rgba(240, 192, 80, 0.45)';
                ctx.lineWidth = 1;
                ctx.strokeRect(rowX + 0.5, rowY + 0.5, rowW - 1, this.rowHeight - 1);
            }

            ctx.fillStyle = isHovered ? UI.textAccent : UI.textPrimary;
            ctx.fillText(t(this.items[i].labelKey), rowX + 10, rowY + this.rowHeight / 2);
        }

        ctx.restore();
    }

    private contains(mx: number, my: number): boolean {
        return mx >= this.x &&
            mx <= this.x + this.width &&
            my >= this.y &&
            my <= this.y + this.getHeight();
    }

    private getItemIndexAt(mx: number, my: number): number {
        if (!this.contains(mx, my)) return -1;
        const index = Math.floor((my - this.y - this.pad) / this.rowHeight);
        return index >= 0 && index < this.items.length ? index : -1;
    }

    private getHeight(): number {
        return this.pad * 2 + this.items.length * this.rowHeight;
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
