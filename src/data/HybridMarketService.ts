import { formatT, i18n } from '../i18n/LanguageManager';
import {
    DEFAULT_WORLD_SERVER_URL,
    WORLD_PROTOCOL_VERSION,
    type MarketClientMessage,
    type WorldServerMessage,
} from '../net/WorldProtocol';
import { getItemDef, type ItemDef } from './ItemDB';
import {
    applyMarketContractSale,
    calculateMarketBuyPrice,
    calculateMarketSellPrice,
    cloneMarketSnapshot,
    getActiveMarketContracts,
    getOrCreateMarketEntry,
    normalizeMarketSnapshot,
    quoteMarketContractBonus,
    type MarketContract,
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
import type { MarketService } from './MarketService';
import type { TownId } from './TownFacilityData';

const CLIENT_ID_KEY = 'darksaber_market_client_id';

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

export class HybridMarketService implements MarketService {
    private readonly server: ServerMarketService;

    constructor(_playerData: PlayerData) {
        this.server = new ServerMarketService();
    }

    public getBuyPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        return this.server.getBuyPrice(item, basePrice, townId);
    }

    public getSellPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        return this.server.getSellPrice(item, basePrice, townId);
    }

    public getSellQuote(item: ItemDef, baseUnitPrice: number, townId: string | null | undefined, quantity?: number): MarketSellQuote {
        return this.server.getSellQuote(item, baseUnitPrice, townId, quantity);
    }

    public recordBuy(townId: string | null | undefined, itemId: string, quantity?: number): void {
        this.server.recordBuy(townId, itemId, quantity);
    }

    public recordSell(townId: string | null | undefined, itemId: string, quantity?: number): void {
        this.server.recordSell(townId, itemId, quantity);
    }

    public rollTownVisit(townId: string): void {
        this.server.rollTownVisit(townId);
    }

    public getMarketRumor(townId: string): string | null {
        return this.server.getMarketRumor(townId);
    }

    public getActiveContracts(townId?: string): MarketContract[] {
        return this.server.getActiveContracts(townId);
    }

    public advanceMarketCycle(): void {
        this.server.advanceMarketCycle();
    }
}

export class ServerMarketService implements MarketService {
    private readonly clientId = readClientId();
    private socket: WebSocket | null = null;
    private snapshot: MarketSnapshot | null = null;
    private connected = false;

    constructor(private readonly url: string = DEFAULT_WORLD_SERVER_URL) {
        this.connect();
    }

    public isReady(): boolean {
        return this.connected && this.snapshot !== null;
    }

