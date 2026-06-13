import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { PartyManager } from '../../src/character/PartyManager';
import type { GameManager } from '../../src/engine/GameManager';
import { WorldRaidOutcomeController, type WorldRaidOutcomeContext } from '../../src/engine/world/WorldRaidOutcomeController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import type { WorldTownSession } from '../../src/engine/world/WorldTownSession';
import { GridInventory } from '../../src/inventory/GridInventory';
import type { TownInfo } from '../../src/map/BiomeMask';
import type { RaidOutcome } from '../../src/raid/RaidOutcome';
import { PlayerData } from '../../src/data/PlayerData';
import { getItemDef } from '../../src/data/ItemDB';
import { BURGOS_CASTLE_DUNGEON_ID, ZAMORA_FORTRESS_DUNGEON_ID } from '../../src/data/MonsterCatalog';
import {
    MAIN_QUEST_EPISODE_01_ID,
    MAIN_QUEST_EPISODE_02_ID,
    BURGOS_KEY_ITEM_ID,
    CAIN_NECKLACE_ITEM_ID,
    QUEST_BOMB_ITEM_ID,
    STORY_CLERIC_EP02_ID,
    STORY_QUESTS,
    getStoryQuestViews,
    isStoryRewardOwned,
} from '../../src/data/StoryQuestData';

class ImageStub {
    public src = '';
    public complete = true;
    public naturalWidth = 96;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

const DESTINATION_TOWN: TownInfo = {
    id: 'w_forest_village',
    name: 'Forest Village',
    nameKr: '숲속 마을',
    chunkX: 0,
    chunkY: 0,
    radius: 1,
};

function markBurgosObjectiveComplete(raidSession: WorldRaidSession): void {
    raidSession.startDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
    raidSession.completeDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
}

function markZamoraObjectiveComplete(raidSession: WorldRaidSession): void {
    raidSession.startDungeonEncounter(ZAMORA_FORTRESS_DUNGEON_ID);
    raidSession.completeDungeonEncounter(ZAMORA_FORTRESS_DUNGEON_ID);
}

function markStoryObjectiveComplete(raidSession: WorldRaidSession, dungeonId: string): void {
    raidSession.startDungeonEncounter(dungeonId);
    raidSession.completeDungeonEncounter(dungeonId);
}

function createController() {
    const playerData = new PlayerData();
    playerData.markCleared('quest:first_survival');
    const raidSession = new WorldRaidSession('central_castle');
    const party = new PartyManager();
    const townSession = {
        clearRestStatusesFromParty: () => undefined,
        applyRaidInjuries: (_downedCharacterIds: Set<string>) => undefined,
        hide: () => undefined,
    } as unknown as WorldTownSession;
    const gameManager = {
        inventory: new GridInventory(10, 6),
        stash: new GridInventory(15, 10),
    } as unknown as GameManager;
    const context: WorldRaidOutcomeContext = {
        party,
        playerData,
        gameManager,
        raidSession,
        townSession,
        getTownById: () => DESTINATION_TOWN,
        getCurrentHubTown: () => DESTINATION_TOWN,
        placePartyAtTown: (_town: TownInfo) => undefined,
        openTown: (_town: TownInfo) => undefined,
        setPhase: () => undefined,
        log: () => undefined,
    };
    const controller = new WorldRaidOutcomeController(context);
    const getOutcome = (): RaidOutcome | null =>
        (controller as unknown as { raidResultUI: { outcome: RaidOutcome | null } }).raidResultUI.outcome;

    return { controller, playerData, raidSession, party, gameManager, getOutcome };
}

test('Burgos objective grants episode 1 completion and bomb only after survival', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    raidSession.beginRaidFromTown('central_castle');
    markBurgosObjectiveComplete(raidSession);

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.isCleared(MAIN_QUEST_EPISODE_01_ID), true);
    assert.equal(playerData.hasQuestItem(QUEST_BOMB_ITEM_ID), true);
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('1화')));
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('폭탄')));
});

