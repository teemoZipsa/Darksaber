import { ITEMS } from '../src/data/ItemDB';
import {
    applyFacilityCostMultiplier,
    getInjuryTreatmentCostMultiplier,
    normalizeFacilityUpgradeState,
} from '../src/data/FacilityUpgradeData';
import {
    type MarketContract,
    normalizeMarketContracts,
    normalizeMarketCycle,
    normalizeMarketState,
} from '../src/data/MarketData';
import { getSellPrice, TRADE_GOOD_SELL_MULTIPLIERS } from '../src/data/ShopData';
import { isTownId } from '../src/data/TownFacilityData';
import { getRestFacility, INJURY_TREATMENT_PRICE } from '../src/data/RestFacilityData';
import { getLearnedSkillIdSet, normalizeLoadout, normalizeUpgradeLevels } from '../src/magic/MagicLoadout';
import type { CharacterSave, CharacterSavePatch, InventorySaveSnapshot } from '../src/shared/CharacterSave';
import { HttpError } from './HttpError';
import { normalizeInventorySnapshot } from './AuthStore';

export const CLIENT_HUB_PATCH_FIELDS = new Set([
    'hubLocation',
    'questState',
    'inventory',
    'stashSnapshot',
    'equipment',
    'partySnapshot',
    'rosterSnapshot',
]);

const CLIENT_QUEST_STATE_FIELDS = new Set([
    'gold',
    'questItemIds',
    'storyCompanionIds',
    'marketState',
    'marketCycle',
    'marketContracts',
    'facilityUpgrades',
    'raidInsuranceActive',
]);

const EQUIPMENT_SLOTS = ['weapon', 'shield', 'head', 'body', 'boots', 'accessory', 'accessory2'] as const;

export function buildHubSavePatch(
    patch: Record<string, unknown>,
    currentSave: CharacterSave,
): CharacterSavePatch {
    for (const field of Object.keys(patch)) {
        if (!CLIENT_HUB_PATCH_FIELDS.has(field)) {
            throw new HttpError(400, 'forbidden_save_field', `${field} cannot be patched by the client.`);
        }
    }

    const next: CharacterSavePatch = {};
    if (isRecord(patch.hubLocation)) {
        next.hubLocation = sanitizeHubLocation(patch.hubLocation, currentSave.hubLocation);
    }
    if (isRecord(patch.questState)) {
        next.questState = sanitizeClientQuestState(patch.questState, currentSave.questState);
    }
    if (isRecord(patch.inventory)) {
        next.inventory = sanitizeClientInventorySnapshot(patch.inventory);
    }
    if (isRecord(patch.stashSnapshot)) {
        next.stashSnapshot = sanitizeClientInventorySnapshot(patch.stashSnapshot);
    }
    if (isRecord(patch.equipment)) {
        next.equipment = {
            ...cloneRecord(currentSave.equipment),
            ...sanitizeEquipment(patch.equipment),
        };
    }
    if (isRecord(patch.partySnapshot)) {
        next.partySnapshot = sanitizePartySnapshot(patch.partySnapshot, currentSave);
    }
    if (isRecord(patch.rosterSnapshot)) {
        next.rosterSnapshot = mergeClientRosterSnapshot(currentSave.rosterSnapshot, patch.rosterSnapshot);
    }
    assertNoFreeHubEconomyGain(next, currentSave);
    return next;
}

function sanitizeHubLocation(
    incoming: Record<string, unknown>,
    current: Record<string, unknown>,
): Record<string, unknown> {
    const next: Record<string, unknown> = { ...current };
    if (typeof incoming.realm === 'string' && incoming.realm.trim()) {
        next.realm = incoming.realm.trim();
    }
    if (typeof incoming.townId === 'string' && isTownId(incoming.townId)) {
        next.townId = incoming.townId;
    }
    if (incoming.pendingRestMenuId === null) {
        next.pendingRestMenuId = null;
    } else if (typeof incoming.pendingRestMenuId === 'string') {
        const menuId = incoming.pendingRestMenuId.trim();
        if (!menuId) {
            next.pendingRestMenuId = null;
        } else {
            const townId = typeof next.townId === 'string' ? next.townId : '';
            const menu = getRestFacility(townId)?.menu.find((candidate) => candidate.id === menuId);
            if (!menu) throw new HttpError(400, 'invalid_rest_menu', 'Rest menu is not available in the current town.');
            next.pendingRestMenuId = menu.id;
        }
    }
    return next;
}

