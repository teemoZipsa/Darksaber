import type { EnemyRole } from './EnemyAI';
import type { TilePoint } from './FieldPathing';

export const ACTOR_COLORS = ['#00e5ff', '#ff4fd8', '#ffd447'];

export const FORMATION_OFFSETS: TilePoint[] = [
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
];

export const FIELD_ATB_SCALE = 6;
export const ENEMY_AGGRO_RANGE = 24;
export const ENEMY_EXIT_RANGE = 32;
export const ENEMY_LEASH_RANGE = 42;
export const ENEMY_SIMULATION_ACTIVE_RANGE = 48;
export const ENEMY_COMBAT_SIMULATION_RANGE = 64;
export const MOVEMENT_REPATH_INTERVAL = 0.35;

export const ENEMY_ROLE_GLYPHS: Record<EnemyRole, string> = {
    bruiser: 'M',
    tank: 'T',
    archer: 'R',
    healer: '+',
    coward: '!',
    support: 'S',
    boss: 'B',
};
