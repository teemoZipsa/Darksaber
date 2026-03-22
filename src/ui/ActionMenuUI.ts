/**
 * ActionMenuUI — Modern radial action menu with circular glass-style slots.
 * Appears around the player character when clicked during raid.
 * Icons are colored when ATB is full, subtly muted when not.
 */

import { TILE_SIZE } from '../map/Chunk';
import { UI } from './UITheme';

export type ActionType = 'tool' | 'attack' | 'emote' | 'rest' | 'magic' | 'move' | 'open';

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
    private menuRadius = 52;
    private iconRadius = 18;

    private centerX = 0;
    private centerY = 0;
    private hoveredSlot: ActionType | null = null;

    constructor() {
        const TAU = Math.PI * 2;
        this.slots = [
            { type: 'tool',   label: '도구', angle: 0,           iconDraw: this.drawToolIcon },
            { type: 'attack', label: '공격', angle: TAU / 6,     iconDraw: this.drawAttackIcon },
            { type: 'emote',  label: '감정', angle: TAU * 2 / 6, iconDraw: this.drawEmoteIcon },
            { type: 'rest',   label: '휴식', angle: TAU * 3 / 6, iconDraw: this.drawRestIcon },
            { type: 'magic',  label: '마법', angle: TAU * 4 / 6, iconDraw: this.drawMagicIcon },
            { type: 'move',   label: '이동', angle: TAU * 5 / 6, iconDraw: this.drawMoveIcon },
            { type: 'open',   label: '조사', angle: 0,           iconDraw: this.drawOpenIcon },
        ];
        this.activeSlots = [...this.slots];
    }

    public open(available?: ActionType[]): void {
        this.isOpen = true;
        if (available && available.length > 0) {
            this.activeSlots = this.slots.filter(s => available.includes(s.type));
        } else {
            // Default: all except 'open'
            this.activeSlots = this.slots.filter(s => s.type !== 'open');
        }
        
        // Distribute angles evenly
        const TAU = Math.PI * 2;
        const count = this.activeSlots.length;
        this.activeSlots.forEach((s, idx) => {
            s.angle = (TAU / count) * idx;
        });
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
            if (Math.hypot(mx - ix, my - iy) <= this.iconRadius + 4) {
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
            if (Math.hypot(mx - ix, my - iy) <= this.iconRadius + 4) {
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

        // Blurred backdrop circle (simulated with layered transparency)
        const outerR = this.menuRadius + this.iconRadius + 12;
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, outerR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8, 10, 20, 0.6)';
        ctx.fill();
        ctx.strokeStyle = UI.borderSubtle;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw each slot
        for (const slot of this.activeSlots) {
            const ix = this.centerX + Math.sin(slot.angle) * this.menuRadius;
            const iy = this.centerY - Math.cos(slot.angle) * this.menuRadius;
            const isHovered = this.hoveredSlot === slot.type;
            const r = isHovered ? this.iconRadius + 2 : this.iconRadius;

            ctx.beginPath();
            ctx.arc(ix, iy, r, 0, Math.PI * 2);

            if (isReady) {
                if (isHovered) {
                    ctx.fillStyle = 'rgba(240, 192, 80, 0.25)';
                    ctx.shadowColor = UI.textAccent;
                    ctx.shadowBlur = 10;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                }
                ctx.fill();
                ctx.strokeStyle = isHovered ? UI.borderAccentBright : UI.borderAccent;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            }
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw icon
            slot.iconDraw(ctx, ix, iy, r * 0.5, isReady);

            // Label — only on hover
            if (isHovered) {
                ctx.fillStyle = isReady ? UI.textAccent : UI.textSecondary;
                ctx.font = `10px ${UI.fontPrimary}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(slot.label, ix, iy + r + 4);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }
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

        // Tiny boot/shoe icon
        ctx.fillStyle = UI.textAccent;
        ctx.fillRect(bx - 4 * s, by - 1 * s, 6 * s, 2 * s);
        ctx.fillRect(bx - 4 * s, by - 4 * s, 2 * s, 3 * s);
        ctx.fillRect(bx - 2 * s, by - 3 * s, 4 * s, 2 * s);

        // Subtle glow
        ctx.shadowColor = UI.textAccent;
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(240, 192, 80, 0.2)';
        ctx.fillRect(bx - 5 * s, by - 5 * s, 8 * s, 7 * s);
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    // ─── ICON DRAWING FUNCTIONS ────────────────────────────────

    private drawToolIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        const c = ready ? '#d4a040' : 'rgba(255,255,255,0.25)';
        ctx.fillStyle = c;
        ctx.fillRect(cx - s * 0.5, cy - s * 0.2, s * 1.0, s * 0.8);
        ctx.fillRect(cx - s * 0.3, cy - s * 0.6, s * 0.6, s * 0.4);
    }

    private drawAttackIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
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

    private drawEmoteIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        ctx.fillStyle = ready ? '#f0c080' : 'rgba(255,255,255,0.25)';
        ctx.fillRect(cx - s * 0.2, cy, s * 0.4, s * 0.4);
        ctx.fillRect(cx - s * 0.2, cy - s * 0.7, s * 0.12, s * 0.7);
        ctx.fillRect(cx + s * 0.08, cy - s * 0.7, s * 0.12, s * 0.7);
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

    private drawMagicIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
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
        ctx.fillStyle = ready ? '#cc8844' : 'rgba(255,255,255,0.25)';
        ctx.fillRect(cx - s * 0.4, cy + s * 0.2, s * 0.8, s * 0.25);
        ctx.fillRect(cx - s * 0.4, cy - s * 0.3, s * 0.25, s * 0.5);
        ctx.fillRect(cx - s * 0.15, cy - s * 0.05, s * 0.55, s * 0.25);
    }

    private drawOpenIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        ctx.font = `${s * 2}px "DOSMyungjo", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.fillText('🔍', cx, cy + 2);
    }
}
