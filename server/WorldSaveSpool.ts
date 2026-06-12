import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuthStore } from './AuthStore';
import type { WorldCharacterSavePatch } from './WorldSession';
import { writeFileAtomically } from './AtomicFile';

export interface PendingWorldSave {
    key: string;
    sessionKey: string;
    playerId: string;
    accountId: string;
    characterId: string;
    expectedRevision: number;
    patch: WorldCharacterSavePatch;
    reason: string;
    updatedAt: string;
}

export interface WorldSaveSpoolOptions {
    persistPath: string;
    now?: () => Date;
}

interface WorldSaveSpoolFile {
    version: 1;
    entries: PendingWorldSave[];
}

export class WorldSaveSpool {
    private readonly persistPath: string;
    private readonly now: () => Date;
    private entries = new Map<string, PendingWorldSave>();

    public constructor(options: WorldSaveSpoolOptions) {
        this.persistPath = options.persistPath;
        this.now = options.now ?? (() => new Date());
        for (const entry of readSpoolFile(this.persistPath)?.entries ?? []) {
            this.entries.set(entry.key, clonePendingSave(entry));
        }
    }

    public list(): PendingWorldSave[] {
        return [...this.entries.values()].map(clonePendingSave);
    }

    public upsert(input: Omit<PendingWorldSave, 'updatedAt'> & { updatedAt?: string }): void {
        this.entries.set(input.key, clonePendingSave({
            ...input,
            updatedAt: input.updatedAt ?? this.now().toISOString(),
        }));
        this.flush();
    }

    public remove(key: string): void {
        if (!this.entries.delete(key)) return;
        this.flush();
    }

    public clear(): void {
        if (this.entries.size === 0) return;
        this.entries.clear();
        this.flush();
    }

    private flush(): void {
        const file: WorldSaveSpoolFile = {
            version: 1,
            entries: this.list(),
        };
        atomicWriteJson(this.persistPath, file);
    }
}

export interface ReplayWorldSaveSpoolOptions {
    retryLimit?: number;
    retryBaseMs?: number;
    logger?: (message: string) => void;
}

export async function replayWorldSaveSpool(
    authStore: AuthStore,
    spool: WorldSaveSpool,
    options: ReplayWorldSaveSpoolOptions = {}
): Promise<{ applied: number; failed: number }> {
    let applied = 0;
    let failed = 0;
    for (const entry of spool.list()) {
        try {
            await applyPendingWorldSave(authStore, entry, options);
            spool.remove(entry.key);
            applied++;
        } catch (error) {
            failed++;
            options.logger?.(`Failed to replay pending world save ${entry.key}: ${error instanceof Error ? error.message : error}`);
        }
    }
    return { applied, failed };
}

async function applyPendingWorldSave(
    authStore: AuthStore,
    entry: PendingWorldSave,
    options: ReplayWorldSaveSpoolOptions
): Promise<void> {
    let expectedRevision = entry.expectedRevision;
    const retryLimit = Math.max(1, Math.floor(options.retryLimit ?? 3));
    const retryBaseMs = Math.max(0, Math.floor(options.retryBaseMs ?? 0));
    for (let attempt = 0; attempt < retryLimit; attempt++) {
        const result = await authStore.updateCharacterSave(entry.accountId, entry.characterId, {
            expectedRevision,
            patch: entry.patch,
        });
        if (result.status === 'updated') return;
        if (result.status === 'conflict') {
            expectedRevision = result.currentRevision;
        } else {
            throw new Error('character save was not found');
        }
        if (attempt < retryLimit - 1 && retryBaseMs > 0) await sleep(retryBaseMs * (attempt + 1));
    }
    throw new Error('pending world save retry limit exhausted');
}

function readSpoolFile(persistPath: string): WorldSaveSpoolFile | null {
    return readJsonFile(persistPath) ?? readJsonFile(backupPath(persistPath));
}

function readJsonFile(path: string): WorldSaveSpoolFile | null {
    if (!existsSync(path)) return null;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorldSaveSpoolFile>;
        if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
        return {
            version: 1,
            entries: parsed.entries
                .filter(isPendingWorldSave)
                .map(clonePendingSave),
        };
    } catch {
        return null;
    }
}

function isPendingWorldSave(value: unknown): value is PendingWorldSave {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<PendingWorldSave>;
    return typeof entry.key === 'string'
        && typeof entry.sessionKey === 'string'
        && typeof entry.playerId === 'string'
        && typeof entry.accountId === 'string'
        && typeof entry.characterId === 'string'
        && Number.isInteger(entry.expectedRevision)
        && typeof entry.reason === 'string'
        && typeof entry.updatedAt === 'string'
        && Boolean(entry.patch)
        && typeof entry.patch === 'object';
}

function clonePendingSave(entry: PendingWorldSave): PendingWorldSave {
    return JSON.parse(JSON.stringify(entry)) as PendingWorldSave;
}

function atomicWriteJson(persistPath: string, value: WorldSaveSpoolFile): void {
    mkdirSync(dirname(persistPath), { recursive: true });
    writeFileAtomically(persistPath, JSON.stringify(value, null, 2), { backupPath: backupPath(persistPath) });
}

function backupPath(persistPath: string): string {
    return `${persistPath}.bak`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
