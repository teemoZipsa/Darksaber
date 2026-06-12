/**
 * Converts original Dark Saver monster rows into this project's combat scale.
 *
 * The original raw values are not used directly: this game's combat formula is
 * different, so level drives the main curve and raw stats only preserve the
 * original relative ordering within that curve.
 */

import { createBaseStats, type CharacterStats } from '../Stats';
import { getOriginalMonsterRow, type OriginalMonsterRow } from './originalMonsters';

export interface NormalizedMonsterBalance {
    source: 'original' | 'fallback';
    stats: CharacterStats;
    original: OriginalMonsterRow | null;
}

export interface MonsterBalanceReportRow {
    id: string;
    level: number;
    source: 'original' | 'fallback';
    maxHp: number;
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spd: number;
    hitRate: number;
    rawAtk: number | null;
    rawDef: number | null;
}

const RAW_BASELINE = {
    hp: 135,
    mp: 55,
    atk: 106,
    def: 44,
    magAtk: 45,
    magDef: 40,
} as const;

const MONSTER_SOFTENING = {
    hp: 0.85,
    mp: 0.9,
    offense: 0.8,
    defense: 0.85,
    hitRatePenalty: 5,
    crit: 0.8,
    evasion: 0.75,
} as const;

export function getNormalizedMonsterBalance(
    monsterId: string | number | undefined,
    level: number
): NormalizedMonsterBalance {
    const safeLevel = normalizeLevel(level);
    const original = getOriginalMonsterRow(monsterId);
    if (!original) {
        return {
            source: 'fallback',
            stats: createFallbackMonsterStats(safeLevel),
            original: null,
        };
    }

    const c = original.combat;
    const hpRaw = pairedRaw(c.hpLo, c.hpHi);
    const mpRaw = pairedRaw(c.mpLo, c.mpHi);
    const atkRaw = pairedRaw(c.atkLo, c.atkHi);
    const defRaw = pairedRaw(c.defLo, c.defHi);
    const magAtkRaw = pairedRaw(c.magAtkLo, c.magAtkHi);
    const magDefRaw = pairedRaw(c.magDefLo, c.magDefHi);

    const maxHp = softenStat(scaleCurve(78 + safeLevel * 18, hpRaw, RAW_BASELINE.hp, 0.28), MONSTER_SOFTENING.hp);
    const maxMp = softenStat(scaleCurve(16 + safeLevel * 4, mpRaw, RAW_BASELINE.mp, 0.22), MONSTER_SOFTENING.mp);
    const atk = softenCombatStat(scaleCurve(28 + safeLevel * 4.5, atkRaw, RAW_BASELINE.atk, 0.3), MONSTER_SOFTENING.offense);
    const def = softenCombatStat(scaleCurve(15 + safeLevel * 2.7, defRaw, RAW_BASELINE.def, 0.28), MONSTER_SOFTENING.defense);
    const magAtk = softenCombatStat(scaleCurve(18 + safeLevel * 3.8, magAtkRaw, RAW_BASELINE.magAtk, 0.28), MONSTER_SOFTENING.offense);
    const magDef = softenCombatStat(scaleCurve(13 + safeLevel * 2.6, magDefRaw, RAW_BASELINE.magDef, 0.28), MONSTER_SOFTENING.defense);
    const spd = roundToTenth(clamp(11 + Math.min(safeLevel, 20) * 0.3 + ((c.spd ?? 18) - 18) * 0.18, 8, 24));

    return {
        source: 'original',
        original,
        stats: createBaseStats({
            maxHp,
            hp: maxHp,
            maxMp,
            mp: maxMp,
            atk,
            def,
            magAtk,
            magDef,
            spd,
            hitRate: Math.round(clamp(78 + Math.min(safeLevel, 20) * 0.8 + ((c.hitRate ?? 70) - 70) * 0.18 - MONSTER_SOFTENING.hitRatePenalty, 50, 110)),
            critRate: Math.round(clamp((4 + (c.critRate ?? 5) * 0.25) * MONSTER_SOFTENING.crit, 2, 15)),
            evasion: Math.round(clamp((c.evasion ?? 0) * 0.4 * MONSTER_SOFTENING.evasion, 0, 20)),
            magHit: Math.round(clamp(78 + Math.min(safeLevel, 20) * 0.8 + ((c.magHit ?? 70) - 70) * 0.18 - MONSTER_SOFTENING.hitRatePenalty, 50, 110)),
            magEva: Math.round(clamp((c.magEva ?? 0) * 0.4 * MONSTER_SOFTENING.evasion, 0, 20)),
            mov: 2,
        }),
    };
}

export function createFallbackMonsterStats(level: number): CharacterStats {
    const safeLevel = normalizeLevel(level);
    return createBaseStats({
        maxHp: softenStat(80 + safeLevel * 22, MONSTER_SOFTENING.hp),
        hp: softenStat(80 + safeLevel * 22, MONSTER_SOFTENING.hp),
        maxMp: softenStat(25 + safeLevel * 5, MONSTER_SOFTENING.mp),
        mp: softenStat(25 + safeLevel * 5, MONSTER_SOFTENING.mp),
        atk: softenCombatStat(35 + safeLevel * 7, MONSTER_SOFTENING.offense),
        def: softenCombatStat(20 + safeLevel * 5, MONSTER_SOFTENING.defense),
        magAtk: softenCombatStat(25 + safeLevel * 4, MONSTER_SOFTENING.offense),
        magDef: softenCombatStat(18 + safeLevel * 4, MONSTER_SOFTENING.defense),
        spd: 13 + safeLevel * 0.4,
        hitRate: 88 + safeLevel - MONSTER_SOFTENING.hitRatePenalty,
        critRate: 3,
        evasion: 8,
        magHit: 88 + safeLevel - MONSTER_SOFTENING.hitRatePenalty,
        magEva: 4,
        mov: 2,
    });
}

export function createMonsterBalanceReport(
    entries: readonly { id: string; level: number }[]
): MonsterBalanceReportRow[] {
    return entries.map(({ id, level }) => {
        const balance = getNormalizedMonsterBalance(id, level);
        const c = balance.original?.combat;
        return {
            id,
            level: normalizeLevel(level),
            source: balance.source,
            maxHp: balance.stats.maxHp,
            atk: balance.stats.atk,
            def: balance.stats.def,
            magAtk: balance.stats.magAtk,
            magDef: balance.stats.magDef,
            spd: balance.stats.spd,
            hitRate: balance.stats.hitRate,
            rawAtk: c ? pairedRaw(c.atkLo, c.atkHi) : null,
            rawDef: c ? pairedRaw(c.defLo, c.defHi) : null,
        };
    });
}

function scaleCurve(base: number, raw: number | null, baseline: number, influence: number): number {
    if (raw === null || raw <= 0) return Math.max(1, Math.round(base));
    const rawLog = Math.log(raw / baseline);
    const factor = 1 + clamp(rawLog, -0.45, 1.1) * influence;
    return Math.max(1, Math.round(base * factor));
}

function softenStat(value: number, multiplier: number): number {
    return Math.max(1, Math.round(value * multiplier));
}

function softenCombatStat(value: number, multiplier: number): number {
    return Math.max(1, roundToTenth(value * multiplier));
}

function pairedRaw(lo: number | null, hi: number | null): number | null {
    if (lo !== null && hi !== null) return (lo + hi) / 2;
    return lo ?? hi;
}

function normalizeLevel(level: number): number {
    return Math.max(1, Math.min(99, Math.floor(Number.isFinite(level) ? level : 1)));
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
}
