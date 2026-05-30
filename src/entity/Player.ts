/**
 * Player — the player-controlled entity.
 * Handles movement input and serves as the camera follow target.
 * Uses a simple static image (no animation).
 */

import { Entity } from './Entity';
import { TILE_PROPERTIES, type TileType } from '../map/Tile';

export class Player extends Entity {
    public moveRange: number = 4; // Manhattan distance per turn
    public pastPositions: {x: number, y: number}[] = [];

    constructor(gridX: number, gridY: number) {
        super('player', gridX, gridY, '#00e5ff', 'P');
    }

    /** Try to move to a new grid position. Returns true if successful. */
    public tryMove(
        newX: number,
        newY: number,
        getTile: (x: number, y: number) => TileType,
        isOccupied?: (x: number, y: number) => boolean
    ): boolean {
        if (!Number.isFinite(newX) || !Number.isFinite(newY)) return false;

        const distance = Math.abs(newX - this.gridX) + Math.abs(newY - this.gridY);
        if (distance === 0 || distance > this.moveRange) return false;
        if (isOccupied?.(newX, newY)) return false;

        const tile = getTile(newX, newY);
        const props = TILE_PROPERTIES[tile];

        if (!props?.walkable) return false;

        const oldX = this.gridX;
        const oldY = this.gridY;

        // Store past position for follow logic
        this.pastPositions.push({ x: oldX, y: oldY });
        if (this.pastPositions.length > 5) {
            this.pastPositions.shift(); // Keep only recent history
        }

        if (newX > oldX) this.facing = 'right';
        else if (newX < oldX) this.facing = 'left';
        else if (newY > oldY) this.facing = 'down';
        else if (newY < oldY) this.facing = 'up';

        this.gridX = newX;
        this.gridY = newY;
        return true;
    }

    public update(dt: number): void {
        super.update(dt);
    }
}
