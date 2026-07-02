import { ORIGINAL_LATE_STORY_ITEMS } from '../data/OriginalLateStoryItems';
import { getItemDef, type ItemDef } from '../data/ItemDB';

export const LEGENDARY_LOOT_ITEM_IDS = ORIGINAL_LATE_STORY_ITEMS
    .filter((item) => item.rewardKind === 'relic')
    .map((item) => item.currentItemId);

export function getLegendaryLootItems(): ItemDef[] {
    return LEGENDARY_LOOT_ITEM_IDS
        .map((itemId) => getItemDef(itemId))
        .filter((item): item is ItemDef => Boolean(item));
}

export function pickLegendaryLootItem(seed: string | number, salt: string): ItemDef | null {
    return pickItem(LEGENDARY_LOOT_ITEM_IDS, seed, salt);
}

export function pickItem(pool: readonly string[], seed: string | number, salt: string): ItemDef | null {
    if (pool.length === 0) return null;
    const index = hashString(`${seed}:${salt}`) % pool.length;
    return getItemDef(pool[index]) ?? null;
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0;
}
