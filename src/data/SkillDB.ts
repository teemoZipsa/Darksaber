/**
 * SkillDB — Complete skill database for all 12 classes × 7 tiers.
 * Skills are auto-learned when character reaches the required tier.
 * Each skill has MP cost, power scaling, range, and effect type.
 */

export type SkillType = 'damage' | 'heal' | 'buff' | 'debuff' | 'aoe';
export type SkillElement = 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' | 'earth' | 'wind' | 'physical' | 'none';
export type SkillTargetScope = 'self' | 'selfAndNearbyAllies';
export type SkillGroup = 'classSkill' | 'classStance' | 'classCommand' | 'classAura' | 'commonMagic';

export interface Skill {
    id: string;
    nameKr: string;
    nameEn: string;
    classId: string;      // which class line this skill belongs to
    tier: number;          // 1~7, character must be at this tier or higher
    mpCost: number;
    type: SkillType;
    element: SkillElement;
    power: number;         // damage/heal multiplier (applied to magAtk or atk)
    range: number;         // cast range in tiles
    aoeRadius: number;     // 0 = single target, 1+ = area
    icon: string;          // emoji icon
    descKr: string;
    descEn: string;
    buffStat?: 'atk' | 'def' | 'spd' | 'mdef' | 'regen' | 'all'; // specifically which stat to boost
    buffDuration?: number; // duration in turns
    hitBonus?: number;     // flat hit chance bonus in percentage points
    targetScope?: SkillTargetScope;
    allyRadius?: number;
    skillGroup?: SkillGroup;
}

// ═══════════════════════════════════════════════════════════
//  배틀마스터 Branch
// ═══════════════════════════════════════════════════════════

// ─── 보병 (Infantry) ───
const INFANTRY_SKILLS: Skill[] = [
    {
        id: 'inf_t1', nameKr: '기합', nameEn: 'Focus',
        classId: 'infantry', tier: 1, mpCost: 5,
        type: 'buff', element: 'physical', power: 1.2,
        range: 0, aoeRadius: 0, icon: '💪',
        descKr: '정신을 집중하여 공격력 20% 증가 (3턴)',
        descEn: 'Focus mind, ATK +20% for 3 turns',
        buffStat: 'atk', buffDuration: 3
    },
    {
        id: 'inf_t2', nameKr: '전투함성', nameEn: 'War Cry',
        classId: 'infantry', tier: 2, mpCost: 8,
        type: 'buff', element: 'physical', power: 1.15,
        range: 0, aoeRadius: 0, icon: '📣',
        descKr: '전투함성으로 방어력 15% 증가 (3턴)',
        descEn: 'War cry, DEF +15% for 3 turns',
        buffStat: 'def', buffDuration: 3
    },
    {
        id: 'inf_guard_stance', nameKr: '방패태세', nameEn: 'Shield Stance',
        classId: 'infantry', tier: 2, mpCost: 8,
        type: 'buff', element: 'physical', power: 1.15,
        range: 0, aoeRadius: 0, icon: '🛡️',
        descKr: '방패를 세워 1턴 동안 피해를 크게 줄이고 방어력 증가',
        descEn: 'Raise shield, sharply reduce one hit and gain DEF for 1 turn',
        buffStat: 'def', buffDuration: 1,
        targetScope: 'self',
        skillGroup: 'classStance',
    },
    {
        id: 'inf_t3', nameKr: '파워슬래시', nameEn: 'Power Slash',
        classId: 'infantry', tier: 3, mpCost: 10,
        type: 'damage', element: 'physical', power: 1.8,
        range: 1, aoeRadius: 0, icon: '⚔️',
        descKr: '강력한 일격으로 적에게 1.8배 물리 피해',
        descEn: 'Powerful strike dealing 1.8x physical damage',
    },
    {
        id: 'inf_t4', nameKr: '분노폭풍', nameEn: 'Rage Storm',
        classId: 'infantry', tier: 4, mpCost: 15,
        type: 'aoe', element: 'physical', power: 1.5,
        range: 1, aoeRadius: 1, icon: '🌪️',
        descKr: '주변 적에게 1.5배 범위 물리 피해',
        descEn: 'AoE 1.5x physical damage to nearby enemies',
    },
    {
        id: 'inf_t5', nameKr: '소드브레이크', nameEn: 'Sword Break',
        classId: 'infantry', tier: 5, mpCost: 18,
        type: 'damage', element: 'physical', power: 2.2,
        range: 1, aoeRadius: 0, icon: '🗡️',
        descKr: '적의 방어를 무시하는 2.2배 관통 공격',
        descEn: 'Defense-piercing 2.2x physical attack',
    },
    {
        id: 'inf_iron_defense', nameKr: '철벽수비', nameEn: 'Iron Defense',
        classId: 'infantry', tier: 5, mpCost: 18,
        type: 'buff', element: 'physical', power: 0.8,
        range: 0, aoeRadius: 0, icon: '▣',
        descKr: '2턴 동안 피해를 줄이고 반격 태세를 갖춤',
        descEn: 'Reduce incoming damage and prepare a counter for 2 turns',
        buffStat: 'def', buffDuration: 2,
        targetScope: 'self',
        skillGroup: 'classStance',
    },
    {
        id: 'inf_t6', nameKr: '바디블로', nameEn: 'Body Blow',
        classId: 'infantry', tier: 6, mpCost: 22,
        type: 'damage', element: 'physical', power: 2.5,
        range: 1, aoeRadius: 0, icon: '👊',
        descKr: '전신의 힘을 실은 2.5배 타격',
        descEn: 'Full-body 2.5x physical strike',
    },
    {
        id: 'inf_t7', nameKr: '천하무쌍', nameEn: 'Peerless',
        classId: 'infantry', tier: 7, mpCost: 30,
        type: 'aoe', element: 'physical', power: 3.0,
        range: 1, aoeRadius: 1, icon: '⚡',
        descKr: '천하무쌍! 모든 주변 적에게 3배 피해',
        descEn: 'Peerless! 3x AoE physical damage',
    },
];

