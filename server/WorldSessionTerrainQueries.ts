import {
    getStoryInteriorLayout,
    getStoryInteriorTileAt,
    type StoryInteriorLayout,
} from '../src/data/StoryInteriorData';
import type { FieldPassableQuery, TilePoint } from '../src/field/FieldPathing';
import { hasLineOfSight } from '../src/field/LineOfSight';
import {
    isTerrainLineOfSightBlocking,
    isTerrainPassable,
} from '../src/field/TerrainRules';
import type { WorldMap } from '../src/map/WorldMap';
import type { ServerActor, ServerEnemy, ServerPlayer } from './WorldSessionTypes';

export interface WorldSessionTerrainQueryContext {
    worldMap: WorldMap;
    players: ReadonlyMap<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    enemies: ReadonlyMap<string, ServerEnemy>;
}

export function isWorldSessionFieldPassable(
    context: WorldSessionTerrainQueryContext,
    query: FieldPassableQuery
): boolean {
    return isWorldSessionFieldPassableForOwner(context, query);
}

export function isWorldSessionFieldPassableForOwner(
    context: WorldSessionTerrainQueryContext,
    query: FieldPassableQuery,
    ownerPlayerId?: string
): boolean {
    const queryOwnerPlayerId = ownerPlayerId ?? getWorldSessionEntityOwnerPlayerId(context, query.actorId);
    const queryScenarioPlayerId = ownerPlayerId ?? getWorldSessionScenarioOwnerPlayerId(context, query.actorId);
    const tile = getWorldSessionServerTileAt(context, query, queryScenarioPlayerId ?? queryOwnerPlayerId ?? undefined);
    if (!isTerrainPassable(tile)) return false;
    for (const actor of context.actors.values()) {
        if (actor.id === query.actorId || actor.isDead) continue;
        const actorOwner = context.players.get(actor.ownerPlayerId);
        if (actorOwner?.activeDungeonId && actor.ownerPlayerId !== queryOwnerPlayerId) continue;
        if (queryScenarioPlayerId && actor.ownerPlayerId !== queryScenarioPlayerId) continue;
        if (actor.tile.x === query.x && actor.tile.y === query.y) return false;
    }
    for (const entry of context.enemies.values()) {
        const enemy = entry.enemy;
        if (enemy.id === query.actorId || enemy.stats.hp <= 0) continue;
        if (entry.scenarioPlayerId && entry.scenarioPlayerId !== queryOwnerPlayerId) continue;
        if (queryScenarioPlayerId && entry.scenarioPlayerId !== queryScenarioPlayerId) continue;
        if (enemy.gridX === query.x && enemy.gridY === query.y) return false;
    }
    return true;
}

export function getWorldSessionServerTileAt(
    context: WorldSessionTerrainQueryContext,
    tile: TilePoint,
    ownerPlayerId?: string | null
): ReturnType<WorldMap['getTileAt']> {
    const layout = getWorldSessionActiveInteriorLayoutForOwner(context, ownerPlayerId);
    return layout ? getStoryInteriorTileAt(layout, tile.x, tile.y) : context.worldMap.getTileAt(tile.x, tile.y);
}

export function getWorldSessionServerBoundsForOwner(
    context: WorldSessionTerrainQueryContext,
    ownerPlayerId?: string | null
): ReturnType<WorldMap['getBoundsTiles']> {
    const layout = getWorldSessionActiveInteriorLayoutForOwner(context, ownerPlayerId);
    return layout ? { width: layout.width, height: layout.height } : context.worldMap.getBoundsTiles();
}

export function getWorldSessionActiveInteriorLayoutForOwner(
    context: WorldSessionTerrainQueryContext,
    ownerPlayerId?: string | null
): StoryInteriorLayout | null {
    if (!ownerPlayerId) return null;
    const player = context.players.get(ownerPlayerId);
    return player?.activeDungeonId ? getStoryInteriorLayout(player.activeDungeonId) : null;
}

export function getWorldSessionEntityOwnerPlayerId(
    context: WorldSessionTerrainQueryContext,
    entityId?: string
): string | null {
    if (!entityId) return null;
    const actor = context.actors.get(entityId);
    if (actor) return actor.ownerPlayerId;
    return getWorldSessionScenarioOwnerPlayerId(context, entityId);
}

export function getWorldSessionScenarioOwnerPlayerId(
    context: WorldSessionTerrainQueryContext,
    entityId?: string
): string | null {
    if (!entityId) return null;
    return context.enemies.get(entityId)?.scenarioPlayerId ?? null;
}

export function hasWorldSessionFieldLineOfSight(
    context: WorldSessionTerrainQueryContext,
    from: TilePoint,
    to: TilePoint,
    ownerPlayerId?: string
): boolean {
    return hasLineOfSight(from, to, (tile) => isTerrainLineOfSightBlocking(getWorldSessionServerTileAt(context, tile, ownerPlayerId)));
}

export function findNearbyWorldSessionWalkableTile(
    context: WorldSessionTerrainQueryContext,
    tile: TilePoint,
    actorId: string,
    ownerPlayerId?: string
): TilePoint {
    if (isWorldSessionFieldPassableForOwner(context, { ...tile, actorId, intent: 'move' }, ownerPlayerId)) return tile;
    for (let radius = 1; radius <= 8; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const candidate = { x: tile.x + dx, y: tile.y + dy };
                if (isWorldSessionFieldPassableForOwner(context, { ...candidate, actorId, intent: 'move' }, ownerPlayerId)) return candidate;
            }
        }
    }
    return tile;
}
