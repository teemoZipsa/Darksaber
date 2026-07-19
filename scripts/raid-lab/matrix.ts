import type { StartingClassId } from '../../src/data/characterClasses';
import type {
    RaidLabConserveId,
    RaidLabLoadoutId,
    RaidLabMultiReadyId,
    RaidLabPartySize,
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
export const RAID_LAB_PARTY_SIZES: readonly RaidLabPartySize[] = [1, 2, 3];
export const RAID_LAB_MULTI_READY: readonly RaidLabMultiReadyId[] = [
    'leader-first',
    'lowest-hp',
    'round-robin',
];

/**
 * Holdout seeds are reserved for out-of-sample checks and must not be used
 * when designing the pairwise covering schedule (covering uses seedStart < this).
 */
export const RAID_LAB_HOLDOUT_SEED_START = 30_000;

/**
 * Phase 4a class/loadout/supply form a mixed-radix 4×4×4 block (64), while
 * conserve rotates on a coprime 3-seed cycle (full 192-seed class×loadout×
 * supply×conserve coverage).
 *
 * Phase 4b partySize / multiReady use strides that are *not* `seed % 3`, so they
 * do not lock to conserve's 3-cycle. Within the first 36 seeds the sweep hits
 * every partySize×class, partySize×conserve, and partySize×multiReady pair.
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

export function resolveRaidLabPartySize(
    mode: RaidLabPartySize | 'sweep',
    seed: number,
): RaidLabPartySize {
    if (mode !== 'sweep') return mode;
    // Advance with the class block (÷4) so partySize is independent of conserve's seed%3.
    // Seeds 0..11 cover every partySize×class and partySize×conserve pair.
    return RAID_LAB_PARTY_SIZES[
        floorMod(Math.floor(seed / RAID_LAB_STARTING_CLASSES.length), RAID_LAB_PARTY_SIZES.length)
    ]!;
}

export function resolveRaidLabMultiReady(
    mode: RaidLabMultiReadyId | 'sweep',
    seed: number,
): RaidLabMultiReadyId {
    if (mode !== 'sweep') return mode;
    // ÷3 stride: with partySize's ÷4 stride, seeds 0..35 cover all 9 partySize×multiReady pairs.
    return RAID_LAB_MULTI_READY[
        floorMod(Math.floor(seed / RAID_LAB_MULTI_READY.length), RAID_LAB_MULTI_READY.length)
    ]!;
}

/**
 * Companion classes for slots 1..(partySize-1). Sweep rotates so every
 * partySize×companionClass pair appears within a short window.
 */
export function resolveRaidLabCompanionClasses(
    partySize: RaidLabPartySize,
    seed: number,
    explicit?: readonly StartingClassId[],
): StartingClassId[] {
    const companions: StartingClassId[] = [];
    for (let slot = 1; slot < partySize; slot++) {
        companions.push(
            explicit?.[slot - 1]
            ?? RAID_LAB_STARTING_CLASSES[floorMod(seed + slot, RAID_LAB_STARTING_CLASSES.length)]!,
        );
    }
    return companions;
}

/** Pair keys used for cohort coverage tallies (not a full factorial). */
export function raidLabPairwiseKeys(input: {
    partySize: RaidLabPartySize;
    classKey: StartingClassId;
    loadout: RaidLabLoadoutId;
    supply: RaidLabSupplyId;
    conserve: RaidLabConserveId;
    multiReady: RaidLabMultiReadyId;
    companionClasses: readonly StartingClassId[];
    routeMode: string;
}): string[] {
    const keys = [
        `partySize×class:${input.partySize}×${input.classKey}`,
        `partySize×loadout:${input.partySize}×${input.loadout}`,
        `partySize×supply:${input.partySize}×${input.supply}`,
        `partySize×conserve:${input.partySize}×${input.conserve}`,
        `partySize×multiReady:${input.partySize}×${input.multiReady}`,
        `partySize×route:${input.partySize}×${input.routeMode}`,
        `class×loadout:${input.classKey}×${input.loadout}`,
        `multiReady×loadout:${input.multiReady}×${input.loadout}`,
    ];
    for (const companion of input.companionClasses) {
        keys.push(`partySize×companion:${input.partySize}×${companion}`);
        keys.push(`leader×companion:${input.classKey}×${companion}`);
    }
    return keys;
}

function floorMod(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}
