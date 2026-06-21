import { cloneMarketSnapshot, type MarketSnapshot } from '../src/data/MarketData';
import {
    isMarketWriteClientMessage,
    type MarketClientMessage,
    type MarketRecordAckMessage,
    type MarketWriteClientMessage,
} from '../src/net/WorldProtocol';

export function requiresJoinedWorldForMarketMessage(message: MarketClientMessage): message is MarketWriteClientMessage {
    return isMarketWriteClientMessage(message);
}

export function createRejectedMarketWriteAck(
    message: MarketWriteClientMessage,
    snapshot: MarketSnapshot,
): MarketRecordAckMessage {
    const kind = message.type === 'MARKET_RECORD_BUY'
        ? 'buy'
        : message.type === 'MARKET_RECORD_SELL'
            ? 'sell'
            : 'touch';
    return {
        type: 'MARKET_RECORD_ACK',
        kind,
        accepted: false,
        snapshot: cloneMarketSnapshot(snapshot),
    };
}
