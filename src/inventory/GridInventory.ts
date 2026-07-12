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
    acquiredInRaid?: boolean;
    sockets?: ItemDef[]; // Inserted runes/gems
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

    /**
     * Place an EXISTING PlacedItem instance at the given position, preserving its
     * durability / quantity / sockets / acquiredInRaid. Used by drag-and-drop moves
     * so item state survives a grid→grid relocation. Returns false if blocked.
     */
    public placeExisting(placed: PlacedItem, gx: number, gy: number): boolean {
        if (!this.canPlace(placed.item, gx, gy)) return false;
        placed.gridX = gx;
        placed.gridY = gy;
        for (let dy = 0; dy < placed.item.gridH; dy++) {
            for (let dx = 0; dx < placed.item.gridW; dx++) {
                this.grid[gy + dy][gx + dx] = placed;
            }
        }
        this.items.push(placed);
        return true;
    }

    /** Auto-place an existing PlacedItem instance in the first free slot. */
    public autoPlaceExisting(placed: PlacedItem): boolean {
        for (const target of this.items) {
            if (this.canMergeStacks(placed, target) && this.mergeStacksPreservingIncoming(placed, target)) return true;
        }
        return this.autoPlaceExistingWithoutMerge(placed);
    }

    /** Auto-place while preserving a distinct instance (pending server-confirmed loot). */
    public autoPlaceExistingWithoutMerge(placed: PlacedItem): boolean {
        for (let y = 0; y <= this.height - placed.item.gridH; y++) {
            for (let x = 0; x <= this.width - placed.item.gridW; x++) {
                if (this.canPlace(placed.item, x, y)) return this.placeExisting(placed, x, y);
            }
        }
        return false;
    }

    /** Remove an item from the grid */
    public remove(placed: PlacedItem): void {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x] === placed) {
                    this.grid[y][x] = null;
                }
            }
        }
        this.items = this.items.filter(i => i !== placed);
    }

    /** Remove all items from the grid and return them in their previous order. */
    public clear(): PlacedItem[] {
        const removed = [...this.items];
        for (let y = 0; y < this.height; y++) {
            this.grid[y].fill(null);
        }
        this.items = [];
        return removed;
    }

    /** Get the item at a specific grid cell */
    public getAt(gx: number, gy: number): PlacedItem | null {
        if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return null;
        return this.grid[gy][gx];
    }

    /** Auto-place an item in the first available slot */
    public autoPlace(item: ItemDef): PlacedItem | null {
        const stack = this.items.find((placed) => placed.item.id === item.id && placed.quantity < item.maxStack);
        if (stack) {
            stack.quantity += 1;
            return stack;
        }
        for (let y = 0; y <= this.height - item.gridH; y++) {
            for (let x = 0; x <= this.width - item.gridW; x++) {
                if (this.canPlace(item, x, y)) {
                    return this.place(item, x, y);
                }
            }
        }
        return null; // no space
    }

    public canMergeStacks(incoming: PlacedItem, target: PlacedItem): boolean {
        return incoming !== target
            && incoming.item.id === target.item.id
            && incoming.item.maxStack > 1
            && incoming.quantity + target.quantity <= incoming.item.maxStack
            && (incoming.sockets?.length ?? 0) === 0
            && (target.sockets?.length ?? 0) === 0;
    }

    public mergeStacksPreservingIncoming(incoming: PlacedItem, target: PlacedItem): boolean {
        if (!this.items.includes(target) || !this.canMergeStacks(incoming, target)) return false;
        const targetX = target.gridX;
        const targetY = target.gridY;
        const targetQuantity = target.quantity;
        const targetAcquiredInRaid = target.acquiredInRaid === true;
        const incomingAcquiredInRaid = incoming.acquiredInRaid === true;
        this.remove(target);
        incoming.quantity += targetQuantity;
        if (targetAcquiredInRaid) incoming.acquiredInRaid = true;
        if (this.placeExisting(incoming, targetX, targetY)) return true;
        incoming.quantity -= targetQuantity;
        incoming.acquiredInRaid = incomingAcquiredInRaid;
        this.placeExisting(target, targetX, targetY);
        return false;
    }

    /** Repack items by size and value, consolidating compatible legacy stacks first. */
    public sort(): void {
        const items = this.consolidateStacks([...this.items]).sort((a, b) => {
            const areaDiff = (b.item.gridW * b.item.gridH) - (a.item.gridW * a.item.gridH);
            if (areaDiff !== 0) return areaDiff;
            return b.item.baseValue - a.item.baseValue;
        });

        for (let y = 0; y < this.height; y++) {
            this.grid[y].fill(null);
        }
        this.items = [];

        for (const placed of items) {
            let didPlace = false;
            for (let y = 0; y <= this.height - placed.item.gridH && !didPlace; y++) {
                for (let x = 0; x <= this.width - placed.item.gridW; x++) {
                    if (this.canPlace(placed.item, x, y)) {
                        placed.gridX = x;
                        placed.gridY = y;
                        for (let dy = 0; dy < placed.item.gridH; dy++) {
                            for (let dx = 0; dx < placed.item.gridW; dx++) {
                                this.grid[y + dy][x + dx] = placed;
                            }
                        }
                        this.items.push(placed);
                        didPlace = true;
                        break;
                    }
                }
            }
        }
    }

    private consolidateStacks(items: PlacedItem[]): PlacedItem[] {
        const consolidated: PlacedItem[] = [];
        for (const incoming of items) {
            const target = consolidated.find((placed) => placed.item.id === incoming.item.id
                && placed.item.maxStack > 1
                && placed.quantity < placed.item.maxStack
                && (placed.acquiredInRaid === true) === (incoming.acquiredInRaid === true)
                && (placed.sockets?.length ?? 0) === 0
                && (incoming.sockets?.length ?? 0) === 0);
            if (!target) {
                consolidated.push(incoming);
                continue;
            }

            const moved = Math.min(incoming.quantity, target.item.maxStack - target.quantity);
            target.quantity += moved;
            incoming.quantity -= moved;
            if (incoming.quantity > 0) consolidated.push(incoming);
        }
        return consolidated;
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
