import { ITEMS } from '../src/data/ItemDB';
import { normalizeFacilityUpgradeState } from '../src/data/FacilityUpgradeData';
import {
    normalizeMarketContracts,
    normalizeMarketCycle,
    normalizeMarketState,
} from '../src/data/MarketData';
import { isTownId } from '../src/data/TownFacilityData';
import { normalizeLoadout } from '../src/magic/MagicLoadout';
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
        next.pendingRestMenuId = incoming.pendingRestMenuId.trim() || null;
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
        next.marketContracts = normalizeMarketContracts(
            incoming.marketContracts,
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
            quantity: Math.max(1, finiteFloor(raw.quantity, 1)),
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
    if (!owner || !Array.isArray(incoming.magicLoadout)) return current;
    return {
        ...current,
        magicLoadout: normalizeLoadout(readStringArray(incoming.magicLoadout), owner),
    };
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
