import ORIGINAL_LATE_STORY_ITEMS_JSON from './content/original-late-story-items.json';
import type { RawItemDef } from './ItemDB';

export type OriginalLateStoryRewardKind = 'relic' | 'mark';

export interface OriginalLateStoryItemSourceEvent {
    episode: number;
    dungeonId: string;
    setArc: string;
    eventMember: string;
    eventNumber: number;
}

export interface OriginalLateStoryItemRecord {
    originalItemId: number;
    currentItemId: string;
    rewardKind: OriginalLateStoryRewardKind;
    originalNameKr: string;
    originalDescriptionKr: string;
    slot: RawItemDef['slot'];
    gridW: number;
    gridH: number;
    color: string;
    icon: string;
    iconSprite: NonNullable<RawItemDef['iconSprite']>;
    maxDurability: number;
    requiredLevel: number;
    originalMagicId: number;
    originalPrice: number;
    usableClasses: string;
    stats: NonNullable<RawItemDef['stats']>;
    attackRange?: number;
    magicRange?: number;
    sourceEvents: OriginalLateStoryItemSourceEvent[];
}

interface OriginalLateStoryItemContent {
    items: OriginalLateStoryItemRecord[];
}

const content = ORIGINAL_LATE_STORY_ITEMS_JSON as OriginalLateStoryItemContent;

export const ORIGINAL_LATE_STORY_ITEMS: readonly OriginalLateStoryItemRecord[] = content.items;

function buildOriginalLateStoryKoreanDescription(item: OriginalLateStoryItemRecord): string {
    const sourceSummary = item.sourceEvents
        .map((source) => `${source.eventMember} EVENT ${source.eventNumber}`)
        .join(', ');
    const details = [
        item.originalDescriptionKr,
        item.requiredLevel > 0 ? `장착레벨 ${item.requiredLevel}` : null,
        item.attackRange ? `공격범위 ${item.attackRange}` : null,
        item.magicRange ? `마법범위 ${item.magicRange}` : null,
        item.originalMagicId > 0 ? `원작 발동마법 ${item.originalMagicId}` : null,
        item.usableClasses ? `사용가능: ${item.usableClasses}` : null,
        sourceSummary ? `원작 출처 ${sourceSummary}` : null,
        `원작 GETITEM ${item.originalItemId}`,
    ].filter(Boolean);
    return details.join(' / ');
}

const ORIGINAL_LATE_STORY_ENGLISH_NAMES: Record<string, string> = {
    orig_late_0976: 'Moonlight',
    orig_late_0980: 'Cupid',
    orig_late_0984: 'Silver Arrow',
    orig_late_0986: 'Forsaken',
    orig_late_0992: 'Pyriphlegethon',
    orig_late_0997: 'Izener',
    orig_late_1002: 'Garius',
    orig_late_1005: 'Larsian',
    orig_late_1007: 'Celestial Emperor',
    orig_late_1010: 'Guardness Shoes',
    orig_late_1027: 'Seryunius',
    orig_late_1030: 'Marsyas',
    orig_late_1052: 'Dycus',
    orig_late_1104: 'Eldikaiser',
    orig_late_1108: 'Material Bow',
    orig_late_1111: 'Hellfire Lance',
    orig_late_1113: 'Crimson Crash',
    orig_late_1116: 'Elina',
    orig_late_1119: 'Cecillion',
    orig_late_1122: 'Reginen',
    orig_late_1125: 'Kelmillion',
    orig_late_1128: 'Krakes',
    orig_late_1131: 'Arvagen',
    orig_late_1134: 'Dicymus',
    orig_late_1137: 'Arinoa Robe',
    orig_late_1140: 'Stinian',
    orig_late_1143: 'Heledian',
    orig_late_1168: 'Battle Master Mark',
    orig_late_1169: 'Tactics Master Mark',
    orig_late_1170: 'Magic Master Mark',
};

function buildOriginalLateStoryEnglishDescription(item: OriginalLateStoryItemRecord): string {
    const sourceSummary = item.sourceEvents
        .map((source) => `${source.eventMember} EVENT ${source.eventNumber}`)
        .join(', ');
    const details = [
        `Original Darksaber ${item.rewardKind}.`,
        item.requiredLevel > 0 ? `Required level ${item.requiredLevel}` : null,
        item.attackRange ? `Attack range ${item.attackRange}` : null,
        item.magicRange ? `Magic range ${item.magicRange}` : null,
        item.originalMagicId > 0 ? `Original spell ${item.originalMagicId}` : null,
        item.usableClasses ? 'Class-restricted' : null,
        sourceSummary ? `Original source ${sourceSummary}` : null,
        `Original GETITEM ${item.originalItemId}`,
    ].filter(Boolean);
    return details.join(' / ');
}

function itemCategoryFor(slot: RawItemDef['slot']): NonNullable<RawItemDef['itemCategory']> {
    if (slot === 'weapon') return 'normal_weapon';
    if (slot === 'accessory' || slot === 'accessory2') return 'accessory';
    if (slot === 'material') return 'material';
    if (slot === 'rune') return 'rune';
    if (slot === 'gem') return 'gem';
    if (slot === 'consumable') return 'consumable';
    return 'armor';
}

function toRawItemDef(item: OriginalLateStoryItemRecord): RawItemDef {
    const description = buildOriginalLateStoryEnglishDescription(item);
    const descriptionKr = buildOriginalLateStoryKoreanDescription(item);
    return {
        id: item.currentItemId,
        name: ORIGINAL_LATE_STORY_ENGLISH_NAMES[item.currentItemId]
            ?? `Original Relic ${item.originalItemId}`,
        nameKr: item.originalNameKr,
        slot: item.slot,
        gridW: item.gridW,
        gridH: item.gridH,
        color: item.color,
        icon: item.icon,
        iconSprite: item.iconSprite,
        maxDurability: item.maxDurability,
        stats: item.stats,
        ...(item.attackRange ? { attackRange: item.attackRange } : {}),
        ...(item.magicRange ? { magicRange: item.magicRange } : {}),
        description,
        descriptionKr,
        rarity: 'unique',
        requiredLevel: item.requiredLevel,
        itemCategory: itemCategoryFor(item.slot),
        ...(item.rewardKind === 'mark' ? { sellable: false } : {}),
    };
}

export const ORIGINAL_LATE_STORY_REWARD_ITEMS: RawItemDef[] = ORIGINAL_LATE_STORY_ITEMS.map(toRawItemDef);

const ORIGINAL_LATE_STORY_ITEM_BY_ID = new Map<number, OriginalLateStoryItemRecord>(
    ORIGINAL_LATE_STORY_ITEMS.map((item) => [item.originalItemId, item]),
);

export function getOriginalLateStoryItem(originalItemId: number): OriginalLateStoryItemRecord | null {
    return ORIGINAL_LATE_STORY_ITEM_BY_ID.get(originalItemId) ?? null;
}

export function requireOriginalLateStoryItem(originalItemId: number): OriginalLateStoryItemRecord {
    const item = getOriginalLateStoryItem(originalItemId);
    if (!item) {
        throw new Error(`Missing original late story item record for original item ${originalItemId}`);
    }
    return item;
}

export function getOriginalLateStoryItemsForSourceEvent(episode: number, eventNumber: number): OriginalLateStoryItemRecord[] {
    return ORIGINAL_LATE_STORY_ITEMS.filter((item) =>
        item.sourceEvents.some((source) => source.episode === episode && source.eventNumber === eventNumber)
    );
}

export function getOriginalLateStoryItemIds(): number[] {
    return ORIGINAL_LATE_STORY_ITEMS.map((item) => item.originalItemId);
}
