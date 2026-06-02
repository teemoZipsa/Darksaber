import { Chunk, CHUNK_SIZE, TILE_SIZE } from './Chunk';
import { TileType, TILE_PROPERTIES } from './Tile';
import { TileAssetManager, type LandmarkSpriteId, type TreeSpriteId } from './TileAssetManager';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';
import { BiomeMask, BiomeType, MAP_HEIGHT, MAP_WIDTH, TempleInfo, TownInfo, WorldRealm } from './BiomeMask';
import { getBurgosCastleHmapTileAt } from './BurgosCastleHmap';
import { getStoryHmapTileAt } from './StoryHmaps';
import { HMAP_BLEND_BAND, type HmapSample } from './HmapBlend';
import { STORY_SCENARIOS } from '../data/StoryScenarioData';

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

export interface WorldMapDecoration {
    kind: 'tree';
    sprite: TreeSpriteId;
    anchorTile: TilePoint;
    trunkTiles: TilePoint[];
    canopyClip: WorldMapDecorationClip;
    bounds: WorldMapDecorationBounds;
}

export interface WorldDungeonInfo {
    id: string;
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
            { chunkX: 67, chunkY: 34 },
            { chunkX: 64, chunkY: 37 },
            { chunkX: 61, chunkY: 40 },
            { chunkX: 63, chunkY: 49 },
        ],
        width: 2.1,
        noiseSalt: 107,
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
];

