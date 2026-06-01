import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import type { ActorSnapshot, AutoLootGrantMessage, WorldJoinMessage } from '../../src/net/WorldProtocol';
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

function withFixedRandom<T>(value: number, callback: () => T): T {
    const previousRandom = Math.random;
    Math.random = () => value;
    try {
        return callback();
    } finally {
        Math.random = previousRandom;
    }
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

test('unsupported useItem intent is rejected cleanly when actor is ready', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    session.tick(0);
    session.tick(1_000);
    const actorId = session.createSnapshot(a.playerId, 1_000).partyActors.find((entry) => entry.ownerPlayerId === a.playerId)!.id;

    const result = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'use-item',
        actorId,
        kind: 'useItem',
        payload: { itemId: 'herb_common' },
    }, 1_000);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(result.replies[0]?.type === 'ACTION_REJECTED' ? result.replies[0].reason : '', /useItem/);
});

test('session logs lifecycle events and exposes debug counts', () => {
    const logs: string[] = [];
    const session = new WorldSession({ ghostGraceMs: 1_000, logger: (message) => logs.push(message) });
    const first = session.join(joinMessage('central_castle', 'hero-a'), 0);

    const initialCounts = session.getDebugCounts();
    assert.equal(initialCounts.activePlayers, 1);
    assert.equal(initialCounts.ghostPlayers, 0);
    assert.ok(initialCounts.enemies > 0);
    assert.equal(initialCounts.lootLocks, 0);

    session.disconnect(first.playerId, 100);
    assert.equal(session.getDebugCounts().ghostPlayers, 1);

    const resumed = session.reconnect(first.welcome.resumeToken, 500);
    assert.equal(resumed?.playerId, first.playerId);

    const leave = session.handleMessage(first.playerId, { type: 'WORLD_LEAVE', reason: 'manual' }, 600);
    assert.equal(leave.replies[0]?.type, 'RAID_RESULT');
    assert.equal(session.getDebugCounts().activePlayers, 0);
    assert.ok(logs.some((entry) => entry.startsWith('join player=')));
    assert.ok(logs.some((entry) => entry.startsWith('ghost start player=')));
    assert.ok(logs.some((entry) => entry.startsWith('reconnect player=')));
    assert.ok(logs.some((entry) => entry.startsWith('leave player=')));
    assert.ok(logs.some((entry) => entry.startsWith('raid result player=')));
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
    const a = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', { stats: createBaseStats({ spd: 100, mov: 500, actionLimit: 80, hitRate: 200 }) })],
    }, 0);
    const b = session.join({
        ...joinMessage('central_castle', 'hero-b'),
        partyComposition: [actor('hero-b', { stats: createBaseStats({ spd: 100, mov: 500, actionLimit: 80, hitRate: 200 }) })],
    }, 0);
    session.tick(0);
    session.tick(1_000);

    const snapshot = session.createSnapshot(a.playerId, 1_000);
    const loot = snapshot.loot[0];
    assert.ok(loot);
    const world = new WorldMap();
    const adjacentTile = [
        { x: loot.tile.x - 1, y: loot.tile.y },
        { x: loot.tile.x + 1, y: loot.tile.y },
        { x: loot.tile.x, y: loot.tile.y - 1 },
        { x: loot.tile.x, y: loot.tile.y + 1 },
    ].find((tile) => world.isWalkable(tile.x, tile.y));
    assert.ok(adjacentTile);

    const internals = session as any;
    for (const playerId of [a.playerId, b.playerId]) {
        const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === playerId);
        assert.ok(serverActor);
        serverActor.tile = { ...adjacentTile };
        serverActor.remainingAp = 80;
        serverActor.actionGauge = 80;
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

test('network world loot snapshots are shared and include container types', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);
    session.tick(1_000);

    const lootA = session.createSnapshot(a.playerId, 1_000).loot.map((loot) => ({
        id: loot.id,
        tile: loot.tile,
        sourceLabel: loot.sourceLabel,
        kind: loot.kind,
        containerType: loot.containerType,
    }));
    const lootB = session.createSnapshot(b.playerId, 1_000).loot.map((loot) => ({
        id: loot.id,
        tile: loot.tile,
        sourceLabel: loot.sourceLabel,
        kind: loot.kind,
        containerType: loot.containerType,
    }));

    assert.ok(lootA.length > 0);
    assert.ok(lootA.every((loot) => loot.kind === 'chest' && loot.containerType));
    assert.deepEqual(lootB, lootA);
});

test('network kills auto-grant normal enemy loot and include display names in combat events', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(serverEnemyEntry);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverEnemyEntry.enemy.stats.hp = 1;
    serverEnemyEntry.enemy.stats.def = 0;
    serverEnemyEntry.enemy.stats.spd = 0;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-auto-loot',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: serverEnemyEntry.enemy.id },
    }, 1_000));

    const event = result.broadcasts.find((message) => message.type === 'COMBAT_EVENT');
    const grant = result.replies.find((message): message is AutoLootGrantMessage => message.type === 'AUTO_LOOT_GRANT');
    assert.equal(event?.type, 'COMBAT_EVENT');
    assert.equal(event?.kind, 'kill');
    assert.equal(event?.sourceName, 'Hero Alpha');
    assert.equal(event?.targetName, serverEnemyEntry.enemy.name);
    assert.ok(grant);
    assert.equal(grant.sourceName, serverEnemyEntry.enemy.name);
    assert.equal(session.createSnapshot(joined.playerId, 1_000).loot.some((loot) => loot.id === grant.lootId), false);

    session.handleMessage(joined.playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: grant.gridSnapshot.items.map((item) => ({ gridX: item.gridX, gridY: item.gridY })),
    }, 1_050);

    assert.equal(session.createSnapshot(joined.playerId, 1_050).loot.some((loot) => loot.id === grant.lootId), false);
});

test('network auto-loot exposes unaccepted leftovers on the field', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(serverEnemyEntry);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverEnemyEntry.enemy.stats.hp = 1;
    serverEnemyEntry.enemy.stats.def = 0;
    serverEnemyEntry.enemy.stats.spd = 0;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-leftover-loot',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: serverEnemyEntry.enemy.id },
    }, 1_000));
    const grant = result.replies.find((message): message is AutoLootGrantMessage => message.type === 'AUTO_LOOT_GRANT');
    assert.ok(grant);

    session.handleMessage(joined.playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: [],
    }, 1_050);

    const exposed = session.createSnapshot(joined.playerId, 1_050).loot.find((loot) => loot.id === grant.lootId);
    assert.ok(exposed);
    assert.equal(exposed.gridSnapshot.items.length, grant.gridSnapshot.items.length);
});
