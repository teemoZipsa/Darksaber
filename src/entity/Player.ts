/**
 * Player — the player-controlled entity.
 * Handles movement input and serves as the camera follow target.
 * Uses a simple static image (no animation).
 */

import { Entity } from './Entity';
import { TileType, TILE_PROPERTIES } from '../map/Tile';

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
        getTile: (x: number, y: number) => TileType
    ): boolean {
        const tile = getTile(newX, newY);
        const props = TILE_PROPERTIES[tile];

        if (!props.walkable) return false;

        // Store past position for follow logic
        this.pastPositions.push({ x: this.gridX, y: this.gridY });
        if (this.pastPositions.length > 5) {
            this.pastPositions.shift(); // Keep only recent history
        }

        this.gridX = newX;
        this.gridY = newY;
        return true;
    }

    public update(dt: number): void {
        super.update(dt);
    }
}
