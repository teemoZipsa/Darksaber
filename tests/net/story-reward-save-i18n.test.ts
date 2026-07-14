import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStoryQuestRewardsToSaveState } from '../../server/StoryRewardSave';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';

test('server story rewards persist stable companion identity instead of a process-language name', () => {
    const episodeOne = STORY_SCENARIOS.find((scenario) => scenario.episode === 1);
    const episodeTwo = STORY_SCENARIOS.find((scenario) => scenario.episode === 2);
    assert.ok(episodeOne);
    assert.ok(episodeTwo);
    assert.equal(episodeTwo.reward.type, 'companion');
    if (episodeTwo.reward.type !== 'companion') return;
    const reward = episodeTwo.reward;

    const completedQuestIds = new Set([episodeOne.questId, episodeTwo.questId]);
    const questState: Record<string, unknown> = {
        completedQuestIds: [...completedQuestIds],
    };
    const inventory = { width: 10, height: 6, items: [] };
    const rosterSnapshot: Record<string, unknown> = { characters: [] };

    const blocked = applyStoryQuestRewardsToSaveState(
        completedQuestIds,
        questState,
        inventory,
        rosterSnapshot,
    );

    assert.deepEqual(blocked, []);
    const characters = rosterSnapshot.characters as Array<Record<string, unknown>>;
    const companion = characters.find((entry) => entry.id === reward.companionId);
    assert.ok(companion);
    assert.equal(companion.name, reward.companionId);
    assert.equal(companion.nameKey, reward.nameKey);
    assert.doesNotMatch(String(companion.name), /[\uac00-\ud7a3]/);
});
