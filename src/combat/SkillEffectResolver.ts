import type { Character } from '../character/Character';
import type { CharacterStats } from '../data/Stats';
import type { Skill } from '../data/SkillDB';
import { getMagicTerrainMultiplier, getTerrainProfile } from '../field/TerrainRules';
import type { TileType } from '../map/Tile';
import { clampHitChance, getPhysicalHitChance, type RandomSource } from './CombatFormulas';
import { StatusEffect, getStatusEffectsForSkill } from './StatusEffects';
import { formatT, t } from '../i18n/LanguageManager';

export interface SkillEffectEnemyInput {
    id: string;
    name: string;
    gridX: number;
    gridY: number;
    stats: CharacterStats;
}

export interface SkillEffectEnemyResult {
    enemyId: string;
    damage: number;
    mpDamage?: number;
    killed: boolean;
    isHit: boolean;
    isMiss: boolean;
    hitChance?: number;
    terrainMultiplier?: number;
    statusEffects?: StatusEffect[];
    casterHpRestore?: number;
    casterMpRestore?: number;
}

export interface SkillEffectResult {
    mpCost: number;
    casterHpDelta: number;
    casterMpDelta: number;
    enemyResults: SkillEffectEnemyResult[];
    logs: string[];
    appliesBuff?: Skill;
    casterStatusEffects?: StatusEffect[];
    cleansesCasterStatuses?: boolean;
}

export interface ResolveSkillEffectInput {
    casterStats: CharacterStats;
    casterCharacter?: Character;
    skill: Skill;
    targetEnemy?: SkillEffectEnemyInput;
    allEnemies?: SkillEffectEnemyInput[];
    targetsResolvedByPattern?: boolean;
    terrainContext?: SkillTerrainContext;
    random?: RandomSource;
}

export interface SkillTerrainContext {
    casterTile?: TileType;
    impactTile?: TileType;
    targetTiles?: Record<string, TileType>;
}

export function resolveSkillEffect(input: ResolveSkillEffectInput): SkillEffectResult {
    const { casterStats, skill, targetEnemy } = input;
    const casterCombatStats = input.casterCharacter?.getCombatStats() ?? casterStats;
    const random = input.random ?? Math.random;
    const result: SkillEffectResult = {
        mpCost: skill.mpCost,
        casterHpDelta: 0,
        casterMpDelta: -skill.mpCost,
        enemyResults: [],
        logs: [],
    };

    switch (skill.type) {
        case 'heal':
            resolveHeal(skill, casterStats, casterCombatStats, result);
            if (doesSkillCleanseCaster(skill)) result.cleansesCasterStatuses = true;
            result.casterStatusEffects = getCasterStatusEffects(skill);
            break;
        case 'buff':
            result.casterStatusEffects = getStatusEffectsForSkill(skill);
            result.appliesBuff = skill;
            result.logs.push(formatSkillLog('field.skill.buffActivated', skill));
            break;
        case 'damage':
            if (!targetEnemy) {
                result.logs.push(t('field.magic.noTarget'));
                break;
            }
            result.enemyResults = getResolvedTargets(input, targetEnemy).map((enemy) =>
                resolveDamageToEnemy(skill, casterCombatStats, enemy, input.terrainContext, random)
            );
            if (result.enemyResults.length === 1) {
                if (!result.enemyResults[0].isMiss) {
                    result.logs.push(formatSkillLog('field.skill.damageSingle', skill, {
                        target: targetEnemy.name,
                        damage: result.enemyResults[0].damage,
                        terrain: formatTerrainNote(result.enemyResults[0]),
                    }));
                }
            } else {
                result.logs.push(formatSkillLog('field.skill.targetCount', skill, { count: result.enemyResults.length }));
            }
            appendResourceDrainLogs(skill, result);
            break;
        case 'debuff':
            if (!targetEnemy) {
                result.logs.push(t('field.magic.noTarget'));
                break;
            }
            result.enemyResults = getResolvedTargets(input, targetEnemy).map((enemy) =>
                resolveDebuffToEnemy(skill, casterCombatStats, enemy, input.terrainContext, random)
            );
            if (result.enemyResults.length === 1) {
                if (!result.enemyResults[0].isMiss) {
                    result.logs.push(formatSkillLog('field.skill.debuffSingle', skill, {
                        target: targetEnemy.name,
                        terrain: formatTerrainNote(result.enemyResults[0]),
                    }));
                }
            } else {
                result.logs.push(formatSkillLog('field.skill.debuffCount', skill, { count: result.enemyResults.length }));
            }
            break;
        case 'aoe': {
            if (!targetEnemy) {
                result.logs.push(t('field.magic.noTarget'));
                break;
            }
            const targets = input.targetsResolvedByPattern
                ? getResolvedTargets(input, targetEnemy)
                : (input.allEnemies ?? [targetEnemy]).filter((enemy) =>
                    enemy.stats.hp > 0 &&
                    Math.abs(enemy.gridX - targetEnemy.gridX) <= skill.aoeRadius &&
                    Math.abs(enemy.gridY - targetEnemy.gridY) <= skill.aoeRadius
                );
            result.logs.push(formatSkillLog('field.skill.targetCount', skill, { count: targets.length }));
            result.enemyResults = targets.map((enemy) => resolveDamageToEnemy(skill, casterCombatStats, enemy, input.terrainContext, random));
            if (result.enemyResults.some((enemyResult) => hasTerrainMultiplier(enemyResult))) {
                result.logs.push(t('field.skill.terrainAffinity'));
            }
            appendResourceDrainLogs(skill, result);
            break;
        }
    }

    return result;
}

