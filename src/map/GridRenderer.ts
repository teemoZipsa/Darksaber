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
     * @param centerX — center tile X
     * @param centerY — center tile Y
     * @param range — max Manhattan distance
     * @param color — overlay color (e.g., 'rgba(255, 200, 0, 0.3)' for yellow)
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

    /** Render the player's entity on the grid */
    public renderEntity(
        ctx: CanvasRenderingContext2D,
        tileX: number,
        tileY: number,
        cameraX: number,
        cameraY: number,
        color: string,
        label?: string
    ): void {
        const screenX = tileX * TILE_SIZE - cameraX;
        const screenY = tileY * TILE_SIZE - cameraY;
        const padding = 4;

        // Entity body
        ctx.fillStyle = color;
        ctx.fillRect(screenX + padding, screenY + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);

        // Entity border (slightly darker)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX + padding, screenY + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);

        // Label
        if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(label, screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2 + 3);
            ctx.textAlign = 'start'; // reset
        }
    }
}
