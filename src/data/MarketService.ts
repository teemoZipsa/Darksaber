import { formatT, i18n } from '../i18n/LanguageManager';
import { getItemDef, type ItemDef } from './ItemDB';
import { marketStateKey, type MarketEntryState } from './MarketData';
import type { PlayerData } from './PlayerData';
import {
    getSellPrice as getBaseSellPrice,
    getTradeGoodSellMultiplier,
    isTradeGoodItemId,
    TRADE_GOOD_SELL_MULTIPLIERS,
} from './ShopData';
import type { TownId } from './TownFacilityData';

export interface MarketService {
    getBuyPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number;
    getSellPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number;
    recordBuy(townId: string | null | undefined, itemId: string, quantity?: number): void;
    recordSell(townId: string | null | undefined, itemId: string, quantity?: number): void;
    rollTownVisit(townId: string): void;
    getMarketRumor(townId: string): string | null;
}

export const BUY_PRESSURE_CAP = 0.2;
export const SELL_PRESSURE_CAP = 0.25;
export const MARKET_DRIFT_CAP = 0.08;

const BUY_PRESSURE_STEP = 0.04;
const SELL_PRESSURE_STEP = 0.05;
const DRIFT_ROLL_CHANCE = 0.28;

const TOWN_LABELS: Record<TownId, { ko: string; en: string }> = {
    central_castle: { ko: '카오시아', en: 'Kaosia' },
    w_forest_village: { ko: '벨퓌어스', en: 'Belfuers' },
    s_coast_town: { ko: '시시리오', en: 'Sicilio' },
    e_stronghold: { ko: '엔트리아', en: 'Entria' },
    se_port: { ko: '아리크나', en: 'Arikna' },
    nw_desert_city: { ko: '사막의 전초기지', en: 'Desert Outpost' },
    sw_hideout: { ko: '남부 은신처', en: 'Southern Refuge' },
    e_outpost: { ko: '동부 전초기지', en: 'Eastern Outpost' },
    master_sanctum: { ko: '마스터 성역', en: 'Master Sanctum' },
    astral_keep: { ko: '성좌 요새', en: 'Astral Keep' },
    ember_citadel: { ko: '홍염 성채', en: 'Ember Citadel' },
};

export class LocalMarketService implements MarketService {
    constructor(
        private readonly playerData: PlayerData,
        private readonly random: () => number = Math.random
    ) {}

    public getBuyPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        if (!townId || !isTradeGoodItemId(item.id)) return basePrice;
        const entry = this.getEntryState(townId, item.id);
        const pressure = Math.min(BUY_PRESSURE_CAP, entry.buyPressure * BUY_PRESSURE_STEP);
        const multiplier = clamp(1 + pressure + entry.drift, 1 - MARKET_DRIFT_CAP, 1 + BUY_PRESSURE_CAP + MARKET_DRIFT_CAP);
        return Math.max(1, Math.floor(basePrice * multiplier));
    }

    public getSellPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        if (!townId || !isTradeGoodItemId(item.id)) return basePrice;
        const entry = this.getEntryState(townId, item.id);
        const pressure = Math.min(SELL_PRESSURE_CAP, entry.sellPressure * SELL_PRESSURE_STEP);
        const multiplier = clamp(1 - pressure + entry.drift, 1 - SELL_PRESSURE_CAP - MARKET_DRIFT_CAP, 1 + MARKET_DRIFT_CAP);
        return Math.max(1, Math.floor(basePrice * multiplier));
    }

    public recordBuy(townId: string | null | undefined, itemId: string, quantity: number = 1): void {
        if (!townId || !isTradeGoodItemId(itemId)) return;
        const entry = this.getEntryState(townId, itemId);
        entry.buyPressure = Math.max(0, entry.buyPressure + Math.max(1, quantity));
        this.playerData.save();
    }

    public recordSell(townId: string | null | undefined, itemId: string, quantity: number = 1): void {
        if (!townId || !isTradeGoodItemId(itemId)) return;
        const entry = this.getEntryState(townId, itemId);
        entry.sellPressure = Math.max(0, entry.sellPressure + Math.max(1, quantity));
        this.playerData.save();
    }

    public rollTownVisit(townId: string): void {
        const relevant = tradeGoodIds().filter((itemId) => getTradeGoodSellMultiplier(itemId, townId) !== 1);
        if (relevant.length === 0) return;

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

        const hot = this.pickHotRumor(townId);
        if (!hot) return null;
        return formatT('market.rumor.hot', {
            town: townLabel(townId),
            item: itemLabel(hot.item),
        });
    }

    public getEntryState(townId: string, itemId: string): MarketEntryState {
        const key = marketStateKey(townId, itemId);
        this.playerData.marketState[key] ??= { buyPressure: 0, sellPressure: 0, drift: 0 };
        return this.playerData.marketState[key];
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
    const labels = TOWN_LABELS[townId as TownId];
    if (!labels) return townId;
    return i18n.lang === 'ko' ? labels.ko : labels.en;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
