import assert from 'node:assert/strict';
import test from 'node:test';
import {
    POSTGRES_MIGRATIONS,
    runPostgresMigrations,
    type PostgresMigrationClient,
    type PostgresMigrationPool,
} from '../../server/PostgresMigrations';

test('postgres migrations apply once in version order inside a locked transaction', async () => {
    const applied = new Map<number, string>();
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const client: PostgresMigrationClient = {
        async query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
            queries.push({ text, values });
            if (text.startsWith('SELECT version FROM schema_migrations')) {
                return { rows: [...applied.keys()].map((version) => ({ version })) as T[] };
            }
            if (text.startsWith('INSERT INTO schema_migrations')) {
                applied.set(Number(values?.[0]), String(values?.[1]));
            }
            return { rows: [] };
        },
        release: () => undefined,
    };
    const pool: PostgresMigrationPool = {
        query: client.query,
        connect: async () => client,
    };

    assert.deepEqual(await runPostgresMigrations(pool), [1, 2, 3, 4]);
    assert.deepEqual([...applied.entries()], POSTGRES_MIGRATIONS.map((migration) => [migration.version, migration.name]));
    assert.equal(queries[0]?.text, 'BEGIN');
    assert.match(queries[1]?.text ?? '', /pg_advisory_xact_lock/);
    assert.equal(queries[queries.length - 1]?.text, 'COMMIT');

    queries.length = 0;
    assert.deepEqual(await runPostgresMigrations(pool), []);
    assert.equal(queries.some(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS accounts')), false);
    assert.equal(queries[queries.length - 1]?.text, 'COMMIT');
});

test('postgres migration failure rolls back and releases its connection', async () => {
    const queries: string[] = [];
    let released = false;
    const client: PostgresMigrationClient = {
        async query<T>(text: string): Promise<{ rows: T[] }> {
            queries.push(text);
            if (text.includes('CREATE TABLE IF NOT EXISTS accounts')) throw new Error('migration failed');
            if (text.startsWith('SELECT version FROM schema_migrations')) return { rows: [] };
            return { rows: [] };
        },
        release: () => { released = true; },
    };

    await assert.rejects(
        runPostgresMigrations({ query: client.query, connect: async () => client }),
        /migration failed/
    );
    assert.equal(queries[queries.length - 1], 'ROLLBACK');
    assert.equal(released, true);
});
