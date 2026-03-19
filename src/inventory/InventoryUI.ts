/**
 * InventoryUI — Canvas-rendered overlay with:
 *   - LEFT: Human body silhouette with equipment slots
 *   - RIGHT: Tarkov-style grid backpack
 *   - Full drag-and-drop between grid ↔ equip slots
 */

import { GridInventory, PlacedItem } from './GridInventory';
import { ItemDef, ItemSlot } from '../data/ItemDB';

const CELL = 48;
const PAD = 16;
const PANEL_BG = 'rgba(10, 12, 20, 0.94)';
const CELL_BG = 'rgba(30, 35, 50, 0.9)';
const CELL_BORDER = 'rgba(60, 70, 90, 0.6)';
const HIGHLIGHT = 'rgba(0, 229, 255, 0.3)';
const VALID_DROP = 'rgba(0, 200, 80, 0.3)';
const INVALID_DROP = 'rgba(200, 50, 50, 0.3)';

interface EquipSlotDef {
    slot: ItemSlot;
    label: string;
    bodyX: number;   // relative to body silhouette center
    bodyY: number;
    w: number;
    h: number;
}

// Equipment slot positions on the body silhouette
const EQUIP_SLOTS: EquipSlotDef[] = [
    { slot: 'head',      label: '🪖',  bodyX: -CELL/2,  bodyY: -110,  w: CELL, h: CELL },
    { slot: 'body',      label: '🦺',  bodyX: -CELL/2,  bodyY: -45,   w: CELL, h: CELL*1.4 },
    { slot: 'weapon',    label: '🗡️',  bodyX: -CELL-22, bodyY: -25,   w: CELL, h: CELL*1.4 },
    { slot: 'shield',    label: '🛡️',  bodyX: 22,       bodyY: -25,   w: CELL, h: CELL*1.4 },
    { slot: 'accessory', label: '💍',  bodyX: -CELL/2,  bodyY: 35,    w: CELL, h: CELL },
];

export class InventoryUI {
    private inventory: GridInventory;
    private visible: boolean = false;

    // Drag state
    private dragging: PlacedItem | null = null;
    private dragFromEquip: ItemSlot | null = null;  // if dragging FROM equip slot
    private dragOffsetX: number = 0;
    private dragOffsetY: number = 0;
    private mouseX: number = 0;
    private mouseY: number = 0;
    private mouseDown: boolean = false;

    // Equipment state
    private equipped: Map<ItemSlot, PlacedItem> = new Map();

    // Layout coords (recalculated on render)
    private panelX = 0;
    private panelY = 0;
    private gridStartX = 0;
    private gridStartY = 0;
    private bodyCenter = { x: 0, y: 0 };

    // Hover
    private hoverCell: { x: number; y: number } | null = null;
    private hoverEquip: ItemSlot | null = null;

    constructor(inventory: GridInventory) {
        this.inventory = inventory;
    }

    public toggle(): void {
        this.visible = !this.visible;
        if (!this.visible) {
            this.dragging = null;
            this.dragFromEquip = null;
        }
    }

    public isVisible(): boolean { return this.visible; }

    // ─── Input Handlers ─────────────────────────────────────────

    public onMouseMove(sx: number, sy: number): void {
        if (!this.visible) return;
        this.mouseX = sx;
        this.mouseY = sy;

        // Update hover cell
        const relX = sx - this.gridStartX;
        const relY = sy - this.gridStartY;
        const cx = Math.floor(relX / CELL);
        const cy = Math.floor(relY / CELL);
        if (cx >= 0 && cx < this.inventory.width && cy >= 0 && cy < this.inventory.height && relX >= 0 && relY >= 0) {
            this.hoverCell = { x: cx, y: cy };
        } else {
            this.hoverCell = null;
        }

        // Update hover equip slot
        this.hoverEquip = this.getEquipSlotAt(sx, sy);
    }

