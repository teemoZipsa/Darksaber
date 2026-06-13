import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAuthStore, normalizeLoginName } from '../../server/AuthStore';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';

test('auth store raid survival persists story inventory and companion rewards', async () => {
    const store = new InMemoryAuthStore();
    await store.initialize();
    const account = await store.createAccount({
        loginName: 'StoryRewardUser',
        loginNameNormalized: normalizeLoginName('StoryRewardUser'),
        passwordHash: 'hash',
    });
    const { character } = await store.createCharacter(account.id, {
        name: 'Hero',
        classKey: 'infantry',
        gender: 'M',
    });
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 3);
    assert.ok(scenario);

    await store.recordRaidSurvival(account.id, character.id, [scenario.questId], 'w_forest_village');
    await store.recordRaidSurvival(account.id, character.id, [scenario.questId], 'w_forest_village');

    const save = await store.getCharacterSave(account.id, character.id);
    assert.ok(save);
    assert.equal(save.hubLocation.townId, 'w_forest_village');
    assert.deepEqual(save.questState.completedQuestIds, [scenario.questId]);
    assert.deepEqual(save.questState.questItemIds, ['quest_sacred_sword']);
    assert.deepEqual(save.questState.storyCompanionIds, ['story_fighter_ep03']);
    assert.equal(save.inventory.items.filter((item) => item.itemId === 'quest_sacred_sword').length, 1);

    const roster = save.rosterSnapshot.characters;
    assert.ok(Array.isArray(roster));
    assert.equal(roster.filter((entry) => asRecord(entry).id === 'story_fighter_ep03').length, 1);
});

function asRecord(value: unknown): Record<string, unknown> {
    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    return value as Record<string, unknown>;
}
