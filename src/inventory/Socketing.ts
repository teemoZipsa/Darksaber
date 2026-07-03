import type { CharacterStats } from '../data/Stats';
import { scaleCombatStatPatch } from '../data/combatScale';
import type { ItemDef, ItemSlot, SocketHostKind } from '../data/ItemDB';
import type { GridInventory, PlacedItem } from './GridInventory';

export interface RepairItemResult {
    ok: boolean;
    cost: number;
    remainingGold: number;
    reason?: 'not-damaged' | 'no-gold';
}

export interface UnsocketAllResult {
    ok: boolean;
    cost: number;
    remainingGold: number;
    returned: PlacedItem[];
    reason?: 'no-sockets' | 'not-repaired' | 'no-space' | 'no-gold';
}

type EquipmentCarrier = {
    equipment: Map<ItemSlot, PlacedItem>;
};

const STAT_KEYS: Array<keyof CharacterStats> = [
    'hp',
    'maxHp',
    'mp',
    'maxMp',
    'atk',
    'def',
    'magAtk',
    'magDef',
    'spd',
    'mov',
    'hitRate',
    'critRate',
    'actionLimit',
    'evasion',
    'magHit',
    'magEva',
    'cmdRange',
    'atkMod',
    'defMod',
];

export function getSocketHostKind(item: ItemDef): SocketHostKind | null {
    if (item.slot === 'weapon') return 'weapon';
    if (item.slot === 'shield') return 'shield';
    if (item.slot === 'head' || item.slot === 'body' || item.slot === 'boots') return 'armor';
    return null;
}

export function getPlacedItemStatBonus(placed: PlacedItem): Partial<CharacterStats> {
    if (isBroken(placed)) return {};
    const bonus = normalizeItemStats(placed.item.stats);
    const hostKind = getSocketHostKind(placed.item);
    if (!hostKind) return bonus;

    for (const socket of placed.sockets ?? []) {
        const socketBonus = socket.socketEffects?.[hostKind];
        if (socketBonus) addBonusInto(bonus, scaleCombatStatPatch(socketBonus));
    }
    return bonus;
}

export function getEquipmentStatBonus(equipment: Map<ItemSlot, PlacedItem> | undefined): Partial<CharacterStats> {
    const total: Partial<CharacterStats> = {};
    for (const placed of equipment?.values() ?? []) {
        addBonusInto(total, getPlacedItemStatBonus(placed));
    }
    return total;
}

export function applyStatBonus(base: CharacterStats, bonus: Partial<CharacterStats>): CharacterStats {
    const next = { ...base };
    const nextStats = next as Record<keyof CharacterStats, number>;
    const bonusStats = bonus as Partial<Record<keyof CharacterStats, number>>;
    for (const key of STAT_KEYS) {
        const value = bonusStats[key] ?? 0;
        if (!value) continue;
        nextStats[key] = (nextStats[key] ?? 0) + value;
    }
    next.maxHp = Math.max(1, Math.floor(next.maxHp));
    next.maxMp = Math.max(0, Math.floor(next.maxMp));
    next.hp = Math.min(next.hp, next.maxHp);
    next.mp = Math.min(next.mp, next.maxMp);
    return next;
}

export function applyEquipmentStatBonuses(
    base: CharacterStats,
    equipment: Map<ItemSlot, PlacedItem> | undefined
): CharacterStats {
    return applyStatBonus(base, getEquipmentStatBonus(equipment));
}

export function canUnsocket(placed: PlacedItem): boolean {
    return (placed.sockets?.length ?? 0) > 0 && isFullyRepaired(placed);
}

export function getRepairCost(placed: PlacedItem): number {
    const max = Math.max(0, placed.item.maxDurability);
    if (max <= 1 || placed.durability >= max) return 0;
    const missingRatio = (max - Math.max(0, placed.durability)) / max;
    return Math.max(1, Math.ceil(missingRatio * placed.item.baseValue * 0.25));
}

export function repairItem(placed: PlacedItem, gold: number): RepairItemResult {
    const cost = getRepairCost(placed);
    if (cost <= 0) return { ok: true, cost: 0, remainingGold: gold, reason: 'not-damaged' };
    if (gold < cost) return { ok: false, cost, remainingGold: gold, reason: 'no-gold' };
    placed.durability = placed.item.maxDurability;
    return { ok: true, cost, remainingGold: gold - cost };
}

export function getUnsocketCost(placed: PlacedItem): number {
    const socketCount = placed.sockets?.length ?? 0;
    if (socketCount <= 0) return 0;
    return Math.ceil(placed.item.baseValue * 0.1 + socketCount * 50);
}

