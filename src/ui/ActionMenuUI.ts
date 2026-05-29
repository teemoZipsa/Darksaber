/**
 * ActionMenuUI — lightweight radial action menu with fixed icon slots.
 * Appears around the player character when clicked during raid.
 * Icons are colored when ATB is full, subtly muted when not.
 */

import { TILE_SIZE } from '../map/Chunk';
import { ACTION_ICON_CELLS } from './DarksaberIconRegistry';
import { DarksaberSpriteAtlas } from './DarksaberSpriteAtlas';
import { UI, Parchment } from './UITheme';

export type ActionType = 'tool' | 'attack' | 'rest' | 'defend' | 'magic' | 'move' | 'open';

export function normalizeLegacyActionType(action: string): ActionType | null {
    if (action === 'counter') return 'defend';
    if (
        action === 'tool' ||
        action === 'attack' ||
        action === 'rest' ||
        action === 'defend' ||
        action === 'magic' ||
        action === 'move' ||
        action === 'open'
    ) {
        return action;
    }
    return null;
}

interface ActionSlot {
    type: ActionType;
    label: string;
    angle: number;
    iconDraw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean) => void;
}

export class ActionMenuUI {
    private isOpen = false;
    private slots: ActionSlot[];
    private activeSlots: ActionSlot[] = [];
    private readonly menuRadius = 58;
    private readonly iconRadius = 18;
    private readonly hitRadius = 22;

    private centerX = 0;
    private centerY = 0;
    private hoveredSlot: ActionType | null = null;

    constructor() {
        const TAU = Math.PI * 2;
        this.slots = [
            { type: 'attack', label: '공격', angle: TAU / 4,     iconDraw: this.drawAttackIcon },
            { type: 'magic',  label: '마법', angle: TAU / 8,     iconDraw: this.drawMagicIcon },
            { type: 'tool',   label: '도구', angle: TAU * 3 / 8, iconDraw: this.drawToolIcon },
            { type: 'open',   label: '조사', angle: TAU / 2,     iconDraw: this.drawOpenIcon },
            { type: 'rest',   label: '휴식', angle: TAU * 5 / 8, iconDraw: this.drawRestIcon },
            { type: 'defend', label: '방어', angle: TAU * 3 / 4, iconDraw: this.drawDefendIcon },
            { type: 'move',   label: '이동', angle: TAU * 7 / 8, iconDraw: this.drawMoveIcon },
        ];
        this.activeSlots = [...this.slots];
    }

    public open(available?: ActionType[]): void {
        this.isOpen = true;
        if (available && available.length > 0) {
            this.activeSlots = this.slots.filter(s => available.includes(s.type));
        } else {
            this.activeSlots = this.slots;
        }
    }

    public close(): void { this.isOpen = false; this.hoveredSlot = null; }
    public toggle(available?: ActionType[]): void { 
        if (this.isOpen) this.close();
        else this.open(available);
    }
    public getIsOpen(): boolean { return this.isOpen; }

    public onMouseMove(mx: number, my: number): void {
        if (!this.isOpen) { this.hoveredSlot = null; return; }
        this.hoveredSlot = null;
        for (const slot of this.activeSlots) {
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            if (Math.hypot(mx - ix, my - iy) <= this.hitRadius) {
                this.hoveredSlot = slot.type;
                break;
            }
        }
    }

    public onClick(mx: number, my: number): ActionType | null {
        if (!this.isOpen) return null;
        for (const slot of this.activeSlots) {
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            if (Math.hypot(mx - ix, my - iy) <= this.hitRadius) {
                return slot.type;
            }
        }
        return null;
    }

