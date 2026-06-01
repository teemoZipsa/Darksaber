import test from 'node:test';
import assert from 'node:assert/strict';
import { CHIPPED_GEM_IDS, GEM_ITEM_IDS, RUNE_ITEM_IDS, getItemDef, ITEMS, normalizeItemDef, RawItemDef } from '../../src/data/ItemDB';
import { createBaseStats } from '../../src/data/Stats';
import { getEffectiveStatsForCharacter } from '../../src/combat/StatusEffects';
import { GridInventory, PlacedItem } from '../../src/inventory/GridInventory';
import { InventoryUI } from '../../src/inventory/InventoryUI';
import { getRepairCost, repairItem, unsocketAll } from '../../src/inventory/Socketing';
import { computeRaidFailureLoss } from '../../src/raid/RaidOutcome';
import { resolveTownArrival, shouldAdvanceRaidTimer } from '../../src/raid/RaidRules';
import { WorldMap } from '../../src/map/WorldMap';
import { CHUNK_SIZE } from '../../src/map/Chunk';
import { TileType } from '../../src/map/Tile';
import { getSellPrice, getShopItems, isSellableItem } from '../../src/data/ShopData';
import { BUY_PRESSURE_CAP, LocalMarketService, MARKET_DRIFT_CAP, SELL_PRESSURE_CAP } from '../../src/data/MarketService';
import { marketStateKey } from '../../src/data/MarketData';
import { PlayerData } from '../../src/data/PlayerData';
import { REST_FACILITIES, getRestFacility, getRestMenu } from '../../src/data/RestFacilityData';
import { TOWN_FACILITIES, getTownFacilities, hasTownFacility } from '../../src/data/TownFacilityData';
import { RUMOR_KEYS, TownUI } from '../../src/ui/TownUI';
import { ShopUI } from '../../src/ui/ShopUI';
import { i18n } from '../../src/i18n/LanguageManager';

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

