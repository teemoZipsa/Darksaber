import { getClassLine } from '../src/data/ClassTree';
import { getItemDef } from '../src/data/ItemDB';
import { createBaseStats, getBaseStatsForClass } from '../src/data/Stats';
import { STORY_SCENARIOS, type StoryQuestRewardData } from '../src/data/StoryScenarioData';
import { t } from '../src/i18n/LanguageManager';
import type { InventorySaveSnapshot } from '../src/shared/CharacterSave';

export function applyStoryQuestRewardsToSaveState(
    completedQuestIds: ReadonlySet<string>,
    questState: Record<string, unknown>,
    inventory: InventorySaveSnapshot,
    rosterSnapshot: Record<string, unknown>,
    blockableQuestIds: ReadonlySet<string> = completedQuestIds
): string[] {
    const blockedQuestIds = new Set<string>();
    for (const scenario of STORY_SCENARIOS) {
        if (!completedQuestIds.has(scenario.questId)) continue;
        applyStoryQuestReward(scenario.reward, questState, inventory, rosterSnapshot);
        if (blockableQuestIds.has(scenario.questId) && !isStoryRewardOwned(scenario.reward, questState)) {
            blockedQuestIds.add(scenario.questId);
        }
    }
    if (blockedQuestIds.size > 0) {
        questState.completedQuestIds = normalizeStringArray(questState.completedQuestIds)
            .filter((questId) => !blockedQuestIds.has(questId));
    }
    return [...blockedQuestIds];
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

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function isStoryRewardOwned(reward: StoryQuestRewardData, questState: Record<string, unknown>): boolean {
    if (reward.type === 'none') return true;
    if (reward.type === 'bundle') return reward.rewards.every((entry) => isStoryRewardOwned(entry, questState));
    if (reward.type === 'companion') return normalizeStringArray(questState.storyCompanionIds).includes(reward.companionId);
    return normalizeStringArray(questState.questItemIds).includes(reward.itemId);
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
