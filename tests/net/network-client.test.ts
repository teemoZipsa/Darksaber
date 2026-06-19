import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultMarketSnapshot } from '../../src/data/MarketData';
import { NetworkRaidClient, type NetworkRaidJoinInput } from '../../src/net/NetworkRaidClient';
import { deriveWorldServerUrl, type WorldSnapshot } from '../../src/net/WorldProtocol';

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
        scenario: {
            enteredDungeonIds: [],
            activeDungeonId: null,
            completedDungeonIds: [],
        },
    };
}

class MockWebSocket {
    public static readonly CONNECTING = 0;
    public static readonly OPEN = 1;
    public static readonly CLOSING = 2;
    public static readonly CLOSED = 3;
    public static instances: MockWebSocket[] = [];

    public readyState = MockWebSocket.CONNECTING;
    public sent: string[] = [];
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;

    public constructor(public readonly url: string) {
        MockWebSocket.instances.push(this);
    }

    public send(data: string): void {
        this.sent.push(data);
    }

    public close(): void {
        this.readyState = MockWebSocket.CLOSED;
    }

    public emitOpen(): void {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.({} as Event);
    }

    public emitMessage(data: unknown): void {
        this.onmessage?.({ data } as MessageEvent);
    }

    public emitClose(): void {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({} as CloseEvent);
    }
}

class MemoryStorage {
    private readonly values = new Map<string, string>();

    public getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    public setItem(key: string, value: string): void {
        this.values.set(key, value);
    }

    public removeItem(key: string): void {
        this.values.delete(key);
    }
}

const globalTestScope = globalThis as unknown as {
    WebSocket?: unknown;
    localStorage?: unknown;
};

function installMockWebSocket(): () => void {
    const original = globalTestScope.WebSocket;
    MockWebSocket.instances = [];
    globalTestScope.WebSocket = MockWebSocket;
    return () => {
        if (original === undefined) Reflect.deleteProperty(globalTestScope, 'WebSocket');
        else globalTestScope.WebSocket = original;
    };
}

function installMemoryStorage(storage: MemoryStorage): () => void {
    const original = Object.getOwnPropertyDescriptor(globalTestScope, 'localStorage');
    Object.defineProperty(globalTestScope, 'localStorage', {
        configurable: true,
        value: storage,
    });
    return () => {
        if (original) Object.defineProperty(globalTestScope, 'localStorage', original);
        else Reflect.deleteProperty(globalTestScope, 'localStorage');
    };
}

function joinInput(): NetworkRaidJoinInput {
    return {
        accessToken: 'access_test',
        characterId: 'character_test',
        originHubId: 'central_castle',
        partyComposition: [],
    };
}

function welcomeMessage(resumeToken = 'resume_1', sessionEpoch = 1): string {
    return JSON.stringify({
        type: 'WORLD_WELCOME',
        playerId: 'player_1',
        sessionEpoch,
        resumeToken,
        spawnTile: { x: 0, y: 0 },
    });
}

test('client rejects network join when the server URL is not configured', async () => {
    const restoreSocket = installMockWebSocket();

    try {
        const client = new NetworkRaidClient({ url: '' });
        await assert.rejects(client.connectAndJoin(joinInput()), /World server URL is not configured/);

        assert.equal(MockWebSocket.instances.length, 0);
        assert.equal(client.getStatus(), 'disconnected');
    } finally {
        restoreSocket();
    }
});

test('world server URL can be derived from the auth server URL', () => {
    assert.equal(deriveWorldServerUrl('https://darksaber-world-server-9d7y.onrender.com'), 'wss://darksaber-world-server-9d7y.onrender.com');
    assert.equal(deriveWorldServerUrl('http://localhost:8765/'), 'ws://localhost:8765');
    assert.equal(deriveWorldServerUrl('postgres://example.com'), '');
    assert.equal(deriveWorldServerUrl('not a url'), '');
});

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