test('completed episode 1 does not grant duplicate story rewards', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    playerData.markCleared(MAIN_QUEST_EPISODE_01_ID);
    playerData.addQuestItem(QUEST_BOMB_ITEM_ID);
    raidSession.beginRaidFromTown('central_castle');
    markBurgosObjectiveComplete(raidSession);

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.hasQuestItem(QUEST_BOMB_ITEM_ID), true);
    assert.deepEqual(getOutcome()?.questRewards ?? [], []);
});

test('raid gold rewards are secured only after survival', () => {
    const survived = createController();
    survived.raidSession.beginRaidFromTown('central_castle');
    survived.raidSession.addRaidGoldReward(300);

    survived.controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(survived.playerData.gold, 800);
    assert.equal(survived.raidSession.raidGoldReward, 0);
    assert.equal(survived.getOutcome()?.goldReward, 300);

    const failed = createController();
    failed.raidSession.beginRaidFromTown('central_castle');
    failed.raidSession.addRaidGoldReward(300);

    failed.controller.completeFailure('DEAD');

    assert.equal(failed.playerData.gold, 500);
    assert.equal(failed.raidSession.raidGoldReward, 0);
    assert.equal(failed.getOutcome()?.goldReward, undefined);
});

test('Burgos objective does not grant episode 1 reward on raid failure', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    raidSession.beginRaidFromTown('central_castle');
    markBurgosObjectiveComplete(raidSession);

    controller.completeFailure('DEAD');

    assert.equal(playerData.isCleared(MAIN_QUEST_EPISODE_01_ID), false);
    assert.equal(playerData.hasQuestItem(QUEST_BOMB_ITEM_ID), false);
    assert.equal(getOutcome()?.questRewards, undefined);
});

test('raid failure grants a basic recovery set instead of leaving the party empty', () => {
    const { controller, raidSession, party, gameManager, getOutcome } = createController();
    const hero = new Character('hero', 'Hero', 'infantry');
    party.addToRoster(hero);
    party.deployCharacter(hero);
    raidSession.beginRaidFromTown('central_castle');

    controller.completeFailure('DEAD');

    assert.equal(hero.equipment.get('weapon')?.item.id, 'short_sword');
    assert.equal(hero.equipment.has('shield'), false);
    assert.equal(hero.equipment.get('body')?.item.id, 'battle_t1_body');
    assert.deepEqual(gameManager.inventory.items.map((placed) => placed.item.id), ['herb_cheap', 'herb_cheap', 'mp_potion']);
    assert.ok(getOutcome()?.notes?.some((note) => note.includes('기본 보급품 지급')));
});

test('Burgos field event items are preserved as quest items only after survival', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    raidSession.beginRaidFromTown('central_castle');
    raidSession.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key');
    raidSession.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'cain_necklace');

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.hasQuestItem(BURGOS_KEY_ITEM_ID), true);
    assert.equal(playerData.hasQuestItem(CAIN_NECKLACE_ITEM_ID), true);
    assert.equal(playerData.isCleared(MAIN_QUEST_EPISODE_01_ID), false);
    assert.equal(playerData.hasQuestItem(QUEST_BOMB_ITEM_ID), false);
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('부르고스성 열쇠')));
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('케인의 목걸이')));
});

test('Burgos field event items are not preserved on raid failure', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    raidSession.beginRaidFromTown('central_castle');
    raidSession.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key');
    raidSession.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'cain_necklace');

    controller.completeFailure('DEAD');

    assert.equal(playerData.hasQuestItem(BURGOS_KEY_ITEM_ID), false);
    assert.equal(playerData.hasQuestItem(CAIN_NECKLACE_ITEM_ID), false);
    assert.equal(getOutcome()?.questRewards, undefined);
});

