/**
 * EntityInfoUI — Retro-warm info window with modern bar polish.
 * Parchment panel with a dark grid portrait area.
 */

import type { StatusKind } from '../combat/StatusEffects';
import { t } from '../i18n/LanguageManager';
import { getStatusIconCell } from './DarksaberIconRegistry';
import { DarksaberSpriteAtlas } from './DarksaberSpriteAtlas';
import { UI, isCloseButtonHit, Parchment, drawParchmentPanel } from './UITheme';

export interface EntityDisplaySpriteSheet {
    image: HTMLImageElement;
    loaded: boolean;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    rowByFacing: Record<'up' | 'down' | 'left' | 'right', number>;
    renderScale: number;
}

export interface EntityDisplayInfo {
    name: string;
    className?: string;
    level: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    actionGauge: number; // 0 to 100
    exp?: number;
    maxExp?: number;
    buffs?: string[];
    statusKinds?: StatusKind[];
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spriteColor: string;
    spriteSheet?: EntityDisplaySpriteSheet;
    spriteImage?: HTMLImageElement;  // character portrait image
}

export type EntityInfoPanelHitResult = 'close' | 'consume' | 'miss';

export interface EntityInfoPanelBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const ENTITY_INFO_DESKTOP_WIDTH = 210;
export const ENTITY_INFO_DESKTOP_HEIGHT = 320;
export const ENTITY_INFO_COMPACT_WIDTH = 172;
export const ENTITY_INFO_COMPACT_HEIGHT = 100;

export function getEntityInfoHeaderLines(info: EntityDisplayInfo): { title: string; subtitle: string } {
    const level = t('info.level');
    return {
        title: info.name,
        subtitle: info.className ? `${info.className} · ${level} ${info.level}` : `[ ${level} ${info.level} ]`,
    };
}

// ─── LIGHT PARCHMENT (unified) ───────────────────────────
const TEXT_DARK    = Parchment.textDark;
const GRID_BG      = '#1a1a2e';
const GRID_CELL    = '#2a2a4a';

interface StatusSlotHitbox {
    x: number;
    y: number;
    size: number;
    kind?: StatusKind;
    icon: string;
}

export class EntityInfoUI {
    private x = 16;
    private y = 180;
    private w = ENTITY_INFO_DESKTOP_WIDTH;
    private h = ENTITY_INFO_DESKTOP_HEIGHT;
    private layoutMode: 'desktop' | 'compact' = 'desktop';
    private interactive = true;

    /** Allow dynamic repositioning from the active engine */
    public setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    // Flash timer for ATB
    private flashTime = 0;
    private closeHovered = false;
    private mouseX = 0;
    private mouseY = 0;
    private statusSlotHitboxes: StatusSlotHitbox[] = [];
    private hoveredStatus: StatusSlotHitbox | null = null;

    // Smooth bar lerp targets
    private displayHp = -1;
    private displayMp = -1;
    private displayAtb = -1;

    public onMouseMove(mx: number, my: number): void {
        this.mouseX = mx;
        this.mouseY = my;
        if (!this.interactive) {
            this.closeHovered = false;
            this.hoveredStatus = null;
            return;
        }
        const { x: cx, y: cy } = this.getCloseButtonCenter();
        this.closeHovered = isCloseButtonHit(mx, my, cx, cy);
        this.hoveredStatus = this.findHoveredStatus(mx, my);
    }

    public onClick(mx: number, my: number): boolean {
        return this.hitTest(mx, my) === 'close';
    }

    /**
     * Resolve pointer input against the entire visible panel.
     * `consume` prevents taps on the card body from leaking into the world.
     */
    public hitTest(mx: number, my: number): EntityInfoPanelHitResult {
        if (!this.interactive) return 'miss';
        const { x: cx, y: cy } = this.getCloseButtonCenter();
        if (isCloseButtonHit(mx, my, cx, cy)) return 'close';
        if (mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h) {
            return 'consume';
        }
        return 'miss';
    }

    public getBounds(): EntityInfoPanelBounds {
        return {
            x: this.x,
            y: this.y,
            width: this.w,
            height: this.h,
        };
    }

    public setInteractive(interactive: boolean): void {
        this.interactive = interactive;
        if (!interactive) {
            this.closeHovered = false;
            this.hoveredStatus = null;
            this.statusSlotHitboxes = [];
        }
    }

