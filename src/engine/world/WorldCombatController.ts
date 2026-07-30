import { CombatFormulas } from '../../combat/CombatFormulas';
import {
    applyGuardToDamage,
    consumeStatus,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    getStatus,
} from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { Entity } from '../../entity/Entity';
import type { TileType } from '../../map/Tile';
import type { AttackPatternProfile } from '../../field/TargetPatterns';
import type { TerrainActorTraits } from '../../field/TerrainRules';
import { manhattan, type TilePoint } from '../../field/FieldPathing';
import type { FieldActor } from '../../field/FieldTypes';
import type { CombatFeedbackKind } from './CombatFeedback';
import { damageDefensiveEquipment, damageEquippedWeapon } from '../../inventory/Socketing';
import type { PlacedItem } from '../../inventory/GridInventory';
import { AudioManager } from '../AudioManager';
import { formatT, t } from '../../i18n/LanguageManager';
import { formatItemName } from '../../i18n/DisplayNames';
import { applyExecutionerDamage } from '../../field/EliteAffixes';
import {
    COMBAT_COUNTER_IMPACT_DELAY_SECONDS,
    COMBAT_COUNTER_START_DELAY_SECONDS,
    COMBAT_IMPACT_DELAY_SECONDS,
} from './CombatPresentationTimeline';

let nextFeedbackGroupId = 1;
const COMBAT_ATTACK_RECOVERY_SECONDS = 0.34;
const COMBAT_FEEDBACK_FLUSH_EPSILON_SECONDS = 0.001;

export interface CombatResult {
    executed: boolean;
    killedEnemyIds: string[];
    downedCharacterIds: string[];
}

export interface CombatEventSink {
    log(message: string): void;
    spawnDamage(x: number, y: number, amount: number, isCrit: boolean, isMiss: boolean): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHitEffect(x: number, y: number, isCrit: boolean, feedbackGroupId?: string, feedbackKind?: CombatFeedbackKind): void;
    spawnKillEffect(enemy: Enemy, feedbackGroupId?: string, actor?: FieldActor): void;
    spawnAttackCue(from: TilePoint, to: TilePoint, color: string, label?: string): void;
    spawnLoot(enemy: Enemy): void;
    flushFeedbackGroup?(feedbackGroupId: string): void;
    awardExp?(actor: FieldActor, enemy: Enemy): void;
    onEnemyDefeated?(enemy: Enemy): void;
    schedulePresentation?(delaySeconds: number, action: () => void): void;
}

export interface ActorAttackInput {
    actor: FieldActor;
    selectedEnemy: Enemy;
    targetEnemies: Enemy[];
    profile: AttackPatternProfile;
    getTileAt: (tile: TilePoint) => TileType;
    directionFromTo: (from: TilePoint, to: TilePoint) => 'up' | 'down' | 'left' | 'right';
    tryEnemyCounterAttack: (enemy: Enemy, actor: FieldActor) => CombatResult;
}

export interface EnemyAttackInput {
    enemy: Enemy;
    actor: FieldActor;
    range: number;
    getTileAt: (tile: TilePoint) => TileType;
    getActorTerrainTraits: (actor: FieldActor) => TerrainActorTraits;
    directionFromTo: (from: TilePoint, to: TilePoint) => 'up' | 'down' | 'left' | 'right';
    tryActorCounterAttack: (actor: FieldActor, enemy: Enemy) => CombatResult;
    feedbackGroupId?: string;
}

export interface ActorCounterAttackInput {
    actor: FieldActor;
    enemy: Enemy;
    canActorAttackTarget: (actor: FieldActor, enemy: Enemy) => boolean;
    getTileAt: (tile: TilePoint) => TileType;
}

export interface EnemyCounterAttackInput {
    enemy: Enemy;
    actor: FieldActor;
    getTileAt: (tile: TilePoint) => TileType;
    getActorTerrainTraits: (actor: FieldActor) => TerrainActorTraits;
}

export class WorldCombatController {
    private readonly sink: CombatEventSink;

    constructor(sink: CombatEventSink) {
        this.sink = sink;
    }

