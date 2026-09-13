import type { ItemIconSprite } from './ItemDB';

/** Original coordinates are unchanged; new art lives in a separate 32px atlas. */
export const ITEM_ICON_SHEETS = {
    items: '/assets/images/items/darksaber_items.png',
    supplementalItems: '/assets/images/items/supplemental_items.png',
} as const;

const cell = (col: number, row: number): ItemIconSprite => ({ col, row });
const supplement = (col: number): ItemIconSprite => ({ col, row: 0, sheet: 'supplementalItems' });

// Visually matched to the existing atlas. These assignments supply artwork,
// not claims about the original item's identity, stats or GETITEM number.
const ITEM_ARTWORK: Readonly<Record<string, ItemIconSprite>> = {
    absolution_edge: cell(70, 1),
    short_sword: cell(9, 1),
    long_sword: cell(10, 1),
    staff: cell(19, 0),
    short_bow: cell(15, 0),
    lance: cell(32, 1),
    wooden_shield: cell(28, 0),
    repair_kit: supplement(0),
    master_key: cell(8, 1),
    antidote: cell(88, 0),
    fire_herb: cell(90, 0),
    ice_herb: cell(91, 0),
    trade_forest_resin: supplement(1),
    trade_mooncap_mushroom: supplement(2),
    trade_sea_salt: supplement(3),
    trade_tide_pearl: cell(61, 5),
    trade_desert_spice: supplement(4),
    trade_sun_ore: cell(73, 4),
    trade_imported_silk: supplement(5),
    trade_eastern_incense: supplement(6),
    trade_contraband_relic: cell(25, 7),
    cursed_blood_reliquary: supplement(7),
    trade_shadow_amber: supplement(8),
    trade_sanctum_incense: supplement(6),
    trade_astral_sigil: cell(88, 7),
    trade_ember_core: cell(58, 5),
    bounty_elite_proof: cell(43, 4),
    quest_bomb: cell(7, 1),
    orig_story_ep16_oil_can: supplement(9),
    orig_story_ep17_lamp: supplement(10),
    quest_burgos_key: cell(12, 3),
    quest_cain_necklace: cell(66, 0),
    quest_sacred_sword: cell(26, 0),
    orig_story_0315_stone_snake: cell(94, 0),
    orig_story_0008_star_knife: cell(8, 0),
    orig_story_0397_yellow_flower: cell(93, 2),
    orig_ep19_shard_0386: cell(3, 1),
    orig_ep19_shard_0387: cell(4, 1),
    orig_ep19_shard_0388: cell(5, 1),
    orig_ep19_shard_0389: cell(6, 1),
    sword_manual: supplement(11),
    power_ring: cell(31, 6),
    shell_ring: cell(32, 6),
    heal_ring: cell(64, 0),
    amulet: cell(67, 0),
    corrupted_blade: cell(87, 5),
    shadow_cloak: cell(64, 7),
    void_crystal: cell(98, 4),
};

// Same material shares a silhouette across battle/tactics/healer branches.
// Each tier still has its own material/color, and magic uses cloth equipment.
const ARMOR_ARTWORK = {
    physical: {
        head: [cell(38, 0), cell(5, 2), cell(1, 2), cell(2, 2), cell(3, 2), cell(44, 0), cell(4, 2)],
        body: [cell(48, 0), cell(27, 2), cell(28, 2), cell(33, 2), cell(35, 2), cell(38, 2), cell(34, 2)],
        boots: [cell(70, 0), cell(71, 0), cell(40, 2), cell(42, 2), cell(44, 2), cell(43, 2), cell(45, 2)],
    },
    magic: {
        head: [cell(11, 2), cell(12, 2), cell(13, 2), cell(84, 4), cell(16, 2), cell(87, 4), cell(17, 2)],
        body: [cell(53, 0), cell(56, 0), cell(54, 0), cell(55, 0), cell(63, 2), cell(67, 2), cell(66, 2)],
        boots: [cell(52, 2), cell(53, 2), cell(54, 2), cell(55, 2), cell(57, 2), cell(90, 3), cell(58, 2)],
    },
} as const;

const GEM_ARTWORK: Readonly<Record<string, ItemIconSprite>> = {
    amethyst: cell(98, 4),
    diamond: cell(62, 5),
    emerald: cell(74, 4),
    ruby: cell(58, 5),
    sapphire: cell(2, 5),
    skull: cell(59, 0),
    topaz: cell(73, 4),
};

/** Only fills missing artwork. Existing original item definitions win. */
export function getSupplementaryItemArtwork(id: string): ItemIconSprite | undefined {
    const explicit = ITEM_ARTWORK[id];
    if (explicit) return { ...explicit };

    const armor = /^(battle|tactics|healer|magic)_t([1-7])_(head|body|boots)$/.exec(id);
    if (armor) {
        const series = ARMOR_ARTWORK[armor[1] === 'magic' ? 'magic' : 'physical'];
        const slot = armor[3] as keyof typeof series;
        return { ...series[slot][Number(armor[2]) - 1] };
    }

    // Socket families share their object art; names and rarity convey rank.
    if (/^rune_[a-z]+$/.test(id)) return supplement(12);
    const gem = /^gem_(?:chipped|flawed|normal|flawless|perfect)_([a-z]+)$/.exec(id);
    const gemSprite = gem && GEM_ARTWORK[gem[1]];
    return gemSprite ? { ...gemSprite } : undefined;
}
