import { TileType } from '../map/Tile';

export type FieldFootstepSurface = 'soft' | 'hard' | 'wet';

export function getFieldFootstepSurface(tile: TileType): FieldFootstepSurface {
    switch (tile) {
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
