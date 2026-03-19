/**
 * GridInventory — Tarkov-style 2D grid backpack.
 * Items occupy variable W×H cells. Supports placement, removal, and auto-sort.
 */

import { ItemDef } from '../data/ItemDB';

export interface PlacedItem {
    item: ItemDef;
    gridX: number;      // top-left cell X
    gridY: number;      // top-left cell Y
    durability: number;
    quantity: number;
}

export class GridInventory {
    public readonly width: number;
    public readonly height: number;
    private grid: (PlacedItem | null)[][];
    public items: PlacedItem[] = [];

    constructor(width: number = 10, height: number = 6) {
        this.width = width;
        this.height = height;
        this.grid = [];
        for (let y = 0; y < height; y++) {
            this.grid[y] = new Array(width).fill(null);
        }
    }

    /** Check if an item can be placed at the given position */
    public canPlace(item: ItemDef, gx: number, gy: number): boolean {
        if (gx < 0 || gy < 0) return false;
        if (gx + item.gridW > this.width || gy + item.gridH > this.height) return false;

        for (let dy = 0; dy < item.gridH; dy++) {
            for (let dx = 0; dx < item.gridW; dx++) {
                if (this.grid[gy + dy][gx + dx] !== null) return false;
            }
        }
        return true;
    }

    /** Place an item at the given position. Returns true if successful. */
    public place(item: ItemDef, gx: number, gy: number): PlacedItem | null {
        if (!this.canPlace(item, gx, gy)) return null;

        const placed: PlacedItem = {
            item, gridX: gx, gridY: gy,
            durability: item.maxDurability,
            quantity: 1
        };

        for (let dy = 0; dy < item.gridH; dy++) {
            for (let dx = 0; dx < item.gridW; dx++) {
                this.grid[gy + dy][gx + dx] = placed;
            }
        }

        this.items.push(placed);
        return placed;
    }

    /** Remove an item from the grid */
    public remove(placed: PlacedItem): void {
        for (let dy = 0; dy < placed.item.gridH; dy++) {
            for (let dx = 0; dx < placed.item.gridW; dx++) {
                const cy = placed.gridY + dy;
                const cx = placed.gridX + dx;
                if (cy < this.height && cx < this.width) {
                    if (this.grid[cy][cx] === placed) {
                        this.grid[cy][cx] = null;
                    }
                }
            }
        }
        this.items = this.items.filter(i => i !== placed);
    }

    /** Get the item at a specific grid cell */
    public getAt(gx: number, gy: number): PlacedItem | null {
        if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return null;
        return this.grid[gy][gx];
    }

    /** Auto-place an item in the first available slot */
    public autoPlace(item: ItemDef): PlacedItem | null {
        for (let y = 0; y <= this.height - item.gridH; y++) {
            for (let x = 0; x <= this.width - item.gridW; x++) {
                if (this.canPlace(item, x, y)) {
                    return this.place(item, x, y);
                }
            }
        }
        return null; // no space
    }

    /** Check if inventory is full (no 1x1 space available) */
    public isFull(): boolean {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x] === null) return false;
            }
        }
        return true;
    }
}
