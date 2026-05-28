import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    BURGOS_BOSS_MONSTER_ID,
    BURGOS_CASTLE_DUNGEON_ID,
    BURGOS_GUARD_MONSTER_ID,
    GENERAL_MONSTER_IDS,
    MONSTER_DEFINITIONS,
    MONSTER_ROW_BY_FACING,
    getMonsterDefinition,
} from '../../src/data/MonsterCatalog';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { WorldEngine } from '../../src/engine/WorldEngine';
import { WorldFieldSpawnController } from '../../src/engine/world/WorldFieldSpawnController';
import type { WorldMovementController } from '../../src/engine/world/WorldMovementController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import { WorldSelectionController } from '../../src/engine/world/WorldSelectionController';
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

function makePassthroughMovement(): WorldMovementController {
    return {
        findNearbyWalkableTile: (tile: { x: number; y: number }) => tile,
    } as unknown as WorldMovementController;
}

test('monster catalog includes 16 general monsters and the Burgos boss sprites', () => {
    assert.equal(GENERAL_MONSTER_IDS.length, 16);
    assert.equal(new Set(GENERAL_MONSTER_IDS).size, 16);

    for (const id of GENERAL_MONSTER_IDS) {
        const definition = getMonsterDefinition(id);
        assert.equal(definition.id, id);
        assert.equal(definition.frameCount, 3);
        assert.ok(existsSync(join(process.cwd(), 'public', 'Image', 'Monster', definition.sprite)), `${id} sprite missing`);
    }

    const boss = getMonsterDefinition(BURGOS_BOSS_MONSTER_ID);
    assert.equal(boss.role, 'boss');
    assert.equal(boss.frameSize, 64);
    assert.ok(existsSync(join(process.cwd(), 'public', 'Image', 'Monster', boss.sprite)));
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

test('Burgos Castle encounter spawns boss center and four diagonal guards', () => {
    const spawner = new WorldFieldSpawnController(makePassthroughMovement());
    const content = spawner.createBurgosCastleEncounter({ x: 100, y: 100 });
    assert.equal(content.enemies.length, 5);
    assert.equal(content.loot.length, 0);

    const boss = content.enemies.find((entry) => entry.enemy.isBoss)?.enemy;
    assert.ok(boss);
    assert.equal(boss.name, getMonsterDefinition(BURGOS_BOSS_MONSTER_ID).name);
    assert.deepEqual({ x: boss.gridX, y: boss.gridY }, { x: 100, y: 100 });
    assert.equal(boss.walkSprite?.frameWidth, 64);

    const guardName = getMonsterDefinition(BURGOS_GUARD_MONSTER_ID).name;
    const guardPositions = content.enemies
        .filter((entry) => entry.enemy.name === guardName)
        .map((entry) => `${entry.enemy.gridX - 100},${entry.enemy.gridY - 100}`)
        .sort();
    assert.deepEqual(guardPositions, ['-2,-2', '-2,2', '2,-2', '2,2']);
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
});

test('Burgos boss defeat clears only the dungeon encounter, not raid success', () => {
    const boss = new Enemy('burgos_boss', 100, 100, '부르고스 궁의 몬스터', 3, '#ff7f8d', 'boss');
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
    assert.deepEqual(engine.worldMap.loot, []);
    assert.equal(selectionCleared, true);
    assert.equal(turnStateCleared, true);
    assert.equal(raidSuccessShown, false);
    assert.ok(logs.includes('부르고스성 클리어. 던전이 종료되었습니다.'));
});
