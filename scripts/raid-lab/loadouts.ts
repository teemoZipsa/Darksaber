import { getItemDef } from '../../src/data/ItemDB';
import {
    STARTER_CONSUMABLE_ITEM_IDS,
    STARTER_WEAPON_ITEM_ID,
    getStarterBodyArmorId,
} from '../../src/data/StarterKitData';
import type { InventorySaveItem, CharacterSave } from '../../src/shared/CharacterSave';
import type { InventoryItemCountSnapshot } from '../../src/net/WorldProtocol';
import type {
    RaidLabConserveId,
    RaidLabLoadoutId,
    RaidLabSupplyId,
} from './types';

const RECOVERY_ITEM_IDS = [
    'herb_cheap',
    'herb_common',
    'herb_rare',
    'herb_legendary',
    'mp_potion',
] as const;

const HEAL_ITEM_PRIORITY = ['herb_common', 'herb_cheap', 'herb_rare', 'herb_legendary'] as const;

export interface SupplyStack {
    itemId: string;
    quantity: number;
}

export function getConserveHealThreshold(conserve: RaidLabConserveId): number {
    switch (conserve) {
        case 'spend':
            return 0.55;
        case 'hoard':
            return 0.2;
        case 'standard':
        default:
            return 0.35;
    }
}

/** Cautious keeps its historical baseline when conserve=standard. */
export function getCautiousHealThreshold(conserve: RaidLabConserveId): number {
    switch (conserve) {
        case 'spend':
            return 0.7;
        case 'hoard':
            return 0.35;
        case 'standard':
        default:
            return 0.55;
    }
}

export function getCautiousRestThreshold(conserve: RaidLabConserveId): number {
    switch (conserve) {
        case 'spend':
            return 0.6;
        case 'hoard':
            return 0.25;
        case 'standard':
        default:
            return 0.45;
    }
}

/** Extract-phase heal gate; standard keeps the historical 0.5 cutoff. */
export function getExtractHealThreshold(conserve: RaidLabConserveId): number {
    switch (conserve) {
        case 'spend':
            return 0.55;
        case 'hoard':
            return 0.2;
        case 'standard':
        default:
            return 0.5;
    }
}

export function applyRaidLabLoadout(save: CharacterSave, classKey: string, loadout: RaidLabLoadoutId): void {
    const branchBody = getStarterBodyArmorId(classKey);
    const branch = branchBody.replace(/_t1_body$/, '');

    switch (loadout) {
        case 'bare':
            // Leave save equipment alone; bare join path ignores bonuses (regression-safe).
            return;
        case 'light':
            save.equipment = {
                ...equipmentSlot('weapon', STARTER_WEAPON_ITEM_ID),
            };
            removeBallastFromInventory(save);
            return;
        case 'standard':
            save.equipment = {
                ...equipmentSlot('weapon', STARTER_WEAPON_ITEM_ID),
                ...equipmentSlot('body', branchBody),
            };
            removeBallastFromInventory(save);
            return;
        case 'heavy':
            save.equipment = {
                ...equipmentSlot('weapon', STARTER_WEAPON_ITEM_ID),
                ...equipmentSlot('shield', 'wooden_shield'),
                ...equipmentSlot('head', `${branch}_t1_head`),
                ...equipmentSlot('body', branchBody),
                ...equipmentSlot('boots', `${branch}_t1_boots`),
            };
            placeBallastSwords(save, 2);
            return;
        default: {
            const _exhaustive: never = loadout;
            return _exhaustive;
        }
    }
}

export function applyRaidLabSupply(save: CharacterSave, supply: RaidLabSupplyId): SupplyStack[] {
    clearRecoveryItems(save);
    const stacks = resolveSupplyStacks(supply);
    placeSupplyStacks(save, stacks);
    return stacks;
}

