import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemDef, ITEMS, normalizeItemDef, RawItemDef } from '../../src/data/ItemDB';
import { PlacedItem } from '../../src/inventory/GridInventory';
import { computeRaidFailureLoss } from '../../src/raid/RaidOutcome';
import { resolveTownArrival, shouldAdvanceRaidTimer } from '../../src/raid/RaidRules';
import { WorldMap } from '../../src/map/WorldMap';
import { CHUNK_SIZE } from '../../src/map/Chunk';
import { TileType } from '../../src/map/Tile';
import { getSellPrice, getShopItems, isSellableItem } from '../../src/data/ShopData';
import { PlayerData } from '../../src/data/PlayerData';
import { REST_FACILITIES, getRestFacility, getRestMenu } from '../../src/data/RestFacilityData';

function placed(id: string): PlacedItem {
    const item = getItemDef(id);
    assert.ok(item, `missing item ${id}`);
    return {
        item,
        gridX: 0,
        gridY: 0,
        durability: item.maxDurability,
        quantity: 1,
    };
}

function chunkCenter(chunkX: number, chunkY: number): { x: number; y: number } {
    return {
        x: chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        y: chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
    };
}

test('item metadata is normalized once for every item definition', () => {
    for (const item of ITEMS) {
        assert.ok(item.rarity);
        assert.equal(typeof item.weight, 'number');
        assert.equal(typeof item.baseValue, 'number');
        assert.ok(item.weight > 0);
        assert.ok(item.baseValue > 0);
    }
});

test('normalizeItemDef applies stable defaults to raw items', () => {
    const raw: RawItemDef = {
        id: 'test_blade',
        name: 'Test Blade',
        nameKr: '시험검',
        slot: 'weapon',
        gridW: 1,
        gridH: 3,
        color: '#fff',
        icon: '!',
        maxDurability: 10,
        stats: { atk: 3 },
        description: 'test',
    };
    const normalized = normalizeItemDef(raw);
    assert.equal(normalized.rarity, 'common');
    assert.equal(normalized.weight, 2.3);
    assert.ok(normalized.baseValue > 0);
});

test('shop inventory is split into town-specific weapon armor accessory and consumable categories', () => {
    const kaosiaWeapons = getShopItems('central_castle', 'weapon');
    const belfuersWeapons = getShopItems('w_forest_village', 'weapon');
    const sicilioArmor = getShopItems('s_coast_town', 'armor');
    const consumables = getShopItems('central_castle', 'consumable');
    const accessories = getShopItems('central_castle', 'accessory');

    assert.ok(kaosiaWeapons.length > 0);
    assert.ok(belfuersWeapons.length > kaosiaWeapons.length);
    assert.ok(sicilioArmor.some(({ item }) => item.id === 'web_67_02'));
    assert.ok(consumables.length > 0);
    assert.equal(accessories.length, 0);
    assert.ok(kaosiaWeapons.every(({ shopEntry, item }) => shopEntry.shopKind === 'weapon' && item.slot === 'weapon'));
    assert.ok(sicilioArmor.every(({ shopEntry, item }) => shopEntry.shopKind === 'armor' && ['shield', 'head', 'body', 'boots'].includes(item.slot)));
    assert.ok(consumables.every(({ shopEntry, item }) => shopEntry.shopKind === 'consumable' && item.slot === 'consumable'));
    assert.notDeepEqual(
        kaosiaWeapons.map(({ item }) => item.id),
        belfuersWeapons.map(({ item }) => item.id),
    );
});

test('sell price uses half buy price or half normalized base value', () => {
    const herb = getItemDef('herb_common');
    assert.ok(herb);
    assert.equal(getSellPrice(herb), 25);

    const raw: RawItemDef = {
        id: 'test_relic',
        name: 'Test Relic',
        nameKr: '시험 유물',
        slot: 'material',
        gridW: 1,
        gridH: 1,
        color: '#fff',
        icon: '?',
        maxDurability: 1,
        description: 'test',
        baseValue: 77,
    };
    assert.equal(getSellPrice(normalizeItemDef(raw)), 38);
});

test('sellable flag blocks bound or quest items from shop sale lists', () => {
    const bound = normalizeItemDef({
        id: 'bound_test_item',
        name: 'Bound Test Item',
        nameKr: '귀속 시험 아이템',
        slot: 'material',
        gridW: 1,
        gridH: 1,
        color: '#fff',
        icon: '!',
        maxDurability: 1,
        description: 'test',
        sellable: false,
    });

    assert.equal(isSellableItem(bound), false);
    assert.equal(isSellableItem({ ...bound, sellable: undefined }), true);
    const bomb = getItemDef('quest_bomb');
    assert.ok(bomb);
    assert.equal(isSellableItem(bomb), false);
});

