import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileAtomically } from './AtomicFile';
import { createPostgresPool } from './PostgresConnection';
import type { WorldSessionPersistentSnapshot } from './WorldSession';

export interface PendingWorldSessionSnapshot {
    sessionKey: string;
    snapshot: WorldSessionPersistentSnapshot;
    updatedAt: string;
}

export interface WorldSessionSnapshotStoreOptions {
    persistPath: string;
    now?: () => Date;
}

interface WorldSessionSnapshotStoreFile {
    version: 1;
    entries: PendingWorldSessionSnapshot[];
}

export interface WorldSessionSnapshotStoreBackend {
    readonly kind: 'file' | 'postgres';
    initialize(): Promise<void>;
    list(): Promise<PendingWorldSessionSnapshot[]>;
    upsert(input: Omit<PendingWorldSessionSnapshot, 'updatedAt'> & { updatedAt?: string }): Promise<void>;
    remove(sessionKey: string): Promise<void>;
    clear(): Promise<void>;
    acquireLease(sessionKey: string, ownerId: string, ttlMs: number): Promise<boolean>;
    renewLease(sessionKey: string, ownerId: string, ttlMs: number): Promise<boolean>;
    releaseLease(sessionKey: string, ownerId: string): Promise<void>;
    close?(): Promise<void>;
}

export class WorldSessionSnapshotStore implements WorldSessionSnapshotStoreBackend {
    public readonly kind = 'file';
    private readonly persistPath: string;
    private readonly now: () => Date;
    private entries = new Map<string, PendingWorldSessionSnapshot>();

    public constructor(options: WorldSessionSnapshotStoreOptions) {
        this.persistPath = options.persistPath;
        this.now = options.now ?? (() => new Date());
        for (const entry of readSnapshotStoreFile(this.persistPath)?.entries ?? []) {
            this.entries.set(entry.sessionKey, cloneSnapshotEntry(entry));
        }
    }

    public async initialize(): Promise<void> {
        return undefined;
    }

    public async list(): Promise<PendingWorldSessionSnapshot[]> {
        return this.listSync();
    }

    public async upsert(input: Omit<PendingWorldSessionSnapshot, 'updatedAt'> & { updatedAt?: string }): Promise<void> {
        this.entries.set(input.sessionKey, cloneSnapshotEntry({
            ...input,
            updatedAt: input.updatedAt ?? this.now().toISOString(),
        }));
        this.flush();
    }

    public async remove(sessionKey: string): Promise<void> {
        if (!this.entries.delete(sessionKey)) return;
        this.flush();
    }

    public async clear(): Promise<void> {
        if (this.entries.size === 0) return;
        this.entries.clear();
        this.flush();
    }

    public async acquireLease(_sessionKey: string, _ownerId: string, _ttlMs: number): Promise<boolean> {
        return true;
    }

    public async renewLease(_sessionKey: string, _ownerId: string, _ttlMs: number): Promise<boolean> {
        return true;
    }

    public async releaseLease(_sessionKey: string, _ownerId: string): Promise<void> {
        return undefined;
    }

    private flush(): void {
        const file: WorldSessionSnapshotStoreFile = {
            version: 1,
            entries: this.listSync(),
        };
        atomicWriteJson(this.persistPath, file);
    }

    private listSync(): PendingWorldSessionSnapshot[] {
        return [...this.entries.values()].map(cloneSnapshotEntry);
    }
}

export interface PostgresWorldSessionSnapshotStoreOptions {
    connectionString?: string;
    pool?: PostgresWorldSessionSnapshotPool;
    now?: () => Date;
}

export interface PostgresWorldSessionSnapshotPool {
    query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
    end?(): Promise<void>;
}

export class PostgresWorldSessionSnapshotStore implements WorldSessionSnapshotStoreBackend {
    public readonly kind = 'postgres';
    private readonly pool: PostgresWorldSessionSnapshotPool;
    private readonly now: () => Date;

    public constructor(options: PostgresWorldSessionSnapshotStoreOptions) {
        if (options.pool) {
            this.pool = options.pool;
        } else {
            const connectionString = options.connectionString;
            if (!connectionString) {
                throw new Error('PostgresWorldSessionSnapshotStore requires a connectionString or pool.');
            }
            this.pool = createPostgresPool(connectionString);
        }
        this.now = options.now ?? (() => new Date());
    }

    public async initialize(): Promise<void> {
        await this.pool.query(`
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
        `);
    }

    public async list(): Promise<PendingWorldSessionSnapshot[]> {
        const result = await this.pool.query<{ session_key: string; snapshot: unknown; updated_at: Date | string }>(
            `SELECT session_key, snapshot, updated_at FROM world_session_snapshots ORDER BY session_key ASC`
        );
        return result.rows
            .map((row) => rowToSnapshotEntry(row))
            .filter((entry): entry is PendingWorldSessionSnapshot => Boolean(entry));
    }

