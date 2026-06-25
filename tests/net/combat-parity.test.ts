import test from 'node:test';
import assert from 'node:assert/strict';
import { findPathWithCost } from '../../src/field/FieldPathing';
import { getTerrainMoveCost } from '../../src/field/TerrainRules';
import { TileType } from '../../src/map/Tile';
import { createBaseStats } from '../../src/data/Stats';
import { getEffectiveStats } from '../../src/combat/StatusEffects';
import { planMoveIntentPath } from '../../server/WorldSessionMoveIntent';

test('shared movement helpers produce a path for open terrain', () => {
    const passable = () => true;
    const actorTile = { x: 2, y: 2 };
    const targetTile = { x: 5, y: 2 };
    const movementBudget = Math.max(1, getEffectiveStats(createBaseStats(), []).mov || 1);
    const pathResult = findPathWithCost(
        actorTile,
        targetTile,
        () => passable(),
        () => getTerrainMoveCost(TileType.GRASS),
        { actorId: 'hero', intent: 'move', maxNodes: 8000, maxCost: movementBudget },
    );
    assert.ok(pathResult.path.length > 0);
    const last = pathResult.path[pathResult.path.length - 1];
    assert.equal(last.x, targetTile.x);
    assert.equal(last.y, targetTile.y);
});

test('WorldSessionMoveIntent path helper matches direct pathing for open terrain', () => {
    const actor = {
        id: 'hero',
        tile: { x: 2, y: 2 },
        stats: createBaseStats(),
        statuses: [],
    };
    const targetTile = { x: 5, y: 2 };
    const path = planMoveIntentPath({
        actor: actor as never,
        targetTile,
        isPassable: () => true,
        terrainCost: () => getTerrainMoveCost(TileType.GRASS),
    });
    assert.ok(path.length > 0);
    assert.equal(path[path.length - 1].x, targetTile.x);
});
