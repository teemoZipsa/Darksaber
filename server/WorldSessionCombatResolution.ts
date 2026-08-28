import {
    applyGuardToDamage,
    getEffectiveStatsForEnemy,
} from '../src/combat/StatusEffects';
import { CombatFormulas } from '../src/combat/CombatFormulas';
import type { Enemy } from '../src/entity/Enemy';
import { manhattan, type TilePoint } from '../src/field/FieldPathing';
import type { WorldMap } from '../src/map/WorldMap';
import type {
    AutoLootGrantMessage,
    CombatEventMessage,
    ScenarioEnemyDefeatEventMessage,
} from '../src/net/WorldProtocol';
import type { WorldSessionContentSpawner } from './WorldSessionContentSpawner';
import type { WorldSessionFieldNests } from './WorldSessionFieldNests';
import type { WorldSessionScenarioRuntime } from './WorldSessionScenarioRuntime';
import type {
    CompleteEnemyKillResult,
    ServerActor,
    ServerEnemy,
    ServerPlayer,
} from './WorldSessionTypes';
import { recordPlayerKillDangerBand } from './WorldSessionBalanceTelemetry';
import { getEffectiveServerActorStats } from './WorldSessionHelpers';
import { awardWorldSessionEnemyExp } from './WorldSessionActorProgression';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import { recordBountyTargetKill } from './WorldSessionBounty';
import { recordWorldSessionMonsterDefeat } from './WorldSessionMonsterCodex';

export interface WorldSessionEnemyKillContext {
    scenarioRuntime: WorldSessionScenarioRuntime;
    enemies: Map<string, ServerEnemy>;
    fieldNests: WorldSessionFieldNests;
    players: Map<string, ServerPlayer>;
    contentSpawner: WorldSessionContentSpawner;
    worldMap: WorldMap;
    saveState: WorldSessionSaveState;
}

export interface WorldSessionActorAttackContext {
    enemyKillContext: WorldSessionEnemyKillContext;
    getServerTileAt(tile: TilePoint, ownerPlayerId?: string | null): ReturnType<WorldMap['getTileAt']>;
    random?: () => number;
}

export interface WorldSessionActorAttackResolution {
    event: CombatEventMessage;
    autoLootGrant?: AutoLootGrantMessage;
    scenarioEnemyDefeatEvent?: ScenarioEnemyDefeatEventMessage;
}

export function resolveWorldSessionActorAttack(
    context: WorldSessionActorAttackContext,
    actor: ServerActor,
    target: ServerEnemy,
    now: number
): WorldSessionActorAttackResolution {
    const enemy = target.enemy;
    const result = CombatFormulas.calcPhysicalDamage(
        getEffectiveServerActorStats(actor),
        getEffectiveStatsForEnemy(enemy),
        context.getServerTileAt({ x: enemy.gridX, y: enemy.gridY }, actor.ownerPlayerId),
        {
            isRanged: manhattan(actor.tile, { x: enemy.gridX, y: enemy.gridY }) > 1,
            ...(context.random ? { random: context.random } : {}),
        }
    );
    const event: CombatEventMessage = {
        type: 'COMBAT_EVENT',
        kind: result.isMiss ? 'miss' : 'damage',
        sourceId: actor.id,
        targetId: enemy.id,
        sourceName: actor.name,
        targetName: enemy.name,
        value: result.damage,
    };
    let autoLootGrant: AutoLootGrantMessage | undefined;
    let scenarioEnemyDefeatEvent: ScenarioEnemyDefeatEventMessage | undefined;
    if (!result.isMiss) {
        const guarded = applyGuardToDamage(enemy.statuses, result.damage);
        enemy.statuses = guarded.statuses;
        enemy.takeDamage(guarded.damage);
        event.value = guarded.damage;
        if (enemy.stats.hp <= 0) {
            event.kind = 'kill';
            const killResult = completeWorldSessionEnemyKill(context.enemyKillContext, actor, target, now);
            event.expAward = killResult.expAward;
            autoLootGrant = killResult.autoLootGrant;
            scenarioEnemyDefeatEvent = killResult.scenarioEnemyDefeatEvent;
        }
    }
    return { event, autoLootGrant, scenarioEnemyDefeatEvent };
}

export function completeWorldSessionEnemyKill(
    context: WorldSessionEnemyKillContext,
    actor: ServerActor,
    target: ServerEnemy,
    now: number
): CompleteEnemyKillResult {
    const enemy: Enemy = target.enemy;
    const scenarioKillResult = context.scenarioRuntime.completeEnemyKill(target, enemy.id);
    context.enemies.delete(enemy.id);
    if (target.nestKey) context.fieldNests.markNestEnemyKilled(target.nestKey, enemy.id, now);
    const player = context.players.get(actor.ownerPlayerId);
    let expAward = 0;
    if (player) {
        player.kills += 1;
        recordWorldSessionMonsterDefeat(player, target, context.saveState, now);
        recordPlayerKillDangerBand(player, target, context.worldMap);
        expAward = awardWorldSessionEnemyExp({
            actor,
            enemy,
            player,
            realm: context.worldMap.getRealm(),
            saveState: context.saveState,
        });
    }
    const bountyTargetKilled = player ? recordBountyTargetKill(player, target) : false;
    const autoLootGrant: AutoLootGrantMessage | undefined = bountyTargetKilled
        ? context.contentSpawner.spawnBountyProofAutoLoot(enemy, actor.ownerPlayerId, now)
        : enemy.isBoss
            ? undefined
            : context.contentSpawner.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
    if (enemy.isBoss || !autoLootGrant) context.contentSpawner.spawnEnemyLoot(enemy, scenarioKillResult.bossLootTile);
    return { expAward, autoLootGrant, scenarioEnemyDefeatEvent: scenarioKillResult.scenarioEnemyDefeatEvent };
}
