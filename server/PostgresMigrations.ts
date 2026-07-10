export interface PostgresMigrationClient {
    query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
    release?(): void;
}

export interface PostgresMigrationPool extends PostgresMigrationClient {
    connect?(): Promise<PostgresMigrationClient>;
}

export interface PostgresMigration {
    version: number;
    name: string;
    sql: string;
}

const MIGRATION_LOCK_ID = 1_247_663_129;

export const POSTGRES_MIGRATIONS: readonly PostgresMigration[] = [
    {
        version: 1,
        name: 'auth_core',
        sql: `
            CREATE TABLE IF NOT EXISTS accounts (
                id uuid PRIMARY KEY,
                login_name text NOT NULL UNIQUE,
                login_name_normalized text NOT NULL UNIQUE,
                password_hash text NOT NULL,
                last_selected_character_id uuid NULL,
                created_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL,
                disabled_at timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS account_sessions (
                id uuid PRIMARY KEY,
                account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                refresh_token_hash text NOT NULL,
                token_family_id uuid NOT NULL,
                created_at timestamptz NOT NULL,
                expires_at timestamptz NOT NULL,
                last_used_at timestamptz NOT NULL,
                revoked_at timestamptz NULL,
                replaced_by_session_id uuid NULL,
                user_agent text NULL,
                ip_hash text NULL
            );

            CREATE INDEX IF NOT EXISTS account_sessions_refresh_hash_idx ON account_sessions(refresh_token_hash);
            CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON account_sessions(account_id);
            CREATE INDEX IF NOT EXISTS account_sessions_family_idx ON account_sessions(token_family_id);

            CREATE TABLE IF NOT EXISTS characters (
                id uuid PRIMARY KEY,
                account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                slot_no int NOT NULL,
                name text NOT NULL,
                class_key text NOT NULL,
                tier int NOT NULL DEFAULT 1,
                level int NOT NULL DEFAULT 1,
                exp bigint NOT NULL DEFAULT 0,
                base_stats jsonb NOT NULL,
                created_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL,
                deleted_at timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS character_saves (
                character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
                save_version int NOT NULL,
                revision bigint NOT NULL DEFAULT 1,
                hub_location jsonb NOT NULL,
                quest_state jsonb NOT NULL,
                inventory jsonb NOT NULL,
                equipment jsonb NOT NULL,
                party_snapshot jsonb NOT NULL,
                roster_snapshot jsonb NOT NULL,
                updated_at timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS account_progress (
                account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
                completed_quests jsonb NOT NULL,
                unlocks jsonb NOT NULL,
                flags jsonb NOT NULL,
                updated_at timestamptz NOT NULL
            );
        `,
    },
    {
        version: 2,
        name: 'character_stash',
        sql: `
            ALTER TABLE character_saves
            ADD COLUMN IF NOT EXISTS stash_snapshot jsonb NOT NULL
            DEFAULT '{"width":15,"height":10,"items":[]}'::jsonb;
        `,
    },
    {
        version: 3,
        name: 'active_character_uniqueness',
        sql: `
            ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_account_id_slot_no_key;
            ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_account_id_name_key;
            CREATE UNIQUE INDEX IF NOT EXISTS characters_active_slot_idx
                ON characters(account_id, slot_no)
                WHERE deleted_at IS NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS characters_active_name_idx
                ON characters(account_id, lower(name))
                WHERE deleted_at IS NULL;
        `,
    },
    {
        version: 4,
        name: 'world_session_recovery',
        sql: `
            CREATE TABLE IF NOT EXISTS world_session_snapshots (
                session_key text PRIMARY KEY,
                snapshot jsonb NOT NULL,
                updated_at timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS world_session_leases (
                session_key text PRIMARY KEY,
                owner_id text NOT NULL,
                lease_expires_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL
            );
        `,
    },
];

export async function runPostgresMigrations(pool: PostgresMigrationPool): Promise<number[]> {
    const client = pool.connect ? await pool.connect() : pool;
    const appliedNow: number[] = [];
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version int PRIMARY KEY,
                name text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        const result = await client.query<{ version: number }>(
            'SELECT version FROM schema_migrations ORDER BY version ASC'
        );
        const applied = new Set(result.rows.map((row) => Number(row.version)));
        for (const migration of POSTGRES_MIGRATIONS) {
            if (applied.has(migration.version)) continue;
            await client.query(migration.sql);
            await client.query(
                'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
                [migration.version, migration.name]
            );
            appliedNow.push(migration.version);
        }
        await client.query('COMMIT');
        return appliedNow;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release?.();
    }
}
