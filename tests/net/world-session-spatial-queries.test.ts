import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { Enemy } from '../../src/entity/Enemy';
import type { ServerActor, ServerEnemy, ServerPlayer } from '../../server/WorldSessionTypes';
import {
    firstActorTile,
    firstLivingActorTile,
    hasActiveActorWithin,
    hasNearbyAggroEnemy,
    hasNearbyLiveEnemy,
} from '../../server/WorldSessionSpatialQueries';

function createActor(id: string, ownerPlayerId: string, x: number, y: number, overrides: Partial<ServerActor> = {}): ServerActor {
    return {
        id,
        ownerPlayerId,
        localActorId: id,
        name: id,
        classLineId: 'knight',
        currentTier: 1,
        level: 1,
        tile: { x, y },
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
        raidModifier: { id: 'supply_drop' },
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

function createEnemy(id: string, x: number, y: number, overrides: Partial<ServerEnemy> = {}): ServerEnemy {
    const enemy = new Enemy(id, x, y, id, 1, '#fff', 'bruiser');
    return { enemy, home: { x, y }, wanderSeed: 1, ...overrides };
}

test('world session spatial enemy queries exclude scenario-private and dead enemies', () => {
    const visible = createEnemy('visible', 2, 0);
    const dead = createEnemy('dead', 1, 0);
    dead.enemy.stats.hp = 0;
    const privateEnemy = createEnemy('private', 1, 0, { scenarioPlayerId: 'player-2' });

    assert.equal(hasNearbyLiveEnemy([dead, privateEnemy], { x: 0, y: 0 }, 3), false);
    assert.equal(hasNearbyLiveEnemy([dead, privateEnemy, visible], { x: 0, y: 0 }, 3), true);

    visible.enemy.isAggro = true;
    privateEnemy.enemy.isAggro = true;
    assert.equal(hasNearbyAggroEnemy([privateEnemy], { x: 0, y: 0 }, 3, 'player-1'), false);
    assert.equal(hasNearbyAggroEnemy([privateEnemy], { x: 0, y: 0 }, 3, 'player-2'), true);
    assert.equal(hasNearbyAggroEnemy([visible], { x: 0, y: 0 }, 3), true);
});

test('world session spatial actor queries respect active, ghost, dungeon, and owner filters', () => {
    const actors = new Map<string, ServerActor>([
        ['actor-1', createActor('actor-1', 'player-1', 2, 0)],
        ['actor-2', createActor('actor-2', 'player-2', 1, 0, { isDead: true })],
    ]);
    const players = [
        createPlayer('player-1', ['actor-1']),
        createPlayer('player-2', ['actor-2']),
        createPlayer('player-3', ['actor-missing'], { ghost: true }),
        createPlayer('player-4', ['actor-1'], { activeDungeonId: 'burgos_castle' }),
    ];

    assert.equal(hasActiveActorWithin(players, actors, { x: 0, y: 0 }, 3), true);
    assert.equal(hasActiveActorWithin(players, actors, { x: 0, y: 0 }, 3, 'player-2'), false);
    assert.equal(hasActiveActorWithin(players, actors, { x: 0, y: 0 }, 3, 'player-1'), true);
    assert.deepEqual(firstActorTile(players[0], actors), { x: 2, y: 0 });
    assert.deepEqual(firstLivingActorTile(players[1], actors), null);
});
