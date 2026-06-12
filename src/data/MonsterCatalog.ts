import MONSTERS_JSON from './content/monsters.json';
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

export const MONSTER_IDS = [
    ...GENERAL_MONSTER_IDS,
    ...NEW_MONSTER_IDS,
    BURGOS_BOSS_MONSTER_ID,
    ZAMORA_FENRIS_BOSS_MONSTER_ID,
    BURGOS_LEGACY_BOSS_MONSTER_ID,
] as const;
export type MonsterId = typeof MONSTER_IDS[number];

export const MONSTER_DEFINITIONS: Record<MonsterId, MonsterDefinition> = MONSTERS_JSON as Record<MonsterId, MonsterDefinition>;

export function getMonsterDefinition(id: MonsterId): MonsterDefinition {
    return MONSTER_DEFINITIONS[id];
}

export function isMonsterId(value: string | undefined): value is MonsterId {
    return value !== undefined && Object.prototype.hasOwnProperty.call(MONSTER_DEFINITIONS, value);
}

export function getMonsterDefinitionSafe(id: string | undefined): MonsterDefinition | null {
    return isMonsterId(id) ? MONSTER_DEFINITIONS[id] : null;
}
