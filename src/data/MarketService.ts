import { formatT, i18n, t } from '../i18n/LanguageManager';
import { getItemDef, type ItemDef } from './ItemDB';
import {
    advanceMarketCycle,
    applyMarketContractSale,
    calculateMarketBuyPrice,
    calculateMarketSellPrice,
    ensureMarketContracts,
    getActiveMarketContracts,
    getOrCreateMarketEntry,
    MARKET_DRIFT_CAP,
    quoteMarketContractBonus,
    type MarketContract,
    type MarketEntryState,
    type MarketSellQuote,
    type MarketSnapshot,
} from './MarketData';
import type { PlayerData } from './PlayerData';
import {
    getSellPrice as getBaseSellPrice,
    getTradeGoodSellMultiplier,
    isTradeGoodItemId,
    TRADE_GOOD_SELL_MULTIPLIERS,
} from './ShopData';
import { getTownNameKey } from './TownFacilityData';

export interface MarketService {
    getBuyPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number;
    getSellPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number;
    getSellQuote(item: ItemDef, baseUnitPrice: number, townId: string | null | undefined, quantity?: number): MarketSellQuote;
    recordBuy(townId: string | null | undefined, itemId: string, quantity?: number): void;
    recordSell(townId: string | null | undefined, itemId: string, quantity?: number): void;
    rollTownVisit(townId: string): void;
    getMarketRumor(townId: string): string | null;
    getActiveContracts(townId?: string): MarketContract[];
    advanceMarketCycle(): void;
}

export { BUY_PRESSURE_CAP, MARKET_DRIFT_CAP, SELL_PRESSURE_CAP } from './MarketData';

const DRIFT_ROLL_CHANCE = 0.28;

export class MarketSimulationService implements MarketService {
    constructor(
        private readonly playerData: PlayerData,
        private readonly random: () => number = Math.random
    ) {}

