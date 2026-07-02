import test from 'node:test';
import assert from 'node:assert/strict';
import { GridInventory } from '../../src/inventory/GridInventory';
import { ITEMS } from '../../src/data/ItemDB';
import { buildHubSavePatch } from '../../src/shared/HubSaveSerializer';
import { PlayerData } from '../../src/data/PlayerData';
import { PartyManager } from '../../src/character/PartyManager';

test('buildHubSavePatch round-trips grid inventory dimensions and item ids', () => {
    const playerData = new PlayerData();
    playerData.gold = 900;
    playerData.currentHubTownId = 'central_castle';
    playerData.facilityUpgrades.infirmary = 1;
    const inventory = new GridInventory(10, 6);
    const stash = new GridInventory(15, 10);
    const potion = ITEMS.find((item) => item.id === 'herb_cheap');
    assert.ok(potion);
    inventory.autoPlace(potion);
    stash.autoPlace(potion);

    const patch = buildHubSavePatch({
        playerData,
        inventory,
        stash,
        party: new PartyManager(),
        hubTownId: 'central_castle',
    });

    assert.equal((patch.questState as Record<string, unknown>).gold, 900);
    assert.deepEqual((patch.questState as Record<string, unknown>).facilityUpgrades, { infirmary: 1 });
    assert.equal(patch.inventory?.width, 10);
    assert.equal(patch.stashSnapshot?.width, 15);
    assert.equal(patch.inventory?.items[0]?.itemId, 'herb_cheap');
    assert.equal(patch.stashSnapshot?.items[0]?.itemId, 'herb_cheap');
});
