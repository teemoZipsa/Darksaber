import 'dotenv/config';
import { PostgresAuthStore } from './AuthStore';
import { createPostgresPool } from './PostgresConnection';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('DATABASE_URL is not set. Copy .env.production.example to .env or set DATABASE_URL in the environment.');
    process.exit(1);
}

const store = new PostgresAuthStore(connectionString);
const pool = createPostgresPool(connectionString);

try {
    await store.initialize();
    const [accounts, sessions, characters, saves, progress] = await Promise.all([
        countRows('accounts'),
        countRows('account_sessions'),
        countRows('characters'),
        countRows('character_saves'),
        countRows('account_progress'),
    ]);
    console.log(JSON.stringify({
        ok: true,
        database: 'postgres',
        schemaReady: true,
        counts: {
            accounts,
            accountSessions: sessions,
            characters,
            characterSaves: saves,
            accountProgress: progress,
        },
    }, null, 2));
} finally {
    await Promise.all([
        store.close(),
        pool.end(),
    ]);
}

async function countRows(tableName: string): Promise<number> {
    const result = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName}`);
    return Number(result.rows[0]?.count ?? 0);
}
