import type { ItemSlot } from '../data/ItemDB';
import type { PlacedItem } from '../inventory/GridInventory';

export const DEFAULT_BASIC_ATTACK_RANGE = 1;

export function normalizeBasicAttackRange(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 1
        ? Math.floor(value)
        : DEFAULT_BASIC_ATTACK_RANGE;
}

export function getEquippedWeaponAttackRange(
    equipment: ReadonlyMap<ItemSlot, PlacedItem> | undefined,
): number {
    return normalizeBasicAttackRange(equipment?.get('weapon')?.item.attackRange);
}
