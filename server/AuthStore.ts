import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { CHAR_CLASSES, type StartingClassId } from '../src/data/characterClasses';
import { getClassLine } from '../src/data/ClassTree';
import { ITEMS } from '../src/data/ItemDB';
import { getStarterBodyArmorId, STARTER_CONSUMABLE_ITEM_IDS, STARTER_WEAPON_ITEM_ID } from '../src/data/StarterKitData';
import { createBaseStats, getBaseStatsForClass, type CharacterStats } from '../src/data/Stats';
import type { CharacterSave, CharacterSavePatch, InventorySaveItem, InventorySaveSnapshot } from '../src/shared/CharacterSave';
export type { CharacterSave, CharacterSavePatch, InventorySaveItem, InventorySaveSnapshot } from '../src/shared/CharacterSave';

export const CURRENT_SAVE_VERSION = 1;
export const MAX_CHARACTER_SLOTS = 3;

export interface AuthAccount {
    id: string;
    loginName: string;
    loginNameNormalized: string;
    passwordHash: string;
    lastSelectedCharacterId: string | null;
    createdAt: string;
    updatedAt: string;
    disabledAt: string | null;
}

export interface AuthSession {
    id: string;
    accountId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string;
    revokedAt: string | null;
    replacedBySessionId: string | null;
    userAgent: string | null;
    ipHash: string | null;
}

export interface AuthCharacter {
    id: string;
    accountId: string;
    slotNo: number;
    name: string;
    classKey: StartingClassId;
    tier: number;
    level: number;
    exp: number;
    baseStats: CharacterStats;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

export interface AccountProgress {
    accountId: string;
    completedQuests: string[];
    unlocks: Record<string, unknown>;
    flags: Record<string, unknown>;
    updatedAt: string;
}

export interface NewAccountInput {
    loginName: string;
    loginNameNormalized: string;
    passwordHash: string;
}

export interface NewSessionInput {
    accountId: string;
    refreshTokenHash: string;
    tokenFamilyId: string;
    expiresAt: string;
    userAgent: string | null;
    ipHash: string | null;
}

export interface NewCharacterInput {
    name: string;
    classKey: StartingClassId;
    gender?: string;
}

export interface SaveUpdateInput {
    expectedRevision: number;
    patch: CharacterSavePatch;
}

export type SaveUpdateResult =
    | { status: 'updated'; save: CharacterSave }
    | { status: 'conflict'; currentRevision: number }
    | { status: 'not_found' };

export interface AuthStore {
    initialize(): Promise<void>;
    createAccount(input: NewAccountInput): Promise<AuthAccount>;
    findAccountByLoginNameNormalized(loginNameNormalized: string): Promise<AuthAccount | null>;
    getAccount(accountId: string): Promise<AuthAccount | null>;
    createSession(input: NewSessionInput): Promise<AuthSession>;
    getSession(sessionId: string): Promise<AuthSession | null>;
    findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null>;
    rotateSession(sessionId: string, input: NewSessionInput): Promise<AuthSession | null>;
    revokeSession(sessionId: string, revokedAt: string): Promise<void>;
    revokeAllSessions(accountId: string, revokedAt: string): Promise<void>;
    revokeTokenFamily(tokenFamilyId: string, revokedAt: string): Promise<void>;
    listCharacters(accountId: string): Promise<AuthCharacter[]>;
    createCharacter(accountId: string, input: NewCharacterInput): Promise<{ character: AuthCharacter; save: CharacterSave }>;
    getCharacter(accountId: string, characterId: string): Promise<AuthCharacter | null>;
    deleteCharacter(accountId: string, characterId: string): Promise<boolean>;
    selectCharacter(accountId: string, characterId: string): Promise<{ account: AuthAccount; character: AuthCharacter; save: CharacterSave } | null>;
    getCharacterSave(accountId: string, characterId: string): Promise<CharacterSave | null>;
    updateCharacterSave(accountId: string, characterId: string, input: SaveUpdateInput): Promise<SaveUpdateResult>;
    getAccountProgress(accountId: string): Promise<AccountProgress>;
    recordRaidSurvival(accountId: string, characterId: string, completedQuestIds: readonly string[], currentHubTownId: string): Promise<void>;
}

export class AuthStoreConflict extends Error {
    public constructor(public readonly code: 'login_name' | 'character_slot' | 'character_name') {
        super(`Auth store conflict: ${code}`);
    }
}

export function normalizeLoginName(loginName: string): string {
    return loginName.trim().toLocaleLowerCase('en-US');
}

export function isStartingClassKey(value: unknown): value is StartingClassId {
    return typeof value === 'string' && CHAR_CLASSES.some((entry) => entry.id === value);
}

export function createDefaultCharacterSave(character: AuthCharacter, gender: string = 'M', now: string = new Date().toISOString()): CharacterSave {
    return {
        characterId: character.id,
        saveVersion: CURRENT_SAVE_VERSION,
        revision: 1,
        hubLocation: {
            realm: 'mortal',
            townId: 'central_castle',
        },
        questState: {
            completedQuestIds: [],
        },
        inventory: {
            width: 10,
            height: 6,
            items: createStarterInventoryItems(),
        },
        equipment: createStarterEquipment(character.classKey),
        partySnapshot: {
            activeCharacterIds: [character.id],
        },
        rosterSnapshot: {
            characters: [{
                id: character.id,
                name: character.name,
                classKey: character.classKey,
                gender,
                tier: character.tier,
                level: character.level,
                exp: character.exp,
                baseStats: character.baseStats,
            }],
        },
        updatedAt: now,
    };
}

export function migrateCharacterSave(save: CharacterSave): CharacterSave {
    if (save.saveVersion >= CURRENT_SAVE_VERSION) return save;
    return {
        ...save,
        saveVersion: CURRENT_SAVE_VERSION,
        inventory: normalizeInventorySnapshot(save.inventory),
    };
}

export class InMemoryAuthStore implements AuthStore {
    private readonly accounts = new Map<string, AuthAccount>();
    private readonly accountsByLogin = new Map<string, string>();
    private readonly sessions = new Map<string, AuthSession>();
    private readonly characters = new Map<string, AuthCharacter>();
    private readonly saves = new Map<string, CharacterSave>();
    private readonly progress = new Map<string, AccountProgress>();

