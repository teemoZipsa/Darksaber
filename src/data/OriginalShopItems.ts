import ORIGINAL_SHOP_CONTENT_JSON from './content/original-shop-items.json';
import type { ItemSlot, RawItemDef } from './ItemDB';

type ItemCategory = NonNullable<RawItemDef['itemCategory']>;

export type OriginalShopTownId = 'central_castle' | 'w_forest_village' | 's_coast_town' | 'e_stronghold' | 'se_port';
interface OriginalShopRecord {
    id: string;
    townId: OriginalShopTownId;
    nameKr: string;
    slot: ItemSlot;
    iconSprite: { col: number; row: number };
    requiredLevel: number;
    maxDurability: number;
    move: number;
    atk: number;
    def: number;
    attackRange: number;
    magAtk: number;
    magDef: number;
    magicRange: number;
    commandRange: number;
    hitRate: number;
    evasion: number;
    usableClasses: string;
    descriptionKr: string;
    gridW: number;
    gridH: number;
    icon: string;
    color: string;
}
interface OriginalShopContent {
    records: OriginalShopRecord[];
    townItemIds: Record<OriginalShopTownId, string[]>;
    descriptionLabels: {
        requiredLevel: string;
        attackRange: string;
        magicRange: string;
        hitRate: string;
        evasion: string;
        usableClasses: string;
    };
}

const originalShopContent = ORIGINAL_SHOP_CONTENT_JSON as OriginalShopContent;

export const ORIGINAL_SHOP_RECORDS: OriginalShopRecord[] = originalShopContent.records;
export const ORIGINAL_SHOP_TOWN_ITEM_IDS: Record<OriginalShopTownId, string[]> = originalShopContent.townItemIds;

function roundGold(value: number): number {
    return Math.max(10, Math.round(value / 10) * 10);
}

function calculateOriginalShopBuyPrice(record: OriginalShopRecord): number {
    const raw = record.requiredLevel * 12
        + record.atk * 8
        + record.def * 10
        + record.magAtk * 8
        + record.magDef * 10
        + record.maxDurability * 0.08;
    const minimum = record.slot === 'consumable' ? 10 : 80;
    return Math.max(minimum, roundGold(raw));
}

function itemCategoryFor(slot: ItemSlot): ItemCategory {
    if (slot === 'weapon') return 'normal_weapon';
    if (slot === 'accessory' || slot === 'accessory2') return 'accessory';
    if (slot === 'consumable') return 'consumable';
    if (slot === 'head' || slot === 'body' || slot === 'boots' || slot === 'shield') return 'armor';
    if (slot === 'rune') return 'rune';
    if (slot === 'gem') return 'gem';
    return 'material';
}

function buildDescription(record: OriginalShopRecord): string {
    const labels = originalShopContent.descriptionLabels;
    const details = [
        record.descriptionKr,
        record.requiredLevel > 0 ? `${labels.requiredLevel} ${record.requiredLevel}` : null,
        record.attackRange > 0 ? `${labels.attackRange} ${record.attackRange}` : null,
        record.magicRange > 0 ? `${labels.magicRange} ${record.magicRange}` : null,
        record.hitRate !== 0 ? `${labels.hitRate} ${record.hitRate}` : null,
        record.evasion !== 0 ? `${labels.evasion} ${record.evasion}` : null,
        record.usableClasses ? `${labels.usableClasses}: ${record.usableClasses}` : null,
    ].filter(Boolean);
    return details.join(' / ');
}

function toRawItem(record: OriginalShopRecord): RawItemDef {
    const stats: RawItemDef['stats'] = {
        ...(record.atk ? { atk: record.atk } : {}),
        ...(record.def ? { def: record.def } : {}),
        ...(record.magAtk ? { magAtk: record.magAtk } : {}),
        ...(record.magDef ? { magDef: record.magDef } : {}),
        ...(record.move ? { mov: record.move } : {}),
        ...(record.commandRange ? { cmdRange: record.commandRange } : {}),
        ...(record.hitRate ? { hitRate: record.hitRate } : {}),
        ...(record.evasion ? { evasion: record.evasion } : {}),
    };

    return {
        id: record.id,
        name: record.nameKr,
        nameKr: record.nameKr,
        slot: record.slot,
        gridW: record.gridW,
        gridH: record.gridH,
        color: record.color,
        icon: record.icon,
        iconSprite: record.iconSprite,
        maxDurability: record.maxDurability,
        stats,
        ...(record.attackRange ? { attackRange: record.attackRange } : {}),
        ...(record.magicRange ? { magicRange: record.magicRange } : {}),
        description: buildDescription(record),
        descriptionKr: buildDescription(record),
        buyPrice: calculateOriginalShopBuyPrice(record),
        requiredLevel: record.requiredLevel,
        itemCategory: itemCategoryFor(record.slot),
    };
}

export const ORIGINAL_SHOP_ITEMS: RawItemDef[] = ORIGINAL_SHOP_RECORDS.map(toRawItem);
