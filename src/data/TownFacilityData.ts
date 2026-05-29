/**
 * TownFacilityData — V1 town economy facilities.
 *
 * Facilities are the visible town tabs. Shop facilities feed ShopData, while
 * non-shop facilities are rendered by the existing town panels.
 */

export type TownId =
    | 'central_castle'
    | 'w_forest_village'
    | 's_coast_town'
    | 'e_stronghold'
    | 'se_port'
    | 'nw_desert_city'
    | 'sw_hideout'
    | 'e_outpost'
    | 'master_sanctum'
    | 'astral_keep'
    | 'ember_citadel';

export type TownFacilityId =
    | 'storage'
    | 'weapon_shop'
    | 'armor_shop'
    | 'general_store'
    | 'specialty_trader'
    | 'blacksmith'
    | 'healer'
    | 'rest'
    | 'quest'
    | 'rumors'
    | 'shrine';

export type ShopFacilityId =
    | 'weapon_shop'
    | 'armor_shop'
    | 'general_store'
    | 'specialty_trader'
    | 'blacksmith'
    | 'shrine';

export interface TownFacilityMeta {
    labelKey: string;
    icon: string;
}

export const TOWN_FACILITY_META: Record<TownFacilityId, TownFacilityMeta> = {
    storage: { labelKey: 'town.tab.storage', icon: '📦' },
    weapon_shop: { labelKey: 'town.facility.weapon_shop', icon: '⚔️' },
    armor_shop: { labelKey: 'town.facility.armor_shop', icon: '🛡️' },
    general_store: { labelKey: 'town.facility.general_store', icon: '🧪' },
    specialty_trader: { labelKey: 'town.facility.specialty_trader', icon: '💎' },
    blacksmith: { labelKey: 'town.facility.blacksmith', icon: '🔨' },
    healer: { labelKey: 'town.facility.healer', icon: '✚' },
    rest: { labelKey: 'town.facility.rest', icon: '🍲' },
    quest: { labelKey: 'town.tab.quest', icon: '📜' },
    rumors: { labelKey: 'town.tab.rumors', icon: '💬' },
    shrine: { labelKey: 'town.facility.shrine', icon: '⛩️' },
};

export const SHOP_FACILITY_IDS: readonly ShopFacilityId[] = [
    'weapon_shop',
    'armor_shop',
    'general_store',
    'specialty_trader',
    'blacksmith',
    'shrine',
];

export const TOWN_FACILITIES: Record<TownId, TownFacilityId[]> = {
    central_castle: ['storage', 'weapon_shop', 'general_store', 'rest', 'healer', 'quest', 'rumors'],
    w_forest_village: ['storage', 'weapon_shop', 'general_store', 'rest', 'specialty_trader', 'rumors'],
    s_coast_town: ['storage', 'weapon_shop', 'armor_shop', 'general_store', 'rest', 'specialty_trader', 'quest'],
    e_stronghold: ['storage', 'weapon_shop', 'armor_shop', 'blacksmith', 'rest', 'healer'],
    se_port: ['storage', 'weapon_shop', 'general_store', 'rest', 'specialty_trader'],
    nw_desert_city: ['storage', 'general_store', 'rest', 'specialty_trader'],
    sw_hideout: ['storage', 'specialty_trader', 'rest', 'healer'],
    e_outpost: ['storage', 'general_store', 'healer', 'rumors'],
    master_sanctum: ['storage', 'shrine', 'specialty_trader'],
    astral_keep: ['storage', 'shrine', 'specialty_trader'],
    ember_citadel: ['storage', 'shrine', 'specialty_trader'],
};

export function isTownId(value: string | undefined): value is TownId {
    return value !== undefined && value in TOWN_FACILITIES;
}

export function isTownFacilityId(value: string | undefined): value is TownFacilityId {
    return value !== undefined && value in TOWN_FACILITY_META;
}

export function isShopFacilityId(value: string | undefined): value is ShopFacilityId {
    return SHOP_FACILITY_IDS.includes(value as ShopFacilityId);
}

export function getTownFacilities(townId: string): TownFacilityId[] {
    return isTownId(townId) ? TOWN_FACILITIES[townId] : ['storage', 'general_store', 'rumors'];
}

export function hasTownFacility(townId: string, facilityId: TownFacilityId): boolean {
    return getTownFacilities(townId).includes(facilityId);
}

export function getTownFacilityMeta(facilityId: TownFacilityId): TownFacilityMeta {
    return TOWN_FACILITY_META[facilityId];
}
