import { Chunk, CHUNK_SIZE, TILE_SIZE } from './Chunk';
import { TileType, TILE_PROPERTIES } from './Tile';
import { TileAssetManager, type LandmarkSpriteId } from './TileAssetManager';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';
import { BiomeMask, BiomeType, MAP_HEIGHT, MAP_WIDTH, TempleInfo, TownInfo, WorldRealm } from './BiomeMask';
import { getBurgosCastleHmapTileAt } from './BurgosCastleHmap';
import { getStoryHmapTileAt } from './StoryHmaps';
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

export interface WorldDungeonInfo {
    id: string;
    nameKr: string;
    chunkX: number;
    chunkY: number;
    sprite: LandmarkSpriteId;
    tileSpan: number;
    tileRadius: number;
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

export class WorldMap {
    private chunks: Map<string, Chunk> = new Map();
    private loadRadius: number = 2;
    private biomeMask: BiomeMask;

    public loot: LootObject[] = [];
    public extractionZones: ExtractionZone[] = [];

    constructor(realmOrMask: WorldRealm | BiomeMask = 'mortal') {
        this.biomeMask = typeof realmOrMask === 'string' ? new BiomeMask(realmOrMask) : realmOrMask;
        this.validateTownSpawns();
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

        const burgosCastleTile = this.getBurgosCastleHmapTile(tx, ty);
        if (burgosCastleTile !== null) return burgosCastleTile;

        const storyHmapTile = this.getStoryHmapTile(tx, ty);
        if (storyHmapTile !== null) return storyHmapTile;

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

    private getBurgosCastleHmapTile(tx: number, ty: number): TileType | null {
        if (!BURGOS_CASTLE_DUNGEON) return null;
        return getBurgosCastleHmapTileAt(tx, ty, this.getDungeonEntranceTile(BURGOS_CASTLE_DUNGEON));
    }

    private getStoryHmapTile(tx: number, ty: number): TileType | null {
        if (this.isRoadTile(tx, ty) || this.isRiverTile(tx, ty)) return null;
        for (const scenario of STORY_SCENARIOS) {
            if (scenario.episode < 2) continue;
            const dungeon = DUNGEON_LANDMARKS.find((entry) => entry.id === scenario.dungeonId);
            if (!dungeon) continue;
            const tile = getStoryHmapTileAt(scenario.episode, tx, ty, this.getDungeonEntranceTile(dungeon));
            if (tile !== null) return tile;
        }
        return null;
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

    public updateLoadedChunks(worldCenterX: number, worldCenterY: number): void {
        const ccx = Math.floor(worldCenterX / (CHUNK_SIZE * TILE_SIZE));
        const ccy = Math.floor(worldCenterY / (CHUNK_SIZE * TILE_SIZE));
        const needed = new Set<string>();

        for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
            for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
                const key = this.chunkKey(ccx + dx, ccy + dy);
                needed.add(key);
                if (!this.chunks.has(key)) {
                    this.chunks.set(key, this.generateChunk(ccx + dx, ccy + dy));
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

    public getTileAt(tx: number, ty: number): TileType {
        const { chunkX, chunkY, localX, localY } = this.tileToChunk(tx, ty);
        const chunk = this.chunks.get(this.chunkKey(chunkX, chunkY));
        if (chunk) return chunk.getTile(localX, localY);

        return this.computeTileAt(tx, ty);
    }

    public isWalkable(tx: number, ty: number): boolean {
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
