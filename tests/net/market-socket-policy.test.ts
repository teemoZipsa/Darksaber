import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultMarketSnapshot } from '../../src/data/MarketData';
import {
    createRejectedMarketWriteAck,
    requiresJoinedWorldForMarketMessage,
} from '../../server/MarketSocketPolicy';

test('market write messages require a joined world socket', () => {
    assert.equal(requiresJoinedWorldForMarketMessage({
        type: 'MARKET_HELLO',
        clientId: 'client-a',
        clientVersion: 'test',
    }), false);
    assert.equal(requiresJoinedWorldForMarketMessage({
        type: 'MARKET_SNAPSHOT_REQUEST',
        clientId: 'client-a',
    }), false);
    assert.equal(requiresJoinedWorldForMarketMessage({
        type: 'MARKET_RECORD_SELL',
        clientId: 'client-a',
        townId: 'w_forest_village',
        itemId: 'trade_forest_resin',
        quantity: 1,
    }), true);
    assert.equal(requiresJoinedWorldForMarketMessage({
        type: 'MARKET_TOUCH_TOWN',
        clientId: 'client-a',
        townId: 'w_forest_village',
    }), true);
});

test('rejected market write ack preserves snapshot and declines the action', () => {
    const snapshot = createDefaultMarketSnapshot();
    const ack = createRejectedMarketWriteAck({
        type: 'MARKET_RECORD_SELL',
        clientId: 'client-a',
        townId: 'w_forest_village',
        itemId: 'trade_forest_resin',
        quantity: 1,
    }, snapshot);

    assert.equal(ack.type, 'MARKET_RECORD_ACK');
    assert.equal(ack.kind, 'sell');
    assert.equal(ack.accepted, false);
    assert.notEqual(ack.snapshot, snapshot);
});