test('client uses stored resume token when joining after refresh', async () => {
    const restoreSocket = installMockWebSocket();
    const storage = new MemoryStorage();
    const restoreStorage = installMemoryStorage(storage);
    storage.setItem('darksaber_world_resume_token', 'stored_resume');

    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin(joinInput());
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitOpen();
        assert.equal(JSON.parse(socket.sent[0]).resumeToken, 'stored_resume');

        socket.emitMessage(welcomeMessage('stored_resume'));
        await join;
        assert.equal(client.getResumeToken(), 'stored_resume');
    } finally {
        restoreStorage();
        restoreSocket();
    }
});

test('client includes access token, character id, requested realm, and carried items in join payload', async () => {
    const restoreSocket = installMockWebSocket();
    const storage = new MemoryStorage();
    const restoreStorage = installMemoryStorage(storage);

    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin({
            ...joinInput(),
            requestedRealm: 'master',
            carriedItems: [{ itemId: 'herb_common', quantity: 2 }],
        });
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitOpen();
        const sent = JSON.parse(socket.sent[0]);
        assert.equal(sent.requestedRealm, 'master');
        assert.deepEqual(sent.carriedItems, [{ itemId: 'herb_common', quantity: 2 }]);
        assert.equal(sent.accessToken, 'access_test');
        assert.equal(sent.characterId, 'character_test');
        assert.equal(sent.accountId, undefined);
        assert.equal(sent.accountSecret, undefined);

        socket.emitMessage(welcomeMessage('resume_account'));
        await join;
    } finally {
        restoreStorage();
        restoreSocket();
    }
});

test('client sends world heartbeat while the socket is open and clears the timer on close', async () => {
    const restoreSocket = installMockWebSocket();
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let heartbeatScheduled = false;
    let heartbeatTick = (): void => {
        throw new Error('heartbeat interval was not scheduled');
    };
    let clearCount = 0;
    (globalThis as unknown as { setInterval: unknown }).setInterval = ((callback: TimerHandler) => {
        if (typeof callback === 'function') {
            heartbeatScheduled = true;
            heartbeatTick = () => callback();
        }
        return { unref: () => undefined };
    }) as unknown as typeof setInterval;
    (globalThis as unknown as { clearInterval: unknown }).clearInterval = (() => {
        clearCount += 1;
    }) as unknown as typeof clearInterval;

    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin(joinInput());
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitOpen();
        assert.equal(heartbeatScheduled, true);
        heartbeatTick();

        const heartbeat = JSON.parse(socket.sent[1]);
        assert.equal(heartbeat.type, 'CLIENT_HEARTBEAT');
        assert.equal(typeof heartbeat.clientTime, 'number');

        socket.emitMessage(welcomeMessage('resume_heartbeat'));
        await join;
        client.close();
        assert.ok(clearCount >= 1);
    } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
        restoreSocket();
    }
});

test('client rejects a superseded join request and ignores stale socket close', async () => {
    const restoreSocket = installMockWebSocket();
    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const firstJoin = client.connectAndJoin(joinInput());
        const firstSocket = MockWebSocket.instances[0];
        assert.ok(firstSocket);

        const secondJoin = client.connectAndJoin({ ...joinInput(), originHubId: 'w_forest_village' });
        const secondSocket = MockWebSocket.instances[1];
        assert.ok(secondSocket);

        firstSocket.emitClose();
        secondSocket.emitOpen();
        assert.equal(JSON.parse(secondSocket.sent[0]).originHubId, 'w_forest_village');

        secondSocket.emitMessage(welcomeMessage('resume_2'));
        await assert.rejects(firstJoin, /superseded/);
        await secondJoin;
    } finally {
        restoreSocket();
    }
});

test('client close rejects a pending welcome promise', async () => {
    const restoreSocket = installMockWebSocket();
    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin(joinInput());
        client.close();
        await assert.rejects(join, /closed by client/);
        assert.equal(client.getStatus(), 'disconnected');
    } finally {
        restoreSocket();
    }
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

test('client rejects pending welcome when server sends ERROR without closing', async () => {
    const restoreSocket = installMockWebSocket();
    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin(joinInput());
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitMessage(JSON.stringify({
            type: 'ERROR',
            code: 'VERSION_MISMATCH',
            message: 'bad version',
        }));

        await assert.rejects(join, /bad version/);
        assert.equal(client.getStatus(), 'disconnected');
    } finally {
        restoreSocket();
    }
});

