/**
 * BiomeMask generates a fixed 80x100 chunk world from hand-placed biome
 * anchors. Towns and landmarks define the big geography; deterministic noise
 * bends borders so the result reads like a designed map instead of a grid.
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

export type WorldRealm = 'mortal' | 'master';

export interface TownInfo {
    id: string;
    name: string;
    nameKr: string;
    chunkX: number;
    chunkY: number;
    radius: number; // in chunks
}

export interface TempleInfo {
    id: string;
    name: string;
    nameKr: string;
    chunkX: number;
    chunkY: number;
    tileRadius: number;
}

/** Map dimensions in chunks */
export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 100;

type LandBiome = Exclude<BiomeType, 'ocean' | 'town'>;

interface InfluenceAnchor {
    cx: number;
    cy: number;
    radius: number;
    weight: number;
}

interface BiomeAnchor {
    cx: number;
    cy: number;
    biome: LandBiome;
    weight: number;
}

interface SpecialZone {
    cx: number;
    cy: number;
    r: number;
}

// Towns double as the strongest biome anchors, so local geography always
// agrees with the town's identity.
const MORTAL_TOWNS: TownInfo[] = [
    { id: 'nw_desert_city',   name: 'Desert Outpost',     nameKr: '사막의 전초기지', chunkX: 16, chunkY: 11, radius: 2 },
    { id: 'w_forest_village', name: 'Belfuers',           nameKr: '벨퓌어스',        chunkX: 10, chunkY: 52, radius: 2 },
    { id: 'central_castle',   name: 'Kaosia',             nameKr: '카오시아',        chunkX: 37, chunkY: 44, radius: 3 },
    { id: 'sw_hideout',       name: 'Southern Refuge',    nameKr: '남부 은신처',     chunkX: 12, chunkY: 79, radius: 2 },
    { id: 's_coast_town',     name: 'Sicilio',            nameKr: '시시리오',        chunkX: 41, chunkY: 80, radius: 2 },
    { id: 'e_outpost',        name: 'Eastern Outpost',    nameKr: '동부 전초기지',   chunkX: 64, chunkY: 23, radius: 2 },
    { id: 'e_stronghold',     name: 'Entria',             nameKr: '엔트리아',        chunkX: 63, chunkY: 49, radius: 2 },
    { id: 'se_port',          name: 'Arikna',             nameKr: '아리크나',        chunkX: 63, chunkY: 72, radius: 2 },
];

const MASTER_TOWNS: TownInfo[] = [
    { id: 'master_sanctum',    name: 'Master Sanctum',     nameKr: '마스터 성역',     chunkX: 40, chunkY: 50, radius: 2 },
    { id: 'astral_keep',       name: 'Astral Keep',        nameKr: '성좌 요새',       chunkX: 23, chunkY: 28, radius: 2 },
    { id: 'ember_citadel',     name: 'Ember Citadel',      nameKr: '홍염 성채',       chunkX: 60, chunkY: 67, radius: 2 },
];

const MORTAL_TEMPLES: TempleInfo[] = [
    { id: 'fusion_temple', name: 'Fusion Temple', nameKr: '융합의 신전', chunkX: 38, chunkY: 35, tileRadius: 4 },
];

const MASTER_TEMPLES: TempleInfo[] = [
    { id: 'mortal_gate', name: 'Mortal Gate', nameKr: '현세의 문', chunkX: 40, chunkY: 50, tileRadius: 4 },
];

const LAND_ANCHORS: InfluenceAnchor[] = [
    // West continent spine.
    { cx: 16, cy: 11, radius: 18, weight: 1.12 },
    { cx: 24, cy: 26, radius: 23, weight: 1.05 },
    { cx: 37, cy: 44, radius: 29, weight: 1.2 },
    { cx: 10, cy: 52, radius: 21, weight: 1.0 },
    { cx: 17, cy: 67, radius: 22, weight: 0.98 },
    { cx: 12, cy: 79, radius: 18, weight: 0.95 },
    { cx: 41, cy: 80, radius: 18, weight: 1.0 },
    { cx: 30, cy: 84, radius: 16, weight: 0.85 },

    // Road-supporting anchors keep designed travel corridors on land.
    { cx: 23, cy: 23, radius: 12, weight: 0.72 },
    { cx: 30, cy: 35, radius: 13, weight: 0.8 },
    { cx: 22, cy: 48, radius: 13, weight: 0.78 },
    { cx: 39, cy: 62, radius: 15, weight: 0.82 },
    { cx: 24, cy: 82, radius: 12, weight: 0.72 },

    // East continent chain.
    { cx: 64, cy: 23, radius: 14, weight: 1.02 },
    { cx: 64, cy: 36, radius: 16, weight: 0.95 },
    { cx: 63, cy: 49, radius: 18, weight: 1.05 },
    { cx: 64, cy: 61, radius: 14, weight: 0.92 },
    { cx: 63, cy: 72, radius: 15, weight: 1.0 },
    { cx: 68, cy: 14, radius: 8, weight: 0.68 },

    // Small islands.
    { cx: 56, cy: 35, radius: 4, weight: 0.8 },
    { cx: 72, cy: 58, radius: 5, weight: 0.74 },
    { cx: 48, cy: 90, radius: 5, weight: 0.72 },
    { cx: 75, cy: 8, radius: 4, weight: 0.66 },
];