export function unsocketAll(
    placed: PlacedItem,
    targetGrid: GridInventory,
    gold = Number.POSITIVE_INFINITY
): UnsocketAllResult {
    const sockets = [...(placed.sockets ?? [])];
    const cost = getUnsocketCost(placed);
    if (sockets.length === 0) return { ok: false, cost, remainingGold: gold, returned: [], reason: 'no-sockets' };
    if (!isFullyRepaired(placed)) return { ok: false, cost, remainingGold: gold, returned: [], reason: 'not-repaired' };
    if (gold < cost) return { ok: false, cost, remainingGold: gold, returned: [], reason: 'no-gold' };

    const placements = findAutoPlacements(targetGrid, sockets);
    if (!placements) return { ok: false, cost, remainingGold: gold, returned: [], reason: 'no-space' };

    const returned: PlacedItem[] = [];
    for (let i = 0; i < sockets.length; i++) {
        const { x, y } = placements[i];
        const next = targetGrid.place(sockets[i], x, y);
        if (next) returned.push(next);
    }
    placed.sockets = [];
    return { ok: true, cost, remainingGold: gold - cost, returned };
}

export function damageEquippedWeapon(carrier: EquipmentCarrier): PlacedItem | null {
    return damagePlacedItem(carrier.equipment.get('weapon') ?? null);
}

export function damageDefensiveEquipment(carrier: EquipmentCarrier): PlacedItem | null {
    for (const slot of ['shield', 'body', 'head', 'boots'] as const) {
        const damaged = damagePlacedItem(carrier.equipment.get(slot) ?? null);
        if (damaged) return damaged;
    }
    return null;
}

export function isBroken(placed: PlacedItem): boolean {
    return placed.item.maxDurability > 1 && placed.durability <= 0;
}

function isFullyRepaired(placed: PlacedItem): boolean {
    return placed.durability >= placed.item.maxDurability;
}

function damagePlacedItem(placed: PlacedItem | null): PlacedItem | null {
    if (!placed || placed.item.maxDurability <= 1 || placed.durability <= 0) return null;
    placed.durability = Math.max(0, placed.durability - 1);
    return placed;
}

function normalizeItemStats(stats: Partial<CharacterStats> | undefined): Partial<CharacterStats> {
    const bonus: Partial<CharacterStats> = {};
    if (!stats) return bonus;
    const bonusStats = bonus as Partial<Record<keyof CharacterStats, number>>;
    const sourceStats = stats as Partial<Record<keyof CharacterStats, number>>;

    for (const key of STAT_KEYS) {
        if (key === 'hp' || key === 'mp') continue;
        const value = sourceStats[key] ?? 0;
        if (value) bonusStats[key] = value;
    }
    if (stats.hp) bonus.maxHp = (bonus.maxHp ?? 0) + stats.hp;
    if (stats.mp) bonus.maxMp = (bonus.maxMp ?? 0) + stats.mp;
    return scaleCombatStatPatch(bonus);
}

function addBonusInto(target: Partial<CharacterStats>, bonus: Partial<CharacterStats> | undefined): void {
    if (!bonus) return;
    const targetStats = target as Partial<Record<keyof CharacterStats, number>>;
    const bonusStats = bonus as Partial<Record<keyof CharacterStats, number>>;
    for (const key of STAT_KEYS) {
        const value = bonusStats[key] ?? 0;
        if (!value) continue;
        targetStats[key] = (targetStats[key] ?? 0) + value;
    }
}

function findAutoPlacements(grid: GridInventory, items: ItemDef[]): Array<{ x: number; y: number }> | null {
    const reserved = new Set<string>();
    const placements: Array<{ x: number; y: number }> = [];
    for (const item of items) {
        const placement = findPlacement(grid, item, reserved);
        if (!placement) return null;
        reserveCells(reserved, item, placement.x, placement.y);
        placements.push(placement);
    }
    return placements;
}

function findPlacement(grid: GridInventory, item: ItemDef, reserved: Set<string>): { x: number; y: number } | null {
    for (let y = 0; y <= grid.height - item.gridH; y++) {
        for (let x = 0; x <= grid.width - item.gridW; x++) {
            if (canPlaceWithReserved(grid, item, x, y, reserved)) return { x, y };
        }
    }
    return null;
}

function canPlaceWithReserved(grid: GridInventory, item: ItemDef, gx: number, gy: number, reserved: Set<string>): boolean {
    for (let dy = 0; dy < item.gridH; dy++) {
        for (let dx = 0; dx < item.gridW; dx++) {
            const x = gx + dx;
            const y = gy + dy;
            if (grid.getAt(x, y) || reserved.has(`${x},${y}`)) return false;
        }
    }
    return true;
}

function reserveCells(reserved: Set<string>, item: ItemDef, gx: number, gy: number): void {
    for (let dy = 0; dy < item.gridH; dy++) {
        for (let dx = 0; dx < item.gridW; dx++) {
            reserved.add(`${gx + dx},${gy + dy}`);
        }
    }
}
