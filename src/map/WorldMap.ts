import { Chunk, CHUNK_SIZE, TILE_SIZE } from './Chunk';
import { TileType, TILE_PROPERTIES } from './Tile';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';
import { BiomeMask, BiomeType, MAP_HEIGHT, MAP_WIDTH, TownInfo } from './BiomeMask';

export interface TileBounds {
    width: number;
    height: number;
}

export interface TilePoint {
    x: number;
    y: number;
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

export class WorldMap {
    private chunks: Map<string, Chunk> = new Map();
    private loadRadius: number = 2;
    private biomeMask: BiomeMask;

    public loot: LootObject[] = [];
    public extractionZones: ExtractionZone[] = [];

    constructor(biomeMask: BiomeMask = new BiomeMask()) {
        this.biomeMask = biomeMask;
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

        const biome = this.biomeMask.getBiome(chunkX, chunkY);
        if (biome === 'ocean') {
            return this.isCoastOceanChunk(chunkX, chunkY) ? TileType.WATER : TileType.DEEP_WATER;
        }
        if (biome === 'town') return TileType.TOWN;

        if (biome === 'special') {
            const dx = localX - CHUNK_SIZE / 2;
            const dy = localY - CHUNK_SIZE / 2;
            if (Math.sqrt(dx * dx + dy * dy) <= 4) return TileType.DUNGEON_ENTRANCE;
            return this.hash(tx, ty, 9) > 0.82 ? TileType.STONE : TileType.POISON_SWAMP;
        }

        const base = BIOME_TILE[biome];
        const n = this.hash(tx >> 1, ty >> 1, 3);

        if (base === TileType.FOREST && n < 0.22) return TileType.GRASS;
        if (base === TileType.GRASS && n > 0.88) return TileType.FOREST;
        if (base === TileType.SAND && n > 0.9) return TileType.STONE;
        if (base === TileType.STONE && n < 0.18) return TileType.GRASS;

        return base;
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
        return this.computeTileAt(tx, ty);
    }

    public isWalkable(tx: number, ty: number): boolean {
        return !!TILE_PROPERTIES[this.getTileAt(tx, ty)]?.walkable;
    }

    public getTowns(): TownInfo[] {
        return this.biomeMask.getTowns();
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

    public getBoundsTiles(): TileBounds {
        return {
            width: MAP_WIDTH * CHUNK_SIZE,
            height: MAP_HEIGHT * CHUNK_SIZE,
        };
    }

    public updateEntities(dt: number): void {
        for (const zone of this.extractionZones) zone.update(dt);
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
