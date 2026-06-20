import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBaseStats } from '../../src/data/Stats';
import type { ActorSnapshot, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { WorldSession } from '../../server/WorldSession';
import { WorldSessionSnapshotStore } from '../../server/WorldSessionSnapshotStore';

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

test('world session snapshot store reloads reconnectable active raid snapshots', () => {
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

        store.upsert({ sessionKey, snapshot: session.createPersistentSnapshot() });
        const reloadedStore = new WorldSessionSnapshotStore({ persistPath });
        const entries = reloadedStore.list();
        assert.equal(entries.length, 1);
        assert.equal(entries[0]?.sessionKey, sessionKey);

        const restored = WorldSession.restorePersistentSnapshot(entries[0]!.snapshot);
        restored.disconnectActivePlayersForServerRestart(5_000);
        const reconnect = restored.reconnect(joined.welcome.resumeToken, 6_000);
        assert.ok(reconnect);
        assert.equal(reconnect.playerId, joined.playerId);
        assert.equal(reconnect.welcome.sessionEpoch, 77_777);

        reloadedStore.remove(sessionKey);
        assert.equal(new WorldSessionSnapshotStore({ persistPath }).list().length, 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
