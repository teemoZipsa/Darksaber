import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import {
    EXPLORATION_ROAD_SPEED_MULTIPLIER,
    WorldMovementController,
} from '../../src/engine/world/WorldMovementController';
import { TileType } from '../../src/map/Tile';
import { ENEMY_AGGRO_RANGE, ENEMY_SIMULATION_ACTIVE_RANGE } from '../../src/field/FieldConfig';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string, x: number, y: number): FieldActor {
    const character = new Character(id, id, 'infantry');
    return {
        id: character.id,
        character,
        entity: new Player(x, y),
        path: [],
        queuedIntent: null,
    };
}

function makeEnemyEntry(id: string, x: number, y: number): FieldEnemy {
    return {
        enemy: new Enemy(id, x, y, id, 1),
        home: { x, y },
        path: [],
    };
}

function makeController(actors: FieldActor[], enemies: FieldEnemy[]): WorldMovementController {
    return new WorldMovementController({
        getPartyActors: () => actors,
        getFieldEnemies: () => enemies,
        getTileAt: () => TileType.GRASS,
        getTerrainTraitsForActorId: () => ({}),
    });
}

test('enemy movement cannot enter party or enemy occupied tiles', () => {
    const actor = makeActor('hero', 1, 0);
    const movingEnemy = makeEnemyEntry('enemy-moving', 0, 0);
    const blockingEnemy = makeEnemyEntry('enemy-blocker', 2, 0);
    const controller = makeController([actor], [movingEnemy, blockingEnemy]);

    assert.equal(controller.isFieldPassable({ x: 1, y: 0, actorId: movingEnemy.enemy.id, intent: 'enemy' }), false);
    assert.equal(controller.isFieldPassable({ x: 2, y: 0, actorId: movingEnemy.enemy.id, intent: 'enemy' }), false);
    assert.equal(controller.isFieldPassable({ x: 0, y: 1, actorId: movingEnemy.enemy.id, intent: 'enemy' }), true);
});

test('follower movement allows ally soft collision', () => {
    const occupied = makeActor('occupied', 1, 0);
    const follower = makeActor('follower', 0, 0);
    const controller = makeController([occupied, follower], []);

    assert.equal(controller.isFieldPassable({ x: 1, y: 0, actorId: follower.id, intent: 'follow' }), true);
});

test('party followers only repath when a fanfare leader is supplied', () => {
    const leader = makeActor('leader', 0, 0);
    const follower = makeActor('follower', 5, 5);
    const actors = [leader, follower];
    const controller = makeController(actors, []);

    controller.updatePartyActors({
        dt: 1,
        controlled: null,
        activeTurnActorId: null,
        followRepathTimer: 0,
    });

    assert.deepEqual(follower.path, []);
    assert.equal(follower.queuedIntent, null);

    controller.updatePartyActors({
        dt: 1,
        controlled: leader,
        activeTurnActorId: null,
        followRepathTimer: 0,
    });

    assert.ok(follower.path.length > 0);
    assert.ok(follower.queuedIntent);
    assert.equal((follower.queuedIntent as NonNullable<FieldActor['queuedIntent']>).kind, 'move');
});

test('roads speed up exploration movement but never active combat movement', () => {
    const actor = makeActor('hero', 0, 0);
    const enemy = makeEnemyEntry('enemy', 20, 20);
    const controller = new WorldMovementController({
        getPartyActors: () => [actor],
        getFieldEnemies: () => [enemy],
        getTileAt: () => TileType.ROAD,
        getTerrainTraitsForActorId: () => ({}),
    });

    controller.updatePartyActors({ dt: 0, controlled: actor, activeTurnActorId: null, followRepathTimer: 1 });
    assert.equal(actor.entity.getMovementSpeedMultiplier(), EXPLORATION_ROAD_SPEED_MULTIPLIER);

    enemy.enemy.isAggro = true;
    controller.updatePartyActors({ dt: 0, controlled: actor, activeTurnActorId: null, followRepathTimer: 1 });
    assert.equal(actor.entity.getMovementSpeedMultiplier(), 1);

    enemy.enemy.isAggro = false;
    controller.updatePartyActors({ dt: 0, controlled: actor, activeTurnActorId: actor.id, followRepathTimer: 1 });
    assert.equal(actor.entity.getMovementSpeedMultiplier(), 1);
});

test('party ATB charge combines carry and cursed artifact multipliers', () => {
    const actor = makeActor('hero', 0, 0);
    const baseController = new WorldMovementController({
        getPartyActors: () => [actor],
        getFieldEnemies: () => [],
        getTileAt: () => TileType.GRASS,
        getTerrainTraitsForActorId: () => ({}),
        getPartyCarryAtbMultiplier: () => 1,
        getPartyCursedAtbMultiplier: () => 1,
    });
    baseController.updatePartyActors({ dt: 0.1, controlled: null, activeTurnActorId: null, followRepathTimer: 0 });
    const normalGauge = actor.entity.actionGauge;

    actor.entity.actionGauge = 0;
    const cursedController = new WorldMovementController({
        getPartyActors: () => [actor],
        getFieldEnemies: () => [],
        getTileAt: () => TileType.GRASS,
        getTerrainTraitsForActorId: () => ({}),
        getPartyCarryAtbMultiplier: () => 0.5,
        getPartyCursedAtbMultiplier: () => 0.5,
    });
    cursedController.updatePartyActors({ dt: 0.1, controlled: null, activeTurnActorId: null, followRepathTimer: 0 });

    assert.ok(normalGauge > 0);
    assert.equal(actor.entity.actionGauge, normalGauge * 0.25);
});

