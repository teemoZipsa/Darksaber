import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { getItemDef } from '../../src/data/ItemDB';
import { getEffectiveStatsForCharacter } from '../../src/combat/StatusEffects';
import { GridInventory } from '../../src/inventory/GridInventory';
import { InventoryUI } from '../../src/inventory/InventoryUI';

class ImageStub { onload = null; onerror = null; src = ''; }
(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

const fragmentedBag: Array<[string, number, number]> = [
    ['battle_t4_boots', 0, 0], ['tactics_t7_boots', 3, 4], ['quest_sacred_sword', 2, 0],
    ['healer_t4_head', 8, 0], ['battle_t5_head', 5, 2], ['web_66_39', 3, 0],
    ['web_66_29', 7, 0], ['healer_t7_head', 0, 3], ['magic_t1_head', 8, 4],
    ['web_66_43', 4, 1], ['magic_t6_head', 5, 4], ['orig_late_1005', 8, 2],
];

test('failed sort preserves the sacred sword, original positions, stacks and item state', () => {
    const bag = new GridInventory();
    for (const [id, x, y] of fragmentedBag) assert.ok(bag.place(getItemDef(id)!, x, y));
    const herb = getItemDef('herb_cheap')!;
    bag.place(herb, 0, 2)!.quantity = 2;
    bag.place(herb, 1, 2)!.quantity = 3;
    bag.items[0].durability = 7;
    bag.items[0].acquiredInRaid = true;
    const before = JSON.stringify(bag.items);
    const instances = [...bag.items];
    assert.equal(bag.sort(), false);
    assert.equal(JSON.stringify(bag.items), before);
    assert.deepEqual(bag.items, instances);
    for (const placed of instances) {
        assert.ok(bag.items.includes(placed));
        for (let y = 0; y < placed.item.gridH; y++) for (let x = 0; x < placed.item.gridW; x++) {
            assert.equal(bag.getAt(placed.gridX + x, placed.gridY + y), placed);
        }
    }
});

test('successful sort preserves equipment instances and merges quantities without changing loot provenance', () => {
    const bag = new GridInventory();
    const sword = bag.place(getItemDef('short_sword')!, 8, 2)!;
    sword.durability = 8;
    const herb = getItemDef('herb_cheap')!;
    bag.place(herb, 3, 1)!.quantity = 2;
    bag.place(herb, 5, 1)!.quantity = 3;
    const lootHerb = bag.place(herb, 6, 1)!;
    lootHerb.acquiredInRaid = true;
    assert.equal(bag.sort(), true);
    assert.equal(bag.items.length, 3);
    assert.ok(bag.items.includes(sword));
    assert.equal(sword.durability, 8);
    assert.ok(bag.items.includes(lootHerb));
    assert.equal(bag.items.filter(p => p.item.id === herb.id).reduce((n, p) => n + p.quantity, 0), 6);
});

test('equip rejects unmet level, tier and branch before detaching or replacing items', () => {
    const bag = new GridInventory();
    const ui = new InventoryUI(bag);
    const hero = new Character('hero', 'Hero', 'infantry');
    ui.setActiveCharacter(hero);
    const old = bag.autoPlace(getItemDef('short_sword')!)!;
    assert.equal(ui.moveToEquip(old, { kind: 'grid', grid: 'bag', gridX: old.gridX, gridY: old.gridY }, 'weapon'), true);
    const atk = getEffectiveStatsForCharacter(hero).atk;
    for (const id of ['orig_story_0620_dragon_killer7', 'battle_t4_boots', 'magic_t1_head']) {
        const placed = bag.autoPlace(getItemDef(id)!)!;
        const source = { kind: 'grid', grid: 'bag', gridX: placed.gridX, gridY: placed.gridY } as const;
        assert.equal(ui.moveToEquip(placed, source, placed.item.slot), false, id);
        assert.equal(bag.getAt(source.gridX, source.gridY), placed);
        assert.equal(hero.equipment.get('weapon'), old);
        assert.equal(getEffectiveStatsForCharacter(hero).atk, atk);
        bag.remove(placed);
    }
    hero.level = 106;
    const eligible = bag.autoPlace(getItemDef('orig_story_0620_dragon_killer7')!)!;
    assert.equal(ui.moveToEquip(eligible, { kind: 'grid', grid: 'bag', gridX: eligible.gridX, gridY: eligible.gridY }, 'weapon'), true);
    assert.equal(hero.equipment.get('weapon'), eligible);
    assert.ok(bag.items.includes(old));
});

test('stack drop preview agrees with placement including full stacks and unconfirmed raid loot', () => {
    const bag = new GridInventory();
    const ui = new InventoryUI(bag);
    const herb = getItemDef('herb_cheap')!;
    const source = bag.place(herb, 0, 0)!;
    const target = bag.place(herb, 2, 0)!;
    source.quantity = 2; target.quantity = 2;
    const origin = { kind: 'grid', grid: 'bag', gridX: 0, gridY: 0 } as const;
    assert.equal(ui.canMoveToCell(source, origin, 'bag', 2, 0), true);
    assert.equal(ui.moveToCell(source, origin, 'bag', 2, 0), true);
    assert.equal(source.quantity, 4);
    const ext = new GridInventory();
    const pending = ext.place(herb, 0, 0)!;
    ui.setExternalGrid(ext, 'Loot', { isRaidLoot: true });
    const pendingOrigin = { kind: 'grid', grid: 'ext', gridX: 0, gridY: 0 } as const;
    assert.equal(ui.canMoveToCell(pending, pendingOrigin, 'bag', 2, 0), false);
    assert.equal(ui.moveToCell(pending, pendingOrigin, 'bag', 2, 0), false);
    ui.setExternalGrid(ext);
    source.quantity = herb.maxStack;
    assert.equal(ui.canMoveToCell(pending, pendingOrigin, 'bag', 2, 0), false);
    assert.equal(ui.moveToCell(pending, pendingOrigin, 'bag', 2, 0), false);
    assert.equal(ext.getAt(0, 0), pending);
});
