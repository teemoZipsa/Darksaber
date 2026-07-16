import {
    applyGuardToDamage,
    applyStatus,
    createStatus,
    getEffectiveStatsForEnemy,
    removeActionStanceStatusesFromCarrier,
} from '../src/combat/StatusEffects';
import { CombatFormulas } from '../src/combat/CombatFormulas';
import { decideEnemyAction, type EnemyAIDecision } from '../src/field/EnemyAI';
import { ENEMY_LEASH_RANGE } from '../src/field/FieldConfig';
import {
    findPathToAny,
    manhattan,
    tilesInRange,
    type FieldPassableQuery,
    type TilePoint,
} from '../src/field/FieldPathing';
import type { Enemy } from '../src/entity/Enemy';
import type { WorldMap } from '../src/map/WorldMap';
import type { StatusEffect } from '../src/combat/StatusEffects';
import type { CombatEventMessage } from '../src/net/WorldProtocol';
import { getTargetableActors } from './WorldSessionVisibility';
import {
    directionFromTo,
    getEffectiveServerActorStats,
    hashInt,
    toActorAIUnit,
    toEnemyAIUnit,
} from './WorldSessionHelpers';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
} from './WorldSessionTypes';
import type { WorldSessionEnemyState } from './WorldSessionEnemyState';

export interface WorldSessionEnemyTurnContext {
    players: ReadonlyMap<string, ServerPlayer>;
    actors: Map<string, ServerActor>;
    enemies: ReadonlyMap<string, ServerEnemy>;
    enemyState: WorldSessionEnemyState<ServerEnemy, ServerActor>;
    getServerTileAt: (tile: TilePoint, ownerPlayerId?: string | null) => ReturnType<WorldMap['getTileAt']>;
    isFieldPassable: (query: FieldPassableQuery) => boolean;
    hasFieldLineOfSight: (from: TilePoint, to: TilePoint, ownerPlayerId?: string) => boolean;
    onActorDown?: (actor: ServerActor, cause: 'enemy') => void;
    onCombatActivity?: (actor: ServerActor) => void;
    random?: () => number;
}

export class WorldSessionEnemyTurnResolver {
    public constructor(private readonly context: WorldSessionEnemyTurnContext) {}

    public resolveEnemyTurn(entry: ServerEnemy, now: number): CombatEventMessage[] {
        const enemy = entry.enemy;
        const targets = getTargetableActors(this.context.players, this.context.actors.values(), entry);
        const closest = this.context.enemyState.findClosestTarget(entry, targets);
        if (!closest) {
            this.wanderEnemy(entry, now);
            return [];
        }

        if (!this.context.enemyState.refreshAggro(entry, closest)) {
            this.wanderEnemy(entry, now);
            return [];
        }

        enemy.aiMemory.turnCount += 1;
        const decision = decideEnemyAction({
            self: toEnemyAIUnit(enemy),
            targets: targets.map((actor) => toActorAIUnit(actor)),
            allies: [...this.context.enemies.values()]
                .filter((candidate) => entry.scenarioPlayerId
                    ? candidate.scenarioPlayerId === entry.scenarioPlayerId
                    : !candidate.scenarioPlayerId)
                .map((candidate) => candidate.enemy)
                .filter((candidate) => candidate.stats.hp > 0)
                .map((candidate) => toEnemyAIUnit(candidate)),
            profile: enemy.aiProfile,
            turnCount: enemy.aiMemory.turnCount,
            hasLineOfSight: (from, to) => this.context.hasFieldLineOfSight(from, to, entry.scenarioPlayerId),
        });
        return this.executeEnemyDecision(entry, decision);
    }

    private executeEnemyDecision(entry: ServerEnemy, decision: EnemyAIDecision): CombatEventMessage[] {
        const enemy = entry.enemy;
        switch (decision.kind) {
            case 'attack': {
                const actor = this.context.actors.get(decision.targetId);
                if (!actor || !this.canEnemyAttack(enemy, actor, decision.range)) return [];
                return [this.resolveEnemyAttack(enemy, actor, decision.range)];
            }
            case 'moveToward': {
                const actor = this.context.actors.get(decision.targetId);
                if (actor) this.enemyStepToward(entry, actor, decision.desiredRange);
                return [];
            }
            case 'moveAway': {
                const actor = this.context.actors.get(decision.targetId);
                if (actor) this.enemyStepAway(entry, actor);
                return [];
            }
            case 'healAlly':
            case 'buffAlly':
            case 'debuffTarget':
                return [];
            case 'guard': {
                const status = createStatus('guard');
                enemy.statuses = applyStatus(enemy.statuses, status);
                return [createEnemySelfStatusEvent(enemy, status)];
            }
            case 'bossPattern': {
                const actor = this.context.actors.get(decision.targetId);
                if (!actor) return [];
                if (decision.pattern === 'enrage') {
                    const status = createStatus('allUp', { durationTurns: 4, magnitude: 1.3 });
                    enemy.statuses = applyStatus(enemy.statuses, status);
                    return [createEnemySelfStatusEvent(enemy, status)];
                }
                if (this.canEnemyAttack(enemy, actor, enemy.aiProfile.attackRange)) {
                    return [this.resolveEnemyAttack(enemy, actor, enemy.aiProfile.attackRange)];
                }
                this.enemyStepToward(entry, actor, enemy.aiProfile.preferredRange);
                return [];
            }
            case 'wait':
                return [];
        }
    }

