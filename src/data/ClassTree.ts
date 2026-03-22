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
    skillUnlocks: { 1: ['inf_t1'], 2: ['inf_t2'], 3: ['inf_t3'], 4: ['inf_t4'], 5: ['inf_t5'], 6: ['inf_t6'], 7: ['inf_t7'] }
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
    skillUnlocks: { 1: ['cav_t1'], 2: ['cav_t2'], 3: ['cav_t3'], 4: ['cav_t4'], 5: ['cav_t5'], 6: ['cav_t6'], 7: ['cav_t7'] }
};

const FLYING: ClassLine = {
    id: 'flying', branch: 'battle',
    nameKr: '비병', nameEn: 'Flying',
    growth: GROWTH_FLYING, baseMovRange: 5, attackRange: 1,
    ignoresTerrain: true, waterBonus: false,
    tiers: [
        { tier: 2, nameKr: '호크나이트', nameEn: 'Hawk Knight' },
        { tier: 3, nameKr: '페가서스나이트', nameEn: 'Pegasus Knight' },
        { tier: 4, nameKr: '유니콘나이트', nameEn: 'Unicorn Knight' },
        { tier: 5, nameKr: '드래곤나이트', nameEn: 'Dragon Knight' },
        { tier: 6, nameKr: '드래곤로드', nameEn: 'Dragon Lord' },
        { tier: 7, nameKr: '드래곤마스터', nameEn: 'Dragon Master' },
    ],
    skillUnlocks: { 2: ['fly_t1'], 3: ['fly_t2'], 4: ['fly_t3'], 5: ['fly_t4'], 6: ['fly_t5'], 7: ['fly_t6'] }
};

// ─── 택틱스마스터 Branch ────────────────────────────────────────

const NAVAL: ClassLine = {
    id: 'naval', branch: 'tactics',
    nameKr: '수병', nameEn: 'Naval',
    growth: GROWTH_NAVAL, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: true,
    tiers: [
        { tier: 2, nameKr: '캡틴', nameEn: 'Captain' },
        { tier: 3, nameKr: '서펜트나이트', nameEn: 'Serpent Knight' },
        { tier: 4, nameKr: '서펜트로드', nameEn: 'Serpent Lord' },
        { tier: 5, nameKr: '서펜트마스터', nameEn: 'Serpent Master' },
        { tier: 6, nameKr: '크라켄나이트', nameEn: 'Kraken Knight' },
        { tier: 7, nameKr: '크라켄마스터', nameEn: 'Kraken Master' },
    ],
    skillUnlocks: { 2: ['nav_t1'], 3: ['nav_t2'], 4: ['nav_t3'], 5: ['nav_t4'], 6: ['nav_t5'], 7: ['nav_t6'] }
};

const LANCER: ClassLine = {
    id: 'lancer', branch: 'tactics',
    nameKr: '창병', nameEn: 'Lancer',
    growth: GROWTH_LANCE, baseMovRange: 3, attackRange: 2,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 2, nameKr: '로드', nameEn: 'Lord' },
        { tier: 3, nameKr: '하이로드', nameEn: 'High Lord' },
        { tier: 4, nameKr: '제너럴', nameEn: 'General' },
        { tier: 5, nameKr: '하이랜더', nameEn: 'Highlander' },
        { tier: 6, nameKr: '카운트', nameEn: 'Count' },
        { tier: 7, nameKr: '듀크', nameEn: 'Duke' },
    ],
    skillUnlocks: { 2: ['lan_t1'], 3: ['lan_t2'], 4: ['lan_t3'], 5: ['lan_t4'], 6: ['lan_t5'], 7: ['lan_t6'] }
};

const ARCHER: ClassLine = {
    id: 'archer', branch: 'tactics',
    nameKr: '궁병', nameEn: 'Archer',
    growth: GROWTH_ARCHER, baseMovRange: 3, attackRange: 4,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 2, nameKr: '스나이퍼', nameEn: 'Sniper' },
        { tier: 3, nameKr: '레인저', nameEn: 'Ranger' },
        { tier: 4, nameKr: '헌터', nameEn: 'Hunter' },
        { tier: 5, nameKr: '보우로드', nameEn: 'Bow Lord' },
        { tier: 6, nameKr: '보우마스터', nameEn: 'Bow Master' },
        { tier: 7, nameKr: '닌자마스터', nameEn: 'Ninja Master' },
    ],
    skillUnlocks: { 2: ['arc_t1'], 3: ['arc_t2'], 4: ['arc_t3'], 5: ['arc_t4'], 6: ['arc_t5'], 7: ['arc_t6'] }
};

// ─── 힐러마스터 Branch ──────────────────────────────────────────

const CLERIC: ClassLine = {
    id: 'cleric', branch: 'healer',
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
    skillUnlocks: { 1: ['cle_t1'], 2: ['cle_t2'], 3: ['cle_t3'], 4: ['cle_t4'], 5: ['cle_t5'], 6: ['cle_t6'], 7: ['cle_t7'] }
};

