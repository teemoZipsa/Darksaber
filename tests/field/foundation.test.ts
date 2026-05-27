import test from 'node:test';
import assert from 'node:assert/strict';
import { PartyManager } from '../../src/character/PartyManager';
import { Character } from '../../src/character/Character';
import { WorldMap } from '../../src/map/WorldMap';
import { resolveFieldHit } from '../../src/field/FieldInteraction';
import { findPath, findPathToAny, findPathWithCost, findReachableTilesByCost, manhattan, tilesInRange, FieldPassableQuery } from '../../src/field/FieldPathing';
import { resolveAggroState, shouldAssistTarget } from '../../src/field/FieldCombat';
import { ATTACK_AP_COST, INTERACT_AP_COST, MAGIC_AP_COST, MOVE_AP_PER_TILE, enqueueReadyActor, getActionApCost, getMoveApCost, hasExecutableFieldAction } from '../../src/field/FieldActionEconomy';
import { resolveSkillEffect } from '../../src/combat/SkillEffectResolver';
import { getSkill } from '../../src/data/SkillDB';
import { createBaseStats } from '../../src/data/Stats';
import { CombatFormulas } from '../../src/combat/CombatFormulas';
import { hasLineOfSight } from '../../src/field/LineOfSight';
import {
    TERRAIN_PROFILES,
    battleStageTileToTerrainTile,
    canAffordTerrainCost,
    getMagicTerrainMultiplier,
    getTerrainDefenseMultiplier,
    getTerrainMoveCost,
    isTerrainPassable,
    terrainCostToApCost,
} from '../../src/field/TerrainRules';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('central field spawn is walkable and belongs to central_castle', () => {
    const world = new WorldMap();
    const central = world.getTowns().find((town) => town.id === 'central_castle');
    assert.ok(central);

    const spawn = world.getTownSpawnTile(central);
    assert.ok(world.isWalkable(spawn.x, spawn.y));
    assert.equal(world.getTownAtTile(spawn.x, spawn.y)?.id, 'central_castle');
});

test('field hit priority resolves enemy before party before loot before ground', () => {
    const tile = { x: 5, y: 5 };
    const party = [{ id: 'p1', gridX: 5, gridY: 5 }];
    const enemies = [{ id: 'e1', gridX: 5, gridY: 5, stats: { hp: 10 } }];
    const loot = [{ id: 'l1', x: 5, y: 5, opened: false }];

    const enemyHit = resolveFieldHit(tile, { party, enemies, loot, isGroundWalkable: () => true });
    assert.equal(enemyHit.kind, 'enemy');

    const partyHit = resolveFieldHit(tile, { party, enemies: [], loot, isGroundWalkable: () => true });
    assert.equal(partyHit.kind, 'party');

    const lootHit = resolveFieldHit(tile, { party: [], enemies: [], loot, isGroundWalkable: () => true });
    assert.equal(lootHit.kind, 'loot');

    const groundHit = resolveFieldHit(tile, { party: [], enemies: [], loot: [], isGroundWalkable: () => true });
    assert.equal(groundHit.kind, 'ground');
});

test('blocked empty field click resolves as blocked', () => {
    const hit = resolveFieldHit(
        { x: 2, y: 2 },
        { party: [], enemies: [], loot: [], isGroundWalkable: () => false }
    );
    assert.equal(hit.kind, 'blocked');
});

test('pathing treats enemies as hard blockers while allowing allied soft collision', () => {
    const enemyTile = '2,0';
    const allyTile = '1,0';
    const passable = (query: FieldPassableQuery) => {
        const key = `${query.x},${query.y}`;
        if (key === enemyTile) return false;
        if (key === allyTile && query.intent === 'enemy') return false;
        return query.y === 0 && query.x >= 0 && query.x <= 3;
    };

    const allySoftPath = findPath({ x: 0, y: 0 }, { x: 1, y: 0 }, passable, { intent: 'follow', actorId: 'p2' });
    assert.deepEqual(allySoftPath, [{ x: 1, y: 0 }]);

    const blockedEnemyPath = findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, passable, { intent: 'enemy', actorId: 'e2' });
    assert.equal(blockedEnemyPath.length, 0);
});

