import { Chunk, CHUNK_SIZE, TILE_SIZE } from './Chunk';
import { TileType } from './Tile';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';
import { TownInfo } from './BiomeMask';

// ── Value Noise with cosine interpolation ──
class ValueNoise {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }

    private hash(ix: number, iy: number): number {
        let h = this.seed + ix * 374761393 + iy * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        h = h ^ (h >> 16);
        return (h & 0x7fffffff) / 0x7fffffff;
    }

    private cosInterp(a: number, b: number, t: number): number {
        const f = (1 - Math.cos(t * Math.PI)) * 0.5;
        return a * (1 - f) + b * f;
    }

    public noise(x: number, y: number): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        const i1 = this.cosInterp(this.hash(ix, iy), this.hash(ix + 1, iy), fx);
        const i2 = this.cosInterp(this.hash(ix, iy + 1), this.hash(ix + 1, iy + 1), fx);
        return this.cosInterp(i1, i2, fy);
    }

    public fbm(x: number, y: number, octaves: number = 4): number {
        let val = 0, amp = 1, freq = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            val += amp * this.noise(x * freq, y * freq);
            max += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return val / max;
    }
}

// ── Map config ──
const MAP_W = 96;
const MAP_H = 72;

// Noise instances
const elevNoise = new ValueNoise(42);
const moistNoise = new ValueNoise(137);
const tempNoise = new ValueNoise(293);
const coastNoise = new ValueNoise(571);  // for coastline distortion

// ── Fixed landmarks ──
const TOWN_CX = 45, TOWN_CY = 36;
const DUNGEON_X = 70, DUNGEON_Y = 20;

// ═══════════════════════════════════════════════════════
// STEP 1: Generate raw elevation + biome map
// ═══════════════════════════════════════════════════════
function generateRawMap(): TileType[][] {
    const map: TileType[][] = [];

    for (let y = 0; y < MAP_H; y++) {
        const row: TileType[] = [];
        for (let x = 0; x < MAP_W; x++) {
            // Elevation: very low frequency for large land/water shapes
            const e = elevNoise.fbm(x * 0.03, y * 0.03, 4);

            // Island radial falloff — noise-distorted coastline
            const cx = (x - MAP_W / 2) / (MAP_W * 0.40);
            const cy = (y - MAP_H / 2) / (MAP_H * 0.40);
            const baseDist = Math.sqrt(cx * cx + cy * cy);

            // Add angular noise to coastline for irregular shape
            const angle = Math.atan2(cy, cx);
            const coastWarp = coastNoise.fbm(
                Math.cos(angle) * 2.0 + 10,
                Math.sin(angle) * 2.0 + 10, 4
            ) * 0.35;  // strength of coastline distortion

            const dist = baseDist + coastWarp - 0.15;
            const falloff = Math.max(0, 1.0 - dist * dist);

            // Combined elevation: noise * falloff
            const elev = (e - 0.35) + falloff * 0.5;

            // Moisture (independent noise)
            const moist = moistNoise.fbm(x * 0.045 + 50, y * 0.045 + 50, 3);

            // Temperature (latitude-based + noise)
            const temp = tempNoise.fbm(x * 0.04 + 100, y * 0.04 + 100, 2);

            // ── Classify terrain ──
            if (elev < 0.05) {
                row.push(TileType.WATER);
            } else if (elev < 0.12) {
                row.push(TileType.SAND);  // Beach strip
            } else if (elev > 0.55) {
                row.push(TileType.STONE); // Mountain
            } else {
                // Inland: grass, forest, or sand based on moisture+temperature
                if (moist > 0.55 && elev > 0.2) {
                    row.push(TileType.FOREST);
                } else if (moist < 0.35 && temp > 0.55) {
                    row.push(TileType.SAND);  // Dry area
                } else {
                    row.push(TileType.GRASS);
                }
            }
        }
        map.push(row);
    }
    return map;
}

