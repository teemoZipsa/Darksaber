/**
 * InventoryUI — canvas-rendered overlay for Tarkov-style inventory management.
 * Draws equipment slots on left, grid backpack on right.
 * Supports mouse hover tooltips and click to select/move items.
 */

import { GridInventory, PlacedItem } from './GridInventory';
import { ItemDef } from '../data/ItemDB';

const CELL_SIZE = 48;
const PADDING = 16;
const PANEL_BG = 'rgba(10, 12, 20, 0.92)';
const CELL_BG = 'rgba(30, 35, 50, 0.9)';
const CELL_BORDER = 'rgba(60, 70, 90, 0.6)';
const HIGHLIGHT_COLOR = 'rgba(0, 229, 255, 0.3)';
const ITEM_BORDER = 'rgba(200, 200, 255, 0.5)';

export class InventoryUI {
    private inventory: GridInventory;
    private visible: boolean = false;
    private hoveredCell: { x: number; y: number } | null = null;
    private selectedItem: PlacedItem | null = null;

    // Panel position (calculated on render)
    private panelX: number = 0;
    private panelY: number = 0;
    private gridStartX: number = 0;
    private gridStartY: number = 0;

    // Equipment slots
    private equipSlots: { label: string; x: number; y: number; w: number; h: number; slot: string }[] = [];

    constructor(inventory: GridInventory) {
        this.inventory = inventory;
    }

    public toggle(): void {
        this.visible = !this.visible;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    /** Handle mouse move for hover effects */
    public onMouseMove(screenX: number, screenY: number): void {
        if (!this.visible) return;

        const relX = screenX - this.gridStartX;
        const relY = screenY - this.gridStartY;
        const cellX = Math.floor(relX / CELL_SIZE);
        const cellY = Math.floor(relY / CELL_SIZE);

        if (cellX >= 0 && cellX < this.inventory.width &&
            cellY >= 0 && cellY < this.inventory.height &&
            relX >= 0 && relY >= 0) {
            this.hoveredCell = { x: cellX, y: cellY };
        } else {
            this.hoveredCell = null;
        }
    }

    /** Handle click for item selection */
    public onClick(screenX: number, screenY: number): void {
        if (!this.visible || !this.hoveredCell) return;

        const item = this.inventory.getAt(this.hoveredCell.x, this.hoveredCell.y);
        if (item) {
            this.selectedItem = (this.selectedItem === item) ? null : item;
        } else {
            this.selectedItem = null;
        }
    }

    /** Render the full inventory UI overlay */
    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        // Calculate panel dimensions
        const gridPixelW = this.inventory.width * CELL_SIZE;
        const gridPixelH = this.inventory.height * CELL_SIZE;
        const equipW = CELL_SIZE * 3 + PADDING;
        const totalW = equipW + gridPixelW + PADDING * 4;
        const totalH = gridPixelH + PADDING * 3 + 40; // +40 for title

        this.panelX = Math.floor((canvasW - totalW) / 2);
        this.panelY = Math.floor((canvasH - totalH) / 2);

        // Draw darkened backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Panel background
        ctx.fillStyle = PANEL_BG;
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.lineWidth = 2;
        this.roundRect(ctx, this.panelX, this.panelY, totalW, totalH, 12);

        // Title
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️ Inventory', this.panelX + totalW / 2, this.panelY + 30);
        ctx.textAlign = 'start';

        // ─── Equipment Slots (left side) ────
        const eqX = this.panelX + PADDING;
        const eqY = this.panelY + 50;
        this.renderEquipSlots(ctx, eqX, eqY);

        // ─── Grid Backpack (right side) ─────
        this.gridStartX = this.panelX + equipW + PADDING * 2;
        this.gridStartY = this.panelY + 50;
        this.renderGrid(ctx);

        // ─── Tooltip ────────────────────────
        this.renderTooltip(ctx, canvasW, canvasH);
    }

