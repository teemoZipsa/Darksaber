/**
 * FusionSystem — handles the 3-character fusion into Master classes.
 * 
 * To fuse:
 * 1. Player needs 3 characters from the same branch (e.g., 보병+기병+비병)
 * 2. All 3 must be at tier 7, max level, with emblem obtained
 * 3. Fusion creates a new Master class character (tier 8)
 */

import { Character } from './Character';
import { getMasterClass, getClassLine } from '../data/ClassTree';
import { createBaseStats } from '../data/Stats';

export interface FusionResult {
    success: boolean;
    message: string;
    fusedCharacter?: Character;
}

export class FusionSystem {
    /**
     * Check if 3 characters can be fused.
     * Returns detailed status for UI display.
     */
    public canFuse(chars: [Character, Character, Character]): { eligible: boolean; reasons: string[] } {
        const reasons: string[] = [];

        // Check all same branch
        const branches = new Set(chars.map(c => {
            const cl = getClassLine(c.classLineId);
            return cl?.branch;
        }));

        if (branches.size !== 1) {
            reasons.push('All 3 characters must be from the same branch');
        }

        // Check all different class lines
        const classIds = new Set(chars.map(c => c.classLineId));
        if (classIds.size !== 3) {
            reasons.push('All 3 characters must be different classes');
        }

        // Check each character's readiness
        for (const char of chars) {
            if (!char.isFusionReady()) {
                const tierName = char.getTierName();
                if (char.currentTier < 7) {
                    reasons.push(`${char.name} (${tierName}) needs to reach tier 7`);
                } else if (char.level < 10) {
                    reasons.push(`${char.name} needs to reach max level at tier 7`);
                } else if (!char.hasEmblem) {
                    reasons.push(`${char.name} needs to obtain an emblem`);
                }
            }
        }

        // Check that these class IDs match a valid master class
        if (branches.size === 1) {
            const branch = getClassLine(chars[0].classLineId)?.branch;
            if (branch) {
                const master = getMasterClass(branch);
                if (master) {
                    const required = new Set(master.requiredClassIds);
                    for (const cid of classIds) {
                        if (!required.has(cid)) {
                            reasons.push(`Class "${cid}" is not part of the ${branch} master fusion`);
                        }
                    }
                }
            }
        }

        return { eligible: reasons.length === 0, reasons };
    }

    /**
     * Execute the fusion. Consumes 3 characters and creates a Master class character.
     */
    public fuse(chars: [Character, Character, Character]): FusionResult {
        const check = this.canFuse(chars);
        if (!check.eligible) {
            return { success: false, message: check.reasons.join('; ') };
        }

        const branch = getClassLine(chars[0].classLineId)?.branch;
        if (!branch) {
            return { success: false, message: 'Invalid branch' };
        }

        const master = getMasterClass(branch);
        if (!master) {
            return { success: false, message: 'Master class not found' };
        }

        // Calculate fused stats (average of 3 + bonus)
        const fusedStats = createBaseStats();
        for (const char of chars) {
            fusedStats.maxHp += char.stats.maxHp;
            fusedStats.maxMp += char.stats.maxMp;
            fusedStats.atk += char.stats.atk;
            fusedStats.def += char.stats.def;
            fusedStats.magAtk += char.stats.magAtk;
            fusedStats.magDef += char.stats.magDef;
            fusedStats.spd += char.stats.spd;
        }
        // Average + 20% fusion bonus
        const bonus = 1.2 / 3;
        fusedStats.maxHp = Math.floor(fusedStats.maxHp * bonus);
        fusedStats.maxMp = Math.floor(fusedStats.maxMp * bonus);
        fusedStats.atk = Math.floor(fusedStats.atk * bonus);
        fusedStats.def = Math.floor(fusedStats.def * bonus);
        fusedStats.magAtk = Math.floor(fusedStats.magAtk * bonus);
        fusedStats.magDef = Math.floor(fusedStats.magDef * bonus);
        fusedStats.spd = Math.floor(fusedStats.spd * bonus);
        fusedStats.hp = fusedStats.maxHp;
        fusedStats.mp = fusedStats.maxMp;
        fusedStats.mov = 5; // Master classes get enhanced movement

        // Create the fused character
        const fusedChar = new Character(
            `master_${branch}`,
            master.tiers[0].nameKr,
            `master_${branch}`
        );
        fusedChar.stats = fusedStats;
        fusedChar.currentTier = 8;
        fusedChar.level = 1;

        return {
            success: true,
            message: `Fusion successful! ${master.tiers[0].nameKr} has been born!`,
            fusedCharacter: fusedChar
        };
    }
}
