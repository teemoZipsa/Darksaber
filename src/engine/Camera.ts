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

    // Zoom constraints
    public static readonly MIN_ZOOM = 0.5;
    public static readonly MAX_ZOOM = 2.0;
    public static readonly ZOOM_STEP = 0.1;

    constructor(viewWidth: number, viewHeight: number) {
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
    }

    /** Update viewport dimensions (on window resize) */
    public setViewSize(width: number, height: number): void {
        this.viewWidth = width;
        this.viewHeight = height;
    }

    /** Zoom in one step */
    public zoomIn(): void {
        this.zoom = Math.min(Camera.MAX_ZOOM, +(this.zoom + Camera.ZOOM_STEP).toFixed(1));
    }

    /** Zoom out one step */
    public zoomOut(): void {
        this.zoom = Math.max(Camera.MIN_ZOOM, +(this.zoom - Camera.ZOOM_STEP).toFixed(1));
    }

    /** Set zoom directly (clamped) */
    public setZoom(z: number): void {
        this.zoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, z));
    }

    /** Set the target to follow (centers camera on this world position) */
    public followTile(tileX: number, tileY: number): void {
        const scaledW = this.viewWidth / this.zoom;
        const scaledH = this.viewHeight / this.zoom;
        this.targetX = (tileX * TILE_SIZE) + (TILE_SIZE / 2) - (scaledW / 2);
        this.targetY = (tileY * TILE_SIZE) + (TILE_SIZE / 2) - (scaledH / 2);
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
        const scaledW = this.viewWidth / this.zoom;
        const scaledH = this.viewHeight / this.zoom;
        return {
            x: this.x + scaledW / 2,
            y: this.y + scaledH / 2
        };
    }

    /** Convert screen coordinates to world tile coordinates */
    public screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
        const worldX = screenX / this.zoom + this.x;
        const worldY = screenY / this.zoom + this.y;
        return {
            tileX: Math.floor(worldX / TILE_SIZE),
            tileY: Math.floor(worldY / TILE_SIZE)
        };
    }
}
