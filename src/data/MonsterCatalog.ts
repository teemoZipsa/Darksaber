import type { EnemyRole } from '../field/EnemyAI';

/** Broad creature family — drives region/biome spawn affinity in the spawn resolver. */
export type MonsterFamily =
    | 'human'
    | 'undead'
    | 'beast'
    | 'beastfolk'
    | 'demon'
    | 'giant'
    | 'reptile'
    | 'fae';

export interface MonsterDefinition {
    id: MonsterId;
    name: string;
    /** Optional i18n key; when present UI may prefer it over `name`. */
    nameKey?: string;
    sprite: string;
    role: EnemyRole;
    /** Base level — the monster's intrinsic level before region adjustment. */
    level: number;
    /** Allowed level range [min, max]; region danger nudges spawn level within this band. */
    levelBand: [number, number];
    family: MonsterFamily;
    /** Biome/region affinity tags consumed by the spawn resolver. */
    spawnTags: string[];
    color: string;
    frameSize: number;
    frameCount: number;
    framesPerSecond: number;
    renderScale: number;
    aggroRange: number;
}

export const MONSTER_SPRITE_PATH = '/assets/images/monsters';
export const MONSTER_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    right: 2,
    left: 3,
};
export const MONSTER_FRAME_COUNT = 3;
export const MONSTER_FPS = 8;
export const BURGOS_CASTLE_DUNGEON_ID = 'burgos_castle';
export const BURGOS_BOSS_MONSTER_ID = 'burgos_wolf_boss';
export const BURGOS_LEGACY_BOSS_MONSTER_ID = '701R';
export const BURGOS_GUARD_MONSTER_ID = '303R';
export const ZAMORA_FORTRESS_DUNGEON_ID = 'zamora_fortress';
export const ZAMORA_FENRIS_BOSS_MONSTER_ID = 'zamora_fenris_boss';
export const ZAMORA_GUARD_MONSTER_ID = '434R';

/** Original field roster kept stable for catalog compatibility and server fallback pools. */
export const GENERAL_MONSTER_IDS = [
    '302R',
    '303R',
    '304R',
    '305R',
    '307R',
    '308R',
    '309R',
    '311R',
    '313R',
    '314R',
    '315R',
    '317R',
    '346R',
    '409R',
    '434R',
    '435R',
] as const;

/** 30 newly added sprites (96x128, 32x32 * 3 frames * 4 facings), normalized to uppercase IDs. */
export const NEW_MONSTER_IDS = [
    '214R', '215R', '216R', '217R', '218R', '219R', '224R', '225R', '226R',
    '353R', '354R', '358R', '362R', '366R', '367R',
    '452R', '453R', '454R', '456R', '458R', '462R', '463R', '466R', '467R',
    '634R', '635R', '636R', '637R', '638R', '639R',
] as const;

/** Original final-scenario demons used only by authored story encounters. */
export const FINAL_STORY_MONSTER_IDS = [
    '729R',
    '730R',
    '731R',
    '732R',
    '733R',
] as const;

/** Renderable legacy sprites kept out of automatic field spawn pools until authored. */
export const RESERVED_RENDERABLE_MONSTER_IDS = [
    '206R',
    '791R',
] as const;

export const MONSTER_IDS = [
    ...GENERAL_MONSTER_IDS,
    ...NEW_MONSTER_IDS,
    ...FINAL_STORY_MONSTER_IDS,
    ...RESERVED_RENDERABLE_MONSTER_IDS,
    BURGOS_BOSS_MONSTER_ID,
    ZAMORA_FENRIS_BOSS_MONSTER_ID,
    BURGOS_LEGACY_BOSS_MONSTER_ID,
] as const;
export type MonsterId = typeof MONSTER_IDS[number];

const commonFrame = {
    frameCount: MONSTER_FRAME_COUNT,
    framesPerSecond: MONSTER_FPS,
};

