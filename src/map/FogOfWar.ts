/**
 * FogOfWar — Cloud-tile fog at camera edges only.
 *
 * Instead of tile-based seen/unseen tracking, cloud tiles are rendered
 * only at the screen borders with a smooth fade-in towards the edges.
 * The center of the screen is always fully clear.
 */

import { TILE_SIZE } from './Chunk';

const CLOUD_VARIANTS = 4;

/** How many tiles from the screen edge the clouds extend inward */
const EDGE_DEPTH = 4;

export class FogOfWar {
    /** Vision radius in tiles (kept for API compat, unused now) */
    public visionRadius: number = 8;

    /** Whether fog is enabled */
    public enabled: boolean = true;

    /** Cloud tile sprites */
    private cloudTiles: OffscreenCanvas[] = [];
    private initialized: boolean = false;

    private tileHash(x: number, y: number): number {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        return (h ^ (h >> 16)) & 0x7fffffff;
    }

    private createCloudTile(variant: number): OffscreenCanvas {
        const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
        const ctx = canvas.getContext('2d')!;

        const baseR = 160 + variant * 8;
        const baseG = 168 + variant * 6;
        const baseB = 180 + variant * 4;

        ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
        ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

        const seed = variant * 1000;
        const dotSize = 4;
        for (let y = 0; y < TILE_SIZE; y += dotSize) {
            for (let x = 0; x < TILE_SIZE; x += dotSize) {
                const h = this.tileHash(x + seed, y + seed * 3);
                const noise = (h % 100) / 100;
                if (noise > 0.5) {
                    ctx.fillStyle = `rgba(255, 255, 255, 0.15)`;
                    ctx.fillRect(x, y, dotSize, dotSize);
                } else if (noise < 0.25) {
                    ctx.fillStyle = `rgba(80, 90, 110, 0.2)`;
                    ctx.fillRect(x, y, dotSize, dotSize);
                }
            }
        }

        const puffs = 3 + (variant % 3);
        for (let p = 0; p < puffs; p++) {
            const px = (this.tileHash(variant * 7 + p, p * 13) % (TILE_SIZE - 8)) + 4;
            const py = (this.tileHash(p * 11 + variant, variant * 5 + p) % (TILE_SIZE - 8)) + 4;
            const pr = 4 + (this.tileHash(variant + p, p) % 6);
            ctx.fillStyle = `rgba(220, 225, 235, 0.35)`;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }

        return canvas;
    }

    private init(): void {
        if (this.initialized) return;
        this.initialized = true;
        for (let v = 0; v < CLOUD_VARIANTS; v++) {
            this.cloudTiles.push(this.createCloudTile(v));
        }
    }

    /** No-op in edge-only mode */
    public update(_playerGX: number, _playerGY: number): void {}

    /** Render cloud fog at camera edges. Call AFTER entities, BEFORE HUD. */
    public render(
        ctx: CanvasRenderingContext2D,
        _playerGX: number,
        _playerGY: number,
        camX: number,
        camY: number,
        viewW: number,
        viewH: number
    ): void {
        if (!this.enabled) return;
        this.init();

        const startTX = Math.floor(camX / TILE_SIZE) - 1;
        const startTY = Math.floor(camY / TILE_SIZE) - 1;
        const endTX = Math.ceil((camX + viewW) / TILE_SIZE) + 1;
        const endTY = Math.ceil((camY + viewH) / TILE_SIZE) + 1;


        for (let ty = startTY; ty <= endTY; ty++) {
            for (let tx = startTX; tx <= endTX; tx++) {
                // Distance from each edge in tile units
                const fromLeft = tx - startTX;
                const fromRight = endTX - tx;
                const fromTop = ty - startTY;
                const fromBottom = endTY - ty;

                // Minimum distance to any edge
                const edgeDist = Math.min(fromLeft, fromRight, fromTop, fromBottom);

                // Only render clouds within EDGE_DEPTH tiles of the edge
                if (edgeDist >= EDGE_DEPTH) continue;

                const screenX = tx * TILE_SIZE - camX;
                const screenY = ty * TILE_SIZE - camY;
                const variant = this.tileHash(tx, ty) % CLOUD_VARIANTS;

                // Alpha: full at edge (1.0), fades to 0 at EDGE_DEPTH
                // smoothstep for nice transition
                const t = edgeDist / EDGE_DEPTH;
                const alpha = 1 - t * t * (3 - 2 * t);

                ctx.globalAlpha = alpha;
                ctx.drawImage(this.cloudTiles[variant], screenX, screenY);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    /** Reset for new raid — no state to reset in edge mode */
    public reset(): void {}
}
