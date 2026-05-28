/**
 * Camera — viewport controller with smooth lerp follow and zoom.
 */

import { TILE_SIZE } from '../map/Chunk';

export class Camera {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1.0;

    // Lerped base position (without shake). Rendering reads x/y; logic reads baseX/baseY.
    private baseX: number = 0;
    private baseY: number = 0;

    private targetX: number = 0;
    private targetY: number = 0;
    private lerpSpeed: number = 0.1;
    private viewWidth: number;
    private viewHeight: number;

    // Screen-shake state
    private shakeAmp: number = 0;
    private shakeStartMs: number = 0;
    private shakeDurationMs: number = 0;

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
        this.followTilePosition(tileX, tileY);
    }

    /** Follow a fractional tile position for smooth movement */
    public followTilePosition(tileX: number, tileY: number): void {
        const scaledW = this.viewWidth / this.zoom;
        const scaledH = this.viewHeight / this.zoom;
        this.targetX = (tileX * TILE_SIZE) + (TILE_SIZE / 2) - (scaledW / 2);
        this.targetY = (tileY * TILE_SIZE) + (TILE_SIZE / 2) - (scaledH / 2);
    }

    /** Follow a pixel-space entity/tile position */
    public followPixel(pixelX: number, pixelY: number): void {
        const scaledW = this.viewWidth / this.zoom;
        const scaledH = this.viewHeight / this.zoom;
        this.targetX = pixelX + (TILE_SIZE / 2) - (scaledW / 2);
        this.targetY = pixelY + (TILE_SIZE / 2) - (scaledH / 2);
    }

    /** Snap camera immediately to target (no lerp) */
    public snapToTarget(): void {
        this.baseX = this.targetX;
        this.baseY = this.targetY;
        this.x = this.targetX;
        this.y = this.targetY;
    }

    /**
     * Trigger a screen shake. Linear decay over `durationMs`.
     * If a stronger shake is already active, this is a no-op.
     */
    public shake(intensity: number, durationMs: number = 220): void {
        const current = this.currentShakeAmp();
        if (intensity > current) {
            this.shakeAmp = intensity;
            this.shakeStartMs = performance.now();
            this.shakeDurationMs = durationMs;
        }
    }

    private currentShakeAmp(): number {
        if (this.shakeDurationMs <= 0) return 0;
        const elapsed = performance.now() - this.shakeStartMs;
        if (elapsed >= this.shakeDurationMs) return 0;
        return this.shakeAmp * (1 - elapsed / this.shakeDurationMs);
    }

    /** Smooth update towards target. Applies shake on top of the lerped base. */
    public update(dt: number = 1 / 60): void {
        const lerpFactor = 1 - Math.pow(1 - this.lerpSpeed, dt * 60);
        this.baseX += (this.targetX - this.baseX) * lerpFactor;
        this.baseY += (this.targetY - this.baseY) * lerpFactor;

        const amp = this.currentShakeAmp();
        if (amp > 0) {
            const angle = Math.random() * Math.PI * 2;
            this.x = this.baseX + Math.cos(angle) * amp;
            this.y = this.baseY + Math.sin(angle) * amp;
        } else {
            this.x = this.baseX;
            this.y = this.baseY;
        }
    }

    /** Get the world center position of the camera (base, no shake) */
    public getWorldCenter(): { x: number; y: number } {
        const scaledW = this.viewWidth / this.zoom;
        const scaledH = this.viewHeight / this.zoom;
        return {
            x: this.baseX + scaledW / 2,
            y: this.baseY + scaledH / 2
        };
    }

    /**
     * Convert screen coordinates to world tile coordinates.
     * Uses the un-shaken base position so input mapping stays stable during shake.
     */
    public screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
        const worldX = screenX / this.zoom + this.baseX;
        const worldY = screenY / this.zoom + this.baseY;
        return {
            tileX: Math.floor(worldX / TILE_SIZE),
            tileY: Math.floor(worldY / TILE_SIZE)
        };
    }
}
