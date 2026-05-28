import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemDef, ITEMS, normalizeItemDef, RawItemDef } from '../../src/data/ItemDB';
import { PlacedItem } from '../../src/inventory/GridInventory';
import { computeRaidFailureLoss } from '../../src/raid/RaidOutcome';
import { resolveTownArrival, shouldAdvanceRaidTimer } from '../../src/raid/RaidRules';
import { WorldMap } from '../../src/map/WorldMap';
import { getSellPrice, getShopItems, isSellableItem } from '../../src/data/ShopData';

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

test('shop inventory is split into equipment and goods categories', () => {
    const equipment = getShopItems('equipment');
    const goods = getShopItems('goods');

    assert.ok(equipment.length > 0);
    assert.ok(goods.length > 0);
    assert.ok(equipment.every(({ shopEntry, item }) => shopEntry.shopKind === 'equipment' && item.slot !== 'consumable'));
    assert.ok(goods.every(({ shopEntry, item }) => shopEntry.shopKind === 'goods' && item.slot === 'consumable'));
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

