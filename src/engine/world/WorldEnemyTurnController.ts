import {
    applyGuardToDamage,
    applyStatus,
    createStatus,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    hasStatus,
    type StatusKind,
} from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { TileType } from '../../map/Tile';
import { ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, ENEMY_LEASH_RANGE } from '../../field/FieldConfig';
import { resolveAggroState } from '../../field/FieldCombat';
import {
    decideEnemyAction,
    type BossPattern,
    type EnemyAIDecision,
    type EnemyAIUnit,
} from '../../field/EnemyAI';
import { manhattan, type TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TerrainActorTraits } from '../../field/TerrainRules';
import { formatT } from '../../i18n/LanguageManager';
import {
    type CombatResult,
    WorldCombatController,
    createCombatResult,
    mergeCombatResult,
} from './WorldCombatController';
import { WorldMovementController, isEntityMoving } from './WorldMovementController';

export type EnemySpellElement = 'dark' | 'fire' | 'ice' | 'lightning' | 'wind' | 'earth';

export interface WorldEnemyEventSink {
    log(message: string): void;
    spawnDamage(x: number, y: number, amount: number, isCrit: boolean, isMiss: boolean): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnHealEffect(x: number, y: number): void;
    spawnBuffEffect(x: number, y: number): void;
    spawnDebuffEffect(x: number, y: number): void;
    spawnDarkEffect(x: number, y: number): void;
    spawnElementEffect(element: EnemySpellElement, x: number, y: number, feedbackGroupId?: string): void;
    spawnAttackCue(from: TilePoint, to: TilePoint, color: string, label?: string): void;
    beginFeedbackGroup?(): string;
    flushFeedbackGroup?(feedbackGroupId: string): void;
}

export interface WorldEnemyTurnContext {
    getPartyActors: () => FieldActor[];
    getFieldEnemies: () => FieldEnemy[];
    getActorById: (actorId: string) => FieldActor | null;
    getEnemyById: (enemyId: string) => Enemy | null;
    getTileAt: (tile: TilePoint) => TileType;
    getActorTerrainTraits: (actor: FieldActor) => TerrainActorTraits;
    canEnemyAttackTarget: (enemy: Enemy, actor: FieldActor, range: number) => boolean;
    canActorAttackTarget: (actor: FieldActor, enemy: Enemy) => boolean;
    hasFieldLineOfSight: (from: TilePoint, to: TilePoint) => boolean;
    directionFromTo: (from: TilePoint, to: TilePoint) => 'up' | 'down' | 'left' | 'right';
}

export class WorldEnemyTurnController {
    private readonly context: WorldEnemyTurnContext;
    private readonly movement: WorldMovementController;
    private readonly combat: WorldCombatController;
    private readonly sink: WorldEnemyEventSink;

    constructor(
        context: WorldEnemyTurnContext,
        movement: WorldMovementController,
        combat: WorldCombatController,
        sink: WorldEnemyEventSink
    ) {
        this.context = context;
        this.movement = movement;
        this.combat = combat;
        this.sink = sink;
    }

    public beginEnemyTurn(entry: FieldEnemy): CombatResult {
        const result = createCombatResult(false);
        const decision = this.prepareEnemyTurnDecision(entry);
        if (!decision) return result;

        return this.executeEnemyDecision(entry, decision);
    }

    public previewEnemyIntent(entry: FieldEnemy): EnemyAIDecision | null {
        const enemy = entry.enemy;
        if (enemy.stats.hp <= 0 || isEntityMoving(enemy)) return null;
        const aliveActors = this.context.getPartyActors().filter((actor) => !actor.character.isDead);
        const closest = this.movement.findClosestActor(this.enemyTile(enemy), aliveActors);
        if (!closest) return null;

        if (!this.resolveEnemyAggro(entry, closest, false)) return null;

        return this.decideEnemyIntent(entry, aliveActors, enemy.aiMemory.turnCount + 1);
    }

