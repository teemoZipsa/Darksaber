import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHubSavePatch } from '../../server/HubSavePatch';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { HttpError } from '../../server/HttpError';

function authCharacter(overrides: Partial<AuthCharacter> = {}): AuthCharacter {
    return {
        id: 'char-1',
        accountId: 'acct-1',
        slotNo: 0,
        name: 'Hero',
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        ...overrides,
    } as AuthCharacter;
}

test('buildHubSavePatch strips acquiredInRaid from client inventory', () => {
    const current = createDefaultCharacterSave(authCharacter());
    const patch = buildHubSavePatch({
        inventory: {
            width: 10,
            height: 6,
            items: [{
                itemId: 'herb_cheap',
                gridX: 0,
                gridY: 0,
                quantity: 1,
                durability: 1,
                acquiredInRaid: true,
            }],
        },
    }, current);
    assert.equal(patch.inventory?.items[0]?.acquiredInRaid, undefined);
});

test('buildHubSavePatch rejects completedQuestIds in questState', () => {
    const current = createDefaultCharacterSave(authCharacter());
    assert.throws(
        () => buildHubSavePatch({ questState: { completedQuestIds: ['quest:fake'] } }, current),
        (error: unknown) => error instanceof HttpError && error.code === 'forbidden_save_field',
    );
});

test('buildHubSavePatch floors negative gold to zero', () => {
    const current = createDefaultCharacterSave(authCharacter());
    const patch = buildHubSavePatch({ questState: { gold: -50 } }, current);
    assert.equal((patch.questState as Record<string, unknown>).gold, 0);
});

test('buildHubSavePatch rejects free hub gold and item creation', () => {
    const current = createDefaultCharacterSave(authCharacter());
    assert.throws(
        () => buildHubSavePatch({
            questState: { gold: 999_999 },
            stashSnapshot: {
                width: 15,
                height: 10,
                items: [{
                    itemId: 'cursed_artifact',
                    gridX: 0,
                    gridY: 0,
                    quantity: 1,
                    durability: 1,
                }],
            },
        }, current),
        (error: unknown) => error instanceof HttpError && error.code === 'invalid_hub_economy_patch',
    );
});

test('buildHubSavePatch allows paid item additions', () => {
    const current = createDefaultCharacterSave(authCharacter());
    const patch = buildHubSavePatch({
        questState: { gold: 490 },
        stashSnapshot: {
            width: 15,
            height: 10,
            items: [{
                itemId: 'herb_cheap',
                gridX: 0,
                gridY: 0,
                quantity: 1,
                durability: 1,
            }],
        },
    }, current);
    assert.equal((patch.questState as Record<string, unknown>).gold, 490);
    assert.equal(patch.stashSnapshot?.items[0]?.itemId, 'herb_cheap');
});

test('buildHubSavePatch preserves existing market contracts instead of accepting forged ones', () => {
    const current = createDefaultCharacterSave(authCharacter());
    const patch = buildHubSavePatch({
        questState: {
            marketCycle: 1,
            marketContracts: [{
                id: 'forged-contract',
                targetTownId: 'central_castle',
                itemId: 'trade_forest_resin',
                remainingQuantity: 1,
                bonusPerUnit: 999_999,
                expiresCycle: 99,
            }],
        },
    }, current);
    assert.deepEqual((patch.questState as Record<string, unknown>).marketContracts, []);
});

test('buildHubSavePatch accepts normalized facility upgrades', () => {
    const current = createDefaultCharacterSave(authCharacter());
    const patch = buildHubSavePatch({
        questState: {
            facilityUpgrades: {
                infirmary: 1,
                workshop: 99,
                unknown: 3,
            },
        },
    }, current);
    assert.deepEqual((patch.questState as Record<string, unknown>).facilityUpgrades, {
        infirmary: 1,
        workshop: 2,
    });
});

test('buildHubSavePatch persists normalized learned skill upgrade levels', () => {
    const current = createDefaultCharacterSave(authCharacter());
    const patch = buildHubSavePatch({
        rosterSnapshot: {
            characters: [{
                id: 'char-1',
                magicLoadout: ['inf_t1'],
                skillUpgradeLevels: {
                    inf_t1: 9,
                    mag_t1: 3,
                    not_a_skill: 4,
                    inf_t2: '5',
                },
            }],
        },
    }, current);

    const roster = patch.rosterSnapshot as Record<string, unknown>;
    const character = (roster.characters as Array<Record<string, unknown>>)[0];
    assert.deepEqual(character.skillUpgradeLevels, { inf_t1: 5 });
});

test('buildHubSavePatch moves owned inventory equipment onto a companion without treating it as free creation', () => {
    const current = createDefaultCharacterSave(authCharacter());
    current.rosterSnapshot = {
        characters: [
            ...(current.rosterSnapshot.characters as Array<Record<string, unknown>>),
            { id: 'companion-1', name: 'Companion', classKey: 'cleric', tier: 1, level: 1, baseStats: {} },
        ],
    };
    current.inventory.items.push({
        itemId: 'magic_t1_body',
        gridX: 4,
        gridY: 0,
        quantity: 1,
        durability: 100,
    });

    const patch = buildHubSavePatch({
        inventory: {
            ...current.inventory,
            items: current.inventory.items.filter((item) => item.itemId !== 'magic_t1_body'),
        },
        rosterSnapshot: {
            characters: [{
                id: 'companion-1',
                equipment: {
                    body: {
                        itemId: 'magic_t1_body',
                        gridX: 0,
                        gridY: 0,
                        quantity: 1,
                        durability: 100,
                    },
                },
            }],
        },
    }, current);

    const roster = patch.rosterSnapshot as Record<string, unknown>;
    const companion = (roster.characters as Array<Record<string, unknown>>).find((entry) => entry.id === 'companion-1');
    assert.equal(((companion?.equipment as Record<string, Record<string, unknown>>).body).itemId, 'magic_t1_body');
});
