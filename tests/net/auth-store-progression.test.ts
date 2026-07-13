import test from 'node:test';
import assert from 'node:assert/strict';
import {
    InMemoryAuthStore,
    PostgresAuthStore,
    normalizeLoginName,
    type AuthCharacter,
    type CharacterSave,
} from '../../server/AuthStore';
import { buildHubSavePatch } from '../../server/HubSavePatch';
import { createBaseStats, type CharacterStats } from '../../src/data/Stats';

test('in-memory save update syncs primary progression while preserving starting class', async () => {
    const { store, accountId, character, save } = await createInMemoryCharacter('ProgressionSync');
    const primary = primaryRosterCharacter(save);
    const progressedStats = createBaseStats({
        ...character.baseStats,
        hp: 180,
        maxHp: 180,
        atk: character.baseStats.atk + 12,
        def: character.baseStats.def + 7,
    });
    const companionStats = createBaseStats({ atk: 999, def: 999 });

    const result = await store.updateCharacterSave(accountId, character.id, {
        expectedRevision: save.revision,
        patch: {
            rosterSnapshot: {
                characters: [
                    {
                        id: 'companion-1',
                        name: 'Companion',
                        classKey: 'mage',
                        tier: 9,
                        level: 99,
                        exp: 999_999,
                        baseStats: companionStats,
                    },
                    {
                        ...primary,
                        classKey: 'mage',
                        tier: 2,
                        level: 7,
                        exp: 345,
                        baseStats: progressedStats,
                    },
                ],
            },
        },
    });

    assert.equal(result.status, 'updated');
    const updatedCharacter = await store.getCharacter(accountId, character.id);
    assert.ok(updatedCharacter);
    assert.equal(updatedCharacter.classKey, 'infantry');
    assert.equal(updatedCharacter.tier, 2);
    assert.equal(updatedCharacter.level, 7);
    assert.equal(updatedCharacter.exp, 345);
    assert.deepEqual(updatedCharacter.baseStats, progressedStats);
});

test('in-memory save update ignores progression when the merged roster has no primary record', async () => {
    const { store, accountId, character, save } = await createInMemoryCharacter('PrimaryOnly');

    const result = await store.updateCharacterSave(accountId, character.id, {
        expectedRevision: save.revision,
        patch: {
            rosterSnapshot: {
                characters: [{
                    id: 'companion-1',
                    tier: 8,
                    level: 88,
                    exp: 888_888,
                    baseStats: createBaseStats({ atk: 888 }),
                }],
            },
        },
    });

    assert.equal(result.status, 'updated');
    const updatedCharacter = await store.getCharacter(accountId, character.id);
    assert.ok(updatedCharacter);
    assertCharacterProgression(updatedCharacter, character);
});

test('sanitized hub roster patch cannot forge auth progression metadata', async () => {
    const { store, accountId, character, save } = await createInMemoryCharacter('HubRosterGuard');
    const clientPatch = buildHubSavePatch({
        rosterSnapshot: {
            characters: [{
                id: character.id,
                classKey: 'mage',
                tier: 7,
                level: 99,
                exp: 999_999,
                baseStats: createBaseStats({ atk: 999, def: 999 }),
            }],
        },
    }, save);

    const result = await store.updateCharacterSave(accountId, character.id, {
        expectedRevision: save.revision,
        patch: clientPatch,
    });

    assert.equal(result.status, 'updated');
    const updatedCharacter = await store.getCharacter(accountId, character.id);
    assert.ok(updatedCharacter);
    assertCharacterProgression(updatedCharacter, character);
});

