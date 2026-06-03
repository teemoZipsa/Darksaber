/**
 * Original-game level progression adapted to this game's classes.
 *
 * Source of truth: levelabl.json (via classMap). We adopt the original per-tier
 * level caps (5/10/15/20/25/30/35) and explicit exp thresholds, but players gain
 * 2x exp vs the original — implemented by halving the required exp.
 *
 * Classes/tiers with no original counterpart (alchemist, shrine, master_healer,
 * master tier 10) return undefined here so callers fall back to the formula.
 */

import type { CharacterStats } from '../Stats';
import { getOriginalAbility, getOriginalLevelCap, getOriginalLevelRows } from './classMap';

/** Default level cap for tiers with no original data. */
export const FALLBACK_LEVEL_CAP = 10;
/** Players gain this many times the original exp (→ requirements divided by it). */
export const EXP_GAIN_MULTIPLIER = 2;

/** Fusion masters keep this game's own endgame leveling, not the original's odd 70/100 caps. */
function usesOriginalProgression(classLineId: string): boolean {
    return !classLineId.startsWith('master');
}

/** Max level within a tier (original level design; falls back to 10). */
export function getLevelCap(classLineId: string, tier: number): number {
    if (!usesOriginalProgression(classLineId)) return FALLBACK_LEVEL_CAP;
    return getOriginalLevelCap(classLineId, tier) ?? FALLBACK_LEVEL_CAP;
}

/**
 * Exp needed to advance from `level` within `tier`, with the 2x gain rate
 * applied (original requirement halved). Returns undefined when there is no
 * original data for this class/tier/level (caller uses its own formula).
 */
export function getExpToNext(classLineId: string, tier: number, level: number): number | undefined {
    if (!usesOriginalProgression(classLineId)) return undefined;
    const rows = getOriginalLevelRows(classLineId, tier);
    if (rows.length === 0) return undefined;
    const row = rows.find((r) => r.level === level);
    if (!row || row.expRequired <= 0) return undefined;
    return Math.max(1, Math.ceil(row.expRequired / EXP_GAIN_MULTIPLIER));
}

// ability.json `stats` column indices (index 0 = 직그림 sprite dup).
// Paired stats are 수(start)/한(cap); singles are flat per tier.
const COL = {
    hpLo: 1, hpHi: 2, mpLo: 3, mpHi: 4, atkLo: 5, atkHi: 6, defLo: 7, defHi: 8,
    magAtkLo: 9, magAtkHi: 10, magDefLo: 11, magDefHi: 12,
    spd: 13, hit: 15, eva: 16, crit: 17, magHit: 18, magEva: 19,
} as const;

/**
 * Original base combat/resource stats for a class line at (tier, level).
 * Paired stats interpolate 수→한 across the tier's levels; HP/MP come out full.
 * Movement (mov) and command range stay on this game's tactical design, so they
 * are intentionally NOT included. Returns undefined when there is no original data.
 */
export function getOriginalStats(
    classLineId: string,
    tier: number,
    level: number
): Partial<CharacterStats> | undefined {
    if (!usesOriginalProgression(classLineId)) return undefined;
    const ability = getOriginalAbility(classLineId, tier);
    if (!ability) return undefined;
    const cap = getLevelCap(classLineId, tier);
    const frac = cap > 1 ? Math.min(1, Math.max(0, (level - 1) / (cap - 1))) : 0;
    const s = ability.stats;
    const lerp = (lo: number, hi: number) => Math.round(lo + (hi - lo) * frac);
    const hp = lerp(s[COL.hpLo], s[COL.hpHi]);
    const mp = lerp(s[COL.mpLo], s[COL.mpHi]);
    return {
        hp, maxHp: hp,
        mp, maxMp: mp,
        atk: lerp(s[COL.atkLo], s[COL.atkHi]),
        def: lerp(s[COL.defLo], s[COL.defHi]),
        magAtk: lerp(s[COL.magAtkLo], s[COL.magAtkHi]),
        magDef: lerp(s[COL.magDefLo], s[COL.magDefHi]),
        spd: s[COL.spd],
        hitRate: s[COL.hit],
        evasion: s[COL.eva],
        critRate: s[COL.crit],
        magHit: s[COL.magHit],
        magEva: s[COL.magEva],
    };
}
