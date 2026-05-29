/**
 * ShopData — Defines merchant shop inventory and pricing.
 */

import { CHIPPED_GEM_IDS, getItemDef, ItemDef } from './ItemDB';
import { ORIGINAL_SHOP_TOWN_ITEM_IDS, type OriginalShopTownId } from './OriginalShopItems';
import {
    SHOP_FACILITY_IDS,
    TOWN_FACILITIES,
    isShopFacilityId,
    isTownFacilityId,
    isTownId,
    type ShopFacilityId,
    type TownFacilityId,
    type TownId,
} from './TownFacilityData';

export type ShopKind = 'weapon' | 'armor' | 'accessory' | 'consumable';

export interface ShopItem {
    itemId: string;
    stock: number;   // -1 = unlimited
    buyPrice: number;
    shopKind: ShopKind;
    facilityId: ShopFacilityId;
}

type StockSpec = string | [itemId: string, stock: number];
type FacilityInventory = Partial<Record<ShopFacilityId, ShopItem[]>>;

const DEFAULT_SHOP_TOWN_ID: TownId = 'central_castle';
const TOWN_IDS = Object.keys(TOWN_FACILITIES) as TownId[];

const GENERAL_STORE_ITEMS: Partial<Record<TownId, StockSpec[]>> = {
    central_castle: ['herb_cheap', 'herb_common'],
    w_forest_village: ['herb_cheap', 'herb_common', 'antidote'],
    s_coast_town: ['herb_cheap', 'herb_common', 'mp_potion'],
    se_port: ['herb_cheap', 'herb_common'],
    nw_desert_city: ['herb_cheap', 'mp_potion', 'fire_herb'],
    e_outpost: ['herb_cheap'],
};

const ARMOR_SHOP_EXTRAS: Partial<Record<TownId, StockSpec[]>> = {
    e_stronghold: [
        'wooden_shield',
        'battle_t4_head',
        'battle_t4_body',
        'battle_t4_boots',
        'tactics_t4_head',
        'tactics_t4_body',
        'tactics_t4_boots',
        'repair_kit',
    ],
};

const SPECIALTY_TRADER_ITEMS: Partial<Record<TownId, StockSpec[]>> = {
    w_forest_village: [['herb_rare', 3], ['antidote', 5], 'trade_forest_resin', ['trade_mooncap_mushroom', 4]],
    s_coast_town: [['herb_rare', 2], 'mp_potion', 'trade_sea_salt', ['trade_tide_pearl', 3]],
    se_port: [['herb_legendary', 1], 'mp_potion', 'fire_herb', 'ice_herb', 'trade_imported_silk', 'trade_eastern_incense', ['power_ring', 1]],
    nw_desert_city: ['mp_potion', 'fire_herb', 'trade_desert_spice', ['trade_sun_ore', 3]],
    sw_hideout: [['herb_legendary', 1], ['antidote', 4], 'ice_herb', 'trade_contraband_relic', 'trade_shadow_amber', ['shell_ring', 1]],
    master_sanctum: [['herb_legendary', 2], 'trade_sanctum_incense'],
    astral_keep: [['herb_legendary', 2], 'trade_astral_sigil'],
    ember_citadel: [['herb_legendary', 2], 'trade_ember_core'],
};

const SHRINE_ITEMS: Partial<Record<TownId, StockSpec[]>> = {
    master_sanctum: [['heal_ring', 1]],
    astral_keep: [['shell_ring', 1]],
    ember_citadel: [['power_ring', 1]],
};

