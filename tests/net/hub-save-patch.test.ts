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
