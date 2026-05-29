export interface MarketEntryState {
    buyPressure: number;
    sellPressure: number;
    drift: number;
}

export type MarketState = Record<string, MarketEntryState>;

export function createDefaultMarketState(): MarketState {
    return {};
}

export function marketStateKey(townId: string, itemId: string): string {
    return `${townId}:${itemId}`;
}

export function normalizeMarketState(raw: unknown): MarketState {
    if (!raw || typeof raw !== 'object') return createDefaultMarketState();
    const result: MarketState = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as Partial<MarketEntryState>;
        result[key] = {
            buyPressure: safeNumber(entry.buyPressure),
            sellPressure: safeNumber(entry.sellPressure),
            drift: safeNumber(entry.drift),
        };
    }
    return result;
}

function safeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
