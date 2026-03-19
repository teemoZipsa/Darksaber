/**
 * Tile — defines all tile types and their properties.
 * Each tile type has a color, walkability flag, and movement cost multiplier.
 */

export enum TileType {
    GRASS = 0,
    STONE = 1,
    WATER = 2,
    WALL = 3,
    LAVA = 4,
    SAND = 5,
    FOREST = 6,
    ROAD = 7,
}

export interface TileProperties {
    color: string;
    walkable: boolean;
    moveCost: number; // 1 = normal, 2 = slow, 0 = impassable
    label: string;
}

export const TILE_PROPERTIES: Record<TileType, TileProperties> = {
    [TileType.GRASS]:  { color: '#4a7c59', walkable: true,  moveCost: 1,   label: 'Grass' },
    [TileType.STONE]:  { color: '#6b6b6b', walkable: true,  moveCost: 1,   label: 'Stone' },
    [TileType.WATER]:  { color: '#2980b9', walkable: false, moveCost: 0,   label: 'Water' },
    [TileType.WALL]:   { color: '#2c2c2c', walkable: false, moveCost: 0,   label: 'Wall' },
    [TileType.LAVA]:   { color: '#c0392b', walkable: false, moveCost: 0,   label: 'Lava' },
    [TileType.SAND]:   { color: '#d4a76a', walkable: true,  moveCost: 1.5, label: 'Sand' },
    [TileType.FOREST]: { color: '#2d5f2d', walkable: true,  moveCost: 2,   label: 'Forest' },
    [TileType.ROAD]:   { color: '#8d7b68', walkable: true,  moveCost: 0.8, label: 'Road' },
};