    public onMouseDown(sx: number, sy: number): void {
        if (!this.visible) return;
        this.mouseDown = true;
        this.mouseX = sx;
        this.mouseY = sy;

        // Check if clicking on a grid item → start drag
        if (this.hoverCell) {
            const placed = this.inventory.getAt(this.hoverCell.x, this.hoverCell.y);
            if (placed) {
                this.dragging = placed;
                this.dragFromEquip = null;
                this.dragOffsetX = sx - (this.gridStartX + placed.gridX * CELL);
                this.dragOffsetY = sy - (this.gridStartY + placed.gridY * CELL);
                this.inventory.remove(placed);
                return;
            }
        }

        // Check if clicking on an equipped item → start drag
        const eqSlot = this.getEquipSlotAt(sx, sy);
        if (eqSlot && this.equipped.has(eqSlot)) {
            const placed = this.equipped.get(eqSlot)!;
            this.dragging = placed;
            this.dragFromEquip = eqSlot;
            this.dragOffsetX = placed.item.gridW * CELL / 2;
            this.dragOffsetY = placed.item.gridH * CELL / 2;
            this.equipped.delete(eqSlot);
        }
    }

    public onMouseUp(sx: number, sy: number): void {
        if (!this.visible || !this.dragging) {
            this.mouseDown = false;
            return;
        }

        const item = this.dragging;
        let placed = false;

        // Try dropping on equipment slot
        const eqSlot = this.getEquipSlotAt(sx, sy);
        if (eqSlot && item.item.slot === eqSlot) {
            // Swap: if something already there, put it back in grid
            const existing = this.equipped.get(eqSlot);
            if (existing) {
                this.inventory.autoPlace(existing.item);
            }
            this.equipped.set(eqSlot, item);
            placed = true;
        }

        // Try dropping on grid
        if (!placed && this.hoverCell) {
            const dropX = this.hoverCell.x;
            const dropY = this.hoverCell.y;
            const result = this.inventory.place(item.item, dropX, dropY);
            if (result) {
                result.durability = item.durability;
                placed = true;
            }
        }

        // If couldn't place, return to origin
        if (!placed) {
            if (this.dragFromEquip) {
                this.equipped.set(this.dragFromEquip, item);
            } else {
                // Try to place back somewhere in grid
                const result = this.inventory.autoPlace(item.item);
                if (result) result.durability = item.durability;
            }
        }

        this.dragging = null;
        this.dragFromEquip = null;
        this.mouseDown = false;
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private getEquipSlotAt(sx: number, sy: number): ItemSlot | null {
        for (const def of EQUIP_SLOTS) {
            const slotX = this.bodyCenter.x + def.bodyX;
            const slotY = this.bodyCenter.y + def.bodyY;
            if (sx >= slotX && sx <= slotX + def.w && sy >= slotY && sy <= slotY + def.h) {
                return def.slot;
            }
        }
        return null;
    }

    public getEquipped(slot: ItemSlot): PlacedItem | undefined {
        return this.equipped.get(slot);
    }

    // ─── Render ──────────────────────────────────────────────────

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        const gridPixelW = this.inventory.width * CELL;
        const gridPixelH = this.inventory.height * CELL;
        const bodyAreaW = 200;
        const totalW = bodyAreaW + gridPixelW + PAD * 4;
        const totalH = Math.max(gridPixelH, 300) + PAD * 3 + 40;

        this.panelX = Math.floor((canvasW - totalW) / 2);
        this.panelY = Math.floor((canvasH - totalH) / 2);

        // Darkened backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Panel
        ctx.fillStyle = PANEL_BG;
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.lineWidth = 2;
        this.roundRect(ctx, this.panelX, this.panelY, totalW, totalH, 12);

        // Title
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️ Equipment & Inventory', this.panelX + totalW / 2, this.panelY + 28);
        ctx.textAlign = 'start';

        // ─── Body Silhouette (left) ────
        this.bodyCenter.x = this.panelX + PAD + bodyAreaW / 2;
        this.bodyCenter.y = this.panelY + 50 + 150;
        this.renderBodySilhouette(ctx);

        // ─── Grid Backpack (right) ──────
        this.gridStartX = this.panelX + bodyAreaW + PAD * 2;
        this.gridStartY = this.panelY + 50;

        // Grid label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText('배낭 (Backpack)', this.gridStartX, this.gridStartY - 4);

        this.renderGrid(ctx);

        // ─── Tooltip ────────────────────
        this.renderTooltip(ctx);

        // ─── Dragged Item (on cursor) ───
        this.renderDraggedItem(ctx);
    }