    public render(
        ctx: CanvasRenderingContext2D,
        playerScreenX: number,
        playerScreenY: number,
        isReady: boolean
    ): void {
        if (!this.isOpen) return;

        this.centerX = playerScreenX + TILE_SIZE / 2;
        this.centerY = playerScreenY + TILE_SIZE / 2;

        ctx.save();

        // Draw each slot
        for (const slot of this.activeSlots) {
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            const isHovered = this.hoveredSlot === slot.type;
            const r = this.iconRadius;

            ctx.beginPath();
            ctx.arc(ix, iy, r, 0, Math.PI * 2);

            if (isReady) {
                if (isHovered) {
                    ctx.fillStyle = 'rgba(36, 31, 24, 0.92)';
                    ctx.shadowColor = Parchment.borderGold;
                    ctx.shadowBlur = 9;
                } else {
                    ctx.fillStyle = 'rgba(18, 20, 24, 0.82)';
                }
                ctx.fill();
                ctx.strokeStyle = isHovered ? Parchment.borderGold : 'rgba(245, 232, 204, 0.82)';
                ctx.lineWidth = isHovered ? 2 : 1.5;
            } else {
                ctx.fillStyle = 'rgba(18, 20, 24, 0.5)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(245, 232, 204, 0.32)';
                ctx.lineWidth = 1;
            }
            ctx.shadowBlur = 0;
            ctx.stroke();

            // Draw icon
            slot.iconDraw(ctx, ix, iy, r * 0.5, isReady);

            ctx.font = `bold 11px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
            ctx.strokeText(slot.label, ix, iy + r + 10);
            ctx.fillStyle = isHovered ? '#ffe3a0' : '#f7ead2';
            ctx.fillText(slot.label, ix, iy + r + 10);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }

        ctx.restore();
    }

    /**
     * Render the shoe/boot ready indicator near the player sprite.
     */
    public renderReadyIndicator(
        ctx: CanvasRenderingContext2D,
        playerScreenX: number,
        playerScreenY: number
    ): void {
        const bx = playerScreenX + TILE_SIZE + 2;
        const by = playerScreenY + TILE_SIZE - 4;
        const s = 1.5;

        ctx.save();
        ctx.globalAlpha = 0.85;

        // Tiny boot/shoe icon — burnished gold for "ready"
        ctx.fillStyle = '#c8922a';
        ctx.fillRect(bx - 4 * s, by - 1 * s, 6 * s, 2 * s);
        ctx.fillRect(bx - 4 * s, by - 4 * s, 2 * s, 3 * s);
        ctx.fillRect(bx - 2 * s, by - 3 * s, 4 * s, 2 * s);

        // Subtle glow
        ctx.shadowColor = '#c8922a';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(200, 146, 42, 0.25)';
        ctx.fillRect(bx - 5 * s, by - 5 * s, 8 * s, 7 * s);
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    // ─── ICON DRAWING FUNCTIONS ────────────────────────────────

    private static drawActionIconCell(
        ctx: CanvasRenderingContext2D,
        type: ActionType,
        cx: number,
        cy: number,
        s: number,
        ready: boolean
    ): boolean {
        const iconCell = ACTION_ICON_CELLS[type];
        if (!iconCell) return false;

        const iconSize = Math.max(18, s * 2.35);
        return DarksaberSpriteAtlas.drawIconCell(
            ctx,
            iconCell.col,
            iconCell.row,
            cx - iconSize / 2,
            cy - iconSize / 2,
            iconSize,
            { alpha: ready ? 1 : 0.35 }
        );
    }

    private drawToolIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'tool', cx, cy, s, ready)) return;
        const c = ready ? '#d4a040' : 'rgba(255,255,255,0.25)';
        ctx.fillStyle = c;
        ctx.fillRect(cx - s * 0.5, cy - s * 0.2, s * 1.0, s * 0.8);
        ctx.fillRect(cx - s * 0.3, cy - s * 0.6, s * 0.6, s * 0.4);
    }

    private drawAttackIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'attack', cx, cy, s, ready)) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = ready ? '#ddd' : 'rgba(255,255,255,0.25)';
        ctx.fillRect(-s * 0.08, -s * 0.8, s * 0.16, s * 1.0);
        ctx.fillStyle = ready ? '#cc8800' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(-s * 0.3, s * 0.15, s * 0.6, s * 0.1);
        ctx.fillStyle = ready ? '#8b4513' : 'rgba(255,255,255,0.1)';
        ctx.fillRect(-s * 0.08, s * 0.25, s * 0.16, s * 0.4);
        ctx.restore();
    }

    private drawRestIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        ctx.fillStyle = ready ? '#88ccff' : 'rgba(255,255,255,0.25)';
        ctx.font = `bold ${s * 1.2}px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Z', cx + s * 0.15, cy - s * 0.1);
        ctx.font = `bold ${s * 0.7}px ${UI.fontMono}`;
        ctx.fillText('z', cx - s * 0.2, cy + s * 0.4);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private drawDefendIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'defend', cx, cy, s, ready)) return;
        ctx.fillStyle = ready ? '#8fc7ff' : 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.75);
        ctx.lineTo(cx + s * 0.55, cy - s * 0.35);
        ctx.lineTo(cx + s * 0.42, cy + s * 0.55);
        ctx.lineTo(cx, cy + s * 0.8);
        ctx.lineTo(cx - s * 0.42, cy + s * 0.55);
        ctx.lineTo(cx - s * 0.55, cy - s * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ready ? '#eaf6ff' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = Math.max(1, s * 0.12);
        ctx.stroke();
    }

    private drawMagicIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'magic', cx, cy, s, ready)) return;
        ctx.fillStyle = ready ? '#44ff88' : 'rgba(255,255,255,0.25)';
        ctx.fillRect(cx - s * 0.08, cy - s * 0.6, s * 0.16, s * 1.2);
        ctx.fillRect(cx - s * 0.6, cy - s * 0.08, s * 1.2, s * 0.16);
        // Sparkle dots
        const d = s * 0.35;
        ctx.fillRect(cx - d, cy - d, s * 0.1, s * 0.1);
        ctx.fillRect(cx + d - s * 0.1, cy - d, s * 0.1, s * 0.1);
        ctx.fillRect(cx - d, cy + d - s * 0.1, s * 0.1, s * 0.1);
        ctx.fillRect(cx + d - s * 0.1, cy + d - s * 0.1, s * 0.1, s * 0.1);
    }

    private drawMoveIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'move', cx, cy, s, ready)) return;
        ctx.fillStyle = ready ? '#cc8844' : 'rgba(255,255,255,0.25)';
        ctx.fillRect(cx - s * 0.4, cy + s * 0.2, s * 0.8, s * 0.25);
        ctx.fillRect(cx - s * 0.4, cy - s * 0.3, s * 0.25, s * 0.5);
        ctx.fillRect(cx - s * 0.15, cy - s * 0.05, s * 0.55, s * 0.25);
    }

    private drawOpenIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'open', cx, cy, s, ready)) return;
        ctx.font = `${s * 2}px "DOSMyungjo", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.fillText('🔍', cx, cy + 2);
    }
}
