import type { Character } from '../character/Character';
import type { CharacterStats } from '../data/Stats';
import type { Skill } from '../data/SkillDB';
import { getMagicTerrainMultiplier } from '../field/TerrainRules';
import type { TileType } from '../map/Tile';
import { StatusEffect, getStatusEffectsForSkill } from './StatusEffects';

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
    killed: boolean;
    terrainMultiplier?: number;
    statusEffects?: StatusEffect[];
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
}

export interface SkillTerrainContext {
    casterTile?: TileType;
    impactTile?: TileType;
    targetTiles?: Record<string, TileType>;
}

export function resolveSkillEffect(input: ResolveSkillEffectInput): SkillEffectResult {
    const { casterStats, skill, targetEnemy } = input;
    const casterCombatStats = input.casterCharacter?.getCombatStats() ?? casterStats;
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
            if (skill.id === 'shr_t1') result.cleansesCasterStatuses = true;
            break;
        case 'buff':
            result.casterStatusEffects = getStatusEffectsForSkill(skill);
            result.appliesBuff = skill;
            result.logs.push(`${skill.icon} ${skill.nameKr}: 버프/보호 발동!`);
            break;
        case 'damage':
            if (!targetEnemy) {
                result.logs.push('대상 없음!');
                break;
            }
            result.enemyResults = getResolvedTargets(input, targetEnemy).map((enemy) =>
                resolveDamageToEnemy(skill, casterCombatStats, enemy, input.terrainContext)
            );
            if (result.enemyResults.length === 1) {
                result.logs.push(`${skill.icon} ${skill.nameKr}: ${targetEnemy.name}에게 ${result.enemyResults[0].damage} 피해!${formatTerrainNote(result.enemyResults[0])}`);
            } else {
                result.logs.push(`${skill.icon} ${skill.nameKr}: ${result.enemyResults.length}체 대상!`);
            }
            break;
        case 'debuff':
            if (!targetEnemy) {
                result.logs.push('대상 없음!');
                break;
            }
            result.enemyResults = getResolvedTargets(input, targetEnemy).map((enemy) =>
                resolveDebuffToEnemy(skill, casterCombatStats, enemy, input.terrainContext)
            );
            if (result.enemyResults.length === 1) {
                result.logs.push(`${skill.icon} ${skill.nameKr}: ${targetEnemy.name} 약화${formatTerrainNote(result.enemyResults[0])}`);
            } else {
                result.logs.push(`${skill.icon} ${skill.nameKr}: ${result.enemyResults.length}체 약화`);
            }
            break;
        case 'aoe': {
            if (!targetEnemy) {
                result.logs.push('대상 없음!');
                break;
            }
            const targets = input.targetsResolvedByPattern
                ? getResolvedTargets(input, targetEnemy)
                : (input.allEnemies ?? [targetEnemy]).filter((enemy) =>
                    enemy.stats.hp > 0 &&
                    Math.abs(enemy.gridX - targetEnemy.gridX) <= skill.aoeRadius &&
                    Math.abs(enemy.gridY - targetEnemy.gridY) <= skill.aoeRadius
                );
            result.logs.push(`${skill.icon} ${skill.nameKr}: ${targets.length}체 대상!`);
            result.enemyResults = targets.map((enemy) => resolveDamageToEnemy(skill, casterCombatStats, enemy, input.terrainContext));
            if (result.enemyResults.some((enemyResult) => hasTerrainMultiplier(enemyResult))) {
                result.logs.push('지형 마법 상성 적용');
            }
            break;
        }
    }

    return result;
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
        result.logs.push(`${skill.icon} ${skill.nameKr}: HP/MP 전회복!`);
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

    result.logs.push(`${skill.icon} ${skill.nameKr}: HP +${healAmt} 회복`);
}

function resolveDamageToEnemy(
    skill: Skill,
    casterCombatStats: CharacterStats,
    enemy: SkillEffectEnemyInput,
    terrainContext?: SkillTerrainContext
): SkillEffectEnemyResult {
    const isPhysical = skill.element === 'physical';
    const baseAtk = isPhysical ? casterCombatStats.atk : casterCombatStats.magAtk;
    const baseDef = isPhysical ? enemy.stats.def : enemy.stats.magDef;
    const terrainMultiplier = getEnemyTerrainMultiplier(skill, enemy, terrainContext);
    const damage = Math.max(1, Math.floor((baseAtk * skill.power - baseDef * 0.5) * terrainMultiplier));
    return {
        enemyId: enemy.id,
        damage,
        killed: enemy.stats.hp - damage <= 0,
        terrainMultiplier,
    };
}

function resolveDebuffToEnemy(
    skill: Skill,
    casterCombatStats: CharacterStats,
    enemy: SkillEffectEnemyInput,
    terrainContext?: SkillTerrainContext
): SkillEffectEnemyResult {
    const terrainMultiplier = getEnemyTerrainMultiplier(skill, enemy, terrainContext);
    const damage = Math.max(1, Math.floor(casterCombatStats.magAtk * 0.5 * terrainMultiplier));
    return {
        enemyId: enemy.id,
        damage,
        killed: enemy.stats.hp - damage <= 0,
        terrainMultiplier,
        statusEffects: getStatusEffectsForSkill(skill),
    };
}

function getEnemyTerrainMultiplier(
    skill: Skill,
    enemy: SkillEffectEnemyInput,
    terrainContext?: SkillTerrainContext
): number {
    const targetTile = terrainContext?.targetTiles?.[enemy.id] ?? terrainContext?.impactTile;
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
    return ` (지형 x${result.terrainMultiplier!.toFixed(2)})`;
}
