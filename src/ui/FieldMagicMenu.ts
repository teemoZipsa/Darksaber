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
import { getSkillIconCell } from './DarksaberIconRegistry';
import { DarksaberSpriteAtlas, MICON_CELL_SIZE } from './DarksaberSpriteAtlas';

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
    private static readonly ICON_ANIMATION_ROWS = 5;
    private static readonly ICON_ANIMATION_MS = 280;
    private open = false;
    private slots: FieldMagicSlot[] = [];
    private hoveredIndex: number | null = null;

    private readonly menuRadius = 82;
    private readonly iconRadius = 25;
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

        this.drawSlotBacking(ctx, x, y, r, slot.enabled, hovered);
        if (hovered) {
            this.drawSlotFocus(ctx, x, y, r, slot.enabled);
        }

        this.drawSkillIcon(ctx, slot, x, y, r);

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

    private drawSlotBacking(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        r: number,
        enabled: boolean,
        hovered: boolean
    ): void {
        const size = r * 1.68;
        const left = x - size / 2;
        const top = y - size / 2;

        ctx.save();
        ctx.fillStyle = enabled ? 'rgba(20, 16, 12, 0.9)' : 'rgba(28, 14, 16, 0.9)';
        ctx.fillRect(left, top, size, size);
        ctx.strokeStyle = enabled
            ? (hovered ? Parchment.borderGold : 'rgba(200, 146, 42, 0.72)')
            : 'rgba(228, 63, 90, 0.68)';
        ctx.lineWidth = hovered ? 2 : 1;
        ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);

        ctx.fillStyle = 'rgba(255, 228, 160, 0.08)';
        ctx.fillRect(left + 3, top + 3, size - 6, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(left + 3, top + size - 4, size - 6, 1);
        ctx.restore();
    }

    private drawSkillIcon(ctx: CanvasRenderingContext2D, slot: FieldMagicSlot, x: number, y: number, r: number): void {
        const iconCell = getSkillIconCell(slot.skill);
        const frame = Math.floor(this.getAnimationTime() / FieldMagicMenu.ICON_ANIMATION_MS) % 2;
        const row = iconCell && iconCell.row < FieldMagicMenu.ICON_ANIMATION_ROWS
            ? iconCell.row + frame * FieldMagicMenu.ICON_ANIMATION_ROWS
            : iconCell?.row;
        const iconSize = Math.max(28, r * 1.55);

        ctx.save();
        if (!slot.enabled) ctx.globalAlpha *= 0.4;
        if (iconCell && row !== undefined) {
            const drawn = DarksaberSpriteAtlas.drawSprite(
                ctx,
                {
                    sheet: 'micon',
                    x: iconCell.col * MICON_CELL_SIZE,
                    y: row * MICON_CELL_SIZE,
                    w: MICON_CELL_SIZE,
                    h: MICON_CELL_SIZE,
                },
                x - iconSize / 2,
                y - iconSize / 2,
                iconSize,
                iconSize
            );
            if (drawn) {
                ctx.restore();
                return;
            }
        }

        ctx.font = `${r * 1.15}px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(slot.skill.icon, x, y + 1);
        ctx.restore();
    }

    private drawSlotFocus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, enabled: boolean): void {
        const size = r * 1.65;
        const left = x - size / 2;
        const top = y - size / 2;
        const corner = 10;
        const color = enabled ? Parchment.borderGold : 'rgba(228, 63, 90, 0.72)';

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = enabled ? 8 : 5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, top + corner);
        ctx.lineTo(left, top);
        ctx.lineTo(left + corner, top);
        ctx.moveTo(left + size - corner, top);
        ctx.lineTo(left + size, top);
        ctx.lineTo(left + size, top + corner);
        ctx.moveTo(left + size, top + size - corner);
        ctx.lineTo(left + size, top + size);
        ctx.lineTo(left + size - corner, top + size);
        ctx.moveTo(left + corner, top + size);
        ctx.lineTo(left, top + size);
        ctx.lineTo(left, top + size - corner);
        ctx.stroke();
        ctx.restore();
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

    private getAnimationTime(): number {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
}
