import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSkillEffect } from '../../src/combat/SkillEffectResolver';
import { getClassAttackProfile, getSkillAttackProfile } from '../../src/data/AttackPatternProfiles';
import { getSkill } from '../../src/data/SkillDB';
import { createBaseStats } from '../../src/data/Stats';
import { hasLineOfSight } from '../../src/field/LineOfSight';
import {
    AttackPatternProfile,
    getEffectTiles,
    getSelectableTiles,
    isSelectableTile,
} from '../../src/field/TargetPatterns';
import { TilePoint, tilesInRange } from '../../src/field/FieldPathing';

function keys(tiles: TilePoint[]): string[] {
    return tiles.map((tile) => `${tile.x},${tile.y}`).sort();
}

function assertTileSet(actual: TilePoint[], expected: TilePoint[]): void {
    assert.deepEqual(keys(actual), keys(expected));
}

test('class attack profiles differentiate infantry, cavalry, lancer, archer, and mage basics', () => {
    const caster = { x: 0, y: 0 };
    const infantry = getClassAttackProfile('infantry');
    assert.equal(isSelectableTile(infantry, { casterTile: caster }, { x: 1, y: 0 }), true);
    assert.equal(isSelectableTile(infantry, { casterTile: caster }, { x: 2, y: 0 }), false);
    assert.equal(isSelectableTile(infantry, { casterTile: caster }, { x: 1, y: 1 }), false);

    const archer = getClassAttackProfile('archer');
    assert.equal(isSelectableTile(archer, { casterTile: caster }, { x: 1, y: 0 }), false);
    assert.equal(isSelectableTile(archer, { casterTile: caster }, { x: 2, y: 0 }), true);
    assert.equal(isSelectableTile(archer, { casterTile: caster }, { x: 2, y: 1 }), false);
    assert.equal(isSelectableTile(archer, { casterTile: caster, hasLineOfSight: () => false }, { x: 2, y: 0 }), false);

    const cavalry = getClassAttackProfile('cavalry');
    assertTileSet(getEffectTiles(cavalry, { casterTile: caster, selectedTile: { x: 2, y: 0 } }), [{ x: 2, y: 0 }]);

    const lancer = getClassAttackProfile('lancer');
    assertTileSet(getEffectTiles(lancer, { casterTile: caster, selectedTile: { x: 2, y: 0 } }), [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
    ]);

    const mage = getClassAttackProfile('mage');
    assert.equal(mage.damageMultiplier, 0.6);
    assert.equal(getEffectTiles(mage, { casterTile: caster, selectedTile: { x: 2, y: 0 } }).length, 9);
});

test('directional effects require a cardinal selected tile and never snap diagonals', () => {
    const profile: AttackPatternProfile = {
        select: { kind: 'square', maxRange: 3 },
        effect: { kind: 'cone', length: 2, width: 1, origin: 'caster' },
    };

    assert.deepEqual(getEffectTiles(profile, { casterTile: { x: 0, y: 0 }, selectedTile: { x: 1, y: 1 } }), []);
});

test('cone effect tiles are pinned for all four cardinal directions', () => {
    const profile: AttackPatternProfile = {
        select: { kind: 'orthogonalLine', maxRange: 2 },
        effect: { kind: 'cone', length: 2, width: 1, origin: 'caster' },
    };
    const caster = { x: 0, y: 0 };

    assertTileSet(getEffectTiles(profile, { casterTile: caster, selectedTile: { x: 1, y: 0 } }), [
        { x: 1, y: 0 },
        { x: 2, y: -1 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
    ]);
    assertTileSet(getEffectTiles(profile, { casterTile: caster, selectedTile: { x: -1, y: 0 } }), [
        { x: -1, y: 0 },
        { x: -2, y: -1 },
        { x: -2, y: 0 },
        { x: -2, y: 1 },
    ]);
    assertTileSet(getEffectTiles(profile, { casterTile: caster, selectedTile: { x: 0, y: 1 } }), [
        { x: 0, y: 1 },
        { x: -1, y: 2 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
    ]);
    assertTileSet(getEffectTiles(profile, { casterTile: caster, selectedTile: { x: 0, y: -1 } }), [
        { x: 0, y: -1 },
        { x: -1, y: -2 },
        { x: 0, y: -2 },
        { x: 1, y: -2 },
    ]);
});

test('effect patterns clip out of bounds, blocking tiles, and per-tile line of sight', () => {
    const square: AttackPatternProfile = {
        select: { kind: 'diamond', maxRange: 3 },
        effect: { kind: 'square', radius: 1, origin: 'selected' },
    };
    assertTileSet(getEffectTiles(square, {
        casterTile: { x: 0, y: 0 },
        selectedTile: { x: 0, y: 0 },
        isInsideMap: (tile) => tile.x >= 0 && tile.y >= 0,
        isBlockingTile: (tile) => tile.x === 1 && tile.y === 0,
        hasLineOfSight: () => true,
    }), [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ]);

    const piercing: AttackPatternProfile = {
        select: { kind: 'orthogonalLine', maxRange: 4 },
        effect: { kind: 'piercingLine', length: 4, origin: 'caster' },
    };
    const blocks = (tile: TilePoint) => tile.x === 2 && tile.y === 0;
    assertTileSet(getEffectTiles(piercing, {
        casterTile: { x: 0, y: 0 },
        selectedTile: { x: 4, y: 0 },
        isBlockingTile: blocks,
        hasLineOfSight: (from, to) => hasLineOfSight(from, to, blocks),
    }), [{ x: 1, y: 0 }]);
});

test('skills without explicit profiles preserve the old diamond select and square aoe fallback', () => {
    const skill = getSkill('og_blizzard');
    assert.ok(skill);

    const profile = getSkillAttackProfile(skill);
    const caster = { x: 0, y: 0 };
    assertTileSet(
        getSelectableTiles(profile, { casterTile: caster, hasLineOfSight: () => true }),
        tilesInRange(caster, skill.range)
    );
    assertTileSet(
        getEffectTiles(profile, { casterTile: caster, selectedTile: { x: 2, y: 0 }, hasLineOfSight: () => true }),
        [
            { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: -1 },
            { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
            { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
        ]
    );
});

test('pattern-resolved damage skills can apply to multiple selected targets', () => {
    const skill = getSkill('arc_t3');
    assert.ok(skill);

    const casterStats = createBaseStats({ atk: 40, magAtk: 10 });
    const target = {
        id: 'e1',
        name: 'Enemy 1',
        gridX: 1,
        gridY: 0,
        stats: createBaseStats({ hp: 30, def: 2 }),
    };
    const second = {
        ...target,
        id: 'e2',
        name: 'Enemy 2',
        gridX: 2,
        stats: createBaseStats({ hp: 30, def: 2 }),
    };

    const result = resolveSkillEffect({
        casterStats,
        skill,
        targetEnemy: target,
        allEnemies: [target, second],
        targetsResolvedByPattern: true,
    });

    assert.deepEqual(result.enemyResults.map((enemyResult) => enemyResult.enemyId), ['e1', 'e2']);
});
