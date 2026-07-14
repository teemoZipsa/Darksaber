import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { PartyManager } from '../../src/character/PartyManager';
import { createStatus } from '../../src/combat/StatusEffects';
import { getItemDef } from '../../src/data/ItemDB';
import { getStoryScenarioByDungeonId, type StoryScenarioDefinition } from '../../src/data/StoryScenarioData';
import { Enemy } from '../../src/entity/Enemy';
import { LootObject } from '../../src/entity/LootObject';
import { Player } from '../../src/entity/Player';
import { WorldCombatController } from '../../src/engine/world/WorldCombatController';
import { WorldLootController, type WorldLootContext } from '../../src/engine/world/WorldLootController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import { WorldRestingController } from '../../src/engine/world/WorldRestingController';
import {
    WorldStoryScenarioController,
    type WorldStoryScenarioContext,
} from '../../src/engine/world/WorldStoryScenarioController';
import { WorldTempleController, type WorldTempleContext } from '../../src/engine/world/WorldTempleController';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import { i18n } from '../../src/i18n/LanguageManager';
import { GridInventory, type PlacedItem } from '../../src/inventory/GridInventory';
import { WorldMap } from '../../src/map/WorldMap';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function inEnglish(run: () => void): void {
    const previous = i18n.lang;
    try {
        i18n.lang = 'en';
        run();
    } finally {
        i18n.lang = previous;
    }
}

function createActor(name = 'Hero', x = 0, y = 0): FieldActor {
    const character = new Character(`actor-${name}`, name, 'infantry');
    return {
        id: character.id,
        character,
        entity: new Player(x, y),
        path: [],
        queuedIntent: null,
    };
}

test('world names and map landmarks follow the selected language', () => {
    inEnglish(() => {
        const mortal = new WorldMap('mortal');
        const labels = mortal.getMapLandmarks().map((landmark) => landmark.label);

        assert.equal(mortal.getDisplayName(), 'Mortal World');
        assert.ok(labels.includes('Kaosia'));
        assert.ok(labels.includes('Fusion Temple'));
        assert.ok(labels.includes('Beginner Mine'));
        assert.ok(labels.includes('Burgos Castle'));

        const master = new WorldMap('master');
        assert.equal(master.getDisplayName(), 'Master World');
        assert.ok(master.getMapLandmarks().some((landmark) => landmark.label === 'Mortal Gate'));
    });
});

test('story entry and rejection logs use English dungeon names and messages', () => {
    inEnglish(() => {
        const world = new WorldMap();
        const actor = createActor();
        const logs: string[] = [];
        let nextIntent = 0;
        const controller = new WorldStoryScenarioController({
            getControlledActor: () => actor,
            getWorldMap: () => world,
            getNetworkRaidClient: () => ({
                sendScenarioEnter: () => `scenario-${++nextIntent}`,
            }),
            log: (message: string) => logs.push(message),
        } as unknown as WorldStoryScenarioContext);

        const burgos = world.getDungeons().find((dungeon) => dungeon.id === 'burgos_castle');
        const arcadia = world.getDungeons().find((dungeon) => dungeon.id === 'arcadia_plain');
        assert.ok(burgos);
        assert.ok(arcadia);

        controller.enterNetworkStoryDungeon(burgos);
        assert.equal(logs[logs.length - 1], 'Requesting server scenario entry for Burgos Castle.');
        assert.equal(controller.handleNetworkActionRejected('scenario-1', 'blocked'), true);
        assert.equal(logs[logs.length - 1], 'Scenario entry failed: blocked');

        controller.enterStoryDungeon(arcadia);
        assert.equal(logs[logs.length - 1], 'Arcadia Plain can be entered after transferring to a server session.');

        const scenario = getStoryScenarioByDungeonId('burgos_castle');
        assert.ok(scenario);
        const localizedSpawnController = new WorldStoryScenarioController({
            getWorldMap: () => world,
            getFieldEnemies: () => [],
            applyMonsterSprite: () => undefined,
        } as unknown as WorldStoryScenarioContext);
        const enemies = (localizedSpawnController as unknown as {
            createScenarioEnemies(
                definition: StoryScenarioDefinition,
                anchor: { x: number; y: number },
            ): FieldEnemy[];
        }).createScenarioEnemies(scenario, world.getDungeonEntranceTile(burgos));
        assert.ok(enemies.some((entry) => entry.enemy.name === 'Kisra'));
        assert.equal(enemies.some((entry) => /[가-힣]/.test(entry.enemy.name)), false);
    });
});

