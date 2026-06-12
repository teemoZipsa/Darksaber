/**
 * Stats — character stat type definitions.
 */

import STATS_JSON from './content/stats.json';

export interface CharacterStats {
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spd: number;     // affects turn order / AP charge speed
    mov: number;     // movement range in tiles (Manhattan distance)
    hitRate: number;  // base hit% (0-100)
    critRate: number; // base crit% (0-100)
    
    // Extended Stats for Classic UI
    actionLimit: number; // 행동제한: per-turn AP budget
    evasion: number;     // 회피율
    magHit: number;      // 마법명중
    magEva: number;      // 마법회피
    cmdRange: number;    // 지휘범위
    atkMod: number;      // 공격수정
    defMod: number;      // 방어수정
}

/** Per-level stat growth rates per class archetype */
export interface GrowthRates {
    hp: number;
    mp: number;
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spd: number;
}

interface StatsContent {
    baseStats: CharacterStats;
    classBaseStats: Record<string, Partial<CharacterStats>>;
    growthRates: {
        melee: GrowthRates;
        cavalry: GrowthRates;
        flying: GrowthRates;
        naval: GrowthRates;
        lance: GrowthRates;
        archer: GrowthRates;
        cleric: GrowthRates;
        priest: GrowthRates;
        shrine: GrowthRates;
        mage: GrowthRates;
        cultist: GrowthRates;
        alchemist: GrowthRates;
    };
}

const STATS_CONTENT = STATS_JSON as StatsContent;

/** Default starting stats for a level 1 character */
export function createBaseStats(overrides?: Partial<CharacterStats>): CharacterStats {
    const stats: CharacterStats = {
        ...STATS_CONTENT.baseStats,
        ...overrides
    };

    stats.maxHp = Math.max(1, Math.floor(finiteOr(stats.maxHp, 100)));
    stats.maxMp = Math.max(0, Math.floor(finiteOr(stats.maxMp, 30)));
    stats.hp = clamp(Math.floor(finiteOr(stats.hp, stats.maxHp)), 0, stats.maxHp);
    stats.mp = clamp(Math.floor(finiteOr(stats.mp, stats.maxMp)), 0, stats.maxMp);

    return stats;
}

/** Get specific baseline stats for a class 1st tier */
export function getBaseStatsForClass(classId: string, baseMov: number): Partial<CharacterStats> {
    return {
        ...(STATS_CONTENT.classBaseStats[classId] ?? {}),
        mov: Math.max(0, Math.floor(finiteOr(baseMov, 0))), // Ensure MOV is set from ClassTree
    };
}

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export const GROWTH_MELEE: GrowthRates = STATS_CONTENT.growthRates.melee;
export const GROWTH_CAVALRY: GrowthRates = STATS_CONTENT.growthRates.cavalry;
export const GROWTH_FLYING: GrowthRates = STATS_CONTENT.growthRates.flying;
export const GROWTH_NAVAL: GrowthRates = STATS_CONTENT.growthRates.naval;
export const GROWTH_LANCE: GrowthRates = STATS_CONTENT.growthRates.lance;
export const GROWTH_ARCHER: GrowthRates = STATS_CONTENT.growthRates.archer;
export const GROWTH_CLERIC: GrowthRates = STATS_CONTENT.growthRates.cleric;
export const GROWTH_PRIEST: GrowthRates = STATS_CONTENT.growthRates.priest;
export const GROWTH_MAGE: GrowthRates = STATS_CONTENT.growthRates.mage;
export const GROWTH_CULTIST: GrowthRates = STATS_CONTENT.growthRates.cultist;
export const GROWTH_SHRINE: GrowthRates = STATS_CONTENT.growthRates.shrine;
export const GROWTH_ALCHEMIST: GrowthRates = STATS_CONTENT.growthRates.alchemist;