    private renderEquipSlots(ctx: CanvasRenderingContext2D, startX: number, startY: number): void {
        const slots = [
            { label: '🪖 Head', y: 0 },
            { label: '🦺 Body', y: 1 },
            { label: '🗡️ Weapon', y: 2 },
            { label: '🛡️ Shield', y: 3 },
            { label: '💍 Acc', y: 4 },
        ];

        for (const slot of slots) {
            const sy = startY + slot.y * (CELL_SIZE + 8);
            ctx.fillStyle = CELL_BG;
            ctx.strokeStyle = CELL_BORDER;
            ctx.lineWidth = 1;
            ctx.fillRect(startX, sy, CELL_SIZE * 2, CELL_SIZE);
            ctx.strokeRect(startX, sy, CELL_SIZE * 2, CELL_SIZE);

            ctx.fillStyle = '#888';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(slot.label, startX + 6, sy + CELL_SIZE / 2 + 4);
        }
    }

    private renderGrid(ctx: CanvasRenderingContext2D): void {
        const gx = this.gridStartX;
        const gy = this.gridStartY;

        // Draw empty cells
        for (let y = 0; y < this.inventory.height; y++) {
            for (let x = 0; x < this.inventory.width; x++) {
                const cx = gx + x * CELL_SIZE;
                const cy = gy + y * CELL_SIZE;

                ctx.fillStyle = CELL_BG;
                ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = CELL_BORDER;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(cx, cy, CELL_SIZE, CELL_SIZE);
            }
        }

        // Draw placed items
        const rendered = new Set<PlacedItem>();
        for (const placed of this.inventory.items) {
            if (rendered.has(placed)) continue;
            rendered.add(placed);

            const ix = gx + placed.gridX * CELL_SIZE;
            const iy = gy + placed.gridY * CELL_SIZE;
            const iw = placed.item.gridW * CELL_SIZE;
            const ih = placed.item.gridH * CELL_SIZE;

            // Item background
            ctx.fillStyle = placed.item.color + '88';
            ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);

            // Item border
            const isSelected = this.selectedItem === placed;
            ctx.strokeStyle = isSelected ? '#00e5ff' : ITEM_BORDER;
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(ix + 2, iy + 2, iw - 4, ih - 4);

            // Item icon
            ctx.font = '20px serif';
            ctx.textAlign = 'center';
            ctx.fillText(placed.item.icon, ix + iw / 2, iy + ih / 2 + 6);
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

        // Hover highlight
        if (this.hoveredCell) {
            const hx = gx + this.hoveredCell.x * CELL_SIZE;
            const hy = gy + this.hoveredCell.y * CELL_SIZE;
            ctx.fillStyle = HIGHLIGHT_COLOR;
            ctx.fillRect(hx, hy, CELL_SIZE, CELL_SIZE);
        }
    }

    private renderTooltip(ctx: CanvasRenderingContext2D, _canvasW: number, _canvasH: number): void {
        if (!this.hoveredCell) return;
        const placed = this.inventory.getAt(this.hoveredCell.x, this.hoveredCell.y);
        if (!placed) return;

        const item = placed.item;
        const tooltipX = this.gridStartX + (this.hoveredCell.x + 1) * CELL_SIZE + 8;
        const tooltipY = this.gridStartY + this.hoveredCell.y * CELL_SIZE;
        const tw = 200;
        const th = 100;

        ctx.fillStyle = 'rgba(15, 15, 30, 0.95)';
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.fillRect(tooltipX, tooltipY, tw, th);
        ctx.strokeRect(tooltipX, tooltipY, tw, th);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText(`${item.icon} ${item.nameKr}`, tooltipX + 8, tooltipY + 20);

        ctx.fillStyle = '#aaa';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(item.description, tooltipX + 8, tooltipY + 38);

        // Stats
        let statY = 54;
        ctx.fillStyle = '#88ff88';
        if (item.stats?.atk) { ctx.fillText(`ATK +${item.stats.atk}`, tooltipX + 8, tooltipY + statY); statY += 14; }
        if (item.stats?.def) { ctx.fillText(`DEF +${item.stats.def}`, tooltipX + 8, tooltipY + statY); statY += 14; }
        if (item.stats?.magAtk) { ctx.fillText(`MAG +${item.stats.magAtk}`, tooltipX + 8, tooltipY + statY); statY += 14; }

        // Durability
        if (item.maxDurability > 1) {
            ctx.fillStyle = '#ffaa00';
            ctx.fillText(`Durability: ${placed.durability}/${item.maxDurability}`, tooltipX + 8, tooltipY + statY);
        }
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
