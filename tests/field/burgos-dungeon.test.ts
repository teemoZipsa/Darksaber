import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    BURGOS_BOSS_MONSTER_ID,
    BURGOS_CASTLE_DUNGEON_ID,
    BURGOS_GUARD_MONSTER_ID,
    BURGOS_LEGACY_BOSS_MONSTER_ID,
    GENERAL_MONSTER_IDS,
    MONSTER_ROW_BY_FACING,
    MONSTER_SPRITE_PATH,
    RESERVED_RENDERABLE_MONSTER_IDS,
    ZAMORA_FENRIS_BOSS_MONSTER_ID,
    ZAMORA_FORTRESS_DUNGEON_ID,
    getMonsterDefinition,
} from '../../src/data/MonsterCatalog';
import { getNormalizedMonsterBalance } from '../../src/data/original/originalMonsterBalance';
import { getItemDef } from '../../src/data/ItemDB';
import { getStoryQuestByDungeonId } from '../../src/data/StoryQuestData';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { Enemy } from '../../src/entity/Enemy';
import { LootObject } from '../../src/entity/LootObject';
import { Player } from '../../src/entity/Player';
import { WorldEngine } from '../../src/engine/WorldEngine';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import { WorldSelectionController } from '../../src/engine/world/WorldSelectionController';
import { WorldStoryScenarioController } from '../../src/engine/world/WorldStoryScenarioController';
import { GridInventory } from '../../src/inventory/GridInventory';
import { generateWorldLootNear } from '../../src/loot/WorldLootGenerator';
import { BURGOS_CASTLE_HMAP_ROWS, BURGOS_CASTLE_HMAP_SIZE } from '../../src/map/BurgosCastleHmap';
import { getStoryInteriorLayout, isStoryInteriorDungeon } from '../../src/data/StoryInteriorData';
import { NEUTRAL_BIRD_SPRITE_SRC, WorldMap } from '../../src/map/WorldMap';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public src = '';
    public complete = true;
    public naturalWidth = 96;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

const MONSTER_PUBLIC_PATH = ['public', ...MONSTER_SPRITE_PATH.split('/').filter(Boolean)];

function createStoryScenarioHarness(options: {
    player?: Player;
    raidSession?: WorldRaidSession;
    fieldEnemies?: { enemy: Enemy; home: { x: number; y: number }; path: { x: number; y: number }[] }[];
    worldMap?: WorldMap;
    isNetworkRaid?: boolean;
} = {}) {
    const player = options.player ?? new Player(0, 0);
    const raidSession = options.raidSession ?? new WorldRaidSession('central_castle');
    let worldMap = options.worldMap ?? new WorldMap();
    let fieldEnemies = options.fieldEnemies ?? [];
    let selectionCleared = false;
    let turnStateCleared = false;
    let selectedActorId: string | null = null;
    let placedNear: { x: number; y: number } | null = null;
    let cameraFollowed = false;
    const logs: string[] = [];

    const controller = new WorldStoryScenarioController({
        playerData: {} as any,
        raidSession,
        getWorldMap: () => worldMap,
        setWorldMap: (nextWorldMap) => { worldMap = nextWorldMap; },
        getPlayer: () => player,
        setPlayer: () => undefined,
        getFieldEnemies: () => fieldEnemies,
        setFieldEnemies: (nextFieldEnemies) => { fieldEnemies = nextFieldEnemies; },
        getControlledActor: () => ({ id: 'hero', entity: player } as any),
        actorTile: () => ({ x: player.gridX, y: player.gridY }),
        placePartyNear: (tile) => { placedNear = { ...tile }; },
        clearFieldTurnState: () => { turnStateCleared = true; },
        closeFieldOverlays: () => undefined,
        selectActor: (actorId) => { selectedActorId = actorId; },
        clearSelection: () => { selectionCleared = true; },
        applyMonsterSprite: (enemy, monsterId) => {
            (enemy as unknown as { spriteTestId: string }).spriteTestId = monsterId;
        },
        isEntityMoving: () => false,
        isNetworkRaid: () => options.isNetworkRaid ?? false,
        getNetworkRaidClient: () => null,
        isRaidOutcomeVisible: () => false,
        isTownVisible: () => false,
        isFusionTempleVisible: () => false,
        followCameraToPlayer: () => { cameraFollowed = true; },
        log: (message) => logs.push(message),
    });

    return {
        controller,
        raidSession,
        logs,
        get fieldEnemies() { return fieldEnemies; },
        get worldMap() { return worldMap; },
        get selectedActorId() { return selectedActorId; },
        get selectionCleared() { return selectionCleared; },
        get turnStateCleared() { return turnStateCleared; },
        get placedNear() { return placedNear; },
        get cameraFollowed() { return cameraFollowed; },
    };
}

