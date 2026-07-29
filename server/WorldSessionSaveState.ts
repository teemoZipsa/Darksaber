import { getItemDef, type ItemSlot } from '../src/data/ItemDB';
import { getStarterBodyArmorId, STARTER_CONSUMABLE_ITEM_IDS, STARTER_WEAPON_ITEM_ID } from '../src/data/StarterKitData';
import type { RaidFailureEquipmentSummary, RaidFailureSummary } from '../src/net/WorldProtocol';
import { FIRST_SURVIVAL_GOLD_REWARD, FIRST_SURVIVAL_QUEST_ID } from '../src/shared/FirstSurvivalReward';
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
        });
        if (patch) this.finalPatches.set(player.id, patch);
        return null;
    }

    public hasFinalPatch(playerId: string): boolean {
        return this.finalPatches.has(playerId);
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
            grantFirstSurvivalReward(player, questState);
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

    private buildFailurePatch(
        player: WorldSessionSavePlayer,
        hubTownId?: string
    ): { patch: WorldCharacterSavePatch; summary: RaidFailureSummary } | null {
        const save = player.saveSnapshot;
        if (!save) return null;

        const questState = cloneRecord(save.questState);
        const insuranceActive = questState.raidInsuranceActive === true;
        if (insuranceActive) questState.raidInsuranceActive = false;
        const inventory: InventorySaveSnapshot = {
            width: save.inventory.width,
            height: save.inventory.height,
            items: [],
        };
        const backpackLost = mergeFailureItems(save.inventory.items.map((item) => ({
            itemId: item.itemId,
            quantity: Math.max(1, Math.floor(item.quantity)),
        })));
        const equipment = cloneRecord(save.equipment);
        const rosterSnapshot = cloneRecord(save.rosterSnapshot);
        const rosterCharacters = readRosterCharacters(rosterSnapshot);
        const activeCharacterIds = uniqueStrings([
            save.characterId,
            ...normalizeStringArray(save.partySnapshot.activeCharacterIds),
        ]).slice(0, 3);
        const plannedLosses: Array<RaidFailureEquipmentSummary & { record: Record<string, unknown> }> = [];

        for (const characterId of activeCharacterIds) {
            const rosterCharacter = rosterCharacters.get(characterId);
            const record = characterId === save.characterId
                ? equipment
                : isRecord(rosterCharacter?.equipment) ? cloneRecord(rosterCharacter.equipment) : {};
            if (characterId !== save.characterId && rosterCharacter) rosterCharacter.equipment = record;
            const candidates = readEquipmentCandidates(record);
            if (candidates.length === 0) continue;
            const selected = candidates[stableIndex(`${player.id}:${characterId}:raid-failure`, candidates.length)];
            plannedLosses.push({
                characterId,
                characterName: typeof rosterCharacter?.name === 'string' ? rosterCharacter.name : characterId,
                slot: selected.slot,
                itemId: selected.itemId,
                quantity: selected.quantity,
                record,
            });
        }

        const protectedLoss = insuranceActive
            ? [...plannedLosses].sort((a, b) => failureEquipmentValue(b) - failureEquipmentValue(a))[0]
            : undefined;
        const equipmentLost: RaidFailureEquipmentSummary[] = [];
        for (const loss of plannedLosses) {
            if (loss === protectedLoss) continue;
            loss.record[loss.slot] = null;
            equipmentLost.push(stripFailureRecord(loss));
        }

        let recoveryEquipped = 0;
        for (const characterId of activeCharacterIds) {
            const rosterCharacter = rosterCharacters.get(characterId);
            const record = characterId === save.characterId
                ? equipment
                : isRecord(rosterCharacter?.equipment) ? rosterCharacter.equipment : {};
            if (characterId !== save.characterId && rosterCharacter) rosterCharacter.equipment = record;
            const classLineId = readClassLineId(rosterCharacter);
            recoveryEquipped += addStarterEquipmentIfEmpty(record, 'weapon', STARTER_WEAPON_ITEM_ID);
            recoveryEquipped += addStarterEquipmentIfEmpty(record, 'body', getStarterBodyArmorId(classLineId));
        }
        const primaryRosterCharacter = rosterCharacters.get(save.characterId);
        if (primaryRosterCharacter) primaryRosterCharacter.equipment = cloneRecord(equipment);

        let recoveryBackpack = 0;
        for (const itemId of STARTER_CONSUMABLE_ITEM_IDS) {
            const item = getItemDef(itemId);
            if (!item) continue;
            if (tryAddPlacedItemToInventory(inventory, {
                item,
                durability: item.maxDurability,
                quantity: 1,
            }, false)) recoveryBackpack += 1;
        }

        const hubLocation = {
            ...cloneRecord(save.hubLocation),
            ...(hubTownId ? { townId: hubTownId } : {}),
        };
        return {
            patch: {
                saveVersion: save.saveVersion,
                hubLocation,
                questState,
                inventory,
                equipment,
                partySnapshot: cloneRecord(save.partySnapshot),
                rosterSnapshot,
            },
            summary: {
                backpackLost,
                equipmentLost,
                ...(protectedLoss ? { protectedEquipment: stripFailureRecord(protectedLoss) } : {}),
                recoveryEquipped,
                recoveryBackpack,
            },
        };
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

const FAILURE_EQUIPMENT_SLOTS: ItemSlot[] = ['weapon', 'shield', 'head', 'body', 'boots', 'accessory', 'accessory2'];

function readRosterCharacters(rosterSnapshot: Record<string, unknown>): Map<string, Record<string, unknown>> {
    const result = new Map<string, Record<string, unknown>>();
    if (!Array.isArray(rosterSnapshot.characters)) return result;
    for (const raw of rosterSnapshot.characters) {
        if (isRecord(raw) && typeof raw.id === 'string') result.set(raw.id, raw);
    }
    return result;
}

function readEquipmentCandidates(record: Record<string, unknown>): Array<{ slot: ItemSlot; itemId: string; quantity: number }> {
    return FAILURE_EQUIPMENT_SLOTS.flatMap((slot) => {
        const raw = record[slot];
        if (!isRecord(raw) || typeof raw.itemId !== 'string' || !getItemDef(raw.itemId)) return [];
        return [{
            slot,
            itemId: raw.itemId,
            quantity: typeof raw.quantity === 'number' && Number.isFinite(raw.quantity)
                ? Math.max(1, Math.floor(raw.quantity))
                : 1,
        }];
    });
}

function addStarterEquipmentIfEmpty(
    record: Record<string, unknown>,
    slot: ItemSlot,
    itemId: string
): number {
    if (isRecord(record[slot])) return 0;
    const item = getItemDef(itemId);
    if (!item || item.slot !== slot) return 0;
    record[slot] = {
        itemId: item.id,
        gridX: 0,
        gridY: 0,
        quantity: 1,
        durability: item.maxDurability,
    };
    return 1;
}

function readClassLineId(character: Record<string, unknown> | undefined): string {
    if (!character) return 'infantry';
    if (typeof character.classKey === 'string') return character.classKey;
    if (typeof character.classLineId === 'string') return character.classLineId;
    return 'infantry';
}

function stableIndex(seed: string, length: number): number {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0) % Math.max(1, length);
}

function failureEquipmentValue(loss: RaidFailureEquipmentSummary): number {
    return (getItemDef(loss.itemId)?.baseValue ?? 0) * Math.max(1, loss.quantity);
}

function stripFailureRecord(
    loss: RaidFailureEquipmentSummary & { record: Record<string, unknown> }
): RaidFailureEquipmentSummary {
    return {
        characterId: loss.characterId,
        characterName: loss.characterName,
        slot: loss.slot,
        itemId: loss.itemId,
        quantity: loss.quantity,
    };
}

function mergeFailureItems(items: Array<{ itemId: string; quantity: number }>): Array<{ itemId: string; quantity: number }> {
    const totals = new Map<string, number>();
    for (const item of items) totals.set(item.itemId, (totals.get(item.itemId) ?? 0) + Math.max(1, item.quantity));
    return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function uniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
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