test('episode 2 quest is hidden until episode 1 is completed', () => {
    const playerData = new PlayerData();
    assert.deepEqual(getStoryQuestViews(playerData, null).map((view) => view.quest.id), [MAIN_QUEST_EPISODE_01_ID]);

    playerData.markCleared(MAIN_QUEST_EPISODE_01_ID);
    assert.deepEqual(
        getStoryQuestViews(playerData, null).map((view) => view.quest.id),
        [MAIN_QUEST_EPISODE_01_ID, MAIN_QUEST_EPISODE_02_ID]
    );
});

test('Burgos Cain necklace appears as an optional quest objective', () => {
    const playerData = new PlayerData();
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');

    const initial = getStoryQuestViews(playerData, raidSession).find((view) => view.quest.id === MAIN_QUEST_EPISODE_01_ID);
    assert.deepEqual(initial?.sideObjectives, [{
        labelKey: 'story.ep01.sideObjective.cainNecklace',
        completed: false,
    }]);

    raidSession.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'cain_necklace');
    const inRaid = getStoryQuestViews(playerData, raidSession).find((view) => view.quest.id === MAIN_QUEST_EPISODE_01_ID);
    assert.equal(inRaid?.sideObjectives[0]?.completed, true);

    const survived = new PlayerData();
    survived.addQuestItem(CAIN_NECKLACE_ITEM_ID);
    const persisted = getStoryQuestViews(survived, null).find((view) => view.quest.id === MAIN_QUEST_EPISODE_01_ID);
    assert.equal(persisted?.sideObjectives[0]?.completed, true);
});

test('Zamora objective grants episode 2 completion and cleric companion only after survival', () => {
    const { controller, playerData, raidSession, party, getOutcome } = createController();
    playerData.markCleared(MAIN_QUEST_EPISODE_01_ID);
    raidSession.beginRaidFromTown('central_castle');
    markZamoraObjectiveComplete(raidSession);

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.isCleared(MAIN_QUEST_EPISODE_02_ID), true);
    assert.equal(playerData.hasStoryCompanion(STORY_CLERIC_EP02_ID), true);
    assert.equal(party.getRoster().filter((character) => character.id === STORY_CLERIC_EP02_ID).length, 1);
    assert.equal(party.getCharacters().some((character) => character.id === STORY_CLERIC_EP02_ID), false);
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('2화')));
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('클레릭')));
});

test('completed episode 2 does not grant duplicate cleric companions', () => {
    const { controller, playerData, raidSession, party, getOutcome } = createController();
    playerData.markCleared(MAIN_QUEST_EPISODE_01_ID);
    playerData.markCleared(MAIN_QUEST_EPISODE_02_ID);
    playerData.addStoryCompanion(STORY_CLERIC_EP02_ID);
    raidSession.beginRaidFromTown('central_castle');
    markZamoraObjectiveComplete(raidSession);

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.hasStoryCompanion(STORY_CLERIC_EP02_ID), true);
    assert.equal(party.getRoster().filter((character) => character.id === STORY_CLERIC_EP02_ID).length, 0);
    assert.deepEqual(getOutcome()?.questRewards ?? [], []);
});

test('Zamora objective does not grant episode 2 reward on raid failure', () => {
    const { controller, playerData, raidSession, party, getOutcome } = createController();
    playerData.markCleared(MAIN_QUEST_EPISODE_01_ID);
    raidSession.beginRaidFromTown('central_castle');
    markZamoraObjectiveComplete(raidSession);

    controller.completeFailure('DEAD');

    assert.equal(playerData.isCleared(MAIN_QUEST_EPISODE_02_ID), false);
    assert.equal(playerData.hasStoryCompanion(STORY_CLERIC_EP02_ID), false);
    assert.equal(party.getRoster().some((character) => character.id === STORY_CLERIC_EP02_ID), false);
    assert.equal(getOutcome()?.questRewards, undefined);
});

