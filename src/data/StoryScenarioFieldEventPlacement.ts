import { isStoryInteriorDungeon } from './StoryInteriorData';
import { getStoryScenarioEventSequence, type StoryScenarioFieldEvent } from './StoryScenarioEventData';
import type { TilePoint } from '../field/FieldPathing';
import type { WorldMap } from '../map/WorldMap';

export interface StoryScenarioFieldEventPlacement {
    dungeonId: string;
    eventId: string;
    triggerIndex: number;
    originalTile: TilePoint;
    tile: TilePoint;
}

export function getStoryScenarioFieldEventScope(event: StoryScenarioFieldEvent): 'player' | 'shared' {
    return event.scope ?? 'player';
}

export function getStoryScenarioFieldEventFlag(event: StoryScenarioFieldEvent): string {
    return event.runtimeFlag ?? event.id;
}

export function getStoryScenarioFieldEventPlacements(
    dungeonId: string,
    worldMap: WorldMap
): StoryScenarioFieldEventPlacement[] {
    if (isStoryInteriorDungeon(dungeonId)) return [];
    const sequence = getStoryScenarioEventSequence(dungeonId);
    const origin = getOriginalFieldScenarioOrigin(dungeonId);
    const dungeon = worldMap.getDungeons().find((entry) => entry.id === dungeonId);
    if (!sequence || !origin || !dungeon) return [];

    const center = worldMap.getDungeonEntranceTile(dungeon);
    const occupied = new Set<string>();
    const placements: StoryScenarioFieldEventPlacement[] = [];
    for (const event of sequence.fieldEvents) {
        event.triggerTiles.forEach((originalTile, triggerIndex) => {
            const preferred = projectOriginalFieldTile(center, origin, originalTile);
            const tile = findNearestAvailableFieldEventTile(preferred, worldMap, occupied);
            occupied.add(tileKey(tile));
            placements.push({
                dungeonId,
                eventId: event.id,
                triggerIndex,
                originalTile: { ...originalTile },
                tile,
            });
        });
    }
    return placements;
}

export function getStoryScenarioFieldEventTiles(
    dungeonId: string,
    event: StoryScenarioFieldEvent,
    worldMap: WorldMap
): TilePoint[] {
    const placements = getStoryScenarioFieldEventPlacements(dungeonId, worldMap)
        .filter((placement) => placement.eventId === event.id)
        .sort((a, b) => a.triggerIndex - b.triggerIndex);
    if (placements.length > 0) return placements.map((placement) => ({ ...placement.tile }));

    const origin = getOriginalFieldScenarioOrigin(dungeonId);
    const dungeon = worldMap.getDungeons().find((entry) => entry.id === dungeonId);
    if (!origin || !dungeon) return event.triggerTiles;

    const center = worldMap.getDungeonEntranceTile(dungeon);
    return event.triggerTiles.map((tile) => projectOriginalFieldTile(center, origin, tile));
}

export function projectStoryScenarioFieldTileToWorld(
    dungeonId: string,
    worldMap: WorldMap,
    tile: TilePoint
): TilePoint {
    const origin = getOriginalFieldScenarioOrigin(dungeonId);
    const dungeon = worldMap.getDungeons().find((entry) => entry.id === dungeonId);
    if (!origin || !dungeon) return { ...tile };

    const center = worldMap.getDungeonEntranceTile(dungeon);
    const preferred = projectOriginalFieldTile(center, origin, tile);
    return findNearestAvailableFieldEventTile(preferred, worldMap, new Set());
}

export function getOriginalFieldScenarioOrigin(dungeonId: string): TilePoint | null {
    switch (dungeonId) {
        case 'arcadia_plain':
            return { x: 11, y: 39 };
        case 'cacaora_highland':
            return { x: 24, y: 39 };
        case 'remote_village':
            return { x: 19, y: 34 };
        case 'sagunto_port':
            return { x: 10, y: 9 };
        case 'sicilio_island':
            return { x: 13, y: 15 };
        case 'dalai_lake':
            return { x: 17, y: 45 };
        case 'oasis':
            return { x: 6, y: 3 };
        case 'pyramid_front':
            return { x: 20, y: 25 };
        case 'skeria':
            return { x: 28, y: 33 };
        case 'skeria_2':
            return { x: 45, y: 53 };
        case 'valhalla_plain':
            return { x: 21, y: 20 };
        case 'airship':
            return { x: 21, y: 23 };
        default:
            return null;
    }
}

function projectOriginalFieldTile(center: TilePoint, origin: TilePoint, tile: TilePoint): TilePoint {
    return {
        x: center.x + clampFieldEventOffset(tile.x - origin.x),
        y: center.y + clampFieldEventOffset(tile.y - origin.y),
    };
}

function clampFieldEventOffset(delta: number): number {
    return Math.max(-4, Math.min(4, Math.round(delta / 6)));
}

function findNearestAvailableFieldEventTile(preferred: TilePoint, worldMap: WorldMap, occupied: Set<string>): TilePoint {
    for (let radius = 0; radius <= 8; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
                const tile = { x: preferred.x + dx, y: preferred.y + dy };
                if (occupied.has(tileKey(tile))) continue;
                if (!worldMap.isWalkable(tile.x, tile.y)) continue;
                return tile;
            }
        }
    }
    return { ...preferred };
}

function tileKey(tile: TilePoint): string {
    return `${tile.x},${tile.y}`;
}
