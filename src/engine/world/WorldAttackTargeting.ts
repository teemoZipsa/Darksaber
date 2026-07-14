import type { Character } from '../../character/Character';
import type { Enemy } from '../../entity/Enemy';
import { getEquippedWeaponAttackRange } from '../../combat/BasicAttackRange';
import { getClassAttackProfile } from '../../data/AttackPatternProfiles';
import type { WorldMap } from '../../map/WorldMap';
import { hasLineOfSight } from '../../field/LineOfSight';
import { manhattan, tileKey, type TilePoint } from '../../field/FieldPathing';
import {
    getEffectTiles,
    type AttackPatternProfile,
    type PatternContext,
} from '../../field/TargetPatterns';
import {
    getTerrainMoveCost,
    isTerrainLineOfSightBlocking,
    type TerrainActorTraits,
} from '../../field/TerrainRules';
import {
    getActorAttackTargetFailure as resolveActorAttackTargetFailure,
    type AttackTargetFailure,
} from '../../field/FieldTargeting';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import {
    actorTile,
    enemyTile,
    getActorTerrainTraits,
} from './WorldEngineFieldHelpers';

export function getWorldActorAttackRange(character: Character): number {
    return getEquippedWeaponAttackRange(character.equipment);
}

export function getWorldActorAttackProfile(actor: FieldActor): AttackPatternProfile {
    return getClassAttackProfile(actor.character.classLineId, getWorldActorAttackRange(actor.character));
}

export function getWorldAttackPatternTargetEnemies(input: {
    worldMap: WorldMap;
    fieldEnemies: readonly FieldEnemy[];
    actor: FieldActor;
    selectedEnemy: Enemy;
}): Enemy[] {
    const profile = getWorldActorAttackProfile(input.actor);
    const effectTileKeys = new Set(
        getEffectTiles(profile, createWorldPatternContext({
            worldMap: input.worldMap,
            actor: input.actor,
            selectedTile: enemyTile(input.selectedEnemy),
        })).map((tile) => tileKey(tile.x, tile.y))
    );
    return input.fieldEnemies
        .map((entry) => entry.enemy)
        .filter((enemy) => enemy.stats.hp > 0 && effectTileKeys.has(tileKey(enemy.gridX, enemy.gridY)));
}

export function createWorldPatternContext(input: {
    worldMap: WorldMap;
    actor: FieldActor;
    selectedTile?: TilePoint;
    casterTile?: TilePoint;
}): PatternContext {
    const bounds = input.worldMap.getBoundsTiles();
    return {
        casterTile: input.casterTile ?? actorTile(input.actor),
        selectedTile: input.selectedTile,
        isInsideMap: (tile) => tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height,
        isBlockingTile: (tile) => isTerrainLineOfSightBlocking(input.worldMap.getTileAt(tile.x, tile.y)),
        hasLineOfSight: (from, to) => hasWorldFieldLineOfSight(input.worldMap, from, to),
    };
}

export function getWorldTerrainTraitsForActorId(actors: readonly FieldActor[], actorId?: string): TerrainActorTraits {
    const actor = actorId ? actors.find((candidate) => candidate.id === actorId) : undefined;
    return actor ? getWorldActorTerrainTraits(actor) : { ignoresTerrain: false, waterBonus: false };
}

export function getWorldActorTerrainTraits(actor: FieldActor): TerrainActorTraits {
    return getActorTerrainTraits(actor);
}

export function getWorldActorTerrainStepCost(worldMap: WorldMap, actor: FieldActor, tile: TilePoint): number {
    return getTerrainMoveCost(worldMap.getTileAt(tile.x, tile.y), getActorTerrainTraits(actor));
}

export function hasWorldFieldLineOfSight(worldMap: WorldMap, from: TilePoint, to: TilePoint): boolean {
    return hasLineOfSight(from, to, (tile) =>
        isTerrainLineOfSightBlocking(worldMap.getTileAt(tile.x, tile.y))
    );
}

export function canWorldEnemyAttackTarget(input: {
    worldMap: WorldMap;
    enemy: Enemy;
    actor: FieldActor;
    range: number;
}): boolean {
    const distance = manhattan(enemyTile(input.enemy), actorTile(input.actor));
    if (distance > input.range) return false;
    return input.range <= 1 || hasWorldFieldLineOfSight(input.worldMap, enemyTile(input.enemy), actorTile(input.actor));
}

export function canWorldActorAttackTarget(input: {
    worldMap: WorldMap;
    actor: FieldActor;
    enemy: Enemy;
}): boolean {
    return getWorldActorAttackTargetFailure(input) === null;
}

export function getWorldActorAttackTargetFailure(input: {
    worldMap: WorldMap;
    actor: FieldActor;
    enemy: Enemy;
    casterTile?: TilePoint;
}): AttackTargetFailure | null {
    const casterTile = input.casterTile ?? actorTile(input.actor);
    const target = enemyTile(input.enemy);
    return resolveActorAttackTargetFailure({
        profile: getWorldActorAttackProfile(input.actor),
        context: createWorldPatternContext({
            worldMap: input.worldMap,
            actor: input.actor,
            casterTile,
        }),
        selectedContext: createWorldPatternContext({
            worldMap: input.worldMap,
            actor: input.actor,
            selectedTile: target,
            casterTile,
        }),
        target,
    });
}
