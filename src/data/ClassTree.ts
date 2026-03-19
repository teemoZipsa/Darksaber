/**
 * ClassTree — full 10-tier class progression with 3 master fusion branches.
 * Based on the original Dark Saver class chart.
 *
 * Structure:
 *   9 base classes → 7 tiers each → fuse 3-into-1 at tier 8, 9, 10
 *   배틀마스터 branch: 보병 + 기병 + 비병
 *   택틱스마스터 branch: 수병 + 창병 + 궁병
 *   매직마스터 branch: 승려 + 신관 + 마법사
 */

import {
    GrowthRates,
    GROWTH_MELEE, GROWTH_CAVALRY, GROWTH_FLYING,
    GROWTH_NAVAL, GROWTH_LANCE, GROWTH_ARCHER,
    GROWTH_CLERIC, GROWTH_PRIEST, GROWTH_MAGE
} from './Stats';

export type MasterBranch = 'battle' | 'tactics' | 'magic';

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
    ignoresTerrain: boolean;    // 비병 = true
    waterBonus: boolean;        // 수병 = true
    tiers: ClassTier[];
    /** Skills learned at specific tiers: { tierIndex: skillName } */
    skillUnlocks: Record<number, string[]>;
}

// ─── 배틀마스터 Branch ──────────────────────────────────────────

const INFANTRY: ClassLine = {
    id: 'infantry', branch: 'battle',
    nameKr: '보병', nameEn: 'Infantry',
    growth: GROWTH_MELEE, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '파이터', nameEn: 'Fighter' },
        { tier: 2, nameKr: '글라디에이터', nameEn: 'Gladiator' },
        { tier: 3, nameKr: '히어로', nameEn: 'Hero' },
        { tier: 4, nameKr: '킹', nameEn: 'King' },
        { tier: 5, nameKr: '카이저', nameEn: 'Kaiser' },
        { tier: 6, nameKr: '엠퍼러', nameEn: 'Emperor' },
        { tier: 7, nameKr: '그레이트 엠퍼러', nameEn: 'Great Emperor' },
    ],
    skillUnlocks: { 4: ['Attack Buff'], 5: ['Protection Buff'] }
};

const CAVALRY: ClassLine = {
    id: 'cavalry', branch: 'battle',
    nameKr: '기병', nameEn: 'Cavalry',
    growth: GROWTH_CAVALRY, baseMovRange: 4, attackRange: 2,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '나이트', nameEn: 'Knight' },
        { tier: 2, nameKr: '아크나이트', nameEn: 'Ark Knight' },
        { tier: 3, nameKr: '실버나이트', nameEn: 'Silver Knight' },
        { tier: 4, nameKr: '나이트마스터', nameEn: 'Knight Master' },
        { tier: 5, nameKr: '골드나이트', nameEn: 'Gold Knight' },
        { tier: 6, nameKr: '로얄나이트', nameEn: 'Royal Knight' },
        { tier: 7, nameKr: '로얄가드', nameEn: 'Royal Guard' },
    ],
    skillUnlocks: { 5: ['Protection Buff'], 6: ['Attack Buff'] }
};

const FLYING: ClassLine = {
    id: 'flying', branch: 'battle',
    nameKr: '비병', nameEn: 'Flying',
    growth: GROWTH_FLYING, baseMovRange: 5, attackRange: 1,
    ignoresTerrain: true, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '호크나이트', nameEn: 'Hawk Knight' },
        { tier: 2, nameKr: '페가서스나이트', nameEn: 'Pegasus Knight' },
        { tier: 3, nameKr: '유니콘나이트', nameEn: 'Unicorn Knight' },
        { tier: 4, nameKr: '드래곤나이트', nameEn: 'Dragon Knight' },
        { tier: 5, nameKr: '드래곤로드', nameEn: 'Dragon Lord' },
        { tier: 6, nameKr: '드래곤마스터', nameEn: 'Dragon Master' },
        { tier: 7, nameKr: '크레이트 엠퍼러', nameEn: 'Great Emperor' },
    ],
    skillUnlocks: {}
};

// ─── 택틱스마스터 Branch ────────────────────────────────────────

const NAVAL: ClassLine = {
    id: 'naval', branch: 'tactics',
    nameKr: '수병', nameEn: 'Naval',
    growth: GROWTH_NAVAL, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: true,
    tiers: [
        { tier: 1, nameKr: '캡틴', nameEn: 'Captain' },
        { tier: 2, nameKr: '서펜트나이트', nameEn: 'Serpent Knight' },
        { tier: 3, nameKr: '서펜트로드', nameEn: 'Serpent Lord' },
        { tier: 4, nameKr: '서펜트마스터', nameEn: 'Serpent Master' },
        { tier: 5, nameKr: '크라켄나이트', nameEn: 'Kraken Knight' },
        { tier: 6, nameKr: '크라켄마스터', nameEn: 'Kraken Master' },
        { tier: 7, nameKr: '듀크', nameEn: 'Duke' },
    ],
    skillUnlocks: { 7: ['Attack Buff'] }
};

const LANCER: ClassLine = {
    id: 'lancer', branch: 'tactics',
    nameKr: '창병', nameEn: 'Lancer',
    growth: GROWTH_LANCE, baseMovRange: 3, attackRange: 2,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '로드', nameEn: 'Lord' },
        { tier: 2, nameKr: '하이로드', nameEn: 'High Lord' },
        { tier: 3, nameKr: '제너럴', nameEn: 'General' },
        { tier: 4, nameKr: '하이랜더', nameEn: 'Highlander' },
        { tier: 5, nameKr: '카운트', nameEn: 'Count' },
        { tier: 6, nameKr: '듀크', nameEn: 'Duke' },
        { tier: 7, nameKr: '로얄가드', nameEn: 'Royal Guard' },
    ],
    skillUnlocks: {}
};

