import ORIGINAL_LATE_STORY_ITEMS_JSON from './content/original-late-story-items.json';

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
    sourceEvents: OriginalLateStoryItemSourceEvent[];
}

interface OriginalLateStoryItemContent {
    items: OriginalLateStoryItemRecord[];
}

const content = ORIGINAL_LATE_STORY_ITEMS_JSON as OriginalLateStoryItemContent;

export const ORIGINAL_LATE_STORY_ITEMS: readonly OriginalLateStoryItemRecord[] = content.items;

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

export function getOriginalLateStoryItemIds(): number[] {
    return ORIGINAL_LATE_STORY_ITEMS.map((item) => item.originalItemId);
}
