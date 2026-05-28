import { CombatFormulas } from '../../combat/CombatFormulas';
import {
    applyGuardToDamage,
    consumeStatus,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
} from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { TileType } from '../../map/Tile';
import type { AttackPatternProfile } from '../../field/TargetPatterns';
import type { TerrainActorTraits } from '../../field/TerrainRules';
import { manhattan, type TilePoint } from '../../field/FieldPathing';
import type { FieldActor } from '../../field/FieldTypes';

export interface CombatResult {
    executed: boolean;
    killedEnemyIds: string[];
    downedCharacterIds: string[];
}

export interface CombatEventSink {
    log(message: string): void;
    spawnDamage(x: number, y: number, amount: number, isCrit: boolean, isMiss: boolean): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHitEffect(x: number, y: number, isCrit: boolean): void;
    spawnKillEffect(enemy: Enemy): void;
    spawnAttackCue(from: TilePoint, to: TilePoint, color: string, label?: string): void;
    spawnLoot(enemy: Enemy): void;
    awardExp?(actor: FieldActor, enemy: Enemy): void;
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
        if (input.actor.entity.actionGauge < 100 || input.targetEnemies.length === 0) return result;

        result.executed = true;
        input.actor.entity.facing = input.directionFromTo(start, enemyTile(input.selectedEnemy));
        this.sink.spawnAttackCue(start, enemyTile(input.selectedEnemy), '#72e8ff');

