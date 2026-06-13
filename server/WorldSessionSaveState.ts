import { getItemDef } from '../src/data/ItemDB';
import { getClassLine } from '../src/data/ClassTree';
import { createBaseStats, getBaseStatsForClass } from '../src/data/Stats';
import { STORY_SCENARIOS, type StoryQuestRewardData } from '../src/data/StoryScenarioData';
import { t } from '../src/i18n/LanguageManager';
import type { CharacterSave, CharacterSavePatch, InventorySaveItem, InventorySaveSnapshot } from './AuthStore';

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

    public createPatch(player: WorldSessionSavePlayer | undefined, playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        return player ? this.buildPatch(player, { hubTownId, includeRaidRewards: false }) : this.finalPatches.get(playerId) ?? null;
    }

    public captureFinalPatch(player: WorldSessionSavePlayer, hubTownId?: string, includeRaidRewards: boolean = false): void {
        const patch = this.buildPatch(player, { hubTownId, includeRaidRewards });
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

    public addPlacedItem(player: WorldSessionSavePlayer, placed: WorldSessionPlacedSaveItem): void {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory || placed.quantity <= 0) return;
        const slot = findFreeInventorySlot(inventory, placed.item.id);
        if (!slot) return;
        const item: InventorySaveItem = {
            itemId: placed.item.id,
            gridX: slot.x,
            gridY: slot.y,
            durability: Number.isFinite(placed.durability) ? placed.durability : placed.item.maxDurability,
            quantity: Math.max(1, Math.floor(placed.quantity)),
            acquiredInRaid: true,
        };
        if (placed.sockets) item.sockets = placed.sockets.map((socket) => socket.id);
        inventory.items.push(item);
    }

    private buildPatch(
        player: WorldSessionSavePlayer,
        options: { hubTownId?: string; includeRaidRewards: boolean }
    ): WorldCharacterSavePatch | null {
        const save = player.saveSnapshot;
        if (!save) return null;
        const questState: Record<string, unknown> = {
            ...cloneRecord(save.questState),
            completedQuestIds: options.includeRaidRewards
                ? [...player.completedQuestIds]
                : normalizeStringArray(save.questState.completedQuestIds),
        };
        if (options.includeRaidRewards && player.raidGoldReward > 0) {
            questState.gold = normalizeGoldValue(questState.gold) + Math.floor(player.raidGoldReward);
        }
        const inventory = cloneInventorySnapshot(save.inventory, options);
        const rosterSnapshot = cloneRecord(save.rosterSnapshot);
        if (options.includeRaidRewards) {
            applyStoryQuestRewards(player.completedQuestIds, questState, inventory, rosterSnapshot);
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

export function cloneCharacterSave(save: CharacterSave | undefined): CharacterSave | undefined {
    if (!save) return undefined;
    return {
        ...save,
        hubLocation: cloneRecord(save.hubLocation),
        questState: cloneRecord(save.questState),
        inventory: cloneInventorySnapshot(save.inventory, { includeRaidRewards: true }),
        equipment: cloneRecord(save.equipment),
        partySnapshot: cloneRecord(save.partySnapshot),
        rosterSnapshot: cloneRecord(save.rosterSnapshot),
    };
}

function cloneInventorySnapshot(
    inventory: InventorySaveSnapshot,
    options: { includeRaidRewards: boolean }
): InventorySaveSnapshot {
    return {
        width: inventory.width,
        height: inventory.height,
        items: inventory.items
            .filter((item) => options.includeRaidRewards || item.acquiredInRaid !== true)
            .map((item) => {
                const clone = { ...item };
                if (options.includeRaidRewards) delete clone.acquiredInRaid;
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

function applyStoryQuestRewards(
    completedQuestIds: ReadonlySet<string>,
    questState: Record<string, unknown>,
    inventory: InventorySaveSnapshot,
    rosterSnapshot: Record<string, unknown>
): void {
    for (const scenario of STORY_SCENARIOS) {
        if (!completedQuestIds.has(scenario.questId)) continue;
        applyStoryQuestReward(scenario.reward, questState, inventory, rosterSnapshot);
    }
}

function applyStoryQuestReward(
    reward: StoryQuestRewardData,
    questState: Record<string, unknown>,
    inventory: InventorySaveSnapshot,
    rosterSnapshot: Record<string, unknown>
): void {
    if (reward.type === 'none') return;
    if (reward.type === 'bundle') {
        for (const entry of reward.rewards) {
            applyStoryQuestReward(entry, questState, inventory, rosterSnapshot);
        }
        return;
    }
    if (reward.type === 'questItem') {
        addStringSetValue(questState, 'questItemIds', reward.itemId);
        return;
    }
    if (reward.type === 'inventoryItem') {
        if (inventory.items.some((item) => item.itemId === reward.itemId) || addInventoryItemReward(inventory, reward.itemId)) {
            addStringSetValue(questState, 'questItemIds', reward.itemId);
        }
        return;
    }

    addStringSetValue(questState, 'storyCompanionIds', reward.companionId);
    addRosterCompanion(rosterSnapshot, reward);
}

function addInventoryItemReward(inventory: InventorySaveSnapshot, itemId: string): boolean {
    const itemDef = getItemDef(itemId);
    if (!itemDef) return false;
    const slot = findFreeInventorySlot(inventory, itemId);
    if (!slot) return false;
    inventory.items.push({
        itemId,
        gridX: slot.x,
        gridY: slot.y,
        durability: itemDef.maxDurability,
        quantity: 1,
    });
    return true;
}

function addRosterCompanion(
    rosterSnapshot: Record<string, unknown>,
    reward: Extract<StoryQuestRewardData, { type: 'companion' }>
): void {
    const rawCharacters = Array.isArray(rosterSnapshot.characters) ? rosterSnapshot.characters : [];
    const characters = rawCharacters.filter(isRecord);
    if (characters.some((entry) => entry.id === reward.companionId)) {
        rosterSnapshot.characters = rawCharacters;
        return;
    }
    const classLine = getClassLine(reward.classId);
    const baseMov = classLine?.baseMovRange ?? 4;
    rosterSnapshot.characters = [
        ...rawCharacters,
        {
            id: reward.companionId,
            name: t(reward.nameKey),
            classKey: reward.classId,
            gender: 'M',
            tier: classLine?.tiers[0]?.tier ?? 1,
            level: 1,
            exp: 0,
            baseStats: createBaseStats(getBaseStatsForClass(reward.classId, baseMov)),
        },
    ];
}

function addStringSetValue(record: Record<string, unknown>, key: string, value: string): void {
    const values = new Set(normalizeStringArray(record[key]));
    values.add(value);
    record[key] = [...values];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
