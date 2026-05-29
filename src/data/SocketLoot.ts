import { GEM_ITEM_IDS, RUNE_ITEM_IDS, getItemDef, type ItemDef } from './ItemDB';

type RandomFn = () => number;

const LOW_GEM_IDS = GEM_ITEM_IDS.filter((id) => id.startsWith('gem_chipped_') || id.startsWith('gem_flawed_'));
const MID_GEM_IDS = GEM_ITEM_IDS.filter((id) => id.startsWith('gem_chipped_') || id.startsWith('gem_flawed_') || id.startsWith('gem_normal_'));

export function rollChestGem(random: RandomFn = Math.random, masterRealm = false): ItemDef | null {
    const chance = masterRealm ? 0.12 : 0.08;
    if (random() >= chance) return null;
    const pool = masterRealm ? MID_GEM_IDS : LOW_GEM_IDS;
    return pickItem(pool, random);
}

export function rollBossRune(enemyLevel: number, random: RandomFn = Math.random): ItemDef | null {
    const maxRank = Math.min(RUNE_ITEM_IDS.length, Math.max(6, enemyLevel * 3));
    const pool = RUNE_ITEM_IDS.slice(0, maxRank);
    return pickItem(pool, random);
}

function pickItem(ids: string[], random: RandomFn): ItemDef | null {
    if (ids.length === 0) return null;
    const index = Math.min(ids.length - 1, Math.floor(random() * ids.length));
    return getItemDef(ids[index]) ?? null;
}