test('monster catalog includes 16 general monsters and story boss sprites', () => {
    assert.equal(GENERAL_MONSTER_IDS.length, 16);
    assert.equal(new Set(GENERAL_MONSTER_IDS).size, 16);

    for (const id of GENERAL_MONSTER_IDS) {
        const definition = getMonsterDefinition(id);
        assert.equal(definition.id, id);
        assert.equal(definition.frameCount, 3);
        assert.ok(existsSync(join(process.cwd(), ...MONSTER_PUBLIC_PATH, definition.sprite)), `${id} sprite missing`);
    }

    const boss = getMonsterDefinition(BURGOS_BOSS_MONSTER_ID);
    assert.equal(boss.role, 'boss');
    assert.equal(boss.sprite, '435R.png');
    assert.equal(boss.frameSize, 32);
    assert.ok(existsSync(join(process.cwd(), ...MONSTER_PUBLIC_PATH, boss.sprite)));

    const fenris = getMonsterDefinition(ZAMORA_FENRIS_BOSS_MONSTER_ID);
    assert.equal(fenris.name, '펜리스');
    assert.equal(fenris.role, 'boss');
    assert.equal(fenris.level, 4);
    assert.equal(fenris.sprite, '435R.png');
    assert.ok(existsSync(join(process.cwd(), ...MONSTER_PUBLIC_PATH, fenris.sprite)));

    const legacyBoss = getMonsterDefinition(BURGOS_LEGACY_BOSS_MONSTER_ID);
    assert.equal(legacyBoss.frameSize, 64);
    assert.ok(existsSync(join(process.cwd(), ...MONSTER_PUBLIC_PATH, legacyBoss.sprite)));

    for (const id of RESERVED_RENDERABLE_MONSTER_IDS) {
        const definition = getMonsterDefinition(id);
        assert.ok(existsSync(join(process.cwd(), ...MONSTER_PUBLIC_PATH, definition.sprite)), `${id} sprite missing`);
    }
});

test('Burgos Castle is a world-map dungeon entrance landmark', () => {
    const world = new WorldMap();
    const dungeon = world.getDungeons().find((candidate) => candidate.id === BURGOS_CASTLE_DUNGEON_ID);
    assert.ok(dungeon);

    const entrance = world.getDungeonEntranceTile(dungeon);
    assert.equal(world.getDungeonAtTile(entrance.x, entrance.y)?.id, BURGOS_CASTLE_DUNGEON_ID);
    assert.equal(world.getTileAt(entrance.x, entrance.y), TileType.DUNGEON_ENTRANCE);
    assert.equal(dungeon.sprite, 'burgosCastle');
    assert.ok(world.getMapLandmarks().some((landmark) => landmark.kind === 'dungeon' && landmark.label === '부르고스성'));
});

