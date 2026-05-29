/**
 * ShopData — Defines merchant shop inventory and pricing.
 */

import { getItemDef, ItemDef } from './ItemDB';
import { ORIGINAL_SHOP_TOWN_ITEM_IDS, type OriginalShopTownId } from './OriginalShopItems';

export type ShopKind = 'weapon' | 'armor' | 'accessory' | 'consumable';

export interface ShopItem {
    itemId: string;
    stock: number;   // -1 = unlimited
    buyPrice: number;
    shopKind: ShopKind;
}

const DEFAULT_SHOP_TOWN_ID: OriginalShopTownId = 'central_castle';
const COMMON_CONSUMABLE_IDS = ['herb_cheap', 'herb_common', 'herb_rare', 'herb_legendary', 'mp_potion', 'repair_kit'];

export function getShopKindForItem(item: ItemDef): ShopKind {
    if (item.slot === 'weapon') return 'weapon';
    if (item.slot === 'accessory' || item.slot === 'accessory2' || item.slot === 'gem' || item.slot === 'rune' || item.slot === 'sin_core') return 'accessory';
    if (item.slot === 'consumable') return 'consumable';
    return 'armor';
}

function toShopItem(itemId: string, stock = -1): ShopItem {
    const item = getItemDef(itemId);
    return {
        itemId,
        stock,
        buyPrice: item?.buyPrice ?? item?.baseValue ?? 10,
        shopKind: item ? getShopKindForItem(item) : 'consumable',
    };
}

function buildTownInventory(townId: OriginalShopTownId): ShopItem[] {
    return [
        ...ORIGINAL_SHOP_TOWN_ITEM_IDS[townId].map((itemId) => toShopItem(itemId)),
        ...COMMON_CONSUMABLE_IDS.map((itemId) => toShopItem(itemId)),
    ];
}

/** Items available for purchase, grouped by the current town. */
export const SHOP_INVENTORY_BY_TOWN: Record<OriginalShopTownId, ShopItem[]> = {
    central_castle: buildTownInventory('central_castle'),
    w_forest_village: buildTownInventory('w_forest_village'),
    s_coast_town: buildTownInventory('s_coast_town'),
    e_stronghold: buildTownInventory('e_stronghold'),
    se_port: buildTownInventory('se_port'),
};

/** Backwards-compatible default inventory, used by non-town callers. */
export const SHOP_INVENTORY: ShopItem[] = SHOP_INVENTORY_BY_TOWN[DEFAULT_SHOP_TOWN_ID];

/** Sell price = 50% of buy price, falling back to normalized base value. */
export function getSellPrice(item: ItemDef): number {
    return Math.floor((item.buyPrice ?? item.baseValue ?? 10) * 0.5);
}

export function isSellableItem(item: ItemDef): boolean {
    return item.sellable !== false;
}

function isShopKind(value: string | undefined): value is ShopKind {
    return value === 'weapon' || value === 'armor' || value === 'accessory' || value === 'consumable';
}

/** Get ShopItem with its full ItemDef resolved. */
export function getShopItems(townId?: string, shopKind?: ShopKind): Array<{ shopEntry: ShopItem; item: ItemDef }> {
    if (isShopKind(townId) && shopKind === undefined) {
        shopKind = townId;
        townId = undefined;
    }
    const inventory = SHOP_INVENTORY_BY_TOWN[(townId ?? DEFAULT_SHOP_TOWN_ID) as OriginalShopTownId] ?? SHOP_INVENTORY;
    const result: Array<{ shopEntry: ShopItem; item: ItemDef }> = [];
    for (const entry of inventory) {
        if (shopKind && entry.shopKind !== shopKind) continue;
        const item = getItemDef(entry.itemId);
        if (item) {
            result.push({ shopEntry: entry, item });
        }
    }
    return result;
}
