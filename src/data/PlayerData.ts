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
import {
    normalizeFacilityUpgradeState,
    type FacilityUpgradeState,
} from './FacilityUpgradeData';
import { getItemDef } from './ItemDB';
import type { CharacterSave, CharacterSavePatch, InventorySaveItem } from '../net/AuthClient';
import { createDefaultStashSnapshot } from '../shared/CharacterSaveDefaults';
import { normalizeActiveBountyContractId } from './BountyContractData';
import {
    normalizeRaidHistory,
    prependRaidHistory,
    type RaidHistoryEntry,
} from '../raid/RaidHistory';
import {
    normalizeMonsterCodex,
    recordMonsterDefeat,
    recordMonsterEncounter,
    type MonsterCodexEntry,
} from '../raid/MonsterCodex';
import { isMonsterId } from './MonsterCatalog';

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
    gold?: number;
    clearedStages?: string[];
    questItems?: string[];
    storyCompanions?: string[];
    marketState?: MarketState;
    marketCycle?: number;
    marketContracts?: MarketContract[];
    facilityUpgrades?: FacilityUpgradeState;
    raidInsuranceActive?: boolean;
    activeBountyContractId?: string | null;
    raidHistory?: RaidHistoryEntry[];
    monsterCodex?: MonsterCodexEntry[];
    currentHubTownId?: string;
    pendingRestMenuId?: string | null;
    inventory?: InventoryItem[];
    equipped?: { [slot: string]: InventoryItem | null };
    characterSave?: CharacterSave;
    /** ISO date string of last save */
    lastSaved: string;
}
const SAVE_KEY = 'sin_eater_save';
const LOCAL_CHARACTER_ID = 'local_player';
type CharacterSaveProvider = () => Pick<CharacterSavePatch, 'inventory' | 'equipment' | 'partySnapshot' | 'rosterSnapshot'>;
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
    public storyCompanions: Set<string> = new Set();
    public marketState: MarketState = createDefaultMarketState();
    public marketCycle: number = 0;
    public marketContracts: MarketContract[] = [];
    public facilityUpgrades: FacilityUpgradeState = {};
    public raidInsuranceActive: boolean = false;
    public activeBountyContractId: string | null = null;
    public raidHistory: RaidHistoryEntry[] = [];
    public monsterCodex: MonsterCodexEntry[] = [];
    public currentHubTownId: string = 'central_castle';
    public pendingRestMenuId: string | null = null;
    public inventory: InventoryItem[] = [];
    public equipped: Record<string, InventoryItem | null> = { ...DEFAULT_EQUIPPED };
    private localSaveRevision: number = 0;
    private characterSaveProvider: CharacterSaveProvider | null = null;
    private authenticatedSession = false;
    private hubPersistCallback: (() => void) | null = null;
    private readonly codexEncounteredEnemyIds = new Set<string>();
    private readonly codexDefeatedEnemyIds = new Set<string>();

    public setAuthenticatedSession(active: boolean): void {
        this.authenticatedSession = active;
    }

    public setHubPersistCallback(callback: (() => void) | null): void {
        this.hubPersistCallback = callback;
    }

    public setCharacterSaveProvider(provider: CharacterSaveProvider | null): void {
        this.characterSaveProvider = provider;
    }

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

    public addStoryCompanion(companionId: string): void {
        this.storyCompanions.add(companionId);
    }

    public hasStoryCompanion(companionId: string): boolean {
        return this.storyCompanions.has(companionId);
    }

    public addRaidHistoryEntry(entry: RaidHistoryEntry): void {
        this.raidHistory = prependRaidHistory(this.raidHistory, entry);
    }

    public beginMonsterCodexRaid(): void {
        this.codexEncounteredEnemyIds.clear();
        this.codexDefeatedEnemyIds.clear();
    }

    public recordMonsterEncounter(
        monsterId: string | undefined,
        level: number,
        enemyInstanceId: string,
        timestamp: number = Date.now(),
    ): boolean {
        if (!isMonsterId(monsterId) || !enemyInstanceId || this.codexEncounteredEnemyIds.has(enemyInstanceId)) return false;
        this.codexEncounteredEnemyIds.add(enemyInstanceId);
        this.monsterCodex = recordMonsterEncounter(this.monsterCodex, { monsterId, level, timestamp });
        return true;
    }

    public recordMonsterDefeat(
        monsterId: string | undefined,
        level: number,
        enemyInstanceId: string,
        timestamp: number = Date.now(),
    ): boolean {
        if (!isMonsterId(monsterId) || !enemyInstanceId || this.codexDefeatedEnemyIds.has(enemyInstanceId)) return false;
        this.recordMonsterEncounter(monsterId, level, enemyInstanceId, timestamp);
        this.codexDefeatedEnemyIds.add(enemyInstanceId);
        this.monsterCodex = recordMonsterDefeat(this.monsterCodex, { monsterId, level, timestamp });
        return true;
    }

    // ═══════════════════════════════════════════════════════════
    //  Save / Load (localStorage for now, Firebase later)
    // ═══════════════════════════════════════════════════════════

    public save(): void {
        if (this.authenticatedSession) {
            this.hubPersistCallback?.();
            return;
        }
        const lastSaved = new Date().toISOString();
        const characterSave = this.toCharacterSave(lastSaved, Math.max(1, this.localSaveRevision + 1));
        const runtimePatch = this.characterSaveProvider?.();
        const patchedCharacterSave: CharacterSave = {
            ...characterSave,
            ...runtimePatch,
            characterId: characterSave.characterId,
            saveVersion: characterSave.saveVersion,
            revision: characterSave.revision,
            updatedAt: characterSave.updatedAt,
        };
        const data: SaveData = { characterSave: patchedCharacterSave, lastSaved };
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            this.localSaveRevision = patchedCharacterSave.revision;
        } catch { /* silent */ }
    }

    public load(): void {
        if (this.authenticatedSession) return;
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return;
            const parsed: unknown = JSON.parse(raw);
            if (!isRecord(parsed)) return;
            const data = parsed as Partial<SaveData>;
            if (isRecord(data.characterSave)) {
                this.applyCharacterSave(data.characterSave as CharacterSave);
                return;
            }
            this.gold = normalizeLoadedGold(data.gold);
            this.clearedStages = new Set(normalizeStringArray(data.clearedStages));
            this.questItems = new Set(normalizeStringArray(data.questItems));
            this.storyCompanions = new Set(normalizeStringArray(data.storyCompanions));
            this.marketState = normalizeMarketState(data.marketState);
            this.marketCycle = normalizeMarketCycle(data.marketCycle);
            this.marketContracts = normalizeMarketContracts(data.marketContracts, this.marketCycle);
            this.facilityUpgrades = normalizeFacilityUpgradeState(data.facilityUpgrades);
            this.raidInsuranceActive = data.raidInsuranceActive === true;
            this.activeBountyContractId = normalizeActiveBountyContractId(data.activeBountyContractId);
            this.raidHistory = normalizeRaidHistory(data.raidHistory);
            this.monsterCodex = normalizeMonsterCodex(data.monsterCodex);
            this.beginMonsterCodexRaid();
            this.currentHubTownId = typeof data.currentHubTownId === 'string' ? data.currentHubTownId : 'central_castle';
            this.pendingRestMenuId = typeof data.pendingRestMenuId === 'string' ? data.pendingRestMenuId : null;
            this.inventory = normalizeInventory(data.inventory);
            this.equipped = normalizeEquipped(data.equipped);
            this.localSaveRevision = 0;
        } catch { /* silent — start fresh */ }
    }

    public toCharacterSave(updatedAt: string = new Date().toISOString(), revision: number = Math.max(1, this.localSaveRevision)): CharacterSave {
        return {
            characterId: LOCAL_CHARACTER_ID,
            saveVersion: 1,
            revision,
            hubLocation: {
                realm: 'mortal',
                townId: this.currentHubTownId,
                pendingRestMenuId: this.pendingRestMenuId,
            },
            questState: {
                gold: this.gold,
                clearedStageIds: Array.from(this.clearedStages),
                questItemIds: Array.from(this.questItems),
                storyCompanionIds: Array.from(this.storyCompanions),
                marketState: this.marketState,
                marketCycle: this.marketCycle,
                marketContracts: this.marketContracts,
                facilityUpgrades: this.facilityUpgrades,
                raidInsuranceActive: this.raidInsuranceActive,
                activeBountyContractId: this.activeBountyContractId,
                raidHistory: this.raidHistory,
                monsterCodex: this.monsterCodex,
            },
            inventory: {
                width: 10,
                height: 6,
                items: this.inventory.map(toInventorySaveItem),
            },
            stashSnapshot: createDefaultStashSnapshot(),
            equipment: { ...this.equipped },
            partySnapshot: {
                activeCharacterIds: [LOCAL_CHARACTER_ID],
            },
            rosterSnapshot: {
                characters: [{
                    id: LOCAL_CHARACTER_ID,
                    name: 'Hero',
                    classKey: 'infantry',
                    gender: 'M',
                    tier: 1,
                    level: 1,
                    exp: 0,
                    hasEmblem: false,
                    baseStats: {},
                }],
            },
            updatedAt,
        };
    }

    public applyCharacterSave(save: CharacterSave): void {
        const hubLocation = isRecord(save.hubLocation) ? save.hubLocation : {};
        const questState = isRecord(save.questState) ? save.questState : {};
        this.gold = normalizeLoadedGold(questState.gold);
        this.clearedStages = new Set(normalizeStringArray(questState.clearedStageIds ?? questState.completedQuestIds));
        this.questItems = new Set(normalizeStringArray(questState.questItemIds));
        this.storyCompanions = new Set(normalizeStringArray(questState.storyCompanionIds));
        this.marketState = normalizeMarketState(questState.marketState);
        this.marketCycle = normalizeMarketCycle(questState.marketCycle);
        this.marketContracts = normalizeMarketContracts(questState.marketContracts, this.marketCycle);
        this.facilityUpgrades = normalizeFacilityUpgradeState(questState.facilityUpgrades);
        this.raidInsuranceActive = questState.raidInsuranceActive === true;
        this.activeBountyContractId = normalizeActiveBountyContractId(questState.activeBountyContractId);
        this.raidHistory = normalizeRaidHistory(questState.raidHistory);
        this.monsterCodex = normalizeMonsterCodex(questState.monsterCodex);
        this.beginMonsterCodexRaid();
        this.currentHubTownId = typeof hubLocation.townId === 'string' ? hubLocation.townId : 'central_castle';
        this.pendingRestMenuId = typeof hubLocation.pendingRestMenuId === 'string' ? hubLocation.pendingRestMenuId : null;
        this.inventory = normalizeInventorySnapshot(save.inventory);
        this.equipped = normalizeEquipped(save.equipment);
        this.localSaveRevision = finiteFloor(save.revision, 0);
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

function normalizeInventorySnapshot(value: unknown): InventoryItem[] {
    if (!isRecord(value) || !Array.isArray(value.items)) return [];
    return value.items
        .map((entry, index) => normalizeInventorySaveItem(entry, index))
        .filter((item): item is InventoryItem => item !== null);
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

function normalizeInventorySaveItem(value: unknown, index: number): InventoryItem | null {
    if (!isRecord(value)) return null;
    if (typeof value.itemId !== 'string') return null;
    const gridX = finiteFloor(value.gridX, 0);
    const gridY = finiteFloor(value.gridY, 0);
    return {
        uid: typeof value.uid === 'string' && value.uid
            ? value.uid
            : `save_${value.itemId}_${gridX}_${gridY}_${index}`,
        itemId: value.itemId,
        gridX,
        gridY,
        durability: normalizeDurability(value.itemId, value.durability),
        quantity: normalizeQuantity(value.itemId, value.quantity),
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

function toInventorySaveItem(item: InventoryItem): InventorySaveItem {
    return {
        uid: item.uid,
        itemId: item.itemId,
        gridX: finiteFloor(item.gridX, 0),
        gridY: finiteFloor(item.gridY, 0),
        quantity: normalizeQuantity(item.itemId, item.quantity),
        durability: normalizeDurability(item.itemId, item.durability),
        ...(item.acquiredInRaid ? { acquiredInRaid: true } : {}),
        ...(item.sockets.length > 0 ? { sockets: item.sockets } : {}),
    };
}

function normalizeQuantity(itemId: string, value: unknown): number {
    const maxStack = getItemDef(itemId)?.maxStack ?? 1;
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(1, Math.min(maxStack, Math.floor(value)))
        : 1;
}

function normalizeDurability(itemId: string, value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    return getItemDef(itemId)?.maxDurability ?? 0;
}
