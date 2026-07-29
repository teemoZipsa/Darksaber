import type { CharacterStats } from '../data/Stats';

export const ELITE_AFFIX_IDS = [
    'berserker',
    'vampiric',
    'ironclad',
    'executioner',
    'swift',
] as const;

export type EliteAffixId = typeof ELITE_AFFIX_IDS[number];

const ELITE_AFFIX_SET = new Set<string>(ELITE_AFFIX_IDS);

export function normalizeEliteAffixes(value: unknown): EliteAffixId[] {
    if (!Array.isArray(value)) return [];
    const normalized: EliteAffixId[] = [];
    for (const entry of value) {
        if (typeof entry !== 'string' || !ELITE_AFFIX_SET.has(entry)) continue;
        const affix = entry as EliteAffixId;
        if (normalized.includes(affix)) continue;
        if (
            (affix === 'berserker' && normalized.includes('swift'))
            || (affix === 'swift' && normalized.includes('berserker'))
        ) {
            continue;
        }
        normalized.push(affix);
        if (normalized.length === 2) break;
    }
    return normalized;
}

export function rollEliteAffixes(seed: string, count: number = 2): EliteAffixId[] {
    const candidates = deterministicShuffle(ELITE_AFFIX_IDS, seed);
    const result: EliteAffixId[] = [];
    for (const candidate of candidates) {
        if (
            (candidate === 'berserker' && result.includes('swift'))
            || (candidate === 'swift' && result.includes('berserker'))
        ) {
            continue;
        }
        result.push(candidate);
        if (result.length >= Math.max(0, Math.min(2, Math.floor(count)))) break;
    }
    return result;
}

export function applyBountyEliteBaseline(stats: CharacterStats): CharacterStats {
    const maxHp = Math.max(1, Math.round(stats.maxHp * 1.35));
    return {
        ...stats,
        maxHp,
        hp: maxHp,
    };
}

export function applyEliteAffixStats(
    stats: CharacterStats,
    value: unknown,
): CharacterStats {
    const affixes = normalizeEliteAffixes(value);
    const effective = { ...stats };
    if (affixes.includes('ironclad')) {
        effective.def = Math.round(effective.def * 1.3);
        effective.magDef = Math.round(effective.magDef * 1.3);
    }
    if (affixes.includes('swift')) {
        effective.spd *= 1.2;
        effective.mov += 1;
    }
    if (affixes.includes('berserker') && effective.hp <= effective.maxHp * 0.5) {
        effective.atk = Math.round(effective.atk * 1.3);
        effective.magAtk = Math.round(effective.magAtk * 1.3);
        effective.spd *= 1.2;
    }
    return effective;
}

export function applyExecutionerDamage(
    damage: number,
    affixes: unknown,
    targetHp: number,
    targetMaxHp: number,
): number {
    const normalizedDamage = Number.isFinite(damage) ? Math.max(0, Math.floor(damage)) : 0;
    if (!normalizeEliteAffixes(affixes).includes('executioner')) return normalizedDamage;
    const ratio = targetMaxHp > 0 ? targetHp / targetMaxHp : 0;
    return ratio <= 0.35 ? Math.max(0, Math.floor(normalizedDamage * 1.35)) : normalizedDamage;
}

export function getVampiricHealing(
    dealtDamage: number,
    affixes: unknown,
    currentHp: number,
    maxHp: number,
): number {
    if (!normalizeEliteAffixes(affixes).includes('vampiric')) return 0;
    const missingHp = Math.max(0, maxHp - currentHp);
    const healing = Math.max(0, Math.floor(Math.max(0, dealtDamage) * 0.25));
    return Math.min(missingHp, healing);
}

function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
    const result = [...values];
    let state = hashString(seed) || 0x9e3779b9;
    for (let i = result.length - 1; i > 0; i--) {
        state = nextRandomState(state);
        const j = state % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function nextRandomState(state: number): number {
    let next = state >>> 0;
    next ^= next << 13;
    next ^= next >>> 17;
    next ^= next << 5;
    return next >>> 0;
}
