import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GameManager } from '../../src/engine/GameManager';
import { WorldEngine } from '../../src/engine/WorldEngine';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { applyDevRaidScenario, DEV_LATE_STORY_EPISODES, parseDevRaidScenario } from '../../src/dev/DevRaidScenarios';

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
                .filter((scenario) => scenario.episode >= 23 && scenario.episode <= 31)
                .map((scenario) => ({
                    id: scenario.dungeonId,
                    nameKr: scenario.dungeonNameKr,
                    x: scenario.chunkX * 16,
                    y: scenario.chunkY * 16,
                })),
        },
        selectionController: {
            selectActor: (actorId: string | null) => { selected.actorId = actorId; },
            selectLoot: (lootId: string) => { selected.lootId = lootId; },
        },
        storyScenarioController: {
            started: null as null | { dungeonId: string; questId: string },
            startLocalStoryInteriorDungeon(dungeon: { id: string }, storyQuest: { id: string }) {
                this.started = { dungeonId: dungeon.id, questId: storyQuest.id };
            },
        },
        clearFieldTurnStateCalls: 0,
        clearFieldTurnState() {
            this.clearFieldTurnStateCalls += 1;
        },
        closeNetworkRaidClientCalls: 0,
        closeNetworkRaidClient(sendLeave: boolean) {
            assert.equal(sendLeave, false);
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

test('dev raid scenario parser accepts late story interiors 23 through 31 only', () => {
    assert.deepEqual([...DEV_LATE_STORY_EPISODES], [23, 24, 25, 26, 27, 28, 29, 30, 31]);
    assert.equal(parseDevRaidScenario('aggro'), 'aggro');
    assert.equal(parseDevRaidScenario('loot'), 'loot');
    for (const episode of DEV_LATE_STORY_EPISODES) {
        assert.equal(parseDevRaidScenario(`story${episode}`), `story${episode}`);
    }
    assert.equal(parseDevRaidScenario('story22'), null);
    assert.equal(parseDevRaidScenario('story32'), null);
    assert.equal(parseDevRaidScenario('storyxx'), null);
});

test('package scripts expose each late story dev entry through episode 31', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    for (const episode of DEV_LATE_STORY_EPISODES) {
        assert.equal(
            packageJson.scripts[`dev:raid:story${episode}`],
            `node scripts/dev-town.mjs raid story${episode}`,
            `episode ${episode} dev script`
        );
    }
});

test('WorldEngine close hook delegates to the raid lifecycle controller', () => {
    const calls: Array<{ sendLeave: boolean; reason: string | undefined }> = [];
    const engine = Object.create(WorldEngine.prototype) as unknown as {
        closeNetworkRaidClient: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => void;
        raidLifecycleController: { closeNetworkRaidClient: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => void };
    };
    engine.raidLifecycleController = {
        closeNetworkRaidClient: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => {
            calls.push({ sendLeave, reason });
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
    assert.deepEqual(world.storyScenarioController.started, {
        dungeonId: 'demon_fixers_den',
        questId: 'main:episode_31_demon_fixers',
    });
    assert.equal(logs.length, 1);
});

test('dev late story scenarios launch local interiors through episode 31', () => {
    withMockDocument((getStatus) => {
        for (const episode of DEV_LATE_STORY_EPISODES) {
            const { logs, manager, world } = createManagerHarness();
            const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
            const scenarioId = parseDevRaidScenario(`story${episode}`);
            assert.ok(scenario);
            assert.ok(scenarioId);

            applyDevRaidScenario(manager, scenarioId);

            assert.equal(world.currentPhase, 'raid', `episode ${episode} phase`);
            assert.equal(world.isNetworkRaid, false, `episode ${episode} network raid`);
            assert.equal(world.networkRaidClient, null, `episode ${episode} network client`);
            assert.deepEqual(world.storyScenarioController.started, {
                dungeonId: scenario.dungeonId,
                questId: scenario.questId,
            }, `episode ${episode} story start`);
            assert.equal(logs.length, 1, `episode ${episode} dev log`);
            assert.match(logs[0], new RegExp(`${episode}화|Episode ${episode}`), `episode ${episode} log text`);

            const status = getStatus();
            assert.ok(status, `episode ${episode} dev status`);
            assert.equal(status.dataset.scenario, scenarioId, `episode ${episode} dev status scenario`);
            assert.equal(status.dataset.state, 'interior-ready', `episode ${episode} dev status state`);
            assert.equal(status.textContent?.includes(`${scenarioId} / interior-ready`), true, `episode ${episode} dev status text`);
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
