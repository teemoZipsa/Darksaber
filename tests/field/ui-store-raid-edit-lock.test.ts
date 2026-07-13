import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character } from '../../src/character/Character';
import type { GameManager } from '../../src/engine/GameManager';
import { UiStore } from '../../src/ui/react/UiStore';

test('UiStore rejects party and magic mutations before touching raid preparation state', () => {
    const mutations: string[] = [];
    const manager = {
        isRaidPreparationEditingLocked: () => true,
        party: {
            deployCharacter: () => { mutations.push('deploy'); return true; },
            unDeployCharacter: () => { mutations.push('undeploy'); return true; },
            swapActiveSlots: () => { mutations.push('swap-active'); return true; },
            replaceActiveSlot: () => { mutations.push('replace'); },
            swapRoster: () => { mutations.push('swap-roster'); return true; },
        },
    } as unknown as GameManager;
    const store = new UiStore(manager);
    const character = {} as Character;

    const results = [
        store.partyDeploy(character),
        store.partyUndeploy('hero'),
        store.partySwapActive(0, 1),
        store.partyReplaceActive(0, character),
        store.partySwapRoster(0, 1),
        store.equipMagic(0, 'strike'),
        store.upgradeMagic('strike'),
    ];

    assert.deepEqual(mutations, []);
    for (const result of results) {
        assert.deepEqual(result, { ok: false, reasonKey: 'raid.editingLocked' });
    }
});