const PRIEST: ClassLine = {
    id: 'priest', branch: 'healer',
    nameKr: '신관', nameEn: 'Priest',
    growth: GROWTH_PRIEST, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 2, nameKr: '몽크', nameEn: 'Monk' },
        { tier: 3, nameKr: '비숍', nameEn: 'Bishop' },
        { tier: 4, nameKr: '세이지', nameEn: 'Sage' },
        { tier: 5, nameKr: '패러딘', nameEn: 'Paladin' },
        { tier: 6, nameKr: '세인트', nameEn: 'Saint' },
        { tier: 7, nameKr: '홀리마스터', nameEn: 'Holy Master' },
    ],
    skillUnlocks: { 2: ['pri_t1'], 3: ['pri_t2'], 4: ['pri_t3'], 5: ['pri_t4'], 6: ['pri_t5'], 7: ['pri_t6'] }
};

// ─── 매직마스터 Branch ─────────────────────────────────────────

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
    skillUnlocks: { 1: ['mag_t1'], 2: ['mag_t2'], 3: ['mag_t3'], 4: ['mag_t4'], 5: ['mag_t5'], 6: ['mag_t6'], 7: ['mag_t7'] }
};

const CULTIST: ClassLine = {
    id: 'cultist', branch: 'magic',
    nameKr: '사교', nameEn: 'Cultist',
    growth: GROWTH_CULTIST, baseMovRange: 3, attackRange: 3,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 2, nameKr: '셔먼', nameEn: 'Shaman' },
        { tier: 3, nameKr: '서머너', nameEn: 'Summoner' },
        { tier: 4, nameKr: '워록', nameEn: 'Warlock' },
        { tier: 5, nameKr: '네크로맨서', nameEn: 'Necromancer' },
        { tier: 6, nameKr: '일루저니스트', nameEn: 'Illusionist' },
        { tier: 7, nameKr: '자버러', nameEn: 'Jabberer' },
    ],
    skillUnlocks: { 2: ['cul_t1'], 3: ['cul_t2'], 4: ['cul_t3'], 5: ['cul_t4'], 6: ['cul_t5'], 7: ['cul_t6'] }
};

const SHRINE: ClassLine = {
    id: 'shrine', branch: 'healer',
    nameKr: '무녀', nameEn: 'Shrine Maiden',
    growth: GROWTH_SHRINE, baseMovRange: 3, attackRange: 1,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 2, nameKr: '무녀', nameEn: 'Shrine Maiden' },
        { tier: 3, nameKr: '신무', nameEn: 'Divine Dancer' },
        { tier: 4, nameKr: '영매사', nameEn: 'Spirit Medium' },
        { tier: 5, nameKr: '백련무녀', nameEn: 'Veteran Shrine' },
        { tier: 6, nameKr: '대신관', nameEn: 'Grand Oracle' },
        { tier: 7, nameKr: '신녀', nameEn: 'Holy Maiden' },
    ],
    skillUnlocks: { 2: ['shr_t1'], 3: ['shr_t2'], 4: ['shr_t3'], 5: ['shr_t4'], 6: ['shr_t5'], 7: ['shr_t6'] }
};

const ALCHEMIST: ClassLine = {
    id: 'alchemist', branch: 'magic',
    nameKr: '연금술사', nameEn: 'Alchemist',
    growth: GROWTH_ALCHEMIST, baseMovRange: 3, attackRange: 2,
    ignoresTerrain: false, waterBonus: false,
    tiers: [
        { tier: 1, nameKr: '연금술사', nameEn: 'Alchemist' },
        { tier: 2, nameKr: '약제사', nameEn: 'Apothecary' },
        { tier: 3, nameKr: '비약사', nameEn: 'Elixirist' },
        { tier: 4, nameKr: '현자', nameEn: 'Sage' },
        { tier: 5, nameKr: '대연금술사', nameEn: 'Grand Alchemist' },
        { tier: 6, nameKr: '마도연금사', nameEn: 'Arcane Alchemist' },
        { tier: 7, nameKr: '필로소퍼', nameEn: 'Philosopher' },
    ],
    skillUnlocks: { 1: ['alc_t1'], 2: ['alc_t2'], 3: ['alc_t3'], 4: ['alc_t4'], 5: ['alc_t5'], 6: ['alc_t6'], 7: ['alc_t7'] }
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
        branch: 'healer',
        requiredClassIds: ['cleric', 'priest', 'shrine'],
        tiers: [
            { tier: 8, nameKr: '힐러마스터', nameEn: 'Healer Master' },
            { tier: 9, nameKr: '그랑힐러', nameEn: 'Grand Healer' },
            { tier: 10, nameKr: '그랜드힐러', nameEn: 'Grand Healer Supreme' },
        ]
    },
    {
        branch: 'magic',
        requiredClassIds: ['mage', 'cultist', 'alchemist'],
        tiers: [
            { tier: 8, nameKr: '매직마스터', nameEn: 'Magic Master' },
            { tier: 9, nameKr: '그랑에이지', nameEn: 'Grand Sage' },
            { tier: 10, nameKr: '그랜드에이지', nameEn: 'Grand Sage Supreme' },
        ]
    }
];

/** All 10 base class lines */
export const ALL_CLASS_LINES: ClassLine[] = [
    INFANTRY, CAVALRY, FLYING,
    NAVAL, LANCER, ARCHER,
    CLERIC, PRIEST, SHRINE,
    MAGE, CULTIST, ALCHEMIST
];

/** Lookup a class line by ID */
export function getClassLine(id: string): ClassLine | undefined {
    return ALL_CLASS_LINES.find(c => c.id === id);
}

/** Get the master class for a given branch */
export function getMasterClass(branch: MasterBranch): MasterClass | undefined {
    return MASTER_CLASSES.find(m => m.branch === branch);
}
