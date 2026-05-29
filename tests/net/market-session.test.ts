import test from 'node:test';
import assert from 'node:assert/strict';
import { marketStateKey } from '../../src/data/MarketData';
import { ServerMarketSession } from '../../server/ServerMarketSession';

test('server market handles market messages without a world join', () => {
    const session = new ServerMarketSession({ persistPath: null, random: () => 0.99 });

    const hello = session.handleMessage({
        type: 'MARKET_HELLO',
        clientId: 'client-a',
        clientVersion: 'test',
    }, 0);
    assert.equal(hello[0]?.type, 'MARKET_RECORD_ACK');

    const buy = session.handleMessage({
        type: 'MARKET_RECORD_BUY',
        clientId: 'client-a',
        townId: 'w_forest_village',
        itemId: 'trade_forest_resin',
        quantity: 2,
    }, 10);

    assert.equal(buy[0]?.type, 'MARKET_RECORD_ACK');
    assert.equal(buy[0]?.type === 'MARKET_RECORD_ACK' ? buy[0].accepted : false, true);
    assert.equal(
        buy[0]?.type === 'MARKET_RECORD_ACK'
            ? buy[0].snapshot.marketState[marketStateKey('w_forest_village', 'trade_forest_resin')]?.buyPressure
            : 0,
        2
    );
});

test('server market tick recovers pressure and expires contracts', () => {
    const session = new ServerMarketSession({ persistPath: null, random: () => 0.99, cycleMs: 1 });
    const now = Date.now();
    session.handleMessage({
        type: 'MARKET_RECORD_SELL',
        clientId: 'client-a',
        townId: 's_coast_town',
        itemId: 'trade_forest_resin',
        quantity: 3,
    }, now);

    const update = session.tick(now + 5);
    assert.equal(update?.type, 'MARKET_SNAPSHOT');
    assert.equal(
        update?.snapshot.marketState[marketStateKey('s_coast_town', 'trade_forest_resin')]?.sellPressure,
        2
    );
    assert.ok((update?.snapshot.marketContracts.length ?? 0) > 0);
});