test('move-to-act path can target a reachable attack or loot-adjacent tile', () => {
    const target = { x: 4, y: 0 };
    const goals = tilesInRange(target, 1).filter((tile) => tile.x >= 0 && tile.y === 0);
    const path = findPathToAny(
        { x: 0, y: 0 },
        goals,
        (query) => query.y === 0 && query.x >= 0 && query.x <= 5,
        { intent: 'attack', actorId: 'p1' }
    );

    assert.ok(path.length > 0);
    assert.equal(manhattan(path[path.length - 1], target), 1);
});

test('active party deployment remains capped at three characters', () => {
    const party = new PartyManager();
    const chars = [0, 1, 2, 3].map((index) => new Character(`c${index}`, `C${index}`, 'infantry'));
    chars.forEach((char) => party.addToRoster(char));

    assert.equal(party.deployCharacter(chars[0]), true);
    assert.equal(party.deployCharacter(chars[1]), true);
    assert.equal(party.deployCharacter(chars[2]), true);
    assert.equal(party.deployCharacter(chars[3]), false);
    assert.equal(party.getCharacters().length, 3);
});

test('enemy aggro enters and exits with hysteresis', () => {
    assert.equal(resolveAggroState(false, 6, 6, 10), true);
    assert.equal(resolveAggroState(true, 9, 6, 10), true);
    assert.equal(resolveAggroState(true, 11, 6, 10), false);
    assert.equal(resolveAggroState(true, 4, 6, 10, true), false);
});

test('assist AI only helps controlled targets inside leash', () => {
    assert.equal(shouldAssistTarget({
        isControlledTarget: true,
        targetIsAggro: false,
        targetDistanceToControlled: 5,
        actorDistanceToControlled: 4,
        assistLeash: 7,
    }), true);

    assert.equal(shouldAssistTarget({
        isControlledTarget: false,
        targetIsAggro: false,
        targetDistanceToControlled: 5,
        actorDistanceToControlled: 4,
        assistLeash: 7,
    }), false);

    assert.equal(shouldAssistTarget({
        isControlledTarget: true,
        targetIsAggro: true,
        targetDistanceToControlled: 12,
        actorDistanceToControlled: 4,
        assistLeash: 7,
    }), false);
});

test('field AP movement cost excludes the starting tile', () => {
    assert.equal(MOVE_AP_PER_TILE, 2);
    assert.equal(getMoveApCost(0), 0);
    assert.equal(getMoveApCost(3), 6);
    assert.equal(getMoveApCost(5), 10);
});

test('rest ends a turn without an AP cost', () => {
    assert.equal(getActionApCost('rest'), 0);
});

test('terrain rules cover every TileType and battle stage adapter stays shared', () => {
    const tileTypes = Object.values(TileType).filter((value): value is TileType => typeof value === 'number');
    assert.equal(Object.keys(TERRAIN_PROFILES).length, tileTypes.length);
    for (const tile of tileTypes) {
        assert.ok(TERRAIN_PROFILES[tile], `missing terrain profile for ${TileType[tile]}`);
    }

    assert.equal(battleStageTileToTerrainTile(0), TileType.GRASS);
    assert.equal(battleStageTileToTerrainTile(1), TileType.WALL);
    assert.equal(isTerrainPassable(battleStageTileToTerrainTile(0)), true);
    assert.equal(isTerrainPassable(battleStageTileToTerrainTile(1)), false);
});

