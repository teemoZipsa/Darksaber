import { ItemDef } from '../data/ItemDB';
import { GridInventory } from '../inventory/GridInventory';

/**
 * Loot on the ground or in a chest in the Raid map.
 */
export class LootObject {
    public id: string;
    public x: number;
    public y: number;
    public inventory: GridInventory;
    public opened: boolean = false;

    constructor(id: string, x: number, y: number, items: ItemDef[]) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.inventory = new GridInventory(5, 5); // Default 5x5 wrapper
        for (const item of items) {
            this.inventory.autoPlace(item);
        }
    }

    public render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, size: number): void {
        const cx = screenX + size / 2;
        const cy = screenY + size / 2;

        if (this.opened) {
            // Draw empty bag / open chest
            ctx.fillStyle = 'rgba(150, 150, 120, 0.5)';
            ctx.fillRect(screenX + size * 0.2, screenY + size * 0.2, size * 0.6, size * 0.6);
            return;
        }

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
        ctx.fillText('📦', cx, cy + size * 0.15);
        ctx.textAlign = 'start';
    }
}
