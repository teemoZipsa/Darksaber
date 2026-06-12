import type { TilePoint } from '../field/FieldPathing';
import { requireOriginalLateStoryItem, type OriginalLateStoryItemRecord } from './OriginalLateStoryItems';
import ORIGINAL_LATE_STORY_FACTS_JSON from './content/original-late-story-facts.json';

export interface OriginalLateStoryArea {
    char: number;
    x: number;
    y: number;
    radius: number;
}

export interface OriginalLateStoryPosition {
    char: number;
    x: number;
    y: number;
}

export interface OriginalLateStoryCacheEvent {
    eventNumber: number;
    x: number;
    y: number;
    originalItemId: number;
    currentItemId: string;
}

export interface OriginalLateStoryFact {
    dungeonId: string;
    setArc: string;
    aiMember: string;
    eventMember: string;
    deoMember: string | null;
    deeMember: string | null;
    bossArea: OriginalLateStoryArea;
    staging: OriginalLateStoryPosition[];
    guardAreas: OriginalLateStoryArea[];
    cacheEvents: OriginalLateStoryCacheEvent[];
}

export type OriginalLateStoryFactMap = Record<string, OriginalLateStoryFact>;

export const ORIGINAL_LATE_STORY_FACTS = ORIGINAL_LATE_STORY_FACTS_JSON as OriginalLateStoryFactMap;

function cloneTileFromArea(area: Pick<OriginalLateStoryArea, 'x' | 'y'>): TilePoint {
    return { x: area.x, y: area.y };
}

function requireOriginalLateStoryFact(episode: number): OriginalLateStoryFact {
    const fact = ORIGINAL_LATE_STORY_FACTS[String(episode)];
    if (!fact) {
        throw new Error(`Missing original late story fact for episode ${episode}`);
    }
    return fact;
}

export function getOriginalLateStoryFact(episode: number): OriginalLateStoryFact {
    return requireOriginalLateStoryFact(episode);
}

export function getOriginalLateStoryFactByDungeon(dungeonId: string): OriginalLateStoryFact {
    const fact = Object.values(ORIGINAL_LATE_STORY_FACTS).find((entry) => entry.dungeonId === dungeonId);
    if (!fact) {
        throw new Error(`Missing original late story fact for dungeon ${dungeonId}`);
    }
    return fact;
}

export function getOriginalLateStoryBossTile(episode: number): TilePoint {
    return cloneTileFromArea(requireOriginalLateStoryFact(episode).bossArea);
}

export function getOriginalLateStoryGuardTiles(episode: number): TilePoint[] {
    return requireOriginalLateStoryFact(episode).guardAreas.map(cloneTileFromArea);
}

export function getOriginalLateStoryCacheEvents(episode: number): Array<{
    eventNumber: number;
    tile: TilePoint;
    originalItemId: number;
    itemId: string;
    originalItem: OriginalLateStoryItemRecord;
}> {
    return requireOriginalLateStoryFact(episode).cacheEvents.map((event) => {
        const originalItem = requireOriginalLateStoryItem(event.originalItemId);
        if (originalItem.currentItemId !== event.currentItemId) {
            throw new Error(`Original item ${event.originalItemId} maps to ${originalItem.currentItemId}, not ${event.currentItemId}`);
        }
        return {
            eventNumber: event.eventNumber,
            tile: { x: event.x, y: event.y },
            originalItemId: event.originalItemId,
            itemId: event.currentItemId,
            originalItem,
        };
    });
}
