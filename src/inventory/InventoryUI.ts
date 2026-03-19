/**
 * InventoryUI — Canvas-rendered overlay with:
 *   - LEFT: Human body silhouette with equipment slots
 *   - RIGHT: Tarkov-style grid backpack
 *   - Full drag-and-drop between grid ↔ equip slots
 */

import { GridInventory, PlacedItem } from './GridInventory';
import { ItemDef, ItemSlot } from '../data/ItemDB';
import { Character } from '../character/Character';
import { t, i18n } from '../i18n/LanguageManager';

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
    labelKey: string;
    bodyX: number;   // relative to body silhouette center
    bodyY: number;
    w: number;
    h: number;
}

// Equipment slot positions on the body silhouette
const EQUIP_SLOTS: EquipSlotDef[] = [
    { slot: 'head',      labelKey: 'inv.head',  bodyX: -CELL/2,  bodyY: -110,  w: CELL, h: CELL },
    { slot: 'body',      labelKey: 'inv.body',  bodyX: -CELL/2,  bodyY: -45,   w: CELL, h: CELL*1.4 },
    { slot: 'weapon',    labelKey: 'inv.weapon',bodyX: -CELL-22, bodyY: -25,   w: CELL, h: CELL*1.4 },
    { slot: 'shield',    labelKey: 'inv.shield',bodyX: 22,       bodyY: -25,   w: CELL, h: CELL*1.4 },
    { slot: 'accessory', labelKey: 'inv.accessory',bodyX: -CELL/2, bodyY: 35,  w: CELL, h: CELL },
];

export class InventoryUI {
    private inventory: GridInventory;
    private externalGrid: GridInventory | null = null;
    private externalTitle: string = 'Loot';
    private visible: boolean = false;

    // Drag state
    private dragging: PlacedItem | null = null;
    private dragFromEquip: ItemSlot | null = null;  // if dragging FROM equip slot
    private dragOffsetX: number = 0;
    private dragOffsetY: number = 0;
    private mouseX: number = 0;
    private mouseY: number = 0;

    // The character whose equipment we are managing.
    private activeChar: Character | null = null;

    // Layout coords (recalculated on render)
    private panelX = 0;
    private panelY = 0;
    private gridStartX = 0;
    private gridStartY = 0;
    private bodyCenter = { x: 0, y: 0 };

    // Hover
    private hoverCell: { x: number; y: number; isExt: boolean } | null = null;
    private hoverEquip: ItemSlot | null = null;

    // External Grid Layout coordinates
    private extGridStartX = 0;
    private extGridStartY = 0;

    constructor(inventory: GridInventory) {
        this.inventory = inventory;
    }

    public setActiveCharacter(char: Character): void {
        this.activeChar = char;
    }

    public setExternalGrid(grid: GridInventory | null, title: string = 'Loot'): void {
        this.externalGrid = grid;
        this.externalTitle = title;
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

        // Update hover cell - Internal Grid
        const relX = sx - this.gridStartX;
        const relY = sy - this.gridStartY;
        const cx = Math.floor(relX / CELL);
        const cy = Math.floor(relY / CELL);
        
        let foundCell = false;
        if (cx >= 0 && cx < this.inventory.width && cy >= 0 && cy < this.inventory.height && relX >= 0 && relY >= 0) {
            this.hoverCell = { x: cx, y: cy, isExt: false };
            foundCell = true;
        } 
        
        // Update hover cell - External Grid
        if (!foundCell && this.externalGrid) {
            const extRelX = sx - this.extGridStartX;
            const extRelY = sy - this.extGridStartY;
            const ecx = Math.floor(extRelX / CELL);
            const ecy = Math.floor(extRelY / CELL);
            if (ecx >= 0 && ecx < this.externalGrid.width && ecy >= 0 && ecy < this.externalGrid.height && extRelX >= 0 && extRelY >= 0) {
                this.hoverCell = { x: ecx, y: ecy, isExt: true };
                foundCell = true;
            }
        }

        if (!foundCell) {
            this.hoverCell = null;
        }

        // Update hover equip slot
        this.hoverEquip = this.getEquipSlotAt(sx, sy);
    }

