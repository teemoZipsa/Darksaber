import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { STORY_QUESTS } from '../src/data/StoryQuestData';
import { writeFileAtomically } from './AtomicFile';

export interface ServerAccountRecord {
    accountId: string;
    secretHash: string;
    completedQuestIds: string[];
    currentHubTownId: string;
    createdAt: number;
    updatedAt: number;
}

export interface ServerAccountStoreOptions {
    persistPath?: string | null;
    now?: () => number;
}

export interface AccountAuthResult {
    accepted: boolean;
    account?: ServerAccountRecord;
    created?: boolean;
    reason?: string;
}

interface AccountDbFile {
    version: 1;
    accounts: ServerAccountRecord[];
}

const ACCOUNT_ID_RE = /^[a-zA-Z0-9_-]{12,80}$/;
const MIN_SECRET_LENGTH = 24;
const SAVE_DELAY_MS = 250;
const QUEST_IDS = new Set(STORY_QUESTS.map((quest) => quest.id));

export class ServerAccountStore {
    private readonly persistPath: string | null;
    private readonly now: () => number;
    private readonly accounts = new Map<string, ServerAccountRecord>();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: ServerAccountStoreOptions = {}) {
        this.persistPath = options.persistPath ?? null;
        this.now = options.now ?? Date.now;
        this.load();
    }

    public authenticate(accountId: unknown, accountSecret: unknown): AccountAuthResult {
        if (typeof accountId !== 'string' || !ACCOUNT_ID_RE.test(accountId)) {
            return { accepted: false, reason: 'Invalid account id.' };
        }
        if (typeof accountSecret !== 'string' || accountSecret.length < MIN_SECRET_LENGTH) {
            return { accepted: false, reason: 'Invalid account secret.' };
        }

        const existing = this.accounts.get(accountId);
        const secretHash = hashSecret(accountSecret);
        if (existing) {
            if (!safeHashEquals(existing.secretHash, secretHash)) {
                return { accepted: false, reason: 'Account secret does not match.' };
            }
            return { accepted: true, account: cloneAccount(existing), created: false };
        }

        const now = this.now();
        const account: ServerAccountRecord = {
            accountId,
            secretHash,
            completedQuestIds: [],
            currentHubTownId: 'central_castle',
            createdAt: now,
            updatedAt: now,
        };
        this.accounts.set(accountId, account);
        this.scheduleSave();
        return { accepted: true, account: cloneAccount(account), created: true };
    }

    public getAccount(accountId: string): ServerAccountRecord | null {
        const account = this.accounts.get(accountId);
        return account ? cloneAccount(account) : null;
    }

    public recordRaidSurvival(accountId: string, completedQuestIds: readonly string[], currentHubTownId: string): ServerAccountRecord | null {
        const account = this.accounts.get(accountId);
        if (!account) return null;
        const requestedQuestIds = new Set(completedQuestIds.filter((questId) => QUEST_IDS.has(questId)));
        const nextCompleted = new Set(account.completedQuestIds.filter((questId) => QUEST_IDS.has(questId)));
        for (const quest of STORY_QUESTS) {
            if (nextCompleted.has(quest.id) || !requestedQuestIds.has(quest.id)) continue;
            if (quest.prerequisiteQuestId && !nextCompleted.has(quest.prerequisiteQuestId)) continue;
            nextCompleted.add(quest.id);
        }
        account.completedQuestIds = [...nextCompleted];
        account.currentHubTownId = currentHubTownId;
        account.updatedAt = this.now();
        this.scheduleSave();
        return cloneAccount(account);
    }

    public flushSave(): void {
        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        this.saveNow();
    }

    private load(): void {
        if (!this.persistPath || !existsSync(this.persistPath)) return;
        const parsed = readAccountDbFile(this.persistPath);
        if (!parsed || !Array.isArray(parsed.accounts)) return;
        for (const raw of parsed.accounts) {
            const account = normalizeAccountRecord(raw);
            if (account) this.accounts.set(account.accountId, account);
        }
    }

    private scheduleSave(): void {
        if (!this.persistPath || this.saveTimer !== null) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.saveNow();
        }, SAVE_DELAY_MS);
    }

    private saveNow(): void {
        if (!this.persistPath) return;
        mkdirSync(dirname(this.persistPath), { recursive: true });
        const payload: AccountDbFile = {
            version: 1,
            accounts: [...this.accounts.values()].map(cloneAccount),
        };
        writeFileAtomically(this.persistPath, JSON.stringify(payload, null, 2), { backupPath: backupPath(this.persistPath) });
    }
}

export function createAccountSecret(): string {
    return randomBytes(32).toString('base64url');
}

function hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function safeHashEquals(a: string, b: string): boolean {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
}

function normalizeAccountRecord(value: unknown): ServerAccountRecord | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<ServerAccountRecord>;
    if (typeof record.accountId !== 'string' || !ACCOUNT_ID_RE.test(record.accountId)) return null;
    if (typeof record.secretHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.secretHash)) return null;
    return {
        accountId: record.accountId,
        secretHash: record.secretHash,
        completedQuestIds: normalizeQuestIds(record.completedQuestIds),
        currentHubTownId: typeof record.currentHubTownId === 'string' ? record.currentHubTownId : 'central_castle',
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt),
    };
}

function normalizeQuestIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && QUEST_IDS.has(entry)))];
}

function normalizeTimestamp(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : Date.now();
}

function cloneAccount(account: ServerAccountRecord): ServerAccountRecord {
    return {
        ...account,
        completedQuestIds: [...account.completedQuestIds],
    };
}

function readAccountDbFile(persistPath: string): Partial<AccountDbFile> | null {
    return readJsonFile(persistPath) ?? readJsonFile(backupPath(persistPath));
}

function readJsonFile(path: string): Partial<AccountDbFile> | null {
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as Partial<AccountDbFile>;
    } catch {
        return null;
    }
}

function backupPath(persistPath: string): string {
    return `${persistPath}.bak`;
}
