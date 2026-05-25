import { ItemDef, ItemSlot } from '../data/ItemDB';
import { PlacedItem } from '../inventory/GridInventory';

export type RaidResultType = 'SURVIVED' | 'DEAD' | 'MIA';

export interface ItemSnapshot {
    id: string;
    name: string;
    nameKr: string;
    rarity: ItemDef['rarity'];
    weight: number;
    baseValue: number;
    quantity: number;
}

export interface EquipmentLoss {
    characterId: string;
    characterName: string;
    slot: ItemSlot;
    item: ItemSnapshot;
}

export interface RaidOutcome {
    result: RaidResultType;
    elapsedSeconds: number;
    kills: number;
    departureTownId: string;
    extractionTownId?: string;
    looted: ItemSnapshot[];
    secured: ItemSnapshot[];
    lost: ItemSnapshot[];
    equipmentLost: EquipmentLoss[];
}

export interface EquippedCharacterLike {
    id: string;
    name: string;
    equipment: Map<ItemSlot, PlacedItem>;
}

export interface RaidLossPlan {
    backpackLost: ItemSnapshot[];
    equipmentLost: EquipmentLoss[];
}

export function snapshotItem(item: ItemDef, quantity = 1): ItemSnapshot {
    return {
        id: item.id,
        name: item.name,
        nameKr: item.nameKr,
        rarity: item.rarity,
        weight: item.weight,
        baseValue: item.baseValue,
        quantity,
    };
}

export function snapshotPlacedItem(placed: PlacedItem): ItemSnapshot {
    return snapshotItem(placed.item, placed.quantity);
}

export function snapshotPlacedItems(items: readonly PlacedItem[]): ItemSnapshot[] {
    return items.map(snapshotPlacedItem);
}

export function mergeSnapshots(items: readonly ItemSnapshot[]): ItemSnapshot[] {
    const merged = new Map<string, ItemSnapshot>();
    for (const item of items) {
        const key = `${item.id}:${item.rarity}:${item.baseValue}:${item.weight}`;
        const existing = merged.get(key);
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            merged.set(key, { ...item });
        }
    }
    return [...merged.values()];
}

export function computeRaidFailureLoss(
    backpackItems: readonly PlacedItem[],
    characters: readonly EquippedCharacterLike[],
    random: () => number = Math.random
): RaidLossPlan {
    const equipmentLost: EquipmentLoss[] = [];

    for (const character of characters) {
        const equipped = [...character.equipment.entries()];
        if (equipped.length === 0) continue;

        const selectedIndex = Math.min(equipped.length - 1, Math.floor(random() * equipped.length));
        const [slot, placed] = equipped[selectedIndex];
        equipmentLost.push({
            characterId: character.id,
            characterName: character.name,
            slot,
            item: snapshotPlacedItem(placed),
        });
    }

    return {
        backpackLost: snapshotPlacedItems(backpackItems),
        equipmentLost,
    };
}

