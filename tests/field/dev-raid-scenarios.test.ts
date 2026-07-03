import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameManager } from '../../src/engine/GameManager';
import { WorldEngine } from '../../src/engine/WorldEngine';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import {
    applyDevRaidScenario,
    DEV_LATE_STORY_EPISODES,
    DEV_STORY_EPISODES,
    DEV_STORY_INTERIOR_EPISODES,
    parseDevRaidScenario,
} from '../../src/dev/DevRaidScenarios';

type MockDevStatusElement = {
    className: string;
    dataset: Record<string, string>;
    textContent: string | null;
};

function withMockDocument<T>(run: (getStatus: () => MockDevStatusElement | null) => T): T {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const elements: MockDevStatusElement[] = [];
    const documentMock = {
        querySelector: (selector: string) => {
            if (selector !== '.dev-scenario-status') return null;
            return elements.find((element) => element.className === 'dev-scenario-status') ?? null;
        },
        createElement: (tag: string) => {
            assert.equal(tag, 'div');
            return { className: '', dataset: {}, textContent: null };
        },
        body: {
            appendChild: (element: MockDevStatusElement) => {
                elements.push(element);
                return element;
            },
        },
    };

    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: documentMock,
    });

    try {
        return run(() => documentMock.querySelector('.dev-scenario-status'));
    } finally {
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
        else Reflect.deleteProperty(globalThis, 'document');
    }
}

function createActor() {
    const entity = {
        gridX: 14,
        gridY: 32,
        pixelX: 14,
        pixelY: 32,
        actionGauge: 75,
        setGridPosition(gridX: number, gridY: number) {
            this.gridX = gridX;
            this.gridY = gridY;
            this.pixelX = gridX;
            this.pixelY = gridY;
        },
    };
    return {
        id: 'dev-hero',
        character: { stats: { hp: 110 }, isDead: false },
        entity,
        path: [{ x: 13, y: 32 }],
        queuedIntent: { type: 'move' },
    };
}

function createManagerHarness() {
    const actor = createActor();
    const logs: string[] = [];
    const selected: { actorId?: string | null; lootId?: string } = {};
    const inventory = {
        activeCharacter: null as unknown,
        externalGrid: null as unknown,
        externalLabel: '',
        externalOptions: null as unknown,
        visible: false,
        toggleCalls: 0,
        setActiveCharacter(character: unknown) {
            this.activeCharacter = character;
        },
        setExternalGrid(grid: unknown, label: string, options: unknown) {
            this.externalGrid = grid;
            this.externalLabel = label;
            this.externalOptions = options;
        },
        isVisible() {
            return this.visible;
        },
        toggle() {
            this.toggleCalls += 1;
            this.visible = !this.visible;
        },
    };
    const world = {
        partyActors: [actor],
        fieldEnemies: [],
        worldMap: {
            loot: [] as Array<{ id: string; inventory: unknown }>,
            isWalkable: () => true,
            getDungeons: () => STORY_SCENARIOS
                .map((scenario) => ({
                    id: scenario.dungeonId,
                    nameKr: scenario.dungeonNameKr,
                    chunkX: scenario.chunkX,
                    chunkY: scenario.chunkY,
                    sprite: scenario.sprite,
                    tileSpan: 3,
                    tileRadius: 1,
                })),
        },
        actionControllers: {
            selectionController: {
                selectActor: (actorId: string | null) => { selected.actorId = actorId; },
                selectLoot: (lootId: string) => { selected.lootId = lootId; },
            },
        },
        scenarioNetworkControllers: {
            storyScenarioController: {
                started: null as null | { dungeonId: string; questId: string },
                startedScenario: null as null | { dungeonId: string; questId: string },
                startLocalStoryScenarioDungeon(dungeon: { id: string }, storyQuest: { id: string }) {
                    this.startedScenario = { dungeonId: dungeon.id, questId: storyQuest.id };
                    if (STORY_SCENARIOS.find((scenario) => scenario.dungeonId === dungeon.id)?.missionKind === 'soloInterior') {
                        this.startLocalStoryInteriorDungeon(dungeon, storyQuest);
                    }
                },
                startLocalStoryInteriorDungeon(dungeon: { id: string }, storyQuest: { id: string }) {
                    this.started = { dungeonId: dungeon.id, questId: storyQuest.id };
                },
            },
        },
        clearFieldTurnStateCalls: 0,
        clearFieldTurnState() {
            this.clearFieldTurnStateCalls += 1;
        },
        closeNetworkRaidClientCalls: 0,
        closeNetworkRaidClient(sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') {
            assert.equal(sendLeave, true);
            assert.equal(reason, 'manual');
            this.closeNetworkRaidClientCalls += 1;
        },
        addCombatLog(message: string) {
            logs.push(message);
        },
        currentPhase: 'town',
        isNetworkRaid: true,
        networkRaidClient: { stale: true } as unknown,
        player: actor.entity,
        activeTurnActorId: 'stale-turn',
        readyQueue: ['stale-enemy'],
    };
    const manager = { worldEngine: world, inventoryUI: inventory };
    return { actor, inventory, logs, manager: manager as unknown as GameManager, selected, world };
}

