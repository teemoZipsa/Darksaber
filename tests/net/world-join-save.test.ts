import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { createPartyCompositionFromSave } from '../../server/WorldJoinSave';

test('world join save composition keeps the selected character as the controllable leader', () => {
    const selected = authCharacter('selected-hero', 'Selected Hero');
    const save = createDefaultCharacterSave(selected);
    save.rosterSnapshot = {
        characters: [
            {
                id: 'companion-a',
                name: 'Companion A',
                classKey: 'cleric',
                tier: 1,
                level: 1,
                baseStats: createBaseStats({ spd: 90, mov: 50, actionLimit: 80, hitRate: 180 }),
            },
            {
                id: selected.id,
                name: selected.name,
                classKey: selected.classKey,
                tier: selected.tier,
                level: selected.level,
                baseStats: selected.baseStats,
            },
        ],
    };
    save.partySnapshot = { activeCharacterIds: ['companion-a'] };

    const composition = createPartyCompositionFromSave(selected, save);

    assert.equal(composition[0]?.id, selected.id);
    assert.equal(composition[1]?.id, 'companion-a');
});

test('world join save composition falls back to selected character when old roster data omits it', () => {
    const selected = authCharacter('selected-missing-roster', 'Missing Roster Hero');
    const save = createDefaultCharacterSave(selected);
    save.rosterSnapshot = {
        characters: [{
            id: 'companion-only',
            name: 'Companion Only',
            classKey: 'mage',
            tier: 1,
            level: 1,
            baseStats: createBaseStats({ spd: 90, mov: 50, actionLimit: 80, hitRate: 180 }),
        }],
    };
    save.partySnapshot = { activeCharacterIds: ['companion-only'] };

    const composition = createPartyCompositionFromSave(selected, save);

    assert.equal(composition[0]?.id, selected.id);
    assert.equal(composition[0]?.name, selected.name);
    assert.equal(composition[1]?.id, 'companion-only');
});

function authCharacter(id: string, name: string): AuthCharacter {
    return {
        id,
        accountId: 'account-test',
        slotNo: 1,
        name,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}