function chunkCenter(chunkX: number, chunkY: number): { x: number; y: number } {
    return {
        x: chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        y: chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
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

test('town facilities cover mortal and master towns', () => {
    const mortalTownIds = new WorldMap('mortal').getTowns().map((town) => town.id);
    const masterTownIds = new WorldMap('master').getTowns().map((town) => town.id);
    const expectedTownIds = [...mortalTownIds, ...masterTownIds].sort();

    assert.deepEqual(Object.keys(TOWN_FACILITIES).sort(), expectedTownIds);
    assert.deepEqual(getTownFacilities('central_castle'), ['storage', 'weapon_shop', 'general_store', 'blacksmith', 'rest', 'healer', 'quest', 'rumors']);
    assert.equal(hasTownFacility('e_outpost', 'rest'), false);
    assert.equal(hasTownFacility('e_stronghold', 'blacksmith'), true);
    assert.equal(hasTownFacility('master_sanctum', 'shrine'), true);
});

test('shop inventory is split by town facility while legacy town calls still work', () => {
    const kaosiaWeapons = getShopItems('central_castle', 'weapon_shop', 'weapon');
    const belfuersWeapons = getShopItems('w_forest_village', 'weapon_shop', 'weapon');
    const sicilioArmor = getShopItems('s_coast_town', 'armor_shop', 'armor');
    const weaponConsumables = getShopItems('central_castle', 'weapon_shop', 'consumable');
    const consumables = getShopItems('central_castle', 'general_store', 'consumable');
    const legacyConsumables = getShopItems('central_castle', 'consumable');
    const accessories = getShopItems('central_castle', 'accessory');

    assert.ok(kaosiaWeapons.length > 0);
    assert.ok(belfuersWeapons.length > kaosiaWeapons.length);
    assert.ok(sicilioArmor.some(({ item }) => item.id === 'web_67_02'));
    assert.equal(weaponConsumables.length, 0);
    assert.ok(consumables.length > 0);
    assert.ok(legacyConsumables.some(({ item }) => item.id === 'herb_cheap'));
    assert.ok(kaosiaWeapons.every(({ shopEntry, item }) => shopEntry.shopKind === 'weapon' && item.slot === 'weapon'));
    assert.ok(sicilioArmor.every(({ shopEntry, item }) => shopEntry.shopKind === 'armor' && ['shield', 'head', 'body', 'boots'].includes(item.slot)));
    assert.ok(consumables.every(({ shopEntry, item }) => shopEntry.shopKind === 'consumable' && item.slot === 'consumable'));
    assert.ok(accessories.every(({ shopEntry }) => shopEntry.shopKind === 'accessory'));
    assert.deepEqual(accessories.map(({ item }) => item.id).sort(), [...CHIPPED_GEM_IDS].sort());
    assert.notDeepEqual(
        kaosiaWeapons.map(({ item }) => item.id),
        belfuersWeapons.map(({ item }) => item.id),
    );
});

test('shop limited stock persists across DOM panel refreshes', () => {
    const shop = new ShopUI();
    shop.onBuy = () => true;
    shop.setTownId('se_port');
    shop.setFacilityId('specialty_trader');
    shop.setActiveKind('consumable');

    const findLimitedHerb = () => shop.listBuyEntries().find(({ item }) => item.id === 'herb_legendary');
    const entry = findLimitedHerb();

    assert.ok(entry);
    assert.equal(entry.remaining, 1);
    assert.equal(shop.buy(entry), true);
    assert.equal(entry.remaining, 0);

    shop.hide();
    shop.show();

    assert.equal(findLimitedHerb()?.remaining, 0);
});

test('consumables are restricted by town facility', () => {
    for (const [townId, facilities] of Object.entries(TOWN_FACILITIES)) {
        if (!facilities.includes('general_store')) continue;
        const itemIds = getShopItems(townId, 'general_store', 'consumable').map(({ item }) => item.id);
        assert.ok(itemIds.includes('herb_cheap'), `${townId} should sell cheap herb in the general store`);
    }

    assert.ok(getShopItems('central_castle', 'general_store', 'consumable').some(({ item }) => item.id === 'herb_common'));
    assert.equal(getShopItems('e_outpost', 'general_store', 'consumable').some(({ item }) => item.id === 'herb_common'), false);
    assert.ok(getShopItems('w_forest_village', 'specialty_trader', 'consumable').some(({ item }) => item.id === 'herb_rare'));
    assert.ok(getShopItems('se_port', 'specialty_trader', 'consumable').some(({ item }) => item.id === 'herb_legendary'));
    assert.ok(getShopItems('nw_desert_city', 'general_store', 'consumable').some(({ item }) => item.id === 'mp_potion'));
    assert.ok(getShopItems('e_stronghold', 'armor_shop', 'consumable').some(({ item }) => item.id === 'repair_kit'));
    assert.equal(getShopItems('central_castle', 'general_store', 'consumable').some(({ item }) => item.id === 'repair_kit'), false);
    assert.ok(getShopItems('w_forest_village', 'general_store', 'consumable').some(({ item }) => item.id === 'antidote'));
    assert.ok(getShopItems('nw_desert_city', 'general_store', 'consumable').some(({ item }) => item.id === 'fire_herb'));
    assert.ok(getShopItems('sw_hideout', 'specialty_trader', 'consumable').some(({ item }) => item.id === 'ice_herb'));
});

test('rune and gem socket items replace sin core item types', () => {
    assert.equal(RUNE_ITEM_IDS.length, 33);
    assert.equal(GEM_ITEM_IDS.length, 35);
    assert.equal(new Set(RUNE_ITEM_IDS).size, 33);
    assert.equal(new Set(GEM_ITEM_IDS).size, 35);
    assert.equal(ITEMS.some((item) => item.slot === ('sin_core' as never) || item.itemCategory === ('sin_core' as never)), false);
    assert.ok(RUNE_ITEM_IDS.every((id) => getItemDef(id)?.slot === 'rune'));
    assert.ok(GEM_ITEM_IDS.every((id) => getItemDef(id)?.slot === 'gem'));
});

test('shops sell only chipped gems from socket inserts and never runes', () => {
    const allCentral = getShopItems('central_castle');
    const accessories = getShopItems('central_castle', 'accessory');

    assert.ok(CHIPPED_GEM_IDS.every((id) => accessories.some(({ item }) => item.id === id)));
    assert.equal(allCentral.some(({ item }) => item.slot === 'rune'), false);
    assert.equal(allCentral.some(({ item }) => item.slot === 'gem' && !CHIPPED_GEM_IDS.includes(item.id)), false);
});

test('equipment and socket bonuses are included in effective character stats', () => {
    const base = createBaseStats({ atk: 10, def: 5 });
    const sword = placed('short_sword');
    const ruby = getItemDef('gem_chipped_ruby');
    assert.ok(ruby);
    sword.sockets = [ruby];

    const effective = getEffectiveStatsForCharacter({
        stats: base,
        statuses: [],
        equipment: new Map([['weapon', sword]]),
    });
    assert.equal(effective.atk, 19);

    sword.durability = 0;
    const broken = getEffectiveStatsForCharacter({
        stats: base,
        statuses: [],
        equipment: new Map([['weapon', sword]]),
    });
    assert.equal(broken.atk, 10);
});

test('socket insertion respects equipment socket limits', () => {
    const bag = new GridInventory(5, 5);
    const ext = new GridInventory(5, 5);
    const inv = new InventoryUI(bag);
    inv.setExternalGrid(ext, 'test');
    const host = ext.place(getItemDef('short_sword')!, 0, 0);
    const gem = bag.place(getItemDef('gem_chipped_ruby')!, 0, 0);
    const rune = bag.place(getItemDef('rune_el')!, 1, 0);
    assert.ok(host);
    assert.ok(gem);
    assert.ok(rune);

    assert.equal(inv.moveToCell(gem, { kind: 'grid', grid: 'bag', gridX: 0, gridY: 0 }, 'ext', 0, 0), true);
    assert.equal(host.sockets?.length, 1);
    assert.equal(inv.moveToCell(rune, { kind: 'grid', grid: 'bag', gridX: 1, gridY: 0 }, 'ext', 0, 0), false);
    assert.equal(host.sockets?.length, 1);
});

test('raid loot transfers mark acquired items and report original loot cells', () => {
    const bag = new GridInventory(8, 8);
    const ext = new GridInventory(8, 8);
    const inv = new InventoryUI(bag);
    inv.setExternalGrid(ext, 'raid loot', { isRaidLoot: true });

    const movedByDrop = ext.place(getItemDef('herb_cheap')!, 2, 1);
    const movedByClick = ext.place(getItemDef('mp_potion')!, 3, 1);
    const movedByTakeAll = ext.place(getItemDef('antidote')!, 4, 1);
    assert.ok(movedByDrop);
    assert.ok(movedByClick);
    assert.ok(movedByTakeAll);

    const secured: Array<{ itemId: string; source?: { gridX: number; gridY: number } }> = [];
    inv.onRaidLootSecured = (placed, source) => secured.push({ itemId: placed.item.id, source });

    assert.equal(inv.moveToCell(movedByDrop, { kind: 'grid', grid: 'ext', gridX: 2, gridY: 1 }, 'bag', 0, 0), true);
    assert.equal(movedByDrop.acquiredInRaid, true);
    assert.equal(inv.quickMove(movedByClick, { kind: 'grid', grid: 'ext', gridX: 3, gridY: 1 }), true);
    assert.equal(movedByClick.acquiredInRaid, true);
    assert.match(inv.takeAll(), /전리품 획득/);
    assert.equal(movedByTakeAll.acquiredInRaid, true);

    assert.deepEqual(secured, [
        { itemId: 'herb_cheap', source: { gridX: 2, gridY: 1 } },
        { itemId: 'mp_potion', source: { gridX: 3, gridY: 1 } },
        { itemId: 'antidote', source: { gridX: 4, gridY: 1 } },
    ]);
});

test('blacksmith repair and unsocket helpers charge gold and preserve equipment', () => {
    const sword = placed('short_sword');
    sword.durability = 50;
    const repairCost = getRepairCost(sword);
    const repaired = repairItem(sword, repairCost);
    assert.equal(repaired.ok, true);
    assert.equal(repaired.remainingGold, 0);
    assert.equal(sword.durability, sword.item.maxDurability);

    const ruby = getItemDef('gem_chipped_ruby');
    assert.ok(ruby);
    sword.sockets = [ruby];
    sword.durability = sword.item.maxDurability - 1;
    assert.equal(unsocketAll(sword, new GridInventory(2, 1), 999).reason, 'not-repaired');

    sword.durability = sword.item.maxDurability;
    const target = new GridInventory(2, 1);
    const extracted = unsocketAll(sword, target, 999);
    assert.equal(extracted.ok, true);
    assert.equal(sword.sockets.length, 0);
    assert.equal(target.items.length, 1);
    assert.equal(target.items[0].item.id, 'gem_chipped_ruby');
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

test('trade goods sell for different prices by destination town', () => {
    const resin = getItemDef('trade_forest_resin');
    const herb = getItemDef('herb_common');
    assert.ok(resin);
    assert.ok(herb);

    const forestSell = getSellPrice(resin, 'w_forest_village');
    const coastSell = getSellPrice(resin, 's_coast_town');

    assert.ok(coastSell > forestSell);
    assert.ok(coastSell > (resin.buyPrice ?? resin.baseValue));
    assert.equal(getSellPrice(herb, 's_coast_town'), 25);
});

test('local market prices adjust trade goods while leaving ordinary items alone', () => {
    const player = new PlayerData();
    const market = new LocalMarketService(player, () => 0.99);
    const resin = getItemDef('trade_forest_resin');
    const herb = getItemDef('herb_common');
    assert.ok(resin);
    assert.ok(herb);

    const baseBuy = resin.buyPrice ?? resin.baseValue;
    const baseSell = getSellPrice(resin, 's_coast_town');
    const herbBuy = herb.buyPrice ?? herb.baseValue;
    const herbSell = getSellPrice(herb, 's_coast_town');

    assert.equal(market.getBuyPrice(resin, baseBuy, 'w_forest_village'), baseBuy);
    assert.equal(market.getSellPrice(resin, baseSell, 's_coast_town'), baseSell);

    market.recordBuy('w_forest_village', resin.id, 20);
    const pressuredBuy = market.getBuyPrice(resin, baseBuy, 'w_forest_village');
    assert.ok(pressuredBuy > baseBuy);
    assert.ok(pressuredBuy <= Math.floor(baseBuy * (1 + BUY_PRESSURE_CAP + MARKET_DRIFT_CAP)));

    market.recordSell('s_coast_town', resin.id, 20);
    const pressuredSell = market.getSellPrice(resin, baseSell, 's_coast_town');
    assert.ok(pressuredSell < baseSell);
    assert.ok(pressuredSell >= Math.floor(baseSell * (1 - SELL_PRESSURE_CAP - MARKET_DRIFT_CAP)));

    assert.equal(market.getBuyPrice(herb, herbBuy, 'w_forest_village'), herbBuy);
    assert.equal(market.getSellPrice(herb, herbSell, 's_coast_town'), herbSell);
});

test('market drift rolls on town visits within the configured cap', () => {
    const player = new PlayerData();
    const rolls = [0, 0.5, 0.9];
    const market = new LocalMarketService(player, () => rolls.shift() ?? 0.99);

    market.rollTownVisit('w_forest_village');

    const state = player.marketState[marketStateKey('w_forest_village', 'trade_forest_resin')];
    assert.ok(state);
    assert.ok(state.drift > 0);
    assert.ok(state.drift <= MARKET_DRIFT_CAP);
});

test('market state persists and old saves load with a default market state', () => {
    const previousStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
    };

    try {
        const player = new PlayerData();
        const market = new LocalMarketService(player, () => 0.99);
        market.recordBuy('w_forest_village', 'trade_forest_resin', 2);
        market.recordSell('s_coast_town', 'trade_forest_resin', 3);
        player.save();

        const loaded = new PlayerData();
        loaded.load();
        assert.equal(loaded.marketState[marketStateKey('w_forest_village', 'trade_forest_resin')]?.buyPressure, 2);
        assert.equal(loaded.marketState[marketStateKey('s_coast_town', 'trade_forest_resin')]?.sellPressure, 3);

        store.set('sin_eater_save', JSON.stringify({ gold: 12, clearedStages: [], inventory: [], equipped: {}, lastSaved: '' }));
        const oldSave = new PlayerData();
        oldSave.load();
        assert.deepEqual(oldSave.marketState, {});
    } finally {
        globalThis.localStorage = previousStorage;
    }
});

test('market cycle recovery decays pressure and keeps contracts safe', () => {
    const player = new PlayerData();
    const market = new LocalMarketService(player, () => 0.99);
    const key = marketStateKey('s_coast_town', 'trade_forest_resin');
    player.marketState[key] = { buyPressure: 2, sellPressure: 3, drift: 0.08 };
    player.marketContracts = [{
        id: 'expired-contract',
        targetTownId: 's_coast_town',
        itemId: 'trade_forest_resin',
        remainingQuantity: 2,
        bonusPerUnit: 10,
        expiresCycle: 1,
    }];
    player.marketCycle = 1;

    market.advanceMarketCycle();

    assert.equal(player.marketCycle, 2);
    assert.equal(player.marketState[key].buyPressure, 1);
    assert.equal(player.marketState[key].sellPressure, 2);
    assert.ok(player.marketState[key].drift > 0);
    assert.ok(player.marketState[key].drift < 0.08);
    assert.equal(player.marketContracts.some((contract) => contract.id === 'expired-contract'), false);
});

test('trade contracts add sell bonuses and only consume matching quantities', () => {
    const player = new PlayerData();
    const market = new LocalMarketService(player, () => 0.99);
    const resin = getItemDef('trade_forest_resin');
    assert.ok(resin);
    player.marketCycle = 1;
    player.marketContracts = [{
        id: 'coast-resin-contract',
        targetTownId: 's_coast_town',
        itemId: resin.id,
        remainingQuantity: 2,
        bonusPerUnit: 11,
        expiresCycle: 5,
    }];

    const baseUnit = getSellPrice(resin, 's_coast_town');
    const quote = market.getSellQuote(resin, baseUnit, 's_coast_town', 3);
    assert.equal(quote.basePrice, baseUnit * 3);
    assert.equal(quote.bonusPrice, 22);
    assert.equal(quote.totalPrice, baseUnit * 3 + 22);
    assert.equal(quote.contractQuantity, 2);

    market.recordSell('s_coast_town', resin.id, 3);

    assert.equal(player.marketContracts.some((contract) => contract.id === 'coast-resin-contract'), false);
    const wrongTownQuote = market.getSellQuote(resin, baseUnit, 'central_castle', 1);
    assert.equal(wrongTownQuote.bonusPrice, 0);
});

test('market rumors are limited to rumor facilities and reflect cooled demand', () => {
    const player = new PlayerData();
    const market = new LocalMarketService(player, () => 0.99);
    market.recordSell('central_castle', 'trade_forest_resin', 3);
    const rumor = market.getMarketRumor('central_castle');
    assert.ok(rumor?.includes('숲 수지'));
    assert.ok(rumor?.includes('값이 식었다'));

    const ui = new TownUI(new GridInventory(5, 5), new GridInventory(5, 5));
    ui.getMarketRumor = () => '시장 소문';
    ui.show({ id: 'central_castle', name: 'Kaosia', nameKr: '카오시아', chunkX: 0, chunkY: 0, radius: 1 });
    assert.equal(ui.getRumors().filter((entry) => entry === '시장 소문').length, 1);

    ui.show({ id: 'e_stronghold', name: 'Entria', nameKr: '엔트리아', chunkX: 0, chunkY: 0, radius: 1 });
    assert.equal(ui.getRumors().includes('시장 소문'), false);
});

test('town rumor keys resolve in both supported languages', () => {
    const previousLang = i18n.lang;
    try {
        for (const lang of ['ko', 'en'] as const) {
            i18n.setLanguage(lang);
            for (const key of RUMOR_KEYS) {
                assert.notEqual(i18n.t(key), key);
            }
        }
    } finally {
        i18n.setLanguage(previousLang);
    }
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
    const bomb = getItemDef('quest_bomb');
    assert.ok(bomb);
    assert.equal(isSellableItem(bomb), false);
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

test('WorldMap exposes original Darksaber town display names while keeping stable town ids', () => {
    const world = new WorldMap();
    const namesById = new Map(world.getTowns().map((town) => [town.id, town.nameKr]));

    assert.equal(namesById.get('central_castle'), '카오시아');
    assert.equal(namesById.get('w_forest_village'), '벨퓌어스');
    assert.equal(namesById.get('s_coast_town'), '시시리오');
    assert.equal(namesById.get('e_stronghold'), '엔트리아');
    assert.equal(namesById.get('se_port'), '아리크나');
});

test('WorldMap exposes walkable non-town exits for every town', () => {
    const world = new WorldMap();
    const formationOffsets = [
        { x: 0, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
    ];

    for (const town of world.getTowns()) {
        const exit = world.getTownExitTile(town);
        assert.ok(world.isWalkable(exit.x, exit.y), `${town.id} exit should be walkable`);
        assert.notEqual(world.getTownAtTile(exit.x, exit.y)?.id, town.id, `${town.id} exit should leave town radius`);
        for (const offset of formationOffsets) {
            const tile = { x: exit.x + offset.x, y: exit.y + offset.y };
            assert.ok(world.isWalkable(tile.x, tile.y), `${town.id} exit formation tile should be walkable`);
            assert.notEqual(world.getTownAtTile(tile.x, tile.y)?.id, town.id, `${town.id} exit formation should not re-enter town`);
        }
    }

    const kaosia = world.getTowns().find((town) => town.id === 'central_castle');
    assert.ok(kaosia);
    const kaosiaExit = world.getTownExitTile(kaosia);
    assert.equal(world.getTileAt(kaosiaExit.x, kaosiaExit.y), TileType.ROAD);
});

test('rest facility data matches every world town and keeps menu ids unique', () => {
    const world = new WorldMap();
    const townIds = world.getTowns().map((town) => town.id).sort();
    const restTownIds = Object.keys(REST_FACILITIES).sort();

    assert.deepEqual(restTownIds, townIds);
    assert.equal(getRestFacility('e_outpost'), null);

    const menuIds = new Set<string>();
    for (const [townId, facility] of Object.entries(REST_FACILITIES)) {
        if (!facility) continue;
        assert.ok(facility.menu.length > 0, `${townId} should expose at least one rest menu`);
        for (const menu of facility.menu) {
            assert.equal(menuIds.has(menu.id), false, `${menu.id} should be unique`);
            menuIds.add(menu.id);
            assert.equal(getRestMenu(menu.id)?.id, menu.id);
            assert.ok(menu.price >= 20 && menu.price <= 120);
        }
    }
});

test('pending rest menu id persists through PlayerData save and load', () => {
    const previousStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
    };

    try {
        const player = new PlayerData();
        player.gold = 321;
        player.currentHubTownId = 'w_forest_village';
        player.pendingRestMenuId = 'hearty_breakfast';
        player.addQuestItem('quest_bomb');
        player.addStoryCompanion('story_cleric_ep02');
        player.save();

        const loaded = new PlayerData();
        loaded.load();

        assert.equal(loaded.gold, 321);
        assert.equal(loaded.currentHubTownId, 'w_forest_village');
        assert.equal(loaded.pendingRestMenuId, 'hearty_breakfast');
        assert.equal(loaded.hasQuestItem('quest_bomb'), true);
        assert.equal(loaded.hasStoryCompanion('story_cleric_ep02'), true);
    } finally {
        globalThis.localStorage = previousStorage;
    }
});

test('WorldMap lays deterministic travel roads through major route anchors', () => {
    const world = new WorldMap();
    const roadAnchors = [
        { label: 'desert to central', chunkX: 23, chunkY: 23 },
        { label: 'forest to central', chunkX: 20, chunkY: 48 },
        { label: 'central to coast', chunkX: 39, chunkY: 62 },
        { label: 'hideout to coast', chunkX: 24, chunkY: 82 },
        { label: 'east road', chunkX: 64, chunkY: 35 },
    ];

    for (const anchor of roadAnchors) {
        const tile = chunkCenter(anchor.chunkX, anchor.chunkY);
        assert.equal(world.getTileAt(tile.x, tile.y), TileType.ROAD, `${anchor.label} should contain a road`);
        assert.ok(world.isWalkable(tile.x, tile.y), `${anchor.label} road should be walkable`);
    }
});

test('WorldMap lays deterministic rivers while road crossings remain walkable', () => {
    const world = new WorldMap();
    const riverAnchors = [
        { label: 'western river', chunkX: 34, chunkY: 48 },
        { label: 'southern river', chunkX: 29, chunkY: 59 },
        { label: 'eastern river', chunkX: 66, chunkY: 31 },
    ];

    for (const anchor of riverAnchors) {
        const tile = chunkCenter(anchor.chunkX, anchor.chunkY);
        assert.equal(world.getTileAt(tile.x, tile.y), TileType.WATER, `${anchor.label} should contain river water`);
    }

    const bridge = chunkCenter(64, 35);
    assert.equal(world.getTileAt(bridge.x, bridge.y), TileType.ROAD);
    assert.ok(world.isWalkable(bridge.x, bridge.y), 'road crossing should stay walkable');
});

test('WorldMap keeps near and far out-of-bounds water behavior', () => {
    const world = new WorldMap();
    const bounds = world.getBoundsTiles();

    assert.equal(world.getTileAt(-1, 0), TileType.WATER);
    assert.equal(world.getTileAt(bounds.width, bounds.height - 1), TileType.WATER);
    assert.equal(world.getTileAt(-CHUNK_SIZE - 1, 0), TileType.DEEP_WATER);
    assert.equal(world.getTileAt(bounds.width + CHUNK_SIZE, bounds.height + CHUNK_SIZE), TileType.DEEP_WATER);
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

