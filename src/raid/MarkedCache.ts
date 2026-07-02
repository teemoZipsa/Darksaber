import { getItemDef, type ItemDef } from '../data/ItemDB';

export const MASTER_KEY_ITEM_ID = 'master_key';

const PRIMARY_REWARD_IDS = [
    'orig_late_0976',
    'orig_late_0980',
    'orig_late_0984',
    'orig_late_0986',
    'orig_late_1104',
    'orig_late_1108',
] as const;

const SECONDARY_REWARD_IDS = [
    'cursed_blood_reliquary',
    'trade_astral_sigil',
    'trade_ember_core',
    'rune_vex',
    'rune_ohm',
    'gem_perfect_diamond',
] as const;

export function getMarkedCacheItems(seed: string | number): ItemDef[] {
    return [
        pickItem(PRIMARY_REWARD_IDS, seed, 'primary'),
        pickItem(SECONDARY_REWARD_IDS, seed, 'secondary'),
    ].filter((item): item is ItemDef => Boolean(item));
}

function pickItem(pool: readonly string[], seed: string | number, salt: string): ItemDef | null {
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