    private prepareEnemyTurnDecision(entry: FieldEnemy): EnemyAIDecision | null {
        const enemy = entry.enemy;
        const aliveActors = this.context.getPartyActors().filter((actor) => !actor.character.isDead);
        const closest = this.movement.findClosestActor(this.enemyTile(enemy), aliveActors);
        if (!closest) return null;
        if (!this.resolveEnemyAggro(entry, closest, true) || isEntityMoving(enemy)) {
            entry.previewIntent = null;
            return null;
        }

        enemy.aiMemory.turnCount += 1;
        const preview = entry.previewIntent;
        entry.previewIntent = null;
        if (preview && this.isPreviewStillValid(preview)) return preview;

        return this.decideEnemyIntent(entry, aliveActors, enemy.aiMemory.turnCount);
    }

    private decideEnemyIntent(entry: FieldEnemy, aliveActors: FieldActor[], turnCount: number): EnemyAIDecision {
        const enemy = entry.enemy;
        return decideEnemyAction({
            self: this.toEnemyAIUnit(enemy),
            targets: aliveActors.map((actor) => this.toActorAIUnit(actor)),
            allies: this.context.getFieldEnemies()
                .map((candidate) => candidate.enemy)
                .filter((candidate) => candidate.stats.hp > 0)
                .map((candidate) => this.toEnemyAIUnit(candidate)),
            profile: enemy.aiProfile,
            turnCount,
            hasLineOfSight: (from, to) => this.context.hasFieldLineOfSight(from, to),
        });
    }

