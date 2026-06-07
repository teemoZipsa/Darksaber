/**
 * ActionMenuUI — lightweight radial action menu with fixed icon slots.
 * Appears around the player character when clicked during raid.
 * Icons are colored when ATB is full, subtly muted when not.
 */

import { TILE_SIZE } from '../map/Chunk';
import { t } from '../i18n/LanguageManager';
import { ACTION_ICON_CELLS } from './DarksaberIconRegistry';
import { DarksaberSpriteAtlas, MICON_CELL_SIZE } from './DarksaberSpriteAtlas';
import { UI, Parchment } from './UITheme';
import { SettingsManager, type KeybindingId } from '../engine/SettingsManager';

const ACTION_ICON_ANIMATION_ROWS = 5;
const ACTION_ICON_ANIMATION_MS = 280;

export type ActionType = 'tool' | 'attack' | 'rest' | 'defend' | 'magic' | 'move' | 'open' | 'fanfare';
export type ReadyCursorType = 'move' | 'attack';

const ACTION_KEYBINDING_IDS: Record<ActionType, KeybindingId> = {
    move: 'action.move',
    tool: 'action.tool',
    attack: 'action.attack',
    magic: 'action.magic',
    defend: 'action.defend',
    rest: 'action.rest',
    fanfare: 'action.fanfare',
    open: 'action.open',
};

export interface ActionMenuSlotState {
    type: ActionType;
    enabled: boolean;
    costLabel?: string;
    disabledReason?: string;
    highlighted?: boolean;
    emphasisLabel?: string;
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
        action === 'open' ||
        action === 'fanfare'
    ) {
        return action;
    }
    return null;
}

interface ActionSlot {
    type: ActionType;
    labelKey: string;
    gridX: number;
    gridY: number;
    iconDraw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean) => void;
}

interface ReadyCursorFrame {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
}

export class ActionMenuUI {
    private static readonly READY_CURSOR_SRC = '/assets/ui/MCURSOR.BMP';
    private static readonly READY_CURSOR_FPS = 7;
    private static readonly READY_CURSOR_FRAMES: Record<ReadyCursorType, ReadyCursorFrame[]> = {
        move: [
            { sx: 255, sy: 16, sw: 16, sh: 16, dx: 23, dy: 30, dw: 22, dh: 22 },
            { sx: 271, sy: 16, sw: 16, sh: 16, dx: 23, dy: 30, dw: 22, dh: 22 },
            { sx: 287, sy: 16, sw: 16, sh: 16, dx: 23, dy: 30, dw: 22, dh: 22 },
        ],
        attack: [
            { sx: 254, sy: 0, sw: 13, sh: 16, dx: 25, dy: 30, dw: 17, dh: 23 },
            { sx: 263, sy: 0, sw: 13, sh: 16, dx: 25, dy: 30, dw: 17, dh: 23 },
            { sx: 272, sy: 0, sw: 13, sh: 16, dx: 25, dy: 30, dw: 17, dh: 23 },
        ],
    };
    private static readyCursorImage: HTMLImageElement | null = null;
    private static readyCursorLoaded = false;
    private static readyCursorLoading = false;
    private static readyCursorFrameCache = new Map<string, HTMLCanvasElement>();

    private isOpen = false;
    private slots: ActionSlot[];
    private slotStates = new Map<ActionType, ActionMenuSlotState>();
    private readonly iconRadius = 24;
    private readonly hitHalfSize = TILE_SIZE / 2;

    private centerX = 0;
    private centerY = 0;
    private hoveredSlot: ActionType | null = null;