    private resolveEnemyAttack(enemy: Enemy, actor: ServerActor, range: number): CombatEventMessage {
        this.context.onCombatActivity?.(actor);
        const result = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(enemy),
            getEffectiveServerActorStats(actor),
            this.context.getServerTileAt(actor.tile, actor.ownerPlayerId),
            {
                isRanged: range > 1,
                ...(this.context.random ? { random: this.context.random } : {}),
            }
        );
        enemy.facing = directionFromTo({ x: enemy.gridX, y: enemy.gridY }, actor.tile);
        let dealtDamage = result.damage;
        if (!result.isMiss) {
            const guarded = applyGuardToDamage(actor.statuses, result.damage);
            actor.statuses = guarded.statuses;
            dealtDamage = guarded.damage;
            actor.stats.hp = Math.max(0, actor.stats.hp - dealtDamage);
            if (dealtDamage > 0) removeActionStanceStatusesFromCarrier(actor);
            if (actor.stats.hp <= 0) {
                actor.isDead = true;
                actor.remainingAp = 0;
                actor.actionGauge = 0;
                actor.majorActionUsed = false;
                this.context.onActorDown?.(actor, 'enemy');
            }
        }
        return {
            type: 'COMBAT_EVENT',
            kind: result.isMiss ? 'miss' : actor.isDead ? 'down' : 'damage',
            sourceId: enemy.id,
            targetId: actor.id,
            sourceName: enemy.name,
            targetName: actor.name,
            value: dealtDamage,
        };
    }

    private canEnemyAttack(enemy: Enemy, actor: ServerActor, range: number): boolean {
        const enemyTile = { x: enemy.gridX, y: enemy.gridY };
        if (manhattan(enemyTile, actor.tile) > range) return false;
        return range <= 1 || this.context.hasFieldLineOfSight(enemyTile, actor.tile, actor.ownerPlayerId);
    }

    private enemyStepToward(entry: ServerEnemy, actor: ServerActor, desiredRange: number): void {
        const enemy = entry.enemy;
        const targetTile = actor.tile;
        const enemyTile = { x: enemy.gridX, y: enemy.gridY };
        if (manhattan(enemyTile, targetTile) <= desiredRange) return;
        const goals = tilesInRange(targetTile, desiredRange)
            .filter((tile) => manhattan(tile, targetTile) === desiredRange)
            .filter((tile) => this.context.isFieldPassable({ ...tile, actorId: enemy.id, intent: 'enemy', goal: targetTile }));
        const path = findPathToAny(enemyTile, goals, (query) => this.context.isFieldPassable(query), {
            actorId: enemy.id,
            intent: 'enemy',
            maxNodes: 2500,
        });
        if (path.length === 0) return;
        const next = path[0];
        enemy.facing = directionFromTo(enemyTile, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private enemyStepAway(entry: ServerEnemy, actor: ServerActor): void {
        const enemy = entry.enemy;
        const start = { x: enemy.gridX, y: enemy.gridY };
        const candidates = tilesInRange(start, 1)
            .filter((tile) => manhattan(tile, start) === 1)
            .filter((tile) => this.context.isFieldPassable({ ...tile, actorId: enemy.id, intent: 'enemy' }))
            .sort((a, b) => manhattan(b, actor.tile) - manhattan(a, actor.tile));
        const next = candidates.find((tile) => manhattan(tile, actor.tile) > manhattan(start, actor.tile));
        if (!next) return;
        enemy.facing = directionFromTo(start, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private wanderEnemy(entry: ServerEnemy, now: number): void {
        const enemy = entry.enemy;
        const start = { x: enemy.gridX, y: enemy.gridY };
        const options = tilesInRange(start, 1)
            .filter((tile) => manhattan(tile, start) === 1)
            .filter((tile) => manhattan(tile, entry.home) <= ENEMY_LEASH_RANGE)
            .filter((tile) => this.context.isFieldPassable({ ...tile, actorId: enemy.id, intent: 'enemy' }));
        if (options.length === 0) return;
        const next = options[Math.abs(hashInt(now + entry.wanderSeed)) % options.length];
        enemy.facing = directionFromTo(start, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }
}

function createEnemySelfStatusEvent(enemy: Enemy, statusEffect: StatusEffect): CombatEventMessage {
    return {
        type: 'COMBAT_EVENT',
        kind: 'status',
        sourceId: enemy.id,
        targetId: enemy.id,
        sourceName: enemy.name,
        targetName: enemy.name,
        statusEffect,
    };
}
