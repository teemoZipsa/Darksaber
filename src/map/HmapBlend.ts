import { TileType } from './Tile';

/**
 * Shared edge-blending helpers for the hand-authored scenario heightmaps
 * (story hmaps and the Burgos Castle hmap). The raw hmaps are 138x138 tile
 * rectangles lifted from the original client BMPs; stamping them onto the
 * procedurally generated world produces hard, straight rectangular seams and
 * hard cuts where two scenarios overlap.
 *
 * `sampleHmapEdge` feathers the outer ring of each hmap into the surrounding
 * procedural biome using deterministic noise, and reports a `weight` (distance
 * to the nearest hmap edge) so overlapping scenarios can be resolved by
 * "whichever scenario this tile sits deeper inside wins".
 */

export interface HmapSample {
    /** Resolved tile for this hmap cell. */
    tile: TileType;
    /** Distance (in tiles) from the nearest hmap edge. Larger = more interior / more authoritative. */
    weight: number;
}

/** Width (in tiles) of the feathered transition ring at the hmap border. */
export const HMAP_BLEND_BAND = 16;

function hash(x: number, y: number, salt = 0): number {
    let h = x * 374761393 + y * 668265263 + salt * 1442695041;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

/** Deterministic value noise in [0, 1), mirrors WorldMap's noise so edges read consistently. */
function noise(x: number, y: number, scale: number, salt = 0): number {
    const sx = x * scale;
    const sy = y * scale;
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);
    const fx = sx - ix;
    const fy = sy - iy;
    const u = smoothstep(fx);
    const v = smoothstep(fy);
    const a = hash(ix, iy, salt);
    const b = hash(ix + 1, iy, salt);
    const c = hash(ix, iy + 1, salt);
    const d = hash(ix + 1, iy + 1, salt);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Sample an hmap cell with a feathered edge.
 *
 * - Interior cells (`edgeDist >= HMAP_BLEND_BAND`) are authoritative and keep
 *   their full distance as weight.
 * - Cells inside the blend band are kept only when a smooth, deterministic
 *   noise jitter accepts them, so the boundary wiggles organically and dithers
 *   into the procedural biome instead of forming a straight line. Rejected
 *   cells return `null` (fall through to the procedural biome).
 */
export function sampleHmapEdge(tile: TileType, edgeDist: number, tx: number, ty: number): HmapSample | null {
    if (edgeDist >= HMAP_BLEND_BAND) {
        return { tile, weight: edgeDist };
    }
    const t = edgeDist / HMAP_BLEND_BAND;
    const jitter = (noise(tx, ty, 0.16, 7) - 0.5) * 0.8;
    if (t + jitter <= 0.5) return null;
    return { tile, weight: edgeDist };
}