export const MONSTER_DEFINITIONS: Record<MonsterId, MonsterDefinition> = {
    '206R': {
        id: '206R', name: '인펀트리B', sprite: '206R.png', role: 'tank',
        level: 3, levelBand: [2, 5], family: 'human', spawnTags: ['grass', 'castle'],
        color: '#c4875a', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },

    '302R': {
        id: '302R', name: '스켈레톤 궁수', sprite: '302R.png', role: 'archer',
        level: 2, levelBand: [1, 4], family: 'undead', spawnTags: ['cave', 'stone', 'grass'],
        color: '#d4c4cc', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '303R': {
        id: '303R', name: '부르고스 경비병', sprite: '303R.png', role: 'bruiser',
        level: 2, levelBand: [1, 4], family: 'human', spawnTags: ['grass', 'castle'],
        color: '#d98a5a', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '304R': {
        id: '304R', name: '쥐인간 전사', sprite: '304R.png', role: 'bruiser',
        level: 1, levelBand: [1, 3], family: 'beastfolk', spawnTags: ['grass', 'cave'],
        color: '#7080c8', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '305R': {
        id: '305R', name: '청피 쥐인간', sprite: '305R.png', role: 'tank',
        level: 2, levelBand: [1, 4], family: 'beastfolk', spawnTags: ['grass', 'cave'],
        color: '#706bd8', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '307R': {
        id: '307R', name: '하급 마족', sprite: '307R.png', role: 'healer',
        level: 2, levelBand: [1, 4], family: 'demon', spawnTags: ['cave', 'lava'],
        color: '#8f64c8', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '308R': {
        id: '308R', name: '청피 마족', sprite: '308R.png', role: 'bruiser',
        level: 2, levelBand: [1, 4], family: 'demon', spawnTags: ['cave', 'lava'],
        color: '#7786d8', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '309R': {
        id: '309R', name: '흑익 가고일', sprite: '309R.png', role: 'support',
        level: 3, levelBand: [2, 5], family: 'demon', spawnTags: ['cave', 'stone'],
        color: '#5b6172', frameSize: 32, renderScale: 1.16, aggroRange: 6, ...commonFrame,
    },
    '311R': {
        id: '311R', name: '쥐인간 도적', sprite: '311R.png', role: 'coward',
        level: 1, levelBand: [1, 3], family: 'beastfolk', spawnTags: ['grass', 'cave'],
        color: '#c98632', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '313R': {
        id: '313R', name: '오크 검병', sprite: '313R.png', role: 'bruiser',
        level: 2, levelBand: [1, 4], family: 'beastfolk', spawnTags: ['grass', 'stone'],
        color: '#c77870', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '314R': {
        id: '314R', name: '청피 오크병', sprite: '314R.png', role: 'tank',
        level: 2, levelBand: [1, 4], family: 'beastfolk', spawnTags: ['grass', 'stone'],
        color: '#54b6ce', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '315R': {
        id: '315R', name: '자색 미노타우로스', sprite: '315R.png', role: 'tank',
        level: 3, levelBand: [2, 5], family: 'giant', spawnTags: ['stone', 'cave'],
        color: '#8c50c0', frameSize: 32, renderScale: 1.2, aggroRange: 6, ...commonFrame,
    },
    '317R': {
        id: '317R', name: '미노타우로스', sprite: '317R.png', role: 'tank',
        level: 2, levelBand: [1, 4], family: 'giant', spawnTags: ['stone', 'cave'],
        color: '#c07717', frameSize: 32, renderScale: 1.18, aggroRange: 6, ...commonFrame,
    },
    '346R': {
        id: '346R', name: '초원 늑대', sprite: '346R.png', role: 'bruiser',
        level: 1, levelBand: [1, 3], family: 'beast', spawnTags: ['grass', 'forest'],
        color: '#c57945', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '409R': {
        id: '409R', name: '동굴 박쥐', sprite: '409R.png', role: 'support',
        level: 2, levelBand: [1, 4], family: 'beast', spawnTags: ['cave'],
        color: '#7d6750', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '434R': {
        id: '434R', name: '스켈레톤 전사', sprite: '434R.png', role: 'bruiser',
        level: 2, levelBand: [1, 4], family: 'undead', spawnTags: ['cave', 'stone'],
        color: '#d8c8e8', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '435R': {
        id: '435R', name: '그림자 늑대', sprite: '435R.png', role: 'coward',
        level: 2, levelBand: [1, 4], family: 'beast', spawnTags: ['forest', 'grass'],
        color: '#4d64c8', frameSize: 32, renderScale: 1.12, aggroRange: 6, ...commonFrame,
    },

    // ── 200 series: low/mid fae, imps and winged beasts (band 1-5) ──
    '214R': {
        id: '214R', name: '분홍 요정', sprite: '214R.png', role: 'support',
        level: 2, levelBand: [1, 5], family: 'fae', spawnTags: ['forest', 'grass'],
        color: '#e6a0c8', frameSize: 32, renderScale: 1.1, aggroRange: 5, ...commonFrame,
    },
    '215R': {
        id: '215R', name: '불꽃 임프', sprite: '215R.png', role: 'coward',
        level: 2, levelBand: [1, 5], family: 'demon', spawnTags: ['lava', 'cave'],
        color: '#e07a3a', frameSize: 32, renderScale: 1.1, aggroRange: 5, ...commonFrame,
    },
    '216R': {
        id: '216R', name: '숲의 정령', sprite: '216R.png', role: 'healer',
        level: 2, levelBand: [1, 5], family: 'fae', spawnTags: ['forest', 'grass'],
        color: '#d98ac0', frameSize: 32, renderScale: 1.1, aggroRange: 5, ...commonFrame,
    },
    '217R': {
        id: '217R', name: '어린 하피', sprite: '217R.png', role: 'archer',
        level: 3, levelBand: [1, 5], family: 'beast', spawnTags: ['grass', 'stone'],
        color: '#e8a8b8', frameSize: 32, renderScale: 1.1, aggroRange: 6, ...commonFrame,
    },
    '218R': {
        id: '218R', name: '주황 가고일', sprite: '218R.png', role: 'support',
        level: 3, levelBand: [2, 5], family: 'demon', spawnTags: ['stone', 'cave'],
        color: '#d98a4a', frameSize: 32, renderScale: 1.14, aggroRange: 6, ...commonFrame,
    },
    '219R': {
        id: '219R', name: '붉은 집게벌레', sprite: '219R.png', role: 'tank',
        level: 3, levelBand: [2, 5], family: 'beast', spawnTags: ['cave', 'sand'],
        color: '#c0503a', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '224R': {
        id: '224R', name: '붉은 마조', sprite: '224R.png', role: 'bruiser',
        level: 4, levelBand: [2, 5], family: 'demon', spawnTags: ['lava', 'cave'],
        color: '#c85040', frameSize: 32, renderScale: 1.14, aggroRange: 6, ...commonFrame,
    },
    '225R': {
        id: '225R', name: '불새', sprite: '225R.png', role: 'archer',
        level: 4, levelBand: [2, 5], family: 'beast', spawnTags: ['lava', 'grass'],
        color: '#e8923a', frameSize: 32, renderScale: 1.16, aggroRange: 6, ...commonFrame,
    },
    '226R': {
        id: '226R', name: '주황 비룡', sprite: '226R.png', role: 'bruiser',
        level: 4, levelBand: [2, 6], family: 'reptile', spawnTags: ['stone', 'lava'],
        color: '#d97a2a', frameSize: 32, renderScale: 1.18, aggroRange: 6, ...commonFrame,
    },

    // ── 300 series: mid-tier soldiers, undead and reptiles (band 4-9) ──
    '353R': {
        id: '353R', name: '붉은 술사', sprite: '353R.png', role: 'support',
        level: 5, levelBand: [4, 9], family: 'demon', spawnTags: ['cave', 'lava', 'castle'],
        color: '#c0403a', frameSize: 32, renderScale: 1.14, aggroRange: 6, ...commonFrame,
    },
    '354R': {
        id: '354R', name: '해골 위병', sprite: '354R.png', role: 'tank',
        level: 6, levelBand: [4, 9], family: 'undead', spawnTags: ['cave', 'stone'],
        color: '#9aa0aa', frameSize: 32, renderScale: 1.14, aggroRange: 5, ...commonFrame,
    },
    '358R': {
        id: '358R', name: '굴 쥐인간', sprite: '358R.png', role: 'bruiser',
        level: 5, levelBand: [4, 9], family: 'beastfolk', spawnTags: ['cave', 'grass'],
        color: '#a87a4a', frameSize: 32, renderScale: 1.12, aggroRange: 5, ...commonFrame,
    },
    '362R': {
        id: '362R', name: '초록 도마뱀병', sprite: '362R.png', role: 'bruiser',
        level: 6, levelBand: [4, 9], family: 'reptile', spawnTags: ['forest', 'stone', 'special'],
        color: '#4aa05a', frameSize: 32, renderScale: 1.14, aggroRange: 6, ...commonFrame,
    },
    '366R': {
        id: '366R', name: '초록 드레이크', sprite: '366R.png', role: 'archer',
        level: 7, levelBand: [4, 9], family: 'reptile', spawnTags: ['stone', 'forest'],
        color: '#3a9050', frameSize: 32, renderScale: 1.18, aggroRange: 7, ...commonFrame,
    },
    '367R': {
        id: '367R', name: '녹빛 사냥도마뱀', sprite: '367R.png', role: 'coward',
        level: 7, levelBand: [5, 9], family: 'reptile', spawnTags: ['forest', 'special'],
        color: '#5aa040', frameSize: 32, renderScale: 1.14, aggroRange: 6, ...commonFrame,
    },

    // ── 400 series: mid-high giants, demons and beasts (band 8-14) ──
    '452R': {
        id: '452R', name: '심연 가고일', sprite: '452R.png', role: 'support',
        level: 10, levelBand: [8, 14], family: 'demon', spawnTags: ['stone', 'cave'],
        color: '#4a5070', frameSize: 32, renderScale: 1.18, aggroRange: 7, ...commonFrame,
    },
    '453R': {
        id: '453R', name: '녹피 오우거', sprite: '453R.png', role: 'tank',
        level: 10, levelBand: [8, 14], family: 'giant', spawnTags: ['stone', 'forest'],
        color: '#3a8050', frameSize: 32, renderScale: 1.22, aggroRange: 6, ...commonFrame,
    },
    '454R': {
        id: '454R', name: '초록 트롤', sprite: '454R.png', role: 'bruiser',
        level: 11, levelBand: [8, 14], family: 'giant', spawnTags: ['stone', 'cave'],
        color: '#4a7048', frameSize: 32, renderScale: 1.22, aggroRange: 6, ...commonFrame,
    },
    '456R': {
        id: '456R', name: '거대 곰', sprite: '456R.png', role: 'bruiser',
        level: 10, levelBand: [8, 14], family: 'beast', spawnTags: ['forest', 'snow'],
        color: '#8a6040', frameSize: 32, renderScale: 1.2, aggroRange: 6, ...commonFrame,
    },
    '458R': {
        id: '458R', name: '강철 창병', sprite: '458R.png', role: 'tank',
        level: 11, levelBand: [8, 14], family: 'human', spawnTags: ['stone', 'castle', 'sand'],
        color: '#6a7088', frameSize: 32, renderScale: 1.16, aggroRange: 6, ...commonFrame,
    },
    '462R': {
        id: '462R', name: '사막 매', sprite: '462R.png', role: 'archer',
        level: 12, levelBand: [8, 14], family: 'beast', spawnTags: ['sand', 'stone'],
        color: '#b08a4a', frameSize: 32, renderScale: 1.16, aggroRange: 7, ...commonFrame,
    },
    '463R': {
        id: '463R', name: '뿔 짐승', sprite: '463R.png', role: 'coward',
        level: 11, levelBand: [8, 14], family: 'beast', spawnTags: ['sand', 'grass'],
        color: '#a07850', frameSize: 32, renderScale: 1.18, aggroRange: 6, ...commonFrame,
    },
    '466R': {
        id: '466R', name: '마계 추적자', sprite: '466R.png', role: 'bruiser',
        level: 12, levelBand: [9, 14], family: 'demon', spawnTags: ['lava', 'cave', 'special'],
        color: '#c05a90', frameSize: 32, renderScale: 1.16, aggroRange: 7, ...commonFrame,
    },
    '467R': {
        id: '467R', name: '마녀', sprite: '467R.png', role: 'healer',
        level: 13, levelBand: [9, 14], family: 'demon', spawnTags: ['cave', 'special'],
        color: '#c060a0', frameSize: 32, renderScale: 1.14, aggroRange: 7, ...commonFrame,
    },

    // ── 600 series: late-game human elites (pirates, marines, knights) (band 14-20) ──
    '634R': {
        id: '634R', name: '해적 선장', sprite: '634R.png', role: 'bruiser',
        level: 17, levelBand: [14, 20], family: 'human', spawnTags: ['castle', 'sand', 'ament'],
        color: '#b04a3a', frameSize: 32, renderScale: 1.18, aggroRange: 7, ...commonFrame,
    },
    '635R': {
        id: '635R', name: '해군 검사', sprite: '635R.png', role: 'bruiser',
        level: 16, levelBand: [14, 20], family: 'human', spawnTags: ['castle', 'sand'],
        color: '#3a5ab0', frameSize: 32, renderScale: 1.16, aggroRange: 6, ...commonFrame,
    },
    '636R': {
        id: '636R', name: '황금 기사', sprite: '636R.png', role: 'tank',
        level: 17, levelBand: [14, 20], family: 'human', spawnTags: ['castle', 'ament'],
        color: '#c8a040', frameSize: 32, renderScale: 1.18, aggroRange: 6, ...commonFrame,
    },
    '637R': {
        id: '637R', name: '녹의 장교', sprite: '637R.png', role: 'archer',
        level: 16, levelBand: [14, 20], family: 'human', spawnTags: ['castle', 'ament'],
        color: '#4a8050', frameSize: 32, renderScale: 1.16, aggroRange: 7, ...commonFrame,
    },
    '638R': {
        id: '638R', name: '친위대장', sprite: '638R.png', role: 'bruiser',
        level: 18, levelBand: [15, 20], family: 'human', spawnTags: ['ament', 'castle'],
        color: '#5a6088', frameSize: 32, renderScale: 1.2, aggroRange: 7, ...commonFrame,
    },
    '639R': {
        id: '639R', name: '제국 병사', sprite: '639R.png', role: 'tank',
        level: 16, levelBand: [14, 20], family: 'human', spawnTags: ['castle', 'ament', 'sand'],
        color: '#3a8888', frameSize: 32, renderScale: 1.16, aggroRange: 6, ...commonFrame,
    },

    // ── 700 series: original final-scenario demons (authored story only) ──
    '729R': {
        id: '729R', name: '서큐버스', sprite: '637R.png', role: 'healer',
        level: 20, levelBand: [20, 20], family: 'demon', spawnTags: ['special', 'ament'],
        color: '#b04aa0', frameSize: 32, renderScale: 1.28, aggroRange: 8, ...commonFrame,
    },
    '730R': {
        id: '730R', name: '베라모드', sprite: '638R.png', role: 'bruiser',
        level: 21, levelBand: [21, 21], family: 'demon', spawnTags: ['special', 'ament'],
        color: '#b04040', frameSize: 32, renderScale: 1.3, aggroRange: 8, ...commonFrame,
    },
    '731R': {
        id: '731R', name: '벨제뷔트', sprite: '636R.png', role: 'support',
        level: 22, levelBand: [22, 22], family: 'demon', spawnTags: ['special', 'ament'],
        color: '#7850b8', frameSize: 32, renderScale: 1.3, aggroRange: 8, ...commonFrame,
    },
    '732R': {
        id: '732R', name: '아스타로스', sprite: '634R.png', role: 'tank',
        level: 23, levelBand: [23, 23], family: 'demon', spawnTags: ['special', 'ament'],
        color: '#6c5f90', frameSize: 32, renderScale: 1.32, aggroRange: 8, ...commonFrame,
    },
    '733R': {
        id: '733R', name: '네르갈', sprite: '638R.png', role: 'boss',
        level: 24, levelBand: [24, 24], family: 'demon', spawnTags: ['special', 'ament'],
        color: '#2f2f68', frameSize: 32, renderScale: 1.65, aggroRange: 9, ...commonFrame,
    },

    '791R': {
        id: '791R', name: '새', sprite: '791R.png', role: 'boss',
        level: 20, levelBand: [20, 20], family: 'beast', spawnTags: ['special'],
        color: '#d0b080', frameSize: 64, renderScale: 1.65, aggroRange: 9, ...commonFrame,
    },

    'burgos_wolf_boss': {
        id: 'burgos_wolf_boss', name: '키스라', sprite: '435R.png', role: 'boss',
        level: 3, levelBand: [3, 3], family: 'beast', spawnTags: ['castle'],
        color: '#6676d8', frameSize: 32, renderScale: 1.75, aggroRange: 9, ...commonFrame,
    },
    'zamora_fenris_boss': {
        id: 'zamora_fenris_boss', name: '펜리스', sprite: '435R.png', role: 'boss',
        level: 4, levelBand: [4, 4], family: 'beast', spawnTags: ['castle'],
        color: '#5f70df', frameSize: 32, renderScale: 1.65, aggroRange: 9, ...commonFrame,
    },
    '701R': {
        id: '701R', name: '부르고스 궁의 몬스터', sprite: '701R.png', role: 'boss',
        level: 3, levelBand: [3, 3], family: 'demon', spawnTags: ['castle'],
        color: '#ff7f8d', frameSize: 64, renderScale: 1.65, aggroRange: 9, ...commonFrame,
    },
};

export function getMonsterDefinition(id: MonsterId): MonsterDefinition {
    return MONSTER_DEFINITIONS[id];
}

export function isMonsterId(value: string | undefined): value is MonsterId {
    return value !== undefined && Object.prototype.hasOwnProperty.call(MONSTER_DEFINITIONS, value);
}

export function getMonsterDefinitionSafe(id: string | undefined): MonsterDefinition | null {
    return isMonsterId(id) ? MONSTER_DEFINITIONS[id] : null;
}