export function resolveSupplyStacks(supply: RaidLabSupplyId): SupplyStack[] {
    switch (supply) {
        case 'none':
            return [];
        case 'lab':
            return [{ itemId: 'herb_common', quantity: 3 }];
        case 'starter': {
            const counts = new Map<string, number>();
            for (const itemId of STARTER_CONSUMABLE_ITEM_IDS) {
                counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
            }
            return [...counts.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
        }
        case 'rich':
            return [
                { itemId: 'herb_common', quantity: 6 },
                { itemId: 'mp_potion', quantity: 2 },
            ];
        default: {
            const _exhaustive: never = supply;
            return _exhaustive;
        }
    }
}

export function carriedItemsFromStacks(stacks: readonly SupplyStack[]): InventoryItemCountSnapshot[] {
    return stacks
        .filter((stack) => stack.quantity > 0)
        .map((stack) => ({ itemId: stack.itemId, quantity: stack.quantity }));
}

export function pickHealItemId(carried: ReadonlyMap<string, number>): string | null {
    for (const itemId of HEAL_ITEM_PRIORITY) {
        if ((carried.get(itemId) ?? 0) > 0) return itemId;
    }
    return null;
}

export function countHealQuantity(carried: ReadonlyMap<string, number>): number {
    let total = 0;
    for (const itemId of HEAL_ITEM_PRIORITY) {
        total += Math.max(0, Math.floor(carried.get(itemId) ?? 0));
    }
    return total;
}

function equipmentSlot(slot: string, itemId: string): Record<string, unknown> {
    const item = getItemDef(itemId);
    if (!item || item.slot !== slot) return {};
    return {
        [slot]: {
            itemId,
            gridX: 0,
            gridY: 0,
            quantity: 1,
            durability: item.maxDurability,
        },
    };
}

function clearRecoveryItems(save: CharacterSave): void {
    save.inventory.items = save.inventory.items.filter((item) => (
        !RECOVERY_ITEM_IDS.includes(item.itemId as typeof RECOVERY_ITEM_IDS[number])
    ));
}

function removeBallastFromInventory(save: CharacterSave): void {
    save.inventory.items = save.inventory.items.filter((item) => item.itemId !== 'long_sword');
}

function placeBallastSwords(save: CharacterSave, count: number): void {
    removeBallastFromInventory(save);
    const def = getItemDef('long_sword');
    if (!def) return;
    for (let i = 0; i < count; i++) {
        const slot = findOpenInventorySlot(
            buildOccupancy(save.inventory),
            save.inventory.width,
            save.inventory.height,
            def.gridW,
            def.gridH,
        );
        if (!slot) break;
        save.inventory.items.push({
            itemId: 'long_sword',
            gridX: slot.gridX,
            gridY: slot.gridY,
            quantity: 1,
            durability: def.maxDurability,
        });
    }
}

function placeSupplyStacks(save: CharacterSave, stacks: readonly SupplyStack[]): void {
    for (const stack of stacks) {
        const def = getItemDef(stack.itemId);
        if (!def || stack.quantity <= 0) continue;
        let remaining = stack.quantity;
        while (remaining > 0) {
            const existing = save.inventory.items.find((entry) => (
                entry.itemId === stack.itemId && entry.quantity < def.maxStack
            ));
            if (existing) {
                const room = def.maxStack - existing.quantity;
                const add = Math.min(room, remaining);
                existing.quantity += add;
                remaining -= add;
                continue;
            }
            const slot = findOpenInventorySlot(
                buildOccupancy(save.inventory),
                save.inventory.width,
                save.inventory.height,
                def.gridW,
                def.gridH,
            );
            if (!slot) break;
            const quantity = Math.min(def.maxStack, remaining);
            save.inventory.items.push({
                itemId: stack.itemId,
                gridX: slot.gridX,
                gridY: slot.gridY,
                quantity,
                durability: def.maxDurability,
            } satisfies InventorySaveItem);
            remaining -= quantity;
        }
    }
}

function buildOccupancy(inventory: CharacterSave['inventory']): boolean[][] {
    const occupied = Array.from({ length: inventory.height }, () => (
        Array.from({ length: inventory.width }, () => false)
    ));
    for (const item of inventory.items) {
        const def = getItemDef(item.itemId);
        const w = def?.gridW ?? 1;
        const h = def?.gridH ?? 1;
        for (let y = item.gridY; y < item.gridY + h; y++) {
            for (let x = item.gridX; x < item.gridX + w; x++) {
                if (y >= 0 && y < inventory.height && x >= 0 && x < inventory.width) {
                    occupied[y]![x] = true;
                }
            }
        }
    }
    return occupied;
}

function findOpenInventorySlot(
    occupied: boolean[][],
    width: number,
    height: number,
    itemW: number,
    itemH: number,
): { gridX: number; gridY: number } | null {
    for (let y = 0; y <= height - itemH; y++) {
        for (let x = 0; x <= width - itemW; x++) {
            let blocked = false;
            for (let dy = 0; dy < itemH && !blocked; dy++) {
                for (let dx = 0; dx < itemW; dx++) {
                    if (occupied[y + dy]![x + dx]) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (!blocked) return { gridX: x, gridY: y };
        }
    }
    return null;
}