test('dev raid scenario parser accepts implemented story episodes through episode 31 only', () => {
    const runtimeStoryEpisodes = STORY_SCENARIOS.map((scenario) => scenario.episode);
    assert.deepEqual([...DEV_STORY_EPISODES], runtimeStoryEpisodes);
    assert.deepEqual(runtimeStoryEpisodes, Array.from({ length: 31 }, (_, index) => index + 1));
    assert.deepEqual([...DEV_STORY_INTERIOR_EPISODES], [1, 2, 3, 7, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
    assert.deepEqual([...DEV_LATE_STORY_EPISODES], [23, 24, 25, 26, 27, 28, 29, 30, 31]);
    assert.equal(parseDevRaidScenario('aggro'), 'aggro');
    assert.equal(parseDevRaidScenario('loot'), 'loot');
    for (const episode of DEV_STORY_EPISODES) {
        assert.equal(parseDevRaidScenario(`story${episode}`), `story${episode}`);
    }
    assert.equal(parseDevRaidScenario('story32'), null);
    assert.equal(parseDevRaidScenario('storyxx'), null);
});

test('package scripts expose a generic data-driven story dev entry without numbered aliases', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    assert.equal(packageJson.scripts['dev:raid:story'], 'node scripts/dev-town.mjs raid');
    assert.equal(packageJson.scripts['dev:tutorial'], 'node scripts/dev-town.mjs tutorial');
    const numberedStoryScripts = Object.keys(packageJson.scripts).filter((key) => /^dev:raid:story\d+$/.test(key));
    assert.deepEqual(numberedStoryScripts, []);
});

test('dev town launcher forwards each implemented story scenario to the open URL', async () => {
    const helper = await import(pathToFileURL(resolve('scripts/dev-town.mjs')).href) as {
        buildDevOpenPath: (modeArg: string, scenarioArg?: string | null) => string;
        normalizeDevModeArg: (modeArg: string | null) => string;
        normalizeDevScenarioArg: (scenarioArg: string | null) => string | null;
    };
    assert.equal(helper.normalizeDevModeArg(null), 'town');
    assert.equal(helper.normalizeDevModeArg('tutorial'), 'tutorial');
    assert.equal(helper.buildDevOpenPath('tutorial', 'loot'), '/?devStart=tutorial');
    assert.equal(helper.buildDevOpenPath('raid', 'aggro'), '/?devStart=raid&devScenario=aggro');
    assert.equal(helper.buildDevOpenPath('raid', 'loot'), '/?devStart=raid&devScenario=loot');
    for (const episode of DEV_STORY_EPISODES) {
        assert.equal(helper.normalizeDevScenarioArg(`story${episode}`), `story${episode}`);
        assert.equal(
            helper.buildDevOpenPath('raid', `story${episode}`),
            `/?devStart=raid&devScenario=story${episode}`,
            `episode ${episode} open path`
        );
    }
    assert.equal(helper.normalizeDevScenarioArg('story32'), null);
    assert.equal(helper.buildDevOpenPath('raid', 'story32'), '/?devStart=raid');
});

test('WorldEngine close hook delegates to the raid lifecycle controller', () => {
    const calls: Array<{ sendLeave: boolean; reason: string | undefined }> = [];
    const engine = Object.create(WorldEngine.prototype) as unknown as {
        closeNetworkRaidClient: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => void;
        raidLifecycleControllers: {
            raidLifecycleController: {
                closeNetworkRaidClient: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => void;
            };
        };
    };
    engine.raidLifecycleControllers = {
        raidLifecycleController: {
            closeNetworkRaidClient: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => {
                calls.push({ sendLeave, reason });
            },
        },
    };

    engine.closeNetworkRaidClient(true, 'manual');

    assert.deepEqual(calls, [{ sendLeave: true, reason: 'manual' }]);
});

test('dev story31 scenario launches local Demon Fixer Den without network raid state', () => {
    const { actor, inventory, logs, manager, world } = createManagerHarness();

    applyDevRaidScenario(manager, 'story31');

    assert.equal(world.closeNetworkRaidClientCalls, 2);
    assert.equal(world.currentPhase, 'raid');
    assert.equal(world.isNetworkRaid, false);
    assert.equal(world.networkRaidClient, null);
    assert.equal(inventory.activeCharacter, actor.character);
    assert.deepEqual(world.scenarioNetworkControllers.storyScenarioController.started, {
        dungeonId: 'demon_fixers_den',
        questId: 'main:episode_31_demon_fixers',
    });
    assert.deepEqual(world.scenarioNetworkControllers.storyScenarioController.startedScenario, {
        dungeonId: 'demon_fixers_den',
        questId: 'main:episode_31_demon_fixers',
    });
    assert.equal(logs.length, 1);
});

test('dev story scenarios launch local starts through episode 31', () => {
    withMockDocument((getStatus) => {
        for (const episode of DEV_STORY_EPISODES) {
            const { logs, manager, world } = createManagerHarness();
            const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
            const scenarioId = parseDevRaidScenario(`story${episode}`);
            assert.ok(scenario);
            assert.ok(scenarioId);

            applyDevRaidScenario(manager, scenarioId);

            assert.equal(world.currentPhase, 'raid', `episode ${episode} phase`);
            assert.equal(world.isNetworkRaid, false, `episode ${episode} network raid`);
            assert.equal(world.networkRaidClient, null, `episode ${episode} network client`);
            assert.deepEqual(world.scenarioNetworkControllers.storyScenarioController.startedScenario, {
                dungeonId: scenario.dungeonId,
                questId: scenario.questId,
            }, `episode ${episode} story start`);
            if (scenario.missionKind === 'soloInterior') {
                assert.deepEqual(world.scenarioNetworkControllers.storyScenarioController.started, {
                    dungeonId: scenario.dungeonId,
                    questId: scenario.questId,
                }, `episode ${episode} interior start`);
            } else {
                assert.equal(
                    world.scenarioNetworkControllers.storyScenarioController.started,
                    null,
                    `episode ${episode} should not start an interior`
                );
            }
            assert.equal(logs.length, 1, `episode ${episode} dev log`);
            assert.match(logs[0], new RegExp(`${episode}화|Episode ${episode}`), `episode ${episode} log text`);

            const status = getStatus();
            assert.ok(status, `episode ${episode} dev status`);
            assert.equal(status.dataset.scenario, scenarioId, `episode ${episode} dev status scenario`);
            const expectedStatus = scenario.missionKind === 'soloInterior' ? 'interior-ready' : 'scenario-ready';
            assert.equal(status.dataset.state, expectedStatus, `episode ${episode} dev status state`);
            assert.equal(status.textContent?.includes(`${scenarioId} / ${expectedStatus}`), true, `episode ${episode} dev status text`);
        }
    });
});

test('dev loot scenario enables the raid loot client path without getNetworkRaidState', () => {
    const { actor, inventory, manager, selected, world } = createManagerHarness();

    applyDevRaidScenario(manager, 'loot');

    assert.equal(world.currentPhase, 'raid');
    assert.equal(world.isNetworkRaid, true);
    assert.ok(world.networkRaidClient);
    assert.deepEqual(world.partyActors, [actor]);
    assert.equal(world.fieldEnemies.length, 0);
    assert.equal(world.clearFieldTurnStateCalls, 1);
    assert.equal(world.worldMap.loot.length, 1);
    assert.equal(world.worldMap.loot[0].id, 'dev_raid_loot');
    assert.equal(selected.lootId, 'dev_raid_loot');
    assert.deepEqual(inventory.externalOptions, { isRaidLoot: true });
    assert.equal(inventory.toggleCalls, 1);

    const client = world.networkRaidClient as { sendLootPickup: (lootId: string, gridX: number, gridY: number) => string };
    assert.match(client.sendLootPickup('dev_raid_loot', 0, 0), /^dev-loot-/);
});