function doesSkillCleanseCaster(skill: Skill): boolean {
    return skill.id === 'shr_t1' || skill.id === 'shr_t7' || skill.id === 'og_cure';
}

function getCasterStatusEffects(skill: Skill): StatusEffect[] | undefined {
    const statuses = getStatusEffectsForSkill(skill);
    return statuses.length > 0 ? statuses : undefined;
}

function getResolvedTargets(input: ResolveSkillEffectInput, fallbackTarget: SkillEffectEnemyInput): SkillEffectEnemyInput[] {
    if (!input.targetsResolvedByPattern) return [fallbackTarget];
    const targets = input.allEnemies?.filter((enemy) => enemy.stats.hp > 0) ?? [];
    return targets.length > 0 ? targets : [fallbackTarget];
}

function resolveHeal(
    skill: Skill,
    casterStats: CharacterStats,
    casterCombatStats: CharacterStats,
    result: SkillEffectResult
): void {
    if (skill.id === 'alc_t4') {
        const hpCost = Math.floor(casterStats.maxHp * 0.2);
        const mpGain = Math.floor(casterCombatStats.magAtk * skill.power);
        result.casterHpDelta = -Math.min(Math.max(0, casterStats.hp - 1), hpCost);
        result.casterMpDelta = mpGain;
        result.logs.push(`${skill.icon} ${skill.nameKr}: HP -${hpCost}, MP +${mpGain}`);
        return;
    }

    if (skill.id === 'cle_t7' || skill.id === 'shr_t7') {
        const hpGain = Math.max(0, casterStats.maxHp - casterStats.hp);
        const mpGain = Math.max(0, casterStats.maxMp - (casterStats.mp - skill.mpCost));
        result.casterHpDelta = hpGain;
        result.casterMpDelta = -skill.mpCost + mpGain;
        result.logs.push(formatSkillLog('field.skill.fullRecover', skill));
        return;
    }

    const healAmt = Math.floor(casterCombatStats.magAtk * skill.power);
    result.casterHpDelta = Math.min(healAmt, Math.max(0, casterStats.maxHp - casterStats.hp));

    if (skill.id === 'alc_t6') {
        const mpGain = Math.floor(healAmt * 0.5);
        result.casterMpDelta = -skill.mpCost + Math.min(mpGain, Math.max(0, casterStats.maxMp - (casterStats.mp - skill.mpCost)));
        result.logs.push(`${skill.icon} ${skill.nameKr}: HP +${healAmt}, MP +${mpGain}`);
        return;
    }

    result.logs.push(formatSkillLog('field.skill.heal', skill, { amount: healAmt }));
}