    public async initialize(): Promise<void> {
        return Promise.resolve();
    }

    public async createAccount(input: NewAccountInput): Promise<AuthAccount> {
        if (this.accountsByLogin.has(input.loginNameNormalized)) throw new AuthStoreConflict('login_name');
        const now = new Date().toISOString();
        const account: AuthAccount = {
            id: randomUUID(),
            loginName: input.loginName,
            loginNameNormalized: input.loginNameNormalized,
            passwordHash: input.passwordHash,
            lastSelectedCharacterId: null,
            createdAt: now,
            updatedAt: now,
            disabledAt: null,
        };
        this.accounts.set(account.id, account);
        this.accountsByLogin.set(account.loginNameNormalized, account.id);
        this.progress.set(account.id, createDefaultAccountProgress(account.id, now));
        return account;
    }

    public async findAccountByLoginNameNormalized(loginNameNormalized: string): Promise<AuthAccount | null> {
        const id = this.accountsByLogin.get(loginNameNormalized);
        return id ? clone(this.accounts.get(id) ?? null) : null;
    }

    public async getAccount(accountId: string): Promise<AuthAccount | null> {
        return clone(this.accounts.get(accountId) ?? null);
    }

    public async createSession(input: NewSessionInput): Promise<AuthSession> {
        const session = createSessionRecord(input);
        this.sessions.set(session.id, session);
        return clone(session);
    }

    public async getSession(sessionId: string): Promise<AuthSession | null> {
        return clone(this.sessions.get(sessionId) ?? null);
    }

    public async findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
        for (const session of this.sessions.values()) {
            if (session.refreshTokenHash === refreshTokenHash) return clone(session);
        }
        return null;
    }

    public async rotateSession(sessionId: string, input: NewSessionInput): Promise<AuthSession | null> {
        const previous = this.sessions.get(sessionId);
        if (!previous) return null;
        const next = createSessionRecord(input);
        previous.revokedAt = next.createdAt;
        previous.lastUsedAt = next.createdAt;
        previous.replacedBySessionId = next.id;
        this.sessions.set(next.id, next);
        return clone(next);
    }

