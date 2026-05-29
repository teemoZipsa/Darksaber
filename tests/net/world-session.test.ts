import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import type { ActorSnapshot, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { WorldMap } from '../../src/map/WorldMap';
import { WorldSession } from '../../server/WorldSession';

function actor(id: string, overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
    return {
        id,
        localActorId: id,
        name: id,
        classLineId: 'infantry',
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
        ...overrides,
    };
}

function joinMessage(originHubId: string, id: string, resumeToken?: string): WorldJoinMessage {
    return {
        type: 'WORLD_JOIN',
        originHubId,
        partyComposition: [actor(id)],
        clientVersion: 'test',
        resumeToken,
    };
}

test('join spawns each player at their origin hub external exit tile', () => {
    const session = new WorldSession();
    const world = new WorldMap();

    const central = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const forest = session.join(joinMessage('w_forest_village', 'hero-b'), 0);

    const centralActor = session.createSnapshot(central.playerId, 0).partyActors.find((entry) => entry.ownerPlayerId === central.playerId);
    const forestActor = session.createSnapshot(forest.playerId, 0).partyActors.find((entry) => entry.ownerPlayerId === forest.playerId);
    const centralExit = world.getTownExitTile(world.getTowns().find((town) => town.id === 'central_castle')!);
    const forestExit = world.getTownExitTile(world.getTowns().find((town) => town.id === 'w_forest_village')!);

    assert.deepEqual(centralActor?.tile, centralExit);
    assert.deepEqual(forestActor?.tile, forestExit);
});

test('server tick advances shared enemy state for every client snapshot', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);

    session.tick(0);
    session.tick(250);

    const snapshotA = session.createSnapshot(a.playerId, 250);
    const snapshotB = session.createSnapshot(b.playerId, 250);
    assert.ok(snapshotA.enemies.some((enemy) => enemy.actionGauge > 0));
    assert.deepEqual(
        snapshotA.enemies.map((enemy) => ({ id: enemy.id, hp: enemy.stats.hp, tile: enemy.tile, gauge: enemy.actionGauge })),
        snapshotB.enemies.map((enemy) => ({ id: enemy.id, hp: enemy.stats.hp, tile: enemy.tile, gauge: enemy.actionGauge }))
    );
});

test('intent ownership rejects another player actor', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);
    const bActorId = session.createSnapshot(b.playerId, 0).partyActors.find((entry) => entry.ownerPlayerId === b.playerId)!.id;

    const result = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'steal-turn',
        actorId: bActorId,
        kind: 'endTurn',
        payload: {},
    }, 0);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
});

test('disconnect grace resumes same actor before expiry and starts fresh after expiry', () => {
    const session = new WorldSession({ ghostGraceMs: 1_000 });
    const first = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const firstActorId = session.createSnapshot(first.playerId, 0).partyActors[0].id;

    session.disconnect(first.playerId, 100);
    const resumed = session.join(joinMessage('central_castle', 'hero-a', first.welcome.resumeToken), 500);
    const resumedActorId = session.createSnapshot(resumed.playerId, 500).partyActors[0].id;

    assert.equal(resumed.playerId, first.playerId);
    assert.equal(resumedActorId, firstActorId);

    session.disconnect(resumed.playerId, 600);
    session.tick(1_700);
    const fresh = session.join(joinMessage('central_castle', 'hero-a', first.welcome.resumeToken), 1_800);

    assert.notEqual(fresh.playerId, first.playerId);
    assert.notEqual(session.createSnapshot(fresh.playerId, 1_800).partyActors[0].id, firstActorId);
});

test('loot contention grants one occupant and rejects the other', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);
    session.tick(0);
    session.tick(1_000);

    const snapshot = session.createSnapshot(a.playerId, 1_000);
    const loot = snapshot.loot[0];
    assert.ok(loot);

    for (const playerId of [a.playerId, b.playerId]) {
        const actorId = session.createSnapshot(playerId, 1_000).partyActors.find((entry) => entry.ownerPlayerId === playerId)!.id;
        session.handleMessage(playerId, {
            type: 'PLAYER_INTENT',
            intentId: `move-${playerId}`,
            actorId,
            kind: 'move',
            payload: { tile: { x: loot.tile.x - 1, y: loot.tile.y } },
        }, 1_000);
    }

    const actorA = session.createSnapshot(a.playerId, 1_000).partyActors.find((entry) => entry.ownerPlayerId === a.playerId)!.id;
    const actorB = session.createSnapshot(b.playerId, 1_000).partyActors.find((entry) => entry.ownerPlayerId === b.playerId)!.id;
    const grant = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-a',
        actorId: actorA,
        kind: 'interact',
        payload: { lootId: loot.id },
    }, 1_100);
    const reject = session.handleMessage(b.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-b',
        actorId: actorB,
        kind: 'interact',
        payload: { lootId: loot.id },
    }, 1_100);

    assert.equal(grant.replies[0]?.type, 'LOOT_GRANT');
    assert.equal(reject.replies[0]?.type, 'ACTION_REJECTED');
});