// ─── 기병 (Cavalry) ───
const CAVALRY_SKILLS: Skill[] = [
    {
        id: 'cav_t1', nameKr: '돌진', nameEn: 'Charge',
        classId: 'cavalry', tier: 1, mpCost: 6,
        type: 'damage', element: 'physical', power: 1.5,
        range: 2, aoeRadius: 0, icon: '🐴',
        descKr: '돌진하여 1.5배 물리 피해',
        descEn: 'Charge attack dealing 1.5x physical damage',
    },
    {
        id: 'cav_t2', nameKr: '랜스차지', nameEn: 'Lance Charge',
        classId: 'cavalry', tier: 2, mpCost: 9,
        type: 'damage', element: 'physical', power: 1.7,
        range: 2, aoeRadius: 0, icon: '🔱',
        descKr: '창을 앞세운 돌격 1.7배 피해',
        descEn: 'Lance-forward charge, 1.7x damage',
    },
    {
        id: 'cav_mobile_stance', nameKr: '기동태세', nameEn: 'Mobile Stance',
        classId: 'cavalry', tier: 2, mpCost: 9,
        type: 'buff', element: 'physical', power: 1.25,
        range: 0, aoeRadius: 0, icon: '💨',
        descKr: '3턴 동안 속도와 회피 증가',
        descEn: 'Increase SPD and evasion for 3 turns',
        buffStat: 'spd', buffDuration: 3,
        targetScope: 'self',
        skillGroup: 'classStance',
    },
    {
        id: 'cav_t3', nameKr: '기마돌격', nameEn: 'Mounted Rush',
        classId: 'cavalry', tier: 3, mpCost: 12,
        type: 'damage', element: 'physical', power: 2.0,
        range: 2, aoeRadius: 0, icon: '🏇',
        descKr: '기마 돌격 2.0배 피해',
        descEn: 'Mounted rush, 2.0x physical damage',
    },
    {
        id: 'cav_t4', nameKr: '소닉스러스트', nameEn: 'Sonic Thrust',
        classId: 'cavalry', tier: 4, mpCost: 16,
        type: 'damage', element: 'wind', power: 2.3,
        range: 2, aoeRadius: 0, icon: '💨',
        descKr: '음속의 창격 2.3배 피해',
        descEn: 'Sonic-speed thrust, 2.3x damage',
    },
    {
        id: 'cav_t5', nameKr: '드래곤팡', nameEn: 'Dragon Fang',
        classId: 'cavalry', tier: 5, mpCost: 20,
        type: 'damage', element: 'physical', power: 2.6,
        range: 2, aoeRadius: 0, icon: '🐉',
        descKr: '용의 이빨 같은 2.6배 관통공격',
        descEn: 'Dragon fang piercing 2.6x attack',
    },
    {
        id: 'cav_long_breakthrough', nameKr: '장거리 돌파', nameEn: 'Long Breakthrough',
        classId: 'cavalry', tier: 5, mpCost: 24,
        type: 'damage', element: 'physical', power: 2.1,
        range: 3, aoeRadius: 0, icon: '🏇',
        descKr: '긴 사거리로 돌파하여 2.1배 물리 피해',
        descEn: 'Break through from range, dealing 2.1x physical damage',
        hitBonus: 10,
        skillGroup: 'classSkill',
    },
    {
        id: 'cav_t6', nameKr: '임페리얼', nameEn: 'Imperial Strike',
        classId: 'cavalry', tier: 6, mpCost: 25,
        type: 'aoe', element: 'physical', power: 2.2,
        range: 2, aoeRadius: 1, icon: '👑',
        descKr: '황제의 일격! 범위 2.2배 피해',
        descEn: 'Imperial AoE 2.2x damage',
    },
    {
        id: 'cav_t7', nameKr: '멸살봉', nameEn: 'Annihilation',
        classId: 'cavalry', tier: 7, mpCost: 32,
        type: 'damage', element: 'physical', power: 3.5,
        range: 2, aoeRadius: 0, icon: '☠️',
        descKr: '적을 소멸시키는 3.5배 궁극기',
        descEn: 'Annihilation! 3.5x ultimate strike',
    },
];

// ─── 비병 (Flying) ───
const FLYING_SKILLS: Skill[] = [
    {
        id: 'fly_t1', nameKr: '다이브', nameEn: 'Dive',
        classId: 'flying', tier: 1, mpCost: 5,
        type: 'damage', element: 'wind', power: 1.4,
        range: 1, aoeRadius: 0, icon: '🦅',
        descKr: '급강하 공격 1.4배 피해',
        descEn: 'Dive attack, 1.4x damage',
    },
    {
        id: 'fly_t2', nameKr: '에어슬래시', nameEn: 'Air Slash',
        classId: 'flying', tier: 2, mpCost: 8,
        type: 'damage', element: 'wind', power: 1.6,
        range: 2, aoeRadius: 0, icon: '🌬️',
        descKr: '바람의 칼날 1.6배 피해',
        descEn: 'Wind blade, 1.6x damage',
    },
    {
        id: 'fly_t3', nameKr: '윈드커터', nameEn: 'Wind Cutter',
        classId: 'flying', tier: 3, mpCost: 11,
        type: 'damage', element: 'wind', power: 1.9,
        range: 2, aoeRadius: 0, icon: '🌀',
        descKr: '진공의 칼날 1.9배 풍속성 피해',
        descEn: 'Vacuum blade, 1.9x wind damage',
    },
    {
        id: 'fly_t4', nameKr: '폭풍소환', nameEn: 'Storm Call',
        classId: 'flying', tier: 4, mpCost: 16,
        type: 'aoe', element: 'wind', power: 1.6,
        range: 2, aoeRadius: 1, icon: '⛈️',
        descKr: '폭풍을 소환하여 범위 1.6배 피해',
        descEn: 'Summon storm, AoE 1.6x wind damage',
    },
    {
        id: 'fly_t5', nameKr: '드래곤브레스', nameEn: 'Dragon Breath',
        classId: 'flying', tier: 5, mpCost: 20,
        type: 'aoe', element: 'fire', power: 2.0,
        range: 2, aoeRadius: 1, icon: '🔥',
        descKr: '용의 숨결! 범위 2.0배 화염 피해',
        descEn: 'Dragon breath! AoE 2.0x fire damage',
    },
    {
        id: 'fly_t6', nameKr: '천공진', nameEn: 'Sky Siege',
        classId: 'flying', tier: 6, mpCost: 24,
        type: 'damage', element: 'wind', power: 2.8,
        range: 3, aoeRadius: 0, icon: '🌪️',
        descKr: '하늘에서 급습 2.8배 피해',
        descEn: 'Sky siege, 2.8x wind damage',
    },
    {
        id: 'fly_t7', nameKr: '갓윙', nameEn: 'God Wing',
        classId: 'flying', tier: 7, mpCost: 30,
        type: 'aoe', element: 'wind', power: 3.0,
        range: 2, aoeRadius: 2, icon: '🪽',
        descKr: '신의 날개! 넓은 범위 3배 피해',
        descEn: 'God Wing! Wide AoE 3x wind damage',
    },
];

// ═══════════════════════════════════════════════════════════
//  택틱스마스터 Branch
// ═══════════════════════════════════════════════════════════