    public async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session && !session.revokedAt) session.revokedAt = revokedAt;
    }

    public async revokeAllSessions(accountId: string, revokedAt: string): Promise<void> {
        for (const session of this.sessions.values()) {
            if (session.accountId === accountId && !session.revokedAt) session.revokedAt = revokedAt;
        }
    }

    public async revokeTokenFamily(tokenFamilyId: string, revokedAt: string): Promise<void> {
        for (const session of this.sessions.values()) {
            if (session.tokenFamilyId === tokenFamilyId && !session.revokedAt) session.revokedAt = revokedAt;
        }
    }

    public async listCharacters(accountId: string): Promise<AuthCharacter[]> {
        return [...this.characters.values()]
            .filter((character) => character.accountId === accountId && !character.deletedAt)
            .sort((a, b) => a.slotNo - b.slotNo)
            .map((character) => clone(character));
    }

    public async createCharacter(accountId: string, input: NewCharacterInput): Promise<{ character: AuthCharacter; save: CharacterSave }> {
        const characters = [...this.characters.values()].filter((character) => character.accountId === accountId);
        if (characters.some((character) => normalizeCharacterName(character.name) === normalizeCharacterName(input.name))) {
            throw new AuthStoreConflict('character_name');
        }
        const slotNo = firstOpenSlot(characters);
        if (slotNo === null) throw new AuthStoreConflict('character_slot');
        const now = new Date().toISOString();
        const character = createCharacterRecord(accountId, slotNo, input, now);
        const save = createDefaultCharacterSave(character, input.gender, now);
        this.characters.set(character.id, character);
        this.saves.set(character.id, save);
        return { character: clone(character), save: clone(save) };
    }

    public async getCharacter(accountId: string, characterId: string): Promise<AuthCharacter | null> {
        const character = this.characters.get(characterId);
        if (!character || character.accountId !== accountId || character.deletedAt) return null;
        return clone(character);
    }

    public async deleteCharacter(accountId: string, characterId: string): Promise<boolean> {
        const character = this.characters.get(characterId);
        if (!character || character.accountId !== accountId || character.deletedAt) return false;
        const now = new Date().toISOString();
        character.deletedAt = now;
        character.updatedAt = now;
        const account = this.accounts.get(accountId);
        if (account?.lastSelectedCharacterId === characterId) {
            account.lastSelectedCharacterId = null;
            account.updatedAt = now;
        }
        return true;
    }

    public async selectCharacter(accountId: string, characterId: string): Promise<{ account: AuthAccount; character: AuthCharacter; save: CharacterSave } | null> {
        const character = await this.getCharacter(accountId, characterId);
        const save = await this.getCharacterSave(accountId, characterId);
        const account = this.accounts.get(accountId);
        if (!character || !save || !account) return null;
        account.lastSelectedCharacterId = characterId;
        account.updatedAt = new Date().toISOString();
        return { account: clone(account), character, save };
    }

    public async getCharacterSave(accountId: string, characterId: string): Promise<CharacterSave | null> {
        const character = await this.getCharacter(accountId, characterId);
        if (!character) return null;
        const save = this.saves.get(characterId);
        return save ? clone(migrateCharacterSave(save)) : null;
    }

    public async updateCharacterSave(accountId: string, characterId: string, input: SaveUpdateInput): Promise<SaveUpdateResult> {
        const character = await this.getCharacter(accountId, characterId);
        const current = this.saves.get(characterId);
        if (!character || !current) return { status: 'not_found' };
        if (current.revision !== input.expectedRevision) return { status: 'conflict', currentRevision: current.revision };
        const updated: CharacterSave = {
            ...current,
            ...input.patch,
            characterId,
            revision: current.revision + 1,
            updatedAt: new Date().toISOString(),
            inventory: input.patch.inventory ? normalizeInventorySnapshot(input.patch.inventory) : current.inventory,
        };
        this.saves.set(characterId, updated);
        return { status: 'updated', save: clone(updated) };
    }

    public async getAccountProgress(accountId: string): Promise<AccountProgress> {
        let progress = this.progress.get(accountId);
        if (!progress) {
            progress = createDefaultAccountProgress(accountId);
            this.progress.set(accountId, progress);
        }
        return clone(progress);
    }

    public async recordRaidSurvival(accountId: string, characterId: string, completedQuestIds: readonly string[], currentHubTownId: string): Promise<void> {
        const character = await this.getCharacter(accountId, characterId);
        const save = this.saves.get(characterId);
        if (!character || !save) return;
        const now = new Date().toISOString();
        const progress = await this.getAccountProgress(accountId);
        const mergedQuestIds = uniqueStrings([...progress.completedQuests, ...completedQuestIds]);
        this.progress.set(accountId, {
            ...progress,
            completedQuests: mergedQuestIds,
            updatedAt: now,
        });
        this.saves.set(characterId, {
            ...save,
            hubLocation: { ...save.hubLocation, townId: currentHubTownId },
            questState: { ...save.questState, completedQuestIds: mergedQuestIds },
            revision: save.revision + 1,
            updatedAt: now,
        });
    }
}

