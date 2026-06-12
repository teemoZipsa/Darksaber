import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { classifyNetworkActorSnapshots } from '../../src/engine/world/NetworkSnapshotOwnership';
import type { ActorSnapshot, WorldPlayerSnapshot } from '../../src/net/WorldProtocol';

function makePlayer(playerId: string, actorIds: string[]): WorldPlayerSnapshot {
    return {
        playerId,
        originHubId: 'central_castle',
        isGhost: false,
        actorIds,
    };
}

function makeActorSnapshot(overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
    return {
        id: 'server-hero',
        name: 'hero',
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats(),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
        ...overrides,
    };
}

test('network snapshot ownership treats local player actor ids as owned and ignores ghost actors', () => {
    const ownership = classifyNetworkActorSnapshots({
        playerId: 'client-1',
        localCharacterIds: new Set(),
        snapshot: {
            players: [makePlayer('client-1', ['server-hero', 'ghost-hero'])],
            partyActors: [
                makeActorSnapshot({ id: 'server-hero' }),
                makeActorSnapshot({ id: 'ghost-hero', isGhost: true }),
                makeActorSnapshot({ id: 'remote-hero', ownerPlayerId: 'client-2' }),
            ],
        },
    });

    assert.deepEqual(ownership.ownSnapshots.map((actor) => actor.id), ['server-hero']);
    assert.deepEqual(ownership.remoteSnapshots.map((actor) => actor.id), ['remote-hero']);
    assert.equal(ownership.localPlayerActorIds.has('server-hero'), true);
    assert.equal(ownership.localPlayerActorIds.has('ghost-hero'), true);
});

test('network snapshot ownership falls back to owner id and local character id', () => {
    const ownership = classifyNetworkActorSnapshots({
        playerId: 'client-1',
        localCharacterIds: new Set(['local-hero']),
        snapshot: {
            players: [makePlayer('client-1', [])],
            partyActors: [
                makeActorSnapshot({ id: 'owned-by-player', ownerPlayerId: 'client-1' }),
                makeActorSnapshot({ id: 'owned-by-local-id', localActorId: 'local-hero' }),
                makeActorSnapshot({ id: 'remote-local-id', localActorId: 'other-local' }),
            ],
        },
    });

    assert.deepEqual(ownership.ownSnapshots.map((actor) => actor.id), ['owned-by-player', 'owned-by-local-id']);
    assert.deepEqual(ownership.remoteSnapshots.map((actor) => actor.id), ['remote-local-id']);
    assert.equal(ownership.isOwnActorSnapshot(makeActorSnapshot({ id: 'late-owned', ownerPlayerId: 'client-1' })), true);
});