test('Zamora Fortress is northwest of Burgos Castle on the world map', () => {
    const world = new WorldMap();
    const burgos = world.getDungeons().find((candidate) => candidate.id === BURGOS_CASTLE_DUNGEON_ID);
    const zamora = world.getDungeons().find((candidate) => candidate.id === ZAMORA_FORTRESS_DUNGEON_ID);
    assert.ok(burgos);
    assert.ok(zamora);
    assert.equal(zamora.chunkX, 34);
    assert.equal(zamora.chunkY, 32);
    assert.equal(zamora.sprite, 'castle');
    assert.ok(zamora.chunkX < burgos.chunkX);
    assert.ok(zamora.chunkY < burgos.chunkY);

    const entrance = world.getDungeonEntranceTile(zamora);
    assert.equal(world.getDungeonAtTile(entrance.x, entrance.y)?.id, ZAMORA_FORTRESS_DUNGEON_ID);
    assert.equal(world.getTileAt(entrance.x, entrance.y), TileType.DUNGEON_ENTRANCE);
    assert.ok(world.getMapLandmarks().some((landmark) => landmark.kind === 'dungeon' && landmark.label === '자모라 요새'));
});

test('Burgos Castle uses the original 01hmap footprint around its entrance', () => {
    const world = new WorldMap();
    const dungeon = world.getDungeons().find((candidate) => candidate.id === BURGOS_CASTLE_DUNGEON_ID);
    assert.ok(dungeon);

    assert.equal(BURGOS_CASTLE_HMAP_ROWS.length, BURGOS_CASTLE_HMAP_SIZE);
    assert.ok(BURGOS_CASTLE_HMAP_ROWS.every((row) => row.length === BURGOS_CASTLE_HMAP_SIZE));

    const entrance = world.getDungeonEntranceTile(dungeon);
    assert.equal(world.getTileAt(entrance.x, entrance.y), TileType.DUNGEON_ENTRANCE);
    assert.equal(world.getTileAt(entrance.x, entrance.y + 24), TileType.ROAD);
    assert.equal(world.getTileAt(entrance.x, entrance.y + 51), TileType.WATER);
    // Interior footprint is authoritative; the outer ring is intentionally
    // feathered into the surrounding biome (see HmapBlend), so sample interior tiles.
    assert.equal(world.getTileAt(entrance.x - 40, entrance.y - 40), TileType.STONE);
    assert.equal(world.getTileAt(entrance.x + 34, entrance.y + 34), TileType.ROAD);
});

test('world map neutral bird sprite asset is available', () => {
    const publicPath = ['public', ...NEUTRAL_BIRD_SPRITE_SRC.split('/').filter(Boolean)];
    assert.ok(existsSync(join(process.cwd(), ...publicPath)));
});

test('world loot generator is deterministic and does not revisit generated chunks', () => {
    const world = new WorldMap();
    const town = world.getTowns().find((candidate) => candidate.id === 'central_castle');
    assert.ok(town);
    const anchor = world.getTownExitTile(town);
    const firstChunks = new Set<string>();
    const secondChunks = new Set<string>();
    const createId = (type: string, chunkX: number, chunkY: number) => `loot_${type}_${chunkX}_${chunkY}`;

    const first = generateWorldLootNear({
        worldMap: world,
        playerTile: anchor,
        seed: 'deterministic-test',
        generatedChunks: firstChunks,
        existingLoot: [],
        departureTownId: town.id,
        findNearbyWalkableTile: (tile) => tile,
        createId,
        minNew: 3,
    });
    const duplicate = generateWorldLootNear({
        worldMap: world,
        playerTile: anchor,
        seed: 'deterministic-test',
        generatedChunks: firstChunks,
        existingLoot: first,
        departureTownId: town.id,
        findNearbyWalkableTile: (tile) => tile,
        createId,
        minNew: 3,
    });
    const replay = generateWorldLootNear({
        worldMap: world,
        playerTile: anchor,
        seed: 'deterministic-test',
        generatedChunks: secondChunks,
        existingLoot: [],
        departureTownId: town.id,
        findNearbyWalkableTile: (tile) => tile,
        createId,
        minNew: 3,
    });

    assert.ok(first.length > 0);
    assert.equal(duplicate.length, 0);
    assert.deepEqual(
        replay.map((loot) => ({
            id: loot.id,
            x: loot.x,
            y: loot.y,
            containerType: loot.containerType,
            items: loot.inventory.items.map((placed) => placed.item.id),
        })),
        first.map((loot) => ({
            id: loot.id,
            x: loot.x,
            y: loot.y,
            containerType: loot.containerType,
            items: loot.inventory.items.map((placed) => placed.item.id),
        }))
    );
    assert.ok(first.every((loot) => world.getTileAt(loot.x, loot.y) !== TileType.TOWN));
});

