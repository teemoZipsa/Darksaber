/**
 * Enemy — enemy entity with basic AI: aggro detection and movement toward player.
 */

import { Entity } from './Entity';
import { CharacterStats, createBaseStats } from '../data/Stats';
import { TileType, TILE_PROPERTIES } from '../map/Tile';

export class Enemy extends Entity {
    public name: string;
    public stats: CharacterStats;
    public aggroRange: number;     // tiles within which enemy detects player
    public level: number;
    public expReward: number;
    public isAggro: boolean = false;
    public isBoss: boolean = false;
    public lootTableId: string = '';

    constructor(
        id: string,
        gridX: number,
        gridY: number,
        name: string,
        level: number,
        color: string = '#ff4444'
    ) {
        super(id, gridX, gridY, color, name.charAt(0).toUpperCase());
        this.name = name;
        this.level = level;
        this.aggroRange = 5;
        this.expReward = 25 + level * 8;

        // Scale stats by level (tuned for balanced early game)
        this.stats = createBaseStats({
            maxHp: 30 + level * 8,
            hp: 30 + level * 8,
            maxMp: 10 + level * 3,
            mp: 10 + level * 3,
            atk: 3 + level * 1.5,
            def: 2 + level,
            magAtk: 1 + level * 0.5,
            magDef: 1 + level * 0.5,
            spd: 2 + level * 0.3,
            mov: 2,
        });
    }

    /** Check if player is within aggro range (Manhattan distance) */
    public checkAggro(playerX: number, playerY: number): boolean {
        const dist = Math.abs(this.gridX - playerX) + Math.abs(this.gridY - playerY);
        this.isAggro = dist <= this.aggroRange;
        return this.isAggro;
    }

    /** Simple AI: move one step toward the player */
    public moveToward(
        targetX: number,
        targetY: number,
        getTile: (x: number, y: number) => TileType,
        isOccupied?: (x: number, y: number) => boolean
    ): boolean {
        const dx = targetX - this.gridX;
        const dy = targetY - this.gridY;

        // Prefer axis with greater distance
        let newX = this.gridX;
        let newY = this.gridY;

        if (Math.abs(dx) >= Math.abs(dy)) {
            newX += dx > 0 ? 1 : -1;
        } else {
            newY += dy > 0 ? 1 : -1;
        }

        const tile = getTile(newX, newY);
        const walkable = TILE_PROPERTIES[tile] && TILE_PROPERTIES[tile].walkable;
        if (walkable && (!isOccupied || !isOccupied(newX, newY))) {
            this.gridX = newX;
            this.gridY = newY;
            return true;
        }

        // Try the other axis if blocked
        newX = this.gridX;
        newY = this.gridY;
        if (Math.abs(dx) >= Math.abs(dy)) {
            newY += dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        } else {
            newX += dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        }

        if (newX !== this.gridX || newY !== this.gridY) {
            const tile2 = getTile(newX, newY);
            const walk2 = TILE_PROPERTIES[tile2] && TILE_PROPERTIES[tile2].walkable;
            if (walk2 && (!isOccupied || !isOccupied(newX, newY))) {
                this.gridX = newX;
                this.gridY = newY;
                return true;
            }
        }

        return false; // stuck
    }

    /** Check if player is adjacent (can attack) */
    public isAdjacentTo(targetX: number, targetY: number): boolean {
        return Math.abs(this.gridX - targetX) + Math.abs(this.gridY - targetY) === 1;
    }

    public takeDamage(amount: number): boolean {
        this.stats.hp = Math.max(0, this.stats.hp - amount);
        return this.stats.hp <= 0; // returns true if dead
    }
}
