/**
 * BiomeMask — Generates a continent-shaped biome map based on the
 * original Sin Eater (Lapis/닥세월드) world map.
 *
 * The mask operates at the CHUNK level. Each chunk coordinate maps to
 * a BiomeType that determines how tiles within that chunk are generated.
 *
 * Geography:
 *   - WEST continent (large): NW desert, central mountains/castle, southern forests
 *   - EAST continent (elongated island): mixed biomes, smaller towns
 *   - Ocean surrounding everything, forming natural boundaries
 *   - 8 Towns placed at positions matching the original map
 */

export type BiomeType =
    | 'ocean'
    | 'sand'
    | 'grass'
    | 'forest'
    | 'stone'
    | 'snow'
    | 'town'
    | 'special'
    | 'lava';

export interface TownInfo {
    id: string;
    name: string;
    nameKr: string;
    chunkX: number;
    chunkY: number;
    radius: number; // in chunks
}

/** Map dimensions in chunks */
export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 100;

// ── Geometry primitives ────────────────────────────────────────────

interface Ellipse {
    cx: number; cy: number; rx: number; ry: number;
}

// ── Continent shape definitions ────────────────────────────────────
// Each continent is the union of overlapping ellipses.
// Positions derived from pixel-analysis of the original Sin Eater map.

const WEST_CONTINENT: Ellipse[] = [
    { cx: 25, cy: 52, rx: 24, ry: 44 },   // main body
    { cx: 17, cy: 13, rx: 16, ry: 11 },   // NW desert peninsula
    { cx: 24, cy: 28, rx: 20, ry: 16 },   // north connecting region
    { cx: 34, cy: 82, rx: 15, ry: 14 },   // south coast bulge
    { cx: 12, cy: 76, rx: 11, ry: 14 },   // SW forest coast
    { cx: 20, cy: 40, rx: 18, ry: 10 },   // west-central widening
];

const EAST_CONTINENT: Ellipse[] = [
    { cx: 65, cy: 42, rx: 11, ry: 28 },   // main elongated body
    { cx: 63, cy: 72, rx: 9,  ry: 12 },   // south extension
    { cx: 67, cy: 18, rx: 8,  ry: 9  },   // north bump
    { cx: 60, cy: 55, rx: 6,  ry: 8  },   // west coast bump
];

// Small islands scattered around
const ISLANDS: Ellipse[] = [
    { cx: 72, cy: 58, rx: 3, ry: 3 },     // small east island
    { cx: 56, cy: 35, rx: 2, ry: 3 },     // strait island
    { cx: 75, cy: 8,  rx: 3, ry: 2 },     // NE tiny island
    { cx: 48, cy: 90, rx: 3, ry: 2 },     // south island
];

// ── Bays / water intrusions (subtractive) ──────────────────────────
const BAYS: Ellipse[] = [
    { cx: 50, cy: 18, rx: 6, ry: 8 },     // strait between continents (north)
    { cx: 52, cy: 50, rx: 5, ry: 10 },    // central strait
    { cx: 38, cy: 10, rx: 8, ry: 5 },     // north coast bay
];

// ── Town definitions ───────────────────────────────────────────────
// Positions match the circular walled structures in the original map.

const TOWNS: TownInfo[] = [
    { id: 'nw_desert_city',   name: 'Desert Outpost',     nameKr: '사막의 전초기지', chunkX: 16, chunkY: 11, radius: 2 },
    { id: 'w_forest_village',  name: 'Forest Village',     nameKr: '숲속 마을',       chunkX: 10, chunkY: 52, radius: 2 },
    { id: 'central_castle',    name: 'Central Fortress',   nameKr: '중앙 성채',       chunkX: 37, chunkY: 44, radius: 3 },
    { id: 'sw_hideout',        name: 'Southern Refuge',    nameKr: '남부 은신처',     chunkX: 12, chunkY: 79, radius: 2 },
    { id: 's_coast_town',      name: 'Coastal Town',       nameKr: '남부 항구',       chunkX: 41, chunkY: 80, radius: 2 },
    { id: 'e_outpost',         name: 'Eastern Outpost',    nameKr: '동부 전초기지',   chunkX: 64, chunkY: 23, radius: 2 },
    { id: 'e_stronghold',      name: 'Eastern Stronghold', nameKr: '동부 거점',       chunkX: 63, chunkY: 49, radius: 2 },
    { id: 'se_port',           name: 'Southeast Port',     nameKr: '남동 항구',       chunkX: 63, chunkY: 72, radius: 2 },
];