test('client closes pending join socket when the server rejects without closing', async () => {
    const restoreSocket = installMockWebSocket();
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let clearCount = 0;
    (globalThis as unknown as { setInterval: unknown }).setInterval = (() => ({ unref: () => undefined })) as unknown as typeof setInterval;
    (globalThis as unknown as { clearInterval: unknown }).clearInterval = (() => {
        clearCount += 1;
    }) as unknown as typeof clearInterval;

    try {
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin(joinInput());
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitOpen();
        socket.emitMessage(JSON.stringify({
            type: 'ERROR',
            code: 'VERSION_MISMATCH',
            message: 'bad version',
        }));

        await assert.rejects(join, /bad version/);
        assert.equal(socket.readyState, MockWebSocket.CLOSED);
        assert.equal(client.getIsOpen(), false);
        assert.equal(client.getStatus(), 'disconnected');
        assert.equal(clearCount, 1);
    } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
        restoreSocket();
    }
});

test('client reports malformed server messages instead of throwing', () => {
    const errors: string[] = [];
    const client = new NetworkRaidClient({
        onErrorMessage: (error) => errors.push(error.code),
    });
    const harness = client as unknown as { handleMessage(raw: string): void };

    harness.handleMessage('{');
    harness.handleMessage(JSON.stringify({ nope: true }));
    harness.handleMessage(JSON.stringify({ type: 'WORLD_SNAPSHOT' }));

    assert.deepEqual(errors, ['BAD_JSON', 'BAD_MESSAGE', 'BAD_MESSAGE']);
});

test('client validates scenario field reward payloads with original item ids', () => {
    const seen: unknown[] = [];
    const errors: string[] = [];
    const client = new NetworkRaidClient({
        onScenarioFieldEventResult: (message) => seen.push(message.rewards),
        onErrorMessage: (error) => errors.push(error.code),
    });
    const harness = client as unknown as { handleMessage(raw: string): void };

    harness.handleMessage(JSON.stringify({
        type: 'SCENARIO_FIELD_EVENT_RESULT',
        intentId: 'cache-23-91',
        dungeonId: 'beelzebuth_hall',
        eventId: 'beelzebuth_hall_cache_91',
        scope: 'player',
        flag: 'beelzebuth_hall_cache_91',
        presentationSteps: [],
        rewards: [{ type: 'item', itemId: 'orig_late_1005', originalItemId: 1005 }],
    }));
    harness.handleMessage(JSON.stringify({
        type: 'SCENARIO_FIELD_EVENT_RESULT',
        intentId: 'bad-cache',
        dungeonId: 'beelzebuth_hall',
        eventId: 'beelzebuth_hall_cache_92',
        scope: 'player',
        flag: 'beelzebuth_hall_cache_92',
        presentationSteps: [],
        rewards: [{ type: 'item', originalItemId: '1052' }],
    }));

    assert.deepEqual(seen, [[{ type: 'item', itemId: 'orig_late_1005', originalItemId: 1005 }]]);
    assert.deepEqual(errors, ['BAD_MESSAGE']);
});

test('client dispatches market messages from the shared world socket', () => {
    const seen: string[] = [];
    const client = new NetworkRaidClient({
        onMarketSnapshot: () => seen.push('snapshot'),
        onMarketRecordAck: () => seen.push('ack'),
    });
    const harness = client as unknown as { handleMessage(raw: string): void };
    const snapshotPayload = createDefaultMarketSnapshot();

    harness.handleMessage(JSON.stringify({
        type: 'MARKET_SNAPSHOT',
        serverTime: 100,
        snapshot: snapshotPayload,
    }));
    harness.handleMessage(JSON.stringify({
        type: 'MARKET_RECORD_ACK',
        kind: 'request',
        accepted: true,
        snapshot: snapshotPayload,
    }));

    assert.deepEqual(seen, ['snapshot', 'ack']);
});

