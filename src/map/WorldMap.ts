import { Chunk, CHUNK_SIZE, TILE_SIZE } from './Chunk';
import { TileType, TILE_PROPERTIES } from './Tile';
import { TileAssetManager, type BridgeSpriteId, type LandmarkSpriteId, type TreeSpriteId } from './TileAssetManager';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';
import { BiomeMask, BiomeType, MAP_HEIGHT, MAP_WIDTH, TempleInfo, TownInfo, WorldRealm } from './BiomeMask';
import { getBurgosCastleHmapTileAt } from './BurgosCastleHmap';
import { getStoryHmapTileAt } from './StoryHmaps';
import { HMAP_BLEND_BAND, type HmapSample } from './HmapBlend';
import { STORY_SCENARIOS } from '../data/StoryScenarioData';
import { isStoryInteriorDungeon } from '../data/StoryInteriorData';
import { i18n, t } from '../i18n/LanguageManager';

export interface TileBounds {
    width: number;
    height: number;
}

export interface TilePoint {
    x: number;
    y: number;
}

export type WorldMapLandmarkKind = 'town' | 'temple' | 'dungeon';

export interface WorldMapLandmark {
    x: number;
    y: number;
    label: string;
    kind: WorldMapLandmarkKind;
}

export interface WorldMapDecorationClip {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WorldMapDecorationBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface WorldMapTreeDecoration {
    kind: 'tree';
    sprite: TreeSpriteId;
    anchorTile: TilePoint;
    trunkTiles: TilePoint[];
    canopyClip: WorldMapDecorationClip;
    bounds: WorldMapDecorationBounds;
}

export interface WorldMapBridgeDecoration {
    kind: 'bridge';
    sprite: BridgeSpriteId;
    anchorTile: TilePoint;
    passableTiles: TilePoint[];
    bounds: WorldMapDecorationBounds;
}

export type WorldMapDecoration = WorldMapTreeDecoration | WorldMapBridgeDecoration;

export type WorldMapGroundDetailKind =
    | 'grassTuft'
    | 'wildflowers'
    | 'forestMushrooms'
    | 'pebbles'
    | 'dryBrush'
    | 'snowShrub'
    | 'swampReeds';

export interface WorldMapGroundDetail {
    kind: WorldMapGroundDetailKind;
    tile: TilePoint;
    offsetX: number;
    offsetY: number;
    scale: number;
    mirrored: boolean;
}

export type WorldMapAmbientSiteKind = 'abandonedCamp' | 'roadsideRuins' | 'brokenWaystone' | 'swampTotem';

export interface WorldMapAmbientSite {
    id: string;
    kind: WorldMapAmbientSiteKind;
    anchorTile: TilePoint;
    bounds: WorldMapDecorationBounds;
    mirrored: boolean;
}

export interface WorldInspectMarker {
    id: string;
    tile: TilePoint;
    labelKey?: string;
    kind?: 'person' | 'chest';
}

export interface WorldDungeonInfo {
    id: string;
    name: string;
    nameKr: string;
    chunkX: number;
    chunkY: number;
    sprite: LandmarkSpriteId;
    tileSpan: number;
    tileRadius: number;
}

interface WorldMapOptions {
    validateTownSpawns?: boolean;
}

const BIOME_TILE: Record<BiomeType, TileType> = {
    ocean: TileType.DEEP_WATER,
    sand: TileType.SAND,
    grass: TileType.GRASS,
    forest: TileType.FOREST,
    stone: TileType.STONE,
    snow: TileType.SNOW,
    town: TileType.TOWN,
    special: TileType.POISON_SWAMP,
    lava: TileType.LAVA,
};

interface RoutePoint {
    chunkX: number;
    chunkY: number;
}

interface TileRoute {
    points: RoutePoint[];
    width: number;
    noiseSalt: number;
}

interface TileRouteBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

const ROUTE_TILE_BOUNDS = new WeakMap<TileRoute, TileRouteBounds>();

function getTileRouteBounds(route: TileRoute): TileRouteBounds {
    const cached = ROUTE_TILE_BOUNDS.get(route);
    if (cached) return cached;
    const padding = route.width + 0.7;
    const centers = route.points.map((point) => ({
        x: point.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        y: point.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
    }));
    const bounds = {
        minX: Math.min(...centers.map((point) => point.x)) - padding,
        minY: Math.min(...centers.map((point) => point.y)) - padding,
        maxX: Math.max(...centers.map((point) => point.x)) + padding,
        maxY: Math.max(...centers.map((point) => point.y)) + padding,
    };
    ROUTE_TILE_BOUNDS.set(route, bounds);
    return bounds;
}

interface WaterBasin {
    center: RoutePoint;
    radiusX: number;
    radiusY: number;
    innerRadius: number;
    outerRadius: number;
    noiseSalt: number;
}

const ROAD_ROUTES: TileRoute[] = [
    {
        points: [
            { chunkX: 16, chunkY: 11 },
            { chunkX: 23, chunkY: 23 },
            { chunkX: 30, chunkY: 35 },
            { chunkX: 37, chunkY: 44 },
        ],
        width: 2.2,
        noiseSalt: 101,
    },
    {
        points: [
            { chunkX: 10, chunkY: 52 },
            { chunkX: 20, chunkY: 48 },
            { chunkX: 28, chunkY: 45 },
            { chunkX: 37, chunkY: 44 },
        ],
        width: 2.2,
        noiseSalt: 102,
    },
    {
        points: [
            { chunkX: 37, chunkY: 44 },
            { chunkX: 39, chunkY: 62 },
            { chunkX: 41, chunkY: 80 },
        ],
        width: 2.3,
        noiseSalt: 103,
    },
    {
        points: [
            { chunkX: 12, chunkY: 79 },
            { chunkX: 24, chunkY: 82 },
            { chunkX: 41, chunkY: 80 },
        ],
        width: 2.1,
        noiseSalt: 104,
    },
    {
        points: [
            { chunkX: 64, chunkY: 23 },
            { chunkX: 64, chunkY: 35 },
            { chunkX: 63, chunkY: 49 },
            { chunkX: 63, chunkY: 60 },
            { chunkX: 63, chunkY: 72 },
        ],
        width: 2.1,
        noiseSalt: 105,
    },
    // Main story spine: threads the central inland scenarios in episode order
    // (Ep4 -> Ep3 -> Ep2 -> Ep1 -> Ep7 -> Ep6 -> Ep16 -> Ep5 -> Ep8 -> Ep10),
    // tying into the central castle so the campaign reads as a single trail.
    {
        points: [
            { chunkX: 43, chunkY: 17 },
            { chunkX: 43, chunkY: 24 },
            { chunkX: 37, chunkY: 44 },
            { chunkX: 43, chunkY: 40 },
            { chunkX: 47, chunkY: 40 },
            { chunkX: 45, chunkY: 45 },
            { chunkX: 47, chunkY: 48 },
            { chunkX: 47, chunkY: 53 },
            { chunkX: 47, chunkY: 59 },
            { chunkX: 51, chunkY: 64 },
        ],
        width: 2.3,
        noiseSalt: 106,
    },
    // Eastern Ament branch, kept on the east continent between its two towns.
    {
        points: [
            { chunkX: 64, chunkY: 23 },
            { chunkX: 73, chunkY: 16 },
            { chunkX: 76, chunkY: 20 },
            { chunkX: 75, chunkY: 24 },
            { chunkX: 67, chunkY: 34 },
            { chunkX: 64, chunkY: 37 },
            { chunkX: 61, chunkY: 40 },
            { chunkX: 63, chunkY: 49 },
        ],
        width: 2.1,
        noiseSalt: 107,
    },
    // Late demon branch: Ep28 -> Ep31 descends the eastern sealed continent.
    {
        points: [
            { chunkX: 63, chunkY: 49 },
            { chunkX: 70, chunkY: 55 },
            { chunkX: 72, chunkY: 60 },
            { chunkX: 74, chunkY: 66 },
            { chunkX: 76, chunkY: 72 },
        ],
        width: 2.1,
        noiseSalt: 109,
    },
    // North-west desert branch: desert city -> Oasis -> Pyramid cluster.
    {
        points: [
            { chunkX: 16, chunkY: 11 },
            { chunkX: 18, chunkY: 20 },
            { chunkX: 21, chunkY: 16 },
            { chunkX: 24, chunkY: 16 },
        ],
        width: 2.1,
        noiseSalt: 108,
    },
];

const RIVER_ROUTES: TileRoute[] = [
    {
        points: [
            { chunkX: 32, chunkY: 25 },
            { chunkX: 36, chunkY: 34 },
            { chunkX: 34, chunkY: 48 },
            { chunkX: 29, chunkY: 59 },
            { chunkX: 21, chunkY: 72 },
        ],
        width: 2.4,
        noiseSalt: 201,
    },
    {
        points: [
            { chunkX: 68, chunkY: 16 },
            { chunkX: 66, chunkY: 31 },
            { chunkX: 61, chunkY: 44 },
            { chunkX: 65, chunkY: 58 },
            { chunkX: 61, chunkY: 75 },
        ],
        width: 2.1,
        noiseSalt: 202,
    },
    // North-west headwater: descends from the desert rim into the western river.
    {
        points: [
            { chunkX: 8, chunkY: 8 },
            { chunkX: 13, chunkY: 14 },
            { chunkX: 21, chunkY: 19 },
            { chunkX: 27, chunkY: 22 },
            { chunkX: 32, chunkY: 25 },
        ],
        width: 2.0,
        noiseSalt: 203,
    },
    // Western forest tributary: gives the broad western woodland a visible watershed.
    {
        points: [
            { chunkX: 4, chunkY: 39 },
            { chunkX: 12, chunkY: 42 },
            { chunkX: 21, chunkY: 44 },
            { chunkX: 28, chunkY: 46 },
            { chunkX: 34, chunkY: 48 },
        ],
        width: 2.1,
        noiseSalt: 204,
    },
    // South-west runoff: links the southern forest lakes to the main river mouth.
    {
        points: [
            { chunkX: 7, chunkY: 93 },
            { chunkX: 11, chunkY: 84 },
            { chunkX: 15, chunkY: 77 },
            { chunkX: 21, chunkY: 72 },
        ],
        width: 2.2,
        noiseSalt: 205,
    },
    // Central watershed: runs from the uplands through the Dalai basin toward the coast.
    {
        points: [
            { chunkX: 52, chunkY: 28 },
            { chunkX: 49, chunkY: 36 },
            { chunkX: 46, chunkY: 45 },
            { chunkX: 48, chunkY: 54 },
            { chunkX: 51, chunkY: 64 },
        ],
        width: 2.1,
        noiseSalt: 206,
    },
    // Northern and mid-eastern tributaries join the long eastern river.
    {
        points: [
            { chunkX: 77, chunkY: 7 },
            { chunkX: 73, chunkY: 15 },
            { chunkX: 69, chunkY: 23 },
            { chunkX: 66, chunkY: 31 },
        ],
        width: 1.9,
        noiseSalt: 207,
    },
    {
        points: [
            { chunkX: 78, chunkY: 43 },
            { chunkX: 73, chunkY: 48 },
            { chunkX: 69, chunkY: 53 },
            { chunkX: 65, chunkY: 58 },
        ],
        width: 2.0,
        noiseSalt: 208,
    },
    // South-eastern outlet and a short western lake tributary complete the network.
    {
        points: [
            { chunkX: 72, chunkY: 90 },
            { chunkX: 69, chunkY: 82 },
            { chunkX: 65, chunkY: 77 },
            { chunkX: 61, chunkY: 75 },
        ],
        width: 2.2,
        noiseSalt: 209,
    },
    {
        points: [
            { chunkX: 15, chunkY: 61 },
            { chunkX: 18, chunkY: 65 },
            { chunkX: 21, chunkY: 68 },
            { chunkX: 21, chunkY: 72 },
        ],
        width: 1.8,
        noiseSalt: 210,
    },
];

const SCENARIO_WATER_ROUTES: TileRoute[] = [
    {
        points: [
            { chunkX: 32, chunkY: 25 },
            { chunkX: 33, chunkY: 28 },
            { chunkX: 33, chunkY: 32 },
            { chunkX: 34, chunkY: 36 },
            { chunkX: 34, chunkY: 48 },
        ],
        width: 3.8,
        noiseSalt: 303,
    },
    {
        points: [
            { chunkX: 47, chunkY: 59 },
            { chunkX: 48, chunkY: 63 },
            { chunkX: 50, chunkY: 69 },
            { chunkX: 52, chunkY: 75 },
        ],
        width: 4.7,
        noiseSalt: 301,
    },
    {
        points: [
            { chunkX: 43, chunkY: 72 },
            { chunkX: 47, chunkY: 73 },
            { chunkX: 52, chunkY: 75 },
        ],
        width: 5.1,
        noiseSalt: 302,
    },
];

const SCENARIO_WATER_BASINS: WaterBasin[] = [
    {
        center: { chunkX: 41, chunkY: 72 },
        radiusX: CHUNK_SIZE * 6.3,
        radiusY: CHUNK_SIZE * 5.1,
        innerRadius: 0.43,
        outerRadius: 1.02,
        noiseSalt: 321,
    },
];

/** Filled, irregular inland lakes distributed across the otherwise broad land masses. */
const INLAND_WATER_BASINS: WaterBasin[] = [
    { center: { chunkX: 12, chunkY: 27 }, radiusX: CHUNK_SIZE * 1.8, radiusY: CHUNK_SIZE * 1.2, innerRadius: 0, outerRadius: 1, noiseSalt: 331 },
    { center: { chunkX: 28, chunkY: 11 }, radiusX: CHUNK_SIZE * 2.1, radiusY: CHUNK_SIZE * 1.35, innerRadius: 0, outerRadius: 1, noiseSalt: 332 },
    { center: { chunkX: 15, chunkY: 61 }, radiusX: CHUNK_SIZE * 2.6, radiusY: CHUNK_SIZE * 1.55, innerRadius: 0, outerRadius: 1, noiseSalt: 333 },
    { center: { chunkX: 8, chunkY: 68 }, radiusX: CHUNK_SIZE * 1.65, radiusY: CHUNK_SIZE * 1.15, innerRadius: 0, outerRadius: 1, noiseSalt: 334 },
    { center: { chunkX: 14, chunkY: 88 }, radiusX: CHUNK_SIZE * 2.2, radiusY: CHUNK_SIZE * 1.4, innerRadius: 0, outerRadius: 1, noiseSalt: 335 },
    { center: { chunkX: 27, chunkY: 62 }, radiusX: CHUNK_SIZE * 2.15, radiusY: CHUNK_SIZE * 1.3, innerRadius: 0, outerRadius: 1, noiseSalt: 336 },
    { center: { chunkX: 53, chunkY: 37 }, radiusX: CHUNK_SIZE * 2, radiusY: CHUNK_SIZE * 1.35, innerRadius: 0, outerRadius: 1, noiseSalt: 337 },
    { center: { chunkX: 56, chunkY: 55 }, radiusX: CHUNK_SIZE * 1.8, radiusY: CHUNK_SIZE * 1.2, innerRadius: 0, outerRadius: 1, noiseSalt: 338 },
    { center: { chunkX: 73, chunkY: 42 }, radiusX: CHUNK_SIZE * 2.25, radiusY: CHUNK_SIZE * 1.4, innerRadius: 0, outerRadius: 1, noiseSalt: 339 },
    { center: { chunkX: 62, chunkY: 84 }, radiusX: CHUNK_SIZE * 2.6, radiusY: CHUNK_SIZE * 1.55, innerRadius: 0, outerRadius: 1, noiseSalt: 340 },
];

const DUNGEON_LANDMARKS: WorldDungeonInfo[] = [
    { id: 'beginner_mine', name: 'Beginner Mine', nameKr: '초심자의 폐광', chunkX: 38, chunkY: 35, sprite: 'beginnerMine', tileSpan: 3, tileRadius: 4 },
    { id: 'beginner_ruins', name: 'Beginner Ruins', nameKr: '초보자 유적', chunkX: 62, chunkY: 28, sprite: 'beginnerRuins', tileSpan: 3, tileRadius: 4 },
    { id: 'dark_cave', name: 'Dark Cave', nameKr: '암흑 동굴', chunkX: 62, chunkY: 48, sprite: 'caveEntrance', tileSpan: 3, tileRadius: 4 },
    ...STORY_SCENARIOS.map((scenario) => ({
        id: scenario.dungeonId,
        name: scenario.dungeonNameEn,
        nameKr: scenario.dungeonNameKr,
        chunkX: scenario.chunkX,
        chunkY: scenario.chunkY,
        sprite: scenario.sprite,
        tileSpan: scenario.sprite === 'castle' ? 4 : 3,
        tileRadius: 4,
    })),
];

const BURGOS_CASTLE_DUNGEON = DUNGEON_LANDMARKS.find((dungeon) => dungeon.id === 'burgos_castle');
const TOWN_EXIT_FORMATION_OFFSETS: TilePoint[] = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
];
const MIN_TOWN_INTERACTION_RADIUS_TILES = 14;
const TOWN_INTERACTION_RADIUS_PER_CHUNK = 5;