test('episode 3 sacred sword falls back to stash when backpack is full', () => {
    const { controller, playerData, raidSession, gameManager, getOutcome } = createController();
    const episode3 = STORY_QUESTS.find((quest) => quest.episode === 3);
    const filler = getItemDef('herb_cheap');
    assert.ok(episode3);
    assert.ok(filler);
    playerData.markCleared(MAIN_QUEST_EPISODE_01_ID);
    playerData.markCleared(MAIN_QUEST_EPISODE_02_ID);
    for (let y = 0; y < gameManager.inventory.height; y++) {
        for (let x = 0; x < gameManager.inventory.width; x++) {
            assert.ok(gameManager.inventory.place(filler, x, y));
        }
    }
    raidSession.beginRaidFromTown('central_castle');
    markStoryObjectiveComplete(raidSession, episode3.dungeonId);

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.hasQuestItem('quest_sacred_sword'), true);
    assert.equal(gameManager.inventory.items.some((placed) => placed.item.id === 'quest_sacred_sword'), false);
    assert.equal(gameManager.stash.items.some((placed) => placed.item.id === 'quest_sacred_sword'), true);
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('보검')));
});

test('episode 31 objective grants final implemented quest completion only after survival', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    const episode31 = STORY_QUESTS.find((quest) => quest.episode === 31);
    assert.ok(episode31);
    for (const quest of STORY_QUESTS.filter((candidate) => candidate.episode < 31)) {
        playerData.markCleared(quest.id);
    }
    raidSession.beginRaidFromTown('central_castle');
    markStoryObjectiveComplete(raidSession, episode31.dungeonId);

    controller.completeSuccess(DESTINATION_TOWN);

    assert.equal(playerData.isCleared(episode31.id), true);
    assert.equal(getStoryQuestViews(playerData, null).find((view) => view.quest.id === episode31.id)?.status, 'completed');
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('31화')));
    assert.ok(getOutcome()?.questRewards?.some((line) => line.includes('없음')));

    const failed = createController();
    for (const quest of STORY_QUESTS.filter((candidate) => candidate.episode < 31)) {
        failed.playerData.markCleared(quest.id);
    }
    failed.raidSession.beginRaidFromTown('central_castle');
    markStoryObjectiveComplete(failed.raidSession, episode31.dungeonId);

    failed.controller.completeFailure('DEAD');

    assert.equal(failed.playerData.isCleared(episode31.id), false);
    assert.equal(failed.getOutcome()?.questRewards, undefined);
});

test('story objectives 1 through 31 grant quest completion once after survival', () => {
    for (const quest of STORY_QUESTS) {
        const { controller, playerData, raidSession, getOutcome } = createController();
        for (const previousQuest of STORY_QUESTS.filter((candidate) => candidate.episode < quest.episode)) {
            playerData.markCleared(previousQuest.id);
        }

        raidSession.beginRaidFromTown('central_castle');
        markStoryObjectiveComplete(raidSession, quest.dungeonId);
        controller.completeSuccess(DESTINATION_TOWN);

        assert.equal(playerData.isCleared(quest.id), true, `episode ${quest.episode} completion`);
        assert.equal(isStoryRewardOwned(quest.reward, playerData), true, `episode ${quest.episode} reward ownership`);
        assert.equal(
            getStoryQuestViews(playerData, null).find((view) => view.quest.id === quest.id)?.status,
            'completed',
            `episode ${quest.episode} quest view`
        );
        assert.ok(getOutcome()?.questRewards?.some((line) => line.includes(`${quest.episode}화`)), `episode ${quest.episode} reward line`);

        const rewardLineCount = getOutcome()?.questRewards?.length ?? 0;
        raidSession.beginRaidFromTown('central_castle');
        markStoryObjectiveComplete(raidSession, quest.dungeonId);
        controller.completeSuccess(DESTINATION_TOWN);

        assert.equal(playerData.isCleared(quest.id), true, `episode ${quest.episode} duplicate completion`);
        assert.equal(getOutcome()?.questRewards?.length ?? 0, 0, `episode ${quest.episode} duplicate rewards`);
        assert.ok(rewardLineCount > 0, `episode ${quest.episode} first reward lines`);
    }
});