test('client dispatches server-confirmed inventory consumption', () => {
    const consumed: Array<{ itemId: string; quantity: number }> = [];
    const client = new NetworkRaidClient({
        onInventoryConsumed: (message) => consumed.push({ itemId: message.itemId, quantity: message.quantity }),
    });
    const harness = client as unknown as { handleMessage(raw: string): void };

    harness.handleMessage(JSON.stringify({
        type: 'INVENTORY_CONSUMED',
        itemId: 'herb_common',
        quantity: 1,
    }));

    assert.deepEqual(consumed, [{ itemId: 'herb_common', quantity: 1 }]);
});

test('raid result clears resume state and disconnects without grace expiry', async () => {
    const restoreSocket = installMockWebSocket();
    const storage = new MemoryStorage();
    const restoreStorage = installMemoryStorage(storage);
    const statuses: string[] = [];
    let graceExpired = false;

    try {
        const client = new NetworkRaidClient({
            url: 'ws://test',
            onStatusChange: (status) => statuses.push(status),
            onGraceExpired: () => {
                graceExpired = true;
            },
        });
        const join = client.connectAndJoin(joinInput());
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitOpen();
        socket.emitMessage(welcomeMessage('resume_done'));
        socket.emitMessage(JSON.stringify({
            type: 'RAID_RESULT',
            playerId: 'player_1',
            result: 'SURVIVED',
            elapsedSeconds: 10,
            kills: 1,
            departureTownId: 'central_castle',
            extractionTownId: 'central_castle',
            completedDungeonIds: [],
        }));
        socket.emitClose();

        assert.equal(client.getPlayerId(), null);
        assert.equal(client.getResumeToken(), null);
        assert.equal(storage.getItem('darksaber_world_resume_token'), null);
        assert.equal(client.getStatus(), 'disconnected');
        assert.equal(graceExpired, false);
        assert.ok(statuses.includes('connected'));
        assert.ok(statuses.includes('disconnected'));
        await join;
    } finally {
        restoreStorage();
        restoreSocket();
    }
});

test('resume failure clears stored resume state', async () => {
    const restoreSocket = installMockWebSocket();
    const storage = new MemoryStorage();
    storage.setItem('darksaber_world_resume_token', 'stale_resume');
    const restoreStorage = installMemoryStorage(storage);

    try {
        assert.equal(NetworkRaidClient.hasStoredResumeToken(), true);
        const client = new NetworkRaidClient({ url: 'ws://test' });
        const join = client.connectAndJoin(joinInput());
        const socket = MockWebSocket.instances[0];
        assert.ok(socket);

        socket.emitOpen();
        assert.equal(JSON.parse(socket.sent[0]).resumeToken, 'stale_resume');
        socket.emitMessage(JSON.stringify({
            type: 'ERROR',
            code: 'RESUME_FAILED',
            message: 'Resume token is expired or unknown.',
        }));

        await assert.rejects(join, /RESUME_FAILED/);
        assert.equal(client.getResumeToken(), null);
        assert.equal(storage.getItem('darksaber_world_resume_token'), null);
        assert.equal(NetworkRaidClient.hasStoredResumeToken(), false);
    } finally {
        restoreStorage();
        restoreSocket();
    }
});

test('client reports sends attempted before socket open', () => {
    const errors: string[] = [];
    const client = new NetworkRaidClient({
        onErrorMessage: (error) => errors.push(error.code),
    });

    const intentId = client.sendIntent('actor_1', 'endTurn', { reason: 'test' }, 'intent_test');
    const scenarioIntentId = client.sendScenarioEnter('actor_1', 'burgos_castle', 'scenario_test');

    assert.equal(intentId, 'intent_test');
    assert.equal(scenarioIntentId, 'scenario_test');
    assert.deepEqual(errors, ['SOCKET_NOT_OPEN', 'SOCKET_NOT_OPEN']);
});