const TRADE_GOOD_SELL_MULTIPLIERS: Partial<Record<string, Partial<Record<TownId, number>>>> = {
    trade_forest_resin: {
        w_forest_village: 0.8,
        central_castle: 1.7,
        s_coast_town: 3.0,
        se_port: 3.2,
        e_stronghold: 2.2,
        nw_desert_city: 2.4,
    },
    trade_mooncap_mushroom: {
        w_forest_village: 0.8,
        central_castle: 1.8,
        s_coast_town: 3.1,
        se_port: 3.4,
        e_stronghold: 2.1,
    },
    trade_sea_salt: {
        s_coast_town: 0.8,
        central_castle: 1.5,
        w_forest_village: 1.9,
        nw_desert_city: 3.2,
        e_stronghold: 2.3,
    },
    trade_tide_pearl: {
        s_coast_town: 0.8,
        central_castle: 2.2,
        w_forest_village: 2.5,
        se_port: 1.7,
        nw_desert_city: 3.5,
    },
    trade_desert_spice: {
        nw_desert_city: 0.8,
        central_castle: 2.0,
        w_forest_village: 2.4,
        s_coast_town: 2.8,
        se_port: 3.0,
    },
    trade_sun_ore: {
        nw_desert_city: 0.8,
        central_castle: 2.1,
        e_stronghold: 1.7,
        s_coast_town: 2.9,
        se_port: 3.1,
    },
    trade_imported_silk: {
        se_port: 0.8,
        central_castle: 2.1,
        w_forest_village: 2.6,
        s_coast_town: 2.0,
        e_stronghold: 2.2,
    },
    trade_eastern_incense: {
        se_port: 0.8,
        central_castle: 2.0,
        w_forest_village: 2.7,
        s_coast_town: 2.1,
        sw_hideout: 2.3,
    },
    trade_contraband_relic: {
        sw_hideout: 0.8,
        central_castle: 2.8,
        e_stronghold: 3.0,
        se_port: 2.7,
        e_outpost: 2.4,
    },
    trade_shadow_amber: {
        sw_hideout: 0.8,
        central_castle: 2.5,
        e_stronghold: 2.8,
        se_port: 2.6,
        e_outpost: 2.2,
    },
    trade_sanctum_incense: {
        master_sanctum: 0.8,
        astral_keep: 2.4,
        ember_citadel: 2.7,
        central_castle: 3.0,
    },
    trade_astral_sigil: {
        astral_keep: 0.8,
        master_sanctum: 2.2,
        ember_citadel: 2.8,
        central_castle: 3.1,
    },
    trade_ember_core: {
        ember_citadel: 0.8,
        master_sanctum: 2.6,
        astral_keep: 3.0,
        central_castle: 3.2,
    },
};

export function getShopKindForItem(item: ItemDef): ShopKind {
    if (item.slot === 'weapon') return 'weapon';
    if (item.slot === 'accessory' || item.slot === 'accessory2' || item.slot === 'gem') return 'accessory';
    if (item.slot === 'consumable' || item.slot === 'material') return 'consumable';
    return 'armor';
}

export function getDefaultShopKindForFacility(facilityId: ShopFacilityId): ShopKind {
    if (facilityId === 'weapon_shop') return 'weapon';
    if (facilityId === 'armor_shop') return 'armor';
    if (facilityId === 'shrine') return 'accessory';
    return 'consumable';
}

function isShopKind(value: string | undefined): value is ShopKind {
    return value === 'weapon' || value === 'armor' || value === 'accessory' || value === 'consumable';
}

function isOriginalShopTownId(townId: TownId): townId is OriginalShopTownId {
    return Object.prototype.hasOwnProperty.call(ORIGINAL_SHOP_TOWN_ITEM_IDS, townId);
}

function readStockSpec(spec: StockSpec): { itemId: string; stock: number } {
    return Array.isArray(spec) ? { itemId: spec[0], stock: spec[1] } : { itemId: spec, stock: -1 };
}

function toShopItem(spec: StockSpec, facilityId: ShopFacilityId): ShopItem {
    const { itemId, stock } = readStockSpec(spec);
    const item = getItemDef(itemId);
    return {
        itemId,
        stock,
        buyPrice: item?.buyPrice ?? item?.baseValue ?? 10,
        shopKind: item ? getShopKindForItem(item) : 'consumable',
        facilityId,
    };
}

function toShopItems(specs: readonly StockSpec[] | undefined, facilityId: ShopFacilityId): ShopItem[] {
    return (specs ?? []).map((spec) => toShopItem(spec, facilityId));
}

function originalShopItemsFor(townId: TownId, facilityId: ShopFacilityId): ShopItem[] {
    if (!isOriginalShopTownId(townId)) return [];
    return ORIGINAL_SHOP_TOWN_ITEM_IDS[townId]
        .map((itemId) => toShopItem(itemId, facilityId))
        .filter((entry) => {
            if (facilityId === 'weapon_shop') return entry.shopKind === 'weapon';
            if (facilityId === 'armor_shop') return entry.shopKind === 'armor';
            if (facilityId === 'specialty_trader') return entry.shopKind === 'accessory';
            return false;
        });
}

function buildTownFacilityInventory(townId: TownId): FacilityInventory {
    const townFacilities = TOWN_FACILITIES[townId];
    const inventory: FacilityInventory = {};

    if (townFacilities.includes('weapon_shop')) {
        inventory.weapon_shop = originalShopItemsFor(townId, 'weapon_shop');
    }
    if (townFacilities.includes('armor_shop')) {
        inventory.armor_shop = [
            ...originalShopItemsFor(townId, 'armor_shop'),
            ...toShopItems(ARMOR_SHOP_EXTRAS[townId], 'armor_shop'),
        ];
    }
    if (townFacilities.includes('general_store')) {
        inventory.general_store = toShopItems(GENERAL_STORE_ITEMS[townId], 'general_store');
    }
    if (townFacilities.includes('specialty_trader')) {
        inventory.specialty_trader = [
            ...originalShopItemsFor(townId, 'specialty_trader'),
            ...toShopItems(SPECIALTY_TRADER_ITEMS[townId], 'specialty_trader'),
        ];
    }
    if (townFacilities.includes('shrine')) {
        inventory.shrine = toShopItems(SHRINE_ITEMS[townId], 'shrine');
    }
    const gemFacility = pickGemShopFacility(townFacilities);
    if (gemFacility) {
        inventory[gemFacility] = [
            ...(inventory[gemFacility] ?? []),
            ...toShopItems(CHIPPED_GEM_IDS, gemFacility),
        ];
    }

    return inventory;
}

