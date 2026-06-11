/**
 * ItemDB — Item definitions with Tarkov-style grid sizes.
 * Each item has a width × height in inventory grid cells.
 */

import ITEMS_JSON from './content/items.json';
import type { MasterBranch } from './ClassTree';
import type { CharacterStats } from './Stats';

export type ItemSlot = 'weapon' | 'shield' | 'head' | 'body' | 'boots' | 'accessory' | 'accessory2' | 'consumable' | 'material' | 'rune' | 'gem';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend' | 'unique';
export type ItemUseEffect = { type: 'recover'; hp?: number; mp?: number };
export type SocketHostKind = 'weapon' | 'armor' | 'shield';
export type SocketInsertKind = 'rune' | 'gem';
export interface ItemIconSprite {
    col: number;
    row: number;
}

export interface ItemDef {
    id: string;
    name: string;
    nameKr: string;
    slot: ItemSlot;
    gridW: number;    // width in inventory cells
    gridH: number;    // height in inventory cells
    color: string;    // display color in inventory
    icon: string;     // emoji/text icon
    iconSprite?: ItemIconSprite; // 32x32 cell in the original item atlas
    maxDurability: number;
    stats?: Partial<CharacterStats>;
    attackRange?: number;
    magicRange?: number;
    description: string;
    descriptionKr?: string;
    rarity: ItemRarity;
    weight: number;
    baseValue: number;
    buyPrice?: number;     // gold cost to buy from shop
    sellable?: boolean;    // false for quest/bound items that cannot be sold
    requiredTier?: number; // minimum tier to equip (1-7)
    requiredLevel?: number; // original Darksaber equipment level requirement
    branch?: MasterBranch; // which branch can equip (battle/tactics/healer/magic)
    useEffect?: ItemUseEffect;
    
    // -- Sin Eater New Fields --
    itemCategory?: 'divine_weapon' | 'normal_weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'rune' | 'gem';
    maxSockets?: number;
    socketTypes?: SocketInsertKind[];
    socketEffects?: Partial<Record<SocketHostKind, Partial<CharacterStats>>>;
}

export type RawItemDef = Omit<ItemDef, 'rarity' | 'weight' | 'baseValue'> & Partial<Pick<ItemDef, 'rarity' | 'weight' | 'baseValue'>>;

function inferRarity(item: RawItemDef): ItemRarity {
    if (item.rarity) return item.rarity;
    if (item.itemCategory === 'divine_weapon') return 'legend';
    if (item.id === 'heal_ring' || item.id === 'void_crystal') return 'legend';
    if (item.id === 'corrupted_blade' || item.id === 'shadow_cloak') return 'epic';
    const price = item.buyPrice ?? 0;
    const statTotal = item.slot === 'consumable'
        ? 0
        : Object.values(item.stats ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
    if (price >= 5000 || statTotal >= 40) return 'legend';
    if (price >= 1000 || statTotal >= 25) return 'epic';
    if (price >= 300 || statTotal >= 12) return 'rare';
    if (price >= 50 || statTotal >= 5) return 'uncommon';
    return 'common';
}

function inferWeight(item: RawItemDef): number {
    if (item.weight !== undefined) return item.weight;
    const cells = item.gridW * item.gridH;
    switch (item.slot) {
        case 'weapon': return Number((cells * 0.75).toFixed(1));
        case 'shield': return Number((cells * 0.65).toFixed(1));
        case 'body': return Number((cells * 0.9).toFixed(1));
        case 'head':
        case 'boots': return Number((cells * 0.45).toFixed(1));
        case 'accessory':
        case 'accessory2':
        case 'rune':
        case 'gem': return 0.1;
        case 'consumable': return Number(Math.max(0.1, cells * 0.2).toFixed(1));
        default: return Number(Math.max(0.1, cells * 0.3).toFixed(1));
    }
}

function inferBaseValue(item: RawItemDef): number {
    if (item.baseValue !== undefined) return item.baseValue;
    if (item.buyPrice !== undefined) return item.buyPrice;
    const statTotal = Object.values(item.stats ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
    const rarityMult: Record<ItemRarity, number> = {
        common: 1,
        uncommon: 2,
        rare: 4,
        epic: 8,
        legend: 18,
        unique: 30,
    };
    const rarity = inferRarity(item);
    return Math.max(10, Math.round((item.gridW * item.gridH * 20 + statTotal * 18) * rarityMult[rarity]));
}

export function normalizeItemDef(item: RawItemDef): ItemDef {
    const rarity = inferRarity(item);
    const maxSockets = item.maxSockets ?? inferMaxSockets(item, rarity);
    return {
        ...item,
        rarity,
        weight: inferWeight(item),
        baseValue: inferBaseValue(item),
        ...(maxSockets !== undefined ? { maxSockets } : {}),
        ...(maxSockets ? { socketTypes: item.socketTypes ?? ['rune', 'gem'] } : {}),
    };
}

function inferMaxSockets(item: RawItemDef, rarity: ItemRarity): number | undefined {
    if (!isSocketableHostSlot(item.slot)) return undefined;
    if (rarity === 'common' || rarity === 'uncommon') return 1;
    if (rarity === 'rare') return 2;
    return 3;
}

function isSocketableHostSlot(slot: ItemSlot): boolean {
    return slot === 'weapon' || slot === 'shield' || slot === 'head' || slot === 'body' || slot === 'boots';
}

export function isCombatRecoveryConsumable(item: ItemDef): boolean {
    if (item.slot !== 'consumable' || item.useEffect?.type !== 'recover') return false;
    return Number(item.useEffect.hp ?? 0) > 0 || Number(item.useEffect.mp ?? 0) > 0;
}

export function getCombatRecovery(item: ItemDef): { hp: number; mp: number } {
    if (!isCombatRecoveryConsumable(item)) return { hp: 0, mp: 0 };
    return {
        hp: Math.max(0, Math.floor(item.useEffect?.hp ?? 0)),
        mp: Math.max(0, Math.floor(item.useEffect?.mp ?? 0)),
    };
}
const ITEM_CONTENT = ITEMS_JSON as ItemDef[];

export const ITEMS: ItemDef[] = ITEM_CONTENT;
export const RUNE_ITEM_IDS = ITEMS.filter((item) => item.slot === 'rune').map((item) => item.id);
export const GEM_ITEM_IDS = ITEMS.filter((item) => item.slot === 'gem').map((item) => item.id);
export const CHIPPED_GEM_IDS = GEM_ITEM_IDS.filter((id) => id.startsWith('gem_chipped_'));

/** Lookup item by ID */
export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS.find(item => item.id === id);
}

/** Get all armor for a specific branch and tier */
export function getArmorForBranchTier(branch: MasterBranch, tier: number): ItemDef[] {
    return ITEMS.filter(item => item.branch === branch && item.requiredTier === tier);
}

/** Get all armor equippable by a branch up to a certain tier */
export function getEquippableArmor(branch: MasterBranch, maxTier: number): ItemDef[] {
    return ITEMS.filter(item => item.branch === branch && (item.requiredTier || 1) <= maxTier);
}
