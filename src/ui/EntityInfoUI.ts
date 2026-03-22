/**
 * EntityInfoUI — Retro-warm info window with modern bar polish.
 * Parchment-tinted glass panel with dark grid portrait area,
 * preserving the classic Darksaber feel while using modern animations.
 */

import { UI, isCloseButtonHit, Parchment, drawParchmentPanel } from './UITheme';

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
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spriteColor: string;
    spriteImage?: HTMLImageElement;  // character portrait image
}

// ─── LIGHT PARCHMENT (unified) ───────────────────────────
const TEXT_DARK    = Parchment.textDark;
const GRID_BG      = '#1a1a2e';
const GRID_CELL    = '#2a2a4a';

export class EntityInfoUI {
    private x = 16;
    private y = 180;
    private w = 210;
    private h = 320;

    /** Allow dynamic repositioning from GameEngine */
    public setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    // Flash timer for ATB
    private flashTime = 0;
    private closeHovered = false;

    // Smooth bar lerp targets
    private displayHp = -1;
    private displayMp = -1;
    private displayAtb = -1;

    public onMouseMove(mx: number, my: number): void {
        const cx = this.x + this.w - 16;
        const cy = this.y + 16;
        this.closeHovered = isCloseButtonHit(mx, my, cx, cy);
    }

    public onClick(mx: number, my: number): boolean {
        const cx = this.x + this.w - 16;
        const cy = this.y + 16;
        return isCloseButtonHit(mx, my, cx, cy);
    }

    public render(ctx: CanvasRenderingContext2D, info: EntityDisplayInfo): void {
        this.flashTime += 0.05;

        // Lerp bars for smooth animation
        if (this.displayHp < 0) this.displayHp = info.hp;
        if (this.displayMp < 0) this.displayMp = info.mp;
        if (this.displayAtb < 0) this.displayAtb = info.actionGauge;
        this.displayHp += (info.hp - this.displayHp) * 0.12;
        this.displayMp += (info.mp - this.displayMp) * 0.12;
        this.displayAtb += (info.actionGauge - this.displayAtb) * 0.15;

        ctx.save();

        // ── Light parchment panel ──
        drawParchmentPanel(ctx, this.x, this.y, this.w, this.h);

        // ── Close button (retro red circle with X) ──
        const closeX = this.x + this.w - 20;
        const closeY = this.y + 14;
        ctx.beginPath();
        ctx.arc(closeX, closeY, 10, 0, Math.PI * 2);
        ctx.fillStyle = this.closeHovered ? '#cc3333' : '#a03030';
        ctx.fill();
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px "DOSMyungjo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', closeX, closeY);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'start';

        // ── Header: Name & Level ──
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 15px ${UI.fontPrimary}`;
        ctx.textBaseline = 'top';
        ctx.fillText(info.className || info.name, this.x + 12, this.y + 10);
        ctx.font = `12px ${UI.fontMono}`;
        ctx.fillStyle = Parchment.textMid;
        ctx.fillText(`[ 레벨 ${info.level} ]`, this.x + 12, this.y + 28);

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

        // Draw buffs (up to 7 icons)
        if (info.buffs && info.buffs.length > 0) {
            // Buffer slots in order: top row (4), left col (2), right col (1)
            const buffSlots = [
                {c: 0, r: 0}, {c: 1, r: 0}, {c: 2, r: 0}, {c: 3, r: 0},
                {c: 0, r: 1}, {c: 0, r: 2}, {c: 3, r: 1}
            ];
            ctx.font = '14px "DOSMyungjo", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < Math.min(info.buffs.length, buffSlots.length); i++) {
                const slot = buffSlots[i];
                const icon = info.buffs[i];
                const cx = gridX + slot.c * cellSize + cellSize / 2;
                const cy = gridY + slot.r * cellSize + cellSize / 2;
                ctx.fillText(icon, cx, cy);
            }
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }

        // Character sprite in center of grid
        const spriteCenterX = gridX + (cols * cellSize) / 2;
        const spriteCenterY = gridY + (rows * cellSize) / 2;
        if (info.spriteImage && info.spriteImage.complete && info.spriteImage.naturalWidth > 0) {
            // Draw character portrait image
            const imgSize = Math.min(cols * cellSize - 8, rows * cellSize - 8, 48);
            ctx.drawImage(
                info.spriteImage,
                spriteCenterX - imgSize / 2, spriteCenterY - imgSize / 2,
                imgSize, imgSize
            );
        } else {
            // Fallback: colored square
            ctx.fillStyle = info.spriteColor;
            ctx.fillRect(spriteCenterX - 12, spriteCenterY - 12, 24, 24);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(spriteCenterX - 12, spriteCenterY - 12, 24, 24);
        }

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

        // ATB / 행동
        const isFullATB = info.actionGauge >= 100;
        let atbColor = '#e67e22';
        let atbGlow = false;
        if (isFullATB) {
            const pulse = (Math.sin(this.flashTime * 3) + 1) / 2;
            atbColor = `rgba(57, 255, 20, ${Math.min(1, pulse + 0.4)})`;
            atbGlow = true;
        }
        const atbPct = Math.min(1, this.displayAtb / 100);
        this.drawRetroBar(ctx, '행동', barLabelX, barX, by, barW, barH, atbPct, atbColor, 'rgba(0,0,0,0.5)',
            isFullATB ? '준비!' : undefined, atbGlow);
        by += barH + 6;

        // HP / 체력
        const hpPct = info.maxHp > 0 ? this.displayHp / info.maxHp : 0;
        this.drawRetroBar(ctx, '체력', barLabelX, barX, by, barW, barH, hpPct, '#e53935', 'rgba(0,0,0,0.3)',
            `${Math.ceil(this.displayHp)}/${info.maxHp}`);
        by += barH + 6;

        // MP / 마법
        const mpPct = info.maxMp > 0 ? this.displayMp / info.maxMp : 0;
        this.drawRetroBar(ctx, '마법', barLabelX, barX, by, barW, barH, mpPct, '#f0c040', 'rgba(0,0,0,0.3)',
            info.maxMp > 0 ? `${Math.ceil(this.displayMp)}/${info.maxMp}` : '—');
        by += barH + 6;

        // EXP / 경험
        if (info.maxExp !== undefined && info.exp !== undefined) {
            const expPct = info.maxExp > 0 ? info.exp / info.maxExp : 0;
            this.drawRetroBar(ctx, '경험', barLabelX, barX, by, barW, barH, expPct, '#88ee44', 'rgba(0,0,0,0.3)',
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
        ctx.fillText('공격', this.x + statPad + 4, by + 16);
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
        ctx.fillText('방어', this.x + statPad + boxW + 12, by + 16);
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
        ctx.fillText('마공', this.x + statPad + 4, by + 16);
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
        ctx.fillText('마방', this.x + statPad + boxW + 12, by + 16);
        ctx.font = `bold 13px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(info.magDef)}`, this.x + statPad + boxW * 2 + 2, by + 16);
        ctx.textAlign = 'start';

        ctx.restore();
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
