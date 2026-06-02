/**
 * Shared, pure field-spawn resolver for authoritative server field content.
 * Lightweight client tests may call this module directly, but gameplay spawns
 * are owned by `WorldSession`.
 *
 * Design (see plan eager-beaming-sunset.md):
 *  - Region danger is blended from the 20 story-scenario anchors (their guard
 *    levels) plus the town anchors (which pull danger down). No new authored
 *    danger map is needed — the story curve already encodes intended difficulty
 *    at each location.
 *  - Each monster has a fixed `baseLevel` and an allowed `levelBand`. The spawn
 *    level is the base nudged toward the region danger, clamped to the band
 *    (fixed identity + bounded regional adjustment).
 *  - Monsters whose band does not overlap the local danger simply do not spawn
 *    there; higher zones swap in higher-band species.
 */
import {
    MONSTER_DEFINITIONS,
    NEW_MONSTER_IDS,
    GENERAL_MONSTER_IDS,
    type MonsterId,
} from '../data/MonsterCatalog';
import { STORY_SCENARIOS } from '../data/StoryScenarioData';
import type { BiomeType, WorldRealm } from '../map/BiomeMask';

/** Tiles per chunk side — mirrors `CHUNK_SIZE` in src/map/Chunk.ts. */
export const CHUNK_TILES = 32;

export interface SpawnContext {
    realm: WorldRealm;
    chunkX: number;
    chunkY: number;
    biome: BiomeType;
    /** Stable per-session/world seed string (e.g. `server:<epoch>`). */
    seed: string;
}

export interface SpawnedMonster {
    monsterId: MonsterId;
    level: number;
}

export interface FieldNest {
    chunkX: number;
    chunkY: number;
    nestId: string;
    /** Tile coordinate at the centre of the nest, before walkable correction. */
    centerTile: { x: number; y: number };
    monsters: SpawnedMonster[];
}

/** Persisted nest bookkeeping owned by the authoritative server. */
export interface FieldNestState {
    chunkKey: string;
    nestId: string;
    centerTile: { x: number; y: number };
    /** Active server enemy IDs currently attached to this nest. */
    monsterIds: string[];
    /** Epoch ms at/after which a cleared nest may respawn; 0 = not cleared. */
    respawnAt: number;
    cleared: boolean;
}

// ── Danger anchors ──────────────────────────────────────────────────────────

interface DangerAnchor {
    cx: number;
    cy: number;
    level: number;
    weight: number;
}

// Town coordinates mirror MORTAL_TOWNS / MASTER_TOWNS in src/map/BiomeMask.ts.
// Towns are safe bubbles: they pull danger down, but only locally (see TOWN_REACH)
// so they don't flatten distant high-level zones.
const MORTAL_TOWN_ANCHORS: DangerAnchor[] = [
    { cx: 16, cy: 11, level: 1, weight: 6 },
    { cx: 10, cy: 52, level: 1, weight: 6 },
    { cx: 37, cy: 44, level: 1, weight: 8 },
    { cx: 12, cy: 79, level: 1, weight: 6 },
    { cx: 41, cy: 80, level: 1, weight: 6 },
    { cx: 64, cy: 23, level: 1, weight: 6 },
    { cx: 63, cy: 49, level: 1, weight: 6 },
    { cx: 63, cy: 72, level: 1, weight: 6 },
];

const MASTER_TOWN_ANCHORS: DangerAnchor[] = [
    { cx: 40, cy: 50, level: 6, weight: 8 },
    { cx: 23, cy: 28, level: 6, weight: 8 },
    { cx: 60, cy: 67, level: 6, weight: 8 },
];

// Scenario anchors use bossLevel (3→19) so the open field near a dungeon is as
// lethal as the dungeon itself — this is what makes deep zones spawn the 400/600
// roster. guardLevel (max 11) would cap the field too low for the late game.
const MORTAL_SCENARIO_ANCHORS: DangerAnchor[] =
    STORY_SCENARIOS.map((s) => ({ cx: s.chunkX, cy: s.chunkY, level: s.bossLevel, weight: 1 }));