test('postgres save update persists primary progression metadata in the same transaction', async () => {
    const baseStats = createBaseStats();
    const progressedStats = createBaseStats({
        ...baseStats,
        hp: 175,
        maxHp: 175,
        atk: baseStats.atk + 10,
    });
    const currentSave = postgresSaveRow('char-pg', baseStats);
    const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
    const pool = {
        connect: async () => ({
            query: async (text: string, values?: unknown[]) => {
                queries.push({ text, values });
                if (text.includes('FROM character_saves') && text.includes('FOR UPDATE')) {
                    return { rows: [currentSave] };
                }
                return { rows: [] };
            },
            release: () => undefined,
        }),
    };
    const store = new PostgresAuthStore('postgres://example.test/db');
    (store as unknown as { pool: typeof pool }).pool = pool;

    const result = await store.updateCharacterSave('account-1', 'char-pg', {
        expectedRevision: 1,
        patch: {
            rosterSnapshot: {
                characters: [{
                    id: 'char-pg',
                    classKey: 'mage',
                    tier: 3,
                    level: 12,
                    exp: 4_567,
                    baseStats: progressedStats,
                }],
            },
        },
    });

    assert.equal(result.status, 'updated');
    const characterUpdate = queries.find((entry) => /UPDATE characters\s+SET tier/.test(entry.text));
    assert.ok(characterUpdate);
    assert.doesNotMatch(characterUpdate.text, /class_key/);
    assert.deepEqual(characterUpdate.values?.slice(0, 3), [3, 12, 4_567]);
    assert.deepEqual(JSON.parse(String(characterUpdate.values?.[3])), progressedStats);
    assert.equal(characterUpdate.values?.[5], 'char-pg');
    assert.equal(characterUpdate.values?.[6], 'account-1');

    const saveUpdateIndex = queries.findIndex((entry) => entry.text.includes('UPDATE character_saves'));
    const characterUpdateIndex = queries.indexOf(characterUpdate);
    const commitIndex = queries.findIndex((entry) => entry.text === 'COMMIT');
    assert.ok(saveUpdateIndex >= 0 && characterUpdateIndex > saveUpdateIndex && commitIndex > characterUpdateIndex);
});

async function createInMemoryCharacter(loginName: string): Promise<{
    store: InMemoryAuthStore;
    accountId: string;
    character: AuthCharacter;
    save: CharacterSave;
}> {
    const store = new InMemoryAuthStore();
    await store.initialize();
    const account = await store.createAccount({
        loginName,
        loginNameNormalized: normalizeLoginName(loginName),
        passwordHash: 'hash',
    });
    const { character, save } = await store.createCharacter(account.id, {
        name: 'Hero',
        classKey: 'infantry',
        gender: 'M',
    });
    return { store, accountId: account.id, character, save };
}

function primaryRosterCharacter(save: CharacterSave): Record<string, unknown> {
    const characters = save.rosterSnapshot.characters;
    assert.ok(Array.isArray(characters));
    const primary = characters.find((entry) => asRecord(entry).id === save.characterId);
    assert.ok(primary);
    return asRecord(primary);
}

function assertCharacterProgression(actual: AuthCharacter, expected: AuthCharacter): void {
    assert.equal(actual.classKey, expected.classKey);
    assert.equal(actual.tier, expected.tier);
    assert.equal(actual.level, expected.level);
    assert.equal(actual.exp, expected.exp);
    assert.deepEqual(actual.baseStats, expected.baseStats);
}

function postgresSaveRow(characterId: string, baseStats: CharacterStats): Record<string, unknown> {
    return {
        character_id: characterId,
        save_version: 2,
        revision: 1,
        hub_location: { townId: 'central_castle' },
        quest_state: { gold: 500 },
        inventory: { width: 10, height: 6, items: [] },
        stash_snapshot: { width: 15, height: 10, items: [] },
        equipment: {},
        party_snapshot: { activeCharacterIds: [characterId] },
        roster_snapshot: {
            characters: [{
                id: characterId,
                name: 'Hero',
                classKey: 'infantry',
                tier: 1,
                level: 1,
                exp: 0,
                baseStats,
            }],
        },
        updated_at: new Date().toISOString(),
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    return value as Record<string, unknown>;
}
