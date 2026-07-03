import { hasStatus, type StatusEffect } from '../combat/StatusEffects';
import type { Skill } from '../data/SkillDB';
import { MAGIC_ACTION_GAUGE_COST } from '../field/FieldActionEconomy';

export type MagicCastReadinessFailure =
    | 'notLearned'
    | 'notEquipped'
    | 'silenced'
    | 'noAp'
    | 'noMp'
    | 'targetRequired';

export interface MagicCastReadinessInput {
    skill: Skill;
    statuses?: StatusEffect[];
    mp: number;
    remainingAp: number;
    learnedSkillIds?: ReadonlySet<string>;
    equippedSkillIds?: readonly string[];
    requireTarget?: boolean;
    targetId?: string | null;
}

export function isTargetedMagicSkill(skill: Pick<Skill, 'type'>): boolean {
    return skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe';
}

export function getMagicCastReadinessFailure(input: MagicCastReadinessInput): MagicCastReadinessFailure | null {
    const { skill } = input;
    if (input.learnedSkillIds && !input.learnedSkillIds.has(skill.id)) return 'notLearned';
    if (input.equippedSkillIds && !input.equippedSkillIds.includes(skill.id)) return 'notEquipped';
    if (hasStatus(input.statuses, 'silence')) return 'silenced';
    if (input.remainingAp < MAGIC_ACTION_GAUGE_COST) return 'noAp';
    if (input.mp < skill.mpCost) return 'noMp';
    if (input.requireTarget === true && isTargetedMagicSkill(skill) && !input.targetId) return 'targetRequired';
    return null;
}
