import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemDef } from '../../src/data/ItemDB';
import { GridInventory } from '../../src/inventory/GridInventory';

test('GridInventory.remove clears occupied cells even when item coordinates are stale', () => {
    const bag = new GridInventory(5, 5);
    const sword = bag.place(getItemDef('short_sword')!, 2, 1);
    assert.ok(sword);

    sword.gridX = 99;
    sword.gridY = 99;
    bag.remove(sword);

    assert.equal(bag.getAt(2, 1), null);
    assert.equal(bag.getAt(2, 2), null);
    assert.equal(bag.getAt(2, 3), null);
    assert.ok(bag.place(getItemDef('herb_common')!, 2, 1));
});
