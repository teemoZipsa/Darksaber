import { getItemDef } from '../src/data/ItemDB';
import type { CharacterSave, CharacterSavePatch, InventorySaveItem, InventorySaveSnapshot } from './AuthStore';
import { applyStoryQuestRewardsToSaveState } from './StoryRewardSave';

export type WorldCharacterSavePatch = CharacterSavePatch;

export interface WorldSessionSavePlayer {
    id: string;
    completedQuestIds: Set<string>;
    raidGoldReward: number;
    saveSnapshot?: CharacterSave;
}

export interface WorldSessionPlacedSaveItem {
    item: { id: string; maxDurability: number };
    durability: number;
    quantity: number;
    sockets?: Array<{ id: string }>;
}

export class WorldSessionSaveState {
    private readonly dirtyPlayerIds = new Set<string>();
    private readonly finalPatches = new Map<string, WorldCharacterSavePatch>();

    public markDirty(playerId: string): void {
        this.dirtyPlayerIds.add(playerId);
    }

    public consumeDirtyPlayerIds(): string[] {
        const playerIds = [...this.dirtyPlayerIds];
        this.dirtyPlayerIds.clear();
        return playerIds;
    }

    public getDirtyPlayerIds(): string[] {
        return [...this.dirtyPlayerIds];
    }

    public restoreDirtyPlayerIds(playerIds: readonly string[]): void {
        this.dirtyPlayerIds.clear();
        for (const playerId of playerIds) this.dirtyPlayerIds.add(playerId);
    }

    public createPatch(player: WorldSessionSavePlayer | undefined, playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        return player
            ? this.buildPatch(player, {
                hubTownId,
                includeAcquiredRaidItems: false,
                includeSurvivalRewards: false,
            })
            : this.finalPatches.get(playerId) ?? null;
    }

    public createRecoveryPatch(player: WorldSessionSavePlayer | undefined, playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        return player
            ? this.buildPatch(player, {
                hubTownId,
                includeAcquiredRaidItems: true,
                includeSurvivalRewards: false,
            })
            : this.finalPatches.get(playerId) ?? null;
    }

    public captureFinalPatch(player: WorldSessionSavePlayer, hubTownId?: string, includeRaidRewards: boolean = false): void {
        const patch = this.buildPatch(player, {
            hubTownId,
            includeAcquiredRaidItems: includeRaidRewards,
            includeSurvivalRewards: includeRaidRewards,
        });
        if (patch) this.finalPatches.set(player.id, patch);
    }

    public hasFinalPatch(playerId: string): boolean {
        return this.finalPatches.has(playerId);
    }

    public consumeFinalPatch(playerId: string): WorldCharacterSavePatch | null {
        const patch = this.finalPatches.get(playerId) ?? null;
        this.finalPatches.delete(playerId);
        return patch;
    }

    public removeItemQuantity(player: WorldSessionSavePlayer, itemId: string, quantity: number): void {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory || quantity <= 0) return;
        let remaining = Math.floor(quantity);
        for (const item of [...inventory.items]) {
            if (item.itemId !== itemId || remaining <= 0) continue;
            const consumed = Math.min(Math.max(1, item.quantity), remaining);
            item.quantity -= consumed;
            remaining -= consumed;
            if (item.quantity <= 0) {
                inventory.items = inventory.items.filter((entry) => entry !== item);
            }
        }
    }

    public canAddPlacedItems(player: WorldSessionSavePlayer, placedItems: readonly WorldSessionPlacedSaveItem[]): boolean {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory) return true;
        const draft = cloneInventorySnapshot(inventory, { includeAcquiredRaidItems: true });
        for (const placed of placedItems) {
            if (!tryAddPlacedItemToInventory(draft, placed, false)) return false;
        }
        return true;
    }

    public addPlacedItem(player: WorldSessionSavePlayer, placed: WorldSessionPlacedSaveItem): boolean {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory) return true;
        return tryAddPlacedItemToInventory(inventory, placed, true);
    }

    private buildPatch(
        player: WorldSessionSavePlayer,
        options: { hubTownId?: string; includeAcquiredRaidItems: boolean; includeSurvivalRewards: boolean }
    ): WorldCharacterSavePatch | null {
        const save = player.saveSnapshot;
        if (!save) return null;
        const questState: Record<string, unknown> = {
            ...cloneRecord(save.questState),
            completedQuestIds: options.includeSurvivalRewards
                ? [...player.completedQuestIds]
                : normalizeStringArray(save.questState.completedQuestIds),
        };
        if (options.includeSurvivalRewards && player.raidGoldReward > 0) {
            questState.gold = normalizeGoldValue(questState.gold) + Math.floor(player.raidGoldReward);
        }
        const inventory = cloneInventorySnapshot(save.inventory, options);
        const rosterSnapshot = cloneRecord(save.rosterSnapshot);
        if (options.includeSurvivalRewards) {
            const previousQuestIds = new Set(normalizeStringArray(save.questState.completedQuestIds));
            const blockableQuestIds = new Set([...player.completedQuestIds].filter((questId) => !previousQuestIds.has(questId)));
            applyStoryQuestRewardsToSaveState(player.completedQuestIds, questState, inventory, rosterSnapshot, blockableQuestIds);
        }
        const hubLocation = {
            ...cloneRecord(save.hubLocation),
            ...(options.hubTownId ? { townId: options.hubTownId } : {}),
        };
        return {
            saveVersion: save.saveVersion,
            hubLocation,
            questState,
            inventory,
            equipment: cloneRecord(save.equipment),
            partySnapshot: cloneRecord(save.partySnapshot),
            rosterSnapshot,
        };
    }
}

