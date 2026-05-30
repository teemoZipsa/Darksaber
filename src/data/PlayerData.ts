/**
 * PlayerData — Global player save data (gold, inventory, progress).
 * Provides a SaveManager interface for localStorage (later Firebase).
 */

import {
    createDefaultMarketState,
    normalizeMarketContracts,
    normalizeMarketCycle,
    normalizeMarketState,
    type MarketContract,
    type MarketState,
} from './MarketData';

export interface InventoryItem {
    uid: string;         // Unique ID for this specific instance
    itemId: string;      // Reference to ItemDB
    gridX: number;       // Grid position X
    gridY: number;       // Grid position Y
    durability?: number;
    quantity?: number;
    acquiredInRaid?: boolean;
    sockets: string[];   // Array of itemId string that are slotted inside
}

export interface SaveData {
    gold: number;
    clearedStages: string[];
    questItems?: string[];
    marketState?: MarketState;
    marketCycle?: number;
    marketContracts?: MarketContract[];
    currentHubTownId: string;
    pendingRestMenuId: string | null;
    inventory: InventoryItem[];
    equipped: { [slot: string]: InventoryItem | null };
    /** ISO date string of last save */
    lastSaved: string;
}
const SAVE_KEY = 'sin_eater_save';
const DEFAULT_EQUIPPED: Record<string, InventoryItem | null> = {
    weapon: null,
    shield: null,
    head: null,
    body: null,
    boots: null,
    accessory: null,
    accessory2: null,
};

export class PlayerData {
    public gold: number = 500;  // Starting gold
    public clearedStages: Set<string> = new Set();
    public questItems: Set<string> = new Set();
    public marketState: MarketState = createDefaultMarketState();
    public marketCycle: number = 0;
    public marketContracts: MarketContract[] = [];
    public currentHubTownId: string = 'central_castle';
    public pendingRestMenuId: string | null = null;
    public inventory: InventoryItem[] = [];
    public equipped: Record<string, InventoryItem | null> = { ...DEFAULT_EQUIPPED };

    /** Add gold */
    public addGold(amount: number): void {
        const value = normalizeGoldAmount(amount);
        if (value === null || value === 0) return;
        this.gold += value;
    }

    /** Spend gold. Returns false if insufficient. */
    public spendGold(amount: number): boolean {
        const value = normalizeGoldAmount(amount);
        if (value === null) return false;
        if (this.gold < value) return false;
        this.gold -= value;
        return true;
    }

    /** Mark a stage as cleared */
    public markCleared(stageId: string): void {
        this.clearedStages.add(stageId);
    }

    /** Check if a stage has been cleared */
    public isCleared(stageId: string): boolean {
        return this.clearedStages.has(stageId);
    }

    public addQuestItem(itemId: string): void {
        this.questItems.add(itemId);
    }

    public hasQuestItem(itemId: string): boolean {
        return this.questItems.has(itemId);
    }

    // ═══════════════════════════════════════════════════════════
    //  Save / Load (localStorage for now, Firebase later)
    // ═══════════════════════════════════════════════════════════

    public save(): void {
        const data: SaveData = {
            gold: this.gold,
            clearedStages: Array.from(this.clearedStages),
            questItems: Array.from(this.questItems),
            marketState: this.marketState,
            marketCycle: this.marketCycle,
            marketContracts: this.marketContracts,
            currentHubTownId: this.currentHubTownId,
            pendingRestMenuId: this.pendingRestMenuId,
            inventory: this.inventory,
            equipped: this.equipped,
            lastSaved: new Date().toISOString(),
        };
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch { /* silent */ }
    }

    public load(): void {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return;
            const parsed: unknown = JSON.parse(raw);
            if (!isRecord(parsed)) return;
            const data = parsed as Partial<SaveData>;
            this.gold = normalizeLoadedGold(data.gold);
            this.clearedStages = new Set(normalizeStringArray(data.clearedStages));
            this.questItems = new Set(normalizeStringArray(data.questItems));
            this.marketState = normalizeMarketState(data.marketState);
            this.marketCycle = normalizeMarketCycle(data.marketCycle);
            this.marketContracts = normalizeMarketContracts(data.marketContracts, this.marketCycle);
            this.currentHubTownId = typeof data.currentHubTownId === 'string' ? data.currentHubTownId : 'central_castle';
            this.pendingRestMenuId = typeof data.pendingRestMenuId === 'string' ? data.pendingRestMenuId : null;
            this.inventory = normalizeInventory(data.inventory);
            this.equipped = normalizeEquipped(data.equipped);
        } catch { /* silent — start fresh */ }
    }
}

function normalizeGoldAmount(amount: number): number | null {
    if (!Number.isFinite(amount)) return null;
    const value = Math.floor(amount);
    return value >= 0 ? value : null;
}

function normalizeLoadedGold(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
}

function normalizeInventory(value: unknown): InventoryItem[] {
    return Array.isArray(value)
        ? value.map(normalizeInventoryItem).filter((item): item is InventoryItem => item !== null)
        : [];
}

function normalizeInventoryItem(value: unknown): InventoryItem | null {
    if (!isRecord(value)) return null;
    if (typeof value.uid !== 'string' || typeof value.itemId !== 'string') return null;
    return {
        uid: value.uid,
        itemId: value.itemId,
        gridX: finiteFloor(value.gridX, 0),
        gridY: finiteFloor(value.gridY, 0),
        ...(typeof value.durability === 'number' && Number.isFinite(value.durability)
            ? { durability: Math.max(0, Math.floor(value.durability)) }
            : {}),
        ...(typeof value.quantity === 'number' && Number.isFinite(value.quantity)
            ? { quantity: Math.max(1, Math.floor(value.quantity)) }
            : {}),
        acquiredInRaid: value.acquiredInRaid === true,
        sockets: normalizeStringArray(value.sockets),
    };
}

function normalizeEquipped(value: unknown): Record<string, InventoryItem | null> {
    const result: Record<string, InventoryItem | null> = { ...DEFAULT_EQUIPPED };
    if (!isRecord(value)) return result;
    for (const slot of Object.keys(result)) {
        result[slot] = value[slot] === null ? null : normalizeInventoryItem(value[slot]);
    }
    return result;
}

function finiteFloor(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}
