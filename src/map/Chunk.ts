/**
 * Chunk — a fixed-size tile matrix.
 * Each chunk pre-renders its tiles to an offscreen canvas for performance.
 * On first render or when dirty, tiles are drawn once to the buffer.
 * Subsequent frames blit the buffer; only open water is refreshed at 6.25 fps.
 */

import { TileType } from './Tile';
import { TileAssetManager, WATER_ANIMATION_FRAMES, WATER_ANIMATION_FRAME_MS } from './TileAssetManager';
import { planGroundLayers, planShoreLayers } from './TerrainTransition';

export const CHUNK_SIZE = 32; // tiles per chunk side
export const TILE_SIZE = 48;  // pixels per tile (Upgraded to MV/MZ standard)

export class Chunk {
    public readonly chunkX: number; // chunk coordinate (not pixel)
    public readonly chunkY: number;
    public readonly tiles: TileType[][];

    private buffer: OffscreenCanvas;
    private bufferCtx: OffscreenCanvasRenderingContext2D;
    private dirty: boolean = true;
    private waterFrame = 0;
    private terrainRevision = -1;
    private animatedWaterTiles: { x: number; y: number; type: TileType; blend: boolean }[] = [];

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
    public render(
        ctx: CanvasRenderingContext2D,
        screenX: number,
        screenY: number,
        getGlobalTile: (x: number, y: number) => TileType,
        renderScale: number = 1,
        animationTimeMs: number = 0
    ): void {
        // A lazy terrain texture can finish after the first cached render.
        // Refresh once when it arrives, including any cached snow edge masks.
        const revision = TileAssetManager.getTerrainRevision();
        if (this.terrainRevision !== revision) this.dirty = true;
        if (this.dirty) {
            this.renderToBuffer(getGlobalTile);
            this.dirty = false;
            this.waterFrame = 0;
            this.terrainRevision = revision;
        }
        const frame = Math.floor(Math.max(0, animationTimeMs) / WATER_ANIMATION_FRAME_MS) % WATER_ANIMATION_FRAMES;
        if (frame !== this.waterFrame) {
            this.renderWaterFrame(frame);
            this.waterFrame = frame;
        }

        const scale = Math.max(0.001, renderScale);
        const width = this.buffer.width;
        const height = this.buffer.height;
        const x = Math.floor(screenX * scale) / scale;
        const y = Math.floor(screenY * scale) / scale;
        const right = Math.ceil((screenX + width) * scale) / scale;
        const bottom = Math.ceil((screenY + height) * scale) / scale;

        const previousSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.buffer, 0, 0, width, height, x, y, right - x, bottom - y);
        ctx.imageSmoothingEnabled = previousSmoothing;
    }

    private renderToBuffer(getGlobalTile: (x: number, y: number) => TileType): void {
        this.animatedWaterTiles = [];
        // Helper: is this a water-family tile?
        const isWaterType = (t: TileType) => t === TileType.WATER || t === TileType.DEEP_WATER;

        // ── Pass 1: Base fill for every tile ──
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                const worldX = this.chunkX * CHUNK_SIZE + x;
                const worldY = this.chunkY * CHUNK_SIZE + y;
                if (tileType === TileType.DEEP_WATER) {
                    // Far from coast → Deep Sea #0 (dark blue ocean)
                    TileAssetManager.drawTile(this.bufferCtx, TileType.DEEP_WATER, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, worldX, worldY);
                } else if (tileType === TileType.WATER) {
                    // Near coast → Sea #0 (lighter blue)
                    TileAssetManager.drawTile(this.bufferCtx, TileType.WATER, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, worldX, worldY);
                } else {
                    // Land tiles get grass base
                    TileAssetManager.drawTile(this.bufferCtx, TileType.GRASS, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, worldX, worldY);
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
                    TileAssetManager.drawTile(this.bufferCtx, TileType.WATER, px, py, TILE_SIZE, worldX, worldY);
                } else {
                    this.bufferCtx.globalAlpha = 0.35;
                    TileAssetManager.drawTile(this.bufferCtx, TileType.DEEP_WATER, px, py, TILE_SIZE, worldX, worldY);
                }
            }
        }
        this.bufferCtx.globalAlpha = prevAlpha;

        // ── Pass 3: Rocky banks over the adjoining land, for both water types ──
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                if (!isWaterType(tileType)) continue;

                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                const worldX = this.chunkX * CHUNK_SIZE + x;
                const worldY = this.chunkY * CHUNK_SIZE + y;

                // Check if this water tile borders any non-water tile
                const neighbors = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
                    .map(([dx, dy]) => getGlobalTile(worldX + dx, worldY + dy));
                const connections = neighbors.map(isWaterType);

                // Only open water animates. Keep shore artwork and island
                // corners fixed, including diagonals across chunk boundaries.
                if (connections.every(Boolean)) {
                    const blend = [0, 2, 4, 6].some(index => neighbors[index] !== tileType);
                    this.animatedWaterTiles.push({ x, y, type: tileType, blend });
                    continue;
                }
                // Shore cells contain transparent LAND outside the rocks. An
                // opaque water base here leaves blue rectangles beyond them.
                planShoreLayers(neighbors).forEach((layer, index) => {
                    if (index === 0) TileAssetManager.drawTile(this.bufferCtx, layer.type, px, py, TILE_SIZE, worldX, worldY);
                    else TileAssetManager.drawGroundAutotile(this.bufferCtx, layer.type, px, py, TILE_SIZE, layer.connections, worldX, worldY);
                });
                // Preserve exact original shapes; compose missing narrow ones.
                TileAssetManager.drawGroundAutotile(this.bufferCtx, tileType, px, py, TILE_SIZE,
                    connections, worldX, worldY);
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

                const neighborTypes = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
                    .map(([dx, dy]) => getGlobalTile(worldX + dx, worldY + dy));
                const layers = planGroundLayers(tileType, neighborTypes);
                if (layers) {
                    layers.forEach((layer, index) => {
                        if (index === 0) TileAssetManager.drawTile(this.bufferCtx, layer.type, px, py, TILE_SIZE, worldX, worldY);
                        else TileAssetManager.drawGroundAutotile(this.bufferCtx, layer.type, px, py, TILE_SIZE, layer.connections, worldX, worldY);
                    });
                    continue;
                }

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
                    n, ne, e, se, s, sw, w, nw,
                    worldX, worldY
                );
            }
        }

        this.sealBufferEdges();
    }

    private renderWaterFrame(frame: number): void {
        if (this.animatedWaterTiles.length === 0) return;
        const ctx = this.bufferCtx;
        const previousAlpha = ctx.globalAlpha;
        for (const { x, y, type, blend } of this.animatedWaterTiles) {
            const worldX = this.chunkX * CHUNK_SIZE + x;
            const worldY = this.chunkY * CHUNK_SIZE + y;
            ctx.globalAlpha = 1;
            TileAssetManager.drawAnimatedWater(ctx, type, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, worldX, worldY, frame);
            if (blend) {
                const other = type === TileType.WATER ? TileType.DEEP_WATER : TileType.WATER;
                ctx.globalAlpha = type === TileType.WATER ? 0.35 : 0.4;
                TileAssetManager.drawAnimatedWater(ctx, other, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, worldX, worldY, frame);
            }
        }
        ctx.globalAlpha = previousAlpha;
        this.sealBufferEdges();
    }

    private sealBufferEdges(): void {
        const size = this.buffer.width;
        const previousSmoothing = this.bufferCtx.imageSmoothingEnabled;
        this.bufferCtx.imageSmoothingEnabled = false;
        this.bufferCtx.drawImage(this.buffer, 1, 0, 1, size, 0, 0, 1, size);
        this.bufferCtx.drawImage(this.buffer, size - 2, 0, 1, size, size - 1, 0, 1, size);
        this.bufferCtx.drawImage(this.buffer, 0, 1, size, 1, 0, 0, size, 1);
        this.bufferCtx.drawImage(this.buffer, 0, size - 2, size, 1, 0, size - 1, size, 1);
        this.bufferCtx.imageSmoothingEnabled = previousSmoothing;
    }
}
