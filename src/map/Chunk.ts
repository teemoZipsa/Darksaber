/**
 * Chunk — a fixed-size tile matrix.
 * Each chunk pre-renders its tiles to an offscreen canvas for performance.
 * On first render or when dirty, tiles are drawn once to the buffer.
 * Subsequent frames simply blit the buffer to the main canvas.
 */

import { TileType, TILE_PROPERTIES } from './Tile';

export const CHUNK_SIZE = 32; // tiles per chunk side
export const TILE_SIZE = 32;  // pixels per tile

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
    public render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
        if (this.dirty) {
            this.renderToBuffer();
            this.dirty = false;
        }
        ctx.drawImage(this.buffer, screenX, screenY);
    }

    private renderToBuffer(): void {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tileType = this.tiles[y][x];
                const props = TILE_PROPERTIES[tileType];
                this.bufferCtx.fillStyle = props.color;
                this.bufferCtx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }

        // Draw subtle grid lines on buffer
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
