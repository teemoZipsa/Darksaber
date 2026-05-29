import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkRaidClient } from '../../src/net/NetworkRaidClient';
import type { WorldSnapshot } from '../../src/net/WorldProtocol';

function snapshot(seq: number): WorldSnapshot {
    return {
        seq,
        serverTime: seq * 100,
        players: [],
        partyActors: [],
        enemies: [],
        loot: [],
        readyActors: [],
        remainingApByActor: {},
        raidTimer: {
            active: true,
            elapsedSeconds: 0,
            limitSeconds: 1800,
            departureTownId: 'central_castle',
        },
    };
}

test('client ignores snapshots with regressing seq', () => {
    const applied: number[] = [];
    const client = new NetworkRaidClient({
        onSnapshot: (next) => applied.push(next.seq),
    });
    const harness = client as unknown as { handleMessage(raw: string): void };

    harness.handleMessage(JSON.stringify({ type: 'WORLD_SNAPSHOT', snapshot: snapshot(2) }));
    harness.handleMessage(JSON.stringify({ type: 'WORLD_SNAPSHOT', snapshot: snapshot(1) }));
    harness.handleMessage(JSON.stringify({ type: 'WORLD_SNAPSHOT', snapshot: snapshot(3) }));

    assert.deepEqual(applied, [2, 3]);
});

test('client reports connection status changes from server messages', () => {
    const statuses: string[] = [];
    const client = new NetworkRaidClient({
        onStatusChange: (status) => statuses.push(status),
    });
    const harness = client as unknown as { handleMessage(raw: string): void };

    harness.handleMessage(JSON.stringify({
        type: 'WORLD_WELCOME',
        playerId: 'player_1',
        sessionEpoch: 1,
        resumeToken: 'resume_1',
        spawnTile: { x: 0, y: 0 },
    }));
    harness.handleMessage(JSON.stringify({
        type: 'ERROR',
        code: 'RESUME_FAILED',
        message: 'expired',
    }));

    assert.deepEqual(statuses, ['connected', 'disconnected']);
    assert.equal(client.getStatus(), 'disconnected');
});
