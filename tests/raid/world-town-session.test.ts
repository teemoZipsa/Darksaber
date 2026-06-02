import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { PartyManager } from '../../src/character/PartyManager';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { PlayerData } from '../../src/data/PlayerData';
import { GridInventory } from '../../src/inventory/GridInventory';
import { WorldTownSession } from '../../src/engine/world/WorldTownSession';
import { TownUI, TOWN_DEPLOY_CLICK_GUARD_MS } from '../../src/ui/TownUI';
import type { TownInfo } from '../../src/map/BiomeMask';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

const KAOSIA: TownInfo = {
    id: 'central_castle',
    name: 'Kaosia',
    nameKr: '카오시아',
    chunkX: 37,
    chunkY: 44,
    radius: 3,
};

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

test('town deploy ignores click-through immediately after opening', () => {
    let deploys = 0;
    const ui = new TownUI(new GridInventory(10, 6), new GridInventory(10, 6));
    ui.onDeploy(() => { deploys++; });

    ui.show(KAOSIA, 1000);
    const blocked = ui.requestDeploy(1000 + TOWN_DEPLOY_CLICK_GUARD_MS - 1);

    assert.equal(blocked, false);
    assert.equal(deploys, 0);
    assert.equal(ui.isVisible(), true);

    const deployed = ui.requestDeploy(1000 + TOWN_DEPLOY_CLICK_GUARD_MS);

    assert.equal(deployed, true);
    assert.equal(deploys, 1);
    assert.equal(ui.isVisible(), false);
});
