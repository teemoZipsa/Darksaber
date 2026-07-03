import type { NetworkRaidClient } from '../../net/NetworkRaidClient';

export interface WorldEngineNetworkState {
    raidClient: NetworkRaidClient | null;
    isRaid: boolean;
    isConnecting: boolean;
    wasReconnecting: boolean;
    playerId: string | null;
}

export function createWorldEngineNetworkState(): WorldEngineNetworkState {
    return {
        raidClient: null,
        isRaid: false,
        isConnecting: false,
        wasReconnecting: false,
        playerId: null,
    };
}