test('raid failure loss clears backpack snapshots and skips empty equipment', () => {
    const loss = computeRaidFailureLoss(
        [placed('herb_common'), placed('mp_potion')],
        [
            { id: 'c1', name: 'Empty', equipment: new Map() },
        ],
        () => 0
    );

    assert.equal(loss.backpackLost.length, 2);
    assert.equal(loss.equipmentLost.length, 0);
});

test('raid failure loss chooses one equipped item per character', () => {
    const c1Equipment = new Map([
        ['weapon' as const, placed('short_sword')],
    ]);
    const c2Equipment = new Map([
        ['weapon' as const, placed('long_sword')],
        ['body' as const, placed('battle_t1_body')],
    ]);

    const loss = computeRaidFailureLoss(
        [],
        [
            { id: 'c1', name: 'One', equipment: c1Equipment },
            { id: 'c2', name: 'Two', equipment: c2Equipment },
        ],
        () => 0.99
    );

    assert.equal(loss.equipmentLost.length, 2);
    assert.equal(loss.equipmentLost[0].slot, 'weapon');
    assert.equal(loss.equipmentLost[1].slot, 'body');
});

test('WorldMap exposes consistent town tile helpers', () => {
    const world = new WorldMap();
    const bounds = world.getBoundsTiles();
    assert.ok(bounds.width > 0);
    assert.ok(bounds.height > 0);

    for (const town of world.getTowns()) {
        const spawn = world.getTownSpawnTile(town);
        assert.ok(world.isWalkable(spawn.x, spawn.y), `${town.id} spawn should be walkable`);
        assert.equal(world.getTownAtTile(spawn.x, spawn.y)?.id, town.id);
    }
});

test('WorldMap exposes original Darksaber town display names while keeping stable town ids', () => {
    const world = new WorldMap();
    const namesById = new Map(world.getTowns().map((town) => [town.id, town.nameKr]));

    assert.equal(namesById.get('central_castle'), '카오시아');
    assert.equal(namesById.get('w_forest_village'), '벨퓌어스');
    assert.equal(namesById.get('s_coast_town'), '시시리오');
    assert.equal(namesById.get('e_stronghold'), '엔트리아');
    assert.equal(namesById.get('se_port'), '아리크나');
});

test('WorldMap exposes walkable non-town exits for every town', () => {
    const world = new WorldMap();

    for (const town of world.getTowns()) {
        const exit = world.getTownExitTile(town);
        assert.ok(world.isWalkable(exit.x, exit.y), `${town.id} exit should be walkable`);
        assert.notEqual(world.getTownAtTile(exit.x, exit.y)?.id, town.id, `${town.id} exit should leave town radius`);
    }
});

test('rest facility data matches every world town and keeps menu ids unique', () => {
    const world = new WorldMap();
    const townIds = world.getTowns().map((town) => town.id).sort();
    const restTownIds = Object.keys(REST_FACILITIES).sort();

    assert.deepEqual(restTownIds, townIds);
    assert.equal(getRestFacility('e_outpost'), null);

    const menuIds = new Set<string>();
    for (const [townId, facility] of Object.entries(REST_FACILITIES)) {
        if (!facility) continue;
        assert.ok(facility.menu.length > 0, `${townId} should expose at least one rest menu`);
        for (const menu of facility.menu) {
            assert.equal(menuIds.has(menu.id), false, `${menu.id} should be unique`);
            menuIds.add(menu.id);
            assert.equal(getRestMenu(menu.id)?.id, menu.id);
            assert.ok(menu.price >= 20 && menu.price <= 120);
        }
    }
});

test('pending rest menu id persists through PlayerData save and load', () => {
    const previousStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
    };

    try {
        const player = new PlayerData();
        player.gold = 321;
        player.currentHubTownId = 'w_forest_village';
        player.pendingRestMenuId = 'hearty_breakfast';
        player.addQuestItem('quest_bomb');
        player.save();

        const loaded = new PlayerData();
        loaded.load();

        assert.equal(loaded.gold, 321);
        assert.equal(loaded.currentHubTownId, 'w_forest_village');
        assert.equal(loaded.pendingRestMenuId, 'hearty_breakfast');
        assert.equal(loaded.hasQuestItem('quest_bomb'), true);
    } finally {
        globalThis.localStorage = previousStorage;
    }
});

