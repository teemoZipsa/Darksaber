import { findPathWithCost, manhattan, type FieldPassableQuery, type TilePoint } from '../src/field/FieldPathing';
import { getEffectiveStats } from '../src/combat/StatusEffects';
import type { ServerActor } from './WorldSessionTypes';

export interface MoveIntentPathContext {
    actor: ServerActor;
    targetTile: TilePoint;
    isPassable(query: FieldPassableQuery): boolean;
    terrainCost(step: TilePoint): number;
}

export function planMoveIntentPath(context: MoveIntentPathContext): TilePoint[] {
    const movementBudget = Math.max(1, getEffectiveStats(context.actor.stats, context.actor.statuses).mov || 1);
    const pathResult = findPathWithCost(
        context.actor.tile,
        context.targetTile,
        (query) => context.isPassable(query),
        (step) => context.terrainCost(step),
        {
            actorId: context.actor.id,
            intent: 'move',
            maxNodes: 8000,
            maxCost: movementBudget,
        }
    );
    if (pathResult.path.length === 0 && manhattan(context.actor.tile, context.targetTile) > 0) {
        return [];
    }
    return pathResult.path;
}
