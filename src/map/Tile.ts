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
}

export interface TileProperties {
    color: string;
    walkable: boolean;
    moveCost: number; // 1 = normal, 2 = slow, 0 = impassable
    label: string;
    labelKey: string; // i18n key
    imgSrc?: string; // Optional sprite path
    blendPriority: number; // Higher numbers blend over lower numbers
}

export const TILE_PROPERTIES: Record<TileType, TileProperties> = {
    [TileType.GRASS]:  { color: '#4a7c59', walkable: true,  moveCost: 1,   label: 'Grass',  labelKey: 'tile.grass', imgSrc: '/Image/Tileset/grass.png', blendPriority: 7 },
    [TileType.STONE]:  { color: '#6b6b6b', walkable: true,  moveCost: 1,   label: 'Stone',  labelKey: 'tile.stone', imgSrc: '/Image/Tileset/stone.png', blendPriority: 5 },
    [TileType.WATER]:  { color: '#2980b9', walkable: false, moveCost: 0,   label: 'Water',  labelKey: 'tile.water', imgSrc: '/Image/Tileset/water.png', blendPriority: 2 },
    [TileType.WALL]:   { color: '#2c2c2c', walkable: false, moveCost: 0,   label: 'Wall',   labelKey: 'tile.wall',  imgSrc: '/Image/Tileset/wall.png',  blendPriority: 10 },
    [TileType.LAVA]:   { color: '#c0392b', walkable: false, moveCost: 0,   label: 'Lava',   labelKey: 'tile.lava',  imgSrc: '/Image/Tileset/lava.png',  blendPriority: 3 },
    [TileType.SAND]:   { color: '#d4a76a', walkable: true,  moveCost: 1.5, label: 'Sand',   labelKey: 'tile.sand',  imgSrc: '/Image/Tileset/sand.png',  blendPriority: 4 },
    [TileType.FOREST]: { color: '#2d5f2d', walkable: true,  moveCost: 2,   label: 'Forest', labelKey: 'tile.forest', imgSrc: '/Image/Tileset/forest.png', blendPriority: 8 },
    [TileType.ROAD]:   { color: '#8d7b68', walkable: true,  moveCost: 0.8, label: 'Road',   labelKey: 'tile.road',  imgSrc: '/Image/Tileset/road.png',  blendPriority: 6 },
    [TileType.SNOW]:   { color: '#ffffff', walkable: true,  moveCost: 1.2, label: 'Snow',   labelKey: 'tile.snow',  imgSrc: '/Image/Tileset/snow.png',  blendPriority: 9 },
};
