/**
 * CombatFormulas — damage, hit chance, crit chance, and magic damage calculations.
 */

import { CharacterStats } from '../data/Stats';
import { TileType } from '../map/Tile';
import { getTerrainDefenseMultiplier, getTerrainProfile, TerrainActorTraits } from '../field/TerrainRules';

export interface DamageResult {
    damage: number;
    isCrit: boolean;
    isHit: boolean;
    isMiss: boolean;
    terrainMultiplier?: number;
    hitChance?: number;
}

export type RandomSource = () => number;

export interface PhysicalTerrainContext {
    defenderTraits?: TerrainActorTraits;
    isRanged?: boolean;
    random?: RandomSource;
}

export function clampHitChance(raw: number): number {
    return Math.max(5, Math.min(95, raw));
}

export class CombatFormulas {
    /**
     * Calculate physical attack damage.
     * damage = (ATK - DEF/2) × terrain modifier × random(0.9~1.1)
     */
    public static calcPhysicalDamage(
        attacker: CharacterStats,
        defender: CharacterStats,
        defenderTile: TileType,
        terrainContext: PhysicalTerrainContext = {}
    ): DamageResult {
        const random = terrainContext.random ?? Math.random;

        // Hit check
        const profile = getTerrainProfile(defenderTile);
        const rangedPenalty = terrainContext.isRanged ? profile.rangedHitPenalty : 0;
        const evasionBonus = Math.max(0, (defender.evasion ?? 10) - 10);
        const hitChance = clampHitChance(attacker.hitRate - (defender.spd * 2) - evasionBonus + rangedPenalty);
        const hitRoll = random() * 100;
        if (hitRoll > hitChance) {
            return { damage: 0, isCrit: false, isHit: false, isMiss: true, hitChance };
        }

        // Base damage
        let baseDmg = Math.max(1, attacker.atk - Math.floor(defender.def / 2));

        // Terrain defense bonus
        const terrainMultiplier = getTerrainDefenseMultiplier(defenderTile, terrainContext.defenderTraits);
        baseDmg = Math.floor(baseDmg * terrainMultiplier);

        // Random variance (90% ~ 110%)
        baseDmg = Math.floor(baseDmg * (0.9 + random() * 0.2));

        // Crit check
        const critChance = attacker.critRate;
        const critRoll = random() * 100;
        const isCrit = critRoll < critChance;
        if (isCrit) {
            baseDmg = Math.floor(baseDmg * 1.5);
        }

        return { damage: Math.max(1, baseDmg), isCrit, isHit: true, isMiss: false, terrainMultiplier, hitChance };
    }

    /**
     * Calculate magic damage.
     * magDamage = (MAG_ATK × 1.5 - MAG_DEF) × random(0.9~1.1)
     */
    public static calcMagicDamage(
        attacker: CharacterStats,
        defender: CharacterStats,
        random: RandomSource = Math.random
    ): DamageResult {
        const hitChance = clampHitChance(85 + attacker.magAtk - defender.magDef);
        const hitRoll = random() * 100;
        if (hitRoll > hitChance) {
            return { damage: 0, isCrit: false, isHit: false, isMiss: true, hitChance };
        }

        let baseDmg = Math.max(1, Math.floor(attacker.magAtk * 1.5) - defender.magDef);
        baseDmg = Math.floor(baseDmg * (0.9 + random() * 0.2));

        return { damage: Math.max(1, baseDmg), isCrit: false, isHit: true, isMiss: false, hitChance };
    }

    /**
     * Calculate heal amount.
     */
    public static calcHeal(caster: CharacterStats): number {
        return Math.floor(caster.magAtk * 2 + 10);
    }

    /**
     * Calculate EXP gained from defeating an enemy.
     * Equal-level kills target ~5 kills per tier-1 level-up (250 XP).
     */
    public static calcExpGain(playerLevel: number, enemyLevel: number): number {
        const diff = enemyLevel - playerLevel;
        const base = 50 + diff * 10;
        return Math.max(15, Math.min(150, base));
    }

    /**
     * Calculate directional attack multiplier.
     * Backstab (behind defender) = 1.5x, Side = 1.25x, Front = 1.0x
     */
    public static getDirectionalMultiplier(
        attackerX: number, attackerY: number,
        defenderX: number, defenderY: number,
        defenderFacing: 'up' | 'down' | 'left' | 'right'
    ): { multiplier: number; label: string } {
        const dx = attackerX - defenderX;
        const dy = attackerY - defenderY;

        // Determine attack direction relative to defender facing
        let isBehind = false;
        let isSide = false;

        switch (defenderFacing) {
            case 'up':    isBehind = dy > 0; isSide = dx !== 0 && dy === 0; break;
            case 'down':  isBehind = dy < 0; isSide = dx !== 0 && dy === 0; break;
            case 'left':  isBehind = dx > 0; isSide = dy !== 0 && dx === 0; break;
            case 'right': isBehind = dx < 0; isSide = dy !== 0 && dx === 0; break;
        }

        if (isBehind) return { multiplier: 1.5, label: 'BACK!' };
        if (isSide)   return { multiplier: 1.25, label: 'SIDE' };
        return { multiplier: 1.0, label: '' };
    }
}
