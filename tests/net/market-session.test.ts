import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { marketStateKey } from '../../src/data/MarketData';
import { MARKET_MAX_TRADE_QUANTITY, ServerMarketSession } from '../../server/ServerMarketSession';

test('server market session records buy pressure for valid trade goods', () => {
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

test('server market rejects invalid town, item, and quantity without mutating state', () => {
    const session = new ServerMarketSession({ persistPath: null, random: () => 0.99 });
    const key = marketStateKey('w_forest_village', 'trade_forest_resin');

    const invalidTown = session.handleMessage({
        type: 'MARKET_RECORD_SELL',
        clientId: 'client-a',
        townId: 'not_a_real_town',
        itemId: 'trade_forest_resin',
        quantity: 1,
    }, 1);
    assert.equal(invalidTown[0]?.type, 'MARKET_RECORD_ACK');
    assert.equal(invalidTown[0]?.type === 'MARKET_RECORD_ACK' ? invalidTown[0].accepted : true, false);
    assert.equal(session.getSnapshot().marketState[key]?.sellPressure ?? 0, 0);

    const invalidItem = session.handleMessage({
        type: 'MARKET_RECORD_BUY',
        clientId: 'client-a',
        townId: 'w_forest_village',
        itemId: 'trade_fake_good',
        quantity: 1,
    }, 2);
    assert.equal(invalidItem[0]?.type === 'MARKET_RECORD_ACK' ? invalidItem[0].accepted : true, false);
    assert.equal(session.getSnapshot().marketState[key]?.buyPressure ?? 0, 0);

    const hugeQuantity = session.handleMessage({
        type: 'MARKET_RECORD_BUY',
        clientId: 'client-a',
        townId: 'w_forest_village',
        itemId: 'trade_forest_resin',
        quantity: MARKET_MAX_TRADE_QUANTITY + 1,
    }, 3);
    assert.equal(hugeQuantity[0]?.type === 'MARKET_RECORD_ACK' ? hugeQuantity[0].accepted : true, false);
    assert.equal(session.getSnapshot().marketState[key]?.buyPressure ?? 0, 0);

    const touch = session.handleMessage({
        type: 'MARKET_TOUCH_TOWN',
        clientId: 'client-a',
        townId: 'bogus_town',
    }, 4);
    assert.equal(touch[0]?.type === 'MARKET_RECORD_ACK' ? touch[0].accepted : true, false);
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

test('server market persists with backup recovery when the primary file is corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-market-'));
    const persistPath = join(dir, 'market-state.json');
    try {
        const first = new ServerMarketSession({ persistPath, random: () => 0.99 });
        first.handleMessage({
            type: 'MARKET_RECORD_BUY',
            clientId: 'client-a',
            townId: 'w_forest_village',
            itemId: 'trade_forest_resin',
            quantity: 2,
        }, 10);
        first.flushSave();

        const second = new ServerMarketSession({ persistPath, random: () => 0.99 });
        second.handleMessage({
            type: 'MARKET_RECORD_SELL',
            clientId: 'client-a',
            townId: 's_coast_town',
            itemId: 'trade_forest_resin',
            quantity: 3,
        }, 20);
        second.flushSave();

        assert.equal(existsSync(`${persistPath}.bak`), true);
        writeFileSync(persistPath, '{"marketState":', 'utf8');

        const recovered = new ServerMarketSession({ persistPath, random: () => 0.99 });
        const snapshot = recovered.getSnapshot();
        assert.equal(
            snapshot.marketState[marketStateKey('w_forest_village', 'trade_forest_resin')]?.buyPressure,
            2
        );
        assert.equal(readFileSync(persistPath, 'utf8'), '{"marketState":');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