    public tryActorAttack(input: ActorAttackInput): CombatResult {
        const result = createCombatResult(false);
        const start = actorTile(input.actor);
        if (input.targetEnemies.length === 0) return result;

        result.executed = true;
        input.actor.entity.facing = input.directionFromTo(start, enemyTile(input.selectedEnemy));
        this.beginAttackPresentation(
            input.actor.entity,
            start,
            enemyTile(input.selectedEnemy),
            '#72e8ff',
            0,
            0.7,
        );

        const feedbackGroupId = createFeedbackGroupId('actorAttack');
        let counterTarget: Enemy | null = null;
        for (const target of input.targetEnemies) {
            const targetTile = enemyTile(target);
            const isRanged = manhattan(start, targetTile) > 1;
            const damageResult = CombatFormulas.calcPhysicalDamage(
                input.actor.character.getCombatStats(),
                getEffectiveStatsForEnemy(target),
                input.getTileAt(targetTile),
                { isRanged }
            );
            const dirBonus = CombatFormulas.getDirectionalMultiplier(
                input.actor.entity.gridX,
                input.actor.entity.gridY,
                target.gridX,
                target.gridY,
                target.facing
            );
            if (!damageResult.isMiss) {
                damageResult.damage = Math.max(1, Math.floor(damageResult.damage * dirBonus.multiplier));
                if (input.profile.damageMultiplier !== undefined) {
                    damageResult.damage = Math.max(1, Math.floor(damageResult.damage * input.profile.damageMultiplier));
                }
            }

            if (damageResult.isMiss) {
                this.schedulePresentation(COMBAT_IMPACT_DELAY_SECONDS, () => {
                    this.sink.spawnDamage(target.gridX, target.gridY, 0, false, true);
                    AudioManager.playSfx('sfx.miss', { volume: 0.7, rate: 0.03 });
                });
                this.sink.log(formatT('field.combat.missChance', {
                    source: input.actor.character.name,
                    target: target.name,
                    chance: Math.floor(damageResult.hitChance ?? 0),
                }));
                continue;
            }

            const guarded = applyGuardToDamage(target.statuses, damageResult.damage);
            target.statuses = guarded.statuses;
            const dealtDamage = guarded.damage;
            const dead = target.takeDamage(dealtDamage);
            this.scheduleImpact(start, target, COMBAT_IMPACT_DELAY_SECONDS, () => {
                this.sink.spawnDamage(target.gridX, target.gridY, dealtDamage, damageResult.isCrit, false);
                this.sink.spawnHitEffect(target.gridX, target.gridY, damageResult.isCrit, feedbackGroupId);
                AudioManager.playSfx(damageResult.isCrit ? 'sfx.crit' : 'sfx.hit_flesh', {
                    volume: damageResult.isCrit ? 0.72 : 0.62,
                    rate: 0.04,
                });
            });
            const critText = damageResult.isCrit ? t('field.combat.critSuffix') : '';
            const dirText = dirBonus.label ? ` ${dirBonus.label}` : '';
            this.sink.log(formatT('field.combat.physicalDamage', {
                source: input.actor.character.name,
                target: target.name,
                damage: dealtDamage,
                crit: critText,
                direction: dirText,
            }));
            if (guarded.guarded) this.sink.log(formatT('field.combat.guardReduced', { target: target.name }));
            this.logPhysicalTerrainEffect(damageResult);

            if (dead) {
                this.handleEnemyDefeated(
                    input.actor,
                    target,
                    result,
                    feedbackGroupId,
                    COMBAT_IMPACT_DELAY_SECONDS,
                );
            } else if (!counterTarget && dealtDamage > 0) {
                counterTarget = target;
            }
        }

        this.logBrokenEquipment(input.actor.character.name, damageEquippedWeapon(input.actor.character));
        this.scheduleFeedbackFlush(feedbackGroupId, COMBAT_IMPACT_DELAY_SECONDS);
        if (counterTarget) mergeCombatResult(result, input.tryEnemyCounterAttack(counterTarget, input.actor));
        return result;
    }

    public enemyAttack(input: EnemyAttackInput): CombatResult {
        const result = createCombatResult(true);
        const enemy = input.enemy;
        const actor = input.actor;
        const damageResult = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(enemy),
            getEffectiveStatsForCharacter(actor.character),
            input.getTileAt(actorTile(actor)),
            { defenderTraits: input.getActorTerrainTraits(actor), isRanged: input.range > 1 }
        );
        enemy.actionGauge = 0;
        enemy.facing = input.directionFromTo(enemyTile(enemy), actorTile(actor));
        const start = enemyTile(enemy);
        this.beginAttackPresentation(
            enemy,
            start,
            actorTile(actor),
            enemy.isBoss ? '#ff4ea3' : '#ff8a55',
            0,
            enemy.isBoss ? 0.78 : 0.68,
        );

