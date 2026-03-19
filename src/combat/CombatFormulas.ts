/**
 * CombatFormulas — damage, hit chance, crit chance, and magic damage calculations.
 */

import { CharacterStats } from '../data/Stats';
import { TileType, TILE_PROPERTIES } from '../map/Tile';

export interface DamageResult {
    damage: number;
    isCrit: boolean;
    isHit: boolean;
    isMiss: boolean;
}

export class CombatFormulas {
    /**
     * Calculate physical attack damage.
     * damage = (ATK - DEF/2) × terrain modifier × random(0.9~1.1)
     */
    public static calcPhysicalDamage(
        attacker: CharacterStats,
        defender: CharacterStats,
        defenderTile: TileType
    ): DamageResult {
        // Hit check
        const hitChance = Math.min(95, attacker.hitRate - (defender.spd * 2));
        const hitRoll = Math.random() * 100;
        if (hitRoll > hitChance) {
            return { damage: 0, isCrit: false, isHit: false, isMiss: true };
        }

        // Base damage
        let baseDmg = Math.max(1, attacker.atk - Math.floor(defender.def / 2));

        // Terrain defense bonus
        const tileProps = TILE_PROPERTIES[defenderTile];
        if (tileProps.moveCost > 1) {
            baseDmg = Math.floor(baseDmg * 0.85); // terrain cover reduces damage
        }

        // Random variance (90% ~ 110%)
        baseDmg = Math.floor(baseDmg * (0.9 + Math.random() * 0.2));

        // Crit check
        const critChance = attacker.critRate;
        const critRoll = Math.random() * 100;
        const isCrit = critRoll < critChance;
        if (isCrit) {
            baseDmg = Math.floor(baseDmg * 1.5);
        }

        return { damage: Math.max(1, baseDmg), isCrit, isHit: true, isMiss: false };
    }

    /**
     * Calculate magic damage.
     * magDamage = (MAG_ATK × 1.5 - MAG_DEF) × random(0.9~1.1)
     */
    public static calcMagicDamage(
        attacker: CharacterStats,
        defender: CharacterStats
    ): DamageResult {
        const hitChance = Math.min(95, 85 + attacker.magAtk - defender.magDef);
        const hitRoll = Math.random() * 100;
        if (hitRoll > hitChance) {
            return { damage: 0, isCrit: false, isHit: false, isMiss: true };
        }

        let baseDmg = Math.max(1, Math.floor(attacker.magAtk * 1.5) - defender.magDef);
        baseDmg = Math.floor(baseDmg * (0.9 + Math.random() * 0.2));

        return { damage: Math.max(1, baseDmg), isCrit: false, isHit: true, isMiss: false };
    }

    /**
     * Calculate heal amount.
     */
    public static calcHeal(caster: CharacterStats): number {
        return Math.floor(caster.magAtk * 2 + 10);
    }

    /**
     * Calculate EXP gained from defeating an enemy.
     */
    public static calcExpGain(playerLevel: number, enemyLevel: number): number {
        const diff = enemyLevel - playerLevel;
        const base = 20 + diff * 5;
        return Math.max(5, Math.min(100, base));
    }
}
