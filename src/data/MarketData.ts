import { getItemDef } from './ItemDB';
import { isTradeGoodItemId, TRADE_GOOD_SELL_MULTIPLIERS } from './ShopData';

export interface MarketEntryState {
    buyPressure: number;
    sellPressure: number;
    drift: number;
}

export type MarketState = Record<string, MarketEntryState>;

export interface MarketContract {
    id: string;
    targetTownId: string;
    itemId: string;
    remainingQuantity: number;
    bonusPerUnit: number;
    expiresCycle: number;
}

export interface MarketSnapshot {
    marketState: MarketState;
    marketCycle: number;
    marketContracts: MarketContract[];
}

export interface MarketSellQuote {
    basePrice: number;
    bonusPrice: number;
    totalPrice: number;
    contractId?: string;
    contractQuantity?: number;
}

export const BUY_PRESSURE_CAP = 0.2;
export const SELL_PRESSURE_CAP = 0.25;
export const MARKET_DRIFT_CAP = 0.08;
export const BUY_PRESSURE_STEP = 0.04;
export const SELL_PRESSURE_STEP = 0.05;
export const MARKET_CONTRACT_TARGET_COUNT = 5;

export function createDefaultMarketState(): MarketState {
    return {};
}

export function createDefaultMarketSnapshot(): MarketSnapshot {
    return {
        marketState: createDefaultMarketState(),
        marketCycle: 0,
        marketContracts: [],
    };
}

export function marketStateKey(townId: string, itemId: string): string {
    return `${townId}:${itemId}`;
}

export function normalizeMarketCycle(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.floor(raw));
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

export function normalizeMarketContracts(raw: unknown, marketCycle: number = 0): MarketContract[] {
    if (!Array.isArray(raw)) return [];
    const contracts: MarketContract[] = [];
    const seen = new Set<string>();
    for (const value of raw) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as Partial<MarketContract>;
        if (typeof entry.targetTownId !== 'string' || typeof entry.itemId !== 'string') continue;
        if (!isTradeGoodItemId(entry.itemId)) continue;
        const key = `${entry.targetTownId}:${entry.itemId}`;
        if (seen.has(key)) continue;

        const remainingQuantity = Math.floor(safeNumber(entry.remainingQuantity));
        const bonusPerUnit = Math.floor(safeNumber(entry.bonusPerUnit));
        const expiresCycle = Math.floor(safeNumber(entry.expiresCycle));
        if (remainingQuantity <= 0 || bonusPerUnit <= 0 || expiresCycle <= marketCycle) continue;

        seen.add(key);
        contracts.push({
            id: typeof entry.id === 'string' && entry.id ? entry.id : marketContractId(entry.targetTownId, entry.itemId, expiresCycle),
            targetTownId: entry.targetTownId,
            itemId: entry.itemId,
            remainingQuantity,
            bonusPerUnit,
            expiresCycle,
        });
    }
    return contracts;
}

export function normalizeMarketSnapshot(raw: unknown): MarketSnapshot {
    if (!raw || typeof raw !== 'object') return createDefaultMarketSnapshot();
    const value = raw as Partial<MarketSnapshot>;
    const marketCycle = normalizeMarketCycle(value.marketCycle);
    return {
        marketState: normalizeMarketState(value.marketState),
        marketCycle,
        marketContracts: normalizeMarketContracts(value.marketContracts, marketCycle),
    };
}

export function cloneMarketSnapshot(snapshot: MarketSnapshot): MarketSnapshot {
    return {
        marketState: Object.fromEntries(
            Object.entries(snapshot.marketState).map(([key, value]) => [key, { ...value }])
        ),
        marketCycle: snapshot.marketCycle,
        marketContracts: snapshot.marketContracts.map((contract) => ({ ...contract })),
    };
}

export function calculateMarketBuyPrice(basePrice: number, state: MarketEntryState): number {
    const pressure = Math.min(BUY_PRESSURE_CAP, state.buyPressure * BUY_PRESSURE_STEP);
    const multiplier = clamp(1 + pressure + state.drift, 1 - MARKET_DRIFT_CAP, 1 + BUY_PRESSURE_CAP + MARKET_DRIFT_CAP);
    return Math.max(1, Math.floor(basePrice * multiplier));
}

export function calculateMarketSellPrice(basePrice: number, state: MarketEntryState): number {
    const pressure = Math.min(SELL_PRESSURE_CAP, state.sellPressure * SELL_PRESSURE_STEP);
    const multiplier = clamp(1 - pressure + state.drift, 1 - SELL_PRESSURE_CAP - MARKET_DRIFT_CAP, 1 + MARKET_DRIFT_CAP);
    return Math.max(1, Math.floor(basePrice * multiplier));
}

export function getOrCreateMarketEntry(snapshot: MarketSnapshot, townId: string, itemId: string): MarketEntryState {
    const key = marketStateKey(townId, itemId);
    snapshot.marketState[key] ??= { buyPressure: 0, sellPressure: 0, drift: 0 };
    return snapshot.marketState[key];
}