        let counterTriggered = false;
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
                this.sink.spawnDamage(target.gridX, target.gridY, 0, false, true);
                this.sink.log(`${input.actor.character.name} 명중 실패: ${target.name} (${Math.floor(damageResult.hitChance ?? 0)}%)`);
                continue;
            }

            const guarded = applyGuardToDamage(target.statuses, damageResult.damage);
            target.statuses = guarded.statuses;
            const dealtDamage = guarded.damage;
            const dead = target.takeDamage(dealtDamage);
            this.sink.spawnDamage(target.gridX, target.gridY, dealtDamage, damageResult.isCrit, false);
            this.sink.spawnHitEffect(target.gridX, target.gridY, damageResult.isCrit);
            const critText = damageResult.isCrit ? ' 치명' : '';
            const dirText = dirBonus.label ? ` ${dirBonus.label}` : '';
            this.sink.log(`${input.actor.character.name} → ${target.name} ${dealtDamage} 피해${critText}${dirText}`);
            if (guarded.guarded) this.sink.log(`${target.name} 방어: 피해 감소`);
            this.logPhysicalTerrainEffect(damageResult);

            if (dead) {
                this.handleEnemyDefeated(input.actor, target, result);
            } else if (!guarded.guarded && !counterTriggered) {
                mergeCombatResult(result, input.tryEnemyCounterAttack(target, input.actor));
                counterTriggered = true;
            }
        }

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
        this.sink.spawnAttackCue(enemyTile(enemy), actorTile(actor), enemy.isBoss ? '#ff4ea3' : '#ff8a55');

        if (damageResult.isMiss) {
            this.sink.spawnDamage(actor.entity.gridX, actor.entity.gridY, 0, false, true);
            this.sink.log(`${enemy.name} 명중 실패: ${actor.character.name} (${Math.floor(damageResult.hitChance ?? 0)}%)`);
            return result;
        }

        const guarded = applyGuardToDamage(actor.character.statuses, damageResult.damage);
        actor.character.statuses = guarded.statuses;
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - guarded.damage);
        this.sink.spawnDamage(actor.entity.gridX, actor.entity.gridY, guarded.damage, damageResult.isCrit, false);
        this.sink.spawnHitEffect(actor.entity.gridX, actor.entity.gridY, damageResult.isCrit);
        this.sink.log(`${enemy.name} → ${actor.character.name} ${guarded.damage} 피해${damageResult.isCrit ? ' 치명' : ''}`);
        if (guarded.guarded) this.sink.log(`${actor.character.name} 방어: 피해 감소`);
        this.logPhysicalTerrainEffect(damageResult);

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            result.downedCharacterIds.push(actor.character.id);
            return result;
        }
        if (!guarded.guarded) mergeCombatResult(result, input.tryActorCounterAttack(actor, enemy));
        return result;
    }

    public tryActorCounterAttack(input: ActorCounterAttackInput): CombatResult {
        const result = createCombatResult(false);
        const consumed = consumeStatus(input.actor.character.statuses, 'counterReady');
        if (!consumed.consumed) return result;
        result.executed = true;
        input.actor.character.statuses = consumed.statuses;
        if (input.actor.character.isDead || input.actor.character.stats.hp <= 0 || input.enemy.stats.hp <= 0) return result;
        if (!input.canActorAttackTarget(input.actor, input.enemy)) {
            this.sink.log(`${input.actor.character.name} 반격 실패: 사거리 밖`);
            return result;
        }

        const damageResult = CombatFormulas.calcPhysicalDamage(
            input.actor.character.getCombatStats(),
            getEffectiveStatsForEnemy(input.enemy),
            input.getTileAt(enemyTile(input.enemy)),
            { isRanged: manhattan(actorTile(input.actor), enemyTile(input.enemy)) > 1 }
        );
        if (damageResult.isMiss) {
            this.sink.spawnDamage(input.enemy.gridX, input.enemy.gridY, 0, false, true);
            this.sink.log(`${input.actor.character.name} 반격 빗나감: ${input.enemy.name}`);
            return result;
        }

        const damage = Math.max(1, Math.floor(damageResult.damage * (consumed.consumed.magnitude || 0.75)));
        const dead = input.enemy.takeDamage(damage);
        this.sink.spawnAttackCue(actorTile(input.actor), enemyTile(input.enemy), '#9ff6ff');
        this.sink.spawnDamage(input.enemy.gridX, input.enemy.gridY, damage, damageResult.isCrit, false);
        this.sink.spawnHitEffect(input.enemy.gridX, input.enemy.gridY, damageResult.isCrit);
        this.sink.log(`${input.actor.character.name} 반격 → ${input.enemy.name} ${damage} 피해`);
        if (dead) this.handleEnemyDefeated(input.actor, input.enemy, result);
        return result;
    }

    public tryEnemyCounterAttack(input: EnemyCounterAttackInput): CombatResult {
        const result = createCombatResult(false);
        const consumed = consumeStatus(input.enemy.statuses, 'counterReady');
        if (!consumed.consumed) return result;
        result.executed = true;
        input.enemy.statuses = consumed.statuses;
        if (input.enemy.stats.hp <= 0 || input.actor.character.isDead || input.actor.character.stats.hp <= 0) return result;
        if (manhattan(enemyTile(input.enemy), actorTile(input.actor)) > 1) {
            this.sink.log(`${input.enemy.name} 반격 실패: 사거리 밖`);
            return result;
        }

        const damageResult = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(input.enemy),
            getEffectiveStatsForCharacter(input.actor.character),
            input.getTileAt(actorTile(input.actor)),
            { defenderTraits: input.getActorTerrainTraits(input.actor) }
        );
        if (damageResult.isMiss) {
            this.sink.spawnDamage(input.actor.entity.gridX, input.actor.entity.gridY, 0, false, true);
            this.sink.log(`${input.enemy.name} 반격 빗나감`);
            return result;
        }

        const baseDamage = Math.max(1, Math.floor(damageResult.damage * (consumed.consumed.magnitude || 0.75)));
        const guarded = applyGuardToDamage(input.actor.character.statuses, baseDamage);
        input.actor.character.statuses = guarded.statuses;
        const damage = guarded.damage;
        input.actor.character.stats.hp = Math.max(0, input.actor.character.stats.hp - damage);
        this.sink.spawnAttackCue(enemyTile(input.enemy), actorTile(input.actor), '#ff9b66');
        this.sink.spawnDamage(input.actor.entity.gridX, input.actor.entity.gridY, damage, damageResult.isCrit, false);
        this.sink.spawnHitEffect(input.actor.entity.gridX, input.actor.entity.gridY, damageResult.isCrit);
        this.sink.log(`${input.enemy.name} 반격 → ${input.actor.character.name} ${damage} 피해`);
        if (input.actor.character.stats.hp <= 0 && !input.actor.character.isDead) result.downedCharacterIds.push(input.actor.character.id);
        return result;
    }

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy, result: CombatResult): void {
        result.killedEnemyIds.push(enemy.id);
        if (this.sink.awardExp) this.sink.awardExp(actor, enemy);
        else {
            this.sink.log(`${enemy.name} 처치! +${enemy.expReward} EXP`);
            actor.character.gainExp(enemy.expReward);
        }
        this.sink.spawnKillEffect(enemy);
        this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
        enemy.isAggro = false;
        this.sink.spawnLoot(enemy);
    }

    private logPhysicalTerrainEffect(result: { terrainMultiplier?: number; hitChance?: number }): void {
        const notes: string[] = [];
        if (result.terrainMultiplier !== undefined && result.terrainMultiplier < 0.999) {
            notes.push(`피해 -${Math.round((1 - result.terrainMultiplier) * 100)}%`);
        }
        if (notes.length > 0) this.sink.log(`지형 효과: ${notes.join(', ')}`);
    }
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
