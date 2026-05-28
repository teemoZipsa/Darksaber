/**
 * Tile — defines all tile types and their properties.
 * Each tile type has a color, walkability flag, movement cost multiplier, and sprite source.
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
    SNOW = 8,
    POISON_SWAMP = 9,
    TOWN = 10,
    DUNGEON_ENTRANCE = 11,
    DEEP_WATER = 12,
}

export interface TileProperties {
    color: string;
    walkable: boolean;
    moveCost: number; // 1 = normal, 2 = slow, 0 = impassable
    label: string;
    labelKey: string; // i18n key
    blendPriority: number;
    hazard?: 'poison';
}

export const TILE_PROPERTIES: Record<TileType, TileProperties> = {
    [TileType.GRASS]:  { color: '#4a7c59', walkable: true,  moveCost: 1,   label: 'Grass',  labelKey: 'tile.grass', blendPriority: 2 },
    [TileType.FOREST]: { color: '#2d5f2d', walkable: true,  moveCost: 2,   label: 'Forest', labelKey: 'tile.forest', blendPriority: 3 },
    [TileType.SAND]:   { color: '#d4a76a', walkable: true,  moveCost: 1.5, label: 'Sand',   labelKey: 'tile.sand',  blendPriority: 4 },
    [TileType.ROAD]:   { color: '#8d7b68', walkable: true,  moveCost: 0.8, label: 'Road',   labelKey: 'tile.road',  blendPriority: 5 },
    [TileType.TOWN]:   { color: '#c8a84e', walkable: true,  moveCost: 0.8, label: 'Town',   labelKey: 'tile.town',  blendPriority: 6 },
    [TileType.STONE]:  { color: '#6b6b6b', walkable: true,  moveCost: 1,   label: 'Stone',  labelKey: 'tile.stone', blendPriority: 7 },
    [TileType.SNOW]:   { color: '#ffffff', walkable: true,  moveCost: 1.2, label: 'Snow',   labelKey: 'tile.snow',  blendPriority: 8 },
    [TileType.POISON_SWAMP]: { color: '#4a2d5c', walkable: true, moveCost: 2.5, label: 'Poison Swamp', labelKey: 'tile.poisonSwamp', blendPriority: 1, hazard: 'poison' },
    [TileType.WATER]:      { color: '#1a5276', walkable: false, moveCost: 0, label: 'Water',      labelKey: 'tile.water',     blendPriority: 0 },
    [TileType.DEEP_WATER]: { color: '#0a2a40', walkable: false, moveCost: 0, label: 'Deep Water', labelKey: 'tile.deepWater', blendPriority: -1 },
    [TileType.LAVA]:       { color: '#c0392b', walkable: false, moveCost: 0, label: 'Lava',       labelKey: 'tile.lava',      blendPriority: 0 },
    [TileType.WALL]:   { color: '#2c2c2c', walkable: false, moveCost: 0,   label: 'Wall',   labelKey: 'tile.wall',  blendPriority: 10 },
    [TileType.DUNGEON_ENTRANCE]: { color: '#5c2d4a', walkable: true, moveCost: 1, label: 'Dungeon', labelKey: 'tile.dungeon', blendPriority: 11 },
};