    constructor() {
        this.slots = [
            { type: 'move',    labelKey: 'action.label.move',    gridX: -1, gridY: -1, iconDraw: this.drawMoveIcon },
            { type: 'tool',    labelKey: 'action.label.tool',    gridX: 0,  gridY: -1, iconDraw: this.drawToolIcon },
            { type: 'attack',  labelKey: 'action.label.attack',  gridX: 1,  gridY: -1, iconDraw: this.drawAttackIcon },
            { type: 'magic',   labelKey: 'action.label.magic',   gridX: -1, gridY: 0,  iconDraw: this.drawMagicIcon },
            { type: 'defend',  labelKey: 'action.label.defend',  gridX: 1,  gridY: 0,  iconDraw: this.drawDefendIcon },
            { type: 'rest',    labelKey: 'action.label.rest',    gridX: -1, gridY: 1,  iconDraw: this.drawRestIcon },
            { type: 'fanfare', labelKey: 'action.label.fanfare', gridX: 0,  gridY: 1,  iconDraw: this.drawFanfareIcon },
            { type: 'open',    labelKey: 'action.label.open',    gridX: 1,  gridY: 1,  iconDraw: this.drawOpenIcon },
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
                this.slotStates.set(slot.type, this.getMissingSlotState(slot.type));
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
            const { x: ix, y: iy } = this.getSlotPosition(slot);
            if (this.isSlotHit(mx, my, ix, iy)) {
                this.hoveredSlot = slot.type;
                break;
            }
        }
    }

    public onClick(mx: number, my: number): ActionMenuClickResult | null {
        if (!this.isOpen) return null;
        for (const slot of this.slots) {
            const state = this.getSlotState(slot.type);
            const { x: ix, y: iy } = this.getSlotPosition(slot);
            if (this.isSlotHit(mx, my, ix, iy)) {
                return {
                    type: slot.type,
                    enabled: state.enabled,
                    disabledReason: state.disabledReason,
                };
            }
        }
        return null;
    }