function resolveDamageToEnemy(
    skill: Skill,
    casterCombatStats: CharacterStats,
    enemy: SkillEffectEnemyInput,
    terrainContext: SkillTerrainContext | undefined,
    random: RandomSource
): SkillEffectEnemyResult {
    const hit = rollSkillHit(skill, casterCombatStats, enemy, terrainContext, random);
    if (hit.isMiss) return createMissResult(enemy.id, hit.hitChance);

    const isPhysical = skill.element === 'physical';
    const baseAtk = isPhysical ? casterCombatStats.atk : casterCombatStats.magAtk;
    const baseDef = isPhysical ? enemy.stats.def : enemy.stats.magDef;
    const rule = getSpecialDamageRule(skill.id);
    const defenseScale = rule.defenseScale ?? 0.5;
    const terrainMultiplier = getEnemyTerrainMultiplier(skill, enemy, terrainContext);
    const hpDamage = rule.mpOnly
        ? 0
        : Math.max(1, Math.floor((baseAtk * skill.power - baseDef * defenseScale) * terrainMultiplier));
    const mpDamage = rule.mpDrainRatio
        ? Math.max(1, Math.min(enemy.stats.mp, Math.floor(baseAtk * skill.power * rule.mpDrainRatio)))
        : undefined;
    const statusEffects = getOffensiveStatusEffects(skill);
    return {
        enemyId: enemy.id,
        damage: hpDamage,
        mpDamage,
        killed: hpDamage > 0 && enemy.stats.hp - hpDamage <= 0,
        isHit: true,
        isMiss: false,
        hitChance: hit.hitChance,
        terrainMultiplier,
        statusEffects,
        casterHpRestore: rule.hpDrainRatio ? Math.max(1, Math.floor(hpDamage * rule.hpDrainRatio)) : undefined,
        casterMpRestore: mpDamage !== undefined ? mpDamage : undefined,
    };
}

function resolveDebuffToEnemy(
    skill: Skill,
    casterCombatStats: CharacterStats,
    enemy: SkillEffectEnemyInput,
    terrainContext: SkillTerrainContext | undefined,
    random: RandomSource
): SkillEffectEnemyResult {
    const hit = rollSkillHit(skill, casterCombatStats, enemy, terrainContext, random);
    if (hit.isMiss) return createMissResult(enemy.id, hit.hitChance);

    const terrainMultiplier = getEnemyTerrainMultiplier(skill, enemy, terrainContext);
    const damage = Math.max(1, Math.floor(casterCombatStats.magAtk * 0.5 * terrainMultiplier));
    const statusEffects = getOffensiveStatusEffects(skill);
    return {
        enemyId: enemy.id,
        damage,
        killed: enemy.stats.hp - damage <= 0,
        isHit: true,
        isMiss: false,
        hitChance: hit.hitChance,
        terrainMultiplier,
        statusEffects,
    };
}

function getOffensiveStatusEffects(skill: Skill): StatusEffect[] | undefined {
    if (skill.type === 'buff' || skill.type === 'heal') return undefined;
    const statuses = getStatusEffectsForSkill(skill);
    return statuses.length > 0 ? statuses : undefined;
}

interface SpecialDamageRule {
    defenseScale?: number;
    hpDrainRatio?: number;
    mpDrainRatio?: number;
    mpOnly?: boolean;
}