    /**
     * Narrow viewport variant. Position remains controlled through setPosition,
     * while width is allowed to follow the responsive HUD layout.
     */
    public renderCompact(
        ctx: CanvasRenderingContext2D,
        info: EntityDisplayInfo,
        width = ENTITY_INFO_COMPACT_WIDTH
    ): void {
        this.interactive = true;
        this.layoutMode = 'compact';
        // Follow the responsive HUD column instead of forcing the legacy
        // compact width back over the adjacent minimap at high UI scales.
        this.w = Math.max(104, Math.round(width));
        this.h = ENTITY_INFO_COMPACT_HEIGHT;
        this.advanceBars(info);

        ctx.save();
        drawParchmentPanel(ctx, this.x, this.y, this.w, this.h, {
            compact: true,
            shadow: false,
            headerH: 23,
        });

        const pad = 8;
        const headerMaxW = this.w - 50;
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.textBaseline = 'top';
        ctx.fillText(this.fitText(ctx, info.name, headerMaxW), this.x + pad, this.y + 6);
        ctx.font = `9px ${UI.fontMono}`;
        ctx.fillStyle = Parchment.textMid;
        ctx.fillText(`${t('info.level')} ${info.level}`, this.x + pad, this.y + 19);
        this.drawCloseButton(ctx);

        const labelX = this.x + pad;
        const barX = this.x + 40;
        const barW = this.w - 48;
        const barH = 11;
        this.drawCompactBar(
            ctx,
            t('stat.hp'),
            labelX,
            barX,
            this.y + 33,
            barW,
            barH,
            info.maxHp > 0 ? this.displayHp / info.maxHp : 0,
            '#e53935',
            `${Math.ceil(this.displayHp)}/${info.maxHp}`
        );
        this.drawCompactBar(
            ctx,
            t('stat.mp'),
            labelX,
            barX,
            this.y + 48,
            barW,
            barH,
            info.maxMp > 0 ? this.displayMp / info.maxMp : 0,
            '#d2a83f',
            info.maxMp > 0 ? `${Math.ceil(this.displayMp)}/${info.maxMp}` : '—'
        );
        this.drawCompactBar(
            ctx,
            t('ui.actionGauge'),
            labelX,
            barX,
            this.y + 63,
            barW,
            barH,
            Math.min(1, this.displayAtb / 100),
            info.actionGauge >= 100 ? '#39d96b' : '#e67e22',
            `${Math.round(this.displayAtb)}%`
        );

        const footerY = this.y + 83;
        ctx.font = `bold 9px ${UI.fontPrimary}`;
        ctx.fillStyle = Parchment.textDark;
        ctx.textBaseline = 'middle';
        ctx.fillText(`${t('create.atk')} ${Math.floor(info.atk)}`, this.x + pad, footerY);
        ctx.fillText(`${t('create.def')} ${Math.floor(info.def)}`, this.x + 55, footerY);

        this.statusSlotHitboxes = [];
        const compactStatusCapacity = Math.max(0, Math.min(3, Math.floor((this.w - 96) / 16)));
        const compactStatuses = info.buffs?.slice(0, compactStatusCapacity) ?? [];
        const statusStartX = this.x + this.w - pad - compactStatuses.length * 16;
        for (let index = 0; index < compactStatuses.length; index++) {
            const icon = compactStatuses[index];
            const kind = info.statusKinds?.[index];
            const iconCell = getStatusIconCell(kind ?? icon);
            const iconX = statusStartX + index * 16;
            const iconY = footerY - 7;
            this.statusSlotHitboxes.push({ x: iconX, y: iconY, size: 14, kind, icon });
            const iconDrawn = iconCell
                ? DarksaberSpriteAtlas.drawIconCell(ctx, iconCell.col, iconCell.row, iconX, iconY, 14)
                : false;
            if (!iconDrawn) {
                ctx.fillStyle = '#64451f';
                ctx.fillRect(iconX, iconY, 14, 14);
                ctx.fillStyle = '#f6d090';
                ctx.font = `bold 8px ${UI.fontPrimary}`;
                ctx.textAlign = 'center';
                ctx.fillText(icon.slice(0, 1), iconX + 7, iconY + 7);
                ctx.textAlign = 'start';
            }
        }
        this.hoveredStatus = this.findHoveredStatus(this.mouseX, this.mouseY);
        this.drawStatusTooltip(ctx);
        ctx.restore();
    }

