import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PostgresAuthStore,
    normalizeLoginName,
} from '../../server/AuthStore';
import { createPostgresPool } from '../../server/PostgresConnection';
import { POSTGRES_MIGRATIONS } from '../../server/PostgresMigrations';
import { WorldSession } from '../../server/WorldSession';
import { PostgresWorldSessionSnapshotStore } from '../../server/WorldSessionSnapshotStore';

const connectionString = process.env.TEST_DATABASE_URL;

test('production Postgres stores migrate and round-trip auth saves and raid snapshots', {
    skip: connectionString ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
    assert.ok(connectionString);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const store = new PostgresAuthStore(connectionString);
    const snapshotStore = new PostgresWorldSessionSnapshotStore({ connectionString });
    const pool = createPostgresPool(connectionString);
    let accountId: string | null = null;
    const sessionKey = `mortal:raid:ci_${suffix}`;
    const leaseOwnerId = `ci-${suffix}`;
    try {
        await store.initialize();
        await store.initialize();
        await snapshotStore.initialize();

        const migrations = await pool.query<{ version: number; name: string }>(
            'SELECT version, name FROM schema_migrations ORDER BY version ASC'
        );
        assert.deepEqual(
            migrations.rows.map(({ version, name }) => [version, name]),
            POSTGRES_MIGRATIONS.map(({ version, name }) => [version, name])
        );

        const loginName = `ci_${suffix}`;
        const account = await store.createAccount({
            loginName,
            loginNameNormalized: normalizeLoginName(loginName),
            passwordHash: 'integration-test-hash',
        });
        accountId = account.id;
        const created = await store.createCharacter(account.id, {
            name: `Hero${suffix}`,
            classKey: 'infantry',
            gender: 'M',
        });
        const updated = await store.updateCharacterSave(account.id, created.character.id, {
            expectedRevision: created.save.revision,
            patch: {
                stashSnapshot: {
                    width: 15,
                    height: 10,
                    items: [{
                        itemId: 'herb_cheap',
                        gridX: 0,
                        gridY: 0,
                        quantity: 2,
                        durability: 1,
                    }],
                },
            },
        });
        assert.equal(updated.status, 'updated');
        const selected = await store.selectCharacter(account.id, created.character.id);
        assert.equal(selected?.save.stashSnapshot.items[0]?.quantity, 2);

        const session = new WorldSession({ sessionEpoch: 91_001 });
        const joined = session.join({
            type: 'WORLD_JOIN',
            originHubId: 'central_castle',
            partyComposition: [],
            clientVersion: 'postgres-integration',
        }, 0, {
            accountId: account.id,
            characterId: created.character.id,
            saveSnapshot: selected?.save,
        });
        assert.equal(joined.welcome.sessionEpoch, 91_001);
        await snapshotStore.upsert({ sessionKey, snapshot: session.createPersistentSnapshot() });
        assert.equal((await snapshotStore.list()).some((entry) => entry.sessionKey === sessionKey), true);
        assert.equal(await snapshotStore.acquireLease(sessionKey, leaseOwnerId, 15_000), true);
    } finally {
        await snapshotStore.releaseLease(sessionKey, leaseOwnerId).catch(() => undefined);
        await snapshotStore.remove(sessionKey).catch(() => undefined);
        if (accountId) await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
        await Promise.allSettled([store.close(), snapshotStore.close?.(), pool.end()]);
    }
});
