/**
 * Original Dark Saver monster ledger.
 *
 * This is intentionally separate from MonsterCatalog: ability.json contains
 * every original monster stat row, while MonsterCatalog only contains monsters
 * that this project can render and may explicitly opt into spawning.
 */

import abilityJson from './ability.json';

interface OriginalAbilityJsonRow {
    classId: number;
    name: string;
    label: string;
    stats: number[];
}

export interface OriginalMonsterCombatStats {
    hpLo: number | null;
    hpHi: number | null;
    mpLo: number | null;
    mpHi: number | null;
    atkLo: number | null;
    atkHi: number | null;
    defLo: number | null;
    defHi: number | null;
    magAtkLo: number | null;
    magAtkHi: number | null;
    magDefLo: number | null;
    magDefHi: number | null;
    spd: number | null;
    hitRate: number | null;
    evasion: number | null;
    critRate: number | null;
    magHit: number | null;
    magEva: number | null;
}

export interface OriginalMonsterRow {
    id: number;
    spriteId: string;
    name: string;
    label: string;
    stats: readonly number[];
    combat: OriginalMonsterCombatStats;
}

const COL = {
    hpLo: 1, hpHi: 2, mpLo: 3, mpHi: 4, atkLo: 5, atkHi: 6, defLo: 7, defHi: 8,
    magAtkLo: 9, magAtkHi: 10, magDefLo: 11, magDefHi: 12,
    spd: 13, hit: 15, eva: 16, crit: 17, magHit: 18, magEva: 19,
} as const;

const rows = (abilityJson as OriginalAbilityJsonRow[])
    .filter((row) => row.classId >= 200)
    .map(toOriginalMonsterRow);

export const ORIGINAL_MONSTER_ROWS: readonly OriginalMonsterRow[] = rows;
export const ORIGINAL_MONSTER_IDS: readonly number[] = rows.map((row) => row.id);
export const ORIGINAL_MONSTER_COUNT = rows.length;

const ORIGINAL_MONSTER_BY_ID = new Map<number, OriginalMonsterRow>(rows.map((row) => [row.id, row]));

export function isOriginalMonsterId(value: string | number | undefined): boolean {
    const id = normalizeOriginalMonsterId(value);
    return id !== null && ORIGINAL_MONSTER_BY_ID.has(id);
}

export function getOriginalMonsterRow(value: string | number | undefined): OriginalMonsterRow | null {
    const id = normalizeOriginalMonsterId(value);
    return id === null ? null : ORIGINAL_MONSTER_BY_ID.get(id) ?? null;
}

export function normalizeOriginalMonsterId(value: string | number | undefined): number | null {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 0 ? value : null;
    }
    const match = value?.match(/^(\d{3})R?$/i);
    return match ? Number(match[1]) : null;
}

function toOriginalMonsterRow(row: OriginalAbilityJsonRow): OriginalMonsterRow {
    return {
        id: row.classId,
        spriteId: `${row.classId}R`,
        name: row.name,
        label: row.label,
        stats: [...row.stats],
        combat: {
            hpLo: stat(row.stats, COL.hpLo),
            hpHi: stat(row.stats, COL.hpHi),
            mpLo: stat(row.stats, COL.mpLo),
            mpHi: stat(row.stats, COL.mpHi),
            atkLo: stat(row.stats, COL.atkLo),
            atkHi: stat(row.stats, COL.atkHi),
            defLo: stat(row.stats, COL.defLo),
            defHi: stat(row.stats, COL.defHi),
            magAtkLo: stat(row.stats, COL.magAtkLo),
            magAtkHi: stat(row.stats, COL.magAtkHi),
            magDefLo: stat(row.stats, COL.magDefLo),
            magDefHi: stat(row.stats, COL.magDefHi),
            spd: stat(row.stats, COL.spd),
            hitRate: stat(row.stats, COL.hit),
            evasion: stat(row.stats, COL.eva),
            critRate: stat(row.stats, COL.crit),
            magHit: stat(row.stats, COL.magHit),
            magEva: stat(row.stats, COL.magEva),
        },
    };
}

function stat(stats: readonly number[], index: number): number | null {
    const value = stats[index];
    return Number.isFinite(value) && value >= 0 ? value : null;
}
