import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { Enemy } from '../../src/entity/Enemy';
import type { ServerActor, ServerEnemy, ServerPlayer } from '../../server/WorldSessionTypes';
import {
    canActorTargetEnemy,
    getTargetableActors,
    isActorVisibleToViewer,
    isEnemyVisibleToViewer,
    isPlayerWiped,
} from '../../server/WorldSessionVisibility';

function createActor(id: string, ownerPlayerId: string, overrides: Partial<ServerActor> = {}): ServerActor {
    return {
        id,
        ownerPlayerId,
        localActorId: id,
        name: id,
        classLineId: 'knight',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ hp: 10, maxHp: 10 }),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        majorActionUsed: false,
        facing: 'down',
        isDead: false,
        magicLoadout: [],
        skillUpgradeLevels: {},
        ...overrides,
    };
}

function createPlayer(id: string, actorIds: string[], overrides: Partial<ServerPlayer> = {}): ServerPlayer {
    return {
        id,
        resumeToken: `resume-${id}`,
        originHubId: 'central_castle',
        departureTownId: 'central_castle',
        elapsedSeconds: 0,
        kills: 0,
        carriedWeight: 0,
        carriedItems: new Map(),
        raidGoldReward: 0,
        completedQuestIds: new Set(),
        enteredDungeonIds: new Set(),
        completedDungeonIds: new Set(),
        fieldEventFlagsByDungeonId: new Map(),
        activeDungeonId: null,
        active: true,
        ghost: false,
        disconnectedAt: null,
        actorIds,
        ...overrides,
    };
}

function createEnemy(id: string, scenarioPlayerId?: string): ServerEnemy {
    return {
        enemy: new Enemy(id, 0, 0, id, 1, '#fff', 'bruiser'),
        home: { x: 0, y: 0 },
        wanderSeed: 1,
        scenarioPlayerId,
    };
}

test('world session visibility keeps private scenario actors and enemies isolated', () => {
    const players = new Map<string, ServerPlayer>([
        ['player-1', createPlayer('player-1', ['actor-1'], { activeDungeonId: 'burgos_castle' })],
        ['player-2', createPlayer('player-2', ['actor-2'])],
    ]);
    const actor1 = createActor('actor-1', 'player-1');
    const actor2 = createActor('actor-2', 'player-2');
    const sharedEnemy = createEnemy('shared');
    const privateEnemy = createEnemy('private', 'player-1');

    assert.equal(isActorVisibleToViewer(players, actor1, 'player-1'), true);
    assert.equal(isActorVisibleToViewer(players, actor2, 'player-1'), false);
    assert.equal(isActorVisibleToViewer(players, actor1, 'player-2'), false);
    assert.equal(isEnemyVisibleToViewer(players, sharedEnemy, 'player-2'), true);
    assert.equal(isEnemyVisibleToViewer(players, privateEnemy, 'player-2'), false);
    assert.equal(isEnemyVisibleToViewer(players, privateEnemy, 'player-1'), true);
});

test('world session visibility filters targetable actors and wipe state', () => {
    const actors = new Map<string, ServerActor>([
        ['actor-1', createActor('actor-1', 'player-1')],
        ['actor-2', createActor('actor-2', 'player-2')],
        ['actor-3', createActor('actor-3', 'player-3', { isDead: true })],
    ]);
    const players = new Map<string, ServerPlayer>([
        ['player-1', createPlayer('player-1', ['actor-1'])],
        ['player-2', createPlayer('player-2', ['actor-2'], { ghost: true })],
        ['player-3', createPlayer('player-3', ['actor-3'])],
        ['player-4', createPlayer('player-4', [], { activeDungeonId: 'burgos_castle' })],
    ]);
    const privateEnemy = createEnemy('private', 'player-2');

    assert.deepEqual(getTargetableActors(players, actors.values()).map((actor) => actor.id), ['actor-1', 'actor-2']);
    assert.deepEqual(getTargetableActors(players, actors.values(), privateEnemy).map((actor) => actor.id), ['actor-2']);
    assert.equal(canActorTargetEnemy(actors.get('actor-1')!, privateEnemy), false);
    assert.equal(canActorTargetEnemy(actors.get('actor-2')!, privateEnemy), true);
    assert.equal(isPlayerWiped(players.get('player-1')!, actors), false);
    assert.equal(isPlayerWiped(players.get('player-3')!, actors), true);
});
