import { getItemDef } from '../src/data/ItemDB';
import type { RaidFailureSummary } from '../src/net/WorldProtocol';
import { FIRST_SURVIVAL_GOLD_REWARD, FIRST_SURVIVAL_QUEST_ID } from '../src/shared/FirstSurvivalReward';
import { prependRaidHistory, type RaidHistoryEntry } from '../src/raid/RaidHistory';
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

    /** Persist the server-authoritative raid injury flag on the saved roster entry. */
    public markCharacterInjured(player: WorldSessionSavePlayer, characterId: string): void {
        const characters = player.saveSnapshot?.rosterSnapshot.characters;
        if (Array.isArray(characters)) {
            const character = characters.find((entry) => (
                isRecord(entry) && entry.id === characterId
            ));
            if (isRecord(character)) character.injured = true;
        }
        // A down is save-worthy even when an old save is missing its roster entry.
        this.markDirty(player.id);
    }

    public createPatch(player: WorldSessionSavePlayer | undefined, playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        return player
            ? this.buildPatch(player, {
                hubTownId,
                includeAcquiredRaidItems: true,
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

    public captureFinalPatch(
        player: WorldSessionSavePlayer,
        hubTownId?: string,
        includeRaidRewards: boolean = false
    ): RaidFailureSummary | null {
        if (!includeRaidRewards) {
            const failure = this.buildFailurePatch(player, hubTownId);
            if (failure) this.finalPatches.set(player.id, failure.patch);
            return failure?.summary ?? null;
        }
        const patch = this.buildPatch(player, {
            hubTownId,
            includeAcquiredRaidItems: true,
            includeSurvivalRewards: true,
            grantFirstReturn: true,
        });
        if (patch) this.finalPatches.set(player.id, patch);
        return null;
    }

    public hasFinalPatch(playerId: string): boolean {
        return this.finalPatches.has(playerId);
    }

    /** Attach a server-authoritative raid summary to an already captured final patch. */
    public addFinalRaidHistory(playerId: string, entry: RaidHistoryEntry): boolean {
        const patch = this.finalPatches.get(playerId);
        if (!patch) return false;
        const questState = cloneRecord(patch.questState ?? {});
        questState.raidHistory = prependRaidHistory(questState.raidHistory, entry);
        patch.questState = questState;
        return true;
    }

    /** Whether a survival flush for this player would grant the first-survival bonus. */
    public grantsFirstSurvivalBonus(player: WorldSessionSavePlayer): boolean {
        return !hasClaimedFirstSurvival(player);
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

    public tryRemoveItemQuantity(player: WorldSessionSavePlayer, itemId: string, quantity: number): boolean {
        const inventory = player.saveSnapshot?.inventory;
        const required = Math.max(0, Math.floor(quantity));
        if (!inventory || required <= 0) return false;
        const available = inventory.items.reduce((total, item) => (
            item.itemId === itemId ? total + Math.max(1, item.quantity) : total
        ), 0);
        if (available < required) return false;
        this.removeItemQuantity(player, itemId, required);
        return true;
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
        options: { hubTownId?: string; includeAcquiredRaidItems: boolean; includeSurvivalRewards: boolean; grantFirstReturn?: boolean }
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
            if (options.grantFirstReturn) grantFirstSurvivalReward(player, questState);
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

    private buildFailurePatch(player: WorldSessionSavePlayer, hubTownId?: string): { patch: WorldCharacterSavePatch; summary: RaidFailureSummary } | null {
        const patch = this.buildPatch(player, {
            hubTownId, includeAcquiredRaidItems: true, includeSurvivalRewards: true,
        });
        if (!patch) return null;
        return { patch, summary: { backpackLost: [], equipmentLost: [], recoveryEquipped: 0, recoveryBackpack: 0 } };
    }

}

function hasClaimedFirstSurvival(player: WorldSessionSavePlayer): boolean {
    if (player.completedQuestIds.has(FIRST_SURVIVAL_QUEST_ID)) return true;
    const save = player.saveSnapshot;
    return save ? normalizeStringArray(save.questState.completedQuestIds).includes(FIRST_SURVIVAL_QUEST_ID) : false;
}

function grantFirstSurvivalReward(
    player: WorldSessionSavePlayer,
    questState: Record<string, unknown>
): void {
    if (hasClaimedFirstSurvival(player)) return;
    questState.gold = normalizeGoldValue(questState.gold) + FIRST_SURVIVAL_GOLD_REWARD;
    const completed = new Set(normalizeStringArray(questState.completedQuestIds));
    completed.add(FIRST_SURVIVAL_QUEST_ID);
    questState.completedQuestIds = [...completed];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tryAddPlacedItemToInventory(
    inventory: InventorySaveSnapshot,
    placed: WorldSessionPlacedSaveItem,
    acquiredInRaid: boolean
): boolean {
    if (placed.quantity <= 0) return false;
    const itemDef = getItemDef(placed.item.id);
    if (!itemDef) return false;
    const quantity = Math.max(1, Math.floor(placed.quantity));
    const existing = inventory.items.find((item) => (
        item.itemId === placed.item.id
        && item.quantity + quantity <= itemDef.maxStack
        && (item.sockets?.length ?? 0) === 0
        && (placed.sockets?.length ?? 0) === 0
    ));
    if (existing) {
        existing.quantity += quantity;
        if (acquiredInRaid) existing.acquiredInRaid = true;
        return true;
    }
    const slot = findFreeInventorySlot(inventory, placed.item.id);
    if (!slot) return false;
    const item: InventorySaveItem = {
        itemId: placed.item.id,
        gridX: slot.x,
        gridY: slot.y,
        durability: Number.isFinite(placed.durability) ? placed.durability : placed.item.maxDurability,
        quantity: Math.min(itemDef.maxStack, quantity),
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
        inventory: cloneInventorySnapshotWithRaidState(save.inventory),
        stashSnapshot: cloneInventorySnapshotWithRaidState(save.stashSnapshot),
        equipment: cloneRecord(save.equipment),
        partySnapshot: cloneRecord(save.partySnapshot),
        rosterSnapshot: cloneRecord(save.rosterSnapshot),
    };
}

function cloneInventorySnapshotWithRaidState(inventory: InventorySaveSnapshot): InventorySaveSnapshot {
    return {
        width: inventory.width,
        height: inventory.height,
        items: inventory.items.map((item) => ({ ...item })),
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
