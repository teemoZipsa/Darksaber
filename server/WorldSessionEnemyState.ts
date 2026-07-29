import { getEffectiveStatsForEnemy } from '../src/combat/StatusEffects';
import type { Enemy } from '../src/entity/Enemy';
import {
    ENEMY_COMBAT_SIMULATION_RANGE,
    ENEMY_LEASH_RANGE,
    ENEMY_SIMULATION_ACTIVE_RANGE,
    FIELD_ATB_SCALE,
    getEnemyAggroRanges,
    getEnemyAtbMultiplier,
} from '../src/field/FieldConfig';
import { advanceAtb, resolveAggroState } from '../src/field/FieldCombat';
import { manhattan, type TilePoint } from '../src/field/FieldPathing';

export interface WorldSessionEnemyActor {
    tile: TilePoint;
}

export interface WorldSessionEnemyEntry {
    enemy: Enemy;
    home: TilePoint;
    scenarioPlayerId?: string;
    bountyPlayerId?: string;
}

export interface WorldSessionEnemyStateContext<
    EnemyEntry extends WorldSessionEnemyEntry,
    Actor extends WorldSessionEnemyActor,
> {
    getTargetableActors: (entry: EnemyEntry) => Actor[];
    hasActiveActorWithin: (tile: TilePoint, distance: number, ownerPlayerId?: string) => boolean;
}

export type WorldSessionEnemyTickState = 'inactive' | 'idle' | 'ready';

export class WorldSessionEnemyState<
    EnemyEntry extends WorldSessionEnemyEntry,
    Actor extends WorldSessionEnemyActor,
> {
    public constructor(private readonly context: WorldSessionEnemyStateContext<EnemyEntry, Actor>) {}

    public advanceEnemy(entry: EnemyEntry, dt: number): WorldSessionEnemyTickState {
        const enemy = entry.enemy;
        if (enemy.stats.hp <= 0) return 'idle';
        if (!this.isSimulationActive(entry)) {
            this.resetEnemy(enemy);
            return 'inactive';
        }
        if (!this.refreshAggro(entry)) {
            enemy.actionGauge = 0;
            return 'idle';
        }

        enemy.actionGauge = advanceAtb(
            enemy.actionGauge,
            getEffectiveStatsForEnemy(enemy).spd,
            dt,
            FIELD_ATB_SCALE * getEnemyAtbMultiplier(enemy.level, enemy.isBoss),
        );
        if (enemy.actionGauge < 100) return 'idle';
        enemy.actionGauge = 100;
        return 'ready';
    }

    public refreshAggro(entry: EnemyEntry, closest: Actor | null = this.findClosestTarget(entry)): boolean {
        const enemy = entry.enemy;
        if (!closest) {
            enemy.isAggro = false;
            return false;
        }

        const enemyTile = this.enemyTile(enemy);
        const distanceToTarget = manhattan(enemyTile, closest.tile);
        const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
        const aggroRanges = getEnemyAggroRanges(enemy.aggroRange);
        enemy.isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, aggroRanges.enter, aggroRanges.exit, leashExceeded);
        return enemy.isAggro;
    }

    public findClosestTarget(entry: EnemyEntry, targets: Actor[] = this.context.getTargetableActors(entry)): Actor | null {
        const enemyTile = this.enemyTile(entry.enemy);
        return targets.reduce<Actor | null>((best, candidate) => {
            if (!best) return candidate;
            return manhattan(enemyTile, candidate.tile) < manhattan(enemyTile, best.tile) ? candidate : best;
        }, null);
    }

    private isSimulationActive(entry: EnemyEntry): boolean {
        const enemy = entry.enemy;
        if (this.context.getTargetableActors(entry).length === 0) return false;
        const range = enemy.isAggro ? ENEMY_COMBAT_SIMULATION_RANGE : ENEMY_SIMULATION_ACTIVE_RANGE;
        return this.context.hasActiveActorWithin(
            this.enemyTile(enemy),
            range,
            entry.scenarioPlayerId ?? entry.bountyPlayerId,
        );
    }

    private resetEnemy(enemy: Enemy): void {
        enemy.actionGauge = 0;
        enemy.isAggro = false;
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }
}
