import {
    createStatus,
    getEffectiveStats,
    type StatusEffect,
} from '../src/combat/StatusEffects';
import { getItemDef, type ItemSlot } from '../src/data/ItemDB';
import { getRestFacility } from '../src/data/RestFacilityData';
import type { CharacterStats } from '../src/data/Stats';
import { createBaseStats } from '../src/data/Stats';
import { getOriginalStats } from '../src/data/original/originalProgression';
import { getPlacedItemsWeight } from '../src/inventory/CarryWeight';
import type { PlacedItem } from '../src/inventory/GridInventory';
import { applyStatBonus, getEquipmentStatBonus } from '../src/inventory/Socketing';
import type { ActorSnapshot } from '../src/net/WorldProtocol';
import type { CharacterSave } from '../src/shared/CharacterSave';
import type { AuthCharacter } from './AuthStore';
import { cloneCharacterSave } from './WorldSessionSaveState';

const EQUIPMENT_SLOTS: ItemSlot[] = ['weapon', 'shield', 'head', 'body', 'boots', 'accessory', 'accessory2'];

interface SavedRosterEntry {
    id: string;
    name: string;
    classKey: string;
    tier: number;
    level: number;
    baseStats: Partial<CharacterStats>;
    magicLoadout: string[];
    skillUpgradeLevels: Record<string, number>;
    equipment: Record<string, unknown> | null;
}

export interface WorldJoinSaveState {
    partyComposition: ActorSnapshot[];
    carriedWeight: number;
    equipmentStatBonuses: Record<string, Partial<CharacterStats>>;
    saveSnapshot: CharacterSave;
    consumedPendingRestMenuId?: string;
}

export function createWorldJoinSaveState(character: AuthCharacter, save: CharacterSave): WorldJoinSaveState {
    const rosterEntries = readRosterEntries(save);
    const selectedEntry = rosterEntries.get(character.id) ?? createSelectedCharacterFallback(character);
    const activeIds = uniqueStrings(readStringArray(save.partySnapshot.activeCharacterIds))
        .filter((id) => id !== character.id);
    const entries = [
        selectedEntry,
        ...activeIds.flatMap((id) => rosterEntries.get(id) ?? []),
    ].slice(0, 3);
    const restMenu = readPendingRestMenu(save);
    const restStatuses = restMenu ? createRestStatuses(restMenu) : [];
    const equipmentStatBonuses: Record<string, Partial<CharacterStats>> = {};
    const equippedItems: PlacedItem[] = [];

    const partyComposition = entries.map((entry): ActorSnapshot => {
        const equipmentRecord = entry.id === character.id
            ? save.equipment
            : entry.equipment ?? {};
        const equipment = readEquipment(equipmentRecord);
        const equipmentStatBonus = getEquipmentStatBonus(equipment);
        equipmentStatBonuses[entry.id] = equipmentStatBonus;
        equippedItems.push(...equipment.values());

        const statuses = restStatuses.map((status) => ({ ...status }));
        const stats = createRaidStartStats(entry, equipmentStatBonus, statuses);
        return {
            id: entry.id,
            localActorId: entry.id,
            name: entry.name,
            classLineId: entry.classKey,
            currentTier: sanitizePositiveInt(entry.tier, 1),
            level: sanitizePositiveInt(entry.level, 1),
            tile: { x: 0, y: 0 },
            stats,
            statuses,
            actionGauge: 0,
            remainingAp: 0,
            majorActionUsed: false,
            facing: 'down',
            isDead: false,
            magicLoadout: [...entry.magicLoadout],
            skillUpgradeLevels: { ...entry.skillUpgradeLevels },
        };
    });

    const backpackItems = save.inventory.items.flatMap((entry) => {
        const placed = readPlacedItem(entry, undefined);
        return placed ? [placed] : [];
    });
    const saveSnapshot = cloneCharacterSave(save)!;
    if (restMenu) saveSnapshot.hubLocation.pendingRestMenuId = null;

    return {
        partyComposition,
        carriedWeight: getPlacedItemsWeight([...backpackItems, ...equippedItems]),
        equipmentStatBonuses,
        saveSnapshot,
        ...(restMenu ? { consumedPendingRestMenuId: restMenu.id } : {}),
    };
}

export function createPartyCompositionFromSave(character: AuthCharacter, save: CharacterSave): ActorSnapshot[] {
    return createWorldJoinSaveState(character, save).partyComposition;
}

function createSelectedCharacterFallback(character: AuthCharacter): SavedRosterEntry {
    return {
        id: character.id,
        name: character.name,
        classKey: character.classKey,
        tier: character.tier,
        level: character.level,
        baseStats: character.baseStats,
        magicLoadout: [],
        skillUpgradeLevels: {},
        equipment: null,
    };
}

