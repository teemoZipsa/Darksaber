/**
 * MagicLoadout — per-character equipped-magic slots and gold-based skill upgrades.
 *
 * The game has no stored "learned skills"; they are derived from class + tier via
 * SkillDB.getLearnedSkills. This module layers two persisted concepts on top:
 *   - magicLoadout: the ordered list of equipped skill ids (max 8). Slot order is
 *     the order shown in the in-combat radial menu.
 *   - skillUpgradeLevels: per-skill enhancement level (1..5) bought with gold.
 *
 * Everything here is pure and shared by client (combat + K panel) and server
 * (cast validation + authoritative damage), so power/duration scaling stays in
 * lockstep and never desyncs.
 */

import { getClassLine } from '../data/ClassTree';
import { getLearnedSkills, getSkill, type Skill } from '../data/SkillDB';

export const MAGIC_LOADOUT_SIZE = 8;
export const MIN_UPGRADE_LEVEL = 1;
export const MAX_UPGRADE_LEVEL = 5;

/** Minimal shape needed to derive a character's learnable skills. */
export interface LoadoutOwner {
    classLineId: string;
    currentTier: number;
}

/** Shared "original magic" ids unlocked by this class up to its current tier. */
export function getUnlockedSkillIds(owner: LoadoutOwner): string[] {
    const classLine = getClassLine(owner.classLineId);
    if (!classLine) return [];
    const unlocked: string[] = [];
    for (let tier = 1; tier <= owner.currentTier; tier++) {
        const ids = classLine.skillUnlocks[tier];
        if (ids) unlocked.push(...ids);
    }
    return unlocked;
}

/**
 * Deterministically ordered list of skills this character has learned.
 * Order = tier ascending, then skill id — so "first N learned" is stable across
 * machines and runs, independent of ALL_SKILLS declaration order.
 */
export function getOrderedLearnedSkills(owner: LoadoutOwner): Skill[] {
    const learned = getLearnedSkills(owner.classLineId, owner.currentTier, getUnlockedSkillIds(owner));
    return [...learned].sort((a, b) => (a.tier - b.tier) || a.id.localeCompare(b.id));
}

/** Set of skill ids the character may equip right now. */
export function getLearnedSkillIdSet(owner: LoadoutOwner): Set<string> {
    return new Set(getOrderedLearnedSkills(owner).map((skill) => skill.id));
}

/** The default loadout for a fresh character: first 8 learned skills, in order. */
export function getDefaultLoadout(owner: LoadoutOwner): string[] {
    return getOrderedLearnedSkills(owner).slice(0, MAGIC_LOADOUT_SIZE).map((skill) => skill.id);
}

/**
 * Normalize a stored loadout against what the character can currently learn:
 *   - drop ids that are no longer learnable (class/tier change) or duplicated,
 *   - keep the surviving ids in their existing slot order,
 *   - backfill freed/empty slots from the ordered learned skills until full
 *     (or out of skills).
 * An empty/missing stored loadout therefore resolves to getDefaultLoadout.
 */
export function normalizeLoadout(stored: readonly string[] | undefined, owner: LoadoutOwner): string[] {
    const ordered = getOrderedLearnedSkills(owner);
    const learnedIds = new Set(ordered.map((skill) => skill.id));
    const result: string[] = [];
    const used = new Set<string>();

    for (const id of stored ?? []) {
        if (id && learnedIds.has(id) && !used.has(id)) {
            result.push(id);
            used.add(id);
        }
        if (result.length >= MAGIC_LOADOUT_SIZE) break;
    }
    for (const skill of ordered) {
        if (result.length >= MAGIC_LOADOUT_SIZE) break;
        if (!used.has(skill.id)) {
            result.push(skill.id);
            used.add(skill.id);
        }
    }
    return result;
}

/** Clamp a raw stored level into the valid [1, 5] range. */
export function getUpgradeLevel(levels: Record<string, number> | undefined, skillId: string): number {
    const raw = levels?.[skillId];
    if (!raw || raw < MIN_UPGRADE_LEVEL) return MIN_UPGRADE_LEVEL;
    return Math.min(MAX_UPGRADE_LEVEL, Math.floor(raw));
}

/** Drop stale/out-of-range upgrade entries (keeps the map lean and valid). */
export function normalizeUpgradeLevels(
    levels: Record<string, number> | undefined
): Record<string, number> {
    const result: Record<string, number> = {};
    if (!levels) return result;
    for (const [id, raw] of Object.entries(levels)) {
        if (!getSkill(id)) continue;
        const level = Math.min(MAX_UPGRADE_LEVEL, Math.floor(raw));
        if (level > MIN_UPGRADE_LEVEL) result[id] = level;
    }
    return result;
}

/** Gold cost to upgrade a skill from its current level to `nextLevel`. */
export function getUpgradeCost(skill: Skill, nextLevel: number): number {
    return 100 * skill.tier * nextLevel;
}

export interface UpgradeCheck {
    ok: boolean;
    /** Cost of the next level (0 when already maxed). */
    cost: number;
    /** i18n reason key when not ok. */
    reasonKey?: 'magic.upgrade.maxed' | 'magic.upgrade.gold' | 'magic.upgrade.unlearned';
}

/** Whether a skill can be upgraded right now, with cost and (if not) the reason. */
export function checkUpgrade(
    skill: Skill,
    currentLevel: number,
    gold: number,
    isLearned: boolean
): UpgradeCheck {
    if (!isLearned) return { ok: false, cost: 0, reasonKey: 'magic.upgrade.unlearned' };
    if (currentLevel >= MAX_UPGRADE_LEVEL) return { ok: false, cost: 0, reasonKey: 'magic.upgrade.maxed' };
    const cost = getUpgradeCost(skill, currentLevel + 1);
    if (gold < cost) return { ok: false, cost, reasonKey: 'magic.upgrade.gold' };
    return { ok: true, cost };
}

function roundPower(value: number): number {
    return Math.round(value * 1000) / 1000;
}

/**
 * Apply enhancement scaling for a given level and return an effective skill.
 * - damage / aoe / heal: `power` gets +10% per level above 1.
 * - status skills: buff/debuff duration gets +1 turn at Lv3 and again at Lv5.
 * - MP cost is intentionally unchanged.
 * Returns the original object unchanged at level <= 1 (cheap fast path).
 */
export function getEffectiveSkill(skill: Skill, level: number): Skill {
    const lvl = Math.min(MAX_UPGRADE_LEVEL, Math.max(MIN_UPGRADE_LEVEL, Math.floor(level)));
    if (lvl <= MIN_UPGRADE_LEVEL) return skill;

    const result: Skill = { ...skill };
    if (skill.type === 'damage' || skill.type === 'aoe' || skill.type === 'heal') {
        result.power = roundPower(skill.power * (1 + 0.1 * (lvl - 1)));
    }
    if (skill.type === 'buff' || skill.type === 'debuff') {
        const bonus = (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0);
        if (bonus > 0) result.buffDuration = (skill.buffDuration ?? 3) + bonus;
    }
    return result;
}

/** Convenience: resolve a skill id to its effective form given a level map. */
export function getEffectiveSkillById(
    skillId: string,
    levels: Record<string, number> | undefined
): Skill | undefined {
    const skill = getSkill(skillId);
    if (!skill) return undefined;
    return getEffectiveSkill(skill, getUpgradeLevel(levels, skillId));
}