        if (damageResult.isMiss) {
            this.schedulePresentation(COMBAT_IMPACT_DELAY_SECONDS, () => {
                this.sink.spawnDamage(actor.entity.gridX, actor.entity.gridY, 0, false, true);
                AudioManager.playSfx('sfx.miss', { volume: 0.7, rate: 0.03 });
            });
            this.sink.log(formatT('field.combat.missChance', {
                source: enemy.name,
                target: actor.character.name,
                chance: Math.floor(damageResult.hitChance ?? 0),
            }));
            return result;
        }

        const executionerDamage = applyExecutionerDamage(
            damageResult.damage,
            enemy.eliteAffixes,
            actor.character.stats.hp,
            actor.character.stats.maxHp,
        );
        const guarded = applyGuardToDamage(actor.character.statuses, executionerDamage);
        actor.character.statuses = guarded.statuses;
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - guarded.damage);
        this.scheduleImpact(start, actor.entity, COMBAT_IMPACT_DELAY_SECONDS, () => {
            this.sink.spawnDamage(actor.entity.gridX, actor.entity.gridY, guarded.damage, damageResult.isCrit, false);
            this.sink.spawnHitEffect(actor.entity.gridX, actor.entity.gridY, damageResult.isCrit, input.feedbackGroupId);
            AudioManager.playSfx(damageResult.isCrit ? 'sfx.crit' : 'sfx.hit_flesh', {
                volume: damageResult.isCrit ? 0.72 : 0.62,
                rate: 0.04,
            });
        });
        this.sink.log(formatT('field.combat.physicalDamage', {
            source: enemy.name,
            target: actor.character.name,
            damage: guarded.damage,
            crit: damageResult.isCrit ? t('field.combat.critSuffix') : '',
            direction: '',
        }));
        if (guarded.guarded) this.sink.log(formatT('field.combat.guardReduced', { target: actor.character.name }));
        this.logPhysicalTerrainEffect(damageResult);
        if (guarded.damage > 0) this.logBrokenEquipment(actor.character.name, damageDefensiveEquipment(actor.character));

        if (guarded.damage > 0) mergeCombatResult(result, input.tryActorCounterAttack(actor, enemy));
        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            actor.entity.holdDefeatedPresentation();
            this.schedulePresentation(COMBAT_IMPACT_DELAY_SECONDS, () => {
                actor.entity.releaseDefeatedPresentation();
            });
            result.downedCharacterIds.push(actor.character.id);
            return result;
        }
        return result;
    }

    public tryActorCounterAttack(input: ActorCounterAttackInput): CombatResult {
        const result = createCombatResult(false);
        const ready = getStatus(input.actor.character.statuses, 'counterReady');
        if (!ready) return result;
        if (input.actor.character.isDead || input.actor.character.stats.hp <= 0 || input.enemy.stats.hp <= 0) return result;
        if (!input.canActorAttackTarget(input.actor, input.enemy)) {
            this.sink.log(formatT('field.combat.counterOutOfRange', { source: input.actor.character.name }));
            return result;
        }

        const consumed = consumeStatus(input.actor.character.statuses, 'counterReady');
        if (!consumed.consumed) return result;
        result.executed = true;
        input.actor.character.statuses = consumed.statuses;
        const start = actorTile(input.actor);
        this.beginAttackPresentation(
            input.actor.entity,
            start,
            enemyTile(input.enemy),
            '#9ff6ff',
            COMBAT_COUNTER_START_DELAY_SECONDS,
            0.64,
        );

        const damageResult = CombatFormulas.calcPhysicalDamage(
            input.actor.character.getCombatStats(),
            getEffectiveStatsForEnemy(input.enemy),
            input.getTileAt(enemyTile(input.enemy)),
            { isRanged: manhattan(actorTile(input.actor), enemyTile(input.enemy)) > 1 }
        );
        this.logBrokenEquipment(input.actor.character.name, damageEquippedWeapon(input.actor.character));
        if (damageResult.isMiss) {
            this.schedulePresentation(COMBAT_COUNTER_IMPACT_DELAY_SECONDS, () => {
                this.sink.spawnDamage(input.enemy.gridX, input.enemy.gridY, 0, false, true);
                AudioManager.playSfx('sfx.miss', { volume: 0.65, rate: 0.03 });
            });
            this.sink.log(formatT('field.combat.counterMissTarget', {
                source: input.actor.character.name,
                target: input.enemy.name,
            }));
            return result;
        }

        const damage = Math.max(1, Math.floor(damageResult.damage * (consumed.consumed.magnitude || 0.5)));
        const dead = input.enemy.takeDamage(damage);
        const feedbackGroupId = createFeedbackGroupId('actorCounter');
        this.scheduleImpact(start, input.enemy, COMBAT_COUNTER_IMPACT_DELAY_SECONDS, () => {
            this.sink.spawnDamage(input.enemy.gridX, input.enemy.gridY, damage, damageResult.isCrit, false);
            this.sink.spawnHitEffect(
                input.enemy.gridX,
                input.enemy.gridY,
                damageResult.isCrit,
                feedbackGroupId,
                damageResult.isCrit ? 'critical' : 'counter',
            );
            AudioManager.playSfx(damageResult.isCrit ? 'sfx.crit' : 'sfx.hit_flesh', {
                volume: damageResult.isCrit ? 0.68 : 0.58,
                rate: 0.04,
            });
        });
        this.sink.log(formatT('field.combat.counterDamage', {
            source: input.actor.character.name,
            target: input.enemy.name,
            damage,
        }));
        if (dead) {
            this.handleEnemyDefeated(
                input.actor,
                input.enemy,
                result,
                feedbackGroupId,
                COMBAT_COUNTER_IMPACT_DELAY_SECONDS,
            );
        }
        this.scheduleFeedbackFlush(feedbackGroupId, COMBAT_COUNTER_IMPACT_DELAY_SECONDS);
        return result;
    }

    public tryEnemyCounterAttack(input: EnemyCounterAttackInput): CombatResult {
        const result = createCombatResult(false);
        const ready = getStatus(input.enemy.statuses, 'counterReady');
        if (!ready) return result;
        if (input.enemy.stats.hp <= 0 || input.actor.character.isDead || input.actor.character.stats.hp <= 0) return result;
        if (manhattan(enemyTile(input.enemy), actorTile(input.actor)) > 1) {
            this.sink.log(formatT('field.combat.counterOutOfRange', { source: input.enemy.name }));
            return result;
        }

        const consumed = consumeStatus(input.enemy.statuses, 'counterReady');
        if (!consumed.consumed) return result;
        result.executed = true;
        input.enemy.statuses = consumed.statuses;
        const start = enemyTile(input.enemy);
        this.beginAttackPresentation(
            input.enemy,
            start,
            actorTile(input.actor),
            '#ff9b66',
            COMBAT_COUNTER_START_DELAY_SECONDS,
            0.64,
        );

        const damageResult = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(input.enemy),
            getEffectiveStatsForCharacter(input.actor.character),
            input.getTileAt(actorTile(input.actor)),
            { defenderTraits: input.getActorTerrainTraits(input.actor) }
        );
        if (damageResult.isMiss) {
            this.schedulePresentation(COMBAT_COUNTER_IMPACT_DELAY_SECONDS, () => {
                this.sink.spawnDamage(input.actor.entity.gridX, input.actor.entity.gridY, 0, false, true);
                AudioManager.playSfx('sfx.miss', { volume: 0.65, rate: 0.03 });
            });
            this.sink.log(formatT('field.combat.counterMiss', { source: input.enemy.name }));
            return result;
        }

        const baseDamage = Math.max(1, Math.floor(damageResult.damage * (consumed.consumed.magnitude || 0.5)));
        const guarded = applyGuardToDamage(input.actor.character.statuses, baseDamage);
        input.actor.character.statuses = guarded.statuses;
        const damage = guarded.damage;
        input.actor.character.stats.hp = Math.max(0, input.actor.character.stats.hp - damage);
        const feedbackGroupId = createFeedbackGroupId('enemyCounter');
        this.scheduleImpact(start, input.actor.entity, COMBAT_COUNTER_IMPACT_DELAY_SECONDS, () => {
            this.sink.spawnDamage(input.actor.entity.gridX, input.actor.entity.gridY, damage, damageResult.isCrit, false);
            this.sink.spawnHitEffect(
                input.actor.entity.gridX,
                input.actor.entity.gridY,
                damageResult.isCrit,
                feedbackGroupId,
                damageResult.isCrit ? 'critical' : 'counter',
            );
            AudioManager.playSfx(damageResult.isCrit ? 'sfx.crit' : 'sfx.hit_flesh', {
                volume: damageResult.isCrit ? 0.68 : 0.58,
                rate: 0.04,
            });
        });
        this.sink.log(formatT('field.combat.counterDamage', {
            source: input.enemy.name,
            target: input.actor.character.name,
            damage,
        }));
        if (damage > 0) this.logBrokenEquipment(input.actor.character.name, damageDefensiveEquipment(input.actor.character));
        if (input.actor.character.stats.hp <= 0 && !input.actor.character.isDead) {
            input.actor.entity.holdDefeatedPresentation();
            this.schedulePresentation(COMBAT_COUNTER_IMPACT_DELAY_SECONDS, () => {
                input.actor.entity.releaseDefeatedPresentation();
            });
            result.downedCharacterIds.push(input.actor.character.id);
        }
        this.scheduleFeedbackFlush(feedbackGroupId, COMBAT_COUNTER_IMPACT_DELAY_SECONDS);
        return result;
    }

    private handleEnemyDefeated(
        actor: FieldActor,
        enemy: Enemy,
        result: CombatResult,
        feedbackGroupId?: string,
        presentationDelay: number = 0,
    ): void {
        result.killedEnemyIds.push(enemy.id);
        if (this.sink.awardExp) this.sink.awardExp(actor, enemy);
        else {
            const exp = enemy.calcExpFor(actor.character.level);
            this.sink.log(formatT('field.log.enemyDefeatedExp', { enemy: enemy.name, exp }));
            actor.character.gainExp(exp);
        }
        enemy.holdDefeatedPresentation();
        this.schedulePresentation(presentationDelay, () => {
            this.sink.spawnKillEffect(enemy, feedbackGroupId, actor);
            this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
            enemy.releaseDefeatedPresentation();
        });
        enemy.isAggro = false;
        this.sink.spawnLoot(enemy);
        this.sink.onEnemyDefeated?.(enemy);
    }

    private beginAttackPresentation(
        attacker: Entity,
        from: TilePoint,
        to: TilePoint,
        color: string,
        delaySeconds: number,
        swingVolume: number,
    ): void {
        this.schedulePresentation(delaySeconds, () => {
            attacker.faceToward(to.x, to.y);
            attacker.playActionMotion('attack', COMBAT_ATTACK_RECOVERY_SECONDS, 10);
            this.sink.spawnAttackCue(from, to, color);
            AudioManager.playSfx('sfx.swing', { volume: swingVolume, rate: 0.04 });
        });
        this.schedulePresentation(delaySeconds + COMBAT_ATTACK_RECOVERY_SECONDS, () => undefined);
    }

    private scheduleImpact(
        source: TilePoint,
        target: Entity,
        delaySeconds: number,
        action: () => void,
    ): void {
        this.schedulePresentation(delaySeconds, () => {
            target.playHitReaction(source.x, source.y);
            action();
        });
    }

    private scheduleFeedbackFlush(feedbackGroupId: string, impactDelaySeconds: number): void {
        this.schedulePresentation(impactDelaySeconds + COMBAT_FEEDBACK_FLUSH_EPSILON_SECONDS, () => {
            this.sink.flushFeedbackGroup?.(feedbackGroupId);
        });
    }

    private schedulePresentation(delaySeconds: number, action: () => void): void {
        if (this.sink.schedulePresentation) {
            this.sink.schedulePresentation(delaySeconds, action);
            return;
        }
        action();
    }

    private logPhysicalTerrainEffect(result: { terrainMultiplier?: number; hitChance?: number }): void {
        const notes: string[] = [];
        if (result.terrainMultiplier !== undefined && result.terrainMultiplier < 0.999) {
            notes.push(formatT('field.combat.terrainDamageReduction', {
                percent: Math.round((1 - result.terrainMultiplier) * 100),
            }));
        }
        if (notes.length > 0) this.sink.log(formatT('field.combat.terrainEffect', { notes: notes.join(', ') }));
    }

    private logBrokenEquipment(characterName: string, placed: PlacedItem | null): void {
        if (placed?.durability === 0) {
            this.sink.log(formatT('field.combat.equipmentBroken', { name: characterName, item: formatItemName(placed.item) }));
        }
    }
}

function createFeedbackGroupId(prefix: string): string {
    return `${prefix}:${nextFeedbackGroupId++}`;
}

export function createCombatResult(executed: boolean = false): CombatResult {
    return {
        executed,
        killedEnemyIds: [],
        downedCharacterIds: [],
    };
}

export function mergeCombatResult(target: CombatResult, source: CombatResult): CombatResult {
    target.executed = target.executed || source.executed;
    target.killedEnemyIds.push(...source.killedEnemyIds);
    target.downedCharacterIds.push(...source.downedCharacterIds);
    return target;
}

function actorTile(actor: FieldActor): TilePoint {
    return { x: actor.entity.gridX, y: actor.entity.gridY };
}

function enemyTile(enemy: Enemy): TilePoint {
    return { x: enemy.gridX, y: enemy.gridY };
}
