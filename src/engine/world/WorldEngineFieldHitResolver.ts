import { resolveFieldHit, type FieldHit } from '../../field/FieldInteraction';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldHitParty } from '../../field/FieldTypes';
import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { WorldMap } from '../../map/WorldMap';
import type { WorldEngineFieldState } from './WorldEngineFieldState';

export type WorldEngineFieldHit = FieldHit<FieldHitParty, Enemy, LootObject>;

export function resolveWorldEngineFieldHitAt(
    tile: TilePoint,
    fieldState: WorldEngineFieldState,
    worldMap: WorldMap
): WorldEngineFieldHit {
    const partyTargets: FieldHitParty[] = fieldState.partyActors.map((actor) => ({
        ...actor,
        gridX: actor.entity.gridX,
        gridY: actor.entity.gridY,
    }));
    return resolveFieldHit(tile, {
        party: partyTargets,
        enemies: fieldState.fieldEnemies.map((entry) => entry.enemy),
        loot: worldMap.loot,
        isGroundWalkable: (x, y) => worldMap.isWalkable(x, y),
    });
}
