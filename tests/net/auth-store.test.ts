import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAuthStore, normalizeLoginName } from '../../server/AuthStore';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { getItemDef } from '../../src/data/ItemDB';

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

test('auth store raid survival with full inventory does not persist incomplete story completion', async () => {
    const store = new InMemoryAuthStore();
    await store.initialize();
    const account = await store.createAccount({
        loginName: 'FullRewardUser',
        loginNameNormalized: normalizeLoginName('FullRewardUser'),
        passwordHash: 'hash',
    });
    const { character } = await store.createCharacter(account.id, {
        name: 'Hero',
        classKey: 'infantry',
        gender: 'M',
    });
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 3);
    const save = await store.getCharacterSave(account.id, character.id);
    assert.ok(scenario);
    assert.ok(save);

    await store.updateCharacterSave(account.id, character.id, {
        expectedRevision: save.revision,
        patch: {
            inventory: fullInventory(save.inventory.width, save.inventory.height),
        },
    });

    await store.recordRaidSurvival(account.id, character.id, [scenario.questId], 'w_forest_village');

    const updatedSave = await store.getCharacterSave(account.id, character.id);
    const progress = await store.getAccountProgress(account.id);
    assert.ok(updatedSave);
    assert.equal(updatedSave.hubLocation.townId, 'w_forest_village');
    assert.notEqual((updatedSave.questState.completedQuestIds as string[] | undefined)?.includes(scenario.questId), true);
    assert.notEqual((updatedSave.questState.questItemIds as string[] | undefined)?.includes('quest_sacred_sword'), true);
    assert.notEqual((updatedSave.questState.storyCompanionIds as string[] | undefined)?.includes('story_fighter_ep03'), true);
    assert.equal(updatedSave.inventory.items.some((item) => item.itemId === 'quest_sacred_sword'), false);
    assert.equal((updatedSave.rosterSnapshot.characters as unknown[]).some((entry) => asRecord(entry).id === 'story_fighter_ep03'), false);
    assert.equal(progress.completedQuests.includes(scenario.questId), false);
});

function fullInventory(width: number, height: number) {
    const filler = getItemDef('herb_cheap');
    assert.ok(filler);
    const items = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            items.push({
                itemId: filler.id,
                gridX: x,
                gridY: y,
                quantity: 1,
                durability: filler.maxDurability,
            });
        }
    }
    return { width, height, items };
}

function asRecord(value: unknown): Record<string, unknown> {
    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    return value as Record<string, unknown>;
}