const DUNGEON_LANDMARKS: WorldDungeonInfo[] = [
    { id: 'beginner_mine', nameKr: '초심자의 폐광', chunkX: 38, chunkY: 35, sprite: 'beginnerMine', tileSpan: 3, tileRadius: 4 },
    { id: 'beginner_ruins', nameKr: '초보자 유적', chunkX: 62, chunkY: 28, sprite: 'beginnerRuins', tileSpan: 3, tileRadius: 4 },
    { id: 'dark_cave', nameKr: '암흑 동굴', chunkX: 62, chunkY: 48, sprite: 'caveEntrance', tileSpan: 3, tileRadius: 4 },
    ...STORY_SCENARIOS.map((scenario) => ({
        id: scenario.dungeonId,
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

interface TreeDecorationConfig {
    widthTiles: number;
    heightTiles: number;
    trunkOffsets: readonly TilePoint[];
    canopyClip: WorldMapDecorationClip;
}

const NORMAL_TREE_CHUNK_CHANCE = 0.035;
const SCARY_TREE_CHUNK_CHANCE = 0.18;
const TREE_DECORATION_LOOKUP_MARGIN_TILES = 8;
const NORMAL_TREE_TILES = new Set<TileType>([TileType.GRASS, TileType.FOREST]);
const SCARY_TREE_TILES = new Set<TileType>([TileType.POISON_SWAMP]);
const NORMAL_TREE_CANOPY_TILES = new Set<TileType>([TileType.GRASS, TileType.FOREST, TileType.STONE]);
const SCARY_TREE_CANOPY_TILES = new Set<TileType>([TileType.POISON_SWAMP, TileType.STONE]);

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

export class WorldMap {
    private chunks: Map<string, Chunk> = new Map();
    private decorationChunks: Map<string, WorldMapDecoration[]> = new Map();
    private preloadChunkMargin: number = 1;
    private biomeMask: BiomeMask;

    public loot: LootObject[] = [];
    public extractionZones: ExtractionZone[] = [];

    constructor(realmOrMask: WorldRealm | BiomeMask = 'mortal', options: WorldMapOptions = {}) {
        this.biomeMask = typeof realmOrMask === 'string' ? new BiomeMask(realmOrMask) : realmOrMask;
        if (options.validateTownSpawns ?? true) this.validateTownSpawns();
    }

    public getRealm(): WorldRealm {
        return this.biomeMask.getRealm();
    }

    public getDisplayName(): string {
        return this.getRealm() === 'master' ? '마스터 월드' : '현세 월드';
    }

    public setRealm(realm: WorldRealm): void {
        if (this.getRealm() === realm) return;
        this.biomeMask = new BiomeMask(realm);
        this.chunks.clear();
        this.decorationChunks.clear();
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
            const town = this.getTownAtTile(tx, ty);
            return town ? this.computeTownTile(tx, ty, town) : TileType.GRASS;
        }

        if (biome === 'special') {
            const dx = localX - CHUNK_SIZE / 2;
            const dy = localY - CHUNK_SIZE / 2;
            if (Math.sqrt(dx * dx + dy * dy) <= 4) return TileType.DUNGEON_ENTRANCE;
            if (this.isRoadTile(tx, ty)) return TileType.ROAD;
            if (this.isRiverTile(tx, ty)) return TileType.WATER;
            return this.hash(tx, ty, 9) > 0.82 ? TileType.STONE : TileType.POISON_SWAMP;
        }

        if (this.isRoadTile(tx, ty)) return TileType.ROAD;
        if (this.isRiverTile(tx, ty)) return TileType.WATER;

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
        // Roads/rivers stay on top of the feathered edge so the travel network
        // and its bridges remain connected; only the scenario interior wins, so
        // connecting roads tuck under a dungeon core instead of carving through it.
        if (sample.weight < HMAP_BLEND_BAND && (this.isRoadTile(tx, ty) || this.isRiverTile(tx, ty))) {
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

    private createTreeDecoration(sprite: TreeSpriteId, anchorTile: TilePoint): WorldMapDecoration {
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
        decoration: WorldMapDecoration,
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
    }

    public markAllDirty(): void {
        for (const c of this.chunks.values()) c.markDirty();
    }

    public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, vw: number, vh: number): void {
        for (const chunk of this.chunks.values()) {
            const sx = chunk.chunkX * CHUNK_SIZE * TILE_SIZE - cameraX;
            const sy = chunk.chunkY * CHUNK_SIZE * TILE_SIZE - cameraY;
            const ps = CHUNK_SIZE * TILE_SIZE;
            if (sx + ps < 0 || sx > vw || sy + ps < 0 || sy > vh) continue;
            chunk.render(ctx, sx, sy, (nx, ny) => this.getTileAt(nx, ny));
        }

        this.renderDecorations(ctx, cameraX, cameraY, vw, vh, false);
        this.renderTownLandmarks(ctx, cameraX, cameraY, vw, vh);
        this.renderTempleLandmarks(ctx, cameraX, cameraY, vw, vh);

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
        return this.isTerrainWalkable(tx, ty) && !this.isDecorationBlocked(tx, ty);
    }

    public getDecorationsInTileRect(minX: number, minY: number, maxX: number, maxY: number): readonly WorldMapDecoration[] {
        const expandedMin = this.tileToChunk(minX - TREE_DECORATION_LOOKUP_MARGIN_TILES, minY - TREE_DECORATION_LOOKUP_MARGIN_TILES);
        const expandedMax = this.tileToChunk(maxX + TREE_DECORATION_LOOKUP_MARGIN_TILES, maxY + TREE_DECORATION_LOOKUP_MARGIN_TILES);
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
        const expandedMin = this.tileToChunk(tx - TREE_DECORATION_LOOKUP_MARGIN_TILES, ty - TREE_DECORATION_LOOKUP_MARGIN_TILES);
        const expandedMax = this.tileToChunk(tx + TREE_DECORATION_LOOKUP_MARGIN_TILES, ty + TREE_DECORATION_LOOKUP_MARGIN_TILES);

        for (let chunkY = expandedMin.chunkY; chunkY <= expandedMax.chunkY; chunkY++) {
            for (let chunkX = expandedMin.chunkX; chunkX <= expandedMax.chunkX; chunkX++) {
                for (const decoration of this.getDecorationChunk(chunkX, chunkY)) {
                    if (!this.decorationIntersectsTileRect(decoration, tx, ty, tx, ty)) continue;
                    if (decoration.trunkTiles.some((tile) => tile.x === tx && tile.y === ty)) return true;
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
                label: town.nameKr,
                kind: 'town' as const,
            })),
            ...this.getTemples().map((temple) => ({
                ...chunkCenter(temple.chunkX, temple.chunkY),
                label: temple.nameKr,
                kind: 'temple' as const,
            })),
            ...this.getDungeons().map((dungeon) => ({
                ...chunkCenter(dungeon.chunkX, dungeon.chunkY),
                label: dungeon.nameKr,
                kind: 'dungeon' as const,
            })),
        ];
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
        const { chunkX, chunkY } = this.tileToChunk(tx, ty);
        for (const town of this.getTowns()) {
            const dx = chunkX - town.chunkX;
            const dy = chunkY - town.chunkY;
            if (Math.sqrt(dx * dx + dy * dy) <= town.radius) return town;
        }
        return null;
    }

    public getTownSpawnTile(town: TownInfo): TilePoint {
        const centerX = town.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
        const centerY = town.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
        const maxRadius = Math.max(4, town.radius * CHUNK_SIZE);

        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const tx = centerX + dx;
                    const ty = centerY + dy;
                    if (this.isWalkable(tx, ty) && this.getTownAtTile(tx, ty)?.id === town.id) {
                        return { x: tx, y: ty };
                    }
                }
            }
        }

        return { x: centerX, y: centerY };
    }

    public getTownExitTile(town: TownInfo): TilePoint {
        const centerX = town.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
        const centerY = town.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
        const searchRadius = Math.max(8, town.radius * CHUNK_SIZE + CHUNK_SIZE);
        let bestSafeRoadExit: { tile: TilePoint; score: number } | null = null;
        let bestSafeExit: { tile: TilePoint; score: number } | null = null;
        let bestRoadExit: { tile: TilePoint; score: number } | null = null;
        let bestAdjacentExit: { tile: TilePoint; score: number } | null = null;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const tx = centerX + dx;
                const ty = centerY + dy;
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
            this.renderTreeDecoration(ctx, decoration, cameraX, cameraY, vw, vh, overlayOnly);
        }
    }

    private renderTreeDecoration(
        ctx: CanvasRenderingContext2D,
        decoration: WorldMapDecoration,
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
                centerTileX, centerTileY, tileSpan, sprite, town.nameKr, fallbackColor
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
                dungeon.nameKr,
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
            ctx.strokeText(temple.nameKr, labelX, labelY);
            ctx.fillText(temple.nameKr, labelX, labelY);
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
