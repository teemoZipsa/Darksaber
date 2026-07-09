import type { Enemy } from '../src/entity/Enemy';
import type { AutoLootGrantMessage } from '../src/net/WorldProtocol';
import type { WorldSessionContentSpawner } from './WorldSessionContentSpawner';
import type { WorldSessionFieldNests } from './WorldSessionFieldNests';
import type { WorldSessionScenarioRuntime } from './WorldSessionScenarioRuntime';
import type {
    CompleteEnemyKillResult,
    ServerActor,
    ServerEnemy,
    ServerPlayer,
} from './WorldSessionTypes';

export interface WorldSessionEnemyKillContext {
    scenarioRuntime: WorldSessionScenarioRuntime;
    enemies: Map<string, ServerEnemy>;
    fieldNests: WorldSessionFieldNests;
    players: Map<string, ServerPlayer>;
    contentSpawner: WorldSessionContentSpawner;
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
    if (player) player.kills += 1;
    const autoLootGrant: AutoLootGrantMessage | undefined = enemy.isBoss
        ? undefined
        : context.contentSpawner.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
    if (enemy.isBoss || !autoLootGrant) context.contentSpawner.spawnEnemyLoot(enemy, scenarioKillResult.bossLootTile);
    return { autoLootGrant, scenarioEnemyDefeatEvent: scenarioKillResult.scenarioEnemyDefeatEvent };
}
