import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridMarketService } from '../../src/data/HybridMarketService';
import { marketStateKey } from '../../src/data/MarketData';
import { PlayerData } from '../../src/data/PlayerData';

test('hybrid market defaults solo towns to canonical PlayerData market state', () => {
    const player = new PlayerData();
    const market = new HybridMarketService(player);

    market.recordBuy('w_forest_village', 'trade_forest_resin', 2);

    const state = player.marketState[marketStateKey('w_forest_village', 'trade_forest_resin')];
    assert.equal(state?.buyPressure, 2);
});

test('hybrid market server mode does not mutate solo PlayerData state without server ack', () => {
    const player = new PlayerData();
    const market = new HybridMarketService(player, { useServerMarket: true });

    market.recordBuy('w_forest_village', 'trade_forest_resin', 2);

    const state = player.marketState[marketStateKey('w_forest_village', 'trade_forest_resin')];
    assert.equal(state, undefined);
});