test('WorldMap lays deterministic travel roads through major route anchors', () => {
    const world = new WorldMap();
    const roadAnchors = [
        { label: 'desert to central', chunkX: 23, chunkY: 23 },
        { label: 'forest to central', chunkX: 20, chunkY: 48 },
        { label: 'central to coast', chunkX: 39, chunkY: 62 },
        { label: 'hideout to coast', chunkX: 24, chunkY: 82 },
        { label: 'east road', chunkX: 64, chunkY: 35 },
    ];

    for (const anchor of roadAnchors) {
        const tile = chunkCenter(anchor.chunkX, anchor.chunkY);
        assert.equal(world.getTileAt(tile.x, tile.y), TileType.ROAD, `${anchor.label} should contain a road`);
        assert.ok(world.isWalkable(tile.x, tile.y), `${anchor.label} road should be walkable`);
    }
});

test('WorldMap lays deterministic rivers while road crossings remain walkable', () => {
    const world = new WorldMap();
    const riverAnchors = [
        { label: 'western river', chunkX: 34, chunkY: 48 },
        { label: 'southern river', chunkX: 29, chunkY: 59 },
        { label: 'eastern river', chunkX: 66, chunkY: 31 },
    ];

    for (const anchor of riverAnchors) {
        const tile = chunkCenter(anchor.chunkX, anchor.chunkY);
        assert.equal(world.getTileAt(tile.x, tile.y), TileType.WATER, `${anchor.label} should contain river water`);
    }

    const bridge = chunkCenter(64, 35);
    assert.equal(world.getTileAt(bridge.x, bridge.y), TileType.ROAD);
    assert.ok(world.isWalkable(bridge.x, bridge.y), 'road crossing should stay walkable');
});

test('WorldMap keeps near and far out-of-bounds water behavior', () => {
    const world = new WorldMap();
    const bounds = world.getBoundsTiles();

    assert.equal(world.getTileAt(-1, 0), TileType.WATER);
    assert.equal(world.getTileAt(bounds.width, bounds.height - 1), TileType.WATER);
    assert.equal(world.getTileAt(-CHUNK_SIZE - 1, 0), TileType.DEEP_WATER);
    assert.equal(world.getTileAt(bounds.width + CHUNK_SIZE, bounds.height + CHUNK_SIZE), TileType.DEEP_WATER);
});

test('WorldMap returns a non-town exit tile with spawn fallback available', () => {
    const world = new WorldMap();
    const town = world.getTowns().find((candidate) => candidate.id === 'central_castle');
    assert.ok(town);

    const exit = world.getTownExitTile(town);
    assert.ok(world.isWalkable(exit.x, exit.y));
    assert.notEqual(world.getTownAtTile(exit.x, exit.y)?.id, town.id);

    class BlockedExitWorldMap extends WorldMap {
        public override isWalkable(_tx: number, _ty: number): boolean {
            return false;
        }
    }

    const originalWarn = console.warn;
    console.warn = () => {};
    let blocked: BlockedExitWorldMap;
    try {
        blocked = new BlockedExitWorldMap();
    } finally {
        console.warn = originalWarn;
    }
    const fallback = blocked.getTownExitTile(town);
    assert.deepEqual(fallback, blocked.getTownSpawnTile(town));
});

test('raid timer only advances during unblocked field exploration', () => {
    assert.equal(shouldAdvanceRaidTimer({
        raidActive: true,
        townVisible: false,
        resultVisible: false,
        turnCombatActive: false,
    }), true);

    assert.equal(shouldAdvanceRaidTimer({
        raidActive: true,
        townVisible: false,
        resultVisible: false,
        turnCombatActive: true,
    }), false);

    assert.equal(shouldAdvanceRaidTimer({
        raidActive: true,
        townVisible: true,
        resultVisible: false,
        turnCombatActive: false,
    }), false);
});

test('town arrival blocks departure and survives at any other town', () => {
    assert.deepEqual(resolveTownArrival('central_castle', 'central_castle', true), {
        kind: 'departureBlocked',
        townId: 'central_castle',
    });
    assert.deepEqual(resolveTownArrival('w_forest_village', 'central_castle', true), {
        kind: 'survived',
        townId: 'w_forest_village',
    });
    assert.deepEqual(resolveTownArrival('central_castle', 'w_forest_village', true), {
        kind: 'survived',
        townId: 'central_castle',
    });
    assert.deepEqual(resolveTownArrival('central_castle', 'central_castle', false), {
        kind: 'none',
    });
});

