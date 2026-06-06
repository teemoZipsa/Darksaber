import test from 'node:test';
import assert from 'node:assert/strict';
import { PartyManager } from '../../src/character/PartyManager';
import type { GameManager } from '../../src/engine/GameManager';
import { WorldRaidOutcomeController, type WorldRaidOutcomeContext } from '../../src/engine/world/WorldRaidOutcomeController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import type { WorldTownSession } from '../../src/engine/world/WorldTownSession';
import { GridInventory } from '../../src/inventory/GridInventory';
import type { TownInfo } from '../../src/map/BiomeMask';
import type { RaidOutcome } from '../../src/raid/RaidOutcome';
import { PlayerData } from '../../src/data/PlayerData';
import { BURGOS_CASTLE_DUNGEON_ID, ZAMORA_FORTRESS_DUNGEON_ID } from '../../src/data/MonsterCatalog';
import {
    MAIN_QUEST_EPISODE_01_ID,
    MAIN_QUEST_EPISODE_02_ID,
    QUEST_BOMB_ITEM_ID,
    STORY_CLERIC_EP02_ID,
    getStoryQuestViews,
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

const BURGOS_KEY_ITEM_ID = 'quest_burgos_key';
const CAIN_NECKLACE_ITEM_ID = 'quest_cain_necklace';

function markBurgosObjectiveComplete(raidSession: WorldRaidSession): void {
    raidSession.startDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
    raidSession.completeDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
}

function markZamoraObjectiveComplete(raidSession: WorldRaidSession): void {
    raidSession.startDungeonEncounter(ZAMORA_FORTRESS_DUNGEON_ID);
    raidSession.completeDungeonEncounter(ZAMORA_FORTRESS_DUNGEON_ID);
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

    return { controller, playerData, raidSession, party, getOutcome };
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

test('Burgos objective does not grant episode 1 reward on raid failure', () => {
    const { controller, playerData, raidSession, getOutcome } = createController();
    raidSession.beginRaidFromTown('central_castle');
    markBurgosObjectiveComplete(raidSession);

    controller.completeFailure('DEAD');

    assert.equal(playerData.isCleared(MAIN_QUEST_EPISODE_01_ID), false);
    assert.equal(playerData.hasQuestItem(QUEST_BOMB_ITEM_ID), false);
    assert.equal(getOutcome()?.questRewards, undefined);
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
