import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CURRENT_SAVE_VERSION,
    InMemoryAuthStore,
    PostgresAuthStore,
    createDefaultStashSnapshot,
    migrateCharacterSave,
    normalizeLoginName,
    type CharacterSave,
} from '../../server/AuthStore';

test('migrateCharacterSave injects stashSnapshot for legacy v1 saves', () => {
    const legacy = {
        characterId: 'char-1',
        saveVersion: 1,
        revision: 3,
        hubLocation: { townId: 'central_castle' },
        questState: { gold: 1200 },
        inventory: { width: 10, height: 6, items: [] },
        equipment: {},
        partySnapshot: { activeCharacterIds: ['char-1'] },
        rosterSnapshot: { characters: [] },
        updatedAt: new Date().toISOString(),
    } as unknown as CharacterSave;

    const migrated = migrateCharacterSave(legacy);
    assert.equal(migrated.saveVersion, CURRENT_SAVE_VERSION);
    assert.equal(migrated.stashSnapshot.width, 15);
    assert.equal(migrated.stashSnapshot.height, 10);
    assert.deepEqual(migrated.stashSnapshot.items, []);
});

test('in-memory updateCharacterSave preserves stash when inventory-only patch is applied', async () => {
    const store = new InMemoryAuthStore();
    await store.initialize();
    const account = await store.createAccount({
        loginName: 'StashUser',
        loginNameNormalized: normalizeLoginName('StashUser'),
        passwordHash: 'hash',
    });
    const { character, save } = await store.createCharacter(account.id, {
        name: 'Hero',
        classKey: 'infantry',
        gender: 'M',
    });

    const stashWithItem = {
        ...createDefaultStashSnapshot(),
        items: [{
            itemId: 'herb_cheap',
            gridX: 0,
            gridY: 0,
            quantity: 2,
            durability: 1,
        }],
    };

    const stashUpdated = await store.updateCharacterSave(account.id, character.id, {
        expectedRevision: save.revision,
        patch: { stashSnapshot: stashWithItem },
    });
    assert.equal(stashUpdated.status, 'updated');
    if (stashUpdated.status !== 'updated') return;

    const inventoryOnly = await store.updateCharacterSave(account.id, character.id, {
        expectedRevision: stashUpdated.save.revision,
        patch: {
            inventory: {
                width: 10,
                height: 6,
                items: [{
                    itemId: 'herb_cheap',
                    gridX: 0,
                    gridY: 0,
                    quantity: 1,
                    durability: 1,
                }],
            },
        },
    });
    assert.equal(inventoryOnly.status, 'updated');
    if (inventoryOnly.status !== 'updated') return;

    assert.equal(inventoryOnly.save.inventory.items.length, 1);
    assert.equal(inventoryOnly.save.stashSnapshot.items.length, 1);
    assert.equal(inventoryOnly.save.stashSnapshot.items[0]?.quantity, 2);
});

test('postgres updateCharacterSave UPDATE includes stash_snapshot column and value', async () => {
    const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
    const pool = {
        connect: async () => ({
            query: async (text: string, values?: unknown[]) => {
                queries.push({ text, values });
                if (text === 'BEGIN') return { rows: [] };
                if (text.includes('FROM character_saves') && text.includes('FOR UPDATE')) {
                    return {
                        rows: [{
                            character_id: 'char-pg',
                            save_version: 2,
                            revision: 1,
                            hub_location: { townId: 'central_castle' },
                            quest_state: { gold: 500 },
                            inventory: { width: 10, height: 6, items: [] },
                            stash_snapshot: {
                                width: 15,
                                height: 10,
                                items: [{
                                    itemId: 'herb_cheap',
                                    gridX: 0,
                                    gridY: 0,
                                    quantity: 3,
                                    durability: 1,
                                }],
                            },
                            equipment: {},
                            party_snapshot: { activeCharacterIds: ['char-pg'] },
                            roster_snapshot: { characters: [] },
                            updated_at: new Date().toISOString(),
                        }],
                    };
                }
                if (text === 'COMMIT') return { rows: [] };
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
            inventory: {
                width: 10,
                height: 6,
                items: [{
                    itemId: 'herb_cheap',
                    gridX: 1,
                    gridY: 0,
                    quantity: 1,
                    durability: 1,
                }],
            },
        },
    });

    assert.equal(result.status, 'updated');
    const update = queries.find((entry) => entry.text.includes('UPDATE character_saves'));
    assert.ok(update);
    assert.match(update!.text, /stash_snapshot = \$9::jsonb/);
    const stashJson = update!.values?.[8];
    assert.equal(typeof stashJson, 'string');
    const parsed = JSON.parse(String(stashJson)) as { items: Array<{ quantity: number }> };
    assert.equal(parsed.items[0]?.quantity, 3);
});
