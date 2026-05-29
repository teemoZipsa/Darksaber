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
    MONSTER_DEFINITIONS,
    MONSTER_ROW_BY_FACING,
    MONSTER_SPRITE_PATH,
    getMonsterDefinition,
} from '../../src/data/MonsterCatalog';
import { getItemDef } from '../../src/data/ItemDB';
import { Enemy } from '../../src/entity/Enemy';
import { LootObject } from '../../src/entity/LootObject';
import { Player } from '../../src/entity/Player';
import { WorldEngine } from '../../src/engine/WorldEngine';
import { WorldFieldSpawnController } from '../../src/engine/world/WorldFieldSpawnController';
import type { WorldMovementController } from '../../src/engine/world/WorldMovementController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import { WorldSelectionController } from '../../src/engine/world/WorldSelectionController';
import { GridInventory } from '../../src/inventory/GridInventory';
import { WorldMap } from '../../src/map/WorldMap';
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

function makePassthroughMovement(): WorldMovementController {
    return {
        findNearbyWalkableTile: (tile: { x: number; y: number }) => tile,
    } as unknown as WorldMovementController;
}

test('monster catalog includes 16 general monsters and the Burgos wolf boss sprites', () => {
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

    const legacyBoss = getMonsterDefinition(BURGOS_LEGACY_BOSS_MONSTER_ID);
    assert.equal(legacyBoss.frameSize, 64);
    assert.ok(existsSync(join(process.cwd(), ...MONSTER_PUBLIC_PATH, legacyBoss.sprite)));
});

test('Burgos Castle is a world-map dungeon entrance landmark', () => {
    const world = new WorldMap();
    const dungeon = world.getDungeons().find((candidate) => candidate.id === BURGOS_CASTLE_DUNGEON_ID);
    assert.ok(dungeon);

    const entrance = world.getDungeonEntranceTile(dungeon);
    assert.equal(world.getDungeonAtTile(entrance.x, entrance.y)?.id, BURGOS_CASTLE_DUNGEON_ID);
    assert.equal(world.getTileAt(entrance.x, entrance.y), TileType.DUNGEON_ENTRANCE);
    assert.ok(world.getMapLandmarks().some((landmark) => landmark.kind === 'dungeon' && landmark.label === '부르고스성'));
});

test('starter field content attaches all 16 general monster walk sprites', () => {
    const spawner = new WorldFieldSpawnController(makePassthroughMovement());
    const anchor = new Player(100, 100);
    const content = spawner.createStarterFieldContent(anchor);

    assert.equal(content.enemies.length, GENERAL_MONSTER_IDS.length);
    const spriteNames = new Set(content.enemies.map((entry) => {
        const parts = entry.enemy.walkSprite?.image.src.split('/') ?? [];
        return parts[parts.length - 1];
    }));
    for (const id of GENERAL_MONSTER_IDS) {
        assert.ok(spriteNames.has(MONSTER_DEFINITIONS[id].sprite), `${id} was not spawned with its catalog sprite`);
    }
});

test('starter field chests roll low-tier gems through injected RNG', () => {
    const mortalSpawner = new WorldFieldSpawnController(makePassthroughMovement(), () => 0);
    const mortal = mortalSpawner.createStarterFieldContent(new Player(100, 100));
    const mortalChest = mortal.loot.find((loot) => loot.id === 'field_chest_1');
    assert.ok(mortalChest);
    assert.ok(mortalChest.inventory.items.some((placed) => /^gem_(chipped|flawed)_/.test(placed.item.id)));

    const rolls = [0, 0.99];
    const masterSpawner = new WorldFieldSpawnController(makePassthroughMovement(), () => rolls.shift() ?? 0);
    const master = masterSpawner.createStarterFieldContent(new Player(100, 100), { masterRealm: true });
    const masterChest = master.loot.find((loot) => loot.id === 'field_chest_1');
    assert.ok(masterChest);
    assert.ok(masterChest.inventory.items.some((placed) => placed.item.id.startsWith('gem_normal_')));
});

test('Burgos Castle encounter spawns wolf boss center and four diagonal guards', () => {
    const spawner = new WorldFieldSpawnController(makePassthroughMovement());
    const content = spawner.createBurgosCastleEncounter({ x: 100, y: 100 });
    assert.equal(content.enemies.length, 5);
    assert.equal(content.loot.length, 0);

    const boss = content.enemies.find((entry) => entry.enemy.isBoss)?.enemy;
    assert.ok(boss);
    assert.equal(boss.name, getMonsterDefinition(BURGOS_BOSS_MONSTER_ID).name);
    assert.deepEqual({ x: boss.gridX, y: boss.gridY }, { x: 100, y: 100 });
    assert.equal(boss.walkSprite?.frameWidth, 32);

    const guardName = getMonsterDefinition(BURGOS_GUARD_MONSTER_ID).name;
    const guardPositions = content.enemies
        .filter((entry) => entry.enemy.name === guardName)
        .map((entry) => `${entry.enemy.gridX - 100},${entry.enemy.gridY - 100}`)
        .sort();
    assert.deepEqual(guardPositions, ['-2,-2', '-2,2', '2,-2', '2,2']);
});

test('Burgos boss corpse loot includes a guaranteed rune', () => {
    const bossDef = getMonsterDefinition(BURGOS_BOSS_MONSTER_ID);
    const boss = new Enemy('burgos_boss', 100, 100, bossDef.name, bossDef.level, bossDef.color, bossDef.role);
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.worldMap = { loot: [] };

    engine.spawnEnemyLoot(boss);

    assert.equal(engine.worldMap.loot.length, 1);
    assert.ok(engine.worldMap.loot[0].inventory.items.some((placed: { item: { slot: string } }) => placed.item.slot === 'rune'));
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

    let selectionCleared = false;
    let turnStateCleared = false;
    let raidSuccessShown = false;
    const logs: string[] = [];
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.raidSession = raidSession;
    engine.fieldEnemies = [
        { enemy: boss, home: { x: boss.gridX, y: boss.gridY }, path: [] },
        { enemy: guard, home: { x: guard.gridX, y: guard.gridY }, path: [] },
    ];
    engine.worldMap = { loot: [{ id: 'corpse_burgos_boss' }] };
    engine.selectionController = { clear: () => { selectionCleared = true; } };
    engine.clearFieldTurnState = () => { turnStateCleared = true; };
    engine.raidOutcomeController = { completeSuccess: () => { raidSuccessShown = true; } };
    engine.addCombatLog = (message: string) => logs.push(message);

    engine.completeDungeonIfBossDefeated(boss);

    assert.equal(raidSession.active, true);
    assert.equal(raidSession.activeDungeonId, null);
    assert.equal(raidSession.isDungeonCleared(BURGOS_CASTLE_DUNGEON_ID), true);
    assert.deepEqual(engine.fieldEnemies, []);
    assert.deepEqual(engine.worldMap.loot, [{ id: 'corpse_burgos_boss' }]);
    assert.equal(selectionCleared, true);
    assert.equal(turnStateCleared, true);
    assert.equal(raidSuccessShown, false);
    assert.ok(logs.includes('부르고스성 목표 달성. 다른 마을로 생환하면 1화가 완료됩니다.'));
});
