import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBaseStats } from '../../src/data/Stats';
import type { ActorSnapshot, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { WorldSession } from '../../server/WorldSession';
import {
    PostgresWorldSessionSnapshotStore,
    WorldSessionSnapshotStore,
    type PostgresWorldSessionSnapshotPool,
} from '../../server/WorldSessionSnapshotStore';

function actor(id: string): ActorSnapshot {
    return {
        id,
        localActorId: id,
        name: id,
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
    };
}

function joinMessage(originHubId: string, id: string): WorldJoinMessage {
    return {
        type: 'WORLD_JOIN',
        originHubId,
        partyComposition: [actor(id)],
        clientVersion: 'test',
    };
}

function authCharacter(id: string): AuthCharacter {
    return {
        id,
        accountId: 'account-test',
        slotNo: 1,
        name: id,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}

test('world session snapshot store reloads reconnectable active raid snapshots', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-session-snapshot-'));
    try {
        const persistPath = join(dir, 'world-session-snapshots.json');
        const sessionKey = 'mortal:primary';
        const character = authCharacter('hero-snapshot-store');
        const session = new WorldSession({ sessionEpoch: 77_777 });
        const joined = session.join(joinMessage('central_castle', character.id), 0, {
            accountId: character.accountId,
            characterId: character.id,
            saveSnapshot: createDefaultCharacterSave(character),
        });
        const store = new WorldSessionSnapshotStore({
            persistPath,
            now: () => new Date('2026-01-01T00:00:00.000Z'),
        });

        await store.upsert({ sessionKey, snapshot: session.createPersistentSnapshot() });
        const reloadedStore = new WorldSessionSnapshotStore({ persistPath });
        const entries = await reloadedStore.list();
        assert.equal(entries.length, 1);
        assert.equal(entries[0]?.sessionKey, sessionKey);

        const restored = WorldSession.restorePersistentSnapshot(entries[0]!.snapshot);
        restored.disconnectActivePlayersForServerRestart(5_000);
        const reconnect = restored.reconnect(joined.welcome.resumeToken, 6_000);
        assert.ok(reconnect);
        assert.equal(reconnect.playerId, joined.playerId);
        assert.equal(reconnect.welcome.sessionEpoch, 77_777);

        await reloadedStore.remove(sessionKey);
        assert.equal((await new WorldSessionSnapshotStore({ persistPath }).list()).length, 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('postgres world session snapshot store persists shared raid snapshots', async () => {
    const rows = new Map<string, { session_key: string; snapshot: unknown; updated_at: Date }>();
    const leases = new Map<string, { session_key: string; owner_id: string; lease_expires_at: Date; updated_at: Date }>();
    const queries: string[] = [];
    const pool: PostgresWorldSessionSnapshotPool = {
        async query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
            queries.push(text);
            if (text.includes('CREATE TABLE')) return { rows: [] };
            if (text.startsWith('INSERT INTO world_session_leases')) {
                const sessionKey = String(values?.[0]);
                const ownerId = String(values?.[1]);
                const expiresAt = new Date(String(values?.[2]));
                const updatedAt = new Date(String(values?.[3]));
                const existing = leases.get(sessionKey);
                if (!existing || existing.owner_id === ownerId || existing.lease_expires_at <= updatedAt) {
                    leases.set(sessionKey, { session_key: sessionKey, owner_id: ownerId, lease_expires_at: expiresAt, updated_at: updatedAt });
                    return { rows: [{ session_key: sessionKey }] as T[] };
                }
                return { rows: [] };
            }
            if (text.startsWith('INSERT INTO world_session_snapshots')) {
                const sessionKey = String(values?.[0]);
                rows.set(sessionKey, {
                    session_key: sessionKey,
                    snapshot: JSON.parse(String(values?.[1])),
                    updated_at: new Date(String(values?.[2])),
                });
                return { rows: [] };
            }
            if (text.startsWith('SELECT session_key')) return { rows: [...rows.values()] as T[] };
            if (text.startsWith('UPDATE world_session_leases')) {
                const sessionKey = String(values?.[0]);
                const ownerId = String(values?.[1]);
                const lease = leases.get(sessionKey);
                if (!lease || lease.owner_id !== ownerId) return { rows: [] };
                lease.lease_expires_at = new Date(String(values?.[2]));
                lease.updated_at = new Date(String(values?.[3]));
                return { rows: [{ session_key: sessionKey }] as T[] };
            }
            if (text.startsWith('DELETE FROM world_session_snapshots WHERE')) {
                rows.delete(String(values?.[0]));
                return { rows: [] };
            }
            if (text.startsWith('DELETE FROM world_session_leases')) {
                const sessionKey = String(values?.[0]);
                const ownerId = String(values?.[1]);
                if (leases.get(sessionKey)?.owner_id === ownerId) leases.delete(sessionKey);
                return { rows: [] };
            }
            if (text.startsWith('DELETE FROM world_session_snapshots')) {
                rows.clear();
                return { rows: [] };
            }
            throw new Error(`Unexpected query: ${text}`);
        },
    };
    const store = new PostgresWorldSessionSnapshotStore({
        pool,
        now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    const character = authCharacter('hero-postgres-snapshot');
    const session = new WorldSession({ sessionEpoch: 88_888 });
    session.join(joinMessage('central_castle', character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: createDefaultCharacterSave(character),
    });

    await store.initialize();
    assert.equal(await store.acquireLease('mortal:raid:party_alpha', 'server-a', 15_000), true);
    assert.equal(await store.acquireLease('mortal:raid:party_alpha', 'server-b', 15_000), false);
    assert.equal(await store.renewLease('mortal:raid:party_alpha', 'server-a', 15_000), true);
    assert.equal(await store.renewLease('mortal:raid:party_alpha', 'server-b', 15_000), false);
    await store.upsert({ sessionKey: 'mortal:raid:party_alpha', snapshot: session.createPersistentSnapshot() });
    const entries = await store.list();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.sessionKey, 'mortal:raid:party_alpha');
    assert.equal(entries[0]?.snapshot.sessionEpoch, 88_888);
    assert.ok(queries.some((query) => query.includes('CREATE TABLE IF NOT EXISTS world_session_snapshots')));

    await store.remove('mortal:raid:party_alpha');
    assert.equal((await store.list()).length, 0);
    await store.releaseLease('mortal:raid:party_alpha', 'server-a');
    assert.equal(await store.acquireLease('mortal:raid:party_alpha', 'server-b', 15_000), true);
});
