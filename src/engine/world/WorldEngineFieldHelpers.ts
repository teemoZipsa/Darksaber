import type { Character } from '../../character/Character';
import { getClassLine } from '../../data/ClassTree';
import { getEffectiveStatsForCharacter, hasStatus } from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { FieldActor } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { TerrainActorTraits } from '../../field/TerrainRules';

type MovingGridEntity = {
    gridX: number;
    gridY: number;
    pixelX: number;
    pixelY: number;
};

export type WorldEngineDirection = 'up' | 'down' | 'left' | 'right';

export function actorTile(actor: FieldActor): TilePoint {
    return { x: actor.entity.gridX, y: actor.entity.gridY };
}

export function enemyTile(enemy: Enemy): TilePoint {
    return { x: enemy.gridX, y: enemy.gridY };
}

export function isActorAt(actor: FieldActor, tile: TilePoint): boolean {
    return actor.entity.gridX === tile.x && actor.entity.gridY === tile.y;
}

export function isEntityMoving(entity: MovingGridEntity): boolean {
    return Math.abs(entity.pixelX - entity.gridX) > 0.01 || Math.abs(entity.pixelY - entity.gridY) > 0.01;
}

export function directionFromTo(from: TilePoint, to: TilePoint): WorldEngineDirection {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
}

export function getActorTerrainMovementBudget(actor: FieldActor): number {
    if (hasStatus(actor.character.statuses, 'immobilize')) return 0;
    return Math.max(1, getEffectiveStatsForCharacter(actor.character).mov || actor.entity.moveRange);
}

export function syncCharacterMovementToClass(character: Character): void {
    const baseMovRange = getClassLine(character.classLineId)?.baseMovRange;
    if (baseMovRange !== undefined) character.stats.mov = baseMovRange;
}

export function getActorTerrainTraits(actor: FieldActor): TerrainActorTraits {
    const classLine = getClassLine(actor.character.classLineId);
    return {
        ignoresTerrain: classLine?.ignoresTerrain ?? false,
        waterBonus: classLine?.waterBonus ?? false,
    };
}
