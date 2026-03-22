/**
 * ShopData — Defines merchant shop inventory and pricing.
 */

import { getItemDef, ItemDef } from './ItemDB';

export interface ShopItem {
    itemId: string;
    stock: number;   // -1 = unlimited
    buyPrice: number;
}

/** Items available for purchase at the merchant */
export const SHOP_INVENTORY: ShopItem[] = [
    // Weapons
    { itemId: 'short_sword', stock: -1, buyPrice: 80 },
    { itemId: 'long_sword',  stock: -1, buyPrice: 200 },

    // Tier 1 Armor (all branches)
    { itemId: 'battle_t1_head',  stock: -1, buyPrice: 90 },
    { itemId: 'battle_t1_body',  stock: -1, buyPrice: 130 },
    { itemId: 'battle_t1_boots', stock: -1, buyPrice: 70 },
    { itemId: 'tactics_t1_body', stock: -1, buyPrice: 130 },
    { itemId: 'healer_t1_body',  stock: -1, buyPrice: 130 },
    { itemId: 'magic_t1_body',   stock: -1, buyPrice: 130 },

    // Tier 2 Armor (sample)
    { itemId: 'battle_t2_body',  stock: 3, buyPrice: 210 },
    { itemId: 'magic_t2_body',   stock: 3, buyPrice: 210 },

    // Accessories
    { itemId: 'sword_manual', stock: -1, buyPrice: 300 },
    { itemId: 'power_ring',   stock: 2,  buyPrice: 800 },
    { itemId: 'shell_ring',   stock: -1, buyPrice: 500 },
    { itemId: 'amulet',       stock: -1, buyPrice: 400 },
    { itemId: 'heal_ring',    stock: 1,  buyPrice: 5000 },

    // Consumables (약초 시리즈)
    { itemId: 'herb_cheap',     stock: -1, buyPrice: 10 },
    { itemId: 'herb_common',    stock: -1, buyPrice: 50 },
    { itemId: 'herb_rare',      stock: -1, buyPrice: 200 },
    { itemId: 'herb_legendary', stock: -1, buyPrice: 500 },
    { itemId: 'mp_potion',      stock: -1, buyPrice: 25 },
    { itemId: 'repair_kit',     stock: -1, buyPrice: 50 },
];

/** Sell price = 50% of buy price */
export function getSellPrice(item: ItemDef): number {
    return Math.floor((item.buyPrice || 10) * 0.5);
}

/** Get ShopItem with its full ItemDef resolved */
export function getShopItems(): Array<{ shopEntry: ShopItem; item: ItemDef }> {
    const result: Array<{ shopEntry: ShopItem; item: ItemDef }> = [];
    for (const entry of SHOP_INVENTORY) {
        const item = getItemDef(entry.itemId);
        if (item) {
            result.push({ shopEntry: entry, item });
        }
    }
    return result;
}
