/**
 * SkillDB — Complete skill database for all 12 classes × 7 tiers.
 * Skills are auto-learned when character reaches the required tier.
 * Each skill has MP cost, power scaling, range, and effect type.
 */

import SKILLS_JSON from './content/skills.json';

export type SkillType = 'damage' | 'heal' | 'buff' | 'debuff' | 'aoe';
export type SkillElement = 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' | 'earth' | 'wind' | 'physical' | 'none';
export type SkillTargetScope = 'self' | 'selfAndNearbyAllies';
export type SkillGroup = 'classSkill' | 'classStance' | 'classCommand' | 'classAura' | 'commonMagic';

export interface Skill {
    id: string;
    nameKr: string;
    nameEn: string;
    classId: string;      // which class line this skill belongs to
    tier: number;          // 1~7, character must be at this tier or higher
    mpCost: number;
    type: SkillType;
    element: SkillElement;
    power: number;         // damage/heal multiplier (applied to magAtk or atk)
    range: number;         // cast range in tiles
    aoeRadius: number;     // 0 = single target, 1+ = area
    icon: string;          // emoji icon
    descKr: string;
    descEn: string;
    buffStat?: 'atk' | 'def' | 'spd' | 'mdef' | 'regen' | 'all'; // specifically which stat to boost
    buffDuration?: number; // duration in turns
    hitBonus?: number;     // flat hit chance bonus in percentage points
    targetScope?: SkillTargetScope;
    allyRadius?: number;
    skillGroup?: SkillGroup;
    /** Learned skill ids this skill replaces in the same character's spell list. */
    supersedesSkillIds?: string[];
}

const SKILL_CONTENT = SKILLS_JSON as Skill[];

export const ALL_SKILLS: Skill[] = SKILL_CONTENT;

/** Get all skills for a specific class */
export function getSkillsForClass(classId: string): Skill[] {
    return ALL_SKILLS.filter(s => s.classId === classId);
}

/** Resolve the display/behavior group for old and new skills. */
export function getSkillGroup(skill: Skill): SkillGroup {
    if (skill.skillGroup) return skill.skillGroup;
    return skill.classId === 'shared' ? 'commonMagic' : 'classSkill';
}

/**
 * Get skills that a character has learned (class-specific + shared original magic).
 * Shared magic is resolved via ClassTree.skillUnlocks.
 */
export function getLearnedSkills(classId: string, characterTier: number, unlockedSkillIds?: string[]): Skill[] {
    // Class-specific skills (filtered by classId and tier)
    const classSkills = ALL_SKILLS.filter(s => s.classId === classId && s.tier <= characterTier);

    // Shared original magic (resolved from ClassTree.skillUnlocks)
    if (unlockedSkillIds && unlockedSkillIds.length > 0) {
        const sharedSkills = ALL_SKILLS.filter(
            s => s.classId === 'shared' && unlockedSkillIds.includes(s.id)
        );
        const learned = [...classSkills, ...sharedSkills];
        const supersededIds = new Set(learned.flatMap((skill) => skill.supersedesSkillIds ?? []));
        return learned.filter((skill) => !supersededIds.has(skill.id));
    }

    return classSkills;
}

/** Lookup a single skill by ID */
export function getSkill(id: string): Skill | undefined {
    return ALL_SKILLS.find(s => s.id === id);
}