test('field rest, temple, loot, and equipment logs use localized text', () => {
    inEnglish(() => {
        const actor = createActor();
        const restLogs: string[] = [];
        actor.character.statuses = [createStatus('resting', { sourceType: 'rest' })];
        const resting = new WorldRestingController({
            getPartyActors: () => [actor],
            spawnHeal: () => undefined,
            spawnStatus: () => undefined,
            spawnHealEffect: () => undefined,
            log: (message) => restLogs.push(message),
        });
        resting.update(0);
        assert.deepEqual(restLogs, ['Hero: rest complete']);

        const world = new WorldMap();
        const templeTile = world.getPrimaryTempleTile();
        actor.entity.setGridPosition(templeTile.x, templeTile.y);
        const party = new PartyManager();
        party.addToRoster(actor.character);
        party.deployCharacter(actor.character);
        const templeLogs: string[] = [];
        let templeVisible = false;
        const temple = new WorldTempleController({
            party,
            raidSession: new WorldRaidSession('central_castle'),
            fusionTempleUI: {
                onFuse: null,
                onEnterMasterWorld: null,
                onReturnToMortalWorld: null,
                onClose: null,
                isVisible: () => templeVisible,
                show: () => { templeVisible = true; },
            },
            getWorldMap: () => world,
            getControlledActor: () => actor,
            getFieldEnemies: () => [],
            closeFieldOverlays: () => undefined,
            clearFieldTurnState: () => undefined,
            log: (message: string) => templeLogs.push(message),
        } as unknown as WorldTempleContext);
        temple.checkArrival();
        assert.equal(templeLogs[templeLogs.length - 1], 'Entered the fusion temple.');

        const lootLogs: string[] = [];
        const bag = new GridInventory(4, 4);
        let localLootEnabled = false;
        let externalGridTitle = '';
        const lootController = new WorldLootController({
            gameManager: {
                inventoryUI: {
                    onRaidLootSecured: null,
                    getBag: () => bag,
                    setExternalGrid: (_inventory: GridInventory, title: string) => { externalGridTitle = title; },
                    isVisible: () => true,
                    toggle: () => undefined,
                },
            },
            selectionController: {
                lootId: null,
                selectLoot: () => undefined,
            },
            storyScenarioController: { getActiveInterior: () => null },
            networkSyncController: {
                addPendingLootPick: () => undefined,
                purgeStaleLootPicks: () => undefined,
            },
            getWorldMap: () => world,
            isNetworkRaid: () => false,
            isLocalLootEnabled: () => localLootEnabled,
            getNetworkRaidClient: () => null,
            getControlledActor: () => actor,
            clearControlledPath: () => undefined,
            log: (message: string) => lootLogs.push(message),
        } as unknown as WorldLootContext);
        lootController.spawnEnemyLoot(new Enemy('ash-guard', 0, 0, 'Ash Guard', 1));
        assert.equal(lootLogs[lootLogs.length - 1], 'Ash Guard Loot auto-collected: Common Herb');

        const groundLoot = new LootObject('ash-loot', 0, 0, [], {
            sourceLabel: '스켈레톤 궁수 전리품',
        });
        lootController.openLoot(groundLoot);
        assert.equal(lootLogs[lootLogs.length - 1], 'Loot can only be opened in a server session.');
        localLootEnabled = true;
        lootController.openLoot(groundLoot);
        assert.equal(lootLogs[lootLogs.length - 1], 'Searching Skeleton Archer loot.');
        assert.equal(externalGridTitle, 'Skeleton Archer loot');

        const combatLogs: string[] = [];
        const combat = new WorldCombatController({
            log: (message) => combatLogs.push(message),
            spawnDamage: () => undefined,
            spawnStatus: () => undefined,
            spawnHitEffect: () => undefined,
            spawnKillEffect: () => undefined,
            spawnAttackCue: () => undefined,
            spawnLoot: () => undefined,
        });
        const item = getItemDef('short_sword');
        assert.ok(item);
        const broken: PlacedItem = {
            item,
            gridX: 0,
            gridY: 0,
            durability: 0,
            quantity: 1,
        };
        (combat as unknown as {
            logBrokenEquipment(characterName: string, placed: PlacedItem | null): void;
        }).logBrokenEquipment('Hero', broken);
        assert.equal(combatLogs[combatLogs.length - 1], 'Hero: Short Sword durability 0 - equipment effect disabled');
    });
});