export class PostgresAuthStore implements AuthStore {
    private readonly pool: Pool;

    public constructor(connectionString: string) {
        this.pool = new Pool({ connectionString });
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }

    public async initialize(): Promise<void> {
        await this.pool.query(`
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
                deleted_at timestamptz NULL,
                UNIQUE(account_id, slot_no),
                UNIQUE(account_id, name)
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
        `);
    }

    public async createAccount(input: NewAccountInput): Promise<AuthAccount> {
        const now = new Date().toISOString();
        const account: AuthAccount = {
            id: randomUUID(),
            loginName: input.loginName,
            loginNameNormalized: input.loginNameNormalized,
            passwordHash: input.passwordHash,
            lastSelectedCharacterId: null,
            createdAt: now,
            updatedAt: now,
            disabledAt: null,
        };
        try {
            await this.pool.query(
                `INSERT INTO accounts (id, login_name, login_name_normalized, password_hash, last_selected_character_id, created_at, updated_at, disabled_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [account.id, account.loginName, account.loginNameNormalized, account.passwordHash, null, now, now, null]
            );
            await this.getAccountProgress(account.id);
            return account;
        } catch (error) {
            if (isUniqueViolation(error)) throw new AuthStoreConflict('login_name');
            throw error;
        }
    }

    public async findAccountByLoginNameNormalized(loginNameNormalized: string): Promise<AuthAccount | null> {
        const result = await this.pool.query('SELECT * FROM accounts WHERE login_name_normalized = $1', [loginNameNormalized]);
        return result.rows[0] ? accountFromRow(result.rows[0]) : null;
    }

    public async getAccount(accountId: string): Promise<AuthAccount | null> {
        const result = await this.pool.query('SELECT * FROM accounts WHERE id = $1', [accountId]);
        return result.rows[0] ? accountFromRow(result.rows[0]) : null;
    }

    public async createSession(input: NewSessionInput): Promise<AuthSession> {
        const session = createSessionRecord(input);
        await this.pool.query(
            `INSERT INTO account_sessions (id, account_id, refresh_token_hash, token_family_id, created_at, expires_at, last_used_at, revoked_at, replaced_by_session_id, user_agent, ip_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                session.id,
                session.accountId,
                session.refreshTokenHash,
                session.tokenFamilyId,
                session.createdAt,
                session.expiresAt,
                session.lastUsedAt,
                session.revokedAt,
                session.replacedBySessionId,
                session.userAgent,
                session.ipHash,
            ]
        );
        return session;
    }

    public async getSession(sessionId: string): Promise<AuthSession | null> {
        const result = await this.pool.query('SELECT * FROM account_sessions WHERE id = $1', [sessionId]);
        return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
    }

    public async findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
        const result = await this.pool.query('SELECT * FROM account_sessions WHERE refresh_token_hash = $1', [refreshTokenHash]);
        return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
    }