// Master realm has no story anchors; flat high band that eases near master towns.
const MASTER_SCENARIO_ANCHORS: DangerAnchor[] = [
    { cx: 40, cy: 50, level: 16, weight: 1 },
    { cx: 30, cy: 40, level: 16, weight: 1 },
    { cx: 50, cy: 60, level: 16, weight: 1 },
];

const DANGER_MIN = 1;
const DANGER_MAX = 20;
// Smoothing constant for inverse-distance weighting (in chunk units²).
const DANGER_SMOOTH = 4;
// Towns only influence danger within this many chunks (local safe bubble).
const TOWN_REACH = 8;
const TOWN_REACH_SQ = TOWN_REACH * TOWN_REACH;

/**
 * Blended difficulty for a chunk, on the same 1–20 scale as scenario levels.
 * Pure function of static anchor data — deterministic and side-effect free.
 */
export function getFieldDanger(chunkX: number, chunkY: number, realm: WorldRealm = 'mortal'): number {
    const scenarioAnchors = realm === 'master' ? MASTER_SCENARIO_ANCHORS : MORTAL_SCENARIO_ANCHORS;
    const townAnchors = realm === 'master' ? MASTER_TOWN_ANCHORS : MORTAL_TOWN_ANCHORS;
    let weightSum = 0;
    let levelSum = 0;
    for (const a of scenarioAnchors) {
        const dx = chunkX - a.cx;
        const dy = chunkY - a.cy;
        const w = a.weight / (dx * dx + dy * dy + DANGER_SMOOTH);
        weightSum += w;
        levelSum += w * a.level;
    }
    for (const a of townAnchors) {
        const dx = chunkX - a.cx;
        const dy = chunkY - a.cy;
        const distSq = dx * dx + dy * dy;
        if (distSq > TOWN_REACH_SQ) continue; // local bubble only
        const w = a.weight / (distSq + DANGER_SMOOTH);
        weightSum += w;
        levelSum += w * a.level;
    }
    if (weightSum === 0) return DANGER_MIN;
    return clamp(Math.round(levelSum / weightSum), DANGER_MIN, DANGER_MAX);
}

// ── Eligibility + level resolution ────────────────────────────────────────────

const MIN_REGION_SHIFT = -2;
const MAX_REGION_SHIFT = 3;

/** A monster spawns in a zone only if its band overlaps the local danger (±1). */
export function isEligible(monsterId: MonsterId, danger: number): boolean {
    const def = MONSTER_DEFINITIONS[monsterId];
    if (!def || def.role === 'boss') return false;
    const [min, max] = def.levelBand;
    return danger >= min - 1 && danger <= max + 1;
}

/** Fixed base level nudged toward region danger, then clamped to the band. */
export function resolveSpawnLevel(monsterId: MonsterId, danger: number): number {
    const def = MONSTER_DEFINITIONS[monsterId];
    const [min, max] = def.levelBand;
    const shift = clamp(danger - def.level, MIN_REGION_SHIFT, MAX_REGION_SHIFT);
    return clamp(def.level + shift, min, max);
}

// ── Biome affinity ────────────────────────────────────────────────────────────

const BIOME_TAGS: Record<BiomeType, string[]> = {
    grass: ['grass', 'castle'],
    forest: ['forest', 'grass'],
    sand: ['sand'],
    stone: ['stone', 'cave', 'castle', 'ament'],
    snow: ['snow', 'forest'],
    lava: ['lava', 'cave'],
    special: ['special', 'cave'],
    town: [],
    ocean: [],
};

// Candidate pool = new roster + legacy general roster, minus bosses.
const FIELD_MONSTER_POOL: MonsterId[] = [...GENERAL_MONSTER_IDS, ...NEW_MONSTER_IDS];

interface WeightedMonster {
    monsterId: MonsterId;
    weight: number;
}

/**
 * Monsters that may appear in this biome at this danger, with selection weights.
 * Falls back to danger-only eligibility if no species matches the biome, so
 * land chunks are never empty.
 */