// ─── 수병 (Naval) ───
const NAVAL_SKILLS: Skill[] = [
    {
        id: 'nav_t1', nameKr: '아쿠아슬래시', nameEn: 'Aqua Slash',
        classId: 'naval', tier: 1, mpCost: 6,
        type: 'damage', element: 'ice', power: 1.4,
        range: 1, aoeRadius: 0, icon: '💧',
        descKr: '물의 칼날 1.4배 수속성 피해',
        descEn: 'Aqua blade, 1.4x water damage',
    },
    {
        id: 'nav_t2', nameKr: '조류조작', nameEn: 'Tide Control',
        classId: 'naval', tier: 2, mpCost: 8,
        type: 'debuff', element: 'ice', power: 0.8,
        range: 2, aoeRadius: 0, icon: '🌊',
        descKr: '적의 이동속도 감소',
        descEn: 'Reduce enemy movement speed',
    },
    {
        id: 'nav_t3', nameKr: '해류폭풍', nameEn: 'Current Storm',
        classId: 'naval', tier: 3, mpCost: 12,
        type: 'aoe', element: 'ice', power: 1.6,
        range: 2, aoeRadius: 1, icon: '🌀',
        descKr: '해류 폭풍 범위 1.6배 피해',
        descEn: 'Current storm AoE 1.6x damage',
    },
    {
        id: 'nav_t4', nameKr: '크라켄촉수', nameEn: 'Kraken Tentacle',
        classId: 'naval', tier: 4, mpCost: 15,
        type: 'damage', element: 'ice', power: 2.2,
        range: 2, aoeRadius: 0, icon: '🦑',
        descKr: '크라켄의 촉수 2.2배 피해',
        descEn: 'Kraken tentacle, 2.2x damage',
    },
    {
        id: 'nav_t5', nameKr: '대해일', nameEn: 'Great Tsunami',
        classId: 'naval', tier: 5, mpCost: 20,
        type: 'aoe', element: 'ice', power: 2.0,
        range: 3, aoeRadius: 1, icon: '🌊',
        descKr: '대해일! 범위 2.0배 수속성 피해',
        descEn: 'Tsunami! AoE 2.0x water damage',
    },
    {
        id: 'nav_t6', nameKr: '메일스트롬', nameEn: 'Maelstrom',
        classId: 'naval', tier: 6, mpCost: 25,
        type: 'aoe', element: 'ice', power: 2.5,
        range: 3, aoeRadius: 2, icon: '🌀',
        descKr: '거대 소용돌이 범위 2.5배 피해',
        descEn: 'Maelstrom! Wide AoE 2.5x damage',
    },
    {
        id: 'nav_t7', nameKr: '해신의분노', nameEn: 'Wrath of Poseidon',
        classId: 'naval', tier: 7, mpCost: 32,
        type: 'aoe', element: 'ice', power: 3.2,
        range: 3, aoeRadius: 2, icon: '🔱',
        descKr: '해신의 분노! 광범위 3.2배 피해',
        descEn: 'Poseidon\'s wrath! 3.2x wide AoE damage',
    },
];

// ─── 창병 (Lancer) ───
const LANCER_SKILLS: Skill[] = [
    {
        id: 'lan_t1', nameKr: '찌르기', nameEn: 'Thrust',
        classId: 'lancer', tier: 1, mpCost: 5,
        type: 'damage', element: 'physical', power: 1.5,
        range: 2, aoeRadius: 0, icon: '🔱',
        descKr: '정확한 찌르기 1.5배 피해',
        descEn: 'Precise thrust, 1.5x damage',
    },
    {
        id: 'lan_t2', nameKr: '관통돌격', nameEn: 'Pierce Charge',
        classId: 'lancer', tier: 2, mpCost: 9,
        type: 'damage', element: 'physical', power: 1.8,
        range: 2, aoeRadius: 0, icon: '🏹',
        descKr: '관통 돌격 1.8배 방어 무시 피해',
        descEn: 'Piercing charge, 1.8x defense-ignoring',
    },
    {
        id: 'lan_t3', nameKr: '창술연무', nameEn: 'Spear Dance',
        classId: 'lancer', tier: 3, mpCost: 12,
        type: 'aoe', element: 'physical', power: 1.5,
        range: 2, aoeRadius: 1, icon: '💫',
        descKr: '창을 휘둘러 범위 1.5배 피해',
        descEn: 'Spear dance AoE 1.5x damage',
    },
    {
        id: 'lan_spear_wall', nameKr: '창벽진', nameEn: 'Spear Wall',
        classId: 'lancer', tier: 3, mpCost: 14,
        type: 'buff', element: 'physical', power: 0.5,
        range: 0, aoeRadius: 0, icon: '🔱',
        descKr: '반경 1 아군에게 1턴 방어 태세 부여',
        descEn: 'Grant a 1-turn guard stance to allies within radius 1',
        buffDuration: 1,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 1,
        skillGroup: 'classCommand',
    },
    {
        id: 'lan_t4', nameKr: '스피어스톰', nameEn: 'Spear Storm',
        classId: 'lancer', tier: 4, mpCost: 16,
        type: 'aoe', element: 'physical', power: 1.8,
        range: 2, aoeRadius: 1, icon: '⚡',
        descKr: '창의 폭풍 범위 1.8배 피해',
        descEn: 'Spear storm AoE 1.8x damage',
    },
    {
        id: 'lan_t5', nameKr: '브레이크스러스트', nameEn: 'Break Thrust',
        classId: 'lancer', tier: 5, mpCost: 20,
        type: 'damage', element: 'physical', power: 2.5,
        range: 2, aoeRadius: 0, icon: '💥',
        descKr: '방어 분쇄 2.5배 관통 공격',
        descEn: 'Armor-breaking 2.5x piercing thrust',
    },
    {
        id: 'lan_t6', nameKr: '성창', nameEn: 'Holy Spear',
        classId: 'lancer', tier: 6, mpCost: 24,
        type: 'damage', element: 'holy', power: 2.8,
        range: 2, aoeRadius: 0, icon: '✨',
        descKr: '성스러운 창격 2.8배 피해',
        descEn: 'Holy spear, 2.8x holy damage',
    },
    {
        id: 'lan_intercept_order', nameKr: '요격태세', nameEn: 'Intercept Order',
        classId: 'lancer', tier: 6, mpCost: 24,
        type: 'buff', element: 'physical', power: 1.15,
        range: 0, aoeRadius: 0, icon: '↩',
        descKr: '반경 1 아군에게 2턴 반격 태세와 방어력 증가 부여',
        descEn: 'Grant counter stance and DEF to allies within radius 1 for 2 turns',
        buffStat: 'def', buffDuration: 2,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 1,
        skillGroup: 'classCommand',
    },
    {
        id: 'lan_t7', nameKr: '용살창', nameEn: 'Dragon Slayer',
        classId: 'lancer', tier: 7, mpCost: 30,
        type: 'damage', element: 'physical', power: 3.5,
        range: 2, aoeRadius: 0, icon: '🐉',
        descKr: '용마저 쓰러뜨리는 3.5배 궁극기',
        descEn: 'Dragon Slayer! 3.5x ultimate pierce',
    },
];

// ─── 궁병 (Archer) ───
const ARCHER_SKILLS: Skill[] = [
    {
        id: 'arc_t1', nameKr: '속사', nameEn: 'Rapid Shot',
        classId: 'archer', tier: 1, mpCost: 5,
        type: 'damage', element: 'physical', power: 1.3,
        range: 4, aoeRadius: 0, icon: '🏹',
        descKr: '빠른 연사 1.3배 피해',
        descEn: 'Rapid shot, 1.3x damage',
    },
    {
        id: 'arc_t2', nameKr: '조준사격', nameEn: 'Aimed Shot',
        classId: 'archer', tier: 2, mpCost: 8,
        type: 'damage', element: 'physical', power: 1.8,
        range: 5, aoeRadius: 0, icon: '🎯',
        descKr: '정밀 조준 1.8배 피해 + 명중 보너스',
        descEn: 'Precise aim, 1.8x damage + hit bonus',
        hitBonus: 20,
    },
    {
        id: 'arc_t3', nameKr: '관통화살', nameEn: 'Piercing Arrow',
        classId: 'archer', tier: 3, mpCost: 11,
        type: 'damage', element: 'physical', power: 2.0,
        range: 4, aoeRadius: 0, icon: '➡️',
        descKr: '관통 화살 2.0배 방어 무시',
        descEn: 'Piercing arrow, 2.0x defense-ignoring',
    },
    {
        id: 'arc_t4', nameKr: '화살비', nameEn: 'Arrow Rain',
        classId: 'archer', tier: 4, mpCost: 16,
        type: 'aoe', element: 'physical', power: 1.5,
        range: 5, aoeRadius: 2, icon: '🌧️',
        descKr: '화살비! 넓은 범위 1.5배 피해',
        descEn: 'Arrow rain! Wide AoE 1.5x damage',
    },
    {
        id: 'arc_t5', nameKr: '궁극사격', nameEn: 'Ultimate Shot',
        classId: 'archer', tier: 5, mpCost: 20,
        type: 'damage', element: 'physical', power: 2.8,
        range: 6, aoeRadius: 0, icon: '💫',
        descKr: '초장거리 궁극 사격 2.8배 피해',
        descEn: 'Ultra-range 2.8x ultimate shot',
    },
    {
        id: 'arc_t6', nameKr: '폭렬화살', nameEn: 'Explosive Arrow',
        classId: 'archer', tier: 6, mpCost: 24,
        type: 'aoe', element: 'fire', power: 2.2,
        range: 5, aoeRadius: 1, icon: '💥',
        descKr: '폭발하는 화살 범위 2.2배 피해',
        descEn: 'Explosive arrow AoE 2.2x damage',
    },
    {
        id: 'arc_t7', nameKr: '천공사격', nameEn: 'Celestial Shot',
        classId: 'archer', tier: 7, mpCost: 30,
        type: 'damage', element: 'physical', power: 4.0,
        range: 7, aoeRadius: 0, icon: '☄️',
        descKr: '하늘을 뚫는 4배 궁극 사격!',
        descEn: 'Celestial shot! 4x ultimate damage',
    },
];