    public async rotateSession(sessionId: string, input: NewSessionInput): Promise<AuthSession | null> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const previousResult = await client.query('SELECT * FROM account_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
            if (!previousResult.rows[0]) {
                await client.query('ROLLBACK');
                return null;
            }
            const next = createSessionRecord(input);
            await client.query(
                `INSERT INTO account_sessions (id, account_id, refresh_token_hash, token_family_id, created_at, expires_at, last_used_at, revoked_at, replaced_by_session_id, user_agent, ip_hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9)`,
                [next.id, next.accountId, next.refreshTokenHash, next.tokenFamilyId, next.createdAt, next.expiresAt, next.lastUsedAt, next.userAgent, next.ipHash]
            );
            await client.query(
                `UPDATE account_sessions
                 SET revoked_at = COALESCE(revoked_at, $1), last_used_at = $1, replaced_by_session_id = $2
                 WHERE id = $3`,
                [next.createdAt, next.id, sessionId]
            );
            await client.query('COMMIT');
            return next;
        } catch (error) {
            await safeRollback(client);
            throw error;
        } finally {
            client.release();
        }
    }

    public async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
        await this.pool.query(
            'UPDATE account_sessions SET revoked_at = COALESCE(revoked_at, $1), last_used_at = $1 WHERE id = $2',
            [revokedAt, sessionId]
        );
    }

    public async revokeAllSessions(accountId: string, revokedAt: string): Promise<void> {
        await this.pool.query(
            'UPDATE account_sessions SET revoked_at = COALESCE(revoked_at, $1), last_used_at = $1 WHERE account_id = $2',
            [revokedAt, accountId]
        );
    }

    public async revokeTokenFamily(tokenFamilyId: string, revokedAt: string): Promise<void> {
        await this.pool.query(
            'UPDATE account_sessions SET revoked_at = COALESCE(revoked_at, $1), last_used_at = $1 WHERE token_family_id = $2',
            [revokedAt, tokenFamilyId]
        );
    }

    public async listCharacters(accountId: string): Promise<AuthCharacter[]> {
        const result = await this.pool.query(
            'SELECT * FROM characters WHERE account_id = $1 AND deleted_at IS NULL ORDER BY slot_no ASC',
            [accountId]
        );
        return result.rows.map(characterFromRow);
    }

    public async createCharacter(accountId: string, input: NewCharacterInput): Promise<{ character: AuthCharacter; save: CharacterSave }> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query(
                'SELECT slot_no, name FROM characters WHERE account_id = $1 FOR UPDATE',
                [accountId]
            );
            const rows = existing.rows as Array<{ slot_no: number; name: string }>;
            if (rows.some((row) => normalizeCharacterName(row.name) === normalizeCharacterName(input.name))) {
                await client.query('ROLLBACK');
                throw new AuthStoreConflict('character_name');
            }
            const slotNo = firstOpenSlot(rows.map((row) => ({ slotNo: row.slot_no })));
            if (slotNo === null) {
                await client.query('ROLLBACK');
                throw new AuthStoreConflict('character_slot');
            }
            const now = new Date().toISOString();
            const character = createCharacterRecord(accountId, slotNo, input, now);
            const save = createDefaultCharacterSave(character, input.gender, now);
            await client.query(
                `INSERT INTO characters (id, account_id, slot_no, name, class_key, tier, level, exp, base_stats, created_at, updated_at, deleted_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, NULL)`,
                [
                    character.id,
                    character.accountId,
                    character.slotNo,
                    character.name,
                    character.classKey,
                    character.tier,
                    character.level,
                    character.exp,
                    JSON.stringify(character.baseStats),
                    now,
                    now,
                ]
            );
            await insertSave(client, save);
            await client.query('COMMIT');
            return { character, save };
        } catch (error) {
            await safeRollback(client);
            if (isUniqueViolation(error)) throw new AuthStoreConflict('character_name');
            throw error;
        } finally {
            client.release();
        }
    }

    public async getCharacter(accountId: string, characterId: string): Promise<AuthCharacter | null> {
        const result = await this.pool.query(
            'SELECT * FROM characters WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL',
            [characterId, accountId]
        );
        return result.rows[0] ? characterFromRow(result.rows[0]) : null;
    }

    public async deleteCharacter(accountId: string, characterId: string): Promise<boolean> {
        const now = new Date().toISOString();
        const result = await this.pool.query(
            `UPDATE characters
             SET deleted_at = $1, updated_at = $1
             WHERE id = $2 AND account_id = $3 AND deleted_at IS NULL`,
            [now, characterId, accountId]
        );
        if (result.rowCount === 0) return false;
        await this.pool.query(
            `UPDATE accounts
             SET last_selected_character_id = NULL, updated_at = $1
             WHERE id = $2 AND last_selected_character_id = $3`,
            [now, accountId, characterId]
        );
        return true;
    }

    public async selectCharacter(accountId: string, characterId: string): Promise<{ account: AuthAccount; character: AuthCharacter; save: CharacterSave } | null> {
        const character = await this.getCharacter(accountId, characterId);
        const save = await this.getCharacterSave(accountId, characterId);
        if (!character || !save) return null;
        const now = new Date().toISOString();
        await this.pool.query(
            'UPDATE accounts SET last_selected_character_id = $1, updated_at = $2 WHERE id = $3',
            [characterId, now, accountId]
        );
        const account = await this.getAccount(accountId);
        return account ? { account, character, save } : null;
    }

    public async getCharacterSave(accountId: string, characterId: string): Promise<CharacterSave | null> {
        const result = await this.pool.query(
            `SELECT s.*
             FROM character_saves s
             JOIN characters c ON c.id = s.character_id
             WHERE s.character_id = $1 AND c.account_id = $2 AND c.deleted_at IS NULL`,
            [characterId, accountId]
        );
        return result.rows[0] ? migrateCharacterSave(saveFromRow(result.rows[0])) : null;
    }

    public async updateCharacterSave(accountId: string, characterId: string, input: SaveUpdateInput): Promise<SaveUpdateResult> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const currentResult = await client.query(
                `SELECT s.*
                 FROM character_saves s
                 JOIN characters c ON c.id = s.character_id
                 WHERE s.character_id = $1 AND c.account_id = $2 AND c.deleted_at IS NULL
                 FOR UPDATE`,
                [characterId, accountId]
            );
            if (!currentResult.rows[0]) {
                await client.query('ROLLBACK');
                return { status: 'not_found' };
            }
            const current = saveFromRow(currentResult.rows[0]);
            if (current.revision !== input.expectedRevision) {
                await client.query('ROLLBACK');
                return { status: 'conflict', currentRevision: current.revision };
            }
            const updated: CharacterSave = {
                ...current,
                ...input.patch,
                characterId,
                revision: current.revision + 1,
                updatedAt: new Date().toISOString(),
                inventory: input.patch.inventory ? normalizeInventorySnapshot(input.patch.inventory) : current.inventory,
            };
            await client.query(
                `UPDATE character_saves
                 SET save_version = $1,
                     revision = $2,
                     hub_location = $3::jsonb,
                     quest_state = $4::jsonb,
                     inventory = $5::jsonb,
                     equipment = $6::jsonb,
                     party_snapshot = $7::jsonb,
                     roster_snapshot = $8::jsonb,
                     updated_at = $9
                 WHERE character_id = $10`,
                [
                    updated.saveVersion,
                    updated.revision,
                    JSON.stringify(updated.hubLocation),
                    JSON.stringify(updated.questState),
                    JSON.stringify(updated.inventory),
                    JSON.stringify(updated.equipment),
                    JSON.stringify(updated.partySnapshot),
                    JSON.stringify(updated.rosterSnapshot),
                    updated.updatedAt,
                    characterId,
                ]
            );
            await client.query('COMMIT');
            return { status: 'updated', save: updated };
        } catch (error) {
            await safeRollback(client);
            throw error;
        } finally {
            client.release();
        }
    }

    public async getAccountProgress(accountId: string): Promise<AccountProgress> {
        const now = new Date().toISOString();
        await this.pool.query(
            `INSERT INTO account_progress (account_id, completed_quests, unlocks, flags, updated_at)
             VALUES ($1, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, $2)
             ON CONFLICT (account_id) DO NOTHING`,
            [accountId, now]
        );
        const result = await this.pool.query('SELECT * FROM account_progress WHERE account_id = $1', [accountId]);
        return progressFromRow(result.rows[0]);
    }

    public async recordRaidSurvival(accountId: string, characterId: string, completedQuestIds: readonly string[], currentHubTownId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const progressResult = await client.query('SELECT * FROM account_progress WHERE account_id = $1 FOR UPDATE', [accountId]);
            const currentProgress = progressResult.rows[0]
                ? progressFromRow(progressResult.rows[0])
                : createDefaultAccountProgress(accountId);
            const mergedQuestIds = uniqueStrings([...currentProgress.completedQuests, ...completedQuestIds]);
            const now = new Date().toISOString();
            await client.query(
                `INSERT INTO account_progress (account_id, completed_quests, unlocks, flags, updated_at)
                 VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
                 ON CONFLICT (account_id) DO UPDATE
                 SET completed_quests = EXCLUDED.completed_quests,
                     unlocks = EXCLUDED.unlocks,
                     flags = EXCLUDED.flags,
                     updated_at = EXCLUDED.updated_at`,
                [
                    accountId,
                    JSON.stringify(mergedQuestIds),
                    JSON.stringify(currentProgress.unlocks),
                    JSON.stringify(currentProgress.flags),
                    now,
                ]
            );
            await client.query(
                `UPDATE character_saves s
                 SET hub_location = jsonb_set(s.hub_location, '{townId}', to_jsonb($1::text), true),
                     quest_state = jsonb_set(s.quest_state, '{completedQuestIds}', $2::jsonb, true),
                     revision = s.revision + 1,
                     updated_at = $3
                 FROM characters c
                 WHERE s.character_id = c.id AND c.id = $4 AND c.account_id = $5 AND c.deleted_at IS NULL`,
                [currentHubTownId, JSON.stringify(mergedQuestIds), now, characterId, accountId]
            );
            await client.query('COMMIT');
        } catch (error) {
            await safeRollback(client);
            throw error;
        } finally {
            client.release();
        }
    }
}

