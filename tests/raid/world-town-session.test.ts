import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { PartyManager } from '../../src/character/PartyManager';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { PlayerData } from '../../src/data/PlayerData';
import { getItemDef } from '../../src/data/ItemDB';
import { getSellPrice } from '../../src/data/ShopData';
import { GridInventory } from '../../src/inventory/GridInventory';
import { WorldTownSession } from '../../src/engine/world/WorldTownSession';
import { TownUI, TOWN_DEPLOY_CLICK_GUARD_MS } from '../../src/ui/TownUI';
import type { TownInfo } from '../../src/map/BiomeMask';
import { i18n, type Language } from '../../src/i18n/LanguageManager';

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

const COAST: TownInfo = {
    id: 's_coast_town',
    name: 'South Coast',
    nameKr: '남부 해안',
    chunkX: 37,
    chunkY: 48,
    radius: 3,
};

test('world town session purchases pending rest and treats active party injuries', () => {
    const previousLang: Language = i18n.lang;
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

    try {
        i18n.lang = 'ko';
        assert.equal(session.purchaseRestMenu('hearty_breakfast'), true);
        assert.equal(playerData.pendingRestMenuId, 'hearty_breakfast');
        assert.ok(character.statuses.some((status) => status.sourceType === 'rest'));
        assert.ok(logs.some((message) => message.includes('예약')));

        i18n.lang = 'en';
        session.applyPendingRestForRaidStart();
        assert.ok(logs.some((message) => message.includes('applied')));

        character.statuses = [createStatus('injury')];
        const goldBeforeTreatment = playerData.gold;
        assert.equal(session.treatActivePartyInjuries(), true);
        assert.equal(hasStatus(character.statuses, 'injury'), false);
        assert.equal(playerData.gold < goldBeforeTreatment, true);
        assert.ok(logs.length > 0);
    } finally {
        i18n.lang = previousLang;
    }
});

test('world town session upgrades facilities with delivered loot and applies discounts', () => {
    const party = new PartyManager();
    const character = new Character('hero-1', 'Hero', 'infantry');
    party.addToRoster(character);
    party.deployCharacter(character);

    const playerData = new PlayerData();
    playerData.gold = 1000;
    const inventory = new GridInventory(10, 6);
    const stash = new GridInventory(10, 6);
    const herb = getItemDef('herb_common');
    const repairKit = getItemDef('repair_kit');
    assert.ok(herb);
    assert.ok(repairKit);
    inventory.autoPlace(herb)!.quantity = 2;
    stash.autoPlace(repairKit);

    const session = new WorldTownSession({
        party,
        playerData,
        gameManager: { inventory, stash },
        onDeploy: () => undefined,
        log: () => undefined,
    });

    assert.equal(session.getInjuryTreatmentPrice(), 50);
    assert.equal(session.upgradeFacility('infirmary'), true);
    assert.equal(playerData.facilityUpgrades.infirmary, 1);
    assert.equal(playerData.gold, 550);
    assert.equal(inventory.items.some((placed) => placed.item.id === 'herb_common'), false);
    assert.equal(session.getInjuryTreatmentPrice(), 40);

    assert.equal(session.upgradeFacility('workshop'), true);
    assert.equal(playerData.facilityUpgrades.workshop, 1);
    assert.equal(playerData.gold, 50);
    assert.equal(stash.items.some((placed) => placed.item.id === 'repair_kit'), false);
});

test('world town session completes repeat merchant contracts from backpack and stash', () => {
    const party = new PartyManager();
    const character = new Character('hero-1', 'Hero', 'infantry');
    party.addToRoster(character);
    party.deployCharacter(character);

    const playerData = new PlayerData();
    playerData.gold = 100;
    playerData.marketCycle = 1;
    const resin = getItemDef('trade_forest_resin');
    assert.ok(resin);
    playerData.marketContracts = [{
        id: 'coast-resin-contract',
        targetTownId: COAST.id,
        itemId: resin.id,
        remainingQuantity: 3,
        bonusPerUnit: 11,
        expiresCycle: 5,
    }];

    const inventory = new GridInventory(10, 6);
    const stash = new GridInventory(10, 6);
    inventory.autoPlace(resin)!.quantity = 1;
    stash.autoPlace(resin)!.quantity = 2;
    const logs: string[] = [];
    const session = new WorldTownSession({
        party,
        playerData,
        gameManager: { inventory, stash },
        onDeploy: () => undefined,
        log: (message) => logs.push(message),
    });
    session.ui.show(COAST);

    const view = session.getMerchantContractViews().find((contract) => contract.id === 'coast-resin-contract');
    assert.ok(view);
    assert.equal(view.ownedQuantity, 3);
    assert.equal(view.canComplete, true);

    const expectedReward = getSellPrice(resin, COAST.id) * 3 + 33;
    assert.equal(session.completeMerchantContract('coast-resin-contract'), true);

    assert.equal(playerData.gold, 100 + expectedReward);
    assert.equal(inventory.items.some((placed) => placed.item.id === resin.id), false);
    assert.equal(stash.items.some((placed) => placed.item.id === resin.id), false);
    assert.equal(playerData.marketContracts.some((contract) => contract.id === 'coast-resin-contract'), false);
    assert.ok(logs.some((message) => message.includes('납품 의뢰 완료')));
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
    assert.equal(ui.isVisible(), true);
    assert.equal(ui.isDeployPending(), true);

    const duplicate = ui.requestDeploy(1000 + TOWN_DEPLOY_CLICK_GUARD_MS + 1);

    assert.equal(duplicate, false);
    assert.equal(deploys, 1);

    ui.setDeployError('월드 서버 접속 실패: AUTH_FAILED');
    assert.equal(ui.getDeployError(), '월드 서버 접속 실패: AUTH_FAILED');

    ui.hide();
    assert.equal(ui.isDeployPending(), false);
    assert.equal(ui.getDeployError(), null);
});