    public getBuyPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        if (!townId || !isTradeGoodItemId(item.id)) return basePrice;
        return calculateMarketBuyPrice(basePrice, this.getEntryState(townId, item.id));
    }

    public getSellPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        if (!townId || !isTradeGoodItemId(item.id)) return basePrice;
        return calculateMarketSellPrice(basePrice, this.getEntryState(townId, item.id));
    }

    public getSellQuote(item: ItemDef, baseUnitPrice: number, townId: string | null | undefined, quantity: number = 1): MarketSellQuote {
        const unitPrice = this.getSellPrice(item, baseUnitPrice, townId);
        const safeQuantity = Math.max(1, Math.floor(quantity));
        const basePrice = unitPrice * safeQuantity;
        if (!townId || !isTradeGoodItemId(item.id)) {
            return { basePrice, bonusPrice: 0, totalPrice: basePrice };
        }
        const bonus = quoteMarketContractBonus(this.snapshot(), townId, item.id, safeQuantity);
        return {
            basePrice,
            bonusPrice: bonus.bonusPrice,
            totalPrice: basePrice + bonus.bonusPrice,
            contractId: bonus.contractId,
            contractQuantity: bonus.contractQuantity,
        };
    }

    public recordBuy(townId: string | null | undefined, itemId: string, quantity: number = 1): void {
        if (!townId || !isTradeGoodItemId(itemId)) return;
        const snapshot = this.snapshot();
        const entry = getOrCreateMarketEntry(snapshot, townId, itemId);
        entry.buyPressure = Math.max(0, entry.buyPressure + Math.max(1, quantity));
        this.applySnapshot(snapshot);
        this.playerData.save();
    }

    public recordSell(townId: string | null | undefined, itemId: string, quantity: number = 1): void {
        if (!townId || !isTradeGoodItemId(itemId)) return;
        const snapshot = this.snapshot();
        const entry = getOrCreateMarketEntry(snapshot, townId, itemId);
        entry.sellPressure = Math.max(0, entry.sellPressure + Math.max(1, quantity));
        applyMarketContractSale(snapshot, townId, itemId, quantity);
        this.applySnapshot(snapshot);
        this.playerData.save();
    }

    public rollTownVisit(townId: string): void {
        const relevant = tradeGoodIds().filter((itemId) => getTradeGoodSellMultiplier(itemId, townId) !== 1);
        let changed = false;
        for (const itemId of relevant) {
            if (this.random() > DRIFT_ROLL_CHANCE) continue;
            this.adjustDrift(townId, itemId);
            changed = true;
        }
        if (!changed && this.random() < 0.5) {
            const itemId = relevant[Math.floor(this.random() * relevant.length)] ?? relevant[0];
            this.adjustDrift(townId, itemId);
            changed = true;
        }
        this.advanceMarketCycle();
        if (changed) this.playerData.save();
    }

    public getMarketRumor(townId: string): string | null {
        const cooling = this.pickCoolingRumor(townId);
        if (cooling) {
            return formatT('market.rumor.cooling', {
                town: townLabel(townId),
                item: itemLabel(cooling.item),
            });
        }

        const exportRumor = this.pickExportRumor(townId);
        if (exportRumor) {
            return formatT('market.rumor.export', {
                origin: townLabel(townId),
                town: townLabel(exportRumor.targetTownId),
                item: itemLabel(exportRumor.item),
            });
        }

        const contract = this.pickContractRumor(townId);
        if (contract) {
            const item = getItemDef(contract.itemId);
            if (item) {
                return formatT('market.rumor.contract', {
                    town: townLabel(contract.targetTownId),
                    item: itemLabel(item),
                    price: `${contract.bonusPerUnit}`,
                });
            }
        }

        const hot = this.pickHotRumor(townId);
        if (!hot) return null;
        return formatT('market.rumor.hot', {
            town: townLabel(townId),
            item: itemLabel(hot.item),
        });
    }

    public getActiveContracts(townId?: string): MarketContract[] {
        return getActiveMarketContracts(this.snapshot(), townId);
    }

    public advanceMarketCycle(): void {
        const snapshot = this.snapshot();
        advanceMarketCycle(snapshot, this.random);
        this.applySnapshot(snapshot);
        this.playerData.save();
    }

    public getEntryState(townId: string, itemId: string): MarketEntryState {
        return getOrCreateMarketEntry(this.snapshot(), townId, itemId);
    }

    private adjustDrift(townId: string, itemId: string): void {
        const entry = this.getEntryState(townId, itemId);
        const magnitude = 0.02 + this.random() * 0.04;
        const direction = this.random() < 0.5 ? -1 : 1;
        entry.drift = clamp(entry.drift + magnitude * direction, -MARKET_DRIFT_CAP, MARKET_DRIFT_CAP);
    }

    private pickCoolingRumor(townId: string): { item: ItemDef } | null {
        const candidates = tradeGoodIds()
            .map((itemId) => ({ item: getItemDef(itemId), state: this.getEntryState(townId, itemId) }))
            .filter((candidate): candidate is { item: ItemDef; state: MarketEntryState } => {
                return !!candidate.item && candidate.state.sellPressure >= 3 && getTradeGoodSellMultiplier(candidate.item.id, townId) !== 1;
            })
            .sort((a, b) => b.state.sellPressure - a.state.sellPressure);
        return candidates[0] ? { item: candidates[0].item } : null;
    }

    private pickContractRumor(townId: string): MarketContract | null {
        const contracts = this.getActiveContracts()
            .sort((a, b) => {
                const aLocal = a.targetTownId === townId ? 1 : 0;
                const bLocal = b.targetTownId === townId ? 1 : 0;
                return bLocal - aLocal || b.bonusPerUnit - a.bonusPerUnit || a.expiresCycle - b.expiresCycle;
            });
        return contracts[0] ?? null;
    }

    private pickExportRumor(townId: string): { item: ItemDef; targetTownId: string } | null {
        const candidates = tradeGoodIds()
            .filter((itemId) => getTradeGoodOriginTown(itemId) === townId)
            .map((itemId) => {
                const item = getItemDef(itemId);
                if (!item) return null;
                const targetTownId = this.bestSellTownFor(item, townId);
                return targetTownId ? { item, targetTownId } : null;
            })
            .filter((candidate): candidate is { item: ItemDef; targetTownId: string } => !!candidate);
        return candidates[0] ?? null;
    }

    private pickHotRumor(townId: string): { item: ItemDef } | null {
        const candidates = tradeGoodIds()
            .map((itemId) => {
                const item = getItemDef(itemId);
                if (!item) return null;
                const baseSell = getBaseSellPrice(item, townId);
                const dynamicSell = this.getSellPrice(item, baseSell, townId);
                return { item, score: dynamicSell / Math.max(1, item.buyPrice ?? item.baseValue) };
            })
            .filter((candidate): candidate is { item: ItemDef; score: number } => !!candidate && candidate.score > 0.75)
            .sort((a, b) => b.score - a.score);
        return candidates[0] ? { item: candidates[0].item } : null;
    }

    private bestSellTownFor(item: ItemDef, originTownId: string): string | null {
        const towns = Object.keys(TRADE_GOOD_SELL_MULTIPLIERS[item.id] ?? {});
        const candidates = towns
            .filter((townId) => townId !== originTownId)
            .map((townId) => ({
                townId,
                price: this.getSellPrice(item, getBaseSellPrice(item, townId), townId),
            }))
            .sort((a, b) => b.price - a.price);
        return candidates[0]?.townId ?? null;
    }

    private snapshot(): MarketSnapshot {
        const snapshot: MarketSnapshot = {
            marketState: this.playerData.marketState,
            marketCycle: this.playerData.marketCycle,
            marketContracts: this.playerData.marketContracts,
        };
        ensureMarketContracts(snapshot, this.random);
        this.applySnapshot(snapshot);
        return snapshot;
    }

    private applySnapshot(snapshot: MarketSnapshot): void {
        this.playerData.marketState = snapshot.marketState;
        this.playerData.marketCycle = snapshot.marketCycle;
        this.playerData.marketContracts = snapshot.marketContracts;
    }
}

function tradeGoodIds(): string[] {
    return Object.keys(TRADE_GOOD_SELL_MULTIPLIERS);
}

function getTradeGoodOriginTown(itemId: string): string | null {
    const towns = TRADE_GOOD_SELL_MULTIPLIERS[itemId] ?? {};
    const origin = Object.entries(towns).find(([, multiplier]) => multiplier <= 0.85);
    return origin?.[0] ?? null;
}

function itemLabel(item: ItemDef): string {
    return i18n.lang === 'ko' ? item.nameKr : item.name;
}

function townLabel(townId: string): string {
    const key = getTownNameKey(townId);
    const label = t(key);
    return label === key ? townId : label;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