test('weighted pathing uses the same terrain cost and AP rounding for reach and spend', () => {
    const terrain = new Map<string, TileType>([
        ['0,0', TileType.GRASS],
        ['1,0', TileType.ROAD],
        ['2,0', TileType.FOREST],
        ['3,0', TileType.ROAD],
    ]);
    const passable = ({ x, y }: FieldPassableQuery) => y === 0 && x >= 0 && x <= 3;
    const stepCost = (tile: { x: number; y: number }) => getTerrainMoveCost(terrain.get(`${tile.x},${tile.y}`) ?? TileType.GRASS);

    const reachable = findReachableTilesByCost({ x: 0, y: 0 }, passable, stepCost, 3);
    const forest = reachable.get('2,0');
    assert.ok(forest);
    assert.equal(forest.cost, 2.8);
    assert.equal(terrainCostToApCost(forest.cost), 6);
    assert.equal(canAffordTerrainCost(forest.cost, 6), true);
    assert.equal(canAffordTerrainCost(forest.cost, 5), false);
    assert.equal(reachable.has('3,0'), false);

    const path = findPathWithCost({ x: 0, y: 0 }, { x: 2, y: 0 }, passable, stepCost, { maxCost: 3 });
    assert.deepEqual(path.path, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    assert.equal(terrainCostToApCost(path.cost), terrainCostToApCost(forest.cost));
});

test('terrain traits apply only to movement unless explicitly defensive', () => {
    assert.equal(getTerrainMoveCost(TileType.FOREST, { ignoresTerrain: true }), 1);
    assert.equal(getTerrainMoveCost(TileType.WATER, { waterBonus: true }), 0.8);
    assert.equal(Number.isFinite(getTerrainMoveCost(TileType.DEEP_WATER, { waterBonus: true })), false);
    assert.equal(Number.isFinite(getTerrainMoveCost(TileType.LAVA, { ignoresTerrain: true })), false);
    assert.equal(getTerrainDefenseMultiplier(TileType.WATER, { waterBonus: true }), 0.85);
    assert.equal(getTerrainDefenseMultiplier(TileType.FOREST, { ignoresTerrain: true }), 0.85);
});

test('line of sight blocks walls and conservative diagonal corner gaps', () => {
    assert.equal(hasLineOfSight(
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        (tile) => tile.x === 1 && tile.y === 0
    ), false);
    assert.equal(hasLineOfSight(
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        (tile) => (tile.x === 1 && tile.y === 0) || (tile.x === 0 && tile.y === 1)
    ), false);
    assert.equal(hasLineOfSight(
        { x: 0, y: 0 },
        { x: 3, y: 1 },
        () => false
    ), true);
});

test('physical combat applies terrain defense and ranged cover hit penalty', () => {
    const attacker = createBaseStats({ atk: 50, hitRate: 90, critRate: 0, spd: 1 });
    const defender = createBaseStats({ def: 0, spd: 0 });
    const originalRandom = Math.random;
    try {
        Math.random = () => 0;
        const grass = CombatFormulas.calcPhysicalDamage(attacker, defender, TileType.GRASS);
        const stone = CombatFormulas.calcPhysicalDamage(attacker, defender, TileType.STONE);
        assert.ok(stone.damage < grass.damage);
        assert.equal(stone.terrainMultiplier, 0.8);

        Math.random = () => 0.8;
        const meleeForest = CombatFormulas.calcPhysicalDamage(attacker, defender, TileType.FOREST);
        const rangedForest = CombatFormulas.calcPhysicalDamage(attacker, defender, TileType.FOREST, { isRanged: true });
        assert.equal(meleeForest.isMiss, false);
        assert.equal(rangedForest.isMiss, true);
    } finally {
        Math.random = originalRandom;
    }
});

test('ready queue is FIFO and rejects duplicate actors', () => {
    const queue: string[] = [];
    assert.equal(enqueueReadyActor(queue, 'p1'), true);
    assert.equal(enqueueReadyActor(queue, 'e1'), true);
    assert.equal(enqueueReadyActor(queue, 'p1'), false);
    assert.deepEqual(queue, ['p1', 'e1']);
});

test('field AP continuation requires affordable and executable actions', () => {
    assert.equal(hasExecutableFieldAction({
        remainingAp: ATTACK_AP_COST,
        hasReachableMove: false,
        hasAttackTarget: false,
        hasInteractTarget: false,
    }), false);

    assert.equal(hasExecutableFieldAction({
        remainingAp: ATTACK_AP_COST,
        hasReachableMove: false,
        hasAttackTarget: true,
        hasInteractTarget: false,
    }), true);

    assert.equal(hasExecutableFieldAction({
        remainingAp: INTERACT_AP_COST,
        hasReachableMove: false,
        hasAttackTarget: true,
        hasInteractTarget: true,
    }), true);

    assert.equal(hasExecutableFieldAction({
        remainingAp: MOVE_AP_PER_TILE - 1,
        hasReachableMove: true,
        hasAttackTarget: true,
        hasInteractTarget: true,
        hasMagicAvailable: true,
    }), false);

    assert.equal(hasExecutableFieldAction({
        remainingAp: MAGIC_AP_COST,
        hasReachableMove: false,
        hasAttackTarget: false,
        hasInteractTarget: false,
        hasMagicAvailable: true,
    }), true);
});

test('skill effect resolver handles heal and special heal variants', () => {
    const heal = getSkill('og_heal');
    const ether = getSkill('alc_t4');
    const sagePotion = getSkill('alc_t6');
    const full = getSkill('cle_t7');
    const shrineFull = getSkill('shr_t7');
    assert.ok(heal);
    assert.ok(ether);
    assert.ok(sagePotion);
    assert.ok(full);
    assert.ok(shrineFull);

    const stats = createBaseStats({ hp: 40, maxHp: 100, mp: 20, maxMp: 50, magAtk: 10 });
    const healResult = resolveSkillEffect({ casterStats: stats, skill: heal });
    assert.equal(healResult.casterHpDelta, 15);
    assert.equal(healResult.casterMpDelta, -5);

    const etherResult = resolveSkillEffect({ casterStats: stats, skill: ether });
    assert.equal(etherResult.casterHpDelta, -20);
    assert.equal(etherResult.casterMpDelta, 20);

    const potionStats = createBaseStats({ hp: 45, maxHp: 100, mp: 35, maxMp: 50, magAtk: 10 });
    const sageResult = resolveSkillEffect({ casterStats: potionStats, skill: sagePotion });
    assert.equal(sageResult.casterHpDelta, 30);
    assert.equal(sageResult.casterMpDelta, -5);

    const fullStats = createBaseStats({ hp: 40, maxHp: 100, mp: 35, maxMp: 50, magAtk: 10 });
    const fullResult = resolveSkillEffect({ casterStats: fullStats, skill: full });
    assert.equal(fullResult.casterHpDelta, 60);
    assert.equal(fullStats.mp + fullResult.casterMpDelta, fullStats.maxMp);

    const shrineFullResult = resolveSkillEffect({ casterStats: fullStats, skill: shrineFull });
    assert.equal(shrineFullResult.casterHpDelta, 60);
    assert.equal(fullStats.mp + shrineFullResult.casterMpDelta, fullStats.maxMp);
});

test('skill effect resolver applies damage, debuff, and enemy-only aoe', () => {
    const fireball = getSkill('og_fireball');
    const poison = getSkill('og_poison');
    const blizzard = getSkill('og_blizzard');
    assert.ok(fireball);
    assert.ok(poison);
    assert.ok(blizzard);

    const casterStats = createBaseStats({ magAtk: 20, atk: 8, mp: 50 });
    const target = {
        id: 'e1',
        name: 'Enemy 1',
        gridX: 5,
        gridY: 5,
        stats: createBaseStats({ hp: 40, maxHp: 40, def: 4, magDef: 2, atk: 10 }),
    };

    const damageResult = resolveSkillEffect({ casterStats, skill: fireball, targetEnemy: target });
    assert.equal(damageResult.enemyResults.length, 1);
    assert.equal(damageResult.enemyResults[0].damage, 25);

    const waterDamageResult = resolveSkillEffect({
        casterStats,
        skill: fireball,
        targetEnemy: target,
        terrainContext: {
            casterTile: TileType.GRASS,
            targetTiles: { e1: TileType.WATER },
        },
    });
    assert.equal(waterDamageResult.enemyResults[0].damage, 20);

    const debuffResult = resolveSkillEffect({ casterStats, skill: poison, targetEnemy: target });
    assert.deepEqual(debuffResult.enemyResults[0].statusEffects?.map((status) => status.kind), ['poison', 'attackDown']);
    assert.equal(debuffResult.enemyResults[0].damage, 10);

    const aoeResult = resolveSkillEffect({
        casterStats,
        skill: blizzard,
        targetEnemy: target,
        allEnemies: [
            target,
            { ...target, id: 'e2', name: 'Enemy 2', gridX: 6, gridY: 6 },
            { ...target, id: 'e3', name: 'Enemy 3', gridX: 8, gridY: 8 },
        ],
    });
    assert.deepEqual(aoeResult.enemyResults.map((result) => result.enemyId), ['e1', 'e2']);
});

test('magic terrain multipliers remain clamped to tactical bounds', () => {
    const weakFire = getMagicTerrainMultiplier('fire', {
        casterTile: TileType.WATER,
        targetTile: TileType.DEEP_WATER,
    });
    const strongIce = getMagicTerrainMultiplier('ice', {
        casterTile: TileType.SNOW,
        targetTile: TileType.DEEP_WATER,
    });
    assert.ok(weakFire.multiplier >= 0.65);
    assert.ok(strongIce.multiplier <= 1.45);
    assert.equal(Number(weakFire.multiplier.toFixed(3)), 0.72);
    assert.equal(Number(strongIce.multiplier.toFixed(3)), 1.375);
});