// ═══════════════════════════════════════════════════════════
//  힐러마스터 Branch
// ═══════════════════════════════════════════════════════════

// ─── 승려 (Cleric) ───
const CLERIC_SKILLS: Skill[] = [
    {
        id: 'cle_t1', nameKr: '힐', nameEn: 'Heal',
        classId: 'cleric', tier: 1, mpCost: 6,
        type: 'heal', element: 'holy', power: 1.5,
        range: 0, aoeRadius: 0, icon: '💚',
        descKr: 'HP를 1.5배 마공만큼 회복',
        descEn: 'Restore HP by 1.5x magic attack',
    },
    {
        id: 'cle_t2', nameKr: '미드힐', nameEn: 'Mid Heal',
        classId: 'cleric', tier: 2, mpCost: 10,
        type: 'heal', element: 'holy', power: 2.0,
        range: 0, aoeRadius: 0, icon: '💖',
        descKr: 'HP를 2배 마공만큼 회복',
        descEn: 'Restore HP by 2x magic attack',
    },
    {
        id: 'cle_t3', nameKr: '큐어', nameEn: 'Cure',
        classId: 'cleric', tier: 3, mpCost: 14,
        type: 'heal', element: 'holy', power: 2.5,
        range: 0, aoeRadius: 0, icon: '✨',
        descKr: 'HP를 2.5배 마공만큼 대회복',
        descEn: 'Major HP restore, 2.5x magic attack',
    },
    {
        id: 'cle_life_prayer', nameKr: '생명의 기도', nameEn: 'Life Prayer',
        classId: 'cleric', tier: 3, mpCost: 12,
        type: 'buff', element: 'holy', power: 0.08,
        range: 0, aoeRadius: 0, icon: '🍀',
        descKr: '반경 1 아군에게 3턴 재생 부여',
        descEn: 'Grant regen to allies within radius 1 for 3 turns',
        buffStat: 'regen', buffDuration: 3,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 1,
        skillGroup: 'classAura',
    },
    {
        id: 'cle_t4', nameKr: '하이큐어', nameEn: 'High Cure',
        classId: 'cleric', tier: 4, mpCost: 18,
        type: 'heal', element: 'holy', power: 3.0,
        range: 0, aoeRadius: 0, icon: '🌟',
        descKr: 'HP를 3배 마공만큼 대회복',
        descEn: 'Full HP restore, 3x magic attack',
    },
    {
        id: 'cle_t5', nameKr: '풀큐어', nameEn: 'Full Cure',
        classId: 'cleric', tier: 5, mpCost: 24,
        type: 'heal', element: 'holy', power: 5.0,
        range: 0, aoeRadius: 0, icon: '💛',
        descKr: 'HP를 거의 전부 회복',
        descEn: 'Restore nearly all HP',
    },
    {
        id: 'cle_t6', nameKr: '리저렉션', nameEn: 'Resurrection',
        classId: 'cleric', tier: 6, mpCost: 30,
        type: 'heal', element: 'holy', power: 999,
        range: 0, aoeRadius: 0, icon: '🕊️',
        descKr: 'HP를 완전히 회복',
        descEn: 'Fully restore HP',
    },
    {
        id: 'cle_healing_bell', nameKr: '회복의 종소리', nameEn: 'Healing Bell',
        classId: 'cleric', tier: 6, mpCost: 24,
        type: 'buff', element: 'holy', power: 1.15,
        range: 0, aoeRadius: 0, icon: '🔔',
        descKr: '반경 2 아군에게 3턴 재생과 방어력 증가 부여',
        descEn: 'Grant regen and DEF to allies within radius 2 for 3 turns',
        buffStat: 'def', buffDuration: 3,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 2,
        skillGroup: 'classAura',
    },
    {
        id: 'cle_t7', nameKr: '신의축복', nameEn: 'God\'s Blessing',
        classId: 'cleric', tier: 7, mpCost: 35,
        type: 'heal', element: 'holy', power: 999,
        range: 0, aoeRadius: 0, icon: '👼',
        descKr: 'HP/MP 전부 회복',
        descEn: 'Fully restore HP and MP',
    },
];