    private resolveEnemyAggro(entry: FieldEnemy, closest: FieldActor, mutate: boolean): boolean {
        const enemy = entry.enemy;
        const enemyTile = this.enemyTile(enemy);
        const distanceToTarget = manhattan(enemyTile, this.actorTile(closest));
        const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
        let isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, leashExceeded);
        if (!isAggro && this.movement.hasAggroAllyNear(entry, enemy.aiProfile.assistRange)) isAggro = true;
        if (mutate) enemy.isAggro = isAggro;
        return isAggro;
    }

    private isPreviewStillValid(decision: EnemyAIDecision): boolean {
        switch (decision.kind) {
            case 'attack':
            case 'moveToward':
            case 'moveAway':
            case 'debuffTarget':
            case 'bossPattern':
                return this.context.getActorById(decision.targetId) !== null;
            case 'healAlly':
            case 'buffAlly': {
                const ally = this.context.getEnemyById(decision.allyId);
                return Boolean(ally && ally.stats.hp > 0);
            }
            case 'guard':
            case 'wait':
                return true;
        }
    }

    public executeEnemyDecision(entry: FieldEnemy, decision: EnemyAIDecision): CombatResult {
        const result = createCombatResult(false);
        const enemy = entry.enemy;
        switch (decision.kind) {
            case 'attack': {
                const actor = this.context.getActorById(decision.targetId);
                if (!actor) return result;
                if (this.context.canEnemyAttackTarget(enemy, actor, decision.range)) {
                    mergeCombatResult(result, this.enemyAttack(enemy, actor, decision.range));
                } else if (!hasStatus(enemy.statuses, 'immobilize')) {
                    this.movement.enemyStepToward(entry, actor, Math.max(1, Math.min(decision.range, enemy.aiProfile.preferredRange)));
                }
                return result;
            }
            case 'moveToward': {
                const actor = this.context.getActorById(decision.targetId);
                if (!actor) return result;
                if (this.enemyIsImmobilized(enemy)) return result;
                this.movement.enemyStepToward(entry, actor, decision.desiredRange);
                return result;
            }
            case 'moveAway': {
                const actor = this.context.getActorById(decision.targetId);
                if (!actor) return result;
                if (this.enemyIsImmobilized(enemy)) return result;
                if (!this.movement.enemyStepAway(entry, actor) && this.context.canEnemyAttackTarget(enemy, actor, enemy.aiProfile.attackRange)) {
                    mergeCombatResult(result, this.enemyAttack(enemy, actor, enemy.aiProfile.attackRange));
                }
                return result;
            }
            case 'healAlly': {
                const ally = this.context.getEnemyById(decision.allyId);
                if (ally) this.enemyHealAlly(enemy, ally);
                return result;
            }
            case 'buffAlly': {
                const ally = this.context.getEnemyById(decision.allyId);
                if (ally) this.enemyBuffAlly(enemy, ally, decision.status);
                return result;
            }
            case 'debuffTarget': {
                const actor = this.context.getActorById(decision.targetId);
                if (actor) this.enemyDebuffActor(enemy, actor, decision.status);
                return result;
            }
            case 'guard':
                enemy.statuses = applyStatus(enemy.statuses, createStatus('guard'));
                this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'GUARD');
                this.sink.spawnBuffEffect(enemy.gridX, enemy.gridY);
                this.logEnemy('field.enemyLog.guard', { enemy: enemy.name });
                return result;
            case 'bossPattern':
                return this.executeBossPattern(entry, decision.pattern, decision.targetId);
            case 'wait':
                this.logEnemy('field.enemyLog.wait', { enemy: enemy.name });
                return result;
        }
    }

    private enemyAttack(enemy: Enemy, actor: FieldActor, range: number, feedbackGroupId?: string): CombatResult {
        return this.combat.enemyAttack({
            enemy,
            actor,
            range,
            feedbackGroupId,
            getTileAt: (tile) => this.context.getTileAt(tile),
            getActorTerrainTraits: (targetActor) => this.context.getActorTerrainTraits(targetActor),
            directionFromTo: (from, to) => this.context.directionFromTo(from, to),
            tryActorCounterAttack: (counterActor, counterEnemy) => this.combat.tryActorCounterAttack({
                actor: counterActor,
                enemy: counterEnemy,
                canActorAttackTarget: (targetActor, targetEnemy) => this.context.canActorAttackTarget(targetActor, targetEnemy),
                getTileAt: (tile) => this.context.getTileAt(tile),
            }),
        });
    }

    private enemyIsImmobilized(enemy: Enemy): boolean {
        if (!hasStatus(enemy.statuses, 'immobilize')) return false;
        this.logEnemy('field.enemyLog.immobilized', { enemy: enemy.name });
        this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'ROOT');
        return true;
    }

    private enemyHealAlly(caster: Enemy, ally: Enemy): void {
        const stats = getEffectiveStatsForEnemy(caster);
        const amount = Math.max(8, Math.floor(stats.magAtk * 2 + caster.level * 2));
        const before = ally.stats.hp;
        ally.stats.hp = Math.min(ally.stats.maxHp, ally.stats.hp + amount);
        const healed = ally.stats.hp - before;
        if (healed <= 0) return;
        this.sink.spawnHeal(ally.gridX, ally.gridY, healed);
        this.sink.spawnHealEffect(ally.gridX, ally.gridY);
        this.logEnemy('field.enemyLog.healAlly', { caster: caster.name, ally: ally.name, amount: healed });
    }

    private enemyBuffAlly(caster: Enemy, ally: Enemy, status: StatusKind): void {
        ally.statuses = applyStatus(ally.statuses, createStatus(status));
        this.sink.spawnStatus(ally.gridX, ally.gridY, 'BUFF');
        this.sink.spawnBuffEffect(ally.gridX, ally.gridY);
        this.logEnemy('field.enemyLog.buffAlly', { caster: caster.name, ally: ally.name });
    }

    private enemyDebuffActor(caster: Enemy, actor: FieldActor, status: StatusKind): void {
        actor.character.statuses = applyStatus(actor.character.statuses, createStatus(status));
        this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'WEAK');
        this.sink.spawnDebuffEffect(actor.entity.gridX, actor.entity.gridY);
        this.logEnemy('field.enemyLog.debuffTarget', { caster: caster.name, target: actor.character.name });
    }

    private executeBossPattern(entry: FieldEnemy, pattern: BossPattern, targetId: string): CombatResult {
        const result = createCombatResult(false);
        const enemy = entry.enemy;
        const target = this.context.getActorById(targetId);
        if (!target) return result;

        switch (pattern) {
            case 'enrage':
                enemy.statuses = applyStatus(enemy.statuses, createStatus('allUp', { durationTurns: 4, magnitude: 1.3 }));
                this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'ENRAGE');
                this.sink.spawnDarkEffect(enemy.gridX, enemy.gridY);
                this.logEnemy('field.enemyLog.enrage', { enemy: enemy.name });
                return result;
            case 'darkPulse': {
                this.sink.spawnDarkEffect(enemy.gridX, enemy.gridY);
                const victims = this.context.getPartyActors().filter((actor) =>
                    !actor.character.isDead && manhattan(this.enemyTile(enemy), this.actorTile(actor)) <= 2
                );
                if (victims.length === 0) {
                    this.movement.enemyStepToward(entry, target, 2);
                    return result;
                }
                this.logEnemy('field.enemyLog.darkPulse', { enemy: enemy.name, count: victims.length });
                const feedbackGroupId = this.sink.beginFeedbackGroup?.();
                for (const victim of victims) mergeCombatResult(result, this.enemySpellDamage(enemy, victim, 0.7, 'dark', feedbackGroupId));
                if (feedbackGroupId) this.sink.flushFeedbackGroup?.(feedbackGroupId);
                return result;
            }
            case 'cleave': {
                const victims = this.context.getPartyActors().filter((actor) =>
                    !actor.character.isDead && manhattan(this.enemyTile(enemy), this.actorTile(actor)) <= 1
                );
                this.logEnemy('field.enemyLog.cleave', { enemy: enemy.name });
                const feedbackGroupId = this.sink.beginFeedbackGroup?.();
                for (const victim of victims) mergeCombatResult(result, this.enemyAttack(enemy, victim, 1, feedbackGroupId));
                if (feedbackGroupId) this.sink.flushFeedbackGroup?.(feedbackGroupId);
                return result;
            }
            case 'voidBolt':
                this.logEnemy('field.enemyLog.voidBolt', { enemy: enemy.name });
                this.sink.spawnAttackCue(this.enemyTile(enemy), this.actorTile(target), '#b86cff', 'BOLT');
                return this.enemySpellDamage(enemy, target, 1, 'dark');
        }
    }

    private enemySpellDamage(enemy: Enemy, actor: FieldActor, power: number, element: EnemySpellElement, feedbackGroupId?: string): CombatResult {
        const result = createCombatResult(true);
        const attacker = getEffectiveStatsForEnemy(enemy);
        const defender = getEffectiveStatsForCharacter(actor.character);
        const baseDamage = Math.max(1, Math.floor((attacker.magAtk * 1.5 - defender.magDef * 0.6) * power));
        const guarded = applyGuardToDamage(actor.character.statuses, baseDamage);
        actor.character.statuses = guarded.statuses;
        const damage = guarded.damage;
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - damage);
        this.sink.spawnElementEffect(element, actor.entity.gridX, actor.entity.gridY, damage > 0 ? feedbackGroupId : undefined);
        this.sink.spawnDamage(actor.entity.gridX, actor.entity.gridY, damage, false, false);
        this.logEnemy('field.enemyLog.spellDamage', { enemy: enemy.name, target: actor.character.name, damage });
        if (actor.character.stats.hp <= 0 && !actor.character.isDead) result.downedCharacterIds.push(actor.character.id);
        return result;
    }

    private logEnemy(key: string, vars: Record<string, string | number>): void {
        this.sink.log(formatT(key, vars));
    }

    private toEnemyAIUnit(enemy: Enemy): EnemyAIUnit {
        return {
            id: enemy.id,
            name: enemy.name,
            tile: this.enemyTile(enemy),
            hp: enemy.stats.hp,
            maxHp: enemy.stats.maxHp,
            role: enemy.role,
            isBoss: enemy.isBoss,
            isAggro: enemy.isAggro,
            statusKinds: enemy.statuses.map((status) => status.kind),
        };
    }

    private toActorAIUnit(actor: FieldActor): EnemyAIUnit {
        return {
            id: actor.id,
            name: actor.character.name,
            tile: this.actorTile(actor),
            hp: actor.character.stats.hp,
            maxHp: actor.character.stats.maxHp,
            statusKinds: actor.character.statuses.map((status) => status.kind),
        };
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }
}
