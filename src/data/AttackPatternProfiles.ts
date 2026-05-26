import type { Skill } from './SkillDB';
import type { AttackPatternProfile } from '../field/TargetPatterns';

const adjacentSingle: AttackPatternProfile = {
    select: { kind: 'adjacent', maxRange: 1 },
    effect: { kind: 'single', origin: 'selected' },
};

const CLASS_ATTACK_PROFILES: Record<string, AttackPatternProfile> = {
    infantry: adjacentSingle,
    cavalry: {
        select: { kind: 'orthogonalLine', minRange: 1, maxRange: 2 },
        effect: { kind: 'single', origin: 'selected' },
    },
    flying: adjacentSingle,
    naval: adjacentSingle,
    lancer: {
        select: { kind: 'orthogonalLine', minRange: 1, maxRange: 2 },
        effect: { kind: 'piercingLine', length: 2, origin: 'caster' },
    },
    archer: {
        select: { kind: 'orthogonalLine', minRange: 2, maxRange: 4, requiresLineOfSight: true },
        effect: { kind: 'single', origin: 'selected' },
    },
    cleric: adjacentSingle,
    priest: adjacentSingle,
    shrine: adjacentSingle,
    mage: {
        select: { kind: 'diamond', minRange: 1, maxRange: 3, requiresLineOfSight: true },
        effect: { kind: 'square', radius: 1, origin: 'selected' },
        damageMultiplier: 0.6,
    },
    cultist: {
        select: { kind: 'diamond', minRange: 1, maxRange: 3, requiresLineOfSight: true },
        effect: { kind: 'single', origin: 'selected' },
    },
    alchemist: {
        select: { kind: 'diamond', minRange: 1, maxRange: 2, requiresLineOfSight: true },
        effect: { kind: 'single', origin: 'selected' },
    },
};

const SKILL_ATTACK_PROFILES: Record<string, AttackPatternProfile> = {
    arc_t3: {
        select: { kind: 'orthogonalLine', minRange: 2, maxRange: 4, requiresLineOfSight: true },
        effect: { kind: 'piercingLine', length: 4, origin: 'caster' },
    },
    fly_t5: {
        select: { kind: 'orthogonalLine', minRange: 1, maxRange: 2, requiresLineOfSight: true },
        effect: { kind: 'cone', length: 2, width: 1, origin: 'caster' },
    },
    og_windcutter: {
        select: { kind: 'orthogonalLine', minRange: 1, maxRange: 3, requiresLineOfSight: true },
        effect: { kind: 'piercingLine', length: 3, origin: 'caster' },
    },
};

export function getClassAttackProfile(classId: string, fallbackRange: number = 1): AttackPatternProfile {
    return CLASS_ATTACK_PROFILES[classId] ?? getFallbackClassAttackProfile(fallbackRange);
}

export function getSkillAttackProfile(skill: Skill): AttackPatternProfile {
    return SKILL_ATTACK_PROFILES[skill.id] ?? getFallbackSkillAttackProfile(skill);
}

export function getFallbackClassAttackProfile(range: number): AttackPatternProfile {
    const maxRange = Math.max(1, range);
    return {
        select: { kind: 'diamond', minRange: 1, maxRange, requiresLineOfSight: maxRange > 1 },
        effect: { kind: 'single', origin: 'selected' },
    };
}

export function getFallbackSkillAttackProfile(skill: Skill): AttackPatternProfile {
    const maxRange = Math.max(1, skill.range);
    return {
        select: { kind: 'diamond', minRange: 1, maxRange, requiresLineOfSight: true },
        effect: skill.aoeRadius > 0
            ? { kind: 'square', radius: skill.aoeRadius, origin: 'selected' }
            : { kind: 'single', origin: 'selected' },
    };
}
