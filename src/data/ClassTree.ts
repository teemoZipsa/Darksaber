/**
 * ClassTree — full 10-tier class progression with 4 master fusion branches.
 * Data lives in content/class-tree.json; this module attaches runtime growth
 * rates and preserves the existing lookup API.
 */

import CLASS_TREE_JSON from './content/class-tree.json';
import {
    type GrowthRates,
    GROWTH_MELEE, GROWTH_CAVALRY, GROWTH_FLYING,
    GROWTH_NAVAL, GROWTH_LANCE, GROWTH_ARCHER,
    GROWTH_CLERIC, GROWTH_PRIEST, GROWTH_MAGE, GROWTH_CULTIST,
    GROWTH_SHRINE, GROWTH_ALCHEMIST
} from './Stats';

export type MasterBranch = 'battle' | 'tactics' | 'healer' | 'magic';

export interface ClassTier {
    tier: number;
    nameKr: string;
    nameEn: string;
}

export interface ClassLine {
    id: string;
    branch: MasterBranch;
    nameKr: string;
    nameEn: string;
    growth: GrowthRates;
    baseMovRange: number;
    attackRange: number;
    ignoresTerrain: boolean;
    waterBonus: boolean;
    tiers: ClassTier[];
    /** Skills learned at specific tiers: { tierIndex: skillName } */
    skillUnlocks: Record<number, string[]>;
}

export interface MasterClass {
    branch: MasterBranch;
    requiredClassIds: string[];
    tiers: ClassTier[];
}

type GrowthKey =
    | 'melee'
    | 'cavalry'
    | 'flying'
    | 'naval'
    | 'lance'
    | 'archer'
    | 'cleric'
    | 'priest'
    | 'shrine'
    | 'mage'
    | 'cultist'
    | 'alchemist';

type ClassLineContent = Omit<ClassLine, 'growth'> & {
    growthKey: GrowthKey;
};

type MasterLineContent = Omit<ClassLine, 'growth'> & {
    growthSourceIds: string[];
    growthMultiplier: number;
};

interface ClassTreeContent {
    baseLines: ClassLineContent[];
    masterClasses: MasterClass[];
    masterLines: MasterLineContent[];
}

const CLASS_TREE_CONTENT = CLASS_TREE_JSON as ClassTreeContent;

const GROWTH_BY_KEY: Record<GrowthKey, GrowthRates> = {
    melee: GROWTH_MELEE,
    cavalry: GROWTH_CAVALRY,
    flying: GROWTH_FLYING,
    naval: GROWTH_NAVAL,
    lance: GROWTH_LANCE,
    archer: GROWTH_ARCHER,
    cleric: GROWTH_CLERIC,
    priest: GROWTH_PRIEST,
    shrine: GROWTH_SHRINE,
    mage: GROWTH_MAGE,
    cultist: GROWTH_CULTIST,
    alchemist: GROWTH_ALCHEMIST,
};

function combineGrowth(rates: GrowthRates[], multiplier: number = 1): GrowthRates {
    const avg = (key: keyof GrowthRates) =>
        rates.reduce((sum, growth) => sum + growth[key], 0) / rates.length * multiplier;
    return {
        hp: avg('hp'),
        mp: avg('mp'),
        atk: avg('atk'),
        def: avg('def'),
        magAtk: avg('magAtk'),
        magDef: avg('magDef'),
        spd: avg('spd'),
    };
}

function materializeBaseLine(line: ClassLineContent): ClassLine {
    const { growthKey, ...rest } = line;
    return {
        ...rest,
        growth: GROWTH_BY_KEY[growthKey],
        skillUnlocks: rest.skillUnlocks,
    };
}

function getGrowthForClassId(classId: string): GrowthRates {
    const line = BASE_CLASS_BY_ID.get(classId);
    if (!line) throw new Error(`Unknown class growth source: ${classId}`);
    return line.growth;
}

function materializeMasterLine(line: MasterLineContent): ClassLine {
    const { growthSourceIds, growthMultiplier, ...rest } = line;
    return {
        ...rest,
        growth: combineGrowth(growthSourceIds.map(getGrowthForClassId), growthMultiplier),
        skillUnlocks: rest.skillUnlocks,
    };
}

/** All 12 base class lines */
export const ALL_BASE_CLASS_LINES: ClassLine[] = CLASS_TREE_CONTENT.baseLines.map(materializeBaseLine);

const BASE_CLASS_BY_ID = new Map(ALL_BASE_CLASS_LINES.map((line) => [line.id, line]));

export const MASTER_CLASSES: MasterClass[] = CLASS_TREE_CONTENT.masterClasses;

const MASTER_CLASS_BY_BRANCH: Record<MasterBranch, MasterClass> = {
    battle: MASTER_CLASSES[0]!,
    tactics: MASTER_CLASSES[1]!,
    healer: MASTER_CLASSES[2]!,
    magic: MASTER_CLASSES[3]!,
};

const MASTER_CLASS_LINES: ClassLine[] = CLASS_TREE_CONTENT.masterLines.map(materializeMasterLine);

const MASTER_CLASS_LINE_IDS = new Set(MASTER_CLASS_LINES.map((line) => line.id));

/** All playable class lines, including T8~T10 master fusion lines */
export const ALL_CLASS_LINES: ClassLine[] = [
    ...ALL_BASE_CLASS_LINES,
    ...MASTER_CLASS_LINES,
];

/** Lookup a class line by ID */
export function getClassLine(id: string): ClassLine | undefined {
    return ALL_CLASS_LINES.find(c => c.id === id);
}

/** Get the master class for a given branch */
export function getMasterClass(branch: MasterBranch): MasterClass | undefined {
    return MASTER_CLASS_BY_BRANCH[branch];
}

export function getMasterClassLineId(branch: MasterBranch): string {
    return `master_${branch}`;
}

export function isMasterClassLineId(classLineId: string): boolean {
    return MASTER_CLASS_LINE_IDS.has(classLineId);
}
