import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemDef, ITEMS, normalizeItemDef, RawItemDef } from '../../src/data/ItemDB';
import { PlacedItem } from '../../src/inventory/GridInventory';
import { computeRaidFailureLoss } from '../../src/raid/RaidOutcome';
import { WorldMap } from '../../src/map/WorldMap';

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