// ── Special zones (purple/magical areas from original map) ─────────
interface SpecialZone { cx: number; cy: number; r: number; }
const SPECIAL_ZONES: SpecialZone[] = [
    { cx: 38, cy: 35, r: 3 },  // central magical ruins (west continent)
    { cx: 62, cy: 28, r: 2 },  // east continent upper special
    { cx: 62, cy: 48, r: 2 },  // east continent center special
];

// ── Inland lake ────────────────────────────────────────────────────
const INLAND_LAKE: Ellipse = { cx: 36, cy: 14, rx: 4, ry: 3 };


export class BiomeMask {
    private grid: BiomeType[][] = [];

    constructor() {
        this.generate();
    }

    // ── Noise utilities ────────────────────────────────────────────

    private hash(x: number, y: number): number {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        return (h ^ (h >> 16)) & 0x7fffffff;
    }

    /** Value noise with smoothstep interpolation */
    private noise(x: number, y: number, scale: number): number {
        const sx = x * scale;
        const sy = y * scale;
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;

        // Smoothstep
        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);

        const a = (this.hash(ix, iy) & 0x7fffffff) / 0x7fffffff;
        const b = (this.hash(ix + 1, iy) & 0x7fffffff) / 0x7fffffff;
        const c = (this.hash(ix, iy + 1) & 0x7fffffff) / 0x7fffffff;
        const d = (this.hash(ix + 1, iy + 1) & 0x7fffffff) / 0x7fffffff;

        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    /** Multi-octave noise (2 octaves) */
    private fbm(x: number, y: number, scale: number): number {
        return this.noise(x, y, scale) * 0.65 + this.noise(x + 97, y + 131, scale * 2.1) * 0.35;
    }

    // ── Distance functions ─────────────────────────────────────────

    /** Normalized elliptical distance. < 0 inside, > 0 outside. */
    private ellipseDist(px: number, py: number, e: Ellipse): number {
        const dx = (px - e.cx) / e.rx;
        const dy = (py - e.cy) / e.ry;
        return Math.sqrt(dx * dx + dy * dy) - 1.0;
    }

    /**
     * Signed distance to the nearest continent surface.
     * Negative = inside land, Positive = in ocean.
     */
    private continentDist(cx: number, cy: number): number {
        // Union of all land shapes → min distance (most inside)
        let minLand = Infinity;
        for (const e of WEST_CONTINENT) {
            minLand = Math.min(minLand, this.ellipseDist(cx, cy, e));
        }
        for (const e of EAST_CONTINENT) {
            minLand = Math.min(minLand, this.ellipseDist(cx, cy, e));
        }
        for (const e of ISLANDS) {
            minLand = Math.min(minLand, this.ellipseDist(cx, cy, e));
        }

        // Subtract bays (water intrusions into land)
        for (const bay of BAYS) {
            const bayDist = this.ellipseDist(cx, cy, bay);
            if (bayDist < 0) {
                // Inside a bay → push distance positive (toward ocean)
                minLand = Math.max(minLand, -bayDist * 0.7);
            }
        }

        // Inland lake
        const lakeDist = this.ellipseDist(cx, cy, INLAND_LAKE);
        if (lakeDist < 0) {
            minLand = Math.max(minLand, -lakeDist * 0.5);
        }

        // Add noise to coastline for natural irregularity
        const n1 = (this.fbm(cx, cy, 0.18) - 0.5) * 0.18;
        const n2 = (this.noise(cx + 500, cy + 500, 0.09) - 0.5) * 0.08;

        return minLand + n1 + n2;
    }

    // ── Classification helpers ─────────────────────────────────────

    private isNearTown(cx: number, cy: number): TownInfo | null {
        for (const town of TOWNS) {
            const dx = cx - town.chunkX;
            const dy = cy - town.chunkY;
            if (Math.sqrt(dx * dx + dy * dy) <= town.radius) {
                return town;
            }
        }
        return null;
    }

    private isInSpecialZone(cx: number, cy: number): boolean {
        for (const zone of SPECIAL_ZONES) {
            const dx = cx - zone.cx;
            const dy = cy - zone.cy;
            if (Math.sqrt(dx * dx + dy * dy) <= zone.r) {
                return true;
            }
        }
        return false;
    }

