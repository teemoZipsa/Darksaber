/**
 * WorldMap — manages an infinite virtual grid of chunks.
 * Loads chunks around the camera viewport and unloads distant ones.
 * Uses simplex-like noise for procedural terrain generation.
 */

import { Chunk, CHUNK_SIZE, TILE_SIZE } from './Chunk';
import { TileType } from './Tile';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';

export class WorldMap {
    private chunks: Map<string, Chunk> = new Map();
    private loadRadius: number = 3; // chunks around center to keep loaded

    public loot: LootObject[] = [];
    public extractionZones: ExtractionZone[] = [];

    /** Simple hash-based pseudo-random noise for procedural generation */
    private hash(x: number, y: number): number {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        h = h ^ (h >> 16);
        return (h & 0x7fffffff) / 0x7fffffff; // 0..1
    }

    /** Multi-octave value noise for smoother terrain */
    private noise(worldX: number, worldY: number): number {
        // Simple interpolated noise with 2 octaves
        const scale1 = 0.02;
        const scale2 = 0.08;

        const ix1 = Math.floor(worldX * scale1);
        const iy1 = Math.floor(worldY * scale1);
        const fx1 = (worldX * scale1) - ix1;
        const fy1 = (worldY * scale1) - iy1;

        const a1 = this.hash(ix1, iy1);
        const b1 = this.hash(ix1 + 1, iy1);
        const c1 = this.hash(ix1, iy1 + 1);
        const d1 = this.hash(ix1 + 1, iy1 + 1);
        const v1 = this.lerp(this.lerp(a1, b1, fx1), this.lerp(c1, d1, fx1), fy1);

        const ix2 = Math.floor(worldX * scale2);
        const iy2 = Math.floor(worldY * scale2);
        const fx2 = (worldX * scale2) - ix2;
        const fy2 = (worldY * scale2) - iy2;

        const a2 = this.hash(ix2, iy2);
        const b2 = this.hash(ix2 + 1, iy2);
        const c2 = this.hash(ix2, iy2 + 1);
        const d2 = this.hash(ix2 + 1, iy2 + 1);
        const v2 = this.lerp(this.lerp(a2, b2, fx2), this.lerp(c2, d2, fx2), fy2);

        return v1 * 0.7 + v2 * 0.3;
    }

    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    /** Determine tile type from noise value */
    private getTileFromNoise(value: number): TileType {
        if (value < 0.25) return TileType.WATER;
        if (value < 0.35) return TileType.SAND;
        if (value < 0.55) return TileType.GRASS;
        if (value < 0.65) return TileType.FOREST;
        if (value < 0.80) return TileType.STONE;
        if (value < 0.90) return TileType.WALL;
        return TileType.LAVA;
    }

    /** Generate a chunk procedurally */
    private generateChunk(chunkX: number, chunkY: number): Chunk {
        const tiles: TileType[][] = [];
        const baseX = chunkX * CHUNK_SIZE;
        const baseY = chunkY * CHUNK_SIZE;

        for (let y = 0; y < CHUNK_SIZE; y++) {
            const row: TileType[] = [];
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const noiseVal = this.noise(baseX + x, baseY + y);
                row.push(this.getTileFromNoise(noiseVal));
            }
            tiles.push(row);
        }

        return new Chunk(chunkX, chunkY, tiles);
    }

    private chunkKey(cx: number, cy: number): string {
        return `${cx},${cy}`;
    }

    /** Ensure chunks around the given world position are loaded */
    public updateLoadedChunks(worldCenterX: number, worldCenterY: number): void {
        const centerChunkX = Math.floor(worldCenterX / (CHUNK_SIZE * TILE_SIZE));
        const centerChunkY = Math.floor(worldCenterY / (CHUNK_SIZE * TILE_SIZE));

        const neededKeys = new Set<string>();

        // Load chunks within radius
        for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
            for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
                const cx = centerChunkX + dx;
                const cy = centerChunkY + dy;
                const key = this.chunkKey(cx, cy);
                neededKeys.add(key);

                if (!this.chunks.has(key)) {
                    this.chunks.set(key, this.generateChunk(cx, cy));
                }
            }
        }

        // Unload chunks outside radius + 1 buffer
        const maxDist = this.loadRadius + 1;
        for (const [key, chunk] of this.chunks.entries()) {
            const dx = chunk.chunkX - centerChunkX;
            const dy = chunk.chunkY - centerChunkY;
            if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) {
                this.chunks.delete(key);
            }
        }
    }

    /** Render all loaded chunks visible in the viewport */
    public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, viewWidth: number, viewHeight: number): void {
        for (const chunk of this.chunks.values()) {
            const screenX = chunk.chunkX * CHUNK_SIZE * TILE_SIZE - cameraX;
            const screenY = chunk.chunkY * CHUNK_SIZE * TILE_SIZE - cameraY;

            // Frustum culling: skip chunks entirely off-screen
            const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;
            if (screenX + chunkPixelSize < 0 || screenX > viewWidth) continue;
            if (screenY + chunkPixelSize < 0 || screenY > viewHeight) continue;

            chunk.render(ctx, screenX, screenY);
        }

        // Render Extraction Zones
        for (const zone of this.extractionZones) {
            zone.render(ctx, (gx, gy) => ({
                x: gx * TILE_SIZE - cameraX,
                y: gy * TILE_SIZE - cameraY
            }), TILE_SIZE);
        }

        // Render Loot
        for (const obj of this.loot) {
            obj.render(ctx, obj.x * TILE_SIZE - cameraX, obj.y * TILE_SIZE - cameraY, TILE_SIZE);
        }
    }

    /** Get tile type at world tile coordinates */
    public getTileAt(tileX: number, tileY: number): TileType {
        const cx = Math.floor(tileX / CHUNK_SIZE);
        const cy = Math.floor(tileY / CHUNK_SIZE);
        const key = this.chunkKey(cx, cy);
        const chunk = this.chunks.get(key);
        if (!chunk) return TileType.WALL;

        let localX = tileX % CHUNK_SIZE;
        let localY = tileY % CHUNK_SIZE;
        if (localX < 0) localX += CHUNK_SIZE;
        if (localY < 0) localY += CHUNK_SIZE;

        return chunk.getTile(localX, localY);
    }

    public updateEntities(dt: number): void {
        for (const zone of this.extractionZones) {
            zone.update(dt);
        }
    }
}