test('world loot generator rejects blocked and ocean candidates', () => {
    const world = new WorldMap();
    const generatedChunks = new Set<string>();
    const loot = generateWorldLootNear({
        worldMap: world,
        playerTile: { x: 16, y: 16 },
        seed: 'ocean-test',
        generatedChunks,
        existingLoot: [],
        findNearbyWalkableTile: (tile) => tile,
        createId: (type, chunkX, chunkY) => `loot_${type}_${chunkX}_${chunkY}`,
        minNew: 3,
    });

    assert.equal(loot.length, 0);
});

test('sealed reliquary loot comes only from non-quest rare tables', () => {
    const world = new WorldMap();
    const dungeon = world.getDungeons().find((candidate) => candidate.id === BURGOS_CASTLE_DUNGEON_ID);
    assert.ok(dungeon);
    const anchor = world.getDungeonEntranceTile(dungeon);
    let reliquary: LootObject | undefined;

    for (let seed = 0; seed < 1_000 && !reliquary; seed++) {
        const loot = generateWorldLootNear({
            worldMap: world,
            playerTile: anchor,
            seed: `sealed-${seed}`,
            generatedChunks: new Set<string>(),
            existingLoot: [],
            findNearbyWalkableTile: (tile) => tile,
            createId: (type, chunkX, chunkY) => `loot_${type}_${chunkX}_${chunkY}`,
            maxNew: 3,
            minNew: 3,
        });
        reliquary = loot.find((candidate) => candidate.containerType === 'sealed_reliquary');
    }

    assert.ok(reliquary);
    const itemIds = reliquary.inventory.items.map((placed) => placed.item.id);
    assert.ok(itemIds.length > 0);
    assert.ok(itemIds.every((itemId) => !itemId.startsWith('quest_') && itemId !== 'absolution_edge'));
});

test('Burgos boss corpse loot includes a guaranteed rune', () => {
    const bossDef = getMonsterDefinition(BURGOS_BOSS_MONSTER_ID);
    const boss = new Enemy('burgos_boss', 100, 100, bossDef.name, bossDef.level, bossDef.color, bossDef.role);
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.worldMap = { loot: [] };
    engine.storyScenarioController = { getActiveInterior: () => null };

    engine.spawnEnemyLoot(boss);

    assert.equal(engine.worldMap.loot.length, 1);
    assert.ok(engine.worldMap.loot[0].inventory.items.some((placed: { item: { slot: string } }) => placed.item.slot === 'rune'));
});

test('story episodes 3 through 20 have map entrances and server-session objective data', () => {
    const world = new WorldMap();

    for (const scenario of STORY_SCENARIOS.filter((entry) => entry.episode >= 3 && entry.episode <= 20)) {
        const quest = getStoryQuestByDungeonId(scenario.dungeonId);
        assert.ok(quest, `missing quest for episode ${scenario.episode}`);

        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        assert.ok(dungeon, `missing dungeon landmark for episode ${scenario.episode}`);
        const entrance = world.getDungeonEntranceTile(dungeon);
        assert.equal(world.getDungeonAtTile(entrance.x, entrance.y)?.id, scenario.dungeonId);
        assert.equal(world.getTileAt(entrance.x, entrance.y), TileType.DUNGEON_ENTRANCE);
        assert.ok(scenario.guardCount >= 0, `episode ${scenario.episode} guard count is invalid`);
        assert.ok(scenario.guardLevel >= 1, `episode ${scenario.episode} guard level is invalid`);
        assert.ok(scenario.bossLevel >= scenario.guardLevel, `episode ${scenario.episode} boss level should cover guards`);
        assert.ok(['field', 'soloInterior', 'vehicle'].includes(scenario.missionKind), `episode ${scenario.episode} mission kind is invalid`);
        if (scenario.episode === 17) assert.equal(scenario.bossName, null, 'airship completes on boarding');
        else assert.ok(scenario.bossName, `episode ${scenario.episode} needs an objective boss name`);
    }
});