const OCEAN_CUTS: InfluenceAnchor[] = [
    { cx: 50, cy: 20, radius: 10, weight: 0.75 },
    { cx: 52, cy: 49, radius: 12, weight: 0.78 },
    { cx: 36, cy: 13, radius: 6, weight: 0.62 },
    { cx: 52, cy: 75, radius: 8, weight: 0.5 },
];

const BIOME_ANCHORS: BiomeAnchor[] = [
    // Town anchors.
    { cx: 16, cy: 11, biome: 'sand',   weight: 1.85 },
    { cx: 10, cy: 52, biome: 'forest', weight: 1.75 },
    { cx: 37, cy: 44, biome: 'grass',  weight: 1.65 },
    { cx: 12, cy: 79, biome: 'forest', weight: 1.55 },
    { cx: 41, cy: 80, biome: 'grass',  weight: 1.45 },
    { cx: 64, cy: 23, biome: 'grass',  weight: 1.5 },
    { cx: 63, cy: 49, biome: 'stone',  weight: 1.55 },
    { cx: 63, cy: 72, biome: 'sand',   weight: 1.4 },

    // Landmark anchors.
    { cx: 23, cy: 17, biome: 'sand',   weight: 1.1 },
    { cx: 30, cy: 34, biome: 'stone',  weight: 1.25 },
    { cx: 20, cy: 42, biome: 'forest', weight: 1.05 },
    { cx: 22, cy: 66, biome: 'forest', weight: 1.15 },
    { cx: 33, cy: 68, biome: 'grass',  weight: 1.0 },
    { cx: 49, cy: 86, biome: 'sand',   weight: 0.95 },
    { cx: 68, cy: 12, biome: 'snow',   weight: 0.88 },
    { cx: 69, cy: 35, biome: 'forest', weight: 0.95 },
    { cx: 69, cy: 58, biome: 'forest', weight: 1.0 },
    { cx: 60, cy: 62, biome: 'grass',  weight: 0.95 },
    { cx: 72, cy: 58, biome: 'lava',   weight: 0.78 },
];

const SPECIAL_ZONES: SpecialZone[] = [
    { cx: 38, cy: 35, r: 3 },
    { cx: 62, cy: 28, r: 2 },
    { cx: 62, cy: 48, r: 2 },
];

const MASTER_LAND_ANCHORS: InfluenceAnchor[] = [
    { cx: 40, cy: 50, radius: 27, weight: 1.22 },
    { cx: 23, cy: 28, radius: 18, weight: 1.02 },
    { cx: 60, cy: 67, radius: 19, weight: 1.02 },
    { cx: 34, cy: 72, radius: 14, weight: 0.78 },
    { cx: 57, cy: 31, radius: 13, weight: 0.72 },
];

const MASTER_OCEAN_CUTS: InfluenceAnchor[] = [
    { cx: 41, cy: 18, radius: 9, weight: 0.7 },
    { cx: 18, cy: 61, radius: 8, weight: 0.62 },
    { cx: 63, cy: 46, radius: 7, weight: 0.58 },
];

const MASTER_BIOME_ANCHORS: BiomeAnchor[] = [
    { cx: 40, cy: 50, biome: 'stone', weight: 1.9 },
    { cx: 23, cy: 28, biome: 'snow', weight: 1.5 },
    { cx: 60, cy: 67, biome: 'lava', weight: 1.5 },
    { cx: 34, cy: 72, biome: 'forest', weight: 1.05 },
    { cx: 57, cy: 31, biome: 'special', weight: 1.0 },
];

const MASTER_SPECIAL_ZONES: SpecialZone[] = [
    { cx: 40, cy: 50, r: 2 },
    { cx: 57, cy: 31, r: 3 },
    { cx: 60, cy: 67, r: 2 },
];

export class BiomeMask {
    private grid: BiomeType[][] = [];
    private readonly realm: WorldRealm;

    constructor(realm: WorldRealm = 'mortal') {
        this.realm = realm;
        this.generate();
    }

