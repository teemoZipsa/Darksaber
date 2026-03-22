/**
 * RemotePlayer — A lightweight entity representing another player in multiplayer.
 * Includes smooth interpolation for movement.
 */

import { Entity } from './Entity';

export class RemotePlayer extends Entity {
    public name: string;
    public targetGridX: number;
    public targetGridY: number;

    private lerpSpeed: number = 8;

    constructor(id: string, name: string, gridX: number, gridY: number) {
        super(id, gridX, gridY, '#ffaa00', name.charAt(0).toUpperCase());
        this.name = name;
        this.targetGridX = gridX;
        this.targetGridY = gridY;
    }

    /** Call each frame to smoothly interpolate render position toward target */
    public updateInterpolation(dt: number): void {
        const t = Math.min(1, this.lerpSpeed * dt);
        this.pixelX += (this.targetGridX - this.pixelX) * t;
        this.pixelY += (this.targetGridY - this.pixelY) * t;

        // Snap when very close
        if (Math.abs(this.pixelX - this.targetGridX) < 0.01) this.pixelX = this.targetGridX;
        if (Math.abs(this.pixelY - this.targetGridY) < 0.01) this.pixelY = this.targetGridY;
    }

    /** Update position from network data */
    public setPosition(gridX: number, gridY: number): void {
        this.targetGridX = gridX;
        this.targetGridY = gridY;
        this.gridX = gridX;
        this.gridY = gridY;
    }
}