    public onMouseDown(sx: number, sy: number): void {
        if (!this.visible) return;
        this.mouseX = sx;
        this.mouseY = sy;

        // Check if clicking on a grid item → start drag
        if (this.hoverCell) {
            const grid = this.hoverCell.isExt ? this.externalGrid! : this.inventory;
            const placed = grid.getAt(this.hoverCell.x, this.hoverCell.y);
            if (placed) {
                this.dragging = placed;
                this.dragFromEquip = null;
                const originX = this.hoverCell.isExt ? this.extGridStartX : this.gridStartX;
                const originY = this.hoverCell.isExt ? this.extGridStartY : this.gridStartY;
                this.dragOffsetX = sx - (originX + placed.gridX * CELL);
                this.dragOffsetY = sy - (originY + placed.gridY * CELL);
                grid.remove(placed);
                return;
            }
        }

        // Check if clicking on an equipped item → start drag
        const eqSlot = this.getEquipSlotAt(sx, sy);
        if (eqSlot && this.activeChar && this.activeChar.equipment.has(eqSlot)) {
            const placed = this.activeChar.equipment.get(eqSlot)!;
            this.dragging = placed;
            this.dragFromEquip = eqSlot;
            this.dragOffsetX = placed.item.gridW * CELL / 2;
            this.dragOffsetY = placed.item.gridH * CELL / 2;
            this.activeChar.unequip(eqSlot);
        }
    }

    public onMouseUp(sx: number, sy: number): void {
        if (!this.visible || !this.dragging) {
            return;
        }

        const item = this.dragging;
        let placed = false;

        // Try dropping on equipment slot
        const eqSlot = this.getEquipSlotAt(sx, sy);
        if (eqSlot && item.item.slot === eqSlot && this.activeChar) {
            // Swap: if something already there, put it back in grid
            const existing = this.activeChar.equipment.get(eqSlot);
            if (existing) {
                this.inventory.autoPlace(existing.item); // or external grid if possible? Fallback to internal.
            }
            this.activeChar.equip(item);
            placed = true;
        }

        // Try dropping on grid
        if (!placed && this.hoverCell) {
            const targetGrid = this.hoverCell.isExt ? this.externalGrid! : this.inventory;
            const dropX = this.hoverCell.x;
            const dropY = this.hoverCell.y;
            const result = targetGrid.place(item.item, dropX, dropY);
            if (result) {
                result.durability = item.durability;
                placed = true;
            }
        }

        // If couldn't place, return to origin
        if (!placed) {
            if (this.dragFromEquip && this.activeChar) {
                this.activeChar.equip(item);
            } else {
                // Try to place back somewhere in grid
                const result = this.inventory.autoPlace(item.item);
                if (result) result.durability = item.durability;
            }
        }

        this.dragging = null;
        this.dragFromEquip = null;
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
        return this.activeChar ? this.activeChar.equipment.get(slot) : undefined;
    }

    // ─── Render ──────────────────────────────────────────────────

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        const gridPixelW = this.inventory.width * CELL;
        const gridPixelH = this.inventory.height * CELL;
        const extGridPixelW = this.externalGrid ? this.externalGrid.width * CELL : 0;
        const extGridPixelH = this.externalGrid ? this.externalGrid.height * CELL : 0;
        const bodyAreaW = 200;
        
        const totalW = bodyAreaW + gridPixelW + (this.externalGrid ? extGridPixelW + PAD * 2 : 0) + PAD * 4;
        const totalH = Math.max(gridPixelH, extGridPixelH, 300) + PAD * 3 + 40;

        this.panelX = Math.floor((canvasW - totalW) / 2);
        this.panelY = Math.floor((canvasH - totalH) / 2);