// ─── 신관 (Priest) ───
const PRIEST_SKILLS: Skill[] = [
    {
        id: 'pri_t1', nameKr: '실드', nameEn: 'Shield',
        classId: 'priest', tier: 1, mpCost: 6,
        type: 'buff', element: 'holy', power: 1.2,
        range: 0, aoeRadius: 0, icon: '🛡️',
        descKr: '방어력 20% 증가 (3턴)',
        descEn: 'DEF +20% for 3 turns',
        buffStat: 'def', buffDuration: 3
    },
    {
        id: 'pri_t2', nameKr: '버프', nameEn: 'Enhance',
        classId: 'priest', tier: 2, mpCost: 8,
        type: 'buff', element: 'holy', power: 1.15,
        range: 0, aoeRadius: 0, icon: '⬆️',
        descKr: '공격력/방어력 15% 증가 (3턴)',
        descEn: 'ATK/DEF +15% for 3 turns',
        buffStat: 'all', buffDuration: 3
    },
    {
        id: 'pri_t3', nameKr: '퀵', nameEn: 'Quick',
        classId: 'priest', tier: 3, mpCost: 10,
        type: 'buff', element: 'holy', power: 1.3,
        range: 0, aoeRadius: 0, icon: '⚡',
        descKr: '속도 30% 증가 (3턴)',
        descEn: 'SPD +30% for 3 turns',
        buffStat: 'spd', buffDuration: 3
    },
    {
        id: 'pri_battle_chant', nameKr: '전투성가', nameEn: 'Battle Chant',
        classId: 'priest', tier: 3, mpCost: 14,
        type: 'buff', element: 'holy', power: 1.15,
        range: 0, aoeRadius: 0, icon: '🎵',
        descKr: '반경 2 아군에게 3턴 공격력/방어력 증가 부여',
        descEn: 'Grant ATK/DEF to allies within radius 2 for 3 turns',
        buffStat: 'all', buffDuration: 3,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 2,
        skillGroup: 'classAura',
    },
    {
        id: 'pri_t4', nameKr: '프로텍트', nameEn: 'Protect',
        classId: 'priest', tier: 4, mpCost: 14,
        type: 'buff', element: 'holy', power: 1.3,
        range: 0, aoeRadius: 0, icon: '🔰',
        descKr: '방어력 30% 증가 (5턴)',
        descEn: 'DEF +30% for 5 turns',
        buffStat: 'def', buffDuration: 5
    },
    {
        id: 'pri_t5', nameKr: '하이프로텍트', nameEn: 'High Protect',
        classId: 'priest', tier: 5, mpCost: 18,
        type: 'buff', element: 'holy', power: 1.5,
        range: 0, aoeRadius: 0, icon: '🛡️',
        descKr: '방어력 50% 증가 (5턴)',
        descEn: 'DEF +50% for 5 turns',
        buffStat: 'def', buffDuration: 5
    },
    {
        id: 'pri_t6', nameKr: '세인트가드', nameEn: 'Saint Guard',
        classId: 'priest', tier: 6, mpCost: 24,
        type: 'buff', element: 'holy', power: 2.0,
        range: 0, aoeRadius: 0, icon: '✝️',
        descKr: '물리/마법 방어 대폭 증가 (5턴)',
        descEn: 'Massive DEF/MDEF boost for 5 turns',
        buffStat: 'mdef', buffDuration: 5
    },
    {
        id: 'pri_victory_prayer', nameKr: '승전기도', nameEn: 'Victory Prayer',
        classId: 'priest', tier: 6, mpCost: 26,
        type: 'buff', element: 'holy', power: 1.25,
        range: 0, aoeRadius: 0, icon: '✦',
        descKr: '반경 2 아군에게 2턴 공격력과 치명 증가 부여',
        descEn: 'Grant ATK and critical chance to allies within radius 2 for 2 turns',
        buffStat: 'atk', buffDuration: 2,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 2,
        skillGroup: 'classCommand',
    },
    {
        id: 'pri_t7', nameKr: '홀리오라', nameEn: 'Holy Aura',
        classId: 'priest', tier: 7, mpCost: 30,
        type: 'buff', element: 'holy', power: 1.5,
        range: 0, aoeRadius: 0, icon: '🌈',
        descKr: '모든 스탯 50% 증가 (5턴)',
        descEn: 'All stats +50% for 5 turns',
        buffStat: 'all', buffDuration: 5
    },
];

// ─── 무녀 (Shrine Maiden) ───
const SHRINE_SKILLS: Skill[] = [
    {
        id: 'shr_t1', nameKr: '정화', nameEn: 'Purify',
        classId: 'shrine', tier: 1, mpCost: 5,
        type: 'heal', element: 'holy', power: 1.0,
        range: 0, aoeRadius: 0, icon: '🌸',
        descKr: 'HP 소량 회복 + 상태이상 해제',
        descEn: 'Minor heal + cleanse debuffs',
    },
    {
        id: 'shr_t2', nameKr: '재생', nameEn: 'Regenerate',
        classId: 'shrine', tier: 2, mpCost: 8,
        type: 'buff', element: 'holy', power: 1.0,
        range: 0, aoeRadius: 0, icon: '🍀',
        descKr: '매 턴 HP 자동회복 (5턴)',
        descEn: 'HP regen per turn for 5 turns',
        buffStat: 'regen', buffDuration: 5
    },
    {
        id: 'shr_t3', nameKr: '결계', nameEn: 'Barrier',
        classId: 'shrine', tier: 3, mpCost: 12,
        type: 'buff', element: 'holy', power: 1.3,
        range: 0, aoeRadius: 0, icon: '🔮',
        descKr: '마법 방어 30% 증가 + 피해 감소',
        descEn: 'MDEF +30% + damage reduction',
        buffStat: 'mdef', buffDuration: 3
    },
    {
        id: 'shr_guardian_aura', nameKr: '수호오라', nameEn: 'Guardian Aura',
        classId: 'shrine', tier: 3, mpCost: 14,
        type: 'buff', element: 'holy', power: 1.2,
        range: 0, aoeRadius: 0, icon: '🔰',
        descKr: '반경 2 아군에게 3턴 마법 저항과 피해 감소 부여',
        descEn: 'Grant resistance and damage reduction to allies within radius 2 for 3 turns',
        buffStat: 'mdef', buffDuration: 3,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 2,
        skillGroup: 'classAura',
    },
    {
        id: 'shr_t4', nameKr: '신무', nameEn: 'Sacred Dance',
        classId: 'shrine', tier: 4, mpCost: 14,
        type: 'damage', element: 'holy', power: 2.0,
        range: 1, aoeRadius: 0, icon: '💃',
        descKr: '신성한 춤으로 2.0배 성속성 피해',
        descEn: 'Sacred dance, 2.0x holy damage',
    },
    {
        id: 'shr_t5', nameKr: '대결계', nameEn: 'Grand Barrier',
        classId: 'shrine', tier: 5, mpCost: 20,
        type: 'buff', element: 'holy', power: 1.5,
        range: 0, aoeRadius: 0, icon: '🛡️',
        descKr: '강력한 결계: 모든 피해 50% 감소',
        descEn: 'Grand barrier: 50% damage reduction',
        buffStat: 'def', buffDuration: 5
    },
    {
        id: 'shr_t6', nameKr: '퇴마봉인', nameEn: 'Exorcism Seal',
        classId: 'shrine', tier: 6, mpCost: 24,
        type: 'damage', element: 'holy', power: 3.0,
        range: 2, aoeRadius: 0, icon: '📿',
        descKr: '퇴마 봉인! 언데드에 3배 피해',
        descEn: 'Exorcism! 3x damage vs undead',
    },
    {
        id: 'shr_sanctuary_dance', nameKr: '성역무도', nameEn: 'Sanctuary Dance',
        classId: 'shrine', tier: 6, mpCost: 26,
        type: 'buff', element: 'holy', power: 1.25,
        range: 0, aoeRadius: 0, icon: '💃',
        descKr: '반경 2 아군에게 4턴 재생과 마법 저항 증가 부여',
        descEn: 'Grant regen and resistance to allies within radius 2 for 4 turns',
        buffStat: 'mdef', buffDuration: 4,
        targetScope: 'selfAndNearbyAllies',
        allyRadius: 2,
        skillGroup: 'classAura',
    },
    {
        id: 'shr_t7', nameKr: '신녀의기도', nameEn: 'Maiden\'s Prayer',
        classId: 'shrine', tier: 7, mpCost: 30,
        type: 'heal', element: 'holy', power: 999,
        range: 0, aoeRadius: 0, icon: '🙏',
        descKr: 'HP/MP 완전 회복 + 전 버프',
        descEn: 'Full HP/MP restore + all buffs',
    },
];

// ═══════════════════════════════════════════════════════════
//  매직마스터 Branch
// ═══════════════════════════════════════════════════════════

