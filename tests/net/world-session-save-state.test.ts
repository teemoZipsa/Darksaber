import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSessionSaveState, type WorldSessionSavePlayer } from '../../server/WorldSessionSaveState';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { createBaseStats } from '../../src/data/Stats';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';

function authCharacter(id: string): AuthCharacter {
    return {
        id,
        accountId: 'account-test',
        slotNo: 1,
        name: id,
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

test('final world save patch persists story quest inventory and companion rewards only after survival', () => {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 3);
    assert.ok(scenario);
    const save = createDefaultCharacterSave(authCharacter('hero-a'));
    const player: WorldSessionSavePlayer = {
        id: 'hero-a',
        completedQuestIds: new Set([scenario.questId]),
        raidGoldReward: 0,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();

    const interimPatch = saveState.createPatch(player, player.id, 'central_castle');
    assert.ok(interimPatch);
    assert.equal(interimPatch.inventory?.items.some((item) => item.itemId === 'quest_sacred_sword'), false);
    assert.equal(Array.isArray(interimPatch.questState?.questItemIds), false);
    assert.equal(Array.isArray(interimPatch.questState?.storyCompanionIds), false);

    saveState.captureFinalPatch(player, 'w_forest_village', true);
    const finalPatch = saveState.consumeFinalPatch(player.id);
    assert.ok(finalPatch);
    assert.ok(finalPatch.inventory?.items.some((item) => item.itemId === 'quest_sacred_sword'));
    assert.ok((finalPatch.questState?.questItemIds as string[]).includes('quest_sacred_sword'));
    assert.ok((finalPatch.questState?.storyCompanionIds as string[]).includes('story_fighter_ep03'));

    const roster = finalPatch.rosterSnapshot?.characters;
    assert.ok(Array.isArray(roster));
    const companion = roster.find((entry) => entry.id === 'story_fighter_ep03');
    assert.equal(companion?.classKey, 'infantry');
    assert.equal(companion?.level, 1);
});