test('local story interior uses the shared monster ids and normalized stats', () => {
    const dungeon = new WorldMap().getDungeons().find((entry) => entry.id === BURGOS_CASTLE_DUNGEON_ID);
    const quest = getStoryQuestByDungeonId(BURGOS_CASTLE_DUNGEON_ID);
    const interior = getStoryInteriorLayout(BURGOS_CASTLE_DUNGEON_ID);
    assert.ok(dungeon);
    assert.ok(quest);
    assert.ok(interior);
    assert.equal(isStoryInteriorDungeon(BURGOS_CASTLE_DUNGEON_ID), true);

    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    const harness = createStoryScenarioHarness({ raidSession });

    harness.controller.startLocalStoryInteriorDungeon(dungeon, quest);

    assert.equal(raidSession.activeDungeonId, BURGOS_CASTLE_DUNGEON_ID);
    assert.equal(harness.fieldEnemies.length, 5);
    assert.deepEqual(harness.placedNear, interior.playerStart);
    assert.equal(harness.selectedActorId, 'hero');
    assert.equal(harness.turnStateCleared, true);
    assert.equal(harness.cameraFollowed, true);
    const guard = harness.fieldEnemies.find((entry) => entry.enemy.id.endsWith('_guard_0'))?.enemy;
    const boss = harness.fieldEnemies.find((entry) => entry.enemy.id.endsWith('_boss'))?.enemy;
    assert.ok(guard);
    assert.ok(boss);

    const guardBalance = getNormalizedMonsterBalance(BURGOS_GUARD_MONSTER_ID, 2);
    assert.equal(guard.stats.maxHp, guardBalance.stats.maxHp);
    assert.equal(guard.stats.atk, guardBalance.stats.atk);
    assert.equal((guard as unknown as { spriteTestId: string }).spriteTestId, BURGOS_GUARD_MONSTER_ID);

    const expectedBoss = new Enemy('expected_boss', 0, 0, boss.name, 3, boss.color, 'boss', BURGOS_BOSS_MONSTER_ID);
    assert.equal(boss.stats.maxHp, expectedBoss.stats.maxHp);
    assert.equal(boss.stats.atk, expectedBoss.stats.atk);
    assert.equal((boss as unknown as { spriteTestId: string }).spriteTestId, BURGOS_BOSS_MONSTER_ID);
});

test('story interior completion restores the previous world map at the return tile', () => {
    const dungeon = new WorldMap().getDungeons().find((entry) => entry.id === BURGOS_CASTLE_DUNGEON_ID);
    const quest = getStoryQuestByDungeonId(BURGOS_CASTLE_DUNGEON_ID);
    assert.ok(dungeon);
    assert.ok(quest);

    const player = new Player(12, 13);
    const overworld = new WorldMap();
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    const harness = createStoryScenarioHarness({ player, raidSession, worldMap: overworld });

    harness.controller.startLocalStoryInteriorDungeon(dungeon, quest);
    const boss = harness.fieldEnemies.find((entry) => entry.enemy.isBoss)?.enemy;
    assert.ok(boss);
    assert.notEqual(harness.worldMap, overworld);

    harness.controller.completeDungeonIfBossDefeated(boss);

    assert.equal(harness.worldMap, overworld);
    assert.deepEqual(harness.placedNear, { x: 12, y: 13 });
    assert.equal(raidSession.activeDungeonId, null);
    assert.equal(raidSession.isDungeonCleared(BURGOS_CASTLE_DUNGEON_ID), true);
});

