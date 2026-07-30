/**
 * CombatLogUI — Floating combat log in bottom-left.
 *
 * - No panel/background. Just text with vertical opacity fade (oldest = most transparent).
 * - Newest line at bottom (full opacity).
 * - Mouse wheel and click-drag inside the log region scrolls through history.
 * - New log entries auto-reset scroll to latest.
 *
 * Singleton; held as a module export.
 */

import type { InputManager } from '../engine/InputManager';
import { UI, Parchment } from './UITheme';
import { getCombatLogColor } from '../field/FieldDisplay';

const FONT_SIZE = 13;
const LINE_HEIGHT = 19;
const VISIBLE_LINES = 6;          // default visible band height in lines
const SCROLLED_LINES = 14;        // how many lines visible while user is interacting
const REGION_W = 460;             // hit region width
const REGION_PAD_X = 18;
const REGION_PAD_BOTTOM = 32;
const COMPACT_BREAKPOINT = 520;
const COMPACT_VISIBLE_LINES = 2;

export interface CombatLogRegion {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function getCombatLogRegion(
    vw: number,
    vh: number,
    interacting: boolean = false,
): CombatLogRegion {
    const compact = vw < COMPACT_BREAKPOINT;
    const lines = compact ? COMPACT_VISIBLE_LINES : interacting ? SCROLLED_LINES : VISIBLE_LINES;
    const h = lines * LINE_HEIGHT;
    return {
        x: REGION_PAD_X,
        y: vh - REGION_PAD_BOTTOM - h,
        w: Math.min(REGION_W, Math.max(0, vw - REGION_PAD_X * 2)),
        h,
    };
}

class CombatLogUIClass {
    private scrollOffset = 0;            // 0 = newest at bottom, higher = scrolled up into history
    private lastKnownLength = 0;
    private dragging = false;
    private dragStartMouseY = 0;
    private dragStartOffset = 0;
    private interacting = false;

    /** Region rect for hit testing and rendering bounds. */
    private getRegion(vw: number, vh: number): CombatLogRegion {
        return getCombatLogRegion(vw, vh, this.interacting);
    }

    private isInside(mx: number, my: number, r: { x: number; y: number; w: number; h: number }): boolean {
        return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    }

    private maxScroll(logLen: number): number {
        return Math.max(0, logLen - VISIBLE_LINES);
    }

    /**
     * Process input. Returns true if interaction was consumed (caller should suppress map clicks).
     */
    public update(input: InputManager, logLen: number, vw: number, vh: number): boolean {
        // Auto-reset when new entries arrive (only if not actively scrolling)
        if (logLen > this.lastKnownLength && !this.dragging) {
            this.scrollOffset = 0;
        }
        this.lastKnownLength = logLen;

        if (vw < COMPACT_BREAKPOINT) {
            this.dragging = false;
            this.interacting = false;
            this.scrollOffset = 0;
            return false;
        }

        const region = this.getRegion(vw, vh);
        const inside = this.isInside(input.uiMouseX, input.uiMouseY, region);

        // Wheel scroll
        if (inside && input.mouseWheelDelta !== 0) {
            const next = this.scrollOffset - input.mouseWheelDelta;
            this.scrollOffset = Math.max(0, Math.min(this.maxScroll(logLen), next));
            this.interacting = true;
            return true;
        }

        // Drag handling
        if (this.dragging) {
            if (!input.mouseIsDown) {
                this.dragging = false;
            } else {
                const dy = input.uiMouseY - this.dragStartMouseY;
                // Drag DOWN reveals older entries (positive scroll offset)
                const next = this.dragStartOffset + dy / LINE_HEIGHT;
                this.scrollOffset = Math.max(0, Math.min(this.maxScroll(logLen), next));
                return true;
            }
        } else if (inside && input.mouseJustDown) {
            this.dragging = true;
            this.dragStartMouseY = input.uiMouseY;
            this.dragStartOffset = this.scrollOffset;
            this.interacting = true;
            return true;
        }

        // Hover state — expand visible region while mouse is over it
        this.interacting = inside || this.scrollOffset > 0;
        return false;
    }

    public render(ctx: CanvasRenderingContext2D, lines: string[], vw: number, vh: number): void {
        if (lines.length === 0) return;

        const region = this.getRegion(vw, vh);
        const visibleCount = vw < COMPACT_BREAKPOINT
            ? COMPACT_VISIBLE_LINES
            : this.interacting
                ? SCROLLED_LINES
                : VISIBLE_LINES;
        const totalLines = lines.length;

        // Determine slice: newest index = totalLines - 1 - scrollOffset (bottom-most visible)
        const bottomIdx = totalLines - 1 - Math.floor(this.scrollOffset);
        const topIdx = Math.max(0, bottomIdx - visibleCount + 1);

        ctx.save();
        ctx.font = `bold ${FONT_SIZE}px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        // Subtle text shadow for readability on any background
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;

        const baseY = region.y + region.h;
        let renderedFromBottom = 0;

        for (let i = bottomIdx; i >= topIdx; i--) {
            const text = lines[i];
            // Opacity falls off going up — newest (renderedFromBottom=0) full, oldest fades
            const t = renderedFromBottom / Math.max(1, visibleCount - 1);
            // Aggressive fade: 1.0 → 0.15 with ease
            const alpha = 1 - t * 0.85;
            ctx.globalAlpha = Math.max(0.1, alpha);

            const y = baseY - renderedFromBottom * LINE_HEIGHT;
            ctx.fillStyle = getCombatLogColor(text);
            ctx.fillText(text, region.x, y);
            renderedFromBottom++;
        }

        // Scroll indicator (small dot column on the left edge) — only when scrolled or hovering
        if (vw >= COMPACT_BREAKPOINT && this.interacting && totalLines > VISIBLE_LINES) {
            ctx.globalAlpha = 0.55;
            ctx.shadowBlur = 0;
            const trackX = region.x - 6;
            const trackY = region.y + 6;
            const trackH = region.h - 12;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(trackX, trackY, 2, trackH);
            const maxScroll = this.maxScroll(totalLines);
            const thumbH = Math.max(12, trackH * (VISIBLE_LINES / totalLines));
            const thumbY = maxScroll > 0
                ? trackY + (1 - this.scrollOffset / maxScroll) * (trackH - thumbH)
                : trackY + (trackH - thumbH);
            ctx.fillStyle = Parchment.borderGold;
            ctx.fillRect(trackX, thumbY, 2, thumbH);
        }

        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    /** Reset scroll to latest. Called externally if needed (e.g. on new raid). */
    public snapToLatest(): void {
        this.scrollOffset = 0;
    }
}

export const CombatLogUI = new CombatLogUIClass();
