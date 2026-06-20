import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileAtomically } from './AtomicFile';
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

export class WorldSessionSnapshotStore {
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

    public list(): PendingWorldSessionSnapshot[] {
        return [...this.entries.values()].map(cloneSnapshotEntry);
    }

    public upsert(input: Omit<PendingWorldSessionSnapshot, 'updatedAt'> & { updatedAt?: string }): void {
        this.entries.set(input.sessionKey, cloneSnapshotEntry({
            ...input,
            updatedAt: input.updatedAt ?? this.now().toISOString(),
        }));
        this.flush();
    }

    public remove(sessionKey: string): void {
        if (!this.entries.delete(sessionKey)) return;
        this.flush();
    }

    public clear(): void {
        if (this.entries.size === 0) return;
        this.entries.clear();
        this.flush();
    }

    private flush(): void {
        const file: WorldSessionSnapshotStoreFile = {
            version: 1,
            entries: this.list(),
        };
        atomicWriteJson(this.persistPath, file);
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

function atomicWriteJson(persistPath: string, value: WorldSessionSnapshotStoreFile): void {
    mkdirSync(dirname(persistPath), { recursive: true });
    writeFileAtomically(persistPath, JSON.stringify(value, null, 2), { backupPath: backupPath(persistPath) });
}

function backupPath(persistPath: string): string {
    return `${persistPath}.bak`;
}