    public getActionResult(type: ActionType): ActionMenuClickResult | null {
        if (!this.isOpen || !this.slots.some((slot) => slot.type === type)) return null;
        const state = this.getSlotState(type);
        return {
            type,
            enabled: state.enabled,
            disabledReason: state.disabledReason,
        };
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
            const { x: ix, y: iy } = this.getSlotPosition(slot);
            const isHovered = this.hoveredSlot === slot.type;
            const isHighlighted = enabled && Boolean(state.highlighted);
            const r = this.iconRadius;

            if (isHighlighted) {
                this.drawSlotTutorialFocus(ctx, ix, iy, r);
            }

            if (isHovered) {
                this.drawSlotFocus(ctx, ix, iy, r, enabled);
            }

            // Draw icon
            slot.iconDraw(ctx, ix, iy, r * 0.62, enabled);
            this.drawHotkeyLabel(ctx, slot.type, ix, iy, r, enabled);

            if (isHovered || isHighlighted) {
                const slotLabel = t(slot.labelKey);
                const label = isHighlighted ? state.emphasisLabel ?? slotLabel : slotLabel;
                ctx.font = `bold 13px ${UI.fontPrimary}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
                ctx.strokeText(label, ix, iy + r + 12);
                ctx.fillStyle = enabled ? '#ffe3a0' : '#f0a0a8';
                ctx.fillText(label, ix, iy + r + 12);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }
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
        playerScreenY: number,
        worldTime: number = 0,
        type: ReadyCursorType = 'move'
    ): void {
        if (this.drawReadyCursorSprite(ctx, playerScreenX, playerScreenY, worldTime, type)) return;

        ctx.save();
        ctx.globalAlpha = 0.85;
        const bx = playerScreenX + TILE_SIZE * 0.72;
        const by = playerScreenY + TILE_SIZE * 0.88;
        const s = 2.15;

        // Fallback boot while MCURSOR.BMP is still loading.
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

    private drawReadyCursorSprite(
        ctx: CanvasRenderingContext2D,
        playerScreenX: number,
        playerScreenY: number,
        worldTime: number,
        type: ReadyCursorType
    ): boolean {
        ActionMenuUI.ensureReadyCursorLoaded();
        if (!ActionMenuUI.readyCursorLoaded) return false;

        const frames = ActionMenuUI.READY_CURSOR_FRAMES[type];
        const frameIndex = Math.floor(worldTime * ActionMenuUI.READY_CURSOR_FPS) % frames.length;
        const frame = frames[frameIndex];
        const canvas = ActionMenuUI.getReadyCursorFrameCanvas(type, frameIndex, frame);
        if (!canvas) return false;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.shadowColor = type === 'attack' ? 'rgba(255, 230, 160, 0.8)' : 'rgba(120, 170, 255, 0.7)';
        ctx.shadowBlur = type === 'attack' ? 7 : 5;
        ctx.drawImage(canvas, playerScreenX + frame.dx, playerScreenY + frame.dy, frame.dw, frame.dh);
        ctx.restore();
        return true;
    }

    private static ensureReadyCursorLoaded(): void {
        if (this.readyCursorLoaded || this.readyCursorLoading || typeof Image === 'undefined') return;
        this.readyCursorLoading = true;
        const image = new Image();
        image.onload = () => {
            this.readyCursorImage = image;
            this.readyCursorLoaded = true;
            this.readyCursorLoading = false;
        };
        image.onerror = () => {
            this.readyCursorLoading = false;
        };
        image.src = this.READY_CURSOR_SRC;
    }

    private static getReadyCursorFrameCanvas(
        type: ReadyCursorType,
        frameIndex: number,
        frame: ReadyCursorFrame
    ): HTMLCanvasElement | null {
        const image = this.readyCursorImage;
        if (!image || !this.readyCursorLoaded) return null;

        const key = `${type}:${frameIndex}`;
        const cached = this.readyCursorFrameCache.get(key);
        if (cached) return cached;
        if (typeof document === 'undefined') return null;

        const canvas = document.createElement('canvas');
        canvas.width = frame.sw;
        canvas.height = frame.sh;
        const frameCtx = canvas.getContext('2d');
        if (!frameCtx) return null;

        frameCtx.imageSmoothingEnabled = false;
        frameCtx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
        const data = frameCtx.getImageData(0, 0, frame.sw, frame.sh);
        for (let i = 0; i < data.data.length; i += 4) {
            const r = data.data[i] ?? 0;
            const g = data.data[i + 1] ?? 0;
            const b = data.data[i + 2] ?? 0;
            if (r < 8 && g < 8 && b < 8) data.data[i + 3] = 0;
        }
        frameCtx.putImageData(data, 0, 0);
        this.readyCursorFrameCache.set(key, canvas);
        return canvas;
    }

    // ─── ICON DRAWING FUNCTIONS ────────────────────────────────

    private setDefaultSlotStates(): void {
        this.slotStates.clear();
        for (const slot of this.slots) {
            this.slotStates.set(slot.type, this.getMissingSlotState(slot.type));
        }
    }

    private getSlotState(type: ActionType): ActionMenuSlotState {
        return this.slotStates.get(type) ?? this.getMissingSlotState(type);
    }

    private getMissingSlotState(type: ActionType): ActionMenuSlotState {
        if (type === 'fanfare') return { type, enabled: false, disabledReason: t('field.action.fanfareNoFollowers') };
        return { type, enabled: true };
    }

    private getSlotPosition(slot: ActionSlot): { x: number; y: number } {
        return {
            x: this.centerX + slot.gridX * TILE_SIZE,
            y: this.centerY + slot.gridY * TILE_SIZE,
        };
    }

    private isSlotHit(mx: number, my: number, ix: number, iy: number): boolean {
        return Math.abs(mx - ix) <= this.hitHalfSize && Math.abs(my - iy) <= this.hitHalfSize;
    }

    private drawSlotFocus(ctx: CanvasRenderingContext2D, ix: number, iy: number, r: number, enabled: boolean): void {
        const size = r * 1.65;
        const x = ix - size / 2;
        const y = iy - size / 2;
        const corner = 10;
        const color = enabled ? Parchment.borderGold : 'rgba(228, 63, 90, 0.72)';

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = enabled ? 8 : 5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + corner);
        ctx.lineTo(x, y);
        ctx.lineTo(x + corner, y);
        ctx.moveTo(x + size - corner, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size, y + corner);
        ctx.moveTo(x + size, y + size - corner);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x + size - corner, y + size);
        ctx.moveTo(x + corner, y + size);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x, y + size - corner);
        ctx.stroke();
        ctx.restore();
    }

    private drawHotkeyLabel(ctx: CanvasRenderingContext2D, type: ActionType, ix: number, iy: number, r: number, enabled: boolean): void {
        const label = SettingsManager.getKeyLabel(SettingsManager.getKeybinding(ACTION_KEYBINDING_IDS[type]));
        const badgeX = ix - r * 0.58;
        const badgeY = iy - r * 0.58;

        ctx.save();
        ctx.font = `bold 9px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = Math.max(12, ctx.measureText(label).width + 6);
        const h = 12;
        ctx.fillStyle = enabled ? 'rgba(20, 14, 8, 0.86)' : 'rgba(12, 12, 12, 0.72)';
        ctx.strokeStyle = enabled ? '#d4a050' : '#6f6048';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(badgeX - w / 2, badgeY - h / 2, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = enabled ? '#f0c050' : '#9c8c70';
        ctx.fillText(label, badgeX, badgeY + 0.5);
        ctx.restore();
    }

    private drawSlotTutorialFocus(ctx: CanvasRenderingContext2D, ix: number, iy: number, r: number): void {
        const pulse = (Math.sin(ActionMenuUI.getAnimationTime() / 150) + 1) / 2;
        const outer = r * (1.95 + pulse * 0.18);

        ctx.save();
        ctx.shadowColor = '#f0c050';
        ctx.shadowBlur = 18 + pulse * 10;
        ctx.strokeStyle = '#f0c050';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ix, iy, outer, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(240, 192, 80, ${0.13 + pulse * 0.08})`;
        ctx.beginPath();
        ctx.arc(ix, iy, outer - 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
        const y = this.centerY + TILE_SIZE * 2 + 10;

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

        const frame = Math.floor(ActionMenuUI.getAnimationTime() / ACTION_ICON_ANIMATION_MS) % 2;
        const row = iconCell.row < ACTION_ICON_ANIMATION_ROWS
            ? iconCell.row + frame * ACTION_ICON_ANIMATION_ROWS
            : iconCell.row;
        const iconSize = Math.max(18, s * 2.35);
        const sourceInsetX = type === 'magic' || type === 'defend' ? 1 : 0;
        const sourceInsetY = 0;
        return DarksaberSpriteAtlas.drawSprite(
            ctx,
            {
                sheet: 'micon',
                x: iconCell.col * MICON_CELL_SIZE + sourceInsetX,
                y: row * MICON_CELL_SIZE + sourceInsetY,
                w: MICON_CELL_SIZE - sourceInsetX * 2,
                h: MICON_CELL_SIZE - sourceInsetY * 2,
            },
            cx - iconSize / 2,
            cy - iconSize / 2,
            iconSize,
            iconSize,
            { alpha: ready ? 1 : 0.35 }
        );
    }

    private static getAnimationTime(): number {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
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

    private drawFanfareIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ready: boolean): void {
        if (ActionMenuUI.drawActionIconCell(ctx, 'fanfare', cx, cy, s, ready)) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 8);
        ctx.fillStyle = ready ? '#f0c050' : 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, -s * 0.25);
        ctx.lineTo(s * 0.65, -s * 0.65);
        ctx.lineTo(s * 0.65, s * 0.65);
        ctx.lineTo(-s * 0.7, s * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-s * 0.8, -s * 0.12, s * 0.4, s * 0.24);
        ctx.restore();
    }
}
