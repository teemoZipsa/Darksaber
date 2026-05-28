import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillTerrainContext, getActorAttackTargetFailure, getAttackFailureMessage, getSkillCandidateEnemies } from '../../src/field/FieldTargeting';
import type { AttackPatternProfile, PatternContext } from '../../src/field/TargetPatterns';
import { TileType } from '../../src/map/Tile';

const archerProfile: AttackPatternProfile = {
    select: { kind: 'orthogonalLine', minRange: 2, maxRange: 4, requiresLineOfSight: true },
    effect: { kind: 'single' },
};

test('field targeting distinguishes too close, blocked, and out of range attacks', () => {
    const baseContext: PatternContext = {
        casterTile: { x: 0, y: 0 },
        hasLineOfSight: () => true,
    };

    assert.equal(getActorAttackTargetFailure({
        profile: archerProfile,
        context: baseContext,
        selectedContext: { ...baseContext, selectedTile: { x: 1, y: 0 } },
        target: { x: 1, y: 0 },
    }), 'tooClose');

    const blockedContext = { ...baseContext, hasLineOfSight: () => false };
    assert.equal(getActorAttackTargetFailure({
        profile: archerProfile,
        context: blockedContext,
        selectedContext: { ...blockedContext, selectedTile: { x: 2, y: 0 } },
        target: { x: 2, y: 0 },
    }), 'blocked');

    assert.equal(getActorAttackTargetFailure({
        profile: archerProfile,
        context: baseContext,
        selectedContext: { ...baseContext, selectedTile: { x: 5, y: 0 } },
        target: { x: 5, y: 0 },
    }), 'outOfRange');

    assert.equal(getAttackFailureMessage('blocked'), '공격 경로가 막혔습니다.');
});

test('field targeting resolves pattern skill candidates and terrain context by callbacks', () => {
    const profile: AttackPatternProfile = {
        select: { kind: 'diamond', maxRange: 3 },
        effect: { kind: 'square', radius: 1, origin: 'selected' },
    };
    const enemies = [
        { id: 'e1', gridX: 2, gridY: 0, stats: { hp: 10 } },
        { id: 'e2', gridX: 3, gridY: 0, stats: { hp: 10 } },
        { id: 'e3', gridX: 5, gridY: 0, stats: { hp: 10 } },
    ];
    const context: PatternContext = {
        casterTile: { x: 0, y: 0 },
        selectedTile: { x: 2, y: 0 },
    };

    const candidates = getSkillCandidateEnemies(enemies, profile, context, enemies[0]);
    assert.deepEqual(candidates.map((enemy) => enemy.id), ['e1', 'e2']);

    const terrain = buildSkillTerrainContext({
        casterTile: { x: 0, y: 0 },
        targetEnemies: candidates,
        targetEnemy: enemies[0],
        getTileAt: (tile) => (tile.x === 0 ? TileType.ROAD : TileType.FOREST),
    });
    assert.equal(terrain.casterTile, TileType.ROAD);
    assert.equal(terrain.impactTile, TileType.FOREST);
    assert.deepEqual(terrain.targetTiles, { e1: TileType.FOREST, e2: TileType.FOREST });
});
