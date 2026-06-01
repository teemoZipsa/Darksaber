import type { Character } from '../character/Character';
import type { PlacedItem } from './GridInventory';

export const CARRY_FREE_WEIGHT = 10;
export const CARRY_HEAVY_WEIGHT = 35;
export const CARRY_MIN_ATB_MULTIPLIER = 0.55;

export function getPlacedItemWeight(placed: Pick<PlacedItem, 'item' | 'quantity' | 'sockets'>): number {
    const quantity = Math.max(1, placed.quantity || 1);
    const socketWeight = (placed.sockets ?? []).reduce((sum, socket) => sum + socket.weight, 0);
    return roundWeight(placed.item.weight * quantity + socketWeight);
}

export function getPlacedItemsWeight(items: readonly Pick<PlacedItem, 'item' | 'quantity' | 'sockets'>[]): number {
    return roundWeight(items.reduce((sum, placed) => sum + getPlacedItemWeight(placed), 0));
}

export function getCharacterEquipmentWeight(character: Pick<Character, 'equipment'>): number {
    return getPlacedItemsWeight([...character.equipment.values()]);
}

export function getPartyCarriedWeight(
    backpackItems: readonly Pick<PlacedItem, 'item' | 'quantity' | 'sockets'>[],
    characters: readonly Pick<Character, 'equipment'>[]
): number {
    const equipmentWeight = characters.reduce((sum, character) => sum + getCharacterEquipmentWeight(character), 0);
    return roundWeight(getPlacedItemsWeight(backpackItems) + equipmentWeight);
}

export function getCarryAtbMultiplier(weight: number): number {
    if (!Number.isFinite(weight) || weight <= CARRY_FREE_WEIGHT) return 1;
    const t = Math.min(1, (weight - CARRY_FREE_WEIGHT) / (CARRY_HEAVY_WEIGHT - CARRY_FREE_WEIGHT));
    return roundMultiplier(Math.max(CARRY_MIN_ATB_MULTIPLIER, 1 - t * (1 - CARRY_MIN_ATB_MULTIPLIER)));
}

export function getCarryAtbPercent(weight: number): number {
    return Math.round(getCarryAtbMultiplier(weight) * 100);
}

function roundWeight(value: number): number {
    return Math.round(value * 10) / 10;
}

function roundMultiplier(value: number): number {
    return Math.round(value * 1000) / 1000;
}
