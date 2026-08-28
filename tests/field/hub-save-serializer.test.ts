import test from 'node:test';
import assert from 'node:assert/strict';
import { GridInventory } from '../../src/inventory/GridInventory';
import { ITEMS } from '../../src/data/ItemDB';
import { buildHubSavePatch } from '../../src/shared/HubSaveSerializer';
import { PlayerData } from '../../src/data/PlayerData';
import { PartyManager } from '../../src/character/PartyManager';
import { Character } from '../../src/character/Character';
import { createStatus } from '../../src/combat/StatusEffects';
import { createRaidHistoryEntry } from '../../src/raid/RaidHistory';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('buildHubSavePatch round-trips grid inventory dimensions and item ids', () => {
    const playerData = new PlayerData();
    playerData.gold = 900;
    playerData.currentHubTownId = 'central_castle';
    playerData.facilityUpgrades.infirmary = 1;
    playerData.raidInsuranceActive = true;
    playerData.addRaidHistoryEntry(createRaidHistoryEntry({
        id: 'server-owned-history',
        completedAt: 1,
        result: 'SURVIVED',
        elapsedSeconds: 60,
        kills: 1,
        departureTownId: 'central_castle',
        extractionTownId: 'w_forest_village',
        securedItems: 1,
        lostItems: 0,
        equipmentLost: 0,
        goldReward: 10,
    }));
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
    assert.equal((patch.questState as Record<string, unknown>).raidInsuranceActive, true);
    assert.equal('raidHistory' in (patch.questState as Record<string, unknown>), false);
    assert.equal(patch.inventory?.width, 10);
    assert.equal(patch.stashSnapshot?.width, 15);
    assert.equal(patch.inventory?.items[0]?.itemId, 'herb_cheap');
    assert.equal(patch.stashSnapshot?.items[0]?.itemId, 'herb_cheap');
});

test('buildHubSavePatch persists equipment for every roster character and mirrors the primary character', () => {
    const party = new PartyManager();
    const primary = new Character('primary', 'Primary', 'infantry');
    const companion = new Character('companion', 'Companion', 'cleric');
    const sword = ITEMS.find((item) => item.id === 'short_sword');
    const companionBody = ITEMS.find((item) => item.id === 'magic_t1_body');
    assert.ok(sword);
    assert.ok(companionBody);
    primary.equip({ item: sword, gridX: 0, gridY: 0, durability: sword.maxDurability, quantity: 1 });
    companion.equip({ item: companionBody, gridX: 0, gridY: 0, durability: companionBody.maxDurability, quantity: 1 });
    party.addToRoster(primary);
    party.addToRoster(companion);
    party.deployCharacter(primary);
    party.deployCharacter(companion);
    party.switchTo(1);

    const patch = buildHubSavePatch({
        playerData: new PlayerData(),
        inventory: new GridInventory(10, 6),
        stash: new GridInventory(15, 10),
        party,
        hubTownId: 'central_castle',
        primaryCharacterId: primary.id,
    });

    assert.equal((patch.equipment?.weapon as { itemId?: string })?.itemId, 'short_sword');
    const roster = patch.rosterSnapshot?.characters;
    assert.ok(Array.isArray(roster));
    const primarySave = roster.find((entry) => entry.id === primary.id);
    const companionSave = roster.find((entry) => entry.id === companion.id);
    assert.equal((primarySave?.equipment as Record<string, { itemId?: string }>).weapon?.itemId, 'short_sword');
    assert.equal((companionSave?.equipment as Record<string, { itemId?: string }>).body?.itemId, 'magic_t1_body');
});

test('buildHubSavePatch persists only the durable injury flag from character statuses', () => {
    const party = new PartyManager();
    const injured = new Character('injured', 'Injured', 'infantry');
    const healthy = new Character('healthy', 'Healthy', 'cleric');
    injured.statuses = [createStatus('poison'), createStatus('injury')];
    healthy.statuses = [createStatus('attackUp')];
    party.addToRoster(injured);
    party.addToRoster(healthy);

    const patch = buildHubSavePatch({
        playerData: new PlayerData(),
        inventory: new GridInventory(10, 6),
        stash: new GridInventory(15, 10),
        party,
        hubTownId: 'central_castle',
    });

    const roster = patch.rosterSnapshot?.characters;
    assert.ok(Array.isArray(roster));
    const injuredSave = roster.find((entry) => entry.id === injured.id);
    const healthySave = roster.find((entry) => entry.id === healthy.id);
    assert.equal(injuredSave?.injured, true);
    assert.equal(healthySave?.injured, false);
    assert.equal('statuses' in (injuredSave ?? {}), false);
});