export function getRegionPacks(biome: BiomeType, danger: number): WeightedMonster[] {
    const biomeTags = BIOME_TAGS[biome] ?? [];
    const eligible = FIELD_MONSTER_POOL.filter((id) => isEligible(id, danger));

    const matchBiome = (id: MonsterId): number => {
        const def = MONSTER_DEFINITIONS[id];
        return def.spawnTags.reduce((n, tag) => n + (biomeTags.includes(tag) ? 1 : 0), 0);
    };

    let pool = eligible.filter((id) => matchBiome(id) > 0);
    if (pool.length === 0) pool = eligible; // biome had no native species at this danger

    return pool.map((id) => {
        const def = MONSTER_DEFINITIONS[id];
        const biomeMatches = matchBiome(id);
        // Prefer species whose base level sits near the local danger.
        const proximity = 1 / (1 + Math.abs(def.level - danger));
        const weight = (1 + biomeMatches * 2) * proximity;
        return { monsterId: id, weight };
    });
}

// ── Deterministic RNG ─────────────────────────────────────────────────────────

function xmur3(str: string): () => number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    };
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRng(...parts: (string | number)[]): () => number {
    const seedFn = xmur3(parts.join(':'));
    return mulberry32(seedFn());
}

function weightedPick(pool: WeightedMonster[], rng: () => number): MonsterId {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let roll = rng() * total;
    for (const p of pool) {
        roll -= p.weight;
        if (roll <= 0) return p.monsterId;
    }
    return pool[pool.length - 1].monsterId;
}

// ── Pack + nest generation ─────────────────────────────────────────────────────

const NEST_CHANCE = 0.55; // share of land chunks that hold a nest
const PACK_MIN = 2;
const PACK_MAX = 4;

/** Roll a pack of monsters (with resolved levels) for a biome/danger. */
export function rollPackMonsters(
    biome: BiomeType,
    danger: number,
    count: number,
    rng: () => number,
): SpawnedMonster[] {
    const pool = getRegionPacks(biome, danger);
    if (pool.length === 0) return [];
    const out: SpawnedMonster[] = [];
    for (let i = 0; i < count; i++) {
        const monsterId = weightedPick(pool, rng);
        out.push({ monsterId, level: resolveSpawnLevel(monsterId, danger) });
    }
    return out;
}

/**
 * Deterministically decide the (single) nest a chunk holds, if any.
 * `force` guarantees a nest (used to seed the area around the spawn town).
 * Returns null for water/town chunks or chunks that rolled no nest.
 */
export function pickNestForChunk(ctx: SpawnContext, force = false): FieldNest | null {
    if (ctx.biome === 'ocean' || ctx.biome === 'town') return null;

    const danger = getFieldDanger(ctx.chunkX, ctx.chunkY, ctx.realm);
    const rng = makeRng(ctx.seed, 'nest', ctx.chunkX, ctx.chunkY);

    if (!force && rng() > NEST_CHANCE) return null;

    const pool = getRegionPacks(ctx.biome, danger);
    if (pool.length === 0) return null;

    const count = PACK_MIN + Math.floor(rng() * (PACK_MAX - PACK_MIN + 1));
    const monsters = rollPackMonsters(ctx.biome, danger, count, rng);
    if (monsters.length === 0) return null;

    // Centre tile somewhere inside the chunk (kept away from the very edges).
    const baseX = ctx.chunkX * CHUNK_TILES;
    const baseY = ctx.chunkY * CHUNK_TILES;
    const cx = baseX + 6 + Math.floor(rng() * (CHUNK_TILES - 12));
    const cy = baseY + 6 + Math.floor(rng() * (CHUNK_TILES - 12));

    return {
        chunkX: ctx.chunkX,
        chunkY: ctx.chunkY,
        nestId: `nest_${ctx.chunkX}_${ctx.chunkY}`,
        centerTile: { x: cx, y: cy },
        monsters,
    };
}

/** Small ring of offsets around a nest centre for placing pack members. */
export function nestMemberOffsets(count: number): { x: number; y: number }[] {
    const ring = [
        { x: 0, y: 0 },
        { x: -2, y: -1 }, { x: 2, y: -1 }, { x: -2, y: 2 }, { x: 2, y: 2 },
        { x: 0, y: -3 }, { x: 0, y: 3 }, { x: -4, y: 0 }, { x: 4, y: 0 },
    ];
    return ring.slice(0, Math.max(1, count));
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}
