/**
 * Enemy — enemy entity with basic AI: aggro detection and movement toward player.
 */

import { Entity } from './Entity';
import { createBaseStats, type CharacterStats } from '../data/Stats';
import { TILE_PROPERTIES, type TileType } from '../map/Tile';
import type { StatusEffect } from '../combat/StatusEffects';
import { createEnemyAIProfile, type EnemyAIProfile, type EnemyRole } from '../field/EnemyAI';

export interface EnemyAIMemory {
    turnCount: number;
    cooldowns: Record<string, number>;
    lastPattern?: string;
}

export class Enemy extends Entity {
    public name: string;
    public stats: CharacterStats;
    public aggroRange: number;     // tiles within which enemy detects player
    public level: number;
    public expReward: number;
    public isAggro: boolean = false;
    public isBoss: boolean = false;
    public lootTableId: string = '';
    public statuses: StatusEffect[] = [];
    public role: EnemyRole;
    public aiProfile: EnemyAIProfile;
    public aiMemory: EnemyAIMemory = {
        turnCount: 0,
        cooldowns: {},
    };
    private tunedRole: EnemyRole | null = null;
    private readonly baseStats: CharacterStats;

    constructor(
        id: string,
        gridX: number,
        gridY: number,
        name: string,
        level: number,
        color: string = '#ff4444',
        role: EnemyRole = 'bruiser'
    ) {
        super(id, gridX, gridY, color, name.charAt(0).toUpperCase());
        this.name = name;
        this.level = level;
        this.aggroRange = 5;
        this.expReward = 25 + level * 8;
        this.role = role;
        this.aiProfile = createEnemyAIProfile(role);

        // Calibrated to the original Dark Saver monster stat scale (ability.atr),
        // which matches the per-tier player base stats. Keeps level-band scaling.
        this.baseStats = createBaseStats({
            maxHp: 80 + level * 22,
            hp: 80 + level * 22,
            maxMp: 25 + level * 5,
            mp: 25 + level * 5,
            atk: 35 + level * 7,
            def: 20 + level * 5,
            magAtk: 25 + level * 4,
            magDef: 18 + level * 4,
            spd: 13 + level * 0.4,
            hitRate: 88 + level,
            magHit: 88 + level,
            mov: 2,
        });
        this.stats = { ...this.baseStats };
        this.applyRoleTuning(role);
    }

    public setRole(role: EnemyRole): void {
        const hpRatio = this.stats.maxHp > 0 ? this.stats.hp / this.stats.maxHp : 1;
        const mpRatio = this.stats.maxMp > 0 ? this.stats.mp / this.stats.maxMp : 1;
        this.role = role;
        this.aiProfile = createEnemyAIProfile(role);
        this.tunedRole = null;
        this.isBoss = role === 'boss';
        this.stats = { ...this.baseStats };
        this.stats.hp = Math.max(0, Math.min(this.stats.maxHp, Math.floor(this.stats.maxHp * hpRatio)));
        this.stats.mp = Math.max(0, Math.min(this.stats.maxMp, Math.floor(this.stats.maxMp * mpRatio)));
        this.applyRoleTuning(role);
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
        if (dx === 0 && dy === 0) return false;

        // Prefer axis with greater distance
        let newX = this.gridX;
        let newY = this.gridY;

        if (Math.abs(dx) >= Math.abs(dy)) {
            newX += dx > 0 ? 1 : -1;
        } else {
            newY += dy > 0 ? 1 : -1;
        }

        const tile = getTile(newX, newY);
        const walkable = !!TILE_PROPERTIES[tile]?.walkable;
        if (walkable && (!isOccupied || !isOccupied(newX, newY))) {
            // Update facing BEFORE changing position
            if (newX > this.gridX) this.facing = 'right';
            else if (newX < this.gridX) this.facing = 'left';
            else if (newY > this.gridY) this.facing = 'down';
            else if (newY < this.gridY) this.facing = 'up';
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
            const walk2 = !!TILE_PROPERTIES[tile2]?.walkable;
            if (walk2 && (!isOccupied || !isOccupied(newX, newY))) {
                // Update facing BEFORE changing position
                if (newX > this.gridX) this.facing = 'right';
                else if (newX < this.gridX) this.facing = 'left';
                else if (newY > this.gridY) this.facing = 'down';
                else if (newY < this.gridY) this.facing = 'up';
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
        const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        this.stats.hp = Math.max(0, Math.min(this.stats.maxHp, this.stats.hp - damage));
        return this.stats.hp <= 0; // returns true if dead
    }

    private applyRoleTuning(role: EnemyRole): void {
        if (this.tunedRole === role) return;
        this.tunedRole = role;

        // Role bonuses are multiplicative so they stay meaningful on the rescaled base.
        switch (role) {
            case 'tank':
                this.scaleMaxHp(1.35);
                this.stats.def = Math.round(this.stats.def * 1.4);
                this.stats.spd = Math.max(1, this.stats.spd - 0.4);
                this.stats.mov = 2;
                break;
            case 'archer':
                this.scaleMaxHp(0.85);
                this.stats.atk = Math.round(this.stats.atk * 1.15);
                this.stats.hitRate += 10;
                this.stats.critRate += 3;
                this.stats.def = Math.round(this.stats.def * 0.85);
                this.stats.mov = 3;
                break;
            case 'healer':
                this.scaleMaxHp(0.9);
                this.stats.atk = Math.max(1, Math.round(this.stats.atk * 0.7));
                this.stats.magAtk = Math.round(this.stats.magAtk * 1.4);
                this.stats.magDef = Math.round(this.stats.magDef * 1.25);
                this.stats.maxMp = Math.round(this.stats.maxMp * 1.3);
                this.stats.mp = this.stats.maxMp;
                this.stats.mov = 3;
                break;
            case 'coward':
                this.scaleMaxHp(0.8);
                this.stats.def = Math.max(0, Math.round(this.stats.def * 0.8));
                this.stats.spd += 2;
                this.stats.mov = 4;
                break;
            case 'support':
                this.scaleMaxHp(0.95);
                this.stats.magAtk = Math.round(this.stats.magAtk * 1.25);
                this.stats.magDef = Math.round(this.stats.magDef * 1.2);
                this.stats.spd += 0.6;
                this.stats.mov = 3;
                break;
            case 'boss':
                this.scaleMaxHp(2.2);
                this.stats.atk = Math.round(this.stats.atk * 1.3);
                this.stats.def = Math.round(this.stats.def * 1.3);
                this.stats.magAtk = Math.round(this.stats.magAtk * 1.3);
                this.stats.magDef = Math.round(this.stats.magDef * 1.3);
                this.stats.mov = 3;
                this.isBoss = true;
                break;
            case 'bruiser':
            default:
                break;
        }
    }

    private scaleMaxHp(multiplier: number): void {
        const previousMax = Math.max(1, this.stats.maxHp);
        const wasDead = this.stats.hp <= 0;
        const pct = Math.max(0, Math.min(1, this.stats.hp / previousMax));
        this.stats.maxHp = Math.max(1, Math.floor(this.stats.maxHp * multiplier));
        this.stats.hp = wasDead ? 0 : Math.max(1, Math.floor(this.stats.maxHp * pct));
    }
}