function createSessionRecord(input: NewSessionInput): AuthSession {
    const now = new Date().toISOString();
    return {
        id: randomUUID(),
        accountId: input.accountId,
        refreshTokenHash: input.refreshTokenHash,
        tokenFamilyId: input.tokenFamilyId,
        createdAt: now,
        expiresAt: input.expiresAt,
        lastUsedAt: now,
        revokedAt: null,
        replacedBySessionId: null,
        userAgent: input.userAgent,
        ipHash: input.ipHash,
    };
}

function createCharacterRecord(accountId: string, slotNo: number, input: NewCharacterInput, now: string): AuthCharacter {
    const classLine = getClassLine(input.classKey);
    const tier = classLine?.tiers[0]?.tier ?? 1;
    const baseMov = classLine?.baseMovRange ?? 3;
    const baseStats = createBaseStats(getBaseStatsForClass(input.classKey, baseMov));
    return {
        id: randomUUID(),
        accountId,
        slotNo,
        name: input.name.trim(),
        classKey: input.classKey,
        tier,
        level: 1,
        exp: 0,
        baseStats,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

function createDefaultAccountProgress(accountId: string, now: string = new Date().toISOString()): AccountProgress {
    return {
        accountId,
        completedQuests: [],
        unlocks: {},
        flags: {},
        updatedAt: now,
    };
}

function createStarterInventoryItems(): InventorySaveItem[] {
    const occupied: boolean[][] = Array.from({ length: 6 }, () => Array.from({ length: 10 }, () => false));
    const items: InventorySaveItem[] = [];
    for (const itemId of STARTER_CONSUMABLE_ITEM_IDS) {
        const item = ITEMS.find((candidate) => candidate.id === itemId);
        if (!item) continue;
        const slot = findOpenInventorySlot(occupied, item.gridW, item.gridH);
        if (!slot) continue;
        for (let y = slot.gridY; y < slot.gridY + item.gridH; y++) {
            for (let x = slot.gridX; x < slot.gridX + item.gridW; x++) occupied[y][x] = true;
        }
        items.push({
            itemId,
            gridX: slot.gridX,
            gridY: slot.gridY,
            quantity: 1,
            durability: item.maxDurability,
        });
    }
    return items;
}

function createStarterEquipment(classKey: StartingClassId): Record<string, unknown> {
    return {
        ...createStarterEquipmentSlot('weapon', STARTER_WEAPON_ITEM_ID),
        ...createStarterEquipmentSlot('body', getStarterBodyArmorId(classKey)),
    };
}

function createStarterEquipmentSlot(slot: string, itemId: string): Record<string, unknown> {
    const item = ITEMS.find((candidate) => candidate.id === itemId && candidate.slot === slot);
    if (!item) return {};
    return {
        [slot]: {
            itemId,
            gridX: 0,
            gridY: 0,
            quantity: 1,
            durability: item.maxDurability,
        },
    };
}

function findOpenInventorySlot(occupied: boolean[][], width: number, height: number): { gridX: number; gridY: number } | null {
    for (let y = 0; y <= occupied.length - height; y++) {
        for (let x = 0; x <= occupied[y].length - width; x++) {
            let blocked = false;
            for (let dy = 0; dy < height && !blocked; dy++) {
                for (let dx = 0; dx < width; dx++) {
                    if (occupied[y + dy][x + dx]) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (!blocked) return { gridX: x, gridY: y };
        }
    }
    return null;
}

function firstOpenSlot(characters: Array<{ slotNo: number }>): number | null {
    const used = new Set(characters.map((character) => character.slotNo));
    for (let slot = 0; slot < MAX_CHARACTER_SLOTS; slot++) {
        if (!used.has(slot)) return slot;
    }
    return null;
}

function normalizeCharacterName(name: string): string {
    return name.trim().toLocaleLowerCase('en-US');
}

function normalizeInventorySnapshot(snapshot: InventorySaveSnapshot): InventorySaveSnapshot {
    const width = clampInt(snapshot.width, 1, 20, 10);
    const height = clampInt(snapshot.height, 1, 20, 6);
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    return {
        width,
        height,
        items: items.flatMap((entry) => {
            if (!entry || typeof entry.itemId !== 'string') return [];
            const item = ITEMS.find((candidate) => candidate.id === entry.itemId);
            if (!item) return [];
            const gridX = clampInt(entry.gridX, 0, width - 1, 0);
            const gridY = clampInt(entry.gridY, 0, height - 1, 0);
            if (gridX + item.gridW > width || gridY + item.gridH > height) return [];
            return [{
                itemId: item.id,
                gridX,
                gridY,
                quantity: clampInt(entry.quantity, 1, 999, 1),
                durability: clampInt(entry.durability, 0, item.maxDurability, item.maxDurability),
                ...(entry.acquiredInRaid ? { acquiredInRaid: true } : {}),
                ...withOptionalUid(entry.uid),
                ...withOptionalSockets(entry.sockets),
            }];
        }),
    };
}

function withOptionalUid(value: unknown): { uid: string } | {} {
    return typeof value === 'string' && value.length > 0 ? { uid: value.slice(0, 80) } : {};
}

function withOptionalSockets(value: unknown): { sockets: string[] } | {} {
    if (!Array.isArray(value)) return {};
    const sockets = value.filter((entry): entry is string => {
        return typeof entry === 'string' && ITEMS.some((candidate) => candidate.id === entry);
    });
    return sockets.length > 0 ? { sockets } : {};
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
    return Math.max(min, Math.min(max, number));
}

function uniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function clone<T>(value: T): T {
    return value === null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function accountFromRow(row: Record<string, unknown>): AuthAccount {
    return {
        id: String(row.id),
        loginName: String(row.login_name),
        loginNameNormalized: String(row.login_name_normalized),
        passwordHash: String(row.password_hash),
        lastSelectedCharacterId: row.last_selected_character_id ? String(row.last_selected_character_id) : null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        disabledAt: row.disabled_at ? toIso(row.disabled_at) : null,
    };
}

function sessionFromRow(row: Record<string, unknown>): AuthSession {
    return {
        id: String(row.id),
        accountId: String(row.account_id),
        refreshTokenHash: String(row.refresh_token_hash),
        tokenFamilyId: String(row.token_family_id),
        createdAt: toIso(row.created_at),
        expiresAt: toIso(row.expires_at),
        lastUsedAt: toIso(row.last_used_at),
        revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
        replacedBySessionId: row.replaced_by_session_id ? String(row.replaced_by_session_id) : null,
        userAgent: row.user_agent ? String(row.user_agent) : null,
        ipHash: row.ip_hash ? String(row.ip_hash) : null,
    };
}

function characterFromRow(row: Record<string, unknown>): AuthCharacter {
    const classKey = isStartingClassKey(row.class_key) ? row.class_key : 'infantry';
    return {
        id: String(row.id),
        accountId: String(row.account_id),
        slotNo: Number(row.slot_no),
        name: String(row.name),
        classKey,
        tier: Number(row.tier),
        level: Number(row.level),
        exp: Number(row.exp),
        baseStats: createBaseStats(row.base_stats as Partial<CharacterStats>),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    };
}

function saveFromRow(row: Record<string, unknown>): CharacterSave {
    return {
        characterId: String(row.character_id),
        saveVersion: Number(row.save_version),
        revision: Number(row.revision),
        hubLocation: toRecord(row.hub_location),
        questState: toRecord(row.quest_state),
        inventory: normalizeInventorySnapshot(row.inventory as InventorySaveSnapshot),
        equipment: toRecord(row.equipment),
        partySnapshot: toRecord(row.party_snapshot),
        rosterSnapshot: toRecord(row.roster_snapshot),
        updatedAt: toIso(row.updated_at),
    };
}

function progressFromRow(row: Record<string, unknown>): AccountProgress {
    return {
        accountId: String(row.account_id),
        completedQuests: Array.isArray(row.completed_quests) ? uniqueStrings(row.completed_quests as string[]) : [],
        unlocks: toRecord(row.unlocks),
        flags: toRecord(row.flags),
        updatedAt: toIso(row.updated_at),
    };
}

function toRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    return new Date().toISOString();
}

async function insertSave(client: PoolClient, save: CharacterSave): Promise<void> {
    await client.query(
        `INSERT INTO character_saves (character_id, save_version, revision, hub_location, quest_state, inventory, equipment, party_snapshot, roster_snapshot, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)`,
        [
            save.characterId,
            save.saveVersion,
            save.revision,
            JSON.stringify(save.hubLocation),
            JSON.stringify(save.questState),
            JSON.stringify(save.inventory),
            JSON.stringify(save.equipment),
            JSON.stringify(save.partySnapshot),
            JSON.stringify(save.rosterSnapshot),
            save.updatedAt,
        ]
    );
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === '23505';
}

async function safeRollback(client: PoolClient): Promise<void> {
    try {
        await client.query('ROLLBACK');
    } catch {
        // The connection is about to be released; preserve the original error.
    }
}
