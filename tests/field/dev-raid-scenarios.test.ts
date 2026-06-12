import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameManager } from '../../src/engine/GameManager';
import { WorldEngine } from '../../src/engine/WorldEngine';
import { applyDevRaidScenario } from '../../src/dev/DevRaidScenarios';

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
            getDungeons: () => [{ id: 'demon_fixers_den', nameKr: '마계 해결사의 소굴', x: 1198, y: 1439 }],
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