function sanitizeClientQuestState(
    incoming: Record<string, unknown>,
    current: Record<string, unknown>,
): Record<string, unknown> {
    for (const key of Object.keys(incoming)) {
        if (key === 'completedQuestIds' || key === 'clearedStageIds') {
            throw new HttpError(400, 'forbidden_save_field', `${key} cannot be patched by the client.`);
        }
        if (!CLIENT_QUEST_STATE_FIELDS.has(key)) {
            throw new HttpError(400, 'forbidden_save_field', `${key} cannot be patched by the client.`);
        }
    }

    const next: Record<string, unknown> = { ...current };
    if (typeof incoming.gold === 'number' && Number.isFinite(incoming.gold)) {
        next.gold = Math.max(0, Math.floor(incoming.gold));
    }
    if (Array.isArray(incoming.questItemIds)) {
        next.questItemIds = incoming.questItemIds.filter((entry): entry is string => typeof entry === 'string');
    }
    if (Array.isArray(incoming.storyCompanionIds)) {
        next.storyCompanionIds = incoming.storyCompanionIds.filter((entry): entry is string => typeof entry === 'string');
    }
    if (isRecord(incoming.marketState)) {
        next.marketState = normalizeMarketState(incoming.marketState);
    }
    if (typeof incoming.marketCycle === 'number' && Number.isFinite(incoming.marketCycle)) {
        next.marketCycle = normalizeMarketCycle(incoming.marketCycle);
    }
    if (Array.isArray(incoming.marketContracts)) {
        next.marketContracts = sanitizeClientMarketContracts(
            incoming.marketContracts,
            current.marketContracts,
            normalizeMarketCycle(next.marketCycle),
        );
    }
    if (isRecord(incoming.facilityUpgrades)) {
        next.facilityUpgrades = normalizeFacilityUpgradeState(incoming.facilityUpgrades);
    }
    if (typeof incoming.raidInsuranceActive === 'boolean') {
        next.raidInsuranceActive = incoming.raidInsuranceActive;
    }
    return next;
}

function sanitizeClientInventorySnapshot(value: Record<string, unknown>): InventorySaveSnapshot {
    const width = typeof value.width === 'number' ? value.width : 10;
    const height = typeof value.height === 'number' ? value.height : 6;
    const items = Array.isArray(value.items)
        ? value.items.map((entry) => {
            if (!isRecord(entry)) return entry;
            const { acquiredInRaid: _ignored, ...rest } = entry;
            return rest;
        })
        : [];
    return normalizeInventorySnapshot({ width, height, items: items as InventorySaveSnapshot['items'] });
}

function sanitizeClientMarketContracts(
    incoming: unknown[],
    currentRaw: unknown,
    marketCycle: number,
): MarketContract[] {
    const current = normalizeMarketContracts(currentRaw, marketCycle);
    const incomingById = new Map(
        normalizeMarketContracts(incoming, marketCycle).map((contract) => [contract.id, contract])
    );
    return current.flatMap((contract) => {
        const incomingContract = incomingById.get(contract.id);
        if (!incomingContract) return [contract];
        const remainingQuantity = Math.min(contract.remainingQuantity, incomingContract.remainingQuantity);
        return remainingQuantity > 0 ? [{ ...contract, remainingQuantity }] : [];
    });
}

