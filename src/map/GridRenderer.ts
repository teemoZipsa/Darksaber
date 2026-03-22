/**
 * GridRenderer — renders grid overlay effects on top of the tile map.
 * Handles: hover highlight, movement range (diamond pattern), targeting range.
 */

import { TILE_SIZE } from './Chunk';

export class GridRenderer {
    /** Draw hover highlight on the tile under the mouse cursor */
    public renderHoverTile(
        ctx: CanvasRenderingContext2D,
        tileX: number,
        tileY: number,
        cameraX: number,
        cameraY: number
    ): void {
        const screenX = tileX * TILE_SIZE - cameraX;
        const screenY = tileY * TILE_SIZE - cameraY;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    /**
     * Draw movement/targeting range overlay.
     * Uses Manhattan distance (diamond shape) like Dark Saver's yellow range indicator.
     */
    public renderRange(
        ctx: CanvasRenderingContext2D,
        centerX: number,
        centerY: number,
        range: number,
        cameraX: number,
        cameraY: number,
        color: string = 'rgba(255, 200, 0, 0.3)',
        borderColor: string = 'rgba(255, 200, 0, 0.8)'
    ): void {
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > range) continue;

                const tileX = centerX + dx;
                const tileY = centerY + dy;
                const screenX = tileX * TILE_SIZE - cameraX;
                const screenY = tileY * TILE_SIZE - cameraY;

                ctx.fillStyle = color;
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

                // Draw border on edge tiles
                if (Math.abs(dx) + Math.abs(dy) === range) {
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                }
            }
        }
    }

    /**
     * Render a set of specific walkable tiles (from BFS).
     * Highlights tiles with fill + draws border on edge tiles whose neighbors aren't in the set.
     */
    public renderWalkableTiles(
        ctx: CanvasRenderingContext2D,
        tiles: Set<string>,
        cameraX: number,
        cameraY: number,
        color: string = 'rgba(255, 200, 0, 0.18)',
        borderColor: string = 'rgba(255, 200, 0, 0.6)'
    ): void {
        for (const key of tiles) {
            const [tx, ty] = key.split(',').map(Number);
            const screenX = tx * TILE_SIZE - cameraX;
            const screenY = ty * TILE_SIZE - cameraY;

            ctx.fillStyle = color;
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

            // Draw border on edge tiles (neighbor missing from set)
            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            let isEdge = false;
            for (const [ddx, ddy] of dirs) {
                if (!tiles.has(`${tx+ddx},${ty+ddy}`)) { isEdge = true; break; }
            }
            if (isEdge) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }
        }
    }

    /** Render an entity on the grid: uses static image if available, else colored box */
    public renderEntity(
        ctx: CanvasRenderingContext2D,
        entity: import('../entity/Entity').Entity,
        cameraX: number,
        cameraY: number,
        overrideColor?: string
    ): void {
        const screenX = entity.pixelX * TILE_SIZE - cameraX;
        const screenY = entity.pixelY * TILE_SIZE - cameraY;

        if (entity.image && entity.imageLoaded) {
            // Draw the single static image scaled to tile size
            ctx.drawImage(entity.image, screenX, screenY, TILE_SIZE, TILE_SIZE);
        } else {
            const padding = 4;

            // Entity body
            ctx.fillStyle = overrideColor || entity.color;
            ctx.fillRect(screenX + padding, screenY + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);

            // Entity border (slightly darker)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(screenX + padding, screenY + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);
        }

        // Always draw Label below the entity so we can distinguish them!
        if (entity.label) {
            ctx.fillStyle = overrideColor || entity.color;
            ctx.font = 'bold 12px "DOSMyungjo", sans-serif';
            ctx.textAlign = 'center';
            // Dark outline for readability
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 2;
            const lx = screenX + TILE_SIZE / 2;
            const ly = screenY + TILE_SIZE + 12;
            ctx.strokeText(entity.label, lx, ly);
            ctx.fillText(entity.label, lx, ly);
            ctx.textAlign = 'start'; // reset
        }
    }
}
