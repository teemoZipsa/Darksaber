export const WORLD_LOOT_CONTAINER_TYPES = [
    'supply_cache',
    'traveler_pack',
    'regional_goods_crate',
    'sealed_reliquary',
    'marked_cache',
] as const;

export type WorldLootContainerType = typeof WORLD_LOOT_CONTAINER_TYPES[number];