    public async upsert(input: Omit<PendingWorldSessionSnapshot, 'updatedAt'> & { updatedAt?: string }): Promise<void> {
        const entry = cloneSnapshotEntry({
            ...input,
            updatedAt: input.updatedAt ?? this.now().toISOString(),
        });
        await this.pool.query(
            `INSERT INTO world_session_snapshots (session_key, snapshot, updated_at)
             VALUES ($1, $2::jsonb, $3::timestamptz)
             ON CONFLICT (session_key) DO UPDATE SET
                snapshot = EXCLUDED.snapshot,
                updated_at = EXCLUDED.updated_at`,
            [entry.sessionKey, JSON.stringify(entry.snapshot), entry.updatedAt],
        );
    }

    public async remove(sessionKey: string): Promise<void> {
        await this.pool.query(`DELETE FROM world_session_snapshots WHERE session_key = $1`, [sessionKey]);
    }

    public async clear(): Promise<void> {
        await this.pool.query(`DELETE FROM world_session_snapshots`);
    }

    public async acquireLease(sessionKey: string, ownerId: string, ttlMs: number): Promise<boolean> {
        const now = this.now().toISOString();
        const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();
        const result = await this.pool.query<{ session_key: string }>(
            `INSERT INTO world_session_leases (session_key, owner_id, lease_expires_at, updated_at)
             VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
             ON CONFLICT (session_key) DO UPDATE SET
                owner_id = EXCLUDED.owner_id,
                lease_expires_at = EXCLUDED.lease_expires_at,
                updated_at = EXCLUDED.updated_at
             WHERE world_session_leases.owner_id = EXCLUDED.owner_id
                OR world_session_leases.lease_expires_at <= $4::timestamptz
             RETURNING session_key`,
            [sessionKey, ownerId, expiresAt, now],
        );
        return result.rows.length > 0;
    }

    public async renewLease(sessionKey: string, ownerId: string, ttlMs: number): Promise<boolean> {
        const now = this.now().toISOString();
        const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();
        const result = await this.pool.query<{ session_key: string }>(
            `UPDATE world_session_leases
             SET lease_expires_at = $3::timestamptz, updated_at = $4::timestamptz
             WHERE session_key = $1 AND owner_id = $2
             RETURNING session_key`,
            [sessionKey, ownerId, expiresAt, now],
        );
        return result.rows.length > 0;
    }

    public async releaseLease(sessionKey: string, ownerId: string): Promise<void> {
        await this.pool.query(`DELETE FROM world_session_leases WHERE session_key = $1 AND owner_id = $2`, [sessionKey, ownerId]);
    }

    public async close(): Promise<void> {
        await this.pool.end?.();
    }
}

function readSnapshotStoreFile(persistPath: string): WorldSessionSnapshotStoreFile | null {
    return readJsonFile(persistPath) ?? readJsonFile(backupPath(persistPath));
}

function readJsonFile(path: string): WorldSessionSnapshotStoreFile | null {
    if (!existsSync(path)) return null;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorldSessionSnapshotStoreFile>;
        if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
        return {
            version: 1,
            entries: parsed.entries
                .filter(isPendingWorldSessionSnapshot)
                .map(cloneSnapshotEntry),
        };
    } catch {
        return null;
    }
}

function isPendingWorldSessionSnapshot(value: unknown): value is PendingWorldSessionSnapshot {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<PendingWorldSessionSnapshot>;
    return typeof entry.sessionKey === 'string'
        && typeof entry.updatedAt === 'string'
        && Boolean(entry.snapshot)
        && typeof entry.snapshot === 'object'
        && entry.snapshot.version === 1
        && typeof entry.snapshot.realm === 'string'
        && Array.isArray(entry.snapshot.players);
}

function cloneSnapshotEntry(entry: PendingWorldSessionSnapshot): PendingWorldSessionSnapshot {
    return JSON.parse(JSON.stringify(entry)) as PendingWorldSessionSnapshot;
}

function rowToSnapshotEntry(row: { session_key: string; snapshot: unknown; updated_at: Date | string }): PendingWorldSessionSnapshot | null {
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
    const entry = {
        sessionKey: row.session_key,
        snapshot: row.snapshot,
        updatedAt,
    };
    return isPendingWorldSessionSnapshot(entry) ? cloneSnapshotEntry(entry) : null;
}

function atomicWriteJson(persistPath: string, value: WorldSessionSnapshotStoreFile): void {
    mkdirSync(dirname(persistPath), { recursive: true });
    writeFileAtomically(persistPath, JSON.stringify(value, null, 2), { backupPath: backupPath(persistPath) });
}

function backupPath(persistPath: string): string {
    return `${persistPath}.bak`;
}
