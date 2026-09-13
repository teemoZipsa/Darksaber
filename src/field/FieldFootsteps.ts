import { TileType } from '../map/Tile';

export type FieldFootstepSurface = 'soft' | 'hard' | 'snow' | 'wet';

const RECORDED_STEPS = {
    soft: ['sfx.footstep_grass', 'sfx.footstep_grass_2', 'sfx.footstep_grass_3'],
    hard: ['sfx.footstep_stone', 'sfx.footstep_stone_2', 'sfx.footstep_stone_3'],
    snow: ['sfx.footstep_snow', 'sfx.footstep_snow_2', 'sfx.footstep_snow_3'],
};

export function getRecordedFootstepKey(surface: FieldFootstepSurface, step: number): string | null {
    if (surface === 'wet') return null;
    const variants = RECORDED_STEPS[surface];
    return variants[step % variants.length];
}

export function getFieldFootstepSurface(tile: TileType): FieldFootstepSurface {
    switch (tile) {
        case TileType.SNOW:
            return 'snow';
        case TileType.STONE:
        case TileType.ROAD:
        case TileType.TOWN:
        case TileType.DUNGEON_ENTRANCE:
            return 'hard';
        case TileType.POISON_SWAMP:
        case TileType.WATER:
        case TileType.DEEP_WATER:
            return 'wet';
        default:
            return 'soft';
    }
}
