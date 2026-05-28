import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { PartyManager } from '../../src/character/PartyManager';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { PlayerData } from '../../src/data/PlayerData';
import { GridInventory } from '../../src/inventory/GridInventory';
import { WorldTownSession } from '../../src/engine/world/WorldTownSession';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('world town session purchases pending rest and treats active party injuries', () => {
    const party = new PartyManager();
    const character = new Character('hero-1', 'Hero', 'infantry');
    party.addToRoster(character);
    party.deployCharacter(character);

    const playerData = new PlayerData();
    playerData.gold = 1000;
    const logs: string[] = [];
    const session = new WorldTownSession({
        party,
        playerData,
        gameManager: {
            inventory: new GridInventory(10, 6),
            stash: new GridInventory(10, 6),
        },
        onDeploy: () => undefined,
        log: (message) => logs.push(message),
    });

    assert.equal(session.purchaseRestMenu('hearty_breakfast'), true);
    assert.equal(playerData.pendingRestMenuId, 'hearty_breakfast');
    assert.ok(character.statuses.some((status) => status.sourceType === 'rest'));

    character.statuses = [createStatus('injury')];
    const goldBeforeTreatment = playerData.gold;
    assert.equal(session.treatActivePartyInjuries(), true);
    assert.equal(hasStatus(character.statuses, 'injury'), false);
    assert.equal(playerData.gold < goldBeforeTreatment, true);
    assert.ok(logs.length > 0);
});
