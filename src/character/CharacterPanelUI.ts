/**
 * CharacterPanelUI — modern redesign of the Dark Saver character window.
 * Shows active character at top with full stats, and a grid of party members below.
 * Click any character to instantly switch.
 * Toggle with 'C' key.
 */

import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { t } from '../i18n/LanguageManager';

const CARD_W = 280;
const CARD_H = 90;
const MINI_W = 130;
const MINI_H = 62;
const PAD = 10;
const PANEL_BG = 'rgba(10, 12, 20, 0.94)';
const ACCENT = '#00e5ff';
const ACCENT_DIM = 'rgba(0, 229, 255, 0.3)';

export class CharacterPanelUI {
    private party: PartyManager;
    private visible: boolean = false;
    private hoverIndex: number = -1;

    // Layout
    private panelX = 0;
    private panelY = 0;
    private panelW = 0;
    private panelH = 0;
    private slotRects: { x: number; y: number; w: number; h: number; idx: number }[] = [];

    constructor(party: PartyManager) {
        this.party = party;
    }

    public toggle(): void { this.visible = !this.visible; }
    public isVisible(): boolean { return this.visible; }

    public onMouseMove(sx: number, sy: number): void {
        if (!this.visible) return;
        this.hoverIndex = -1;
        for (const rect of this.slotRects) {
            if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) {
                this.hoverIndex = rect.idx;
                break;
            }
        }
    }

    /** Returns true if a character was switched */
    public onClick(sx: number, sy: number): boolean {
        if (!this.visible || this.hoverIndex < 0) return false;
        // Check within panel bounds
        for (const rect of this.slotRects) {
            if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) {
                return this.party.switchTo(rect.idx);
            }
        }
        return false;
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;
        this.slotRects = [];

        const chars = this.party.getCharacters();
        const activeIdx = this.party.getActiveIndex();

        // Calculate panel size
        const gridCols = 3;
        const otherCount = chars.length; // all chars including active
        const gridRows = Math.ceil(Math.max(otherCount - 1, 0) / gridCols);
        this.panelW = Math.max(CARD_W + PAD * 2, gridCols * (MINI_W + PAD) + PAD);
        this.panelH = 50 + CARD_H + PAD + (gridRows > 0 ? gridRows * (MINI_H + PAD) + PAD + 24 : 0) + PAD;
        this.panelX = Math.floor((canvasW - this.panelW) / 2);
        this.panelY = Math.floor((canvasH - this.panelH) / 2);

        // Backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Panel
        ctx.fillStyle = PANEL_BG;
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.lineWidth = 2;
        this.roundRect(ctx, this.panelX, this.panelY, this.panelW, this.panelH, 12);

        // Title
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('char.partyTitle'), this.panelX + this.panelW / 2, this.panelY + 30);
        ctx.textAlign = 'start';

        // ─── Active Character Card (top) ───
        if (chars.length > 0) {
            const active = chars[activeIdx];
            const cardX = this.panelX + (this.panelW - CARD_W) / 2;
            const cardY = this.panelY + 45;
            this.renderActiveCard(ctx, active, cardX, cardY, activeIdx);
        }

        // ─── Party Grid (below) ───
        if (chars.length > 1) {
            const gridY = this.panelY + 45 + CARD_H + PAD + 4;

            ctx.fillStyle = '#666';
            ctx.font = '11px Inter, sans-serif';
            ctx.fillText(t('char.partyList'), this.panelX + PAD, gridY);

            let col = 0;
            let row = 0;
            for (let i = 0; i < chars.length; i++) {
                if (i === activeIdx) continue; // skip active (shown above)
                const mx = this.panelX + PAD + col * (MINI_W + PAD);
                const my = gridY + 14 + row * (MINI_H + PAD);
                this.renderMiniCard(ctx, chars[i], mx, my, i);

                col++;
                if (col >= gridCols) { col = 0; row++; }
            }
        }

        // Empty slot hints
        if (chars.length < this.party.MAX_ACTIVE_PARTY_SIZE) {
            ctx.fillStyle = 'rgba(100,100,100,0.3)';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${chars.length}/${this.party.MAX_ACTIVE_PARTY_SIZE} ${t('char.slotsUsed')}`, this.panelX + this.panelW / 2, this.panelY + this.panelH - 12);
            ctx.textAlign = 'start';
        }
    }

    private renderActiveCard(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number, idx: number): void {
        // Card background with glow
        ctx.fillStyle = 'rgba(0, 40, 60, 0.8)';
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        this.roundRect(ctx, x, y, CARD_W, CARD_H, 8);

        // "ACTIVE" badge
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(t('char.active'), x + 8, y + 14);

        // Character avatar circle
        const avX = x + 40;
        const avY = y + 48;
        ctx.beginPath();
        ctx.arc(avX, avY, 22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️', avX, avY + 7);
        ctx.textAlign = 'start';

        // Name + class info
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px Inter, sans-serif';
        ctx.fillText(char.name, x + 72, y + 35);

        ctx.fillStyle = '#aaa';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(`${char.getTierName()} (Tier ${char.currentTier})`, x + 72, y + 52);
        ctx.fillText(`Lv.${char.level}`, x + 72, y + 67);

        // Mini stat bars
        const barX = x + 150;
        const barW = 110;
        this.renderStatBar(ctx, barX, y + 28, barW, 'HP', char.stats.hp, char.stats.maxHp, '#e53935');
        this.renderStatBar(ctx, barX, y + 44, barW, 'MP', char.stats.mp, char.stats.maxMp, '#1e88e5');
        this.renderStatBar(ctx, barX, y + 60, barW, 'EXP', char.exp, char.expToNext, '#ffb300');

        this.slotRects.push({ x, y, w: CARD_W, h: CARD_H, idx });
    }

    private renderMiniCard(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number, idx: number): void {
        const isHover = this.hoverIndex === idx;

        ctx.fillStyle = isHover ? 'rgba(0, 60, 80, 0.8)' : 'rgba(25, 30, 45, 0.8)';
        ctx.strokeStyle = isHover ? ACCENT : 'rgba(60, 70, 90, 0.6)';
        ctx.lineWidth = isHover ? 2 : 1;
        this.roundRect(ctx, x, y, MINI_W, MINI_H, 6);

        // Small avatar
        ctx.beginPath();
        ctx.arc(x + 20, y + MINI_H / 2, 14, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? ACCENT_DIM : 'rgba(60, 70, 90, 0.5)';
        ctx.fill();
        ctx.fillStyle = '#ddd';
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️', x + 20, y + MINI_H / 2 + 5);
        ctx.textAlign = 'start';

        // Name
        ctx.fillStyle = isHover ? '#fff' : '#ccc';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(char.name, x + 40, y + 20);

        // Class + level
        ctx.fillStyle = '#888';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(`${char.getTierName()} Lv.${char.level}`, x + 40, y + 35);

        // Tiny HP bar
        const hpRatio = char.stats.hp / char.stats.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + 40, y + 42, 78, 4);
        ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : '#ff9800';
        ctx.fillRect(x + 40, y + 42, 78 * hpRatio, 4);

        // Click hint on hover
        if (isHover) {
            ctx.fillStyle = ACCENT;
            ctx.font = '9px Inter, sans-serif';
            ctx.fillText(t('char.switch'), x + 40, y + 56);
        }

        this.slotRects.push({ x, y, w: MINI_W, h: MINI_H, idx });
    }

    private renderStatBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, current: number, max: number, color: string): void {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x, y, w, 10);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w * (current / max), 10);
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.fillText(`${label} ${Math.floor(current)}/${max}`, x + 3, y + 8);
    }

    private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}
