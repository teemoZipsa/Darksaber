import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus } from '../../src/combat/StatusEffects';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import { WorldMovementController } from '../../src/engine/world/WorldMovementController';
import { TileType } from '../../src/map/Tile';

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
