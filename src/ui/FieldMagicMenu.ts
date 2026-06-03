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
    private static readonly SLOT_OFFSETS: ReadonlyArray<{ x: number; y: number }> = [
        { x: -1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: -1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ];
    private open = false;
    private slots: FieldMagicSlot[] = [];
    private hoveredIndex: number | null = null;

    private readonly iconRadius = 24;
    private readonly hitHalfSize = TILE_SIZE / 2;

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
            this.drawSlot(ctx, slot, x, y, hovered);
        }
        this.renderHoveredDetail(ctx);
        ctx.restore();
    }

    private slotPosition(index: number): { x: number; y: number } {
        const offset = FieldMagicMenu.SLOT_OFFSETS[index] ?? FieldMagicMenu.SLOT_OFFSETS[FieldMagicMenu.SLOT_OFFSETS.length - 1]!;
        return {
            x: this.centerX + offset.x * TILE_SIZE,
            y: this.centerY + offset.y * TILE_SIZE,
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
        hovered: boolean
    ): void {
        const r = this.iconRadius;

        if (hovered) {
            this.drawSlotFocus(ctx, x, y, r, slot.enabled);
        }

        this.drawSkillIcon(ctx, slot, x, y, r);

        if (hovered) {
            const label = slot.skill.nameKr;
            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
            ctx.strokeText(label, x, y + r + 12);
            ctx.fillStyle = slot.enabled ? '#ffe3a0' : '#f0a0a8';
            ctx.fillText(label, x, y + r + 12);
        }

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private drawSkillIcon(ctx: CanvasRenderingContext2D, slot: FieldMagicSlot, x: number, y: number, r: number): void {
        const iconCell = getSkillIconCell(slot.skill);
        const frame = Math.floor(this.getAnimationTime() / FieldMagicMenu.ICON_ANIMATION_MS) % 2;
        const row = iconCell && iconCell.row < FieldMagicMenu.ICON_ANIMATION_ROWS
            ? iconCell.row + frame * FieldMagicMenu.ICON_ANIMATION_ROWS
            : iconCell?.row;
        const iconSize = Math.max(18, r * 0.62 * 2.35);

        ctx.save();
        if (!slot.enabled) ctx.globalAlpha *= 0.4;
        if (iconCell && row !== undefined) {
            const drawn = DarksaberSpriteAtlas.drawSprite(
                ctx,
                {
                    sheet: 'micon',
                    x: iconCell.col * MICON_CELL_SIZE + 1,
                    y: row * MICON_CELL_SIZE,
                    w: MICON_CELL_SIZE - 2,
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

        const reason = !slot.enabled ? slot.disabledReason : undefined;
        if (!reason) return;

        ctx.font = `bold 11px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ly = this.centerY + TILE_SIZE * 2 + 10;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.82)';
        ctx.strokeText(reason, this.centerX, ly);
        ctx.fillStyle = '#ffd6d6';
        ctx.fillText(reason, this.centerX, ly);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private getAnimationTime(): number {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
}