function sanitizeEquipment(value: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const slot of EQUIPMENT_SLOTS) {
        const raw = value[slot];
        if (raw === null) {
            next[slot] = null;
            continue;
        }
        if (!isRecord(raw) || typeof raw.itemId !== 'string') continue;
        const item = ITEMS.find((candidate) => candidate.id === raw.itemId);
        if (!item || item.slot !== slot) continue;
        next[slot] = {
            itemId: item.id,
            gridX: finiteFloor(raw.gridX, 0),
            gridY: finiteFloor(raw.gridY, 0),
            quantity: Math.max(1, Math.min(item.maxStack, finiteFloor(raw.quantity, 1))),
            durability: Math.max(0, Math.min(item.maxDurability, finiteFloor(raw.durability, item.maxDurability))),
            ...(Array.isArray(raw.sockets)
                ? {
                    sockets: raw.sockets.filter((entry): entry is string => {
                        return typeof entry === 'string' && ITEMS.some((candidate) => candidate.id === entry);
                    }),
                }
                : {}),
        };
    }
    return next;
}

function sanitizePartySnapshot(
    incoming: Record<string, unknown>,
    currentSave: CharacterSave,
): Record<string, unknown> {
    const rosterIds = readRosterCharacterIds(currentSave.rosterSnapshot);
    const activeCharacterIds = Array.isArray(incoming.activeCharacterIds)
        ? incoming.activeCharacterIds.filter((entry): entry is string => {
            return typeof entry === 'string' && rosterIds.has(entry);
        }).slice(0, 3)
        : normalizeStringArray(currentSave.partySnapshot.activeCharacterIds);
    return {
        ...cloneRecord(currentSave.partySnapshot),
        activeCharacterIds,
    };
}

function mergeClientRosterSnapshot(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const currentCharacters = Array.isArray(current.characters) ? current.characters : [];
    const incomingById = new Map<string, Record<string, unknown>>();
    if (Array.isArray(incoming.characters)) {
        for (const raw of incoming.characters) {
            if (!isRecord(raw) || typeof raw.id !== 'string') continue;
            incomingById.set(raw.id, raw);
        }
    }

    return {
        ...current,
        characters: currentCharacters.map((raw) => {
            if (!isRecord(raw) || typeof raw.id !== 'string') return raw;
            const incomingCharacter = incomingById.get(raw.id);
            if (!incomingCharacter) return raw;
            return mergeClientRosterCharacter(raw, incomingCharacter);
        }),
    };
}

function mergeClientRosterCharacter(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const owner = readLoadoutOwner(current);
    if (!owner) return current;
    const next: Record<string, unknown> = { ...current };
    if (Array.isArray(incoming.magicLoadout)) {
        next.magicLoadout = normalizeLoadout(readStringArray(incoming.magicLoadout), owner);
    }
    if (isRecord(incoming.skillUpgradeLevels)) {
        const learned = getLearnedSkillIdSet(owner);
        const normalized = normalizeUpgradeLevels(readNumberRecord(incoming.skillUpgradeLevels));
        const upgrades: Record<string, number> = {};
        for (const [skillId, level] of Object.entries(normalized)) {
            if (learned.has(skillId)) upgrades[skillId] = level;
        }
        next.skillUpgradeLevels = upgrades;
    }
    if (isRecord(incoming.equipment)) {
        next.equipment = sanitizeEquipment(incoming.equipment);
    }
    if (typeof incoming.injured === 'boolean') {
        if (incoming.injured && current.injured !== true) {
            throw new HttpError(400, 'forbidden_injury_state', 'Raid injuries can only be applied by the server.');
        }
        if (!incoming.injured && current.injured === true) delete next.injured;
    }
    return next;
}

function readNumberRecord(value: Record<string, unknown>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
    }
    return result;
}

