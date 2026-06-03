/**
 * FieldMagicMenu — radial in-combat magic selector.
 *
 * Replaces the old centered MagicUI list. Shows the active character's equipped
 * skills (up to 8) in a ring around the unit, mirroring ActionMenuUI's geometry,
 * coordinate space and input mapping (mouse coords divided by camera.zoom).
 * Disabled slots (low MP, silence, no AP) are dimmed and show a reason on hover.
 */

import { TILE_SIZE } from '../map/Chunk';
import type { Skill } from '../data/SkillDB';
import { UI, Parchment } from './UITheme';

export interface FieldMagicSlot {
    skill: Skill;
    /** Upgrade level 1..5 (badge shown when > 1). */
    level: number;
    enabled: boolean;
    disabledReason?: string;
}

export type FieldMagicClickResult =
    | { kind: 'select'; index: number }
    | { kind: 'cancel' };

export class FieldMagicMenu {
    private open = false;
    private slots: FieldMagicSlot[] = [];
    private hoveredIndex: number | null = null;

    private readonly menuRadius = 82;
    private readonly iconRadius = 23;
    private readonly hitHalfSize = 22;

    private centerX = 0;
    private centerY = 0;

    public show(slots: FieldMagicSlot[]): void {
        this.slots = slots;
        this.hoveredIndex = null;
        this.open = true;
    }

    public hide(): void {
        this.open = false;
        this.hoveredIndex = null;
        this.slots = [];
    }

    public isVisible(): boolean {
        return this.open;
    }

    public getSlotCount(): number {
        return this.slots.length;
    }

    public getSlot(index: number): FieldMagicSlot | undefined {
        return this.slots[index];
    }

    public onMouseMove(mx: number, my: number): void {
        if (!this.open) { this.hoveredIndex = null; return; }
        this.hoveredIndex = this.hitSlotIndex(mx, my);
    }

    public onMouseUp(): void {
        /* no drag behaviour; kept for API parity with the old MagicUI */
    }

    /** Map a click to a slot select / cancel. Misses (outside any slot) cancel. */
    public onClick(mx: number, my: number): FieldMagicClickResult {
        if (!this.open) return { kind: 'cancel' };
        const index = this.hitSlotIndex(mx, my);
        if (index === null) return { kind: 'cancel' };
        return { kind: 'select', index };
    }

    /** Digit 1..8 → slot index, or null if no such slot. */
    public indexForDigit(digit: number): number | null {
        const index = digit - 1;
        return index >= 0 && index < this.slots.length ? index : null;
    }

    public render(ctx: CanvasRenderingContext2D, playerScreenX: number, playerScreenY: number): void {
        if (!this.open) return;

        this.centerX = playerScreenX + TILE_SIZE / 2;
        this.centerY = playerScreenY + TILE_SIZE / 2;

        ctx.save();
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const { x, y } = this.slotPosition(i);
            const hovered = this.hoveredIndex === i;
            this.drawSlot(ctx, slot, x, y, hovered, i);
        }
        this.renderHoveredDetail(ctx);
        ctx.restore();
    }

    private slotPosition(index: number): { x: number; y: number } {
        const count = Math.max(1, this.slots.length);
        const angle = (Math.PI * 2 * index) / count;
        return {
            x: this.centerX + Math.sin(angle) * this.menuRadius,
            y: this.centerY - Math.cos(angle) * this.menuRadius,
        };
    }

    private hitSlotIndex(mx: number, my: number): number | null {
        for (let i = 0; i < this.slots.length; i++) {
            const { x, y } = this.slotPosition(i);
            if (Math.abs(mx - x) <= this.hitHalfSize && Math.abs(my - y) <= this.hitHalfSize) {
                return i;
            }
        }
        return null;
    }

    private drawSlot(
        ctx: CanvasRenderingContext2D,
        slot: FieldMagicSlot,
        x: number,
        y: number,
        hovered: boolean,
        index: number
    ): void {
        const r = this.iconRadius;

        // Backing disc
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = slot.enabled ? 'rgba(20, 16, 12, 0.86)' : 'rgba(28, 14, 16, 0.86)';
        ctx.fill();
        ctx.lineWidth = hovered ? 2.5 : 1.5;
        ctx.strokeStyle = slot.enabled
            ? (hovered ? Parchment.borderGold : 'rgba(200, 146, 42, 0.6)')
            : 'rgba(228, 63, 90, 0.6)';
        if (hovered) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 8;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Skill emoji icon
        ctx.globalAlpha = slot.enabled ? 1 : 0.4;
        ctx.font = `${r * 1.25}px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(slot.skill.icon, x, y + 1);
        ctx.globalAlpha = 1;

        // Number hotkey (top-left)
        ctx.font = `bold 10px ${UI.fontMono}`;
        ctx.fillStyle = 'rgba(240, 224, 170, 0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(String(index + 1), x - r * 0.75, y - r * 0.75);

        // Upgrade level badge (bottom-right)
        if (slot.level > 1) {
            ctx.font = `bold 9px ${UI.fontMono}`;
            ctx.fillStyle = '#ffd24a';
            ctx.fillText(`+${slot.level - 1}`, x + r * 0.7, y + r * 0.78);
        }

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private renderHoveredDetail(ctx: CanvasRenderingContext2D): void {
        if (this.hoveredIndex === null) return;
        const slot = this.slots[this.hoveredIndex];
        if (!slot) return;

        const label = `${slot.skill.nameKr}  MP ${slot.skill.mpCost}`;
        const reason = !slot.enabled ? slot.disabledReason : undefined;

        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ly = this.centerY + this.menuRadius + 22;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.82)';
        ctx.strokeText(label, this.centerX, ly);
        ctx.fillStyle = slot.enabled ? '#ffe3a0' : '#f0a0a8';
        ctx.fillText(label, this.centerX, ly);

        if (reason) {
            ctx.font = `bold 11px ${UI.fontPrimary}`;
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,0.82)';
            ctx.strokeText(reason, this.centerX, ly + 16);
            ctx.fillStyle = '#ffd6d6';
            ctx.fillText(reason, this.centerX, ly + 16);
        }

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
}
