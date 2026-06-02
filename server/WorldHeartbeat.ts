import type { ServerHeartbeatAckMessage } from '../src/net/WorldProtocol';

export function createServerHeartbeatAck(
    clientTime: unknown,
    joined: boolean,
    now: number = Date.now()
): ServerHeartbeatAckMessage {
    return {
        type: 'SERVER_HEARTBEAT_ACK',
        clientTime: typeof clientTime === 'number' && Number.isFinite(clientTime) ? clientTime : 0,
        serverTime: now,
        joined,
    };
}
