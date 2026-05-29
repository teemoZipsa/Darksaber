import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
    advanceMarketCycle,
    applyMarketContractSale,
    cloneMarketSnapshot,
    createDefaultMarketSnapshot,
    ensureMarketContracts,
    getOrCreateMarketEntry,
    MARKET_DRIFT_CAP,
    normalizeMarketSnapshot,
    type MarketSnapshot,
} from '../src/data/MarketData';
import {
    getTradeGoodSellMultiplier,
    isTradeGoodItemId,
    TRADE_GOOD_SELL_MULTIPLIERS,
} from '../src/data/ShopData';
import type {
    MarketClientMessage,
    MarketRecordAckMessage,
    MarketServerMessage,
    MarketSnapshotMessage,
} from '../src/net/WorldProtocol';

export const MARKET_SERVER_CYCLE_MS = 5 * 60 * 1000;
const CLIENT_RECOVERY_TOUCH_MS = 60 * 1000;
const DRIFT_ROLL_CHANCE = 0.28;

export interface ServerMarketSessionOptions {
    persistPath?: string | null;
    random?: () => number;
    cycleMs?: number;
}

export class ServerMarketSession {
    private snapshot: MarketSnapshot;
    private readonly persistPath: string | null;
    private readonly random: () => number;
    private readonly cycleMs: number;
    private readonly lastRecoveryTouchByClient = new Map<string, number>();
    private lastCycleAt = Date.now();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: ServerMarketSessionOptions = {}) {
        this.persistPath = options.persistPath ?? null;
        this.random = options.random ?? Math.random;
        this.cycleMs = options.cycleMs ?? MARKET_SERVER_CYCLE_MS;
        this.snapshot = this.loadSnapshot();
        ensureMarketContracts(this.snapshot, this.random);
    }

    public handleMessage(message: MarketClientMessage, now: number = Date.now()): MarketServerMessage[] {
        switch (message.type) {
            case 'MARKET_HELLO':
                return [this.ack('hello', true)];
            case 'MARKET_SNAPSHOT_REQUEST':
                return [this.snapshotMessage(now)];
            case 'MARKET_RECORD_BUY':
                return [this.recordBuy(message.townId, message.itemId, message.quantity)];
            case 'MARKET_RECORD_SELL':
                return [this.recordSell(message.townId, message.itemId, message.quantity)];
            case 'MARKET_TOUCH_TOWN':
                this.touchTown(message.clientId, message.townId, now);
                return [this.ack('touch', true)];
        }
    }

    public tick(now: number = Date.now()): MarketSnapshotMessage | null {
        if (now - this.lastCycleAt < this.cycleMs) return null;
        this.lastCycleAt = now;
        advanceMarketCycle(this.snapshot, this.random);
        this.scheduleSave();
        return this.snapshotMessage(now);
    }

    public getSnapshot(): MarketSnapshot {
        return cloneMarketSnapshot(this.snapshot);
    }

    public flushSave(): void {
        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        this.saveNow();
    }

    private recordBuy(townId: string, itemId: string, quantity: number): MarketRecordAckMessage {
        if (!isTradeGoodItemId(itemId)) return this.ack('buy', false);
        const entry = getOrCreateMarketEntry(this.snapshot, townId, itemId);
        entry.buyPressure = Math.max(0, entry.buyPressure + safeQuantity(quantity));
        this.scheduleSave();
        return this.ack('buy', true);
    }

    private recordSell(townId: string, itemId: string, quantity: number): MarketRecordAckMessage {
        if (!isTradeGoodItemId(itemId)) return this.ack('sell', false);
        const safe = safeQuantity(quantity);
        const entry = getOrCreateMarketEntry(this.snapshot, townId, itemId);
        entry.sellPressure = Math.max(0, entry.sellPressure + safe);
        applyMarketContractSale(this.snapshot, townId, itemId, safe);
        this.scheduleSave();
        return this.ack('sell', true);
    }

    private touchTown(clientId: string, townId: string, now: number): void {
        this.rollTownDrift(townId);
        const last = this.lastRecoveryTouchByClient.get(clientId) ?? 0;
        if (now - last >= CLIENT_RECOVERY_TOUCH_MS) {
            this.lastRecoveryTouchByClient.set(clientId, now);
            advanceMarketCycle(this.snapshot, this.random);
        }
        this.scheduleSave();
    }

    private rollTownDrift(townId: string): void {
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
        }
    }

    private adjustDrift(townId: string, itemId: string): void {
        const entry = getOrCreateMarketEntry(this.snapshot, townId, itemId);
        const magnitude = 0.02 + this.random() * 0.04;
        const direction = this.random() < 0.5 ? -1 : 1;
        entry.drift = clamp(entry.drift + magnitude * direction, -MARKET_DRIFT_CAP, MARKET_DRIFT_CAP);
    }

    private ack(kind: MarketRecordAckMessage['kind'], accepted: boolean): MarketRecordAckMessage {
        return {
            type: 'MARKET_RECORD_ACK',
            kind,
            accepted,
            snapshot: cloneMarketSnapshot(this.snapshot),
        };
    }

    private snapshotMessage(now: number): MarketSnapshotMessage {
        return {
            type: 'MARKET_SNAPSHOT',
            serverTime: now,
            snapshot: cloneMarketSnapshot(this.snapshot),
        };
    }

    private loadSnapshot(): MarketSnapshot {
        if (!this.persistPath || !existsSync(this.persistPath)) return createDefaultMarketSnapshot();
        try {
            return normalizeMarketSnapshot(JSON.parse(readFileSync(this.persistPath, 'utf8')));
        } catch {
            return createDefaultMarketSnapshot();
        }
    }

    private scheduleSave(): void {
        if (!this.persistPath || this.saveTimer !== null) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.saveNow();
        }, 500);
    }

    private saveNow(): void {
        if (!this.persistPath) return;
        mkdirSync(dirname(this.persistPath), { recursive: true });
        writeFileSync(this.persistPath, JSON.stringify(this.snapshot, null, 2), 'utf8');
    }
}

function tradeGoodIds(): string[] {
    return Object.keys(TRADE_GOOD_SELL_MULTIPLIERS);
}

function safeQuantity(quantity: number): number {
    return Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1));
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