function createRaidStartStats(
    entry: SavedRosterEntry,
    equipmentStatBonus: Partial<CharacterStats>,
    statuses: StatusEffect[],
): CharacterStats {
    const stats = createBaseStats(entry.baseStats);
    const originalStats = getOriginalStats(entry.classKey, entry.tier, entry.level);
    if (originalStats) Object.assign(stats, originalStats);
    const equipmentStats = applyStatBonus(stats, equipmentStatBonus);
    const effective = getEffectiveStats(equipmentStats, statuses);
    stats.hp = effective.maxHp;
    stats.mp = effective.maxMp;
    return stats;
}

function readRosterEntries(save: CharacterSave): Map<string, SavedRosterEntry> {
    const rawCharacters = Array.isArray(save.rosterSnapshot.characters) ? save.rosterSnapshot.characters : [];
    const entries = new Map<string, SavedRosterEntry>();
    for (const raw of rawCharacters) {
        if (!isRecord(raw)) continue;
        const id = typeof raw.id === 'string' ? raw.id : null;
        const name = typeof raw.name === 'string' ? raw.name : null;
        const classKey = typeof raw.classKey === 'string'
            ? raw.classKey
            : typeof raw.classLineId === 'string'
                ? raw.classLineId
                : null;
        if (!id || !name || !classKey) continue;
        entries.set(id, {
            id,
            name,
            classKey,
            tier: sanitizePositiveInt(raw.tier ?? raw.currentTier, 1),
            level: sanitizePositiveInt(raw.level, 1),
            baseStats: isRecord(raw.baseStats) ? raw.baseStats as Partial<CharacterStats> : {},
            magicLoadout: readStringArray(raw.magicLoadout),
            skillUpgradeLevels: readNumberRecord(raw.skillUpgradeLevels),
            equipment: isRecord(raw.equipment) ? raw.equipment : null,
        });
    }
    return entries;
}

function readEquipment(value: Record<string, unknown>): Map<ItemSlot, PlacedItem> {
    const equipment = new Map<ItemSlot, PlacedItem>();
    for (const slot of EQUIPMENT_SLOTS) {
        const placed = readPlacedItem(value[slot], slot);
        if (placed) equipment.set(slot, placed);
    }
    return equipment;
}

function readPlacedItem(value: unknown, expectedSlot: ItemSlot | undefined): PlacedItem | null {
    if (!isRecord(value) || typeof value.itemId !== 'string') return null;
    const item = getItemDef(value.itemId);
    if (!item || (expectedSlot !== undefined && item.slot !== expectedSlot)) return null;
    const sockets = readStringArray(value.sockets)
        .flatMap((socketId) => getItemDef(socketId) ?? [])
        .filter((socket) => socket.slot === 'rune' || socket.slot === 'gem')
        .filter((socket) => item.socketTypes?.includes(socket.slot as 'rune' | 'gem') ?? false)
        .slice(0, item.maxSockets ?? 0);
    return {
        item,
        gridX: sanitizeNonNegativeInt(value.gridX, 0),
        gridY: sanitizeNonNegativeInt(value.gridY, 0),
        quantity: expectedSlot === undefined
            ? Math.min(item.maxStack, sanitizePositiveInt(value.quantity, 1))
            : 1,
        durability: Math.min(item.maxDurability, sanitizeNonNegativeInt(value.durability, item.maxDurability)),
        sockets,
    };
}

function readPendingRestMenu(save: CharacterSave) {
    const pendingId = typeof save.hubLocation.pendingRestMenuId === 'string'
        ? save.hubLocation.pendingRestMenuId
        : null;
    if (!pendingId) return null;
    const townId = typeof save.hubLocation.townId === 'string' ? save.hubLocation.townId : '';
    return getRestFacility(townId)?.menu.find((menu) => menu.id === pendingId) ?? null;
}

function createRestStatuses(menu: NonNullable<ReturnType<typeof readPendingRestMenu>>): StatusEffect[] {
    return menu.buffs.map((buff) => createStatus(buff.kind, {
        icon: buff.icon,
        magnitude: buff.magnitude,
        activation: buff.activation,
        durationSeconds: buff.durationSeconds,
        remainingSeconds: buff.activation === 'on_raid_start' ? buff.durationSeconds : undefined,
        sourceType: 'rest',
        sourceRestMenuId: menu.id,
    }));
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readNumberRecord(value: unknown): Record<string, number> {
    if (!isRecord(value)) return {};
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
    }
    return result;
}

function uniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : fallback;
}

function sanitizeNonNegativeInt(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