interface TreeDecorationConfig {
    widthTiles: number;
    heightTiles: number;
    trunkOffsets: readonly TilePoint[];
    canopyClip: WorldMapDecorationClip;
}

interface BridgeDecorationConfig {
    widthTiles: number;
    heightTiles: number;
    passableOffsets: readonly TilePoint[];
}

const NORMAL_TREE_CHUNK_CHANCE = 0.035;
const SCARY_TREE_CHUNK_CHANCE = 0.18;
const GROUND_DETAIL_ATTEMPTS_PER_CHUNK = 32;
const AMBIENT_SITE_CHUNK_CHANCE = 0.46;
const AMBIENT_SITE_ROAD_SEARCH_RADIUS = 7;
const DECORATION_LOOKUP_MARGIN_TILES = 8;
const NORMAL_TREE_TILES = new Set<TileType>([TileType.GRASS, TileType.FOREST]);
const SCARY_TREE_TILES = new Set<TileType>([TileType.POISON_SWAMP]);
const NORMAL_TREE_CANOPY_TILES = new Set<TileType>([TileType.GRASS, TileType.FOREST, TileType.STONE]);
const SCARY_TREE_CANOPY_TILES = new Set<TileType>([TileType.POISON_SWAMP, TileType.STONE]);
export const NEUTRAL_BIRD_SPRITE_SRC = '/assets/images/monsters/791R.png';
const NEUTRAL_BIRD_FRAME_SIZE = 64;
const NEUTRAL_BIRD_FRAME_COUNT = 3;
const NEUTRAL_BIRD_FPS = 8;
const NEUTRAL_BIRD_CHUNK_CHANCE = 0.16;
const NEUTRAL_BIRD_RENDER_SCALE = 1.38;
const NEUTRAL_BIRD_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    right: 2,
    left: 3,
};

const TREE_DECORATION_CONFIGS: Record<TreeSpriteId, TreeDecorationConfig> = {
    largeTree: {
        widthTiles: 4.2,
        heightTiles: 4.45,
        trunkOffsets: [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
        ],
        canopyClip: { x: 0, y: 0, width: 1, height: 0.76 },
    },
    smallTree: {
        widthTiles: 3.55,
        heightTiles: 3.95,
        trunkOffsets: [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
        ],
        canopyClip: { x: 0, y: 0, width: 1, height: 0.68 },
    },
    scaryTree: {
        widthTiles: 4.35,
        heightTiles: 5.05,
        trunkOffsets: [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: -2 },
            { x: -1, y: -1 },
            { x: 1, y: -1 },
        ],
        canopyClip: { x: 0, y: 0, width: 1, height: 0.58 },
    },
};

const BRIDGE_DECORATION_CONFIGS: Record<BridgeSpriteId, BridgeDecorationConfig> = {
    woodBridgeHorizontal: {
        widthTiles: 5,
        heightTiles: 2.75,
        passableOffsets: [
            { x: -2, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
        ],
    },
    woodBridgeVertical: {
        widthTiles: 2.4,
        heightTiles: 5.4,
        passableOffsets: [
            { x: 0, y: -2 },
            { x: 0, y: -1 },
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: 2 },
        ],
    },
};

export class WorldMap {
    private chunks: Map<string, Chunk> = new Map();
    private decorationChunks: Map<string, WorldMapDecoration[]> = new Map();
    private groundDetailChunks: Map<string, WorldMapGroundDetail[]> = new Map();
    private ambientSiteChunks: Map<string, WorldMapAmbientSite[]> = new Map();
    private inspectedAmbientSiteIds: Set<string> = new Set();
    private townExitTileCache: Map<string, TilePoint> = new Map();
    private preloadChunkMargin: number = 1;
    private biomeMask: BiomeMask;
    private neutralBirdImage: HTMLImageElement | null = null;
    private neutralBirdImageLoaded = false;
    private worldInspectMarkers: WorldInspectMarker[] = [];

    public loot: LootObject[] = [];
    public extractionZones: ExtractionZone[] = [];

    constructor(realmOrMask: WorldRealm | BiomeMask = 'mortal', options: WorldMapOptions = {}) {
        this.biomeMask = typeof realmOrMask === 'string' ? new BiomeMask(realmOrMask) : realmOrMask;
        if (options.validateTownSpawns ?? true) this.validateTownSpawns();
    }

    public getRealm(): WorldRealm {
        return this.biomeMask.getRealm();
    }

    /** Biome of a chunk (chunk coordinates). Used by the field spawn resolver. */
    public getBiomeAtChunk(chunkX: number, chunkY: number): BiomeType {
        return this.biomeMask.getBiome(chunkX, chunkY);
    }

    public getDisplayName(): string {
        return this.getRealm() === 'master'
            ? t('world.realm.master')
            : t('world.realm.mortal');
    }

    public setRealm(realm: WorldRealm): void {
        if (this.getRealm() === realm) return;
        this.biomeMask = new BiomeMask(realm);
        this.chunks.clear();
        this.decorationChunks.clear();
        this.groundDetailChunks.clear();
        this.ambientSiteChunks.clear();
        this.inspectedAmbientSiteIds.clear();
        this.townExitTileCache.clear();
        this.loot = [];
        this.extractionZones = [];
        this.validateTownSpawns();
    }

    private chunkKey(cx: number, cy: number): string {
        return `${cx},${cy}`;
    }

    private hash(x: number, y: number, salt: number = 0): number {
        let h = x * 374761393 + y * 668265263 + salt * 1442695041;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
    }

    private smoothstep(t: number): number {
        return t * t * (3 - 2 * t);
    }

