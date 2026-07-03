import {
    applyGuardToDamage,
    applyStatuses,
    applyStatusesToCarrier,
    cleanseNegativeStatuses,
    hasStatus,
} from '../src/combat/StatusEffects';
import { resolveSkillEffect, type SkillEffectResult } from '../src/combat/SkillEffectResolver';
import { getSkillAttackProfile } from '../src/data/AttackPatternProfiles';
import { getSkill, type Skill } from '../src/data/SkillDB';
import { getEffectiveSkill, getUpgradeLevel } from '../src/magic/MagicLoadout';
import { MAGIC_ACTION_GAUGE_COST } from '../src/field/FieldActionEconomy';
import type { TilePoint } from '../src/field/FieldPathing';
import {
    buildSkillTerrainContext,
    getActorAttackTargetFailure as getSkillTargetFailure,
    getSkillCandidateEnemies,
} from '../src/field/FieldTargeting';
import { isTerrainLineOfSightBlocking } from '../src/field/TerrainRules';
import type { CombatEventMessage, WorldServerMessage } from '../src/net/WorldProtocol';
import type { WorldMap } from '../src/map/WorldMap';
import { readStringPayload } from './WorldSessionInput';
import { canActorTargetEnemy } from './WorldSessionVisibility';
import {
    applyActorResourceDelta,
    getActorCasterSkillStats,
    getActorLearnedSkillIds,
    getAlliedActorsWithin,
    toSkillEffectEnemyInput,
} from './WorldSessionSkillState';
import { createActorEvent, createEnemyEvent, reject } from './WorldSessionHelpers';
import type {
    CompleteEnemyKillResult,
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    WorldSessionMessageResult,
} from './WorldSessionTypes';

export interface WorldSessionSkillResolverContext {
    actors: ReadonlyMap<string, ServerActor>;
    enemies: Map<string, ServerEnemy>;
    getServerTileAt: (tile: TilePoint, ownerPlayerId?: string | null) => ReturnType<WorldMap['getTileAt']>;
    getServerBoundsForOwner: (ownerPlayerId?: string | null) => ReturnType<WorldMap['getBoundsTiles']>;
    hasFieldLineOfSight: (from: TilePoint, to: TilePoint, ownerPlayerId?: string) => boolean;
    spendActorGauge: (actor: ServerActor, cost: number) => void;
    finishActorIfSpent: (actor: ServerActor) => void;
    completeEnemyKill: (actor: ServerActor, target: ServerEnemy, now: number) => CompleteEnemyKillResult;
}

export class WorldSessionSkillResolver {
    public constructor(private readonly context: WorldSessionSkillResolverContext) {}

    public handleCastSkill(
        player: ServerPlayer,
        actor: ServerActor,
        intentId: string,
        payload: unknown,
        now: number
    ): WorldSessionMessageResult {
        const skillId = readStringPayload(payload, 'skillId');
        if (!skillId) return reject(intentId, 'Cast skill payload must include skillId.');
        const skill = getSkill(skillId);
        if (!skill) return reject(intentId, 'Skill does not exist.');
        if (!getActorLearnedSkillIds(actor).has(skill.id)) return reject(intentId, 'Skill is not learned by this actor.');
        if (!actor.magicLoadout.includes(skill.id)) return reject(intentId, 'Skill is not equipped by this actor.');
        if (hasStatus(actor.statuses, 'silence')) return reject(intentId, 'Actor is silenced.');
        if (actor.remainingAp < MAGIC_ACTION_GAUGE_COST) return reject(intentId, 'No action available to cast skill.');
        if (actor.stats.mp < skill.mpCost) return reject(intentId, 'Actor does not have enough MP.');

        const requiresTarget = skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe';
        const targetId = readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
        const target = targetId ? this.context.enemies.get(targetId) : undefined;
        if (requiresTarget) {
            if (!targetId) return reject(intentId, 'Cast skill payload must include targetId.');
            if (!target || target.enemy.stats.hp <= 0) return reject(intentId, 'Target is not alive.');
            if (!canActorTargetEnemy(actor, target)) return reject(intentId, 'Target is not visible.');
        }

        const targetTile = target ? { x: target.enemy.gridX, y: target.enemy.gridY } : undefined;
        const profile = getSkillAttackProfile(skill);
        if (target && targetTile) {
            const failure = getSkillTargetFailure({
                profile,
                context: this.getSkillPatternContext(actor),
                selectedContext: this.getSkillPatternContext(actor, targetTile),
                target: targetTile,
            });
            if (failure) return reject(intentId, 'Skill target is not valid.');
        }

        const aliveEnemies = [...this.context.enemies.values()]
            .filter((entry) => entry.enemy.stats.hp > 0)
            .filter((entry) => canActorTargetEnemy(actor, entry));
        const targetEnemies = target && targetTile
            ? getSkillCandidateEnemies(aliveEnemies.map((entry) => entry.enemy), profile, this.getSkillPatternContext(actor, targetTile), target.enemy)
            : [];
        const effectiveSkill = getEffectiveSkill(skill, getUpgradeLevel(actor.skillUpgradeLevels, skill.id));
        const effect = resolveSkillEffect({
            casterStats: getActorCasterSkillStats(actor),
            skill: effectiveSkill,
            targetEnemy: target ? toSkillEffectEnemyInput(target.enemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => toSkillEffectEnemyInput(enemy)),
            targetsResolvedByPattern: Boolean(target),
            terrainContext: buildSkillTerrainContext({
                casterTile: actor.tile,
                targetEnemies,
                targetEnemy: target?.enemy,
                getTileAt: (tile) => this.context.getServerTileAt(tile, actor.ownerPlayerId),
            }),
        });

        this.context.spendActorGauge(actor, MAGIC_ACTION_GAUGE_COST);
        const result = this.applySkillEffect(player, actor, effectiveSkill, effect, now);
        this.context.finishActorIfSpent(actor);
        return result;
    }