    /** Determine which continent a land chunk belongs to (for biome rules) */
    private isWestContinent(cx: number, cy: number): boolean {
        for (const e of WEST_CONTINENT) {
            if (this.ellipseDist(cx, cy, e) < 0.2) return true;
        }
        return false;
    }

    // ── Biome determination ────────────────────────────────────────

    private determineBiome(cx: number, cy: number): BiomeType {
        const dist = this.continentDist(cx, cy);

        // ── Ocean ──
        if (dist > 0.06) return 'ocean';

        // ── Beach / coastline strip ──
        if (dist > -0.06) return 'sand';

        // ── Town ──
        if (this.isNearTown(cx, cy)) return 'town';

        // ── Special zone ──
        if (this.isInSpecialZone(cx, cy)) return 'special';

        // ── Land biomes (position + noise driven) ──
        const n = this.fbm(cx, cy, 0.13);
        const n2 = this.noise(cx + 300, cy + 300, 0.07);

        if (this.isWestContinent(cx, cy)) {
            return this.westContinentBiome(cx, cy, n, n2);
        } else {
            return this.eastContinentBiome(cx, cy, n, n2);
        }
    }

    /** West continent biome rules based on original map analysis */
    private westContinentBiome(cx: number, cy: number, n: number, n2: number): BiomeType {
        // ── Desert region (northwest, y < 22) ──
        if (cy < 22) {
            if (n > 0.72) return 'stone';
            if (n > 0.45) return 'sand';
            return n2 > 0.6 ? 'grass' : 'sand';
        }

        // ── Sand-to-grass transition (y 22-30) ──
        if (cy < 30) {
            const blend = (cy - 22) / 8; // 0→1
            if (n > 0.5 + blend * 0.2) return 'grass';
            if (n > 0.3) return blend > 0.5 ? 'grass' : 'sand';
            return 'sand';
        }

        // ── Central mountain/stone belt (y 30-42) ──
        if (cy < 42) {
            if (n > 0.73) return 'stone';
            if (n > 0.55) return 'forest';
            if (n2 > 0.65) return 'stone';
            return 'grass';
        }

        // ── Lush southern zone (y 42-90) ──
        if (cy < 90) {
            // Western side tends to be denser forest
            const forestBias = cx < 20 ? 0.15 : 0;

            if (n + forestBias > 0.62) return 'forest';
            if (n > 0.78) return 'stone';
            return 'grass';
        }

        // ── Far south coast ──
        return n > 0.55 ? 'forest' : 'grass';
    }

    /** East continent biome rules */
    private eastContinentBiome(_cx: number, cy: number, n: number, n2: number): BiomeType {
        // ── Northern section ──
        if (cy < 25) {
            if (n > 0.65) return 'sand';
            if (n2 > 0.6) return 'stone';
            return 'grass';
        }

        // ── Central section ──
        if (cy < 55) {
            if (n > 0.63) return 'forest';
            if (n2 > 0.7) return 'stone';
            return 'grass';
        }

        // ── Southern section ──
        if (n > 0.6) return 'forest';
        if (n > 0.45) return 'grass';
        return n2 > 0.55 ? 'sand' : 'grass';
    }

    // ── Generation ─────────────────────────────────────────────────

    private generate(): void {
        this.grid = [];
        for (let y = 0; y < MAP_HEIGHT; y++) {
            const row: BiomeType[] = [];
            for (let x = 0; x < MAP_WIDTH; x++) {
                row.push(this.determineBiome(x, y));
            }
            this.grid.push(row);
        }
    }

    // ── Public API ─────────────────────────────────────────────────

    /** Get the biome for a chunk coordinate */
    public getBiome(chunkX: number, chunkY: number): BiomeType {
        if (chunkX < 0 || chunkX >= MAP_WIDTH || chunkY < 0 || chunkY >= MAP_HEIGHT) {
            return 'ocean';
        }
        return this.grid[chunkY][chunkX];
    }

    /** Get all town infos */
    public getTowns(): TownInfo[] {
        return [...TOWNS];
    }

    /** Check if a chunk coordinate is within map bounds */
    public isInBounds(chunkX: number, chunkY: number): boolean {
        return chunkX >= 0 && chunkX < MAP_WIDTH && chunkY >= 0 && chunkY < MAP_HEIGHT;
    }

    /** Get the raw grid for minimap rendering */
    public getGrid(): BiomeType[][] {
        return this.grid;
    }

    /** Get grid dimensions */
    public getSize(): { width: number; height: number } {
        return { width: MAP_WIDTH, height: MAP_HEIGHT };
    }
}