// ═══════════════════════════════════════════════════════
// STEP 2: Cellular automata smoothing
// Removes isolated 1-2 tile spots, creates smooth coastlines
// ═══════════════════════════════════════════════════════
function smoothPass(map: TileType[][], iterations: number = 3): void {
    for (let iter = 0; iter < iterations; iter++) {
        const copy = map.map(row => [...row]);
        for (let y = 1; y < MAP_H - 1; y++) {
            for (let x = 1; x < MAP_W - 1; x++) {
                // Count neighbors of each type (4-connected + diagonals)
                const counts = new Map<TileType, number>();
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const t = copy[y + dy][x + dx];
                        counts.set(t, (counts.get(t) || 0) + 1);
                    }
                }

                const self = copy[y][x];
                const selfCount = counts.get(self) || 0;

                // If fewer than 3 of 8 neighbors match, adopt majority
                if (selfCount < 3) {
                    let maxType = self;
                    let maxCount = 0;
                    for (const [type, count] of counts) {
                        if (count > maxCount) {
                            maxCount = count;
                            maxType = type;
                        }
                    }
                    map[y][x] = maxType;
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// STEP 3: Ensure natural terrain transitions
// Water→Sand→Grass→Forest (no water directly next to forest)
// ═══════════════════════════════════════════════════════
function ensureTransitions(map: TileType[][]): void {
    const changed = true;
    // Multiple passes until stable
    for (let pass = 0; pass < 2 && changed; pass++) {
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const t = map[y][x];
                if (t !== TileType.WATER) continue;

                // Check if water directly touches forest or stone — insert sand buffer
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ny = y + dy, nx = x + dx;
                        if (ny < 0 || ny >= MAP_H || nx < 0 || nx >= MAP_W) continue;
                        const neighbor = map[ny][nx];
                        if (neighbor === TileType.FOREST || neighbor === TileType.STONE) {
                            map[ny][nx] = TileType.GRASS;
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// STEP 4: Place fixed landmarks (town, roads, dungeon)
// ═══════════════════════════════════════════════════════
function placeLandmarks(map: TileType[][]): void {
    // Town — circular area
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const tdist = Math.sqrt((x - TOWN_CX) ** 2 + (y - TOWN_CY) ** 2);
            if (tdist <= 3) {
                map[y][x] = TileType.TOWN;
            }
        }
    }

    // Roads — organic curves from town
    // East road toward dungeon
    for (let i = 0; i <= DUNGEON_X - TOWN_CX - 3; i++) {
        const rx = TOWN_CX + 4 + i;
        const ry = TOWN_CY + Math.round(Math.sin(i * 0.2) * 1.5);
        if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) {
            map[ry][rx] = TileType.ROAD;
            // Ensure walkable neighbors
            if (ry + 1 < MAP_H && map[ry + 1][rx] === TileType.WATER) {
                map[ry + 1][rx] = TileType.GRASS;
            }
        }
    }

    // South road
    for (let i = 0; i < 12; i++) {
        const rx = TOWN_CX + Math.round(Math.sin(i * 0.3) * 1);
        const ry = TOWN_CY + 4 + i;
        if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) {
            map[ry][rx] = TileType.ROAD;
        }
    }

    // West road toward coast
    for (let i = 0; i < 15; i++) {
        const rx = TOWN_CX - 4 - i;
        const ry = TOWN_CY + Math.round(Math.sin(i * 0.15) * 1);
        if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) {
            if (map[ry][rx] === TileType.WATER) break; // Stop at water
            map[ry][rx] = TileType.ROAD;
        }
    }

    // Dungeon entrance
    if (DUNGEON_X < MAP_W && DUNGEON_Y < MAP_H) {
        map[DUNGEON_Y][DUNGEON_X] = TileType.DUNGEON_ENTRANCE;
        // Ensure surrounding area is land
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ny = DUNGEON_Y + dy, nx = DUNGEON_X + dx;
                if (ny >= 0 && ny < MAP_H && nx >= 0 && nx < MAP_W) {
                    if (map[ny][nx] === TileType.WATER) map[ny][nx] = TileType.STONE;
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// STEP 5: Classify water depth (Sea vs Deep Sea)
// Water tiles far from land become DEEP_WATER (dark blue)
// ═══════════════════════════════════════════════════════
function classifyWaterDepth(map: TileType[][]): void {
    // Compute distance from each water tile to nearest non-water tile
    const dist: number[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(999));
    const queue: [number, number][] = [];

    // Init BFS: all land tiles have distance 0, seed their water neighbors
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            if (map[y][x] !== TileType.WATER) {
                dist[y][x] = 0;
            }
        }
    }
    // Seed: water tiles adjacent to land start at distance 1
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            if (map[y][x] === TileType.WATER) {
                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && map[ny][nx] !== TileType.WATER) {
                        dist[y][x] = 1;
                        queue.push([x, y]);
                        break;
                    }
                }
            }
        }
    }
    // BFS to propagate distances
    let head = 0;
    while (head < queue.length) {
        const [cx, cy] = queue[head++];
        for (const [ddx, ddy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            const nx = cx + ddx, ny = cy + ddy;
            if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
                if (map[ny][nx] === TileType.WATER && dist[ny][nx] > dist[cy][cx] + 1) {
                    dist[ny][nx] = dist[cy][cx] + 1;
                    queue.push([nx, ny]);
                }
            }
        }
    }

    // Convert: water tiles with distance >= 3 from land → DEEP_WATER
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            if (map[y][x] === TileType.WATER && dist[y][x] >= 3) {
                map[y][x] = TileType.DEEP_WATER;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// Build the final tile map
// ═══════════════════════════════════════════════════════
const TILE_MAP: TileType[][] = generateRawMap();
smoothPass(TILE_MAP, 3);
ensureTransitions(TILE_MAP);
placeLandmarks(TILE_MAP);
classifyWaterDepth(TILE_MAP);

// ═══════════════════════════════════════════════════════
// WorldMap class (unchanged interface)
// ═══════════════════════════════════════════════════════
export class WorldMap {
    private chunks: Map<string, Chunk> = new Map();
    private loadRadius: number = 2;

    public loot: LootObject[] = [];
    public extractionZones: ExtractionZone[] = [];

    constructor() {
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                if (TILE_MAP[y][x] === TileType.DUNGEON_ENTRANCE) {
                    this.extractionZones.push(new ExtractionZone(x, y, 'goblin_cave', 1));
                }
            }
        }
    }

    private generateChunk(chunkX: number, chunkY: number): Chunk {
        const tiles: TileType[][] = [];
        const baseX = chunkX * CHUNK_SIZE;
        const baseY = chunkY * CHUNK_SIZE;

        for (let y = 0; y < CHUNK_SIZE; y++) {
            const row: TileType[] = [];
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const gx = baseX + x;
                const gy = baseY + y;
                if (gx >= 0 && gx < MAP_W && gy >= 0 && gy < MAP_H) {
                    row.push(TILE_MAP[gy][gx]);
                } else {
                    // Out-of-bounds: Sea near map edge, Deep Sea further out
                    const distToMap = Math.max(
                        gx < 0 ? -gx : gx >= MAP_W ? gx - MAP_W + 1 : 0,
                        gy < 0 ? -gy : gy >= MAP_H ? gy - MAP_H + 1 : 0
                    );
                    row.push(distToMap <= 6 ? TileType.WATER : TileType.DEEP_WATER);
                }
            }
            tiles.push(row);
        }
        return new Chunk(chunkX, chunkY, tiles);
    }

    private chunkKey(cx: number, cy: number): string { return `${cx},${cy}`; }

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
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) {
            const distToMap = Math.max(
                tx < 0 ? -tx : tx >= MAP_W ? tx - MAP_W + 1 : 0,
                ty < 0 ? -ty : ty >= MAP_H ? ty - MAP_H + 1 : 0
            );
            return distToMap <= 6 ? TileType.WATER : TileType.DEEP_WATER;
        }
        const key = this.chunkKey(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE));
        const chunk = this.chunks.get(key);
        if (!chunk) return TileType.DEEP_WATER;
        let lx = tx % CHUNK_SIZE;
        let ly = ty % CHUNK_SIZE;
        if (lx < 0) lx += CHUNK_SIZE;
        if (ly < 0) ly += CHUNK_SIZE;
        return chunk.getTile(lx, ly);
    }

    public getTowns(): TownInfo[] {
        return [{ id: 'start_town', name: 'Start Town', nameKr: '시작 마을', chunkX: 0, chunkY: 0, radius: 1 }];
    }

    public updateEntities(dt: number): void {
        for (const zone of this.extractionZones) zone.update(dt);
    }
}
