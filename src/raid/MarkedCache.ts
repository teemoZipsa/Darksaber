import type { ItemDef } from '../data/ItemDB';
import { pickItem, pickLegendaryLootItem } from '../loot/LegendaryLootData';

export const MASTER_KEY_ITEM_ID = 'master_key';

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
        pickLegendaryLootItem(seed, 'marked:legendary'),
        pickItem(SECONDARY_REWARD_IDS, seed, 'secondary'),
    ].filter((item): item is ItemDef => Boolean(item));
}