    public getBuyPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        if (!townId || !isTradeGoodItemId(item.id) || !this.snapshot) return basePrice;
        return calculateMarketBuyPrice(basePrice, getOrCreateMarketEntry(this.snapshot, townId, item.id));
    }

    public getSellPrice(item: ItemDef, basePrice: number, townId: string | null | undefined): number {
        if (!townId || !isTradeGoodItemId(item.id) || !this.snapshot) return basePrice;
        return calculateMarketSellPrice(basePrice, getOrCreateMarketEntry(this.snapshot, townId, item.id));
    }

    public getSellQuote(item: ItemDef, baseUnitPrice: number, townId: string | null | undefined, quantity: number = 1): MarketSellQuote {
        const safeQuantity = Math.max(1, Math.floor(quantity));
        const basePrice = this.getSellPrice(item, baseUnitPrice, townId) * safeQuantity;
        if (!townId || !isTradeGoodItemId(item.id) || !this.snapshot) {
            return { basePrice, bonusPrice: 0, totalPrice: basePrice };
        }
        const bonus = quoteMarketContractBonus(this.snapshot, townId, item.id, safeQuantity);
        return {
            basePrice,
            bonusPrice: bonus.bonusPrice,
            totalPrice: basePrice + bonus.bonusPrice,
            contractId: bonus.contractId,
            contractQuantity: bonus.contractQuantity,
        };
    }

    public recordBuy(townId: string | null | undefined, itemId: string, quantity: number = 1): void {
        if (!townId || !isTradeGoodItemId(itemId) || !this.snapshot) return;
        const safe = Math.max(1, Math.floor(quantity));
        const entry = getOrCreateMarketEntry(this.snapshot, townId, itemId);
        entry.buyPressure = Math.max(0, entry.buyPressure + safe);
        this.send({ type: 'MARKET_RECORD_BUY', clientId: this.clientId, townId, itemId, quantity: safe });
    }

    public recordSell(townId: string | null | undefined, itemId: string, quantity: number = 1): void {
        if (!townId || !isTradeGoodItemId(itemId) || !this.snapshot) return;
        const safe = Math.max(1, Math.floor(quantity));
        const entry = getOrCreateMarketEntry(this.snapshot, townId, itemId);
        entry.sellPressure = Math.max(0, entry.sellPressure + safe);
        applyMarketContractSale(this.snapshot, townId, itemId, safe);
        this.send({ type: 'MARKET_RECORD_SELL', clientId: this.clientId, townId, itemId, quantity: safe });
    }

    public rollTownVisit(townId: string): void {
        this.send({ type: 'MARKET_TOUCH_TOWN', clientId: this.clientId, townId });
    }

    public getMarketRumor(townId: string): string | null {
        if (!this.snapshot) return null;
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
        return null;
    }

    public getActiveContracts(townId?: string): MarketContract[] {
        return this.snapshot ? getActiveMarketContracts(this.snapshot, townId) : [];
    }

    public advanceMarketCycle(): void {
        this.send({ type: 'MARKET_SNAPSHOT_REQUEST', clientId: this.clientId });
    }

    private connect(): void {
        if (!this.url) return;
        if (typeof window === 'undefined') return;
        if (typeof WebSocket === 'undefined') return;
        try {
            const socket = new WebSocket(this.url);
            this.socket = socket;
            socket.onopen = () => {
                this.connected = true;
                this.send({ type: 'MARKET_HELLO', clientId: this.clientId, clientVersion: WORLD_PROTOCOL_VERSION });
            };
            socket.onmessage = (event) => this.handleMessage(event.data);
            socket.onerror = () => {
                this.connected = false;
            };
            socket.onclose = () => {
                this.connected = false;
                this.socket = null;
            };
        } catch {
            this.connected = false;
            this.socket = null;
        }
    }

    private handleMessage(raw: unknown): void {
        let message: WorldServerMessage;
        try {
            message = JSON.parse(String(raw)) as WorldServerMessage;
        } catch {
            return;
        }
        if (message.type === 'MARKET_SNAPSHOT') {
            this.snapshot = normalizeMarketSnapshot(message.snapshot);
        } else if (message.type === 'MARKET_RECORD_ACK') {
            this.snapshot = normalizeMarketSnapshot(message.snapshot);
        }
    }

    private send(message: MarketClientMessage): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify(message));
    }

    private pickContractRumor(townId: string): MarketContract | null {
        return this.getActiveContracts()
            .sort((a, b) => {
                const aLocal = a.targetTownId === townId ? 1 : 0;
                const bLocal = b.targetTownId === townId ? 1 : 0;
                return bLocal - aLocal || b.bonusPerUnit - a.bonusPerUnit || a.expiresCycle - b.expiresCycle;
            })[0] ?? null;
    }

    private pickCoolingRumor(townId: string): { item: ItemDef } | null {
        if (!this.snapshot) return null;
        const candidates = tradeGoodIds()
            .map((itemId) => ({ item: getItemDef(itemId), state: getOrCreateMarketEntry(this.snapshot!, townId, itemId) }))
            .filter((candidate) => {
                return !!candidate.item && candidate.state.sellPressure >= 3 && getTradeGoodSellMultiplier(candidate.item.id, townId) !== 1;
            })
            .sort((a, b) => b.state.sellPressure - a.state.sellPressure);
        const item = candidates[0]?.item;
        return item ? { item } : null;
    }

    private pickExportRumor(townId: string): { item: ItemDef; targetTownId: string } | null {
        if (!this.snapshot) return null;
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

    public getSnapshotForTest(): MarketSnapshot | null {
        return this.snapshot ? cloneMarketSnapshot(this.snapshot) : null;
    }
}

function readClientId(): string {
    const generated = `market_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
        const existing = localStorage.getItem(CLIENT_ID_KEY);
        if (existing) return existing;
        localStorage.setItem(CLIENT_ID_KEY, generated);
    } catch {
        return generated;
    }
    return generated;
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
