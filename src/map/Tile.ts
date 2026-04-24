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
    sheet?: string;           // tileset sheet name
    autotileCol?: number;     // A2 column (0-7)
    autotileRow?: number;     // A2 row (0-3)
    a1Kind?: number;          // A1 autotile kind index (for water/lava)
    sx?: number;              // fallback source X (non-autotile)
    sy?: number;              // fallback source Y
    worldBIndex?: number;     // World_B sprite index (for object overlay)
    blendPriority: number;
    hazard?: 'poison';
}

export const TILE_PROPERTIES: Record<TileType, TileProperties> = {
    // === World_A2 Autotile Groups ===
    // Layout: 8 cols × 4 rows, cols 0-5 = autotile, cols 6-7 = static (hills/mountains)
    [TileType.GRASS]:  { color: '#4a7c59', walkable: true,  moveCost: 1,   label: 'Grass',  labelKey: 'tile.grass', sheet: 'World_A2.png', autotileCol: 0, autotileRow: 0, blendPriority: 2 }, // Grassland A
    [TileType.FOREST]: { color: '#2d5f2d', walkable: true,  moveCost: 2,   label: 'Forest', labelKey: 'tile.forest', sheet: 'World_A2.png', autotileCol: 4, autotileRow: 0, blendPriority: 3 }, // Forest
    [TileType.SAND]:   { color: '#d4a76a', walkable: true,  moveCost: 1.5, label: 'Sand',   labelKey: 'tile.sand',  sheet: 'World_A2.png', autotileCol: 0, autotileRow: 2, blendPriority: 4 }, // Desert A
    [TileType.ROAD]:   { color: '#8d7b68', walkable: true,  moveCost: 0.8, label: 'Road',   labelKey: 'tile.road',  sheet: 'World_A2.png', autotileCol: 5, autotileRow: 1, blendPriority: 5 }, // Road (Dirt)
    [TileType.TOWN]:   { color: '#c8a84e', walkable: true,  moveCost: 0.8, label: 'Town',   labelKey: 'tile.town',  sheet: 'World_A2.png', autotileCol: 5, autotileRow: 2, blendPriority: 6 }, // Road (Paved)
    [TileType.STONE]:  { color: '#6b6b6b', walkable: true,  moveCost: 1,   label: 'Stone',  labelKey: 'tile.stone', sheet: 'World_A2.png', autotileCol: 2, autotileRow: 2, blendPriority: 7 }, // Rocky Land A
    [TileType.SNOW]:   { color: '#ffffff', walkable: true,  moveCost: 1.2, label: 'Snow',   labelKey: 'tile.snow',  sheet: 'World_A2.png', autotileCol: 0, autotileRow: 3, blendPriority: 8 }, // Snowfield
    [TileType.POISON_SWAMP]: { color: '#4a2d5c', walkable: true, moveCost: 2.5, label: 'Poison Swamp', labelKey: 'tile.poisonSwamp', sheet: 'World_A2.png', autotileCol: 0, autotileRow: 1, blendPriority: 1, hazard: 'poison' }, // Wasteland A

    // === World_A1 (water/lava — autotile with A1 coordinates) ===
    [TileType.WATER]:      { color: '#1a5276', walkable: false, moveCost: 0, label: 'Water',      labelKey: 'tile.water',     sheet: 'World_A1.png', a1Kind: 0, blendPriority: 0 }, // Sea (A1 kind 0) — near coast
    [TileType.DEEP_WATER]: { color: '#0a2a40', walkable: false, moveCost: 0, label: 'Deep Water', labelKey: 'tile.deepWater', sheet: 'World_A1.png', a1Kind: 1, blendPriority: -1 }, // Deep Sea (A1 kind 1) — far from coast
    [TileType.LAVA]:       { color: '#c0392b', walkable: false, moveCost: 0, label: 'Lava',       labelKey: 'tile.lava',      sheet: 'World_A1.png', a1Kind: 6, blendPriority: 0 }, // Lava (A1 kind 6)

    // === Non-autotile ===
    [TileType.WALL]:   { color: '#2c2c2c', walkable: false, moveCost: 0,   label: 'Wall',   labelKey: 'tile.wall',  blendPriority: 10 },
    [TileType.DUNGEON_ENTRANCE]: { color: '#5c2d4a', walkable: true, moveCost: 1, label: 'Dungeon', labelKey: 'tile.dungeon', sheet: 'World_B.png', worldBIndex: 17, blendPriority: 11 }, // Cave A
};
