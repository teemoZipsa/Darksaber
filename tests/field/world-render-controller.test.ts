import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerData } from '../../src/data/PlayerData';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { getStoryInteriorLayout } from '../../src/data/StoryInteriorData';
import { Player } from '../../src/entity/Player';
import { StoryInteriorMap } from '../../src/map/StoryInteriorMap';
import { WorldRenderController } from '../../src/engine/world/WorldRenderController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import type { WorldRenderModel } from '../../src/engine/world/WorldRenderModel';
import { t } from '../../src/i18n/LanguageManager';

function buildStoryInteriorRenderModel(dungeonId: string): WorldRenderModel {
    const layout = getStoryInteriorLayout(dungeonId);
    assert.ok(layout);
    const worldMap = new StoryInteriorMap(layout);
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    raidSession.startDungeonEncounter(dungeonId);
    const player = new Player(layout.playerStart.x, layout.playerStart.y);
    const controller = new WorldRenderController({
        party: { getActive: () => null } as any,
        playerData: new PlayerData(),
        getWorldMap: () => worldMap as any,
        townSession: { isVisible: () => false, render: () => undefined } as any,
        raidSession,
        fusionTempleUI: { isVisible: () => false, render: () => undefined } as any,
        actionMenuUI: { getIsOpen: () => false, render: () => undefined } as any,
        entityInfoUI: { render: () => undefined } as any,
        effectManager: { render: () => undefined } as any,
        floatingText: { render: () => undefined } as any,
        minimapUI: { render: () => undefined } as any,
        magicController: { getState: () => ({ visible: false }), isVisible: () => false, render: () => undefined } as any,
        toolController: { isVisible: () => false, render: () => undefined } as any,
        playerActionController: { getMode: () => null, getTiles: () => new Set<string>() } as any,
        raidOutcomeController: { isVisible: () => false, render: () => undefined } as any,
        tacticalController: { getMarkers: () => [], render: () => undefined } as any,
        selectionController: {
            actorId: null,
            enemyId: null,
            lootId: null,
            getSelectedDisplayInfo: () => null,
            hasSelection: () => false,
        } as any,
        getWorldTime: () => 0,
        getPhase: () => 'raid',
        getPlayer: () => player,
        getControlledActor: () => null,
        getPartyActors: () => [],
        getTutorialActors: () => [],
        getFieldEnemies: () => [
            { enemy: { stats: { hp: 1 } } },
            { enemy: { stats: { hp: 0 } } },
        ] as any,
        getActiveTurnActorId: () => null,
        getRemainingActionPoints: () => 0,
        getMajorActionUsedThisTurn: () => false,
        getHoverTile: () => ({ x: -1, y: -1 }),
        getPathPreviewTiles: () => [],
        getAttackCues: () => [],
        getCombatLog: () => [],
        getActorTerrainTraits: () => ({}),
        isTurnCombatActive: () => false,
    });

    return (controller as unknown as { buildRenderModel: () => WorldRenderModel }).buildRenderModel();
}

test('late story interiors expose dedicated objective HUD models through episode 31', () => {
    for (let episode = 23; episode <= 31; episode++) {
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `missing episode ${episode}`);
        const layout = getStoryInteriorLayout(scenario.dungeonId);
        assert.ok(layout, `missing layout ${episode}`);

        const model = buildStoryInteriorRenderModel(scenario.dungeonId);

        assert.equal(model.storyInterior.active, true, `episode ${episode} active`);
        assert.equal(model.storyInterior.dungeonId, scenario.dungeonId, `episode ${episode} dungeon`);
        assert.equal(model.storyInterior.objectiveKey, layout.objectiveKey, `episode ${episode} objective key`);
        assert.equal(
            model.storyInterior.objectiveKey,
            `story.interior.${scenario.dungeonId}.objective`,
            `episode ${episode} dedicated objective key`
        );
        assert.notEqual(t(model.storyInterior.objectiveKey), model.storyInterior.objectiveKey, `episode ${episode} localized objective`);
        assert.equal(model.storyInterior.title, new StoryInteriorMap(layout).getDisplayName(), `episode ${episode} title`);
        assert.equal(model.storyInterior.enemiesLeft, 1, `episode ${episode} live enemy count`);
    }
});