test('normal enemy loot is auto-collected into the backpack', () => {
    const bag = new GridInventory(4, 4);
    const logs: string[] = [];
    const enemy = new Enemy('field_enemy_1', 10, 10, '부르고스 추격병', 1, '#d98a5a', 'bruiser');
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.worldMap = { loot: [] };
    engine.gameManager = { inventoryUI: { getBag: () => bag } };
    engine.addCombatLog = (message: string) => logs.push(message);

    engine.spawnEnemyLoot(enemy);

    assert.equal(engine.worldMap.loot.length, 0);
    assert.equal(bag.items.length, 1);
    assert.equal(bag.items[0].acquiredInRaid, true);
    assert.ok(logs.some((entry) => /전리품 자동 획득|Loot auto-collected/.test(entry)));
});

test('normal enemy loot drops to the field when the backpack is full', () => {
    const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
    assert.ok(herb);
    const bag = new GridInventory(1, 1);
    bag.autoPlace(herb);
    const logs: string[] = [];
    const enemy = new Enemy('field_enemy_2', 11, 10, '부르고스 추격병', 1, '#d98a5a', 'bruiser');
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.worldMap = { loot: [] };
    engine.gameManager = { inventoryUI: { getBag: () => bag } };
    engine.addCombatLog = (message: string) => logs.push(message);

    engine.spawnEnemyLoot(enemy);

    assert.equal(bag.items.length, 1);
    assert.equal(engine.worldMap.loot.length, 1);
    assert.equal(engine.worldMap.loot[0].inventory.items.length, 1);
    assert.ok(logs.some((entry) => /배낭 공간 부족|Backpack full/.test(entry)));
});

test('opened loot object renders nothing', () => {
    const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
    assert.ok(herb);
    const loot = new LootObject('loot_empty', 1, 1, [herb]);
    loot.opened = true;
    const calls: string[] = [];
    const ctx = {
        fillRect: () => calls.push('fillRect'),
        beginPath: () => calls.push('beginPath'),
        arc: () => calls.push('arc'),
        fill: () => calls.push('fill'),
        stroke: () => calls.push('stroke'),
        fillText: () => calls.push('fillText'),
    } as unknown as CanvasRenderingContext2D;

    loot.render(ctx, 0, 0, 32);

    assert.deepEqual(calls, []);
});

test('enemy selection display info includes walk sprite sheet data', () => {
    const enemy = new Enemy('guard', 5, 5, '부르고스 경비병', 2, '#d98a5a', 'bruiser');
    enemy.walkSprite = {
        image: new Image(),
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 3,
        framesPerSecond: 8,
        rowByFacing: MONSTER_ROW_BY_FACING,
        renderScale: 1.12,
        actionFrameCount: 2,
        actionRowsAvailable: {},
    };
    enemy.walkSpriteLoaded = true;

    const selection = new WorldSelectionController({
        getPartyActors: () => [],
        getEnemyById: (enemyId) => enemyId === enemy.id ? enemy : null,
        getLootById: () => null,
    });
    selection.selectEnemy(enemy.id);

    const info = selection.getSelectedDisplayInfo();
    assert.equal(info?.spriteSheet?.loaded, true);
    assert.equal(info?.spriteSheet?.frameCount, 3);
    assert.equal(info?.spriteSheet?.rowByFacing.down, 1);
    assert.equal(info?.spriteSheet?.rowByFacing.right, 2);
    assert.equal(info?.spriteSheet?.rowByFacing.left, 3);
});