const ARCHER: ClassLine = {
    id: 'archer', branch: 'tactics',
    nameKr: '궁병', nameEn: 'Archer',
    growth: GROWTH_ARCHER, baseMovRange: 3, attackRange: 4,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '스나이퍼', nameEn: 'Sniper' },
        { tier: 2, nameKr: '레인저', nameEn: 'Ranger' },
        { tier: 3, nameKr: '헌터', nameEn: 'Hunter' },
        { tier: 4, nameKr: '보우로드', nameEn: 'Bow Lord' },
        { tier: 5, nameKr: '보우마스터', nameEn: 'Bow Master' },
        { tier: 6, nameKr: '닌자마스터', nameEn: 'Ninja Master' },
        { tier: 7, nameKr: '카운트', nameEn: 'Count' },
    ],
    skillUnlocks: {}
};

// ─── 매직마스터 Branch ──────────────────────────────────────────

const CLERIC: ClassLine = {
    id: 'cleric', branch: 'magic',
    nameKr: '승려', nameEn: 'Cleric',
    growth: GROWTH_CLERIC, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '클레릭', nameEn: 'Cleric' },
        { tier: 2, nameKr: '프리스트', nameEn: 'Priest' },
        { tier: 3, nameKr: '하이프리스트', nameEn: 'High Priest' },
        { tier: 4, nameKr: '에이전트', nameEn: 'Agent' },
        { tier: 5, nameKr: '하이에이전트', nameEn: 'High Agent' },
        { tier: 6, nameKr: '프린세스', nameEn: 'Princess' },
        { tier: 7, nameKr: '퀸', nameEn: 'Queen' },
    ],
    skillUnlocks: { 1: ['Heal'] }
};

const PRIEST: ClassLine = {
    id: 'priest', branch: 'magic',
    nameKr: '신관', nameEn: 'Priest',
    growth: GROWTH_PRIEST, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '몽크', nameEn: 'Monk' },
        { tier: 2, nameKr: '비숍', nameEn: 'Bishop' },
        { tier: 3, nameKr: '세이지', nameEn: 'Sage' },
        { tier: 4, nameKr: '패러딘', nameEn: 'Paladin' },
        { tier: 5, nameKr: '세인트', nameEn: 'Saint' },
        { tier: 6, nameKr: '홀리마스터', nameEn: 'Holy Master' },
        { tier: 7, nameKr: '로얄 위저드', nameEn: 'Royal Wizard' },
    ],
    skillUnlocks: { 3: ['Quick Buff'] }
};

const MAGE: ClassLine = {
    id: 'mage', branch: 'magic',
    nameKr: '마법사', nameEn: 'Mage',
    growth: GROWTH_MAGE, baseMovRange: 3, attackRange: 3,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '매지션', nameEn: 'Magician' },
        { tier: 2, nameKr: '위저드', nameEn: 'Wizard' },
        { tier: 3, nameKr: '하이위저드', nameEn: 'High Wizard' },
        { tier: 4, nameKr: '메이지', nameEn: 'Mage' },
        { tier: 5, nameKr: '아크메이지', nameEn: 'Arch Mage' },
        { tier: 6, nameKr: '소서러', nameEn: 'Sorcerer' },
        { tier: 7, nameKr: '로열위저드', nameEn: 'Royal Wizard' },
    ],
    skillUnlocks: {}
};

// ─── Master Class Definitions ───────────────────────────────────

export interface MasterClass {
    branch: MasterBranch;
    requiredClassIds: string[];  // 3 class lines needed for fusion
    tiers: ClassTier[];          // tiers 8, 9, 10
}

export const MASTER_CLASSES: MasterClass[] = [
    {
        branch: 'battle',
        requiredClassIds: ['infantry', 'cavalry', 'flying'],
        tiers: [
            { tier: 8, nameKr: '배틀마스터', nameEn: 'Battle Master' },
            { tier: 9, nameKr: '그랑스워드', nameEn: 'Grand Sword' },
            { tier: 10, nameKr: '그랜드소드', nameEn: 'Grand Sword Supreme' },
        ]
    },
    {
        branch: 'tactics',
        requiredClassIds: ['naval', 'lancer', 'archer'],
        tiers: [
            { tier: 8, nameKr: '택틱스마스터', nameEn: 'Tactics Master' },
            { tier: 9, nameKr: '그랑아처', nameEn: 'Grand Archer' },
            { tier: 10, nameKr: '그랜드아처', nameEn: 'Grand Archer Supreme' },
        ]
    },
    {
        branch: 'magic',
        requiredClassIds: ['cleric', 'priest', 'mage'],
        tiers: [
            { tier: 8, nameKr: '매직마스터', nameEn: 'Magic Master' },
            { tier: 9, nameKr: '그랑에이지', nameEn: 'Grand Sage' },
            { tier: 10, nameKr: '그랜드에이지', nameEn: 'Grand Sage Supreme' },
        ]
    }
];

/** All 9 base class lines */
export const ALL_CLASS_LINES: ClassLine[] = [
    INFANTRY, CAVALRY, FLYING,
    NAVAL, LANCER, ARCHER,
    CLERIC, PRIEST, MAGE
];

/** Lookup a class line by ID */
export function getClassLine(id: string): ClassLine | undefined {
    return ALL_CLASS_LINES.find(c => c.id === id);
}

/** Get the master class for a given branch */
export function getMasterClass(branch: MasterBranch): MasterClass | undefined {
    return MASTER_CLASSES.find(m => m.branch === branch);
}
