import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerHeartbeatAck } from '../../server/WorldHeartbeat';

test('server heartbeat ack preserves client time and join state without DB data', () => {
    const ack = createServerHeartbeatAck(1234, true, 9999);

    assert.deepEqual(ack, {
        type: 'SERVER_HEARTBEAT_ACK',
        clientTime: 1234,
        serverTime: 9999,
        joined: true,
    });
});

test('server heartbeat ack sanitizes malformed client time before world join', () => {
    const ack = createServerHeartbeatAck('not-a-number', false, 5000);

    assert.equal(ack.type, 'SERVER_HEARTBEAT_ACK');
    assert.equal(ack.clientTime, 0);
    assert.equal(ack.serverTime, 5000);
    assert.equal(ack.joined, false);
});