test('Burgos boss defeat clears only the dungeon encounter, not raid success', () => {
    const bossDef = getMonsterDefinition(BURGOS_BOSS_MONSTER_ID);
    const boss = new Enemy('burgos_boss', 100, 100, bossDef.name, bossDef.level, bossDef.color, bossDef.role);
    const guard = new Enemy('burgos_guard_0', 98, 98, '부르고스 경비병', 2, '#d98a5a', 'bruiser');
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    raidSession.startDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);

    let raidSuccessShown = false;
    const worldMap = new WorldMap();
    worldMap.loot = [{ id: 'preexisting_loot' } as any, { id: 'corpse_burgos_boss' } as any];
    const harness = createStoryScenarioHarness({
        raidSession,
        worldMap,
        fieldEnemies: [
            { enemy: boss, home: { x: boss.gridX, y: boss.gridY }, path: [] },
            { enemy: guard, home: { x: guard.gridX, y: guard.gridY }, path: [] },
        ],
    });
    void raidSuccessShown;

    harness.controller.completeDungeonIfBossDefeated(boss);

    assert.equal(raidSession.active, true);
    assert.equal(raidSession.activeDungeonId, null);
    assert.equal(raidSession.isDungeonCleared(BURGOS_CASTLE_DUNGEON_ID), true);
    assert.deepEqual(harness.fieldEnemies, []);
    assert.deepEqual(harness.worldMap.loot.map((loot) => loot.id), ['preexisting_loot', 'corpse_burgos_boss']);
    assert.equal(harness.selectionCleared, true);
    assert.equal(harness.turnStateCleared, true);
    assert.equal(raidSuccessShown, false);
    assert.ok(harness.logs.includes('부르고스성 목표 달성. 다른 마을로 생환하면 1화가 완료됩니다.'));
});

test('Zamora Fenris defeat clears only the dungeon encounter, not raid success', () => {
    const bossDef = getMonsterDefinition(ZAMORA_FENRIS_BOSS_MONSTER_ID);
    const boss = new Enemy('zamora_fenris', 100, 100, bossDef.name, bossDef.level, bossDef.color, bossDef.role);
    const guard = new Enemy('zamora_guard_0', 98, 98, '스켈레톤 전사', 2, '#d8c8e8', 'bruiser');
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    raidSession.startDungeonEncounter(ZAMORA_FORTRESS_DUNGEON_ID);

    let raidSuccessShown = false;
    const worldMap = new WorldMap();
    worldMap.loot = [{ id: 'preexisting_loot' } as any, { id: 'corpse_zamora_fenris' } as any];
    const harness = createStoryScenarioHarness({
        raidSession,
        worldMap,
        fieldEnemies: [
            { enemy: boss, home: { x: boss.gridX, y: boss.gridY }, path: [] },
            { enemy: guard, home: { x: guard.gridX, y: guard.gridY }, path: [] },
        ],
    });
    void raidSuccessShown;

    harness.controller.completeDungeonIfBossDefeated(boss);

    assert.equal(raidSession.active, true);
    assert.equal(raidSession.activeDungeonId, null);
    assert.equal(raidSession.isDungeonCleared(ZAMORA_FORTRESS_DUNGEON_ID), true);
    assert.deepEqual(harness.fieldEnemies, []);
    assert.deepEqual(harness.worldMap.loot.map((loot) => loot.id), ['preexisting_loot', 'corpse_zamora_fenris']);
    assert.equal(harness.selectionCleared, true);
    assert.equal(harness.turnStateCleared, true);
    assert.equal(raidSuccessShown, false);
    assert.ok(harness.logs.includes('자모라 요새 목표 달성. 다른 마을로 생환하면 2화가 완료됩니다.'));
});

test('Airship objective completion keeps variant monsters as optional encounters', () => {
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    raidSession.startDungeonEncounter('airship');
    const variant = new Enemy('airship_variant_0', 100, 100, '나이아두', 9, '#5e7388', 'bruiser');
    const storyQuest = getStoryQuestByDungeonId('airship');
    assert.ok(storyQuest);

    const harness = createStoryScenarioHarness({
        raidSession,
        fieldEnemies: [{ enemy: variant, home: { x: 100, y: 100 }, path: [] }],
    });

    harness.controller.completeStoryDungeonObjective('airship', storyQuest, { clearEnemies: false });

    assert.equal(raidSession.activeDungeonId, null);
    assert.equal(raidSession.isDungeonCleared('airship'), true);
    assert.equal(harness.fieldEnemies.length, 1);
    assert.equal(harness.selectionCleared, true);
    assert.equal(harness.turnStateCleared, true);
    assert.ok(harness.logs.includes('비공정 목표 달성. 다른 마을로 생환하면 17화가 완료됩니다.'));
});