function pickGemShopFacility(facilities: readonly TownFacilityId[]): ShopFacilityId | null {
    for (const facility of ['specialty_trader', 'general_store', 'shrine', 'weapon_shop', 'armor_shop'] as const) {
        if (facilities.includes(facility)) return facility;
    }
    return null;
}

function flattenFacilityInventory(inventory: FacilityInventory): ShopItem[] {
    return SHOP_FACILITY_IDS.flatMap((facilityId) => inventory[facilityId] ?? []);
}

function resolveTownId(townId: string | undefined): TownId {
    return isTownId(townId) ? townId : DEFAULT_SHOP_TOWN_ID;
}

function getTradeSellMultiplier(itemId: string, townId: string | undefined): number {
    const resolvedTownId = resolveTownId(townId);
    return TRADE_GOOD_SELL_MULTIPLIERS[itemId]?.[resolvedTownId] ?? 1;
}

/** Items available for purchase, grouped by town and facility. */
export const SHOP_INVENTORY_BY_TOWN_FACILITY: Record<TownId, FacilityInventory> = Object.fromEntries(
    TOWN_IDS.map((townId) => [townId, buildTownFacilityInventory(townId)])
) as Record<TownId, FacilityInventory>;

/** Backwards-compatible town inventory, flattened across shop facilities. */
export const SHOP_INVENTORY_BY_TOWN: Record<TownId, ShopItem[]> = Object.fromEntries(
    TOWN_IDS.map((townId) => [townId, flattenFacilityInventory(SHOP_INVENTORY_BY_TOWN_FACILITY[townId])])
) as Record<TownId, ShopItem[]>;

/** Backwards-compatible default inventory, used by non-town callers. */
export const SHOP_INVENTORY: ShopItem[] = SHOP_INVENTORY_BY_TOWN[DEFAULT_SHOP_TOWN_ID];

/** Sell price = 50% base, with town multipliers for trade goods only. */
export function getSellPrice(item: ItemDef, townId?: string): number {
    const basePrice = Math.floor((item.buyPrice ?? item.baseValue ?? 10) * 0.5);
    if (item.sellable === false) return basePrice;
    return Math.floor(basePrice * getTradeSellMultiplier(item.id, townId));
}

export function isSellableItem(item: ItemDef): boolean {
    return item.sellable !== false;
}

/** Get ShopItem with its full ItemDef resolved. */
export function getShopItems(townId?: string, shopKind?: ShopKind): Array<{ shopEntry: ShopItem; item: ItemDef }>;
export function getShopItems(townId: string | undefined, facilityId: TownFacilityId, shopKind?: ShopKind): Array<{ shopEntry: ShopItem; item: ItemDef }>;
export function getShopItems(townId?: string, facilityOrKind?: TownFacilityId | ShopKind, shopKind?: ShopKind): Array<{ shopEntry: ShopItem; item: ItemDef }> {
    let resolvedTownId = townId;
    let resolvedFacilityId: ShopFacilityId | undefined;
    let resolvedShopKind = shopKind;

    if (isShopKind(townId) && facilityOrKind === undefined) {
        resolvedShopKind = townId;
        resolvedTownId = undefined;
    } else if (isShopKind(facilityOrKind) && shopKind === undefined) {
        resolvedShopKind = facilityOrKind;
    } else if (isTownFacilityId(facilityOrKind)) {
        if (!isShopFacilityId(facilityOrKind)) return [];
        resolvedFacilityId = facilityOrKind;
    }

    const townInventory = SHOP_INVENTORY_BY_TOWN_FACILITY[resolveTownId(resolvedTownId)];
    const inventory = resolvedFacilityId
        ? townInventory[resolvedFacilityId] ?? []
        : flattenFacilityInventory(townInventory);

    const result: Array<{ shopEntry: ShopItem; item: ItemDef }> = [];
    for (const entry of inventory) {
        if (resolvedShopKind && entry.shopKind !== resolvedShopKind) continue;
        const item = getItemDef(entry.itemId);
        if (item?.slot === 'rune') continue;
        if (item?.slot === 'gem' && !CHIPPED_GEM_IDS.includes(item.id)) continue;
        if (item) {
            result.push({ shopEntry: entry, item });
        }
    }
    return result;
}