    private renderBodySilhouette(ctx: CanvasRenderingContext2D): void {
        const cx = this.bodyCenter.x;
        const cy = this.bodyCenter.y;

        // ─── Draw body silhouette ───
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 120, 160, 0.5)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Head circle
        ctx.beginPath();
        ctx.arc(cx, cy - 100, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Neck
        ctx.beginPath();
        ctx.moveTo(cx, cy - 82);
        ctx.lineTo(cx, cy - 72);
        ctx.stroke();

        // Shoulders + torso
        ctx.beginPath();
        ctx.moveTo(cx - 40, cy - 65);
        ctx.lineTo(cx - 30, cy - 72);
        ctx.lineTo(cx + 30, cy - 72);
        ctx.lineTo(cx + 40, cy - 65);
        ctx.lineTo(cx + 35, cy + 10);
        ctx.lineTo(cx + 20, cy + 20);
        ctx.lineTo(cx - 20, cy + 20);
        ctx.lineTo(cx - 35, cy + 10);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(40, 50, 70, 0.3)';
        ctx.fill();

        // Left arm
        ctx.beginPath();
        ctx.moveTo(cx - 40, cy - 64);
        ctx.lineTo(cx - 55, cy - 20);
        ctx.lineTo(cx - 50, cy + 10);
        ctx.stroke();

        // Right arm
        ctx.beginPath();
        ctx.moveTo(cx + 40, cy - 64);
        ctx.lineTo(cx + 55, cy - 20);
        ctx.lineTo(cx + 50, cy + 10);
        ctx.stroke();

        // Legs
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy + 20);
        ctx.lineTo(cx - 18, cy + 65);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 15, cy + 20);
        ctx.lineTo(cx + 18, cy + 65);
        ctx.stroke();

        ctx.restore();

        // ─── Equipment Slots on the body ───
        for (const def of EQUIP_SLOTS) {
            const slotX = cx + def.bodyX;
            const slotY = cy + def.bodyY;

            const isHover = this.hoverEquip === def.slot;
            const isValidDrop = this.dragging && this.dragging.item.slot === def.slot;

            // Slot background
            ctx.fillStyle = isHover && isValidDrop ? VALID_DROP : 
                            isHover ? HIGHLIGHT : CELL_BG;
            ctx.fillRect(slotX, slotY, def.w, def.h);

            // Slot border
            ctx.strokeStyle = isValidDrop && isHover ? '#00cc66' : 
                              isHover ? '#00e5ff' : CELL_BORDER;
            ctx.lineWidth = isHover ? 2 : 1;
            ctx.strokeRect(slotX, slotY, def.w, def.h);

            // Equipped item or slot label
            const equipped = this.equipped.get(def.slot);
            if (equipped) {
                ctx.fillStyle = equipped.item.color + '99';
                ctx.fillRect(slotX + 2, slotY + 2, def.w - 4, def.h - 4);
                ctx.font = '22px serif';
                ctx.textAlign = 'center';
                ctx.fillText(equipped.item.icon, slotX + def.w / 2, slotY + def.h / 2 + 7);
                ctx.textAlign = 'start';
            } else {
                ctx.font = '18px serif';
                ctx.textAlign = 'center';
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#aaa';
                ctx.fillText(def.label, slotX + def.w / 2, slotY + def.h / 2 + 6);
                ctx.globalAlpha = 1;
                ctx.textAlign = 'start';
            }
        }

        // Body label
        ctx.fillStyle = '#666';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('장비 착용', cx, cy + 85);
        ctx.textAlign = 'start';
    }

    private renderGrid(ctx: CanvasRenderingContext2D): void {
        const gx = this.gridStartX;
        const gy = this.gridStartY;

        // Empty cells
        for (let y = 0; y < this.inventory.height; y++) {
            for (let x = 0; x < this.inventory.width; x++) {
                const cx = gx + x * CELL;
                const cy = gy + y * CELL;
                ctx.fillStyle = CELL_BG;
                ctx.fillRect(cx, cy, CELL, CELL);
                ctx.strokeStyle = CELL_BORDER;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(cx, cy, CELL, CELL);
            }
        }

        // Placed items
        const rendered = new Set<PlacedItem>();
        for (const placed of this.inventory.items) {
            if (rendered.has(placed)) continue;
            rendered.add(placed);
            this.renderItemInGrid(ctx, placed, gx, gy, false);
        }

        // Drop preview when dragging
        if (this.dragging && this.hoverCell) {
            const dropX = this.hoverCell.x;
            const dropY = this.hoverCell.y;
            const canDrop = this.inventory.canPlace(this.dragging.item, dropX, dropY);

            for (let dy = 0; dy < this.dragging.item.gridH; dy++) {
                for (let dx = 0; dx < this.dragging.item.gridW; dx++) {
                    const cx = gx + (dropX + dx) * CELL;
                    const cy = gy + (dropY + dy) * CELL;
                    if (dropX + dx < this.inventory.width && dropY + dy < this.inventory.height) {
                        ctx.fillStyle = canDrop ? VALID_DROP : INVALID_DROP;
                        ctx.fillRect(cx, cy, CELL, CELL);
                    }
                }
            }
        }

        // Hover highlight (when not dragging)
        if (!this.dragging && this.hoverCell) {
            const hx = gx + this.hoverCell.x * CELL;
            const hy = gy + this.hoverCell.y * CELL;
            ctx.fillStyle = HIGHLIGHT;
            ctx.fillRect(hx, hy, CELL, CELL);
        }
    }

    private renderItemInGrid(ctx: CanvasRenderingContext2D, placed: PlacedItem, gridOriginX: number, gridOriginY: number, _isSelected: boolean): void {
        const ix = gridOriginX + placed.gridX * CELL;
        const iy = gridOriginY + placed.gridY * CELL;
        const iw = placed.item.gridW * CELL;
        const ih = placed.item.gridH * CELL;

        // Background
        ctx.fillStyle = placed.item.color + '88';
        ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);

        // Border
        ctx.strokeStyle = 'rgba(200, 200, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ix + 2, iy + 2, iw - 4, ih - 4);

        // Icon
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.fillText(placed.item.icon, ix + iw / 2, iy + ih / 2 + 7);
        ctx.textAlign = 'start';

        // Durability bar
        if (placed.item.maxDurability > 1) {
            const durRatio = placed.durability / placed.item.maxDurability;
            const barW = iw - 8;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(ix + 4, iy + ih - 10, barW, 4);
            ctx.fillStyle = durRatio > 0.5 ? '#44cc44' : durRatio > 0.2 ? '#ccaa00' : '#cc4444';
            ctx.fillRect(ix + 4, iy + ih - 10, barW * durRatio, 4);
        }
    }

    private renderDraggedItem(ctx: CanvasRenderingContext2D): void {
        if (!this.dragging) return;
        const item = this.dragging.item;
        const dx = this.mouseX - this.dragOffsetX;
        const dy = this.mouseY - this.dragOffsetY;
        const iw = item.gridW * CELL;
        const ih = item.gridH * CELL;

        ctx.globalAlpha = 0.8;
        ctx.fillStyle = item.color + 'cc';
        ctx.fillRect(dx, dy, iw, ih);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, iw, ih);

        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.icon, dx + iw / 2, dy + ih / 2 + 8);
        ctx.textAlign = 'start';
        ctx.globalAlpha = 1;
    }

    private renderTooltip(ctx: CanvasRenderingContext2D): void {
        if (this.dragging) return; // no tooltip while dragging
        
        let item: ItemDef | null = null;
        
        // Check grid hover
        if (this.hoverCell) {
            const placed = this.inventory.getAt(this.hoverCell.x, this.hoverCell.y);
            if (placed) item = placed.item;
        }

        // Check equip slot hover
        if (!item && this.hoverEquip) {
            const eq = this.equipped.get(this.hoverEquip);
            if (eq) item = eq.item;
        }

        if (!item) return;

        const tx = this.mouseX + 16;
        const ty = this.mouseY;
        const tw = 200;
        const th = 100;

        ctx.fillStyle = 'rgba(15, 15, 30, 0.95)';
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeRect(tx, ty, tw, th);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText(`${item.icon} ${item.nameKr}`, tx + 8, ty + 20);

        ctx.fillStyle = '#aaa';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(item.description, tx + 8, ty + 38);

        let sy = 54;
        ctx.fillStyle = '#88ff88';
        if (item.stats?.atk) { ctx.fillText(`ATK +${item.stats.atk}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.def) { ctx.fillText(`DEF +${item.stats.def}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.magAtk) { ctx.fillText(`MAG +${item.stats.magAtk}`, tx + 8, ty + sy); sy += 14; }
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