function readLoadoutOwner(character: Record<string, unknown>): { classLineId: string; currentTier: number } | null {
    const classLineId = typeof character.classKey === 'string'
        ? character.classKey
        : typeof character.classLineId === 'string'
            ? character.classLineId
            : null;
    const tier = typeof character.tier === 'number' && Number.isFinite(character.tier)
        ? character.tier
        : typeof character.currentTier === 'number' && Number.isFinite(character.currentTier)
            ? character.currentTier
            : null;
    if (!classLineId || tier === null) return null;
    return { classLineId, currentTier: Math.max(1, Math.floor(tier)) };
}

function readRosterCharacterIds(rosterSnapshot: Record<string, unknown>): Set<string> {
    const ids = new Set<string>();
    if (!Array.isArray(rosterSnapshot.characters)) return ids;
    for (const raw of rosterSnapshot.characters) {
        if (isRecord(raw) && typeof raw.id === 'string') ids.add(raw.id);
    }
    return ids;
}

function readStringArray(value: unknown[]): string[] {
    return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function finiteFloor(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoFreeHubEconomyGain(patch: CharacterSavePatch, currentSave: CharacterSave): void {
    const nextQuestState = isRecord(patch.questState) ? patch.questState : currentSave.questState;
    const currentGold = readGold(currentSave.questState);
    const nextGold = readGold(nextQuestState);
    const currentCounts = countSaveItems(
        currentSave.inventory,
        currentSave.stashSnapshot,
        currentSave.equipment,
        currentSave.rosterSnapshot,
        currentSave.characterId,
    );
    const nextCounts = countSaveItems(
        patch.inventory ?? currentSave.inventory,
        patch.stashSnapshot ?? currentSave.stashSnapshot,
        isRecord(patch.equipment) ? patch.equipment : currentSave.equipment,
        isRecord(patch.rosterSnapshot) ? patch.rosterSnapshot : currentSave.rosterSnapshot,
        currentSave.characterId,
    );

    let requiredSpend = getNewRestReservationCost(patch, currentSave)
        + getInjuryTreatmentCost(patch, currentSave);
    let allowedEarn = 0;
    const itemIds = new Set([...currentCounts.keys(), ...nextCounts.keys()]);
    for (const itemId of itemIds) {
        const currentQuantity = currentCounts.get(itemId) ?? 0;
        const nextQuantity = nextCounts.get(itemId) ?? 0;
        const delta = nextQuantity - currentQuantity;
        if (delta > 0) requiredSpend += delta * getHubBuyValue(itemId);
        else if (delta < 0) allowedEarn += Math.abs(delta) * getHubSellCredit(itemId, currentSave.questState);
    }

    const goldDelta = nextGold - currentGold;
    if (goldDelta > allowedEarn - requiredSpend) {
        throw new HttpError(400, 'invalid_hub_economy_patch', 'Hub save patch creates gold or items without a matching cost.');
    }
}

function getInjuryTreatmentCost(patch: CharacterSavePatch, currentSave: CharacterSave): number {
    if (!isRecord(patch.rosterSnapshot)) return 0;
    const currentCharacters = readRosterCharactersById(currentSave.rosterSnapshot);
    const nextCharacters = readRosterCharactersById(patch.rosterSnapshot);
    let treatedCount = 0;
    for (const [characterId, current] of currentCharacters) {
        if (current.injured !== true) continue;
        if (nextCharacters.get(characterId)?.injured !== true) treatedCount += 1;
    }
    if (treatedCount === 0) return 0;
    const facilityUpgrades = normalizeFacilityUpgradeState(currentSave.questState.facilityUpgrades);
    const unitPrice = applyFacilityCostMultiplier(
        INJURY_TREATMENT_PRICE,
        getInjuryTreatmentCostMultiplier(facilityUpgrades),
    );
    return treatedCount * unitPrice;
}

function readRosterCharactersById(rosterSnapshot: Record<string, unknown>): Map<string, Record<string, unknown>> {
    const characters = new Map<string, Record<string, unknown>>();
    if (!Array.isArray(rosterSnapshot.characters)) return characters;
    for (const raw of rosterSnapshot.characters) {
        if (isRecord(raw) && typeof raw.id === 'string') characters.set(raw.id, raw);
    }
    return characters;
}

function getNewRestReservationCost(patch: CharacterSavePatch, currentSave: CharacterSave): number {
    const nextHubLocation = isRecord(patch.hubLocation) ? patch.hubLocation : currentSave.hubLocation;
    const currentMenuId = typeof currentSave.hubLocation.pendingRestMenuId === 'string'
        ? currentSave.hubLocation.pendingRestMenuId
        : null;
    const nextMenuId = typeof nextHubLocation.pendingRestMenuId === 'string'
        ? nextHubLocation.pendingRestMenuId
        : null;
    if (!nextMenuId || nextMenuId === currentMenuId) return 0;
    const townId = typeof nextHubLocation.townId === 'string' ? nextHubLocation.townId : '';
    return getRestFacility(townId)?.menu.find((menu) => menu.id === nextMenuId)?.price ?? 0;
}

function readGold(questState: Record<string, unknown>): number {
    return typeof questState.gold === 'number' && Number.isFinite(questState.gold)
        ? Math.max(0, Math.floor(questState.gold))
        : 500;
}

function countSaveItems(
    inventory: InventorySaveSnapshot,
    stash: InventorySaveSnapshot,
    equipment: Record<string, unknown>,
    rosterSnapshot: Record<string, unknown>,
    primaryCharacterId: string,
): Map<string, number> {
    const counts = new Map<string, number>();
    addInventoryCounts(counts, inventory);
    addInventoryCounts(counts, stash);
    addEquipmentCounts(counts, equipment);
    if (Array.isArray(rosterSnapshot.characters)) {
        for (const raw of rosterSnapshot.characters) {
            if (!isRecord(raw) || raw.id === primaryCharacterId || !isRecord(raw.equipment)) continue;
            addEquipmentCounts(counts, raw.equipment);
        }
    }
    return counts;
}

function addEquipmentCounts(counts: Map<string, number>, equipment: Record<string, unknown>): void {
    for (const raw of Object.values(equipment)) {
        if (!isRecord(raw) || typeof raw.itemId !== 'string') continue;
        addItemCount(counts, raw.itemId, 1);
        if (Array.isArray(raw.sockets)) {
            for (const socketId of raw.sockets) {
                if (typeof socketId === 'string') addItemCount(counts, socketId, 1);
            }
        }
    }
}

function addInventoryCounts(counts: Map<string, number>, snapshot: InventorySaveSnapshot): void {
    for (const item of snapshot.items) {
        addItemCount(counts, item.itemId, item.quantity);
        for (const socketId of item.sockets ?? []) addItemCount(counts, socketId, 1);
    }
}

function addItemCount(counts: Map<string, number>, itemId: string, quantity: unknown): void {
    if (!ITEMS.some((item) => item.id === itemId)) return;
    const amount = typeof quantity === 'number' && Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
    counts.set(itemId, (counts.get(itemId) ?? 0) + amount);
}

function getHubBuyValue(itemId: string): number {
    const item = ITEMS.find((candidate) => candidate.id === itemId);
    return Math.max(1, Math.floor(item?.buyPrice ?? item?.baseValue ?? 10));
}

function getHubSellCredit(itemId: string, currentQuestState: Record<string, unknown>): number {
    const item = ITEMS.find((candidate) => candidate.id === itemId);
    if (!item) return 0;
    const towns = Object.keys(TRADE_GOOD_SELL_MULTIPLIERS[itemId] ?? {});
    const sellPrices = [getSellPrice(item), ...towns.map((townId) => getSellPrice(item, townId))];
    const contractBonus = normalizeMarketContracts(currentQuestState.marketContracts, normalizeMarketCycle(currentQuestState.marketCycle))
        .filter((contract) => contract.itemId === itemId)
        .reduce((max, contract) => Math.max(max, contract.bonusPerUnit), 0);
    return Math.max(0, ...sellPrices) + contractBonus;
}
