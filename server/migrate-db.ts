import 'dotenv/config';
import { createPostgresPool } from './PostgresConnection';
import {
    POSTGRES_MIGRATIONS,
    runPostgresMigrations,
    type PostgresMigrationPool,
} from './PostgresMigrations';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is required to run Postgres migrations.');
    process.exit(1);
}

const pool = createPostgresPool(connectionString);
try {
    const applied = await runPostgresMigrations(pool as unknown as PostgresMigrationPool);
    console.log(JSON.stringify({
        ok: true,
        latestVersion: POSTGRES_MIGRATIONS[POSTGRES_MIGRATIONS.length - 1]?.version ?? 0,
        appliedVersions: applied,
    }));
} finally {
    await pool.end();
}
