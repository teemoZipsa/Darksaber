/**
 * Camera — viewport controller with smooth lerp follow and zoom.
 */

import { TILE_SIZE } from '../map/Chunk';

export class Camera {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1.0;

    private targetX: number = 0;
    private targetY: number = 0;
    private lerpSpeed: number = 0.1;
    private viewWidth: number;
    private viewHeight: number;

    constructor(viewWidth: number, viewHeight: number) {
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
    }

    /** Update viewport dimensions (on window resize) */
    public setViewSize(width: number, height: number): void {
        this.viewWidth = width;
        this.viewHeight = height;
    }

    /** Set the target to follow (centers camera on this world position) */
    public followTile(tileX: number, tileY: number): void {
        this.targetX = (tileX * TILE_SIZE) + (TILE_SIZE / 2) - (this.viewWidth / 2);
        this.targetY = (tileY * TILE_SIZE) + (TILE_SIZE / 2) - (this.viewHeight / 2);
    }

    /** Snap camera immediately to target (no lerp) */
    public snapToTarget(): void {
        this.x = this.targetX;
        this.y = this.targetY;
    }

    /** Smooth update towards target */
    public update(): void {
        this.x += (this.targetX - this.x) * this.lerpSpeed;
        this.y += (this.targetY - this.y) * this.lerpSpeed;
    }

    /** Get the world center position of the camera */
    public getWorldCenter(): { x: number; y: number } {
        return {
            x: this.x + this.viewWidth / 2,
            y: this.y + this.viewHeight / 2
        };
    }

    /** Convert screen coordinates to world tile coordinates */
    public screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
        const worldX = screenX + this.x;
        const worldY = screenY + this.y;
        return {
            tileX: Math.floor(worldX / TILE_SIZE),
            tileY: Math.floor(worldY / TILE_SIZE)
        };
    }
}
