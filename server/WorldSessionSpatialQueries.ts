import { manhattan, type TilePoint } from '../src/field/FieldPathing';
import type { ServerActor, ServerEnemy, ServerPlayer } from './WorldSessionTypes';

export function hasNearbyLiveEnemy(enemies: Iterable<ServerEnemy>, tile: TilePoint, distance: number): boolean {
    for (const entry of enemies) {
        if (entry.scenarioPlayerId) continue;
        if (entry.enemy.stats.hp <= 0) continue;
        if (manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, tile) <= distance) return true;
    }
    return false;
}

export function hasNearbyAggroEnemy(
    enemies: Iterable<ServerEnemy>,
    tile: TilePoint,
    distance: number,
    viewerPlayerId?: string
): boolean {
    for (const entry of enemies) {
        if (entry.enemy.stats.hp <= 0 || !entry.enemy.isAggro) continue;
        if (entry.scenarioPlayerId && entry.scenarioPlayerId !== viewerPlayerId) continue;
        if (manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, tile) <= distance) return true;
    }
    return false;
}

export function hasActiveActorWithin(
    players: Iterable<ServerPlayer>,
    actors: ReadonlyMap<string, ServerActor>,
    tile: TilePoint,
    distance: number,
    ownerPlayerId?: string
): boolean {
    for (const player of players) {
        if (!player.active || player.ghost) continue;
        if (ownerPlayerId && player.id !== ownerPlayerId) continue;
        if (!ownerPlayerId && player.activeDungeonId) continue;
        if (player.actorIds.some((actorId) => isLivingActorWithin(actors.get(actorId), tile, distance))) return true;
    }
    return false;
}

export function firstActorTile(player: ServerPlayer, actors: ReadonlyMap<string, ServerActor>): TilePoint | null {
    const actor = player.actorIds.map((id) => actors.get(id)).find(Boolean);
    return actor ? { ...actor.tile } : null;
}

export function firstLivingActorTile(player: ServerPlayer, actors: ReadonlyMap<string, ServerActor>): TilePoint | null {
    const actor = player.actorIds
        .map((id) => actors.get(id))
        .find((entry) => entry && !entry.isDead && entry.stats.hp > 0);
    return actor ? { ...actor.tile } : null;
}

function isLivingActorWithin(actor: ServerActor | undefined, tile: TilePoint, distance: number): boolean {
    return Boolean(actor && !actor.isDead && actor.stats.hp > 0 && manhattan(actor.tile, tile) <= distance);
}