    public render(ctx: CanvasRenderingContext2D, info: EntityDisplayInfo): void {
        this.interactive = true;
        this.layoutMode = 'desktop';
        this.w = ENTITY_INFO_DESKTOP_WIDTH;
        this.h = ENTITY_INFO_DESKTOP_HEIGHT;
        this.advanceBars(info);

        ctx.save();

        // ── Light parchment panel ──
        drawParchmentPanel(ctx, this.x, this.y, this.w, this.h);

        // ── Close button (retro red circle with X) ──
        this.drawCloseButton(ctx);

        // ── Header: Name & Level ──
        const header = getEntityInfoHeaderLines(info);
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 15px ${UI.fontPrimary}`;
        ctx.textBaseline = 'top';
        ctx.fillText(header.title, this.x + 12, this.y + 10);
        ctx.font = `12px ${UI.fontMono}`;
        ctx.fillStyle = Parchment.textMid;
        ctx.fillText(header.subtitle, this.x + 12, this.y + 28);

        // ── Portrait Grid (dark grid — classic feel) ──
        const cellSize = 24;
        const cols = 7;
        const rows = 4;
        const actualGridW = cols * cellSize;
        const actualGridH = rows * cellSize;
        // Center grid horizontally in panel
        const gridX = this.x + Math.floor((this.w - actualGridW) / 2);
        const gridY = this.y + 50;

        // Grid background
        ctx.fillStyle = GRID_BG;
        ctx.fillRect(gridX, gridY, actualGridW, actualGridH);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(gridX, gridY, actualGridW, actualGridH);

        // Grid cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cx = gridX + c * cellSize + 2;
                const cy = gridY + r * cellSize + 2;
                ctx.fillStyle = GRID_CELL;
                ctx.fillRect(cx, cy, cellSize - 4, cellSize - 4);
            }
        }

        // Character sprite in center of grid
        const spriteCenterX = gridX + (cols * cellSize) / 2;
        const spriteCenterY = gridY + (rows * cellSize) / 2;
        const spriteSheetDrawn = info.spriteSheet
            ? this.drawSpriteSheetIdleFrame(ctx, info.spriteSheet, spriteCenterX, spriteCenterY, actualGridW - 8, actualGridH - 8)
            : false;
        if (!spriteSheetDrawn && info.spriteImage && info.spriteImage.complete && info.spriteImage.naturalWidth > 0) {
            // Draw character portrait image
            const imgSize = Math.min(cols * cellSize - 8, rows * cellSize - 8, 48);
            ctx.drawImage(
                info.spriteImage,
                spriteCenterX - imgSize / 2, spriteCenterY - imgSize / 2,
                imgSize, imgSize
            );
        } else if (!spriteSheetDrawn) {
            // Fallback: colored square
            ctx.fillStyle = info.spriteColor;
            ctx.fillRect(spriteCenterX - 12, spriteCenterY - 12, 24, 24);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(spriteCenterX - 12, spriteCenterY - 12, 24, 24);
        }

        // Draw status effects above the portrait so action stances stay readable.
        this.statusSlotHitboxes = [];
        if (info.buffs && info.buffs.length > 0) {
            const buffSlots = [
                {c: 0, r: 0}, {c: 1, r: 0}, {c: 2, r: 0}, {c: 3, r: 0},
                {c: 0, r: 1}, {c: 0, r: 2}, {c: 3, r: 1}
            ];
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < Math.min(info.buffs.length, buffSlots.length); i++) {
                const slot = buffSlots[i];
                const icon = info.buffs[i];
                const kind = info.statusKinds?.[i];
                const iconCell = getStatusIconCell(kind ?? icon);
                const cx = gridX + slot.c * cellSize + cellSize / 2;
                const cy = gridY + slot.r * cellSize + cellSize / 2;
                const isActionStance = kind === 'guard' || kind === 'resting' || kind === 'counterReady';
                const iconSize = isActionStance ? 19 : 17;
                this.statusSlotHitboxes.push({ x: cx - 12, y: cy - 12, size: 24, kind, icon });

                const iconDrawn = iconCell
                    ? DarksaberSpriteAtlas.drawIconCell(ctx, iconCell.col, iconCell.row, cx - iconSize / 2, cy - iconSize / 2, iconSize)
                    : false;
                if (!iconDrawn) {
                    ctx.font = `bold 10px ${UI.fontPrimary}`;
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
                    ctx.fillStyle = '#f6d090';
                    const label = icon.length > 2 ? icon.slice(0, 2) : icon;
                    ctx.strokeText(label, cx, cy + 1);
                    ctx.fillText(label, cx, cy + 1);
                }
            }
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }
        this.hoveredStatus = this.findHoveredStatus(this.mouseX, this.mouseY);

        // ── Separator line ──
        const sepY = gridY + actualGridH + 8;
        ctx.strokeStyle = 'rgba(58, 38, 24, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x + 12, sepY);
        ctx.lineTo(this.x + this.w - 12, sepY);
        ctx.stroke();

        // ── Stat Bars (symmetric padding) ──
        const pad = 14;
        const barLabelX = this.x + pad;
        const barX = this.x + pad + 36;
        const barW = this.w - pad * 2 - 36;
        const barH = 14;
        let by = sepY + 8;

        // ATB
        const isFullATB = info.actionGauge >= 100;
        let atbColor = '#e67e22';
        let atbGlow = false;
        if (isFullATB) {
            const pulse = (Math.sin(this.flashTime * 3) + 1) / 2;
            atbColor = `rgba(57, 255, 20, ${Math.min(1, pulse + 0.4)})`;
            atbGlow = true;
        }
        const atbPct = Math.min(1, this.displayAtb / 100);
        this.drawRetroBar(ctx, t('ui.actionGauge'), barLabelX, barX, by, barW, barH, atbPct, atbColor, 'rgba(0,0,0,0.5)',
            isFullATB ? t('entityInfo.ready') : undefined, atbGlow);
        by += barH + 6;

        // HP
        const hpPct = info.maxHp > 0 ? this.displayHp / info.maxHp : 0;
        this.drawRetroBar(ctx, t('stat.hp'), barLabelX, barX, by, barW, barH, hpPct, '#e53935', 'rgba(0,0,0,0.3)',
            `${Math.ceil(this.displayHp)}/${info.maxHp}`);
        by += barH + 6;

        // MP
        const mpPct = info.maxMp > 0 ? this.displayMp / info.maxMp : 0;
        this.drawRetroBar(ctx, t('stat.mp'), barLabelX, barX, by, barW, barH, mpPct, '#f0c040', 'rgba(0,0,0,0.3)',
            info.maxMp > 0 ? `${Math.ceil(this.displayMp)}/${info.maxMp}` : '—');
        by += barH + 6;

        // EXP
        if (info.maxExp !== undefined && info.exp !== undefined) {
            const expPct = info.maxExp > 0 ? info.exp / info.maxExp : 0;
            this.drawRetroBar(ctx, t('info.exp'), barLabelX, barX, by, barW, barH, expPct, '#88ee44', 'rgba(0,0,0,0.3)',
                `${info.exp}/${info.maxExp}`);
            by += barH + 6;
        }

        // ── Footer: ATK / DEF ──
        by += 2;
        ctx.strokeStyle = 'rgba(58, 38, 24, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x + 12, by);
        ctx.lineTo(this.x + this.w - 12, by);
        ctx.stroke();
        by += 10;

        // ATK box
        const statPad = pad;
        const totalBoxW = this.w - statPad * 2;
        const boxW = (totalBoxW - 8) / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(this.x + statPad, by, boxW, 22);
        ctx.strokeStyle = Parchment.borderLight;
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x + statPad, by, boxW, 22);
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.fillText(t('create.atk'), this.x + statPad + 4, by + 16);
        ctx.font = `bold 13px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(info.atk)}`, this.x + statPad + boxW - 6, by + 16);
        ctx.textAlign = 'start';

        // DEF box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(this.x + statPad + boxW + 8, by, boxW, 22);
        ctx.strokeStyle = Parchment.borderLight;
        ctx.strokeRect(this.x + statPad + boxW + 8, by, boxW, 22);
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.fillText(t('create.def'), this.x + statPad + boxW + 12, by + 16);
        ctx.font = `bold 13px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(info.def)}`, this.x + statPad + boxW * 2 + 2, by + 16);
        ctx.textAlign = 'start';
        by += 28;

        // MAT box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(this.x + statPad, by, boxW, 22);
        ctx.strokeStyle = Parchment.borderLight;
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x + statPad, by, boxW, 22);
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.fillText(t('entityInfo.stat.magAtkShort'), this.x + statPad + 4, by + 16);
        ctx.font = `bold 13px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(info.magAtk)}`, this.x + statPad + boxW - 6, by + 16);
        ctx.textAlign = 'start';

        // MRES box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(this.x + statPad + boxW + 8, by, boxW, 22);
        ctx.strokeStyle = Parchment.borderLight;
        ctx.strokeRect(this.x + statPad + boxW + 8, by, boxW, 22);
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.fillText(t('entityInfo.stat.magDefShort'), this.x + statPad + boxW + 12, by + 16);
        ctx.font = `bold 13px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(info.magDef)}`, this.x + statPad + boxW * 2 + 2, by + 16);
        ctx.textAlign = 'start';

        this.drawStatusTooltip(ctx);

        ctx.restore();
    }

    private advanceBars(info: EntityDisplayInfo): void {
        this.flashTime += 0.05;
        if (this.displayHp < 0) this.displayHp = info.hp;
        if (this.displayMp < 0) this.displayMp = info.mp;
        if (this.displayAtb < 0) this.displayAtb = info.actionGauge;
        this.displayHp += (info.hp - this.displayHp) * 0.12;
        this.displayMp += (info.mp - this.displayMp) * 0.12;
        this.displayAtb += (info.actionGauge - this.displayAtb) * 0.15;
    }

    private getCloseButtonCenter(): { x: number; y: number } {
        return this.layoutMode === 'compact'
            ? { x: this.x + this.w - 13, y: this.y + 13 }
            : { x: this.x + this.w - 20, y: this.y + 14 };
    }

    private drawCloseButton(ctx: CanvasRenderingContext2D): void {
        const { x: closeX, y: closeY } = this.getCloseButtonCenter();
        const radius = this.layoutMode === 'compact' ? 8 : 10;
        ctx.beginPath();
        ctx.arc(closeX, closeY, radius, 0, Math.PI * 2);
        ctx.fillStyle = this.closeHovered ? '#cc3333' : '#a03030';
        ctx.fill();
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${this.layoutMode === 'compact' ? 9 : 11}px "DOSMyungjo", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', closeX, closeY);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'start';
    }

    private fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let fitted = text;
        while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) {
            fitted = fitted.slice(0, -1);
        }
        return `${fitted}…`;
    }

    private drawCompactBar(
        ctx: CanvasRenderingContext2D,
        label: string,
        labelX: number,
        barX: number,
        y: number,
        width: number,
        height: number,
        pct: number,
        color: string,
        value: string
    ): void {
        ctx.fillStyle = TEXT_DARK;
        ctx.font = `bold 9px ${UI.fontPrimary}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX, y + height / 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
        ctx.fillRect(barX, y, width, height);
        ctx.fillStyle = color;
        ctx.fillRect(barX + 1, y + 1, Math.max(0, (width - 2) * Math.max(0, Math.min(1, pct))), height - 2);
        ctx.strokeStyle = 'rgba(58, 38, 24, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, y, width, height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 8px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(value, barX + width / 2, y + height / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private findHoveredStatus(mx: number, my: number): StatusSlotHitbox | null {
        return this.statusSlotHitboxes.find((slot) =>
            mx >= slot.x && mx <= slot.x + slot.size && my >= slot.y && my <= slot.y + slot.size
        ) ?? null;
    }

    private drawStatusTooltip(ctx: CanvasRenderingContext2D): void {
        if (!this.hoveredStatus) return;
        const kind = this.hoveredStatus.kind;
        const title = kind ? t(`status.${kind}.name`) : this.hoveredStatus.icon;
        const desc = kind ? t(`status.${kind}.desc`) : '';
        ctx.save();
        ctx.font = `11px ${UI.fontPrimary}`;
        const tooltipW = this.layoutMode === 'compact' ? Math.max(80, this.w - 16) : 164;
        const lines = this.wrapTooltipText(ctx, desc, tooltipW - 16);
        const tooltipH = 30 + lines.length * 14;
        const cursorGapX = this.layoutMode === 'compact' ? 10 : 28;
        const cursorGapY = this.layoutMode === 'compact' ? 10 : 22;
        const panelPad = 8;
        let tx = this.mouseX + cursorGapX;
        let ty = this.mouseY + cursorGapY;
        if (tx + tooltipW > this.x + this.w - panelPad) tx = this.mouseX - tooltipW - cursorGapX;
        if (ty + tooltipH > this.y + this.h - panelPad) ty = this.mouseY - tooltipH - cursorGapY;
        tx = Math.max(this.x + panelPad, Math.min(tx, this.x + this.w - tooltipW - panelPad));
        ty = Math.max(this.y + panelPad, Math.min(ty, this.y + this.h - tooltipH - panelPad));

        ctx.fillStyle = 'rgba(24, 16, 10, 0.94)';
        ctx.strokeStyle = '#c9973d';
        ctx.lineWidth = 1.5;
        ctx.fillRect(tx, ty, tooltipW, tooltipH);
        ctx.strokeRect(tx, ty, tooltipW, tooltipH);
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.fillStyle = '#ffd76a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, tx + 8, ty + 7, tooltipW - 16);
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.fillStyle = '#ead7b0';
        let lineY = ty + 24;
        for (const line of lines) {
            ctx.fillText(line, tx + 8, lineY);
            lineY += 14;
        }
        ctx.restore();
    }

    private wrapTooltipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
        if (!text || text.startsWith('status.')) return [];
        const tokens = text.split(' ');
        const lines: string[] = [];
        let line = '';
        for (const token of tokens) {
            const next = line ? `${line} ${token}` : token;
            if (line && ctx.measureText(next).width > maxW) {
                lines.push(line);
                line = token;
            } else {
                line = next;
            }
        }
        if (line) lines.push(line);
        return lines.slice(0, 3);
    }

    private drawSpriteSheetIdleFrame(
        ctx: CanvasRenderingContext2D,
        spriteSheet: EntityDisplaySpriteSheet,
        centerX: number,
        centerY: number,
        maxWidth: number,
        maxHeight: number
    ): boolean {
        if (!spriteSheet.loaded || !spriteSheet.image.complete || spriteSheet.image.naturalWidth <= 0) return false;

        const frameCount = Math.max(1, spriteSheet.frameCount);
        const frameIndex = Math.min(1, frameCount - 1);
        const row = spriteSheet.rowByFacing.down ?? 0;
        const targetSize = Math.min(
            maxWidth,
            maxHeight,
            Math.max(40, 48 * Math.max(0.1, spriteSheet.renderScale))
        );

        const previousSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            spriteSheet.image,
            frameIndex * spriteSheet.frameWidth,
            row * spriteSheet.frameHeight,
            spriteSheet.frameWidth,
            spriteSheet.frameHeight,
            centerX - targetSize / 2,
            centerY - targetSize / 2,
            targetSize,
            targetSize
        );
        ctx.imageSmoothingEnabled = previousSmoothing;
        return true;
    }

    // Retro-styled bar with label on the left
    private drawRetroBar(
        ctx: CanvasRenderingContext2D,
        label: string,
        labelX: number, barX: number, y: number,
        w: number, h: number, pct: number,
        color: string, bg: string,
        valueText?: string, glow?: boolean
    ): void {
        // Label
        ctx.fillStyle = TEXT_DARK;
        ctx.font = `bold 12px "DOSMyungjo", sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX, y + h / 2);

        // Bar background
        ctx.fillStyle = bg;
        ctx.fillRect(barX, y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, y, w, h);

        // Bar fill
        if (pct > 0) {
            if (glow) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
            }
            ctx.fillStyle = color;
            ctx.fillRect(barX + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, pct)), h - 2);
            ctx.shadowBlur = 0;
        }

        // Value text
        if (valueText) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold 10px ${UI.fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText(valueText, barX + w / 2, y + h / 2);
            ctx.textAlign = 'start';
        }
        ctx.textBaseline = 'alphabetic';
    }
}