// ─── 마법사 (Mage) ───
const MAGE_SKILLS: Skill[] = [
    {
        id: 'mag_t1', nameKr: '파이어', nameEn: 'Fire',
        classId: 'mage', tier: 1, mpCost: 6,
        type: 'damage', element: 'fire', power: 1.5,
        range: 3, aoeRadius: 0, icon: '🔥',
        descKr: '화염 마법 1.5배 마법 피해',
        descEn: 'Fire magic, 1.5x magic damage',
    },
    {
        id: 'mag_t2', nameKr: '블리자드', nameEn: 'Blizzard',
        classId: 'mage', tier: 2, mpCost: 9,
        type: 'damage', element: 'ice', power: 1.7,
        range: 3, aoeRadius: 0, icon: '❄️',
        descKr: '빙결 마법 1.7배 마법 피해',
        descEn: 'Blizzard magic, 1.7x magic damage',
    },
    {
        id: 'mag_t3', nameKr: '썬더', nameEn: 'Thunder',
        classId: 'mage', tier: 3, mpCost: 12,
        type: 'damage', element: 'lightning', power: 2.0,
        range: 3, aoeRadius: 0, icon: '⚡',
        descKr: '번개 마법 2.0배 마법 피해',
        descEn: 'Thunder magic, 2.0x magic damage',
    },
    {
        id: 'mag_t4', nameKr: '파이가', nameEn: 'Firaga',
        classId: 'mage', tier: 4, mpCost: 16,
        type: 'aoe', element: 'fire', power: 2.0,
        range: 3, aoeRadius: 1, icon: '🔥',
        descKr: '상위 화염! 범위 2.0배 화속성 피해',
        descEn: 'Firaga! AoE 2.0x fire damage',
    },
    {
        id: 'mag_t5', nameKr: '블리자가', nameEn: 'Blizzaga',
        classId: 'mage', tier: 5, mpCost: 22,
        type: 'aoe', element: 'ice', power: 2.3,
        range: 3, aoeRadius: 1, icon: '❄️',
        descKr: '상위 빙결! 범위 2.3배 빙속성 피해',
        descEn: 'Blizzaga! AoE 2.3x ice damage',
    },
    {
        id: 'mag_t6', nameKr: '썬다가', nameEn: 'Thundaga',
        classId: 'mage', tier: 6, mpCost: 26,
        type: 'aoe', element: 'lightning', power: 2.6,
        range: 3, aoeRadius: 1, icon: '⚡',
        descKr: '상위 번개! 범위 2.6배 뇌속성 피해',
        descEn: 'Thundaga! AoE 2.6x lightning damage',
    },
    {
        id: 'mag_t7', nameKr: '메테오', nameEn: 'Meteor',
        classId: 'mage', tier: 7, mpCost: 35,
        type: 'aoe', element: 'fire', power: 3.5,
        range: 4, aoeRadius: 2, icon: '☄️',
        descKr: '메테오! 광범위 3.5배 궁극 마법!',
        descEn: 'Meteor! Wide AoE 3.5x ultimate magic!',
    },
];

// ─── 사교 (Cultist) ───
const CULTIST_SKILLS: Skill[] = [
    {
        id: 'cul_t1', nameKr: '다크볼트', nameEn: 'Dark Bolt',
        classId: 'cultist', tier: 1, mpCost: 6,
        type: 'damage', element: 'dark', power: 1.5,
        range: 3, aoeRadius: 0, icon: '🌑',
        descKr: '어둠의 화살 1.5배 암속성 피해',
        descEn: 'Dark bolt, 1.5x dark damage',
    },
    {
        id: 'cul_t2', nameKr: '커스', nameEn: 'Curse',
        classId: 'cultist', tier: 2, mpCost: 8,
        type: 'debuff', element: 'dark', power: 0.8,
        range: 3, aoeRadius: 0, icon: '💀',
        descKr: '적에게 저주: 공격/방어 20% 감소',
        descEn: 'Curse enemy: ATK/DEF -20%',
    },
    {
        id: 'cul_t3', nameKr: '드레인', nameEn: 'Drain',
        classId: 'cultist', tier: 3, mpCost: 12,
        type: 'damage', element: 'dark', power: 1.5,
        range: 3, aoeRadius: 0, icon: '🧛',
        descKr: 'HP를 흡수하는 1.5배 피해',
        descEn: 'HP draining 1.5x dark damage',
    },
    {
        id: 'cul_t4', nameKr: '다크플레어', nameEn: 'Dark Flare',
        classId: 'cultist', tier: 4, mpCost: 16,
        type: 'aoe', element: 'dark', power: 2.0,
        range: 3, aoeRadius: 1, icon: '🔥',
        descKr: '암흑 화염 범위 2.0배 피해',
        descEn: 'Dark flare AoE 2.0x damage',
    },
    {
        id: 'cul_t5', nameKr: '데스클라우드', nameEn: 'Death Cloud',
        classId: 'cultist', tier: 5, mpCost: 22,
        type: 'aoe', element: 'dark', power: 2.2,
        range: 3, aoeRadius: 2, icon: '☁️',
        descKr: '죽음의 구름 범위 2.2배 피해',
        descEn: 'Death cloud AoE 2.2x damage',
    },
    {
        id: 'cul_t6', nameKr: '암흑폭풍', nameEn: 'Dark Storm',
        classId: 'cultist', tier: 6, mpCost: 26,
        type: 'aoe', element: 'dark', power: 2.8,
        range: 3, aoeRadius: 2, icon: '🌪️',
        descKr: '암흑 폭풍 범위 2.8배 피해',
        descEn: 'Dark storm AoE 2.8x damage',
    },
    {
        id: 'cul_t7', nameKr: '카오스', nameEn: 'Chaos',
        classId: 'cultist', tier: 7, mpCost: 35,
        type: 'aoe', element: 'dark', power: 3.5,
        range: 4, aoeRadius: 2, icon: '🕳️',
        descKr: '카오스! 광범위 3.5배 암흑 궁극마법',
        descEn: 'Chaos! Wide AoE 3.5x ultimate dark magic',
    },
];

