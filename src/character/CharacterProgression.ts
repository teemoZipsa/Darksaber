/**
 * Pure character EXP progression shared by the client model and server saves.
 *
 * The helpers in this module do not mutate their input. Presentation concerns
 * such as localized tier names and portrait loading stay in Character.
 */

import type { CharacterStats, GrowthRates } from '../data/Stats';
import { getClassLine, type ClassLine } from '../data/ClassTree';
import {
    getExpToNext as getOriginalExpToNext,
    getLevelCap as getOriginalLevelCap,
    getOriginalStats,
} from '../data/original/originalProgression';

export interface CharacterProgressionState {
    classLineId: string;
    currentTier: number;
    level: number;
    exp: number;
    expToNext: number;
    stats: CharacterStats;
    hasEmblem: boolean;
}

export interface CharacterProgressionResult {
    state: CharacterProgressionState;
    leveledUp: boolean;
    promoted: boolean;
    /** The last tier reached when one EXP grant crosses multiple tiers. */
    promotedTier?: number;
    emblemUnlocked?: boolean;
}

/** Max level within a tier, including the legacy fallback for original-data gaps. */
export function getCharacterLevelCap(classLineId: string, tier: number): number {
    return getOriginalLevelCap(classLineId, tier);
}

/**
 * EXP needed for the next level/promotion. Original progression takes priority;
 * classes or tiers without original data use Character's legacy formula.
 */
export function getCharacterExpToNext(classLineId: string, tier: number, level: number): number {
    const original = getOriginalExpToNext(classLineId, tier, level);
    if (original !== undefined) return original;

    const classLine = getClassLine(classLineId);
    const tierMult = Math.pow(1.15, getTierIndex(classLine, tier));
    const levelMult = Math.pow(1.08, level - 1);
    return Math.floor(50 * tierMult * levelMult);
}

/**
 * Add EXP and return a new progression state. The input state and its stats are
 * left untouched so callers can safely apply or persist the result atomically.
 */
export function applyCharacterExp(
    input: Readonly<CharacterProgressionState>,
    amount: number,
): CharacterProgressionResult {
    const classLine = getClassLine(input.classLineId);
    const state: CharacterProgressionState = {
        ...input,
        exp: input.exp + amount,
        stats: { ...input.stats },
    };
    const result: CharacterProgressionResult = {
        state,
        leveledUp: false,
        promoted: false,
    };

    while (state.exp >= state.expToNext) {
        if (state.level >= getCharacterLevelCap(state.classLineId, state.currentTier)) {
            if (hasNextTier(classLine, state.currentTier)) {
                state.exp -= state.expToNext;
                promote(state, classLine!);
                result.promoted = true;
                result.leveledUp = true;
                result.promotedTier = state.currentTier;
                if (tryUnlockFusionEmblem(state, classLine)) result.emblemUnlocked = true;
            } else {
                state.exp = state.expToNext;
                if (tryUnlockFusionEmblem(state, classLine)) result.emblemUnlocked = true;
                break;
            }
        } else {
            state.exp -= state.expToNext;
            state.level++;
            state.stats = applyLevelUpGrowth(state, classLine);
            state.expToNext = getCharacterExpToNext(state.classLineId, state.currentTier, state.level);
            result.leveledUp = true;
            if (tryUnlockFusionEmblem(state, classLine)) result.emblemUnlocked = true;
        }
    }

    return result;
}

function getTierIndex(classLine: ClassLine | undefined, tier: number): number {
    if (!classLine) return 0;
    const index = classLine.tiers.findIndex((entry) => entry.tier === tier);
    return index >= 0 ? index : 0;
}

function hasNextTier(classLine: ClassLine | undefined, tier: number): boolean {
    if (!classLine) return false;
    return getTierIndex(classLine, tier) < classLine.tiers.length - 1;
}

function promote(state: CharacterProgressionState, classLine: ClassLine): void {
    const nextIndex = getTierIndex(classLine, state.currentTier) + 1;
    const nextTier = classLine.tiers[nextIndex];
    if (!nextTier) return;

    state.currentTier = nextTier.tier;
    state.level = 1;
    state.expToNext = getCharacterExpToNext(state.classLineId, state.currentTier, state.level);
    state.stats = getStatsAtOriginalLevel(state) ?? applyFallbackGrowth(state.stats, classLine.growth, 2);
}

function applyLevelUpGrowth(
    state: CharacterProgressionState,
    classLine: ClassLine | undefined,
): CharacterStats {
    const originalStats = getStatsAtOriginalLevel(state);
    if (originalStats) return originalStats;
    if (!classLine) return state.stats;
    return applyFallbackGrowth(state.stats, classLine.growth, 1);
}

function getStatsAtOriginalLevel(state: CharacterProgressionState): CharacterStats | undefined {
    const original = getOriginalStats(state.classLineId, state.currentTier, state.level);
    if (!original) return undefined;
    const stats = { ...state.stats, ...original };
    stats.hp = stats.maxHp;
    stats.mp = stats.maxMp;
    return stats;
}

function applyFallbackGrowth(
    current: CharacterStats,
    growth: GrowthRates,
    multiplier: 1 | 2,
): CharacterStats {
    const stats = { ...current };
    stats.maxHp += Math.floor(growth.hp * multiplier);
    stats.hp = stats.maxHp;
    stats.maxMp += Math.floor(growth.mp * multiplier);
    stats.mp = stats.maxMp;
    stats.atk += Math.floor(growth.atk * multiplier * 10) / 10;
    stats.def += Math.floor(growth.def * multiplier * 10) / 10;
    stats.magAtk += Math.floor(growth.magAtk * multiplier * 10) / 10;
    stats.magDef += Math.floor(growth.magDef * multiplier * 10) / 10;
    stats.spd += Math.floor(growth.spd * multiplier * 10) / 10;
    return stats;
}

function tryUnlockFusionEmblem(
    state: CharacterProgressionState,
    classLine: ClassLine | undefined,
): boolean {
    if (
        state.hasEmblem
        || hasNextTier(classLine, state.currentTier)
        || state.currentTier < 7
        || state.level < getCharacterLevelCap(state.classLineId, state.currentTier)
    ) {
        return false;
    }
    state.hasEmblem = true;
    return true;
}