    private applySkillEffect(
        player: ServerPlayer,
        actor: ServerActor,
        skill: Skill,
        effect: SkillEffectResult,
        now: number
    ): WorldSessionMessageResult {
        const broadcasts: CombatEventMessage[] = [];
        const replies: WorldServerMessage[] = [];
        applyActorResourceDelta(actor, effect.casterHpDelta, effect.casterMpDelta);
        if (effect.casterHpDelta > 0) {
            broadcasts.push(createActorEvent('heal', actor, actor, effect.casterHpDelta));
        } else if (effect.casterHpDelta < 0) {
            broadcasts.push(createActorEvent('damage', actor, actor, Math.abs(effect.casterHpDelta)));
        }

        if (effect.cleansesCasterStatuses) {
            actor.statuses = cleanseNegativeStatuses(actor.statuses);
            broadcasts.push(createActorEvent('status', actor, actor));
        }

        if (effect.casterStatusEffects && effect.casterStatusEffects.length > 0) {
            const targets = skill.targetScope === 'selfAndNearbyAllies'
                ? getAlliedActorsWithin(this.context.actors, player, actor.tile, skill.allyRadius ?? 0)
                : [actor];
            for (const target of targets) {
                applyStatusesToCarrier(target, effect.casterStatusEffects);
                broadcasts.push(createActorEvent('status', actor, target, undefined, effect.casterStatusEffects[0]));
            }
        }

        for (const enemyResult of effect.enemyResults) {
            const target = this.context.enemies.get(enemyResult.enemyId);
            if (!target) continue;
            const enemy = target.enemy;

            if (enemyResult.isMiss) {
                broadcasts.push(createEnemyEvent('miss', actor, enemy, 0));
                continue;
            }

            if (enemyResult.statusEffects && enemyResult.statusEffects.length > 0) {
                enemy.statuses = applyStatuses(enemy.statuses, enemyResult.statusEffects);
                broadcasts.push(createEnemyEvent('status', actor, enemy, undefined, enemyResult.statusEffects[0]));
            }

            if (enemyResult.mpDamage !== undefined && enemyResult.mpDamage > 0) {
                const drainedMp = Math.min(enemy.stats.mp, enemyResult.mpDamage);
                enemy.stats.mp = Math.max(0, enemy.stats.mp - drainedMp);
                applyActorResourceDelta(actor, 0, drainedMp);
                if (drainedMp > 0) broadcasts.push(createEnemyEvent('status', actor, enemy, drainedMp));
            }

            const guarded = applyGuardToDamage(enemy.statuses, enemyResult.damage);
            enemy.statuses = guarded.statuses;
            const dead = enemy.takeDamage(guarded.damage);
            if (enemyResult.casterHpRestore !== undefined && enemyResult.casterHpRestore > 0) {
                applyActorResourceDelta(actor, enemyResult.casterHpRestore, 0);
                broadcasts.push(createActorEvent('heal', actor, actor, enemyResult.casterHpRestore));
            }
            if (enemyResult.casterMpRestore !== undefined && enemyResult.casterMpRestore > 0) {
                applyActorResourceDelta(actor, 0, enemyResult.casterMpRestore);
                broadcasts.push(createActorEvent('status', actor, actor, enemyResult.casterMpRestore));
            }
            if (dead) {
                broadcasts.push(createEnemyEvent('kill', actor, enemy, guarded.damage));
                const killResult = this.context.completeEnemyKill(actor, target, now);
                if (killResult.autoLootGrant) replies.push(killResult.autoLootGrant);
                if (killResult.scenarioEnemyDefeatEvent) replies.push(killResult.scenarioEnemyDefeatEvent);
            } else if (guarded.damage > 0 || (!enemyResult.statusEffects && enemyResult.mpDamage === undefined)) {
                broadcasts.push(createEnemyEvent('damage', actor, enemy, guarded.damage));
            }
        }

        if (broadcasts.length === 0 && skill.type === 'buff') broadcasts.push(createActorEvent('status', actor, actor));
        return { replies, broadcasts };
    }

    private getSkillPatternContext(actor: ServerActor, selectedTile?: TilePoint) {
        const bounds = this.context.getServerBoundsForOwner(actor.ownerPlayerId);
        return {
            casterTile: actor.tile,
            selectedTile,
            isInsideMap: (tile: TilePoint) => tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height,
            isBlockingTile: (tile: TilePoint) => isTerrainLineOfSightBlocking(this.context.getServerTileAt(tile, actor.ownerPlayerId)),
            hasLineOfSight: (from: TilePoint, to: TilePoint) => this.context.hasFieldLineOfSight(from, to, actor.ownerPlayerId),
        };
    }
}
