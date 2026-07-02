import type { CharacterStats } from '../data/Stats';
import type { ItemDef } from '../data/ItemDB';
import type { PlacedItem } from '../inventory/GridInventory';

export const CURSED_ARTIFACT_ATB_MULTIPLIER = 0.65;
export const CURSED_ARTIFACT_MIN_ATB_MULTIPLIER = 0.42;
export const CURSED_ARTIFACT_DAMAGE_RATIO = 0.06;
export const CURSED_ARTIFACT_MIN_DAMAGE = 4;

export function isCursedArtifactItem(item: Pick<ItemDef, 'cursedArtifact'>): boolean {
    return item.cursedArtifact === true;
}

export function countCursedArtifactsInPlacedItems(items: readonly Pick<PlacedItem, 'item' | 'quantity'>[]): number {
    return items.reduce((sum, placed) => {
        if (!isCursedArtifactItem(placed.item)) return sum;
        return sum + Math.max(1, Math.floor(placed.quantity || 1));
    }, 0);
}

export function countCursedArtifactsInItemCounts(
    itemCounts: ReadonlyMap<string, number>,
    getItem: (itemId: string) => ItemDef | undefined
): number {
    let count = 0;
    for (const [itemId, quantity] of itemCounts.entries()) {
        const item = getItem(itemId);
        if (!item || !isCursedArtifactItem(item)) continue;
        count += Math.max(1, Math.floor(quantity || 1));
    }
    return count;
}

export function getCursedArtifactAtbMultiplier(count: number): number {
    if (!Number.isFinite(count) || count <= 0) return 1;
    const multiplier = CURSED_ARTIFACT_ATB_MULTIPLIER ** Math.floor(count);
    return roundMultiplier(Math.max(CURSED_ARTIFACT_MIN_ATB_MULTIPLIER, multiplier));
}

export function getCursedArtifactTurnDamage(stats: Pick<CharacterStats, 'maxHp' | 'hp'>, count: number): number {
    if (!Number.isFinite(count) || count <= 0) return 0;
    const maxHp = Math.max(1, Math.floor(stats.maxHp || stats.hp || 1));
    const perArtifact = Math.max(CURSED_ARTIFACT_MIN_DAMAGE, Math.ceil(maxHp * CURSED_ARTIFACT_DAMAGE_RATIO));
    return perArtifact * Math.floor(count);
}

function roundMultiplier(value: number): number {
    return Math.round(value * 1000) / 1000;
}
