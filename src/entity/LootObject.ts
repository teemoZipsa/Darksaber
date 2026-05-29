import { ItemDef } from '../data/ItemDB';
import { GridInventory } from '../inventory/GridInventory';

export interface LootObjectOptions {
    sourceLabel?: string;
    kind?: 'chest' | 'corpse';
    gridW?: number;
    gridH?: number;
}

/**
 * Loot on the ground or in a chest in the Raid map.
 */
export class LootObject {
    public id: string;
    public x: number;
    public y: number;
    public inventory: GridInventory;
    public opened: boolean = false;
    public sourceLabel: string;
    public kind: 'chest' | 'corpse';

    constructor(id: string, x: number, y: number, items: ItemDef[], options: LootObjectOptions = {}) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.sourceLabel = options.sourceLabel || '전리품';
        this.kind = options.kind || 'chest';
        this.inventory = new GridInventory(options.gridW || 5, options.gridH || 5);
        for (const item of items) {
            this.inventory.autoPlace(item);
        }
    }

    public render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, size: number): void {
        const cx = screenX + size / 2;
        const cy = screenY + size / 2;

        if (this.opened) return;

        // Draw Chest/Loot pile footprint
        ctx.fillStyle = '#aa8855';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon
        ctx.font = `${size * 0.4}px serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(this.kind === 'corpse' ? '☠' : '▣', cx, cy + size * 0.15);
        ctx.textAlign = 'start';
    }
}
