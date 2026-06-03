/**
 * Mapping between this game's class lines/tiers and the original Dark Saver
 * class ids (from `levelabl.json` / `ability.json`, decoded by
 * scripts/decode-original-atr.mjs).
 *
 * The original promotion chains line up 1:1 with our class lines, including the
 * tier-1-start (7-stage) vs tier-2-start (6-stage) split:
 *   7-stage / start T1:  infantry cavalry cleric mage
 *   6-stage / start T2:  naval lancer archer flying priest cultist
 *
 * Intentional additions with NO original counterpart (design these by reference
 * to the nearest original class): alchemist (T1 line), shrine (T2 line), and the
 * 4th fusion branch master_healer. Original masters only have 2 stages each.
 */

import levelablJson from './levelabl.json';
import abilityJson from './ability.json';

export interface OriginalLevelRow {
    classId: number;
    level: number;
    growth: { hp: number; mp: number; atk: number; def: number; magAtk: number; magDef: number; hit: number; eva: number };
    magicLvUp: number;
    abilityPoints: number;
    promoteTo: number;
    goldGain: number;
    expGain: number;
    expRequired: number;
    learnSkill: number;
    usableSkills: number[];
}

export interface OriginalAbilityRow {
    classId: number;
    name: string;
    label: string;
    stats: number[];
}

const LEVELABL = levelablJson as OriginalLevelRow[];
const ABILITY = abilityJson as OriginalAbilityRow[];

/** classLineId → (our tier number → original class id). */
export const ORIGINAL_CLASS_TIER_IDS: Record<string, Record<number, number>> = {
    infantry: { 1: 100, 2: 105, 3: 115, 4: 125, 5: 135, 6: 145, 7: 155 },
    cavalry: { 1: 101, 2: 108, 3: 118, 4: 128, 5: 138, 6: 148, 7: 158 },
    cleric: { 1: 102, 2: 110, 3: 120, 4: 130, 5: 140, 6: 150, 7: 160 },
    mage: { 1: 103, 2: 112, 3: 122, 4: 132, 5: 142, 6: 152, 7: 162 },
    naval: { 2: 104, 3: 114, 4: 124, 5: 134, 6: 144, 7: 154 },
    lancer: { 2: 106, 3: 116, 4: 126, 5: 136, 6: 146, 7: 156 },
    archer: { 2: 107, 3: 117, 4: 127, 5: 137, 6: 147, 7: 157 },
    flying: { 2: 109, 3: 119, 4: 129, 5: 139, 6: 149, 7: 159 },
    priest: { 2: 111, 3: 121, 4: 131, 5: 141, 6: 151, 7: 161 },
    cultist: { 2: 113, 3: 123, 4: 133, 5: 143, 6: 153, 7: 163 },
    // Fusion masters — original only defines 2 stages (our tiers 8–9); tier 10 + master_healer are design-by-reference.
    master_battle: { 8: 164, 9: 167 },
    master_tactics: { 8: 165, 9: 168 },
    master_magic: { 8: 166, 9: 169 },
};

/** Class lines with no original data — derive their progression by analogy. */
export const CLASSES_WITHOUT_ORIGINAL = ['alchemist', 'shrine', 'master_healer'] as const;

/** The original class id backing a given class line + tier, if any. */
export function getOriginalClassId(classLineId: string, tier: number): number | undefined {
    return ORIGINAL_CLASS_TIER_IDS[classLineId]?.[tier];
}

/** Original per-level rows (sorted) for a class line + tier, or [] if none. */
export function getOriginalLevelRows(classLineId: string, tier: number): OriginalLevelRow[] {
    const classId = getOriginalClassId(classLineId, tier);
    if (classId === undefined) return [];
    return LEVELABL.filter((r) => r.classId === classId).sort((a, b) => a.level - b.level);
}

/** Original level cap for a class line + tier (e.g. infantry T1 = 5), or undefined. */
export function getOriginalLevelCap(classLineId: string, tier: number): number | undefined {
    const rows = getOriginalLevelRows(classLineId, tier);
    return rows.length ? rows[rows.length - 1].level : undefined;
}

/** Original base-stat row (from ability.json) for a class line + tier, or undefined. */
export function getOriginalAbility(classLineId: string, tier: number): OriginalAbilityRow | undefined {
    const classId = getOriginalClassId(classLineId, tier);
    if (classId === undefined) return undefined;
    return ABILITY.find((r) => r.classId === classId);
}
