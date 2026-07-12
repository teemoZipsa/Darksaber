import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSessionSaveState, type WorldSessionSavePlayer } from '../../server/WorldSessionSaveState';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { createBaseStats } from '../../src/data/Stats';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { getItemDef } from '../../src/data/ItemDB';
import { FIRST_SURVIVAL_GOLD_REWARD, FIRST_SURVIVAL_QUEST_ID } from '../../src/shared/FirstSurvivalReward';

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
    const priorQuestIds = STORY_SCENARIOS
        .filter((entry) => entry.episode < 3)
        .map((entry) => entry.questId);
    save.questState = { ...save.questState, completedQuestIds: priorQuestIds };
    const player: WorldSessionSavePlayer = {
        id: 'hero-a',
        completedQuestIds: new Set([...priorQuestIds, scenario.questId]),
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

test('active raid recovery patch keeps raid inventory without completing survival rewards', () => {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 3);
    assert.ok(scenario);
    const save = createDefaultCharacterSave(authCharacter('hero-recovery'));
    save.questState = { ...save.questState, completedQuestIds: [], gold: 500 };
    save.inventory.items.push({
        itemId: 'herb_cheap',
        gridX: 4,
        gridY: 4,
        quantity: 1,
        durability: getItemDef('herb_cheap')?.maxDurability ?? 1,
        acquiredInRaid: true,
    });
    const player: WorldSessionSavePlayer = {
        id: 'hero-recovery',
        completedQuestIds: new Set([scenario.questId]),
        raidGoldReward: 250,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();

    const interimPatch = saveState.createPatch(player, player.id, 'central_castle');
    assert.ok(interimPatch);
    assert.equal(interimPatch.inventory?.items.some((item) => item.itemId === 'herb_cheap' && item.gridX === 4), false);
    assert.equal(interimPatch.questState?.gold, 500);
    assert.deepEqual(interimPatch.questState?.completedQuestIds, []);

    const recoveryPatch = saveState.createRecoveryPatch(player, player.id, 'central_castle');
    assert.ok(recoveryPatch);
    const recoveredRaidItem = recoveryPatch.inventory?.items.find((item) => item.itemId === 'herb_cheap' && item.gridX === 4);
    assert.ok(recoveredRaidItem);
    assert.equal(recoveredRaidItem.acquiredInRaid, undefined);
    assert.equal(recoveryPatch.questState?.gold, 500);
    assert.deepEqual(recoveryPatch.questState?.completedQuestIds, []);
    assert.equal(Array.isArray(recoveryPatch.questState?.questItemIds), false);
    assert.equal(Array.isArray(recoveryPatch.questState?.storyCompanionIds), false);
});

test('failed final world save patch still drops raid inventory after recovery snapshots', () => {
    const save = createDefaultCharacterSave(authCharacter('hero-failed-recovery'));
    save.inventory.items.push({
        itemId: 'herb_cheap',
        gridX: 4,
        gridY: 4,
        quantity: 1,
        durability: getItemDef('herb_cheap')?.maxDurability ?? 1,
        acquiredInRaid: true,
    });
    const player: WorldSessionSavePlayer = {
        id: 'hero-failed-recovery',
        completedQuestIds: new Set<string>(),
        raidGoldReward: 0,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();

    const recoveryPatch = saveState.createRecoveryPatch(player, player.id, 'central_castle');
    assert.ok(recoveryPatch?.inventory?.items.some((item) => item.itemId === 'herb_cheap' && item.gridX === 4));

    saveState.captureFinalPatch(player, 'central_castle', false);
    const finalPatch = saveState.consumeFinalPatch(player.id);
    assert.ok(finalPatch);
    assert.equal(finalPatch.inventory?.items.some((item) => item.itemId === 'herb_cheap' && item.gridX === 4), false);
});

test('failed final world save patch authoritatively applies backpack loss, equipment loss, insurance, and recovery', () => {
    const save = createDefaultCharacterSave(authCharacter('hero-failed-authoritative'));
    save.questState = { ...save.questState, raidInsuranceActive: true };
    save.partySnapshot = { activeCharacterIds: ['hero-failed-authoritative', 'companion-a'] };
    save.rosterSnapshot = {
        characters: [
            ...(save.rosterSnapshot.characters as Array<Record<string, unknown>>),
            {
                id: 'companion-a',
                name: 'Companion A',
                classKey: 'cleric',
                tier: 1,
                level: 1,
                baseStats: {},
                equipment: {
                    weapon: { itemId: 'short_sword', gridX: 0, gridY: 0, quantity: 1, durability: 100 },
                    body: { itemId: 'magic_t1_body', gridX: 0, gridY: 0, quantity: 1, durability: 100 },
                },
            },
        ],
    };
    const player: WorldSessionSavePlayer = {
        id: 'hero-failed-authoritative',
        completedQuestIds: new Set(),
        raidGoldReward: 0,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();

    const summary = saveState.captureFinalPatch(player, 'central_castle', false);
    const finalPatch = saveState.consumeFinalPatch(player.id);

    assert.ok(summary);
    assert.ok(finalPatch?.inventory);
    assert.equal(summary.backpackLost.reduce((total, item) => total + item.quantity, 0), 3);
    assert.equal(summary.equipmentLost.length, 1);
    assert.ok(summary.protectedEquipment);
    assert.equal(summary.recoveryBackpack, 3);
    assert.ok(summary.recoveryEquipped >= 1);
    assert.deepEqual(finalPatch.inventory.items.map((item) => [item.itemId, item.quantity]), [
        ['herb_cheap', 2],
        ['mp_potion', 1],
    ]);
    assert.equal(finalPatch.questState?.raidInsuranceActive, false);
    const roster = finalPatch.rosterSnapshot?.characters as Array<Record<string, unknown>>;
    const primary = roster.find((entry) => entry.id === 'hero-failed-authoritative');
    const companion = roster.find((entry) => entry.id === 'companion-a');
    assert.ok((primary?.equipment as Record<string, unknown>).weapon);
    assert.ok((primary?.equipment as Record<string, unknown>).body);
    assert.ok((companion?.equipment as Record<string, unknown>).weapon);
    assert.ok((companion?.equipment as Record<string, unknown>).body);
});

test('final world save patch with full inventory does not persist incomplete story completion', () => {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 3);
    assert.ok(scenario);
    const save = createDefaultCharacterSave(authCharacter('hero-a'));
    save.inventory = fullInventory(save.inventory.width, save.inventory.height);
    const player: WorldSessionSavePlayer = {
        id: 'hero-a',
        completedQuestIds: new Set([scenario.questId]),
        raidGoldReward: 0,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();

    saveState.captureFinalPatch(player, 'w_forest_village', true);
    const finalPatch = saveState.consumeFinalPatch(player.id);
    assert.ok(finalPatch);
    assert.notEqual((finalPatch.questState?.completedQuestIds as string[] | undefined)?.includes(scenario.questId), true);
    assert.notEqual((finalPatch.questState?.questItemIds as string[] | undefined)?.includes('quest_sacred_sword'), true);
    assert.notEqual((finalPatch.questState?.storyCompanionIds as string[] | undefined)?.includes('story_fighter_ep03'), true);
    assert.equal(finalPatch.inventory?.items.some((item) => item.itemId === 'quest_sacred_sword'), false);
    assert.equal((finalPatch.rosterSnapshot?.characters as unknown[]).some((entry) => asRecord(entry).id === 'story_fighter_ep03'), false);
});

test('final world save patch cannot persist episode 31 without prior story clears', () => {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 31);
    assert.ok(scenario);
    const save = createDefaultCharacterSave(authCharacter('hero-a'));
    const player: WorldSessionSavePlayer = {
        id: 'hero-a',
        completedQuestIds: new Set([scenario.questId]),
        raidGoldReward: 0,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();

    saveState.captureFinalPatch(player, 'w_forest_village', true);
    const finalPatch = saveState.consumeFinalPatch(player.id);
    assert.ok(finalPatch);
    assert.notEqual((finalPatch.questState?.completedQuestIds as string[] | undefined)?.includes(scenario.questId), true);
});

test('world session save patch omits stashSnapshot so DB stash is preserved', () => {
    const save = createDefaultCharacterSave(authCharacter('hero-stash'));
    save.stashSnapshot.items.push({
        itemId: 'herb_cheap',
        gridX: 0,
        gridY: 0,
        quantity: 2,
        durability: 1,
    });
    const player: WorldSessionSavePlayer = {
        id: 'hero-stash',
        completedQuestIds: new Set(),
        raidGoldReward: 0,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();
    const patch = saveState.createPatch(player, player.id, 'central_castle');
    assert.ok(patch);
    assert.equal(patch.stashSnapshot, undefined);
});

test('final world save patch grants the first-survival bonus exactly once', () => {
    const firstSave = createDefaultCharacterSave(authCharacter('hero-first'));
    const firstPlayer: WorldSessionSavePlayer = {
        id: 'hero-first',
        completedQuestIds: new Set<string>(),
        raidGoldReward: 0,
        saveSnapshot: firstSave,
    };
    const saveState = new WorldSessionSaveState();
    saveState.captureFinalPatch(firstPlayer, 'central_castle', true);
    const firstPatch = saveState.consumeFinalPatch(firstPlayer.id);
    assert.ok(firstPatch);
    assert.equal(firstPatch.questState?.gold, 500 + FIRST_SURVIVAL_GOLD_REWARD);
    assert.ok((firstPatch.questState?.completedQuestIds as string[]).includes(FIRST_SURVIVAL_QUEST_ID));

    // A character that already holds the marker must not be re-credited.
    const repeatSave = createDefaultCharacterSave(authCharacter('hero-repeat'));
    repeatSave.questState = { ...repeatSave.questState, completedQuestIds: [FIRST_SURVIVAL_QUEST_ID], gold: 500 };
    const repeatPlayer: WorldSessionSavePlayer = {
        id: 'hero-repeat',
        completedQuestIds: new Set([FIRST_SURVIVAL_QUEST_ID]),
        raidGoldReward: 0,
        saveSnapshot: repeatSave,
    };
    saveState.captureFinalPatch(repeatPlayer, 'central_castle', true);
    const repeatPatch = saveState.consumeFinalPatch(repeatPlayer.id);
    assert.ok(repeatPatch);
    assert.equal(repeatPatch.questState?.gold, 500);
});

test('save state reports first-survival bonus eligibility once per character', () => {
    const saveState = new WorldSessionSaveState();
    const fresh: WorldSessionSavePlayer = {
        id: 'hero-fresh',
        completedQuestIds: new Set<string>(),
        raidGoldReward: 0,
        saveSnapshot: createDefaultCharacterSave(authCharacter('hero-fresh')),
    };
    assert.equal(saveState.grantsFirstSurvivalBonus(fresh), true);

    const veteranSave = createDefaultCharacterSave(authCharacter('hero-veteran'));
    veteranSave.questState = { ...veteranSave.questState, completedQuestIds: [FIRST_SURVIVAL_QUEST_ID] };
    const veteran: WorldSessionSavePlayer = {
        id: 'hero-veteran',
        completedQuestIds: new Set([FIRST_SURVIVAL_QUEST_ID]),
        raidGoldReward: 0,
        saveSnapshot: veteranSave,
    };
    assert.equal(saveState.grantsFirstSurvivalBonus(veteran), false);
});

test('first-survival bonus stacks on top of raid gold reward', () => {
    const save = createDefaultCharacterSave(authCharacter('hero-gold'));
    save.questState = { ...save.questState, completedQuestIds: [], gold: 100 };
    const player: WorldSessionSavePlayer = {
        id: 'hero-gold',
        completedQuestIds: new Set<string>(),
        raidGoldReward: 250,
        saveSnapshot: save,
    };
    const saveState = new WorldSessionSaveState();
    saveState.captureFinalPatch(player, 'central_castle', true);
    const patch = saveState.consumeFinalPatch(player.id);
    assert.ok(patch);
    assert.equal(patch.questState?.gold, 100 + 250 + FIRST_SURVIVAL_GOLD_REWARD);
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
