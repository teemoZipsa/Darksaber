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

test('GridInventory auto-stacks consumables while equipment remains one item per cell', () => {
    const bag = new GridInventory(5, 5);
    const herb = getItemDef('herb_cheap');
    const sword = getItemDef('short_sword');
    assert.ok(herb);
    assert.ok(sword);

    const firstHerb = bag.autoPlace(herb);
    const secondHerb = bag.autoPlace(herb);
    bag.autoPlace(sword);
    bag.autoPlace(sword);

    assert.equal(firstHerb, secondHerb);
    assert.equal(firstHerb?.quantity, 2);
    assert.equal(bag.items.filter((placed) => placed.item.id === herb.id).length, 1);
    assert.equal(bag.items.filter((placed) => placed.item.id === sword.id).length, 2);
});

test('GridInventory preserves the incoming instance when existing stacks merge', () => {
    const bag = new GridInventory(5, 5);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    const existing = bag.autoPlace(herb);
    assert.ok(existing);
    existing.quantity = 2;
    const incoming = { item: herb, gridX: 0, gridY: 0, durability: 1, quantity: 3 };

    assert.equal(bag.autoPlaceExisting(incoming), true);
    assert.equal(bag.items.includes(incoming), true);
    assert.equal(bag.items.includes(existing), false);
    assert.equal(incoming.quantity, 5);
});

test('GridInventory sort consolidates compatible stacks from legacy saves', () => {
    const bag = new GridInventory(5, 5);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    assert.ok(bag.place(herb, 0, 0));
    assert.ok(bag.place(herb, 1, 0));

    bag.sort();

    const herbs = bag.items.filter((placed) => placed.item.id === herb.id);
    assert.equal(herbs.length, 1);
    assert.equal(herbs[0]?.quantity, 2);
});