export function advanceMarketCycle(snapshot: MarketSnapshot, random: () => number = Math.random): boolean {
    snapshot.marketCycle = normalizeMarketCycle(snapshot.marketCycle) + 1;
    for (const entry of Object.values(snapshot.marketState)) {
        entry.buyPressure = Math.max(0, entry.buyPressure - 1);
        entry.sellPressure = Math.max(0, entry.sellPressure - 1);
        entry.drift = decayDrift(entry.drift);
    }
    snapshot.marketContracts = normalizeMarketContracts(snapshot.marketContracts, snapshot.marketCycle);
    ensureMarketContracts(snapshot, random);
    return true;
}

export function ensureMarketContracts(
    snapshot: MarketSnapshot,
    random: () => number = Math.random,
    targetCount: number = MARKET_CONTRACT_TARGET_COUNT
): void {
    snapshot.marketContracts = normalizeMarketContracts(snapshot.marketContracts, snapshot.marketCycle);
    const activeKeys = new Set(snapshot.marketContracts.map((contract) => `${contract.targetTownId}:${contract.itemId}`));
    const candidates = buildContractCandidates().filter((candidate) => !activeKeys.has(`${candidate.targetTownId}:${candidate.itemId}`));

    while (snapshot.marketContracts.length < targetCount && candidates.length > 0) {
        const index = Math.floor(random() * candidates.length);
        const [candidate] = candidates.splice(Math.max(0, Math.min(index, candidates.length - 1)), 1);
        const item = getItemDef(candidate.itemId);
        const base = item?.buyPrice ?? item?.baseValue ?? 10;
        const quantity = 2 + Math.floor(random() * 4);
        const bonusRate = 0.15 + random() * 0.15;
        const expiresCycle = snapshot.marketCycle + 3 + Math.floor(random() * 3);
        snapshot.marketContracts.push({
            id: marketContractId(candidate.targetTownId, candidate.itemId, expiresCycle),
            targetTownId: candidate.targetTownId,
            itemId: candidate.itemId,
            remainingQuantity: quantity,
            bonusPerUnit: Math.max(5, Math.floor(base * bonusRate)),
            expiresCycle,
        });
        activeKeys.add(`${candidate.targetTownId}:${candidate.itemId}`);
    }
}

export function getActiveMarketContracts(snapshot: MarketSnapshot, targetTownId?: string): MarketContract[] {
    return normalizeMarketContracts(snapshot.marketContracts, snapshot.marketCycle)
        .filter((contract) => !targetTownId || contract.targetTownId === targetTownId)
        .sort((a, b) => b.bonusPerUnit - a.bonusPerUnit || a.expiresCycle - b.expiresCycle);
}

export function quoteMarketContractBonus(
    snapshot: MarketSnapshot,
    townId: string | null | undefined,
    itemId: string,
    quantity: number
): MarketSellQuote {
    const basePrice = 0;
    const contract = findBestContract(snapshot, townId, itemId);
    if (!contract || quantity <= 0) return { basePrice, bonusPrice: 0, totalPrice: basePrice };
    const contractQuantity = Math.min(Math.max(1, Math.floor(quantity)), contract.remainingQuantity);
    const bonusPrice = contractQuantity * contract.bonusPerUnit;
    return {
        basePrice,
        bonusPrice,
        totalPrice: basePrice + bonusPrice,
        contractId: contract.id,
        contractQuantity,
    };
}

export function applyMarketContractSale(
    snapshot: MarketSnapshot,
    townId: string | null | undefined,
    itemId: string,
    quantity: number
): number {
    const best = findBestContract(snapshot, townId, itemId);
    if (!best || quantity <= 0) return 0;
    const contract = snapshot.marketContracts.find((candidate) => candidate.id === best.id);
    if (!contract) return 0;
    const applied = Math.min(Math.max(1, Math.floor(quantity)), contract.remainingQuantity);
    contract.remainingQuantity -= applied;
    snapshot.marketContracts = normalizeMarketContracts(snapshot.marketContracts, snapshot.marketCycle);
    return applied;
}

export function marketContractId(targetTownId: string, itemId: string, expiresCycle: number): string {
    return `contract_${targetTownId}_${itemId}_${expiresCycle}`;
}

function safeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildContractCandidates(): Array<{ targetTownId: string; itemId: string }> {
    const candidates: Array<{ targetTownId: string; itemId: string }> = [];
    for (const [itemId, towns] of Object.entries(TRADE_GOOD_SELL_MULTIPLIERS)) {
        for (const [targetTownId, multiplier] of Object.entries(towns ?? {})) {
            if ((multiplier ?? 1) >= 2) candidates.push({ targetTownId, itemId });
        }
    }
    return candidates;
}

function findBestContract(snapshot: MarketSnapshot, townId: string | null | undefined, itemId: string): MarketContract | null {
    if (!townId || !isTradeGoodItemId(itemId)) return null;
    return getActiveMarketContracts(snapshot, townId)
        .filter((contract) => contract.itemId === itemId)
        .sort((a, b) => b.bonusPerUnit - a.bonusPerUnit || a.expiresCycle - b.expiresCycle)[0] ?? null;
}

function decayDrift(value: number): number {
    if (Math.abs(value) <= 0.005) return 0;
    return clamp(value * 0.75, -MARKET_DRIFT_CAP, MARKET_DRIFT_CAP);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