const SPECIAL_DAMAGE_RULES: Record<string, SpecialDamageRule> = {
    inf_t5: { defenseScale: 0 },
    cav_t5: { defenseScale: 0.2 },
    lan_t2: { defenseScale: 0 },
    lan_t5: { defenseScale: 0 },
    lan_t7: { defenseScale: 0.2 },
    arc_t3: { defenseScale: 0 },
    cul_t3: { hpDrainRatio: 0.5 },
    og_hpdrain: { hpDrainRatio: 0.75 },
    og_mpdrain: { mpOnly: true, mpDrainRatio: 1 },
};

function getSpecialDamageRule(skillId: string): SpecialDamageRule {
    return SPECIAL_DAMAGE_RULES[skillId] ?? {};
}

function appendResourceDrainLogs(skill: Skill, result: SkillEffectResult): void {
    const hpRestore = result.enemyResults.reduce((sum, enemy) => sum + (enemy.casterHpRestore ?? 0), 0);
    const mpRestore = result.enemyResults.reduce((sum, enemy) => sum + (enemy.casterMpRestore ?? 0), 0);
    if (hpRestore > 0) result.logs.push(formatSkillLog('field.skill.hpAbsorb', skill, { amount: hpRestore }));
    if (mpRestore > 0) result.logs.push(formatSkillLog('field.skill.mpAbsorb', skill, { amount: mpRestore }));
}

function rollSkillHit(
    skill: Skill,
    casterCombatStats: CharacterStats,
    enemy: SkillEffectEnemyInput,
    terrainContext: SkillTerrainContext | undefined,
    random: RandomSource
): { isMiss: boolean; hitChance: number } {
    const hitChance = getSkillHitChance(skill, casterCombatStats, enemy, terrainContext);
    return { isMiss: random() * 100 > hitChance, hitChance };
}

function getSkillHitChance(
    skill: Skill,
    casterCombatStats: CharacterStats,
    enemy: SkillEffectEnemyInput,
    terrainContext?: SkillTerrainContext
): number {
    const hitBonus = skill.hitBonus ?? 0;
    if (skill.element === 'physical') {
        const targetTile = getEnemyTargetTile(enemy, terrainContext);
        const rangedTerrainPenalty = skill.range > 1 && targetTile !== undefined
            ? getTerrainProfile(targetTile).rangedHitPenalty
            : 0;
        return getPhysicalHitChance(casterCombatStats, enemy.stats, rangedTerrainPenalty + hitBonus);
    }

    return clampHitChance(casterCombatStats.magHit - enemy.stats.magEva + hitBonus);
}

function createMissResult(enemyId: string, hitChance: number): SkillEffectEnemyResult {
    return {
        enemyId,
        damage: 0,
        killed: false,
        isHit: false,
        isMiss: true,
        hitChance,
    };
}

function getEnemyTargetTile(enemy: SkillEffectEnemyInput, terrainContext?: SkillTerrainContext): TileType | undefined {
    return terrainContext?.targetTiles?.[enemy.id] ?? terrainContext?.impactTile;
}

function getEnemyTerrainMultiplier(
    skill: Skill,
    enemy: SkillEffectEnemyInput,
    terrainContext?: SkillTerrainContext
): number {
    const targetTile = getEnemyTargetTile(enemy, terrainContext);
    return getMagicTerrainMultiplier(skill.element, {
        casterTile: terrainContext?.casterTile,
        targetTile,
    }).multiplier;
}

function hasTerrainMultiplier(result: SkillEffectEnemyResult): boolean {
    return result.terrainMultiplier !== undefined && Math.abs(result.terrainMultiplier - 1) > 0.001;
}

function formatTerrainNote(result: SkillEffectEnemyResult): string {
    if (!hasTerrainMultiplier(result)) return '';
    return formatT('field.skill.terrainNote', { multiplier: result.terrainMultiplier!.toFixed(2) });
}

function formatSkillLog(key: string, skill: Skill, params: Record<string, string | number> = {}): string {
    return formatT(key, {
        icon: skill.icon,
        skill: skill.nameKr,
        ...params,
    });
}