// ─── 연금술사 (Alchemist) ───
const ALCHEMIST_SKILLS: Skill[] = [
    {
        id: 'alc_t1', nameKr: '산탄', nameEn: 'Scatter Shot',
        classId: 'alchemist', tier: 1, mpCost: 5,
        type: 'damage', element: 'earth', power: 1.4,
        range: 2, aoeRadius: 0, icon: '💣',
        descKr: '연금 산탄 1.4배 피해',
        descEn: 'Alchemy scatter, 1.4x damage',
    },
    {
        id: 'alc_t2', nameKr: '독안개', nameEn: 'Poison Fog',
        classId: 'alchemist', tier: 2, mpCost: 8,
        type: 'debuff', element: 'earth', power: 0.5,
        range: 2, aoeRadius: 1, icon: '☠️',
        descKr: '독안개: 적에게 지속 피해',
        descEn: 'Poison fog: damage over time',
    },
    {
        id: 'alc_t3', nameKr: '폭발물', nameEn: 'Explosive',
        classId: 'alchemist', tier: 3, mpCost: 12,
        type: 'aoe', element: 'fire', power: 1.8,
        range: 2, aoeRadius: 1, icon: '💥',
        descKr: '연금술 폭발물 범위 1.8배 피해',
        descEn: 'Alchemical explosive AoE 1.8x damage',
    },
    {
        id: 'alc_t4', nameKr: '에테르변환', nameEn: 'Ether Convert',
        classId: 'alchemist', tier: 4, mpCost: 0,
        type: 'heal', element: 'none', power: 2.0,
        range: 0, aoeRadius: 0, icon: '🧪',
        descKr: 'HP를 소비하여 MP를 회복',
        descEn: 'Convert HP to restore MP',
    },
    {
        id: 'alc_t5', nameKr: '황금연성', nameEn: 'Gold Transmute',
        classId: 'alchemist', tier: 5, mpCost: 18,
        type: 'damage', element: 'earth', power: 2.5,
        range: 2, aoeRadius: 0, icon: '✨',
        descKr: '황금 연성 2.5배 피해',
        descEn: 'Gold transmutation 2.5x damage',
    },
    {
        id: 'alc_t6', nameKr: '현자의물약', nameEn: 'Sage Potion',
        classId: 'alchemist', tier: 6, mpCost: 20,
        type: 'heal', element: 'none', power: 3.0,
        range: 0, aoeRadius: 0, icon: '🧪',
        descKr: '현자의 물약: HP/MP 대량 회복',
        descEn: 'Sage potion: major HP/MP restore',
    },
    {
        id: 'alc_t7', nameKr: '대연성', nameEn: 'Grand Transmute',
        classId: 'alchemist', tier: 7, mpCost: 30,
        type: 'aoe', element: 'earth', power: 3.5,
        range: 3, aoeRadius: 2, icon: '⚗️',
        descKr: '대연성! 광범위 3.5배 연금술 궁극기',
        descEn: 'Grand transmute! Wide AoE 3.5x damage',
    },
];

// ═══════════════════════════════════════════════════════════
//  원작 닥세월드 공용 마법 (Original Sin Eater Shared Magic)
//  classId = 'shared' — 클래스별 습득은 ClassTree.skillUnlocks로 관리
// ═══════════════════════════════════════════════════════════

const ORIGINAL_MAGIC: Skill[] = [
    // ── 공격 마법 (Damage) ──
    {
        id: 'og_fireball', nameKr: '파이어볼', nameEn: 'Fireball',
        classId: 'shared', tier: 1, mpCost: 5,
        type: 'damage', element: 'fire', power: 1.3,
        range: 3, aoeRadius: 0, icon: '🔥',
        descKr: '화염 구체를 발사하여 적에게 화속성 피해',
        descEn: 'Launch a fireball dealing fire damage',
    },
    {
        id: 'og_fire', nameKr: '파이어', nameEn: 'Fire',
        classId: 'shared', tier: 4, mpCost: 12,
        type: 'damage', element: 'fire', power: 2.0,
        range: 3, aoeRadius: 0, icon: '🔥',
        descKr: '강력한 화염 마법으로 적에게 큰 피해',
        descEn: 'Powerful fire magic dealing heavy damage',
    },
    {
        id: 'og_freeze', nameKr: '프리즈', nameEn: 'Freeze',
        classId: 'shared', tier: 1, mpCost: 5,
        type: 'damage', element: 'ice', power: 1.3,
        range: 3, aoeRadius: 0, icon: '❄️',
        descKr: '적을 얼려 빙속성 피해 + 속도 감소',
        descEn: 'Freeze enemy: ice damage + speed down',
    },
    {
        id: 'og_thunder', nameKr: '썬더', nameEn: 'Thunder',
        classId: 'shared', tier: 2, mpCost: 5,
        type: 'damage', element: 'lightning', power: 1.6,
        range: 3, aoeRadius: 0, icon: '⚡',
        descKr: '번개를 떨어뜨려 뇌속성 피해',
        descEn: 'Call lightning bolt dealing thunder damage',
    },
    {
        id: 'og_windcutter', nameKr: '윈드커터', nameEn: 'Wind Cutter',
        classId: 'shared', tier: 2, mpCost: 5,
        type: 'damage', element: 'wind', power: 1.5,
        range: 3, aoeRadius: 0, icon: '🌀',
        descKr: '진공의 칼날로 풍속성 피해',
        descEn: 'Wind blade dealing wind damage',
    },
    {
        id: 'og_poison', nameKr: '포이즌', nameEn: 'Poison',
        classId: 'shared', tier: 2, mpCost: 6,
        type: 'debuff', element: 'earth', power: 0.7,
        range: 3, aoeRadius: 0, icon: '☠️',
        descKr: '독을 주입하여 매턴 피해 + 공격력 감소',
        descEn: 'Poison: DoT + ATK reduction',
    },

    // ── 범위 공격 마법 (AoE) ──
    {
        id: 'og_blizzard', nameKr: '블리자드', nameEn: 'Blizzard',
        classId: 'shared', tier: 3, mpCost: 14,
        type: 'aoe', element: 'ice', power: 1.6,
        range: 3, aoeRadius: 1, icon: '🌨️',
        descKr: '눈보라를 일으켜 범위 빙속성 피해',
        descEn: 'Blizzard: AoE ice damage',
    },
    {
        id: 'og_thunderstorm', nameKr: '썬더스톰', nameEn: 'Thunderstorm',
        classId: 'shared', tier: 4, mpCost: 18,
        type: 'aoe', element: 'lightning', power: 1.8,
        range: 3, aoeRadius: 1, icon: '⛈️',
        descKr: '뇌폭풍을 일으켜 범위 뇌속성 피해',
        descEn: 'Thunderstorm: AoE lightning damage',
    },
    {
        id: 'og_tornado', nameKr: '토네이도', nameEn: 'Tornado',
        classId: 'shared', tier: 5, mpCost: 20,
        type: 'aoe', element: 'wind', power: 2.0,
        range: 3, aoeRadius: 1, icon: '🌪️',
        descKr: '거대한 회오리바람으로 범위 풍속성 피해',
        descEn: 'Tornado: AoE wind damage',
    },
    {
        id: 'og_earthquake', nameKr: '어스퀘이크', nameEn: 'Earthquake',
        classId: 'shared', tier: 5, mpCost: 22,
        type: 'aoe', element: 'earth', power: 2.2,
        range: 3, aoeRadius: 2, icon: '🌋',
        descKr: '대지를 흔들어 넓은 범위 지속성 피해',
        descEn: 'Earthquake: wide AoE earth damage',
    },
    {
        id: 'og_meteor', nameKr: '메테오', nameEn: 'Meteor',
        classId: 'shared', tier: 7, mpCost: 35,
        type: 'aoe', element: 'fire', power: 3.5,
        range: 4, aoeRadius: 2, icon: '☄️',
        descKr: '메테오! 광범위 최강 화속성 마법',
        descEn: 'Meteor! Ultimate wide AoE fire magic',
    },

    // ── 회복 마법 (Heal) ──
    {
        id: 'og_heal', nameKr: '힐', nameEn: 'Heal',
        classId: 'shared', tier: 1, mpCost: 5,
        type: 'heal', element: 'holy', power: 1.5,
        range: 0, aoeRadius: 0, icon: '💚',
        descKr: 'HP를 마공의 1.5배만큼 회복',
        descEn: 'Restore HP by 1.5x magic attack',
    },
    {
        id: 'og_forceheal', nameKr: '포스힐', nameEn: 'Force Heal',
        classId: 'shared', tier: 5, mpCost: 18,
        type: 'heal', element: 'holy', power: 3.0,
        range: 0, aoeRadius: 0, icon: '💛',
        descKr: 'HP를 마공의 3배만큼 대량 회복',
        descEn: 'Restore HP by 3x magic attack',
    },
    {
        id: 'og_cure', nameKr: '큐어', nameEn: 'Cure',
        classId: 'shared', tier: 3, mpCost: 10,
        type: 'heal', element: 'holy', power: 2.0,
        range: 0, aoeRadius: 0, icon: '✨',
        descKr: 'HP 회복 + 상태이상 해제',
        descEn: 'Restore HP + cleanse debuffs',
    },

    // ── 버프 마법 (Buff) ──
    {
        id: 'og_attack', nameKr: '어택', nameEn: 'Attack Up',
        classId: 'shared', tier: 2, mpCost: 7,
        type: 'buff', element: 'none', power: 1.3,
        range: 0, aoeRadius: 0, icon: '⚔️',
        descKr: '공격력 30% 증가 (4턴)',
        descEn: 'ATK +30% for 4 turns',
        buffStat: 'atk', buffDuration: 4
    },
    {
        id: 'og_protection', nameKr: '프로텍션', nameEn: 'Protection',
        classId: 'shared', tier: 2, mpCost: 7,
        type: 'buff', element: 'none', power: 1.3,
        range: 0, aoeRadius: 0, icon: '🛡️',
        descKr: '방어력 30% 증가 (4턴)',
        descEn: 'DEF +30% for 4 turns',
        buffStat: 'def', buffDuration: 4
    },
    {
        id: 'og_quick', nameKr: '퀵', nameEn: 'Quick',
        classId: 'shared', tier: 4, mpCost: 10,
        type: 'buff', element: 'none', power: 1.4,
        range: 0, aoeRadius: 0, icon: '💨',
        descKr: '속도 40% 증가 (4턴)',
        descEn: 'SPD +40% for 4 turns',
        buffStat: 'spd', buffDuration: 4
    },
    {
        id: 'og_resist', nameKr: '레지스트', nameEn: 'Resist',
        classId: 'shared', tier: 5, mpCost: 12,
        type: 'buff', element: 'none', power: 1.4,
        range: 0, aoeRadius: 0, icon: '🔰',
        descKr: '마법 방어 40% 증가 (4턴)',
        descEn: 'MDEF +40% for 4 turns',
        buffStat: 'mdef', buffDuration: 4
    },

    // ── 디버프/특수 마법 ──
    {
        id: 'og_slow', nameKr: '슬로우', nameEn: 'Slow',
        classId: 'shared', tier: 4, mpCost: 8,
        type: 'debuff', element: 'none', power: 0.6,
        range: 3, aoeRadius: 0, icon: '🐌',
        descKr: '적의 속도를 40% 감소시킨다',
        descEn: 'Reduce enemy SPD by 40%',
    },
    {
        id: 'og_demove', nameKr: '디무브', nameEn: 'De-Move',
        classId: 'shared', tier: 4, mpCost: 8,
        type: 'debuff', element: 'none', power: 0.5,
        range: 3, aoeRadius: 0, icon: '🚫',
        descKr: '적의 이동력을 대폭 감소',
        descEn: 'Greatly reduce enemy movement',
    },
    {
        id: 'og_deattack', nameKr: '디어택', nameEn: 'De-Attack',
        classId: 'shared', tier: 2, mpCost: 7,
        type: 'debuff', element: 'none', power: 0.7,
        range: 3, aoeRadius: 0, icon: '⬇️',
        descKr: '적의 공격력을 30% 감소',
        descEn: 'Reduce enemy ATK by 30%',
    },
    {
        id: 'og_mute', nameKr: '뮤트', nameEn: 'Mute',
        classId: 'shared', tier: 5, mpCost: 14,
        type: 'debuff', element: 'none', power: 0.0,
        range: 3, aoeRadius: 0, icon: '🔇',
        descKr: '적의 마법 사용을 봉인 (3턴간 마공 0)',
        descEn: 'Seal enemy magic for 3 turns',
    },
    {
        id: 'og_antiresist', nameKr: '앤티레지스트', nameEn: 'Anti-Resist',
        classId: 'shared', tier: 4, mpCost: 10,
        type: 'debuff', element: 'none', power: 0.5,
        range: 3, aoeRadius: 0, icon: '💔',
        descKr: '적의 마법 방어를 50% 감소',
        descEn: 'Reduce enemy MDEF by 50%',
    },

    // ── 드레인 마법 ──
    {
        id: 'og_hpdrain', nameKr: 'HP드레인', nameEn: 'HP Drain',
        classId: 'shared', tier: 6, mpCost: 16,
        type: 'damage', element: 'dark', power: 1.8,
        range: 3, aoeRadius: 0, icon: '🧛',
        descKr: '적의 HP를 빨아들여 자신의 HP로 전환',
        descEn: 'Drain enemy HP and restore own HP',
    },
    {
        id: 'og_mpdrain', nameKr: 'MP드레인', nameEn: 'MP Drain',
        classId: 'shared', tier: 3, mpCost: 0,
        type: 'damage', element: 'dark', power: 1.0,
        range: 3, aoeRadius: 0, icon: '💜',
        descKr: '적의 MP를 빨아들여 자신의 MP로 전환',
        descEn: 'Drain enemy MP and restore own MP',
    },
];

