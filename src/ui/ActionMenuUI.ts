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

export interface ActionMenuSlotState {
    type: ActionType;
    enabled: boolean;
    costLabel?: string;
    disabledReason?: string;
}

export interface ActionMenuClickResult {
    type: ActionType;
    enabled: boolean;
    disabledReason?: string;
}

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
    private slotStates = new Map<ActionType, ActionMenuSlotState>();
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
        this.setDefaultSlotStates();
    }

    public open(states?: ActionMenuSlotState[] | ActionType[]): void {
        this.isOpen = true;
        if (!states || states.length === 0) {
            this.setDefaultSlotStates();
            return;
        }

        if (typeof states[0] === 'string') {
            const available = new Set(states as ActionType[]);
            this.slotStates.clear();
            for (const slot of this.slots) {
                this.slotStates.set(slot.type, {
                    type: slot.type,
                    enabled: available.has(slot.type),
                });
            }
            return;
        }

        this.slotStates.clear();
        for (const state of states as ActionMenuSlotState[]) {
            this.slotStates.set(state.type, { ...state });
        }
        for (const slot of this.slots) {
            if (!this.slotStates.has(slot.type)) {
                this.slotStates.set(slot.type, { type: slot.type, enabled: true });
            }
        }
    }

    public close(): void { this.isOpen = false; this.hoveredSlot = null; }
    public toggle(states?: ActionMenuSlotState[] | ActionType[]): void {
        if (this.isOpen) this.close();
        else this.open(states);
    }
    public getIsOpen(): boolean { return this.isOpen; }

    public onMouseMove(mx: number, my: number): void {
        if (!this.isOpen) { this.hoveredSlot = null; return; }
        this.hoveredSlot = null;
        for (const slot of this.slots) {
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            if (Math.hypot(mx - ix, my - iy) <= this.hitRadius) {
                this.hoveredSlot = slot.type;
                break;
            }
        }
    }

    public onClick(mx: number, my: number): ActionMenuClickResult | null {
        if (!this.isOpen) return null;
        for (const slot of this.slots) {
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            if (Math.hypot(mx - ix, my - iy) <= this.hitRadius) {
                const state = this.getSlotState(slot.type);
                return {
                    type: slot.type,
                    enabled: state.enabled,
                    disabledReason: state.disabledReason,
                };
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
        for (const slot of this.slots) {
            const state = this.getSlotState(slot.type);
            const enabled = isReady && state.enabled;
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            const isHovered = this.hoveredSlot === slot.type;
            const r = this.iconRadius;

            ctx.beginPath();
            ctx.arc(ix, iy, r, 0, Math.PI * 2);

            if (enabled) {
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
                ctx.fillStyle = isHovered ? 'rgba(40, 30, 28, 0.68)' : 'rgba(18, 20, 24, 0.5)';
                ctx.fill();
                ctx.strokeStyle = isHovered ? 'rgba(228, 63, 90, 0.6)' : 'rgba(245, 232, 204, 0.32)';
                ctx.lineWidth = isHovered ? 1.5 : 1;
            }
            ctx.shadowBlur = 0;
            ctx.stroke();

            // Draw icon
            slot.iconDraw(ctx, ix, iy, r * 0.5, enabled);

            if (state.costLabel) {
                ctx.font = `bold 9px ${UI.fontMono}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
                ctx.strokeText(state.costLabel, ix, iy - r - 8);
                ctx.fillStyle = enabled ? '#f0c050' : 'rgba(245, 232, 204, 0.42)';
                ctx.fillText(state.costLabel, ix, iy - r - 8);
            }

            ctx.font = `bold 11px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
            ctx.strokeText(slot.label, ix, iy + r + 10);
            ctx.fillStyle = enabled
                ? (isHovered ? '#ffe3a0' : '#f7ead2')
                : (isHovered ? '#f0a0a8' : 'rgba(247, 234, 210, 0.46)');
            ctx.fillText(slot.label, ix, iy + r + 10);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }

        this.renderHoveredDisabledReason(ctx);

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

    private setDefaultSlotStates(): void {
        this.slotStates.clear();
        for (const slot of this.slots) {
            this.slotStates.set(slot.type, { type: slot.type, enabled: true });
        }
    }

    private getSlotState(type: ActionType): ActionMenuSlotState {
        return this.slotStates.get(type) ?? { type, enabled: true };
    }

    private renderHoveredDisabledReason(ctx: CanvasRenderingContext2D): void {
        if (!this.hoveredSlot) return;
        const state = this.getSlotState(this.hoveredSlot);
        if (state.enabled || !state.disabledReason) return;

        ctx.font = `bold 11px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = state.disabledReason;
        const w = Math.min(210, ctx.measureText(text).width + 18);
        const x = this.centerX - w / 2;
        const y = this.centerY + this.menuRadius + 38;

        ctx.fillStyle = 'rgba(18, 12, 12, 0.88)';
        ctx.fillRect(x, y, w, 24);
        ctx.strokeStyle = 'rgba(228, 63, 90, 0.72)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, 24);
        ctx.fillStyle = '#ffd6d6';
        ctx.fillText(text, this.centerX, y + 12);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

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
        if (ActionMenuUI.drawActionIconCell(ctx, 'rest', cx, cy, s, ready)) return;
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
