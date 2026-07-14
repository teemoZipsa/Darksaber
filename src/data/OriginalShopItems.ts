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

const ORIGINAL_SHOP_EXACT_ENGLISH_NAMES: Record<string, string> = {
    '힘의 지팡이': 'Staff of Strength',
    '불꽃의 로드': 'Flame Rod',
    '얼음의 로드': 'Ice Rod',
    '아르마다': 'Armada',
    '바리사다': 'Barisada',
    '크리사오르': 'Chrysaor',
    '윈드 캐니어스': 'Wind Canius',
    '더블 스매쉬': 'Double Smash',
    '프람베르그': 'Flamberge',
    '아말탐의 활': "Amaltam's Bow",
    '큐리어벨의 활': "Curiervel's Bow",
    '트라이트너': 'Traitner',
    '골디안 스피어': 'Goldian Spear',
    '데빌로니아': 'Devilonia',
    '메가 헬리온': 'Mega Hellion',
};

const ORIGINAL_SHOP_ENGLISH_NAME_PARTS: ReadonlyArray<readonly [string, string]> = [
    ['스피리트', 'Spirit'],
    ['브론즈', 'Bronze'],
    ['아이언', 'Iron'],
    ['실버', 'Silver'],
    ['미스릴', 'Mithril'],
    ['골드', 'Gold'],
    ['프리즈', 'Freeze'],
    ['썬더', 'Thunder'],
    ['드래곤', 'Dragon'],
    ['포이즌', 'Poison'],
    ['엘리멘탈', 'Elemental'],
    ['스타', 'Star'],
    ['나이트', 'Knight'],
    ['드레인', 'Drain'],
    ['마스터', 'Master'],
    ['킬러', 'Killer'],
    ['엘핀', 'Elfin'],
    ['힐링', 'Healing'],
    ['잠비아', 'Zambia'],
    ['레이피어', 'Rapier'],
    ['세이버', 'Saber'],
    ['크로스보우', 'Crossbow'],
    ['할버트', 'Halberd'],
    ['스피어', 'Spear'],
    ['실드', 'Shield'],
    ['랜스', 'Lance'],
    ['스태프', 'Staff'],
    ['완드', 'Wand'],
    ['보우', 'Bow'],
    ['소드', 'Sword'],
    ['로드', 'Rod'],
    ['잭 나이프', 'Jack Knife'],
    ['단검', 'Dagger'],
];

function buildEnglishName(record: OriginalShopRecord): string {
    const exact = ORIGINAL_SHOP_EXACT_ENGLISH_NAMES[record.nameKr];
    if (exact) return exact;
    return ORIGINAL_SHOP_ENGLISH_NAME_PARTS.reduce(
        (name, [source, replacement]) => name.split(source).join(replacement),
        record.nameKr,
    );
}

function buildEnglishDescription(record: OriginalShopRecord): string {
    const details = [
        'Original Darksaber equipment.',
        record.requiredLevel > 0 ? `Required level ${record.requiredLevel}` : null,
        record.attackRange > 0 ? `Attack range ${record.attackRange}` : null,
        record.magicRange > 0 ? `Magic range ${record.magicRange}` : null,
        record.hitRate !== 0 ? `Hit rate ${record.hitRate}` : null,
        record.evasion !== 0 ? `Evasion ${record.evasion}` : null,
        record.usableClasses ? 'Class-restricted' : null,
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
        name: buildEnglishName(record),
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
        description: buildEnglishDescription(record),
        descriptionKr: buildDescription(record),
        buyPrice: calculateOriginalShopBuyPrice(record),
        requiredLevel: record.requiredLevel,
        itemCategory: itemCategoryFor(record.slot),
    };
}

export const ORIGINAL_SHOP_ITEMS: RawItemDef[] = ORIGINAL_SHOP_RECORDS.map(toRawItem);
