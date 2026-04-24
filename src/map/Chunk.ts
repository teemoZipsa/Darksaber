/**
 * Chunk — a fixed-size tile matrix.
 * Each chunk pre-renders its tiles to an offscreen canvas for performance.
 * On first render or when dirty, tiles are drawn once to the buffer.
 * Subsequent frames simply blit the buffer to the main canvas.
 */

import { TileType, TILE_PROPERTIES } from './Tile';
import { SettingsManager } from '../engine/SettingsManager';
import { TileAssetManager } from './TileAssetManager';

export const CHUNK_SIZE = 32; // tiles per chunk side
export const TILE_SIZE = 48;  // pixels per tile (Upgraded to MV/MZ standard)

export class Chunk {
    public readonly chunkX: number; // chunk coordinate (not pixel)
    public readonly chunkY: number;
    public readonly tiles: TileType[][];

    private buffer: OffscreenCanvas;
    private bufferCtx: OffscreenCanvasRenderingContext2D;
    private dirty: boolean = true;

    constructor(chunkX: number, chunkY: number, tiles: TileType[][]) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.tiles = tiles;

        const pixelSize = CHUNK_SIZE * TILE_SIZE;
        this.buffer = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = this.buffer.getContext('2d');
        if (!ctx) throw new Error('Failed to create offscreen canvas context');
        this.bufferCtx = ctx;
    }

    /** Get the tile at local coordinates within this chunk */
    public getTile(localX: number, localY: number): TileType {
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
            return TileType.WALL;
        }
        return this.tiles[localY][localX];
    }

    /** Mark chunk as needing re-render (e.g. after tile edit) */
    public markDirty(): void {
        this.dirty = true;
    }

    /** Render chunk to its offscreen buffer if dirty, then blit to main canvas */
    public render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, getGlobalTile: (x: number, y: number) => TileType): void {
        if (this.dirty) {
            this.renderToBuffer(getGlobalTile);
            this.dirty = false;
        }
        ctx.drawImage(this.buffer, Math.round(screenX), Math.round(screenY));
    }

    private renderToBuffer(getGlobalTile: (x: number, y: number) => TileType): void {
        // Helper: is this a water-family tile?
        const isWaterType = (t: TileType) => t === TileType.WATER || t === TileType.DEEP_WATER;

        // ── Pass 1: Base fill for every tile ──
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                if (tileType === TileType.DEEP_WATER) {
                    // Far from coast → Deep Sea #0 (dark blue ocean)
                    TileAssetManager.drawTile(this.bufferCtx, TileType.DEEP_WATER, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE);
                } else if (tileType === TileType.WATER) {
                    // Near coast → Sea #0 (lighter blue)
                    TileAssetManager.drawTile(this.bufferCtx, TileType.WATER, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE);
                } else {
                    // Land tiles get grass base
                    TileAssetManager.drawTile(this.bufferCtx, TileType.GRASS, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // ── Pass 2: Alpha-blend transition at Sea/Deep Sea boundary ──
        // Draw the neighboring water type at reduced opacity for smooth gradient
        const prevAlpha = this.bufferCtx.globalAlpha;
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                if (!isWaterType(tileType)) continue;

                const worldX = this.chunkX * CHUNK_SIZE + x;
                const worldY = this.chunkY * CHUNK_SIZE + y;
                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;

                // Check 4 cardinal neighbors for a different water type
                let hasOtherWater = false;
                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nt = getGlobalTile(worldX + dx, worldY + dy);
                    if (isWaterType(nt) && nt !== tileType) {
                        hasOtherWater = true;
                        break;
                    }
                }
                if (!hasOtherWater) continue;

                // Blend: overlay the OTHER water type at reduced opacity
                if (tileType === TileType.DEEP_WATER) {
                    this.bufferCtx.globalAlpha = 0.4;
                    TileAssetManager.drawTile(this.bufferCtx, TileType.WATER, px, py, TILE_SIZE);
                } else {
                    this.bufferCtx.globalAlpha = 0.35;
                    TileAssetManager.drawTile(this.bufferCtx, TileType.DEEP_WATER, px, py, TILE_SIZE);
                }
            }
        }
        this.bufferCtx.globalAlpha = prevAlpha;

        // ── Pass 3: Sea autotile on COASTLINE tiles only ──
        // Sea autotile has beach edges — only on WATER tiles bordering land
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                if (tileType !== TileType.WATER) continue;

                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                const worldX = this.chunkX * CHUNK_SIZE + x;
                const worldY = this.chunkY * CHUNK_SIZE + y;

                // Check if this water tile borders any non-water tile
                const isWaterNeighbor = (nx: number, ny: number) => isWaterType(getGlobalTile(nx, ny));
                const n_w  = isWaterNeighbor(worldX,     worldY - 1);
                const ne_w = isWaterNeighbor(worldX + 1, worldY - 1);
                const e_w  = isWaterNeighbor(worldX + 1, worldY);
                const se_w = isWaterNeighbor(worldX + 1, worldY + 1);
                const s_w  = isWaterNeighbor(worldX,     worldY + 1);
                const sw_w = isWaterNeighbor(worldX - 1, worldY + 1);
                const w_w  = isWaterNeighbor(worldX - 1, worldY);
                const nw_w = isWaterNeighbor(worldX - 1, worldY - 1);

                // If ALL 8 neighbors are water → interior tile → skip
                if (n_w && ne_w && e_w && se_w && s_w && sw_w && w_w && nw_w) continue;

                // Coastline tile: draw Sea autotile with proper neighbor detection
                TileAssetManager.drawAutotile(
                    this.bufferCtx, TileType.WATER, px, py, TILE_SIZE,
                    n_w, ne_w, e_w, se_w, s_w, sw_w, w_w, nw_w
                );
            }
        }

        // ── Pass 4: Land tile autotile (ALL tiles, proper bitmasking) ──
        // Every land tile gets the correct autotile shape via 8-direction neighbor check
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                if (isWaterType(tileType)) continue; // Skip water (already rendered)

                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                const worldX = this.chunkX * CHUNK_SIZE + x;
                const worldY = this.chunkY * CHUNK_SIZE + y;

                const isSame = (nx: number, ny: number) => getGlobalTile(nx, ny) === tileType;
                const n  = isSame(worldX,     worldY - 1);
                const ne = isSame(worldX + 1, worldY - 1);
                const e  = isSame(worldX + 1, worldY);
                const se = isSame(worldX + 1, worldY + 1);
                const s  = isSame(worldX,     worldY + 1);
                const sw = isSame(worldX - 1, worldY + 1);
                const w  = isSame(worldX - 1, worldY);
                const nw = isSame(worldX - 1, worldY - 1);

                TileAssetManager.drawAutotile(
                    this.bufferCtx, tileType, px, py, TILE_SIZE,
                    n, ne, e, se, s, sw, w, nw
                );
            }
        }

        // ── Pass 3: World_B sprite overlay (objects) ──
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                const props = TILE_PROPERTIES[tileType];
                if (props.worldBIndex !== undefined) {
                    TileAssetManager.drawWorldBSprite(
                        this.bufferCtx, props.worldBIndex,
                        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE
                    );
                }
            }
        }

        // Draw subtle grid lines on buffer
        if (SettingsManager.getGrid()) {
            this.bufferCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            this.bufferCtx.lineWidth = 0.5;
            for (let y = 0; y <= CHUNK_SIZE; y++) {
                this.bufferCtx.beginPath();
                this.bufferCtx.moveTo(0, y * TILE_SIZE);
                this.bufferCtx.lineTo(CHUNK_SIZE * TILE_SIZE, y * TILE_SIZE);
                this.bufferCtx.stroke();
            }
            for (let x = 0; x <= CHUNK_SIZE; x++) {
                this.bufferCtx.beginPath();
                this.bufferCtx.moveTo(x * TILE_SIZE, 0);
                this.bufferCtx.lineTo(x * TILE_SIZE, CHUNK_SIZE * TILE_SIZE);
                this.bufferCtx.stroke();
            }
        }
    }
}
