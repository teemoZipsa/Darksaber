/**
 * Global combat stat scale — original Dark Saver numbers are imported for
 * relative ordering, then compressed so early-game values stay readable
 * (e.g. infantry L1 HP ~70 instead of ~200).
 */

import type { CharacterStats } from './Stats';

/** Multiply original-era HP/ATK/DEF/MP values by this factor at runtime. */
export const COMBAT_STAT_SCALE = 0.35;

const SCALED_STAT_KEYS = [
    'hp',
    'maxHp',
    'mp',
    'maxMp',
    'atk',
    'def',
    'magAtk',
    'magDef',
] as const satisfies ReadonlyArray<keyof CharacterStats>;

export function scaleCombatValue(value: number): number {
    if (!Number.isFinite(value)) return value;
    const scaled = value * COMBAT_STAT_SCALE;
    if (value <= 0) return Math.max(0, Math.round(scaled));
    return Math.max(1, Math.round(scaled));
}

export function scaleCombatStatPatch<T extends Partial<CharacterStats>>(stats: T): T {
    const out = { ...stats };
    for (const key of SCALED_STAT_KEYS) {
        const value = out[key];
        if (value === undefined) continue;
        out[key] = scaleCombatValue(value) as T[typeof key];
    }
    return out;
}

export function scaleCombatStats(stats: CharacterStats): CharacterStats {
    return scaleCombatStatPatch(stats);
}
