import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillTerrainContext, getActorAttackTargetFailure, getAttackFailureMessage, getSkillCandidateEnemies } from '../../src/field/FieldTargeting';
import type { AttackPatternProfile, PatternContext } from '../../src/field/TargetPatterns';
import { TileType } from '../../src/map/Tile';
import { WorldMagicController } from '../../src/engine/world/WorldMagicController';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import { getSkill } from '../../src/data/SkillDB';
import type { FieldActor } from '../../src/field/FieldTypes';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

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

test('magic hover preview resolves area tiles from any valid hovered tile', () => {
    const skill = getSkill('og_blizzard');
    assert.ok(skill);

    const character = new Character('hero', 'Hero', 'infantry');
    const actor: FieldActor = {
        id: character.id,
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };
    const controller = new WorldMagicController({
        getActivePartyTurnActor: () => actor,
        getPartyActors: () => [actor],
        getFieldEnemies: () => [],
        getEnemyById: () => null,
        getRemainingActionPoints: () => 100,
        getTileAt: () => TileType.GRASS,
        getBoundsTiles: () => ({ width: 10, height: 10 }),
        hasFieldLineOfSight: () => true,
        spendAp: () => true,
        isMajorActionUsed: () => false,
        markMajorActionUsed: () => undefined,
        reopenActionMenu: () => undefined,
        resumeOrEndActiveTurn: () => undefined,
        handleEnemyDefeated: () => undefined,
    }, {
        log: () => undefined,
        spawnHeal: () => undefined,
        spawnDamage: () => undefined,
        spawnStatus: () => undefined,
        spawnHealEffect: () => undefined,
        spawnHitEffect: () => undefined,
        spawnBuffEffect: () => undefined,
        spawnDebuffEffect: () => undefined,
        spawnElementEffect: () => undefined,
        spawnSkillEffect: () => undefined,
    });

    (controller as any).state = {
        mode: 'targeting',
        skill,
        validTiles: new Set(['2,0']),
        hoverAoeTiles: new Set<string>(),
    };

    controller.updateHoverPreview({ x: 2, y: 0 });
    const state = controller.getState();
    assert.equal(state.mode, 'targeting');
    assert.ok(state.hoverAoeTiles.has('2,0'));
    assert.ok(state.hoverAoeTiles.has('3,0'));

    controller.updateHoverPreview({ x: 5, y: 5 });
    const cleared = controller.getState();
    assert.equal(cleared.mode, 'targeting');
    assert.equal(cleared.hoverAoeTiles.size, 0);
});
