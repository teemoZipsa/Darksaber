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

function buildOriginalLateStoryDescription(item: OriginalLateStoryItemRecord): string {
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
    const description = buildOriginalLateStoryDescription(item);
    return {
        id: item.currentItemId,
        name: item.originalNameKr,
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
        descriptionKr: description,
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