    private noise(x: number, y: number, scale: number, salt: number = 0): number {
        const sx = x * scale;
        const sy = y * scale;
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;
        const u = this.smoothstep(fx);
        const v = this.smoothstep(fy);

        const a = this.hash(ix, iy, salt);
        const b = this.hash(ix + 1, iy, salt);
        const c = this.hash(ix, iy + 1, salt);
        const d = this.hash(ix + 1, iy + 1, salt);

        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    private fbm(x: number, y: number, scale: number, salt: number = 0): number {
        return this.noise(x, y, scale, salt) * 0.56
            + this.noise(x + 113, y - 79, scale * 2.05, salt + 1) * 0.31
            + this.noise(x - 211, y + 157, scale * 4.15, salt + 2) * 0.13;
    }

    private tileToChunk(tx: number, ty: number): { chunkX: number; chunkY: number; localX: number; localY: number } {
        const chunkX = Math.floor(tx / CHUNK_SIZE);
        const chunkY = Math.floor(ty / CHUNK_SIZE);
        let localX = tx % CHUNK_SIZE;
        let localY = ty % CHUNK_SIZE;
        if (localX < 0) localX += CHUNK_SIZE;
        if (localY < 0) localY += CHUNK_SIZE;
        return { chunkX, chunkY, localX, localY };
    }

    private isChunkInBounds(chunkX: number, chunkY: number): boolean {
        return this.biomeMask.isInBounds(chunkX, chunkY);
    }

    private isOceanChunk(chunkX: number, chunkY: number): boolean {
        return this.biomeMask.getBiome(chunkX, chunkY) === 'ocean';
    }

    private isCoastOceanChunk(chunkX: number, chunkY: number): boolean {
        if (!this.isOceanChunk(chunkX, chunkY)) return false;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                if (!this.isOceanChunk(chunkX + dx, chunkY + dy)) return true;
            }
        }
        return false;
    }

    private routePointToTile(point: RoutePoint): TilePoint {
        return {
            x: point.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
            y: point.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        };
    }

    private pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
        const vx = bx - ax;
        const vy = by - ay;
        const wx = px - ax;
        const wy = py - ay;
        const lenSq = vx * vx + vy * vy;
        if (lenSq === 0) return Math.hypot(px - ax, py - ay);
        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
        const cx = ax + vx * t;
        const cy = ay + vy * t;
        return Math.hypot(px - cx, py - cy);
    }

    private distanceToRoute(tx: number, ty: number, route: TileRoute): number {
        let min = Infinity;
        for (let i = 0; i < route.points.length - 1; i++) {
            const a = this.routePointToTile(route.points[i]);
            const b = this.routePointToTile(route.points[i + 1]);
            min = Math.min(min, this.pointToSegmentDistance(tx, ty, a.x, a.y, b.x, b.y));
        }
        return min;
    }

    private isRouteTile(tx: number, ty: number, route: TileRoute, hardCenterWidth: number): boolean {
        const bounds = getTileRouteBounds(route);
        if (tx < bounds.minX || tx > bounds.maxX || ty < bounds.minY || ty > bounds.maxY) return false;
        const dist = this.distanceToRoute(tx, ty, route);
        if (dist <= hardCenterWidth) return true;

        const raggedEdge = (this.fbm(tx, ty, 0.035, route.noiseSalt) - 0.5) * 1.1;
        return dist <= route.width + raggedEdge;
    }

    private isRoadTile(tx: number, ty: number): boolean {
        return ROAD_ROUTES.some((route) => this.isRouteTile(tx, ty, route, 1.35));
    }

    private isRiverTile(tx: number, ty: number): boolean {
        return RIVER_ROUTES.some((route) => this.isRouteTile(tx, ty, route, 1.65));
    }

    private isScenarioWaterRouteTile(tx: number, ty: number): boolean {
        return SCENARIO_WATER_ROUTES.some((route) => this.isRouteTile(tx, ty, route, route.width * 0.55));
    }

    private isWaterBasinTile(tx: number, ty: number, basins: readonly WaterBasin[]): boolean {
        return basins.some((basin) => {
            const center = this.routePointToTile(basin.center);
            const dx = (tx - center.x) / basin.radiusX;
            const dy = (ty - center.y) / basin.radiusY;
            const dist = Math.hypot(dx, dy);
            if (dist > basin.outerRadius + 0.07) return false;
            if (basin.innerRadius > 0 && dist < basin.innerRadius - 0.07) return false;
            const raggedEdge = (this.fbm(tx, ty, 0.032, basin.noiseSalt) - 0.5) * 0.12;
            const coast = dist + raggedEdge;
            return coast <= basin.outerRadius && (basin.innerRadius <= 0 || coast >= basin.innerRadius);
        });
    }

    private isScenarioWaterTile(tx: number, ty: number): boolean {
        return this.isScenarioWaterRouteTile(tx, ty)
            || this.isWaterBasinTile(tx, ty, SCENARIO_WATER_BASINS);
    }

    private isInlandWaterTile(tx: number, ty: number): boolean {
        return this.isRiverTile(tx, ty)
            || this.isWaterBasinTile(tx, ty, INLAND_WATER_BASINS);
    }

    private computeTownTile(tx: number, ty: number, town: TownInfo): TileType {
        const centerX = town.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
        const centerY = town.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
        const dx = tx - centerX;
        const dy = ty - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const townRadiusTiles = town.radius * CHUNK_SIZE;

        if (Math.abs(dx) <= 7 && Math.abs(dy) <= 7) return TileType.TOWN;
        if (dist <= 13 && this.hash(tx, ty, 21) > 0.35) return TileType.TOWN;
        if ((Math.abs(dx) <= 2 || Math.abs(dy) <= 2) && dist <= townRadiusTiles * 0.9) return TileType.ROAD;
        if (Math.abs(dist - 18) <= 1.3 && this.hash(tx >> 1, ty >> 1, 24) > 0.22) return TileType.ROAD;

        const patch = this.fbm(tx, ty, 0.026, 22);
        const detail = this.fbm(tx, ty, 0.085, 23);
        if (detail > 0.94) return TileType.STONE;

        switch (town.id) {
            case 'nw_desert_city':
                if (patch < 0.08) return TileType.GRASS;
                if (patch > 0.72) return TileType.STONE;
                return TileType.SAND;
            case 'w_forest_village':
                if (patch < 0.2) return TileType.GRASS;
                if (detail > 0.82) return TileType.STONE;
                return TileType.FOREST;
            case 'central_castle':
                if (patch > 0.74) return TileType.STONE;
                if (detail > 0.7) return TileType.FOREST;
                return TileType.GRASS;
            case 'sw_hideout':
                if (patch < 0.1) return TileType.POISON_SWAMP;
                return detail > 0.38 ? TileType.FOREST : TileType.GRASS;
            case 's_coast_town':
            case 'se_port':
                if (patch < 0.28) return TileType.SAND;
                if (detail > 0.82) return TileType.FOREST;
                return TileType.GRASS;
            case 'e_stronghold':
                if (patch > 0.38) return TileType.STONE;
                return detail > 0.72 ? TileType.FOREST : TileType.GRASS;
            default:
                if (patch > 0.78) return TileType.STONE;
                if (detail > 0.68) return TileType.FOREST;
                return TileType.GRASS;
        }
    }

    private varyBiomeTile(base: TileType, tx: number, ty: number): TileType {
        const broad = this.fbm(tx, ty, 0.018, 40);
        const detail = this.fbm(tx, ty, 0.074, 41);

        switch (base) {
            case TileType.GRASS:
                if (broad > 0.72 && detail > 0.48) return TileType.FOREST;
                if (broad < 0.1 && detail > 0.62) return TileType.STONE;
                return TileType.GRASS;
            case TileType.FOREST:
                if (broad < 0.22) return TileType.GRASS;
                if (detail > 0.88) return TileType.STONE;
                return TileType.FOREST;
            case TileType.SAND:
                if (broad > 0.76) return TileType.STONE;
                if (broad < 0.08 && detail > 0.52) return TileType.GRASS;
                return TileType.SAND;
            case TileType.STONE:
                if (broad < 0.16) return TileType.GRASS;
                if (detail > 0.92) return TileType.SNOW;
                return TileType.STONE;
            case TileType.SNOW:
                if (broad < 0.16) return TileType.STONE;
                return TileType.SNOW;
            case TileType.LAVA:
                if (broad < 0.34) return TileType.STONE;
                return TileType.LAVA;
            case TileType.POISON_SWAMP:
                if (detail > 0.86) return TileType.STONE;
                return TileType.POISON_SWAMP;
            default:
                return base;
        }
    }

    private computeTileAt(tx: number, ty: number): TileType {
        const bounds = this.getBoundsTiles();
        if (tx < 0 || ty < 0 || tx >= bounds.width || ty >= bounds.height) {
            const distToMap = Math.max(
                tx < 0 ? -tx : tx >= bounds.width ? tx - bounds.width + 1 : 0,
                ty < 0 ? -ty : ty >= bounds.height ? ty - bounds.height + 1 : 0
            );
            return distToMap <= CHUNK_SIZE ? TileType.WATER : TileType.DEEP_WATER;
        }

        const { chunkX, chunkY, localX, localY } = this.tileToChunk(tx, ty);
        if (!this.isChunkInBounds(chunkX, chunkY)) return TileType.DEEP_WATER;

        const hmapTile = this.getHmapTile(tx, ty);
        if (hmapTile !== null) return hmapTile;

        if (this.getTempleAtTile(tx, ty)) return TileType.DUNGEON_ENTRANCE;
        if (this.getDungeonAtTile(tx, ty)) return TileType.DUNGEON_ENTRANCE;

        const biome = this.biomeMask.getBiome(chunkX, chunkY);
        if (biome === 'ocean') {
            return this.isCoastOceanChunk(chunkX, chunkY) ? TileType.WATER : TileType.DEEP_WATER;
        }
        if (biome === 'town') {
            const town = this.getTownTerrainAtTile(tx, ty);
            return town ? this.computeTownTile(tx, ty, town) : TileType.GRASS;
        }

        if (this.isScenarioWaterTile(tx, ty)) {
            return this.isRoadTile(tx, ty) ? TileType.ROAD : TileType.WATER;
        }

        if (biome === 'special') {
            const dx = localX - CHUNK_SIZE / 2;
            const dy = localY - CHUNK_SIZE / 2;
            if (Math.sqrt(dx * dx + dy * dy) <= 4) return TileType.DUNGEON_ENTRANCE;
            if (this.isRoadTile(tx, ty)) return TileType.ROAD;
            if (this.isInlandWaterTile(tx, ty)) return TileType.WATER;
            return this.hash(tx, ty, 9) > 0.82 ? TileType.STONE : TileType.POISON_SWAMP;
        }

        if (this.isRoadTile(tx, ty)) return TileType.ROAD;
        if (this.isInlandWaterTile(tx, ty)) return TileType.WATER;

        const base = BIOME_TILE[biome];
        return this.varyBiomeTile(base, tx, ty);
    }

    /**
     * Resolve the scenario heightmap tile at a world tile, blending feathered
     * edges and picking, where scenarios overlap, the one this tile sits deeper
     * inside (largest weight). Returns null to fall through to procedural biome.
     */
    private getHmapTile(tx: number, ty: number): TileType | null {
        let best: HmapSample | null = null;
        const consider = (sample: HmapSample | null): void => {
            if (sample && (!best || sample.weight > best.weight)) best = sample;
        };

        if (BURGOS_CASTLE_DUNGEON) {
            consider(getBurgosCastleHmapTileAt(tx, ty, this.getDungeonEntranceTile(BURGOS_CASTLE_DUNGEON)));
        }
        for (const scenario of STORY_SCENARIOS) {
            if (scenario.episode < 2) continue;
            const dungeon = DUNGEON_LANDMARKS.find((entry) => entry.id === scenario.dungeonId);
            if (!dungeon) continue;
            consider(getStoryHmapTileAt(scenario.episode, tx, ty, this.getDungeonEntranceTile(dungeon)));
        }
        if (!best) return null;
        const sample = best as HmapSample;
        // Roads and inland waterways stay on top of the feathered edge so the travel network
        // and its bridges remain connected; only the scenario interior wins, so
        // connecting roads tuck under a dungeon core instead of carving through it.
        if (this.isScenarioWaterTile(tx, ty) && sample.tile !== TileType.DUNGEON_ENTRANCE && sample.tile !== TileType.ROAD) {
            return null;
        }
        if (sample.weight < HMAP_BLEND_BAND && (this.isRoadTile(tx, ty) || this.isInlandWaterTile(tx, ty) || this.isScenarioWaterTile(tx, ty))) {
            return null;
        }
        return sample.tile;
    }

    private generateChunk(chunkX: number, chunkY: number): Chunk {
        const tiles: TileType[][] = [];
        const baseX = chunkX * CHUNK_SIZE;
        const baseY = chunkY * CHUNK_SIZE;

        for (let y = 0; y < CHUNK_SIZE; y++) {
            const row: TileType[] = [];
            for (let x = 0; x < CHUNK_SIZE; x++) {
                row.push(this.computeTileAt(baseX + x, baseY + y));
            }
            tiles.push(row);
        }

        return new Chunk(chunkX, chunkY, tiles);
    }

    private getDecorationChunk(chunkX: number, chunkY: number): readonly WorldMapDecoration[] {
        const key = this.chunkKey(chunkX, chunkY);
        const cached = this.decorationChunks.get(key);
        if (cached) return cached;

        const generated = this.generateDecorationsForChunk(chunkX, chunkY);
        this.decorationChunks.set(key, generated);
        return generated;
    }

    private generateDecorationsForChunk(chunkX: number, chunkY: number): WorldMapDecoration[] {
        if (!this.isChunkInBounds(chunkX, chunkY) || this.isOceanChunk(chunkX, chunkY)) return [];

        const decorations: WorldMapDecoration[] = [];
        const bridge = this.createBridgeDecorationForChunk(chunkX, chunkY);
        if (bridge) decorations.push(bridge);

        if (this.hash(chunkX, chunkY, 501) < NORMAL_TREE_CHUNK_CHANCE) {
            const sprite: TreeSpriteId = this.hash(chunkX, chunkY, 502) < 0.48 ? 'largeTree' : 'smallTree';
            const anchor = this.pickDecorationAnchorTile(chunkX, chunkY, 503);
            const decoration = this.createTreeDecoration(sprite, anchor);
            if (this.canPlaceTreeDecoration(decoration, NORMAL_TREE_TILES, NORMAL_TREE_CANOPY_TILES)) decorations.push(decoration);
        }

        if (this.hash(chunkX, chunkY, 601) < SCARY_TREE_CHUNK_CHANCE) {
            const anchor = this.pickDecorationAnchorTileForTerrain(chunkX, chunkY, 602, SCARY_TREE_TILES);
            if (anchor) {
                const decoration = this.createTreeDecoration('scaryTree', anchor);
                if (this.canPlaceTreeDecoration(decoration, SCARY_TREE_TILES, SCARY_TREE_CANOPY_TILES)) decorations.push(decoration);
            }
        }

        return decorations;
    }

    public getGroundDetailsForChunk(chunkX: number, chunkY: number): readonly WorldMapGroundDetail[] {
        if (!this.isChunkInBounds(chunkX, chunkY) || this.isOceanChunk(chunkX, chunkY)) return [];
        const chunkKey = this.chunkKey(chunkX, chunkY);
        const cached = this.groundDetailChunks.get(chunkKey);
        if (cached) return cached;

        const details: WorldMapGroundDetail[] = [];
        const occupied = new Set<string>();
        const baseX = chunkX * CHUNK_SIZE;
        const baseY = chunkY * CHUNK_SIZE;
        for (let attempt = 0; attempt < GROUND_DETAIL_ATTEMPTS_PER_CHUNK; attempt++) {
            const tx = baseX + 1 + Math.floor(this.hash(chunkX * 37 + attempt, chunkY * 19, 901) * (CHUNK_SIZE - 2));
            const ty = baseY + 1 + Math.floor(this.hash(chunkX * 23, chunkY * 41 + attempt, 902) * (CHUNK_SIZE - 2));
            const key = `${tx},${ty}`;
            if (occupied.has(key)) continue;
            occupied.add(key);

            if (this.getTownAtTile(tx, ty) || this.getTempleAtTile(tx, ty) || this.getDungeonAtTile(tx, ty)) continue;
            const kind = this.pickGroundDetailKind(this.getTileAt(tx, ty), this.hash(tx, ty, 903));
            if (!kind) continue;

            details.push({
                kind,
                tile: { x: tx, y: ty },
                offsetX: (this.hash(tx, ty, 904) - 0.5) * 0.5,
                offsetY: (this.hash(tx, ty, 905) - 0.5) * 0.36,
                scale: 0.72 + this.hash(tx, ty, 906) * 0.5,
                mirrored: this.hash(tx, ty, 907) < 0.5,
            });
        }
        this.groundDetailChunks.set(chunkKey, details);
        return details;
    }

    private pickGroundDetailKind(tile: TileType, roll: number): WorldMapGroundDetailKind | null {
        if (tile === TileType.GRASS) return roll < 0.62 ? 'grassTuft' : roll < 0.86 ? 'wildflowers' : 'pebbles';
        if (tile === TileType.FOREST) return roll < 0.58 ? 'grassTuft' : roll < 0.82 ? 'forestMushrooms' : 'pebbles';
        if (tile === TileType.STONE) return roll < 0.76 ? 'pebbles' : 'dryBrush';
        if (tile === TileType.SAND) return roll < 0.68 ? 'dryBrush' : 'pebbles';
        if (tile === TileType.SNOW) return roll < 0.72 ? 'snowShrub' : 'pebbles';
        if (tile === TileType.POISON_SWAMP) return roll < 0.72 ? 'swampReeds' : 'forestMushrooms';
        return null;
    }

    public getAmbientSitesForChunk(chunkX: number, chunkY: number): readonly WorldMapAmbientSite[] {
        if (!this.isChunkInBounds(chunkX, chunkY) || this.isOceanChunk(chunkX, chunkY)) return [];
        const chunkKey = this.chunkKey(chunkX, chunkY);
        const cached = this.ambientSiteChunks.get(chunkKey);
        if (cached) return cached;

        const sites: WorldMapAmbientSite[] = [];
        if (this.hash(chunkX, chunkY, 951) < AMBIENT_SITE_CHUNK_CHANCE) {
            const baseX = chunkX * CHUNK_SIZE;
            const baseY = chunkY * CHUNK_SIZE;
            for (let attempt = 0; attempt < 28; attempt++) {
                const tx = baseX + 3 + Math.floor(this.hash(chunkX * 43 + attempt, chunkY * 17, 952) * (CHUNK_SIZE - 6));
                const ty = baseY + 3 + Math.floor(this.hash(chunkX * 13, chunkY * 47 + attempt, 953) * (CHUNK_SIZE - 6));
                if (!this.canPlaceAmbientSite(tx, ty)) continue;
                const tile = this.getTileAt(tx, ty);
                sites.push({
                    id: `${this.getRealm()}:${chunkX},${chunkY}:${tx},${ty}`,
                    kind: this.pickAmbientSiteKind(tile, this.hash(tx, ty, 954)),
                    anchorTile: { x: tx, y: ty },
                    bounds: { minX: tx - 1, minY: ty - 1, maxX: tx + 1, maxY: ty + 1 },
                    mirrored: this.hash(tx, ty, 955) < 0.5,
                });
                break;
            }
        }

        this.ambientSiteChunks.set(chunkKey, sites);
        return sites;
    }

    public getAmbientSitesNearTile(tile: TilePoint, radius: number = 1): WorldMapAmbientSite[] {
        const minChunkX = Math.floor((tile.x - radius) / CHUNK_SIZE);
        const maxChunkX = Math.floor((tile.x + radius) / CHUNK_SIZE);
        const minChunkY = Math.floor((tile.y - radius) / CHUNK_SIZE);
        const maxChunkY = Math.floor((tile.y + radius) / CHUNK_SIZE);
        const sites: WorldMapAmbientSite[] = [];
        for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
            for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
                for (const site of this.getAmbientSitesForChunk(chunkX, chunkY)) {
                    if (Math.abs(site.anchorTile.x - tile.x) + Math.abs(site.anchorTile.y - tile.y) <= radius) {
                        sites.push(site);
                    }
                }
            }
        }
        return sites;
    }

    public getAmbientSiteById(siteId: string): WorldMapAmbientSite | null {
        const match = /^([^:]+):(-?\d+),(-?\d+):(-?\d+),(-?\d+)$/.exec(siteId);
        if (!match || match[1] !== this.getRealm()) return null;
        const chunkX = Number(match[2]);
        const chunkY = Number(match[3]);
        return this.getAmbientSitesForChunk(chunkX, chunkY).find((site) => site.id === siteId) ?? null;
    }

    public setInspectedAmbientSiteIds(siteIds: readonly string[]): void {
        this.inspectedAmbientSiteIds = new Set(siteIds);
    }

    public markAmbientSiteInspected(siteId: string): void {
        this.inspectedAmbientSiteIds.add(siteId);
    }

    public isAmbientSiteInspected(siteId: string): boolean {
        return this.inspectedAmbientSiteIds.has(siteId);
    }

    private pickAmbientSiteKind(tile: TileType, roll: number): WorldMapAmbientSiteKind {
        if (tile === TileType.POISON_SWAMP) return 'swampTotem';
        if (tile === TileType.STONE || tile === TileType.SNOW) return 'brokenWaystone';
        if (tile === TileType.SAND) return roll < 0.7 ? 'abandonedCamp' : 'roadsideRuins';
        return roll < 0.52 ? 'abandonedCamp' : 'roadsideRuins';
    }

    private canPlaceAmbientSite(tx: number, ty: number): boolean {
        const anchorTile = this.getTileAt(tx, ty);
        if (![
            TileType.GRASS,
            TileType.FOREST,
            TileType.STONE,
            TileType.SAND,
            TileType.SNOW,
            TileType.POISON_SWAMP,
        ].includes(anchorTile)) return false;
        if (!this.hasRoadNearTile(tx, ty, AMBIENT_SITE_ROAD_SEARCH_RADIUS)) return false;

        for (let y = ty - 1; y <= ty + 1; y++) {
            for (let x = tx - 1; x <= tx + 1; x++) {
                const tile = this.getTileAt(x, y);
                if (!TILE_PROPERTIES[tile]?.walkable || tile === TileType.ROAD || tile === TileType.TOWN || tile === TileType.DUNGEON_ENTRANCE) {
                    return false;
                }
                if (this.getTownAtTile(x, y) || this.getTempleAtTile(x, y) || this.getDungeonAtTile(x, y)) return false;
                if (this.isDecorationBlocked(x, y)) return false;
            }
        }
        return true;
    }

    private hasRoadNearTile(tx: number, ty: number, radius: number): boolean {
        for (let distance = 2; distance <= radius; distance++) {
            for (let offset = -distance; offset <= distance; offset++) {
                const candidates = [
                    { x: tx + offset, y: ty - distance },
                    { x: tx + offset, y: ty + distance },
                    { x: tx - distance, y: ty + offset },
                    { x: tx + distance, y: ty + offset },
                ];
                if (candidates.some((candidate) => this.getTileAt(candidate.x, candidate.y) === TileType.ROAD)) return true;
            }
        }
        return false;
    }

    private pickDecorationAnchorTile(chunkX: number, chunkY: number, salt: number): TilePoint {
        const localSpan = CHUNK_SIZE - 8;
        return {
            x: chunkX * CHUNK_SIZE + 4 + Math.floor(this.hash(chunkX, chunkY, salt) * localSpan),
            y: chunkY * CHUNK_SIZE + 4 + Math.floor(this.hash(chunkX, chunkY, salt + 1) * localSpan),
        };
    }

    private pickDecorationAnchorTileForTerrain(
        chunkX: number,
        chunkY: number,
        salt: number,
        allowedTiles: ReadonlySet<TileType>
    ): TilePoint | null {
        const localSpan = CHUNK_SIZE - 8;
        for (let attempt = 0; attempt < 24; attempt++) {
            const x = chunkX * CHUNK_SIZE + 4 + Math.floor(this.hash(chunkX * 31 + attempt, chunkY * 17, salt) * localSpan);
            const y = chunkY * CHUNK_SIZE + 4 + Math.floor(this.hash(chunkX * 17, chunkY * 31 + attempt, salt + 1) * localSpan);
            if (allowedTiles.has(this.getTileAt(x, y))) return { x, y };
        }
        return null;
    }

    private createBridgeDecorationForChunk(chunkX: number, chunkY: number): WorldMapBridgeDecoration | null {
        const baseX = chunkX * CHUNK_SIZE;
        const baseY = chunkY * CHUNK_SIZE;
        let best: { decoration: WorldMapBridgeDecoration; score: number } | null = null;

        for (let localY = 4; localY < CHUNK_SIZE - 4; localY++) {
            for (let localX = 4; localX < CHUNK_SIZE - 4; localX++) {
                const tx = baseX + localX;
                const ty = baseY + localY;
                if (!this.isRoadTile(tx, ty) || !this.isInlandWaterTile(tx, ty)) continue;

                const sprite = this.pickBridgeSprite(tx, ty);
                if (!sprite) continue;

                const decoration = this.createBridgeDecoration(sprite, { x: tx, y: ty });
                if (!this.canPlaceBridgeDecoration(decoration)) continue;

                const score = this.hash(tx, ty, 701);
                if (!best || score < best.score) best = { decoration, score };
            }
        }

        return best?.decoration ?? null;
    }

    private pickBridgeSprite(tx: number, ty: number): BridgeSpriteId | null {
        const roadHorizontal = this.countRouteHits([
            { x: tx - 3, y: ty },
            { x: tx - 2, y: ty },
            { x: tx + 2, y: ty },
            { x: tx + 3, y: ty },
        ], (tile) => this.isRoadTile(tile.x, tile.y));
        const roadVertical = this.countRouteHits([
            { x: tx, y: ty - 3 },
            { x: tx, y: ty - 2 },
            { x: tx, y: ty + 2 },
            { x: tx, y: ty + 3 },
        ], (tile) => this.isRoadTile(tile.x, tile.y));
        const riverHorizontal = this.countRouteHits([
            { x: tx - 3, y: ty },
            { x: tx - 2, y: ty },
            { x: tx + 2, y: ty },
            { x: tx + 3, y: ty },
        ], (tile) => this.isInlandWaterTile(tile.x, tile.y));
        const riverVertical = this.countRouteHits([
            { x: tx, y: ty - 3 },
            { x: tx, y: ty - 2 },
            { x: tx, y: ty + 2 },
            { x: tx, y: ty + 3 },
        ], (tile) => this.isInlandWaterTile(tile.x, tile.y));

        if (roadHorizontal >= roadVertical && riverVertical >= riverHorizontal) return 'woodBridgeHorizontal';
        if (roadVertical > roadHorizontal && riverHorizontal >= riverVertical) return 'woodBridgeVertical';
        if (roadHorizontal > roadVertical) return 'woodBridgeHorizontal';
        if (roadVertical > roadHorizontal) return 'woodBridgeVertical';
        return null;
    }

    private countRouteHits(tiles: readonly TilePoint[], predicate: (tile: TilePoint) => boolean): number {
        return tiles.reduce((count, tile) => count + (predicate(tile) ? 1 : 0), 0);
    }

    private createBridgeDecoration(sprite: BridgeSpriteId, anchorTile: TilePoint): WorldMapBridgeDecoration {
        const config = BRIDGE_DECORATION_CONFIGS[sprite];
        const left = anchorTile.x + 0.5 - config.widthTiles / 2;
        const top = anchorTile.y + 0.5 - config.heightTiles / 2;
        return {
            kind: 'bridge',
            sprite,
            anchorTile: { ...anchorTile },
            passableTiles: config.passableOffsets.map((offset) => ({
                x: anchorTile.x + offset.x,
                y: anchorTile.y + offset.y,
            })),
            bounds: {
                minX: Math.floor(left),
                minY: Math.floor(top),
                maxX: Math.ceil(left + config.widthTiles),
                maxY: Math.ceil(top + config.heightTiles),
            },
        };
    }

    private canPlaceBridgeDecoration(decoration: WorldMapBridgeDecoration): boolean {
        const bounds = this.getBoundsTiles();
        if (
            decoration.bounds.minX <= 1 ||
            decoration.bounds.minY <= 1 ||
            decoration.bounds.maxX >= bounds.width - 1 ||
            decoration.bounds.maxY >= bounds.height - 1
        ) {
            return false;
        }

        if (!this.isRoadTile(decoration.anchorTile.x, decoration.anchorTile.y) || !this.isInlandWaterTile(decoration.anchorTile.x, decoration.anchorTile.y)) {
            return false;
        }
        const anchorTile = this.getTileAt(decoration.anchorTile.x, decoration.anchorTile.y);
        if (anchorTile !== TileType.ROAD && anchorTile !== TileType.WATER) return false;

        for (let y = decoration.bounds.minY; y <= decoration.bounds.maxY; y++) {
            for (let x = decoration.bounds.minX; x <= decoration.bounds.maxX; x++) {
                if (this.getTownAtTile(x, y) || this.getTempleAtTile(x, y) || this.getDungeonAtTile(x, y)) return false;
            }
        }

        return decoration.passableTiles.every((tile) => {
            const visibleTile = this.getTileAt(tile.x, tile.y);
            return (visibleTile === TileType.ROAD || visibleTile === TileType.WATER) &&
                (this.isRoadTile(tile.x, tile.y) || this.isInlandWaterTile(tile.x, tile.y));
        });
    }

    private createTreeDecoration(sprite: TreeSpriteId, anchorTile: TilePoint): WorldMapTreeDecoration {
        const config = TREE_DECORATION_CONFIGS[sprite];
        const left = anchorTile.x + 0.5 - config.widthTiles / 2;
        const top = anchorTile.y + 1 - config.heightTiles;
        return {
            kind: 'tree',
            sprite,
            anchorTile: { ...anchorTile },
            trunkTiles: config.trunkOffsets.map((offset) => ({
                x: anchorTile.x + offset.x,
                y: anchorTile.y + offset.y,
            })),
            canopyClip: { ...config.canopyClip },
            bounds: {
                minX: Math.floor(left),
                minY: Math.floor(top),
                maxX: Math.ceil(left + config.widthTiles),
                maxY: Math.ceil(top + config.heightTiles),
            },
        };
    }

    private canPlaceTreeDecoration(
        decoration: WorldMapTreeDecoration,
        trunkTilesAllowed: ReadonlySet<TileType>,
        canopyTilesAllowed: ReadonlySet<TileType>
    ): boolean {
        const bounds = this.getBoundsTiles();
        if (
            decoration.bounds.minX <= 1 ||
            decoration.bounds.minY <= 1 ||
            decoration.bounds.maxX >= bounds.width - 1 ||
            decoration.bounds.maxY >= bounds.height - 1
        ) {
            return false;
        }

        for (let y = decoration.bounds.minY; y <= decoration.bounds.maxY; y++) {
            for (let x = decoration.bounds.minX; x <= decoration.bounds.maxX; x++) {
                const tile = this.getTileAt(x, y);
                if (!canopyTilesAllowed.has(tile)) return false;
                if (this.getTownAtTile(x, y) || this.getTempleAtTile(x, y) || this.getDungeonAtTile(x, y)) return false;
            }
        }

        return decoration.trunkTiles.every((tile) => trunkTilesAllowed.has(this.getTileAt(tile.x, tile.y)));
    }

    public updateLoadedChunks(worldCenterX: number, worldCenterY: number, viewW?: number, viewH?: number): void {
        const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;
        const halfViewW = viewW !== undefined ? viewW / 2 : this.preloadChunkMargin * chunkPixelSize;
        const halfViewH = viewH !== undefined ? viewH / 2 : this.preloadChunkMargin * chunkPixelSize;
        const minChunkX = Math.floor((worldCenterX - halfViewW) / chunkPixelSize) - this.preloadChunkMargin;
        const maxChunkX = Math.floor((worldCenterX + halfViewW) / chunkPixelSize) + this.preloadChunkMargin;
        const minChunkY = Math.floor((worldCenterY - halfViewH) / chunkPixelSize) - this.preloadChunkMargin;
        const maxChunkY = Math.floor((worldCenterY + halfViewH) / chunkPixelSize) + this.preloadChunkMargin;
        const needed = new Set<string>();

        for (let cy = minChunkY; cy <= maxChunkY; cy++) {
            for (let cx = minChunkX; cx <= maxChunkX; cx++) {
                const key = this.chunkKey(cx, cy);
                needed.add(key);
                if (!this.chunks.has(key)) {
                    this.chunks.set(key, this.generateChunk(cx, cy));
                }
            }
        }

        for (const key of this.chunks.keys()) {
            if (!needed.has(key)) this.chunks.delete(key);
        }
        for (const cache of [this.decorationChunks, this.groundDetailChunks, this.ambientSiteChunks]) {
            for (const key of cache.keys()) {
                if (!needed.has(key)) cache.delete(key);
            }
        }
    }

    public getStreamingCacheCounts(): {
        chunks: number;
        decorations: number;
        groundDetails: number;
        ambientSites: number;
    } {
        return {
            chunks: this.chunks.size,
            decorations: this.decorationChunks.size,
            groundDetails: this.groundDetailChunks.size,
            ambientSites: this.ambientSiteChunks.size,
        };
    }

    public markAllDirty(): void {
        for (const c of this.chunks.values()) c.markDirty();
    }

    public setInspectMarkers(markers: readonly WorldInspectMarker[]): void {
        this.worldInspectMarkers = markers.map((marker) => ({
            ...marker,
            tile: { ...marker.tile },
        }));
    }

    public getInspectMarkers(): WorldInspectMarker[] {
        return this.worldInspectMarkers.map((marker) => ({
            ...marker,
            tile: { ...marker.tile },
        }));
    }

    public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, vw: number, vh: number, renderScale: number = 1): void {
        for (const chunk of this.chunks.values()) {
            const sx = chunk.chunkX * CHUNK_SIZE * TILE_SIZE - cameraX;
            const sy = chunk.chunkY * CHUNK_SIZE * TILE_SIZE - cameraY;
            const ps = CHUNK_SIZE * TILE_SIZE;
            if (sx + ps < 0 || sx > vw || sy + ps < 0 || sy > vh) continue;
            chunk.render(ctx, sx, sy, (nx, ny) => this.getTileAt(nx, ny), renderScale);
        }

        this.renderGroundDetails(ctx, cameraX, cameraY, vw, vh);
        this.renderAmbientSites(ctx, cameraX, cameraY, vw, vh);
        this.renderDecorations(ctx, cameraX, cameraY, vw, vh, false);
        this.renderTownLandmarks(ctx, cameraX, cameraY, vw, vh);
        this.renderTempleLandmarks(ctx, cameraX, cameraY, vw, vh);
        this.renderStoryInteriorEntrances(ctx, cameraX, cameraY, vw, vh);
        this.renderNeutralBirds(ctx, cameraX, cameraY, vw, vh);
        this.renderWorldInspectMarkers(ctx, cameraX, cameraY, vw, vh);

        for (const zone of this.extractionZones) {
            zone.render(ctx, (gx, gy) => ({
                x: gx * TILE_SIZE - cameraX,
                y: gy * TILE_SIZE - cameraY
            }), TILE_SIZE);
        }

        for (const obj of this.loot) {
            obj.render(ctx, obj.x * TILE_SIZE - cameraX, obj.y * TILE_SIZE - cameraY, TILE_SIZE);
        }
    }

    public renderDecorationOverlays(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, vw: number, vh: number): void {
        this.renderDecorations(ctx, cameraX, cameraY, vw, vh, true);
    }

    public getTileAt(tx: number, ty: number): TileType {
        const { chunkX, chunkY, localX, localY } = this.tileToChunk(tx, ty);
        const chunk = this.chunks.get(this.chunkKey(chunkX, chunkY));
        if (chunk) return chunk.getTile(localX, localY);

        return this.computeTileAt(tx, ty);
    }

    public isWalkable(tx: number, ty: number): boolean {
        return (this.isTerrainWalkable(tx, ty) || this.isDecorationPassable(tx, ty)) && !this.isDecorationBlocked(tx, ty);
    }

    public getDecorationsInTileRect(minX: number, minY: number, maxX: number, maxY: number): readonly WorldMapDecoration[] {
        const expandedMin = this.tileToChunk(minX - DECORATION_LOOKUP_MARGIN_TILES, minY - DECORATION_LOOKUP_MARGIN_TILES);
        const expandedMax = this.tileToChunk(maxX + DECORATION_LOOKUP_MARGIN_TILES, maxY + DECORATION_LOOKUP_MARGIN_TILES);
        const decorations: WorldMapDecoration[] = [];

        for (let chunkY = expandedMin.chunkY; chunkY <= expandedMax.chunkY; chunkY++) {
            for (let chunkX = expandedMin.chunkX; chunkX <= expandedMax.chunkX; chunkX++) {
                for (const decoration of this.getDecorationChunk(chunkX, chunkY)) {
                    if (this.decorationIntersectsTileRect(decoration, minX, minY, maxX, maxY)) {
                        decorations.push(decoration);
                    }
                }
            }
        }

        return decorations;
    }

    public isDecorationBlocked(tx: number, ty: number): boolean {
        const expandedMin = this.tileToChunk(tx - DECORATION_LOOKUP_MARGIN_TILES, ty - DECORATION_LOOKUP_MARGIN_TILES);
        const expandedMax = this.tileToChunk(tx + DECORATION_LOOKUP_MARGIN_TILES, ty + DECORATION_LOOKUP_MARGIN_TILES);

        for (let chunkY = expandedMin.chunkY; chunkY <= expandedMax.chunkY; chunkY++) {
            for (let chunkX = expandedMin.chunkX; chunkX <= expandedMax.chunkX; chunkX++) {
                for (const decoration of this.getDecorationChunk(chunkX, chunkY)) {
                    if (!this.decorationIntersectsTileRect(decoration, tx, ty, tx, ty)) continue;
                    if (decoration.kind === 'tree' && decoration.trunkTiles.some((tile) => tile.x === tx && tile.y === ty)) return true;
                }
            }
        }

        return false;
    }

    private isDecorationPassable(tx: number, ty: number): boolean {
        const expandedMin = this.tileToChunk(tx - DECORATION_LOOKUP_MARGIN_TILES, ty - DECORATION_LOOKUP_MARGIN_TILES);
        const expandedMax = this.tileToChunk(tx + DECORATION_LOOKUP_MARGIN_TILES, ty + DECORATION_LOOKUP_MARGIN_TILES);

        for (let chunkY = expandedMin.chunkY; chunkY <= expandedMax.chunkY; chunkY++) {
            for (let chunkX = expandedMin.chunkX; chunkX <= expandedMax.chunkX; chunkX++) {
                for (const decoration of this.getDecorationChunk(chunkX, chunkY)) {
                    if (decoration.kind !== 'bridge') continue;
                    if (!this.decorationIntersectsTileRect(decoration, tx, ty, tx, ty)) continue;
                    if (decoration.passableTiles.some((tile) => tile.x === tx && tile.y === ty)) return true;
                }
            }
        }

        return false;
    }

    private isTerrainWalkable(tx: number, ty: number): boolean {
        return !!TILE_PROPERTIES[this.getTileAt(tx, ty)]?.walkable;
    }

    public getTowns(): TownInfo[] {
        return this.biomeMask.getTowns();
    }

    public getTemples(): TempleInfo[] {
        return this.biomeMask.getTemples();
    }

    public getDungeons(): WorldDungeonInfo[] {
        return DUNGEON_LANDMARKS;
    }

    public getMapLandmarks(): WorldMapLandmark[] {
        const chunkCenter = (chunkX: number, chunkY: number): TilePoint => ({
            x: chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
            y: chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        });

        return [
            ...this.getTowns().map((town) => ({
                ...chunkCenter(town.chunkX, town.chunkY),
                label: this.getLocalizedLandmarkName(town),
                kind: 'town' as const,
            })),
            ...this.getTemples().map((temple) => ({
                ...chunkCenter(temple.chunkX, temple.chunkY),
                label: this.getLocalizedLandmarkName(temple),
                kind: 'temple' as const,
            })),
            ...this.getDungeons().map((dungeon) => ({
                ...chunkCenter(dungeon.chunkX, dungeon.chunkY),
                label: this.getLocalizedLandmarkName(dungeon),
                kind: 'dungeon' as const,
            })),
        ];
    }

    private getLocalizedLandmarkName(entry: { name: string; nameKr: string }): string {
        return i18n.lang === 'ko' ? entry.nameKr : entry.name;
    }

    public getTempleAtTile(tx: number, ty: number): TempleInfo | null {
        for (const temple of this.getTemples()) {
            const center = this.getTempleCenterTile(temple);
            if (Math.hypot(tx - center.x, ty - center.y) <= temple.tileRadius) return temple;
        }
        return null;
    }

    public getDungeonAtTile(tx: number, ty: number): WorldDungeonInfo | null {
        for (const dungeon of this.getDungeons()) {
            const center = this.getDungeonEntranceTile(dungeon);
            if (Math.hypot(tx - center.x, ty - center.y) <= dungeon.tileRadius) return dungeon;
        }
        return null;
    }

    public getDungeonEntranceTile(dungeon: WorldDungeonInfo): TilePoint {
        return {
            x: dungeon.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
            y: dungeon.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        };
    }

    public getTempleCenterTile(temple: TempleInfo): TilePoint {
        return {
            x: temple.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
            y: temple.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        };
    }

    public getPrimaryTempleTile(): TilePoint {
        const temple = this.getTemples()[0];
        if (!temple) return this.getTownSpawnTile(this.getTowns()[0]);
        return this.getTempleCenterTile(temple);
    }

    public getTownAtTile(tx: number, ty: number): TownInfo | null {
        for (const town of this.getTowns()) {
            const center = this.getTownCenterTile(town);
            const dx = tx - center.x;
            const dy = ty - center.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.getTownInteractionRadiusTiles(town)) return town;
        }
        return null;
    }

    private getTownTerrainAtTile(tx: number, ty: number): TownInfo | null {
        const { chunkX, chunkY } = this.tileToChunk(tx, ty);
        for (const town of this.getTowns()) {
            const dx = chunkX - town.chunkX;
            const dy = chunkY - town.chunkY;
            if (Math.sqrt(dx * dx + dy * dy) <= town.radius) return town;
        }
        return null;
    }

    private getTownCenterTile(town: TownInfo): TilePoint {
        return {
            x: town.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
            y: town.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        };
    }

    private getTownInteractionRadiusTiles(town: TownInfo): number {
        return Math.max(MIN_TOWN_INTERACTION_RADIUS_TILES, town.radius * TOWN_INTERACTION_RADIUS_PER_CHUNK);
    }

    public getTownSpawnTile(town: TownInfo): TilePoint {
        const center = this.getTownCenterTile(town);
        const maxRadius = this.getTownInteractionRadiusTiles(town);

        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const tx = center.x + dx;
                    const ty = center.y + dy;
                    if (this.isWalkable(tx, ty) && this.getTownAtTile(tx, ty)?.id === town.id) {
                        return { x: tx, y: ty };
                    }
                }
            }
        }

        return center;
    }

    public getTownExitTile(town: TownInfo): TilePoint {
        const cacheKey = `${this.getRealm()}:${town.id}`;
        const cached = this.townExitTileCache.get(cacheKey);
        if (cached) return { ...cached };

        const exit = this.computeTownExitTile(town);
        this.townExitTileCache.set(cacheKey, { ...exit });
        return exit;
    }

    private computeTownExitTile(town: TownInfo): TilePoint {
        const center = this.getTownCenterTile(town);
        const searchRadius = this.getTownInteractionRadiusTiles(town) + 12;
        let bestSafeRoadExit: { tile: TilePoint; score: number } | null = null;
        let bestSafeExit: { tile: TilePoint; score: number } | null = null;
        let bestRoadExit: { tile: TilePoint; score: number } | null = null;
        let bestAdjacentExit: { tile: TilePoint; score: number } | null = null;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const tx = center.x + dx;
                const ty = center.y + dy;
                if (!this.isWalkable(tx, ty) || this.getTownAtTile(tx, ty)?.id === town.id) continue;
                const score = dx * dx + dy * dy;
                const candidate = { tile: { x: tx, y: ty }, score };
                if (this.isTownExitFormationSafe(town, candidate.tile)) {
                    if (!bestSafeExit || score < bestSafeExit.score) bestSafeExit = candidate;
                    if (this.getTileAt(tx, ty) === TileType.ROAD && (!bestSafeRoadExit || score < bestSafeRoadExit.score)) {
                        bestSafeRoadExit = candidate;
                    }
                }

                const isAdjacentToTown = [
                    { x: tx + 1, y: ty },
                    { x: tx - 1, y: ty },
                    { x: tx, y: ty + 1 },
                    { x: tx, y: ty - 1 },
                    { x: tx + 1, y: ty + 1 },
                    { x: tx - 1, y: ty - 1 },
                    { x: tx + 1, y: ty - 1 },
                    { x: tx - 1, y: ty + 1 },
                ].some((tile) => this.getTownAtTile(tile.x, tile.y)?.id === town.id);
                if (!isAdjacentToTown) continue;

                if (!bestAdjacentExit || score < bestAdjacentExit.score) bestAdjacentExit = candidate;
                if (this.getTileAt(tx, ty) === TileType.ROAD && (!bestRoadExit || score < bestRoadExit.score)) {
                    bestRoadExit = candidate;
                }
            }
        }

        if (bestSafeRoadExit) return bestSafeRoadExit.tile;
        if (bestSafeExit) return bestSafeExit.tile;
        if (bestRoadExit) return bestRoadExit.tile;
        if (bestAdjacentExit) return bestAdjacentExit.tile;
        return this.getTownSpawnTile(town);
    }

    private isTownExitFormationSafe(town: TownInfo, tile: TilePoint): boolean {
        return TOWN_EXIT_FORMATION_OFFSETS.every((offset) => {
            const tx = tile.x + offset.x;
            const ty = tile.y + offset.y;
            return this.isWalkable(tx, ty) && this.getTownAtTile(tx, ty)?.id !== town.id;
        });
    }

    public getBoundsTiles(): TileBounds {
        return {
            width: MAP_WIDTH * CHUNK_SIZE,
            height: MAP_HEIGHT * CHUNK_SIZE,
        };
    }

    public updateEntities(dt: number): void {
        for (const zone of this.extractionZones) zone.update(dt);
    }

    private renderDecorations(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number,
        overlayOnly: boolean
    ): void {
        const minX = Math.floor(cameraX / TILE_SIZE);
        const minY = Math.floor(cameraY / TILE_SIZE);
        const maxX = Math.ceil((cameraX + vw) / TILE_SIZE);
        const maxY = Math.ceil((cameraY + vh) / TILE_SIZE);
        const decorations = [...this.getDecorationsInTileRect(minX, minY, maxX, maxY)]
            .sort((a, b) => a.anchorTile.y - b.anchorTile.y || a.anchorTile.x - b.anchorTile.x);

        for (const decoration of decorations) {
            if (decoration.kind === 'tree') {
                this.renderTreeDecoration(ctx, decoration, cameraX, cameraY, vw, vh, overlayOnly);
            } else {
                this.renderBridgeDecoration(ctx, decoration, cameraX, cameraY, vw, vh, overlayOnly);
            }
        }
    }

    private renderTreeDecoration(
        ctx: CanvasRenderingContext2D,
        decoration: WorldMapTreeDecoration,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number,
        overlayOnly: boolean
    ): void {
        const config = TREE_DECORATION_CONFIGS[decoration.sprite];
        const width = config.widthTiles * TILE_SIZE;
        const height = config.heightTiles * TILE_SIZE;
        const sx = (decoration.anchorTile.x + 0.5) * TILE_SIZE - cameraX - width / 2;
        const sy = (decoration.anchorTile.y + 1) * TILE_SIZE - cameraY - height;

        if (sx + width < 0 || sx > vw || sy + height < 0 || sy > vh) return;

        const drew = TileAssetManager.drawTreeSprite(
            ctx,
            decoration.sprite,
            sx,
            sy,
            width,
            height,
            overlayOnly ? decoration.canopyClip : undefined
        );
        if (drew || overlayOnly) return;

        ctx.save();
        ctx.fillStyle = decoration.sprite === 'scaryTree' ? 'rgba(90, 95, 48, 0.8)' : 'rgba(30, 112, 42, 0.78)';
        ctx.beginPath();
        ctx.ellipse(sx + width / 2, sy + height * 0.38, width * 0.46, height * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b3f1f';
        for (const tile of decoration.trunkTiles) {
            ctx.fillRect(tile.x * TILE_SIZE - cameraX + 12, tile.y * TILE_SIZE - cameraY + 6, TILE_SIZE - 24, TILE_SIZE - 8);
        }
        ctx.restore();
    }

    private renderBridgeDecoration(
        ctx: CanvasRenderingContext2D,
        decoration: WorldMapBridgeDecoration,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number,
        overlayOnly: boolean
    ): void {
        if (overlayOnly) return;

        const config = BRIDGE_DECORATION_CONFIGS[decoration.sprite];
        const width = config.widthTiles * TILE_SIZE;
        const height = config.heightTiles * TILE_SIZE;
        const sx = (decoration.anchorTile.x + 0.5) * TILE_SIZE - cameraX - width / 2;
        const sy = (decoration.anchorTile.y + 0.5) * TILE_SIZE - cameraY - height / 2;

        if (sx + width < 0 || sx > vw || sy + height < 0 || sy > vh) return;

        const drew = TileAssetManager.drawBridgeSprite(ctx, decoration.sprite, sx, sy, width, height);
        if (drew) return;

        ctx.save();
        ctx.fillStyle = 'rgba(82, 52, 31, 0.88)';
        ctx.strokeStyle = 'rgba(28, 18, 12, 0.9)';
        ctx.lineWidth = Math.max(1, TILE_SIZE * 0.08);
        ctx.fillRect(sx, sy + height * 0.18, width, height * 0.64);
        ctx.strokeRect(sx, sy + height * 0.18, width, height * 0.64);
        ctx.restore();
    }

    private ensureNeutralBirdImage(): HTMLImageElement | null {
        if (this.neutralBirdImage) return this.neutralBirdImage;
        if (typeof Image === 'undefined') return null;

        const image = new Image();
        this.neutralBirdImage = image;
        this.neutralBirdImageLoaded = false;
        image.onload = () => {
            if (this.neutralBirdImage !== image) return;
            this.neutralBirdImageLoaded = true;
        };
        image.onerror = () => {
            if (this.neutralBirdImage !== image) return;
            this.neutralBirdImageLoaded = false;
        };
        image.src = NEUTRAL_BIRD_SPRITE_SRC;
        return image;
    }

    private renderNeutralBirds(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        const image = this.ensureNeutralBirdImage();
        if (!image || (!this.neutralBirdImageLoaded && (!image.complete || image.naturalWidth <= 0))) return;

        const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;
        const minChunkX = Math.floor(cameraX / chunkPixelSize) - 1;
        const maxChunkX = Math.floor((cameraX + vw) / chunkPixelSize) + 1;
        const minChunkY = Math.floor(cameraY / chunkPixelSize) - 1;
        const maxChunkY = Math.floor((cameraY + vh) / chunkPixelSize) + 1;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
            for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
                if (!this.isChunkInBounds(chunkX, chunkY)) continue;
                if (this.hash(chunkX, chunkY, 811) >= NEUTRAL_BIRD_CHUNK_CHANCE) continue;

                this.renderNeutralBirdForChunk(ctx, image, chunkX, chunkY, now, cameraX, cameraY, vw, vh);
            }
        }
        ctx.restore();
    }

    private renderNeutralBirdForChunk(
        ctx: CanvasRenderingContext2D,
        image: HTMLImageElement,
        chunkX: number,
        chunkY: number,
        now: number,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        const anchorX = chunkX * CHUNK_SIZE + this.hash(chunkX, chunkY, 812) * CHUNK_SIZE;
        const anchorY = chunkY * CHUNK_SIZE + this.hash(chunkX, chunkY, 813) * CHUNK_SIZE;
        const phase = this.hash(chunkX, chunkY, 814) * Math.PI * 2;
        const phase2 = this.hash(chunkX, chunkY, 815) * Math.PI * 2;
        const speed = 0.16 + this.hash(chunkX, chunkY, 816) * 0.2;
        const radiusX = 2.5 + this.hash(chunkX, chunkY, 817) * 5;
        const radiusY = 1.5 + this.hash(chunkX, chunkY, 818) * 4;
        const t = now * speed + phase;

        const offsetX = Math.sin(t) * radiusX + Math.sin(t * 0.43 + phase2) * radiusX * 0.32;
        const offsetY = Math.sin(t * 0.71 + phase2) * radiusY + Math.cos(t * 0.37 + phase) * radiusY * 0.28;
        const vx = Math.cos(t) * radiusX * speed + Math.cos(t * 0.43 + phase2) * radiusX * 0.32 * speed * 0.43;
        const vy = Math.cos(t * 0.71 + phase2) * radiusY * speed * 0.71 - Math.sin(t * 0.37 + phase) * radiusY * 0.28 * speed * 0.37;
        const facing = Math.abs(vx) >= Math.abs(vy)
            ? (vx >= 0 ? 'right' : 'left')
            : (vy >= 0 ? 'down' : 'up');
        const frame = Math.floor(now * NEUTRAL_BIRD_FPS + this.hash(chunkX, chunkY, 819) * NEUTRAL_BIRD_FRAME_COUNT) % NEUTRAL_BIRD_FRAME_COUNT;
        const size = TILE_SIZE * NEUTRAL_BIRD_RENDER_SCALE * (0.88 + this.hash(chunkX, chunkY, 820) * 0.18);
        const sx = (anchorX + offsetX) * TILE_SIZE - cameraX - size / 2;
        const sy = (anchorY + offsetY) * TILE_SIZE - cameraY - size * 0.7;

        if (sx + size < 0 || sx > vw || sy + size < 0 || sy > vh) return;

        ctx.drawImage(
            image,
            frame * NEUTRAL_BIRD_FRAME_SIZE,
            NEUTRAL_BIRD_ROW_BY_FACING[facing] * NEUTRAL_BIRD_FRAME_SIZE,
            NEUTRAL_BIRD_FRAME_SIZE,
            NEUTRAL_BIRD_FRAME_SIZE,
            Math.round(sx),
            Math.round(sy),
            Math.round(size),
            Math.round(size)
        );
    }

    private decorationIntersectsTileRect(
        decoration: WorldMapDecoration,
        minX: number,
        minY: number,
        maxX: number,
        maxY: number
    ): boolean {
        return decoration.bounds.maxX >= minX &&
            decoration.bounds.minX <= maxX &&
            decoration.bounds.maxY >= minY &&
            decoration.bounds.minY <= maxY;
    }

    private renderTownLandmarks(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        for (const town of this.getTowns()) {
            const centerTileX = town.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            const centerTileY = town.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
            const isCastle = town.id === 'central_castle' || town.id === 'e_stronghold';
            const isPort = town.id === 's_coast_town' || town.id === 'se_port';
            const sprite: LandmarkSpriteId = isCastle ? 'castle' : isPort ? 'portTown' : 'village';
            const tileSpan = isCastle ? 4 : 3;
            const fallbackColor = isCastle ? '#a88a48' : isPort ? '#5b8aa8' : '#8a6a3a';
            this.renderLandmarkSprite(
                ctx, cameraX, cameraY, vw, vh,
                centerTileX, centerTileY, tileSpan, sprite, this.getLocalizedLandmarkName(town), fallbackColor
            );
        }

        for (const dungeon of this.getDungeons()) {
            const center = this.getDungeonEntranceTile(dungeon);
            this.renderLandmarkSprite(
                ctx, cameraX, cameraY, vw, vh,
                center.x,
                center.y,
                dungeon.tileSpan,
                dungeon.sprite,
                this.getLocalizedLandmarkName(dungeon),
                '#5c4a68'
            );
        }
    }

    private renderLandmarkSprite(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number,
        centerTileX: number,
        centerTileY: number,
        tileSpan: number,
        sprite: LandmarkSpriteId,
        label: string,
        fallbackColor: string
    ): void {
        const size = TILE_SIZE * tileSpan;
        const sx = centerTileX * TILE_SIZE - cameraX - size / 2 + TILE_SIZE / 2;
        const sy = centerTileY * TILE_SIZE - cameraY - size / 2 + TILE_SIZE / 2;

        if (sx + size < 0 || sx > vw || sy + size < 0 || sy > vh) return;

        const drew = TileAssetManager.drawLandmarkSprite(ctx, sprite, sx, sy, size, size);
        if (!drew) {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(sx, sy, size, size);
        }

        ctx.save();
        ctx.font = 'bold 14px "DOSMyungjo", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelX = sx + size / 2;
        const labelY = sy + size + 3;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillStyle = '#f0d78a';
        ctx.strokeText(label, labelX, labelY);
        ctx.fillText(label, labelX, labelY);
        ctx.restore();
    }

    private renderWorldInspectMarkers(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        for (const marker of this.worldInspectMarkers) {
            const sx = marker.tile.x * TILE_SIZE - cameraX;
            const sy = marker.tile.y * TILE_SIZE - cameraY;
            if (sx + TILE_SIZE < 0 || sx > vw || sy + TILE_SIZE < 0 || sy > vh) continue;
            this.renderWorldInspectMarker(ctx, marker, sx, sy);
        }
    }

    private renderGroundDetails(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;
        const minChunkX = Math.floor(cameraX / chunkPixelSize) - 1;
        const maxChunkX = Math.floor((cameraX + vw) / chunkPixelSize) + 1;
        const minChunkY = Math.floor(cameraY / chunkPixelSize) - 1;
        const maxChunkY = Math.floor((cameraY + vh) / chunkPixelSize) + 1;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
            for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
                for (const detail of this.getGroundDetailsForChunk(chunkX, chunkY)) {
                    const sx = (detail.tile.x + 0.5 + detail.offsetX) * TILE_SIZE - cameraX;
                    const sy = (detail.tile.y + 0.58 + detail.offsetY) * TILE_SIZE - cameraY;
                    if (sx < -TILE_SIZE || sx > vw + TILE_SIZE || sy < -TILE_SIZE || sy > vh + TILE_SIZE) continue;
                    this.renderGroundDetail(ctx, detail, Math.round(sx), Math.round(sy));
                }
            }
        }
        ctx.restore();
    }

    private renderGroundDetail(
        ctx: CanvasRenderingContext2D,
        detail: WorldMapGroundDetail,
        sx: number,
        sy: number
    ): void {
        const direction = detail.mirrored ? -1 : 1;
        const unit = Math.max(1, Math.round(2 * detail.scale));
        ctx.globalAlpha = 0.76;

        if (detail.kind === 'grassTuft') {
            ctx.fillStyle = '#173f20';
            ctx.fillRect(sx - unit * 4, sy + unit * 2, unit * 8, unit);
            ctx.fillRect(sx - unit * 3, sy - unit * 2, unit, unit * 4);
            ctx.fillRect(sx, sy - unit * 4, unit, unit * 6);
            ctx.fillRect(sx + unit * 3, sy - unit, unit, unit * 3);
            ctx.fillStyle = '#638a39';
            ctx.fillRect(sx - direction * unit * 2, sy - unit * 3, unit, unit * 3);
            return;
        }
        if (detail.kind === 'wildflowers') {
            ctx.fillStyle = '#244a23';
            ctx.fillRect(sx - unit * 3, sy - unit * 2, unit, unit * 4);
            ctx.fillRect(sx + unit * 2, sy - unit * 4, unit, unit * 6);
            ctx.fillStyle = '#e2b84e';
            ctx.fillRect(sx - unit * 4, sy - unit * 4, unit * 3, unit * 2);
            ctx.fillStyle = '#d7d0df';
            ctx.fillRect(sx + unit, sy - unit * 6, unit * 3, unit * 2);
            return;
        }
        if (detail.kind === 'forestMushrooms') {
            ctx.fillStyle = '#eee0bf';
            ctx.fillRect(sx - unit * 3, sy, unit, unit * 3);
            ctx.fillRect(sx + unit * 2, sy - unit, unit, unit * 4);
            ctx.fillStyle = '#9b4931';
            ctx.fillRect(sx - unit * 5, sy - unit * 2, unit * 5, unit * 2);
            ctx.fillRect(sx, sy - unit * 3, unit * 5, unit * 2);
            return;
        }
        if (detail.kind === 'pebbles') {
            ctx.fillStyle = '#282c2b';
            ctx.fillRect(sx - unit * 5, sy, unit * 4, unit * 2);
            ctx.fillRect(sx + unit, sy - unit * 2, unit * 5, unit * 3);
            ctx.fillStyle = '#77756d';
            ctx.fillRect(sx - unit * 4, sy - unit, unit * 2, unit);
            ctx.fillRect(sx + unit * 2, sy - unit * 3, unit * 3, unit);
            return;
        }
        if (detail.kind === 'dryBrush') {
            ctx.fillStyle = '#705331';
            ctx.fillRect(sx - unit * 4, sy + unit, unit * 8, unit);
            ctx.fillRect(sx - direction * unit * 3, sy - unit * 4, unit, unit * 5);
            ctx.fillRect(sx + direction * unit, sy - unit * 2, unit, unit * 3);
            ctx.fillStyle = '#b38a4d';
            ctx.fillRect(sx - direction * unit * 4, sy - unit * 3, unit * 3, unit);
            return;
        }
        if (detail.kind === 'snowShrub') {
            ctx.fillStyle = '#3b403e';
            ctx.fillRect(sx - unit * 3, sy - unit * 3, unit, unit * 5);
            ctx.fillRect(sx + unit * 2, sy - unit * 2, unit, unit * 4);
            ctx.fillStyle = '#d7e3df';
            ctx.fillRect(sx - unit * 5, sy - unit * 4, unit * 4, unit * 2);
            ctx.fillRect(sx, sy - unit * 3, unit * 5, unit * 2);
            return;
        }

        ctx.fillStyle = '#41451f';
        ctx.fillRect(sx - unit * 4, sy + unit, unit * 8, unit);
        ctx.fillRect(sx - unit * 3, sy - unit * 5, unit, unit * 6);
        ctx.fillRect(sx, sy - unit * 3, unit, unit * 4);
        ctx.fillRect(sx + unit * 3, sy - unit * 6, unit, unit * 7);
        ctx.fillStyle = '#858439';
        ctx.fillRect(sx - direction * unit * 2, sy - unit * 4, unit, unit * 4);
    }

    private renderAmbientSites(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;
        const minChunkX = Math.floor(cameraX / chunkPixelSize) - 1;
        const maxChunkX = Math.floor((cameraX + vw) / chunkPixelSize) + 1;
        const minChunkY = Math.floor(cameraY / chunkPixelSize) - 1;
        const maxChunkY = Math.floor((cameraY + vh) / chunkPixelSize) + 1;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
            for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
                for (const site of this.getAmbientSitesForChunk(chunkX, chunkY)) {
                    const sx = (site.anchorTile.x + 0.5) * TILE_SIZE - cameraX;
                    const sy = (site.anchorTile.y + 0.62) * TILE_SIZE - cameraY;
                    if (sx < -TILE_SIZE * 2 || sx > vw + TILE_SIZE * 2 || sy < -TILE_SIZE * 2 || sy > vh + TILE_SIZE * 2) continue;
                    this.renderAmbientSite(ctx, site, Math.round(sx), Math.round(sy));
                    if (!this.isAmbientSiteInspected(site.id)) this.renderAmbientSitePrompt(ctx, Math.round(sx), Math.round(sy));
                }
            }
        }
        ctx.restore();
    }

    private renderAmbientSitePrompt(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
        const pulse = 0.58 + Math.sin(performance.now() / 360) * 0.18;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#f2cf73';
        ctx.fillRect(sx - 2, sy - TILE_SIZE * 0.72, 4, 8);
        ctx.fillRect(sx - 5, sy - TILE_SIZE * 0.61, 10, 3);
        ctx.fillRect(sx - 2, sy - TILE_SIZE * 0.5, 4, 4);
        ctx.restore();
    }

    private renderAmbientSite(ctx: CanvasRenderingContext2D, site: WorldMapAmbientSite, sx: number, sy: number): void {
        const u = Math.max(2, Math.round(TILE_SIZE / 16));
        const direction = site.mirrored ? -1 : 1;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(22, 18, 13, 0.34)';
        ctx.fillRect(sx - u * 13, sy + u * 3, u * 26, u * 4);

        if (site.kind === 'abandonedCamp') {
            ctx.fillStyle = '#40352a';
            ctx.fillRect(sx - u * 5, sy, u * 10, u * 4);
            ctx.fillStyle = '#8b8170';
            ctx.fillRect(sx - u * 6, sy - u, u * 3, u * 2);
            ctx.fillRect(sx + u * 3, sy - u, u * 3, u * 2);
            ctx.fillRect(sx - u, sy - u * 3, u * 2, u * 2);
            ctx.fillStyle = '#5d3826';
            ctx.fillRect(sx - u * 4, sy + u, u * 9, u * 2);
            ctx.fillStyle = '#705c3d';
            ctx.fillRect(sx + direction * u * 8, sy - u * 5, u * 7, u * 7);
            ctx.fillStyle = '#3a2b22';
            ctx.fillRect(sx + direction * u * 9, sy - u * 4, u * 5, u);
            return;
        }
        if (site.kind === 'roadsideRuins') {
            ctx.fillStyle = '#373733';
            ctx.fillRect(sx - u * 12, sy + u, u * 24, u * 4);
            ctx.fillStyle = '#716f63';
            ctx.fillRect(sx - direction * u * 11, sy - u * 8, u * 5, u * 10);
            ctx.fillRect(sx - direction * u * 7, sy - u * 4, u * 8, u * 5);
            ctx.fillRect(sx + direction * u * 4, sy - u * 2, u * 7, u * 3);
            ctx.fillStyle = '#969080';
            ctx.fillRect(sx - direction * u * 10, sy - u * 7, u * 3, u);
            return;
        }
        if (site.kind === 'brokenWaystone') {
            ctx.fillStyle = '#403f3a';
            ctx.fillRect(sx - u * 8, sy + u, u * 16, u * 4);
            ctx.fillStyle = '#777870';
            ctx.fillRect(sx - direction * u * 3, sy - u * 12, u * 7, u * 13);
            ctx.fillRect(sx - direction * u * 5, sy - u * 4, u * 11, u * 5);
            ctx.fillStyle = '#adafa5';
            ctx.fillRect(sx - direction * u * 2, sy - u * 11, u * 4, u * 2);
            ctx.fillStyle = '#343634';
            ctx.fillRect(sx + direction * u, sy - u * 7, u * 2, u * 5);
            return;
        }

        ctx.fillStyle = '#302b20';
        ctx.fillRect(sx - u * 7, sy + u, u * 14, u * 3);
        ctx.fillRect(sx - direction * u * 5, sy - u * 11, u * 2, u * 12);
        ctx.fillRect(sx + direction * u * 4, sy - u * 8, u * 2, u * 9);
        ctx.fillStyle = '#a9976b';
        ctx.fillRect(sx - direction * u * 7, sy - u * 7, u * 7, u * 2);
        ctx.fillRect(sx, sy - u * 5, u * 7, u * 2);
        ctx.fillStyle = '#676326';
        ctx.fillRect(sx - u * 3, sy - u * 13, u * 7, u * 3);
    }

    private renderWorldInspectMarker(ctx: CanvasRenderingContext2D, marker: WorldInspectMarker, sx: number, sy: number): void {
        ctx.save();
        const cx = sx + TILE_SIZE / 2;

        ctx.fillStyle = 'rgba(6, 7, 10, 0.62)';
        ctx.beginPath();
        ctx.ellipse(cx, sy + TILE_SIZE - 8, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (marker.kind === 'chest') {
            ctx.fillStyle = '#5b3922';
            ctx.fillRect(sx + 8, sy + 15, TILE_SIZE - 16, 12);
            ctx.fillStyle = '#8a5b2f';
            ctx.fillRect(sx + 7, sy + 12, TILE_SIZE - 14, 7);
            ctx.strokeStyle = '#d6a85f';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 8, sy + 13, TILE_SIZE - 16, 13);
            ctx.fillStyle = '#f1d58b';
            ctx.fillRect(cx - 2, sy + 17, 4, 5);
        } else {
            ctx.fillStyle = '#3d4c5a';
            ctx.fillRect(sx + 10, sy + 18, TILE_SIZE - 20, 8);
            ctx.fillStyle = '#b8c7d4';
            ctx.beginPath();
            ctx.arc(cx, sy + 15, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#72dfff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, sy + 7, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, sy + 14);
        ctx.lineTo(cx, sy + 18);
        ctx.stroke();

        if (marker.labelKey) {
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillStyle = '#dcf7ff';
            const label = t(marker.labelKey);
            ctx.strokeText(label, cx, sy - 2);
            ctx.fillText(label, cx, sy - 2);
        }
        ctx.restore();
    }

    private renderStoryInteriorEntrances(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        for (const dungeon of this.getDungeons()) {
            if (!isStoryInteriorDungeon(dungeon.id)) continue;
            const center = this.getDungeonEntranceTile(dungeon);
            const sx = center.x * TILE_SIZE - cameraX;
            const sy = center.y * TILE_SIZE - cameraY;
            const size = TILE_SIZE * 1.35;
            if (sx + size < 0 || sx - size > vw || sy + size < 0 || sy - size > vh) continue;

            ctx.save();
            ctx.translate(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2);
            ctx.fillStyle = 'rgba(23, 13, 17, 0.84)';
            ctx.beginPath();
            ctx.ellipse(0, 6, size * 0.42, size * 0.26, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(96, 45, 54, 0.94)';
            ctx.fillRect(-size * 0.28, -size * 0.38, size * 0.56, size * 0.72);
            ctx.strokeStyle = 'rgba(225, 176, 92, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(-size * 0.23, -size * 0.32, size * 0.46, size * 0.63);
            ctx.fillStyle = 'rgba(255, 221, 150, 0.22)';
            ctx.fillRect(-size * 0.12, -size * 0.2, size * 0.24, size * 0.42);
            ctx.fillStyle = 'rgba(245, 206, 118, 0.95)';
            ctx.beginPath();
            ctx.arc(size * 0.15, 0, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    private renderTempleLandmarks(
        ctx: CanvasRenderingContext2D,
        cameraX: number,
        cameraY: number,
        vw: number,
        vh: number
    ): void {
        for (const temple of this.getTemples()) {
            const center = this.getTempleCenterTile(temple);
            const size = TILE_SIZE * 3.2;
            const sx = center.x * TILE_SIZE - cameraX - size / 2 + TILE_SIZE / 2;
            const sy = center.y * TILE_SIZE - cameraY - size / 2 + TILE_SIZE / 2;

            if (sx + size < 0 || sx > vw || sy + size < 0 || sy > vh) continue;

            ctx.save();
            const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 500);
            ctx.fillStyle = this.getRealm() === 'master'
                ? `rgba(100, 210, 255, ${0.34 + pulse * 0.18})`
                : `rgba(210, 120, 255, ${0.34 + pulse * 0.18})`;
            ctx.strokeStyle = this.getRealm() === 'master' ? '#80e6ff' : '#d98cff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(sx + size / 2, sy + 4);
            ctx.lineTo(sx + size - 8, sy + size * 0.42);
            ctx.lineTo(sx + size * 0.72, sy + size - 8);
            ctx.lineTo(sx + size * 0.28, sy + size - 8);
            ctx.lineTo(sx + 8, sy + size * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(8, 8, 16, 0.7)';
            ctx.fillRect(sx + size * 0.42, sy + size * 0.42, size * 0.16, size * 0.35);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.strokeRect(sx + size * 0.42, sy + size * 0.42, size * 0.16, size * 0.35);

            ctx.font = 'bold 14px "DOSMyungjo", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const labelX = sx + size / 2;
            const labelY = sy + size + 3;
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
            ctx.fillStyle = this.getRealm() === 'master' ? '#bdf6ff' : '#f0c8ff';
            const label = this.getLocalizedLandmarkName(temple);
            ctx.strokeText(label, labelX, labelY);
            ctx.fillText(label, labelX, labelY);
            ctx.restore();
        }
    }

    private validateTownSpawns(): void {
        for (const town of this.getTowns()) {
            const spawn = this.getTownSpawnTile(town);
            if (!this.isWalkable(spawn.x, spawn.y)) {
                console.warn(`Town spawn is not walkable: ${town.id} (${spawn.x}, ${spawn.y})`);
            }
        }
    }
}