test('movement honors world ground blockers on walkable terrain', () => {
    const actor = makeActor('hero', 0, 0);
    const controller = new WorldMovementController({
        getPartyActors: () => [actor],
        getFieldEnemies: () => [],
        getTileAt: () => TileType.GRASS,
        isGroundWalkable: (x, y) => !(x === 1 && y === 0),
        getTerrainTraitsForActorId: () => ({}),
    });

    assert.equal(controller.isFieldPassable({ x: 1, y: 0, actorId: actor.id, intent: 'move' }), false);
    assert.equal(controller.isFieldPassable({ x: 0, y: 1, actorId: actor.id, intent: 'move' }), true);
});

test('party actors entering poison swamp gain terrain hazard statuses', () => {
    const actor = makeActor('hero', 0, 0);
    actor.path = [{ x: 1, y: 0 }];
    const hazardEvents: string[] = [];
    const controller = new WorldMovementController({
        getPartyActors: () => [actor],
        getFieldEnemies: () => [],
        getTileAt: (x, y) => x === 1 && y === 0 ? TileType.POISON_SWAMP : TileType.GRASS,
        getTerrainTraitsForActorId: () => ({}),
        onPartyTerrainHazard: (event) => hazardEvents.push(event.hazard.kind),
    });

    controller.stepActorAlongPath(actor);

    assert.deepEqual({ x: actor.entity.gridX, y: actor.entity.gridY }, { x: 1, y: 0 });
    assert.equal(hasStatus(actor.character.statuses, 'poison'), true);
    assert.equal(hasStatus(actor.character.statuses, 'slow'), true);
    assert.deepEqual(hazardEvents, ['poisonSwamp']);
});

test('terrain ignoring actors bypass poison swamp entry hazards', () => {
    const actor = makeActor('hero', 0, 0);
    actor.path = [{ x: 1, y: 0 }];
    const hazardEvents: string[] = [];
    const controller = new WorldMovementController({
        getPartyActors: () => [actor],
        getFieldEnemies: () => [],
        getTileAt: (x, y) => x === 1 && y === 0 ? TileType.POISON_SWAMP : TileType.GRASS,
        getTerrainTraitsForActorId: () => ({ ignoresTerrain: true }),
        onPartyTerrainHazard: (event) => hazardEvents.push(event.hazard.kind),
    });

    controller.stepActorAlongPath(actor);

    assert.equal(hasStatus(actor.character.statuses, 'poison'), false);
    assert.equal(hasStatus(actor.character.statuses, 'slow'), false);
    assert.deepEqual(hazardEvents, []);
});

test('passive enemies do not charge turns until aggro starts', () => {
    const actor = makeActor('hero', ENEMY_AGGRO_RANGE + 1, 0);
    const enemyEntry = makeEnemyEntry('passive', 0, 0);
    enemyEntry.enemy.actionGauge = 75;
    const controller = makeController([actor], [enemyEntry]);

    const result = controller.updateEnemies({ dt: 10, activeTurnActorId: null });

    assert.deepEqual(result.readyEnemyIds, []);
    assert.equal(enemyEntry.enemy.isAggro, false);
    assert.equal(enemyEntry.enemy.actionGauge, 0);
});

test('enemies outside the active simulation range stay idle', () => {
    const actor = makeActor('hero', ENEMY_SIMULATION_ACTIVE_RANGE + 1, 0);
    const enemyEntry = makeEnemyEntry('inactive', 0, 0);
    enemyEntry.enemy.isAggro = true;
    enemyEntry.enemy.actionGauge = 75;
    const controller = makeController([actor], [enemyEntry]);

    const result = controller.updateEnemies({ dt: 10, activeTurnActorId: null });

    assert.deepEqual(result.readyEnemyIds, []);
    assert.equal(enemyEntry.enemy.isAggro, false);
    assert.equal(enemyEntry.enemy.actionGauge, 0);
});

test('aggro enemies charge turns and become ready', () => {
    const actor = makeActor('hero', 3, 0);
    const enemyEntry = makeEnemyEntry('aggro', 0, 0);
    const controller = makeController([actor], [enemyEntry]);

    const result = controller.updateEnemies({ dt: 10, activeTurnActorId: null });

    assert.deepEqual(result.readyEnemyIds, [enemyEntry.enemy.id]);
    assert.equal(enemyEntry.enemy.isAggro, true);
    assert.equal(enemyEntry.enemy.actionGauge, 100);
});

test('immobilized actors and enemies do not move', () => {
    const actor = makeActor('rooted-actor', 0, 0);
    actor.character.statuses = [createStatus('immobilize')];
    actor.path = [{ x: 1, y: 0 }];
    actor.queuedIntent = { kind: 'move', tile: { x: 1, y: 0 } };

    const enemyEntry = makeEnemyEntry('rooted-enemy', 0, 2);
    enemyEntry.enemy.statuses = [createStatus('immobilize')];
    const target = makeActor('target', 3, 2);
    const controller = makeController([actor, target], [enemyEntry]);

    controller.stepActorAlongPath(actor);
    controller.enemyStepToward(enemyEntry, target);

    assert.deepEqual({ x: actor.entity.gridX, y: actor.entity.gridY }, { x: 0, y: 0 });
    assert.deepEqual(actor.path, [{ x: 1, y: 0 }]);
    assert.deepEqual({ x: enemyEntry.enemy.gridX, y: enemyEntry.enemy.gridY }, { x: 0, y: 2 });
});
