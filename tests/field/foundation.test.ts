import test from 'node:test';
import assert from 'node:assert/strict';
import { PartyManager } from '../../src/character/PartyManager';
import { Character } from '../../src/character/Character';
import { WorldMap } from '../../src/map/WorldMap';
import { resolveFieldHit } from '../../src/field/FieldInteraction';
import { findPath, findPathToAny, manhattan, tilesInRange, FieldPassableQuery } from '../../src/field/FieldPathing';
import { resolveAggroState, shouldAssistTarget } from '../../src/field/FieldCombat';
import { ATTACK_AP_COST, INTERACT_AP_COST, MOVE_AP_PER_TILE, enqueueReadyActor, getMoveApCost, hasExecutableFieldAction } from '../../src/field/FieldActionEconomy';

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
    }), false);
});
