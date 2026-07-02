import type { ItemDef } from '../data/ItemDB';
import { GridInventory } from '../inventory/GridInventory';
import { getDefaultLootSourceLabel } from '../loot/LootLabels';
import type { WorldLootContainerType } from '../loot/WorldLootTypes';

export interface LootObjectOptions {
    sourceLabel?: string;
    kind?: 'chest' | 'corpse';
    containerType?: WorldLootContainerType;
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
    public containerType?: WorldLootContainerType;
    public overflowItems: ItemDef[] = [];
    public unlocked: boolean = false;

    constructor(id: string, x: number, y: number, items: ItemDef[], options: LootObjectOptions = {}) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.sourceLabel = options.sourceLabel || getDefaultLootSourceLabel();
        this.kind = options.kind || 'chest';
        this.containerType = options.containerType;
        this.inventory = new GridInventory(
            sanitizeGridSize(options.gridW, 5),
            sanitizeGridSize(options.gridH, 5)
        );
        for (const item of items) {
            if (!this.inventory.autoPlace(item)) {
                this.overflowItems.push(item);
            }
        }
    }

    public render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, size: number): void {
        const cx = screenX + size / 2;
        const cy = screenY + size / 2;

        if (this.opened) return;

        ctx.save();
        try {
            // Draw Chest/Loot pile footprint
            ctx.fillStyle = getLootFillColor(this.kind, this.containerType);
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = getLootStrokeColor(this.kind, this.containerType);
            ctx.lineWidth = 2;
            ctx.stroke();

            // Icon
            ctx.font = `${size * 0.4}px serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText(getLootGlyph(this.kind, this.containerType), cx, cy + size * 0.15);
        } finally {
            ctx.restore();
        }
    }
}

function getLootFillColor(kind: 'chest' | 'corpse', containerType?: WorldLootContainerType): string {
    if (kind === 'corpse') return '#7d6b5a';
    switch (containerType) {
        case 'marked_cache': return '#352548';
        case 'sealed_reliquary': return '#5e487d';
        case 'regional_goods_crate': return '#8a7650';
        case 'traveler_pack': return '#6b5a4b';
        case 'supply_cache':
        default: return '#aa8855';
    }
}

function getLootStrokeColor(kind: 'chest' | 'corpse', containerType?: WorldLootContainerType): string {
    if (kind === 'corpse') return '#d8c29a';
    if (containerType === 'marked_cache') return '#ffcf6b';
    return containerType === 'sealed_reliquary' ? '#cda4ff' : '#ffff00';
}

function getLootGlyph(kind: 'chest' | 'corpse', containerType?: WorldLootContainerType): string {
    if (kind === 'corpse') return '☠';
    if (containerType === 'marked_cache') return '✦';
    if (containerType === 'sealed_reliquary') return '◆';
    if (containerType === 'regional_goods_crate') return '◇';
    return '▣';
}

function sanitizeGridSize(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.floor(value));
}