// ═══════════════════════════════════════════════════════════
//  All Skills Combined
// ═══════════════════════════════════════════════════════════

export const ALL_SKILLS: Skill[] = [
    ...INFANTRY_SKILLS,
    ...CAVALRY_SKILLS,
    ...FLYING_SKILLS,
    ...NAVAL_SKILLS,
    ...LANCER_SKILLS,
    ...ARCHER_SKILLS,
    ...CLERIC_SKILLS,
    ...PRIEST_SKILLS,
    ...SHRINE_SKILLS,
    ...MAGE_SKILLS,
    ...CULTIST_SKILLS,
    ...ALCHEMIST_SKILLS,
    ...ORIGINAL_MAGIC,
];

/** Get all skills for a specific class */
export function getSkillsForClass(classId: string): Skill[] {
    return ALL_SKILLS.filter(s => s.classId === classId);
}

/** Resolve the display/behavior group for old and new skills. */
export function getSkillGroup(skill: Skill): SkillGroup {
    if (skill.skillGroup) return skill.skillGroup;
    return skill.classId === 'shared' ? 'commonMagic' : 'classSkill';
}

/**
 * Get skills that a character has learned (class-specific + shared original magic).
 * Shared magic is resolved via ClassTree.skillUnlocks.
 */
export function getLearnedSkills(classId: string, characterTier: number, unlockedSkillIds?: string[]): Skill[] {
    // Class-specific skills (filtered by classId and tier)
    const classSkills = ALL_SKILLS.filter(s => s.classId === classId && s.tier <= characterTier);

    // Shared original magic (resolved from ClassTree.skillUnlocks)
    if (unlockedSkillIds && unlockedSkillIds.length > 0) {
        const sharedSkills = ALL_SKILLS.filter(
            s => s.classId === 'shared' && unlockedSkillIds.includes(s.id)
        );
        return [...classSkills, ...sharedSkills];
    }

    return classSkills;
}

/** Lookup a single skill by ID */
export function getSkill(id: string): Skill | undefined {
    return ALL_SKILLS.find(s => s.id === id);
}
