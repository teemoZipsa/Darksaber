import type { EnemyRole } from '../field/EnemyAI';

export interface MonsterDefinition {
    id: MonsterId;
    name: string;
    sprite: string;
    role: EnemyRole;
    level: number;
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
export const BURGOS_BOSS_MONSTER_ID = '701R';
export const BURGOS_GUARD_MONSTER_ID = '303R';

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

export const MONSTER_IDS = [...GENERAL_MONSTER_IDS, BURGOS_BOSS_MONSTER_ID] as const;
export type MonsterId = typeof MONSTER_IDS[number];

const commonFrame = {
    frameCount: MONSTER_FRAME_COUNT,
    framesPerSecond: MONSTER_FPS,
};

export const MONSTER_DEFINITIONS: Record<MonsterId, MonsterDefinition> = {
    '302R': {
        id: '302R',
        name: '스켈레톤 궁수',
        sprite: '302R.png',
        role: 'archer',
        level: 2,
        color: '#d4c4cc',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '303R': {
        id: '303R',
        name: '부르고스 경비병',
        sprite: '303R.png',
        role: 'bruiser',
        level: 2,
        color: '#d98a5a',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '304R': {
        id: '304R',
        name: '쥐인간 전사',
        sprite: '304R.png',
        role: 'bruiser',
        level: 1,
        color: '#7080c8',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '305R': {
        id: '305R',
        name: '청피 쥐인간',
        sprite: '305R.png',
        role: 'tank',
        level: 2,
        color: '#706bd8',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '307R': {
        id: '307R',
        name: '하급 마족',
        sprite: '307R.png',
        role: 'healer',
        level: 2,
        color: '#8f64c8',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '308R': {
        id: '308R',
        name: '청피 마족',
        sprite: '308R.png',
        role: 'bruiser',
        level: 2,
        color: '#7786d8',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '309R': {
        id: '309R',
        name: '흑익 가고일',
        sprite: '309R.png',
        role: 'support',
        level: 3,
        color: '#5b6172',
        frameSize: 32,
        renderScale: 1.16,
        aggroRange: 6,
        ...commonFrame,
    },
    '311R': {
        id: '311R',
        name: '쥐인간 도적',
        sprite: '311R.png',
        role: 'coward',
        level: 1,
        color: '#c98632',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '313R': {
        id: '313R',
        name: '오크 검병',
        sprite: '313R.png',
        role: 'bruiser',
        level: 2,
        color: '#c77870',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '314R': {
        id: '314R',
        name: '청피 오크병',
        sprite: '314R.png',
        role: 'tank',
        level: 2,
        color: '#54b6ce',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '315R': {
        id: '315R',
        name: '자색 미노타우로스',
        sprite: '315R.png',
        role: 'tank',
        level: 3,
        color: '#8c50c0',
        frameSize: 32,
        renderScale: 1.2,
        aggroRange: 6,
        ...commonFrame,
    },
    '317R': {
        id: '317R',
        name: '미노타우로스',
        sprite: '317R.png',
        role: 'tank',
        level: 2,
        color: '#c07717',
        frameSize: 32,
        renderScale: 1.18,
        aggroRange: 6,
        ...commonFrame,
    },
    '346R': {
        id: '346R',
        name: '초원 늑대',
        sprite: '346R.png',
        role: 'bruiser',
        level: 1,
        color: '#c57945',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '409R': {
        id: '409R',
        name: '동굴 박쥐',
        sprite: '409R.png',
        role: 'support',
        level: 2,
        color: '#7d6750',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '434R': {
        id: '434R',
        name: '스켈레톤 전사',
        sprite: '434R.png',
        role: 'bruiser',
        level: 2,
        color: '#d8c8e8',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 5,
        ...commonFrame,
    },
    '435R': {
        id: '435R',
        name: '그림자 늑대',
        sprite: '435R.png',
        role: 'coward',
        level: 2,
        color: '#4d64c8',
        frameSize: 32,
        renderScale: 1.12,
        aggroRange: 6,
        ...commonFrame,
    },
    '701R': {
        id: '701R',
        name: '부르고스 궁의 몬스터',
        sprite: '701R.png',
        role: 'boss',
        level: 3,
        color: '#ff7f8d',
        frameSize: 64,
        renderScale: 1.65,
        aggroRange: 9,
        ...commonFrame,
    },
};

export function getMonsterDefinition(id: MonsterId): MonsterDefinition {
    return MONSTER_DEFINITIONS[id];
}