        // Darkened backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Panel
        ctx.fillStyle = PANEL_BG;
        // Left Panel (Equipment & Backpack)
        const eqW = bodyAreaW + PAD * 2;
        const bpW = gridPixelW + PAD * 2;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(this.panelX, this.panelY, eqW + bpW, totalH);
        
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('inv.title'), this.panelX + totalW / 2, this.panelY + 28);
        ctx.textAlign = 'start';

        // ─── External Grid (far left, if present) ───
        let currentDrawX = this.panelX + PAD;
        
        if (this.externalGrid) {
            this.extGridStartX = currentDrawX;
            this.extGridStartY = this.panelY + 50;
            
            ctx.fillStyle = '#ffaa33';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText(this.externalTitle, this.extGridStartX, this.extGridStartY - 6);
            
            this.renderGridBase(ctx, this.externalGrid, this.extGridStartX, this.extGridStartY, true);
            currentDrawX += this.externalGrid.width * CELL + PAD * 2;
        }

        // ─── Body Silhouette (middle/left) ────
        this.bodyCenter.x = currentDrawX + bodyAreaW / 2;
        this.bodyCenter.y = this.panelY + 50 + 150;
        this.renderBodySilhouette(ctx);
        currentDrawX += bodyAreaW + PAD * 2;

        // ─── Grid Backpack (right) ──────
        this.gridStartX = currentDrawX;
        this.gridStartY = this.panelY + 50;

        // Grid label
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(t('inv.backpack'), this.gridStartX, this.gridStartY - 6);

        this.renderGridBase(ctx, this.inventory, this.gridStartX, this.gridStartY, false);

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
            const equipped = this.activeChar ? this.activeChar.equipment.get(def.slot) : undefined;
            if (equipped) {
                ctx.fillStyle = equipped.item.color + '99';
                ctx.fillRect(slotX + 2, slotY + 2, def.w - 4, def.h - 4);
                ctx.font = '22px serif';
                ctx.textAlign = 'center';
                ctx.fillText(equipped.item.icon, slotX + def.w / 2, slotY + def.h / 2 + 7);
                ctx.textAlign = 'start';
            } else {
                ctx.font = '14px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#aaa';
                ctx.fillText(t(def.labelKey), slotX + def.w / 2, slotY + def.h / 2 + 5);
                ctx.globalAlpha = 1;
                ctx.textAlign = 'start';
            }
        }

        // Body label
        ctx.fillStyle = '#666';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('inv.equipment'), cx, cy + 85);
        ctx.textAlign = 'start';
    }

    private renderGridBase(ctx: CanvasRenderingContext2D, grid: GridInventory, gx: number, gy: number, isExt: boolean): void {
        // Empty cells
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
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
        for (const placed of grid.items) {
            if (rendered.has(placed)) continue;
            rendered.add(placed);
            this.renderItemInGrid(ctx, placed, gx, gy, false);
        }

        // Drop preview when dragging
        if (this.dragging && this.hoverCell && this.hoverCell.isExt === isExt) {
            const dropX = this.hoverCell.x;
            const dropY = this.hoverCell.y;
            const canDrop = grid.canPlace(this.dragging.item, dropX, dropY);

            for (let dy = 0; dy < this.dragging.item.gridH; dy++) {
                for (let dx = 0; dx < this.dragging.item.gridW; dx++) {
                    const cx = gx + (dropX + dx) * CELL;
                    const cy = gy + (dropY + dy) * CELL;
                    if (dropX + dx < grid.width && dropY + dy < grid.height) {
                        ctx.fillStyle = canDrop ? VALID_DROP : INVALID_DROP;
                        ctx.fillRect(cx, cy, CELL, CELL);
                    }
                }
            }
        }

        // Hover highlight (when not dragging)
        if (!this.dragging && this.hoverCell && this.hoverCell.isExt === isExt) {
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
            const targetGrid = this.hoverCell.isExt ? this.externalGrid! : this.inventory;
            const placed = targetGrid.getAt(this.hoverCell.x, this.hoverCell.y);
            if (placed) item = placed.item;
        }

        // Check equip slot hover
        if (!item && this.hoverEquip && this.activeChar) {
            const eq = this.activeChar.equipment.get(this.hoverEquip);
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

        // Text
        ctx.fillStyle = item.color || '#fff';
        ctx.font = 'bold 14px Inter, sans-serif';
        const itemName = i18n.lang === 'ko' ? item.nameKr : item.name;
        ctx.fillText(`${item.icon} ${itemName}`, tx + 8, ty + 20);

        ctx.fillStyle = '#aaa';
        ctx.font = '11px Inter, sans-serif';
        const itemDesc = (i18n.lang === 'ko' && item.descriptionKr) ? item.descriptionKr : item.description;
        ctx.fillText(itemDesc, tx + 8, ty + 38);

        let sy = 54;
        ctx.fillStyle = '#88ff88';
        if (item.stats?.atk) { ctx.fillText(`ATK +${item.stats.atk}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.def) { ctx.fillText(`DEF +${item.stats.def}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.magAtk) { ctx.fillText(`MAG +${item.stats.magAtk}`, tx + 8, ty + sy); sy += 14; }
    }
}
