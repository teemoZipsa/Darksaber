import type { StartingClassId } from '../../src/data/characterClasses';
import type {
    RaidLabConserveId,
    RaidLabLoadoutId,
    RaidLabSupplyId,
} from './types';

export const RAID_LAB_STARTING_CLASSES: readonly StartingClassId[] = [
    'infantry',
    'cavalry',
    'cleric',
    'mage',
];
export const RAID_LAB_LOADOUTS: readonly RaidLabLoadoutId[] = ['bare', 'light', 'standard', 'heavy'];
export const RAID_LAB_SUPPLIES: readonly RaidLabSupplyId[] = ['none', 'lab', 'starter', 'rich'];
export const RAID_LAB_CONSERVES: readonly RaidLabConserveId[] = ['spend', 'standard', 'hoard'];

/**
 * The sweep uses a 192-seed cycle. Class/loadout/supply form a mixed-radix
 * 4x4x4 block, while conserve rotates on a coprime 3-seed cycle. Every full
 * cycle therefore covers each class/loadout/supply/conserve tuple exactly once.
 */
export function resolveRaidLabClass(
    mode: StartingClassId | 'sweep',
    seed: number,
): StartingClassId {
    if (mode !== 'sweep') return mode;
    return RAID_LAB_STARTING_CLASSES[floorMod(seed, RAID_LAB_STARTING_CLASSES.length)]!;
}

export function resolveRaidLabLoadout(
    mode: RaidLabLoadoutId | 'sweep',
    seed: number,
): RaidLabLoadoutId {
    if (mode !== 'sweep') return mode;
    const classBlock = Math.floor(seed / RAID_LAB_STARTING_CLASSES.length);
    return RAID_LAB_LOADOUTS[floorMod(classBlock, RAID_LAB_LOADOUTS.length)]!;
}

export function resolveRaidLabSupply(
    mode: RaidLabSupplyId | 'sweep',
    seed: number,
): RaidLabSupplyId {
    if (mode !== 'sweep') return mode;
    const loadoutBlock = RAID_LAB_STARTING_CLASSES.length * RAID_LAB_LOADOUTS.length;
    return RAID_LAB_SUPPLIES[floorMod(Math.floor(seed / loadoutBlock), RAID_LAB_SUPPLIES.length)]!;
}

export function resolveRaidLabConserve(
    mode: RaidLabConserveId | 'sweep',
    seed: number,
): RaidLabConserveId {
    if (mode !== 'sweep') return mode;
    return RAID_LAB_CONSERVES[floorMod(seed, RAID_LAB_CONSERVES.length)]!;
}

function floorMod(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}
