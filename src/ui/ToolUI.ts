import { UI, Parchment, drawParchmentPanel } from './UITheme';
import type { ItemIconSprite } from '../data/ItemDB';
import { drawItemIcon } from './ItemIconRenderer';
import { t } from '../i18n/LanguageManager';

export interface ToolOptionView {
    itemId: string;
    icon: string;
    iconSprite?: ItemIconSprite;
    color: string;
    name: string;
    count: number;
    recoverHp: number;
    recoverMp: number;
}

export class ToolUI {
    private visible = false;
    private options: ToolOptionView[] = [];
    private hoveredIndex = -1;
    private scrollOffset = 0;

    private readonly PANEL_W = 256;
    private readonly ROW_H = 38;
    private readonly MAX_VISIBLE = 6;
    private readonly HEADER_H = 34;

    private panelX = 0;
    private panelY = 0;
    private panelH = 0;
    private positionSet = false;

    private dragging = false;
    private dragOffX = 0;
    private dragOffY = 0;

    public onToolSelect: ((itemId: string) => void) | null = null;

    public show(options: ToolOptionView[]): void {
        this.options = options;
        this.hoveredIndex = -1;
        this.scrollOffset = 0;
        this.visible = true;
    }

    public hide(): void {
        this.visible = false;
        this.hoveredIndex = -1;
        this.dragging = false;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public onMouseMove(mx: number, my: number): void {
        if (!this.visible) return;

        if (this.dragging) {
            this.panelX = mx - this.dragOffX;
            this.panelY = my - this.dragOffY;
            this.positionSet = true;
            return;
        }

        this.hoveredIndex = -1;
        const listY = this.panelY + this.HEADER_H;
        if (
            mx >= this.panelX &&
            mx <= this.panelX + this.PANEL_W &&
            my >= listY &&
            my <= listY + this.MAX_VISIBLE * this.ROW_H
        ) {
            const row = Math.floor((my - listY) / this.ROW_H);
            const idx = row + this.scrollOffset;
            if (idx >= 0 && idx < this.options.length) this.hoveredIndex = idx;
        }
    }

    public onMouseDown(mx: number, my: number): boolean {
        if (!this.visible) return false;

        if (mx < this.panelX || mx > this.panelX + this.PANEL_W || my < this.panelY || my > this.panelY + this.panelH) {
            this.hide();
            return false;
        }

        const closeBtnX = this.panelX + this.PANEL_W - 24;
        const closeBtnY = this.panelY + 4;
        if (mx >= closeBtnX && mx <= closeBtnX + 20 && my >= closeBtnY && my <= closeBtnY + 20) {
            this.hide();
            return true;
        }

        if (my >= this.panelY && my <= this.panelY + this.HEADER_H && mx >= this.panelX && mx <= this.panelX + this.PANEL_W - 24) {
            this.dragging = true;
            this.dragOffX = mx - this.panelX;
            this.dragOffY = my - this.panelY;
            return true;
        }

        if (this.hoveredIndex >= 0 && this.hoveredIndex < this.options.length) {
            this.onToolSelect?.(this.options[this.hoveredIndex].itemId);
            this.hide();
            return true;
        }

        return true;
    }

    public onMouseUp(): void {
        this.dragging = false;
    }

    public onScroll(delta: number): boolean {
        if (!this.visible) return false;
        const maxScroll = Math.max(0, this.options.length - this.MAX_VISIBLE);
        this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + (delta > 0 ? 1 : -1)));
        return true;
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;
        if (this.options.length === 0) {
            this.hide();
            return;
        }

        const visibleCount = Math.min(this.options.length, this.MAX_VISIBLE);
        this.panelH = this.HEADER_H + visibleCount * this.ROW_H + 12;

        if (!this.positionSet) {
            this.panelX = Math.floor((canvasW - this.PANEL_W) / 2);
            this.panelY = Math.floor((canvasH - this.panelH) / 2);
            this.positionSet = true;
        }

        const px = this.panelX;
        const py = this.panelY;
        ctx.save();

        drawParchmentPanel(ctx, px, py, this.PANEL_W, this.panelH, {
            radius: 10,
            headerH: this.HEADER_H,
        });

        ctx.fillStyle = 'rgba(58, 38, 24, 0.45)';
        for (let d = 0; d < 3; d++) ctx.fillRect(px + 6, py + 10 + d * 6, 2, 2);

        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 15px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.fillText(t('tool.title'), px + 16, py + 22);

        ctx.fillStyle = '#a01818';
        ctx.font = `bold 14px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.fillText('X', px + this.PANEL_W - 14, py + 19);
        ctx.textAlign = 'left';

        const listY = py + this.HEADER_H;
        for (let i = 0; i < visibleCount; i++) {
            const idx = i + this.scrollOffset;
            const option = this.options[idx];
            const rowY = listY + i * this.ROW_H;
            const isHovered = idx === this.hoveredIndex;

            if (isHovered) {
                ctx.fillStyle = 'rgba(196, 142, 60, 0.28)';
                ctx.fillRect(px + 2, rowY, this.PANEL_W - 4, this.ROW_H);
            }

            ctx.fillStyle = option.color + '55';
            ctx.fillRect(px + 9, rowY + 7, 24, 24);
            ctx.strokeStyle = 'rgba(58, 38, 24, 0.28)';
            ctx.strokeRect(px + 9, rowY + 7, 24, 24);
            drawItemIcon(ctx, option, px + 9, rowY + 7, 24, 24, { fontSize: 16 });

            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.fillStyle = Parchment.textDark;
            ctx.fillText(option.name, px + 36, rowY + 16);

            ctx.font = `11px ${UI.fontPrimary}`;
            ctx.fillStyle = Parchment.textMuted;
            const effects: string[] = [];
            if (option.recoverHp > 0) effects.push(`HP +${option.recoverHp}`);
            if (option.recoverMp > 0) effects.push(`MP +${option.recoverMp}`);
            ctx.fillText(effects.join('  '), px + 36, rowY + 31);

            ctx.font = `bold 12px ${UI.fontPrimary}`;
            ctx.fillStyle = '#1f4878';
            ctx.textAlign = 'right';
            ctx.fillText(`x${option.count}`, px + this.PANEL_W - 12, rowY + 22);
            ctx.textAlign = 'left';

            if (i < visibleCount - 1) {
                ctx.strokeStyle = 'rgba(58, 38, 24, 0.15)';
                ctx.beginPath();
                ctx.moveTo(px + 10, rowY + this.ROW_H);
                ctx.lineTo(px + this.PANEL_W - 10, rowY + this.ROW_H);
                ctx.stroke();
            }
        }

        if (this.options.length > this.MAX_VISIBLE) {
            const totalH = visibleCount * this.ROW_H;
            const thumbH = Math.max(16, totalH * (this.MAX_VISIBLE / this.options.length));
            const maxScroll = this.options.length - this.MAX_VISIBLE;
            const thumbY = listY + (this.scrollOffset / maxScroll) * (totalH - thumbH);

            ctx.fillStyle = 'rgba(58, 38, 24, 0.35)';
            ctx.fillRect(px + this.PANEL_W - 5, thumbY, 3, thumbH);
        }

        ctx.restore();
    }
}
