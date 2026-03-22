/**
 * FogOfWar — Cloud-tile fog with smooth border transition EVERYWHERE.
 *
 * 2-state: SEEN (permanently clear) vs UNSEEN (cloud fog).
 * Smooth gradient at ALL borders between seen and unseen tiles,
 * not just at the current vision circle.
 */

import { TILE_SIZE } from './Chunk';

const CLOUD_VARIANTS = 4;
const TRANSITION_WIDTH = 4; // tiles of gradient at every seen/unseen border

export class FogOfWar {
    /** Vision radius in tiles */
    public visionRadius: number = 8;

    /** Whether fog is enabled */
    public enabled: boolean = true;

    /** Tiles that have been seen (permanently clear) */
    private seenTiles: Set<string> = new Set();

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

    /**
     * For an unseen tile, find the minimum Manhattan distance to any seen tile
     * within the transition width. Returns a large number if none found.
     */
    private distToSeenBorder(tx: number, ty: number): number {
        let minDist = TRANSITION_WIDTH + 1;
        for (let dy = -TRANSITION_WIDTH; dy <= TRANSITION_WIDTH; dy++) {
            for (let dx = -TRANSITION_WIDTH; dx <= TRANSITION_WIDTH; dx++) {
                const d = Math.abs(dx) + Math.abs(dy);
                if (d >= minDist) continue; // prune: can't beat current best
                if (this.seenTiles.has(`${tx + dx},${ty + dy}`)) {
                    minDist = d;
                    if (minDist === 1) return 1; // can't get closer, early exit
                }
            }
        }
        return minDist;
    }

    /** Mark all tiles within vision as permanently seen */
    public update(playerGX: number, playerGY: number): void {
        if (!this.enabled) return;
        const r = this.visionRadius;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > r) continue;
                this.seenTiles.add(`${playerGX + dx},${playerGY + dy}`);
            }
        }
    }

    /** Render fog. Call AFTER entities, BEFORE HUD. */
    public render(
        ctx: CanvasRenderingContext2D,
        playerGX: number,
        playerGY: number,
        camX: number,
        camY: number,
        viewW: number,
        viewH: number
    ): void {
        if (!this.enabled) return;
        this.init();
        this.update(playerGX, playerGY);

        const startTX = Math.floor(camX / TILE_SIZE) - 1;
        const startTY = Math.floor(camY / TILE_SIZE) - 1;
        const endTX = Math.ceil((camX + viewW) / TILE_SIZE) + 1;
        const endTY = Math.ceil((camY + viewH) / TILE_SIZE) + 1;

        for (let ty = startTY; ty <= endTY; ty++) {
            for (let tx = startTX; tx <= endTX; tx++) {
                // Seen tiles → fully visible, skip
                if (this.seenTiles.has(`${tx},${ty}`)) continue;

                const screenX = tx * TILE_SIZE - camX;
                const screenY = ty * TILE_SIZE - camY;
                const variant = this.tileHash(tx, ty) % CLOUD_VARIANTS;

                // How close is this unseen tile to any seen tile?
                const borderDist = this.distToSeenBorder(tx, ty);

                if (borderDist <= TRANSITION_WIDTH) {
                    // Near the seen/unseen border → smooth gradient
                    const t = borderDist / (TRANSITION_WIDTH + 1);
                    const alpha = t * t * (3 - 2 * t); // smoothstep
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(this.cloudTiles[variant], screenX, screenY);
                    ctx.globalAlpha = 1.0;
                } else {
                    // Deep unseen → full cloud
                    ctx.drawImage(this.cloudTiles[variant], screenX, screenY);
                }
            }
        }
    }

    /** Reset for new raid */
    public reset(): void {
        this.seenTiles.clear();
    }
}
