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
}
interface OriginalShopContent {
    records: OriginalShopRecord[];
    townItemIds: Record<OriginalShopTownId, string[]>;
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

function gridFor(record: OriginalShopRecord): { gridW: number; gridH: number } {
    if (record.slot === 'shield') return { gridW: 2, gridH: 2 };
    if (record.slot === 'body') return { gridW: 2, gridH: 3 };
    if (record.slot === 'head' || record.slot === 'boots') return { gridW: 2, gridH: 2 };
    if (record.nameKr.includes('보우') || record.nameKr.includes('활')) return { gridW: 2, gridH: 3 };
    if (record.nameKr.includes('랜스') || record.nameKr.includes('스피어') || record.nameKr.includes('할버트') || record.descriptionKr.includes('창')) return { gridW: 1, gridH: 5 };
    if (record.nameKr.includes('로드') || record.nameKr.includes('스태프') || record.nameKr.includes('완드') || record.descriptionKr.includes('지팡이')) return { gridW: 1, gridH: 4 };
    return { gridW: 1, gridH: 3 };
}

function iconFor(record: OriginalShopRecord): string {
    if (record.slot === 'shield') return '🛡️';
    if (record.slot === 'body') return '🦺';
    if (record.slot === 'head') return '⛑️';
    if (record.slot === 'boots') return '🥾';
    if (record.nameKr.includes('보우') || record.nameKr.includes('활')) return '🏹';
    if (record.nameKr.includes('로드') || record.nameKr.includes('스태프') || record.nameKr.includes('완드') || record.descriptionKr.includes('지팡이')) return '🪄';
    if (record.nameKr.includes('랜스') || record.nameKr.includes('스피어') || record.nameKr.includes('할버트') || record.descriptionKr.includes('창')) return '🔱';
    return '🗡️';
}

function colorFor(record: OriginalShopRecord): string {
    if (record.slot === 'shield' || record.slot === 'body' || record.slot === 'head' || record.slot === 'boots') return '#8aa0b8';
    if (record.nameKr.includes('보우') || record.nameKr.includes('활')) return '#b9873c';
    if (record.nameKr.includes('로드') || record.nameKr.includes('스태프') || record.nameKr.includes('완드') || record.descriptionKr.includes('지팡이')) return '#8b5ed7';
    if (record.nameKr.includes('랜스') || record.nameKr.includes('스피어') || record.nameKr.includes('할버트') || record.descriptionKr.includes('창')) return '#9da8b4';
    return '#b8a48c';
}

function buildDescription(record: OriginalShopRecord): string {
    const details = [
        record.descriptionKr,
        record.requiredLevel > 0 ? `장착레벨 ${record.requiredLevel}` : null,
        record.attackRange > 0 ? `공격범위 ${record.attackRange}` : null,
        record.magicRange > 0 ? `마법범위 ${record.magicRange}` : null,
        record.hitRate !== 0 ? `명중률 ${record.hitRate}` : null,
        record.evasion !== 0 ? `회피율 ${record.evasion}` : null,
        record.usableClasses ? `사용가능: ${record.usableClasses}` : null,
    ].filter(Boolean);
    return details.join(' / ');
}

function toRawItem(record: OriginalShopRecord): RawItemDef {
    const grid = gridFor(record);
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
        gridW: grid.gridW,
        gridH: grid.gridH,
        color: colorFor(record),
        icon: iconFor(record),
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