function tryAddPlacedItemToInventory(
    inventory: InventorySaveSnapshot,
    placed: WorldSessionPlacedSaveItem,
    acquiredInRaid: boolean
): boolean {
    if (placed.quantity <= 0) return false;
    const slot = findFreeInventorySlot(inventory, placed.item.id);
    if (!slot) return false;
    const item: InventorySaveItem = {
        itemId: placed.item.id,
        gridX: slot.x,
        gridY: slot.y,
        durability: Number.isFinite(placed.durability) ? placed.durability : placed.item.maxDurability,
        quantity: Math.max(1, Math.floor(placed.quantity)),
    };
    if (acquiredInRaid) item.acquiredInRaid = true;
    if (placed.sockets) item.sockets = placed.sockets.map((socket) => socket.id);
    inventory.items.push(item);
    return true;
}

export function cloneCharacterSave(save: CharacterSave | undefined): CharacterSave | undefined {
    if (!save) return undefined;
    return {
        ...save,
        hubLocation: cloneRecord(save.hubLocation),
        questState: cloneRecord(save.questState),
        inventory: cloneInventorySnapshot(save.inventory, { includeAcquiredRaidItems: true }),
        equipment: cloneRecord(save.equipment),
        partySnapshot: cloneRecord(save.partySnapshot),
        rosterSnapshot: cloneRecord(save.rosterSnapshot),
    };
}

function cloneInventorySnapshot(
    inventory: InventorySaveSnapshot,
    options: { includeAcquiredRaidItems: boolean }
): InventorySaveSnapshot {
    return {
        width: inventory.width,
        height: inventory.height,
        items: inventory.items
            .filter((item) => options.includeAcquiredRaidItems || item.acquiredInRaid !== true)
            .map((item) => {
                const clone = { ...item };
                if (options.includeAcquiredRaidItems) delete clone.acquiredInRaid;
                return clone;
            }),
    };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeGoldValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function findFreeInventorySlot(inventory: InventorySaveSnapshot, itemId: string): { x: number; y: number } | null {
    const item = getItemDef(itemId);
    if (!item) return null;
    for (let y = 0; y <= inventory.height - item.gridH; y++) {
        for (let x = 0; x <= inventory.width - item.gridW; x++) {
            if (canPlaceSavedItem(inventory, x, y, item.gridW, item.gridH)) return { x, y };
        }
    }
    return null;
}

function canPlaceSavedItem(inventory: InventorySaveSnapshot, x: number, y: number, width: number, height: number): boolean {
    for (const placed of inventory.items) {
        const item = getItemDef(placed.itemId);
        const itemWidth = item?.gridW ?? 1;
        const itemHeight = item?.gridH ?? 1;
        const overlaps = x < placed.gridX + itemWidth
            && x + width > placed.gridX
            && y < placed.gridY + itemHeight
            && y + height > placed.gridY;
        if (overlaps) return false;
    }
    return true;
}