    public getRealm(): WorldRealm {
        return this.realm;
    }

    private getTownDefinitions(): TownInfo[] {
        return this.realm === 'master' ? MASTER_TOWNS : MORTAL_TOWNS;
    }

    private getTempleDefinitions(): TempleInfo[] {
        return this.realm === 'master' ? MASTER_TEMPLES : MORTAL_TEMPLES;
    }

    private getLandAnchors(): InfluenceAnchor[] {
        return this.realm === 'master' ? MASTER_LAND_ANCHORS : LAND_ANCHORS;
    }

    private getOceanCuts(): InfluenceAnchor[] {
        return this.realm === 'master' ? MASTER_OCEAN_CUTS : OCEAN_CUTS;
    }

    private getBiomeAnchors(): BiomeAnchor[] {
        return this.realm === 'master' ? MASTER_BIOME_ANCHORS : BIOME_ANCHORS;
    }

    private getSpecialZones(): SpecialZone[] {
        return this.realm === 'master' ? MASTER_SPECIAL_ZONES : SPECIAL_ZONES;
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
        return this.noise(x, y, scale, salt) * 0.58
            + this.noise(x + 97, y + 131, scale * 2.05, salt + 1) * 0.3
            + this.noise(x - 211, y + 47, scale * 4.1, salt + 2) * 0.12;
    }

    private distance(x: number, y: number, anchor: { cx: number; cy: number }): number {
        return Math.hypot(x - anchor.cx, y - anchor.cy);
    }

    private edgePenalty(cx: number, cy: number): number {
        const edge = Math.min(cx, cy, MAP_WIDTH - 1 - cx, MAP_HEIGHT - 1 - cy);
        if (edge >= 6) return 0;
        return (6 - edge) * 0.09;
    }

    private landScore(cx: number, cy: number): number {
        let score = -Infinity;
        for (const anchor of this.getLandAnchors()) {
            const d = this.distance(cx, cy, anchor);
            const falloff = 1 - d / anchor.radius;
            score = Math.max(score, falloff * anchor.weight);
        }

        for (const cut of this.getOceanCuts()) {
            const d = this.distance(cx, cy, cut);
            if (d < cut.radius) {
                const cutAmount = (1 - d / cut.radius) * cut.weight;
                score -= cutAmount;
            }
        }

        const coastNoise = (this.fbm(cx, cy, 0.16, 10) - 0.5) * 0.28;
        return score + coastNoise - this.edgePenalty(cx, cy);
    }

    private isNearTown(cx: number, cy: number): TownInfo | null {
        for (const town of this.getTownDefinitions()) {
            const dx = cx - town.chunkX;
            const dy = cy - town.chunkY;
            if (Math.sqrt(dx * dx + dy * dy) <= town.radius) return town;
        }
        return null;
    }

    private isInSpecialZone(cx: number, cy: number): boolean {
        return this.getSpecialZones().some((zone) => Math.hypot(cx - zone.cx, cy - zone.cy) <= zone.r);
    }

    private chooseAnchoredBiome(cx: number, cy: number): LandBiome {
        const bendX = (this.fbm(cx, cy, 0.12, 30) - 0.5) * 7;
        const bendY = (this.fbm(cx + 300, cy - 140, 0.12, 31) - 0.5) * 7;
        const px = cx + bendX;
        const py = cy + bendY;

        const anchors = this.getBiomeAnchors();
        let best = anchors[0];
        let bestScore = Infinity;
        for (const anchor of anchors) {
            const d = Math.hypot(px - anchor.cx, py - anchor.cy);
            const score = d / anchor.weight;
            if (score < bestScore) {
                best = anchor;
                bestScore = score;
            }
        }

        return best.biome;
    }

    private determineBiome(cx: number, cy: number): BiomeType {
        const town = this.isNearTown(cx, cy);
        if (town) return 'town';

        const score = this.landScore(cx, cy);
        if (score <= 0) return 'ocean';
        if (score < 0.13) return 'sand';

        if (this.isInSpecialZone(cx, cy)) return 'special';

        return this.chooseAnchoredBiome(cx, cy);
    }

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

    /** Get the biome for a chunk coordinate */
    public getBiome(chunkX: number, chunkY: number): BiomeType {
        if (chunkX < 0 || chunkX >= MAP_WIDTH || chunkY < 0 || chunkY >= MAP_HEIGHT) {
            return 'ocean';
        }
        return this.grid[chunkY][chunkX];
    }

    /** Get all town infos */
    public getTowns(): TownInfo[] {
        return [...this.getTownDefinitions()];
    }

    /** Get all temple/realm gate infos */
    public getTemples(): TempleInfo[] {
        return [...this.getTempleDefinitions()];
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
