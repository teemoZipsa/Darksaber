import { advanceTimedStatuses } from '../src/combat/StatusEffects';
import { FIELD_MAX_ACTION_GAUGE } from '../src/field/FieldActionEconomy';
import { FIELD_ATB_SCALE } from '../src/field/FieldConfig';
import { advanceAtb } from '../src/field/FieldCombat';
import { getCarryAtbMultiplier } from '../src/inventory/CarryWeight';
import { getRaidModifierEffects } from '../src/raid/RaidModifiers';
import { getCursedArtifactAtbMultiplier } from '../src/raid/CursedArtifact';
import type { CombatEventMessage, WorldServerMessage } from '../src/net/WorldProtocol';
import { isPlayerWiped } from './WorldSessionVisibility';
import type { WorldSessionEnemyState } from './WorldSessionEnemyState';
import type { WorldSessionEnemyTurnResolver } from './WorldSessionEnemyTurnResolver';
import type { WorldSessionFieldNests } from './WorldSessionFieldNests';
import type { WorldSessionLootResolver } from './WorldSessionLootResolver';
import type { WorldSessionRaidResults } from './WorldSessionRaidResults';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type { ServerActor, ServerEnemy, ServerPlayer, WorldSessionTickResult } from './WorldSessionTypes';
import { getEffectiveServerActorStats } from './WorldSessionHelpers';

export interface WorldSessionTickProcessorContext {
    now: number;
    dt: number;
    raidLimitSeconds: number;
    fieldNestRefreshIntervalMs: number;
    ghostGraceMs: number;
    lastNestRefreshAt: number;
    players: Map<string, ServerPlayer>;
    actors: Map<string, ServerActor>;
    enemies: Map<string, ServerEnemy>;
    saveState: WorldSessionSaveState;
    fieldNests: WorldSessionFieldNests;
    enemyState: WorldSessionEnemyState<ServerEnemy, ServerActor>;
    enemyTurnResolver: WorldSessionEnemyTurnResolver;
    lootResolver: WorldSessionLootResolver;
    raidResults: WorldSessionRaidResults;
    setLastNestRefreshAt(value: number): void;
    removePlayer(playerId: string): void;
    updateRestingActor(actor: ServerActor, dt: number): void;
    applyCursedArtifactTurnDamage(player: ServerPlayer, actor: ServerActor): CombatEventMessage | null;
    getPlayerCursedArtifactCount(player: ServerPlayer): number;
    log(message: string): void;
}

export function tickWorldSession(context: WorldSessionTickProcessorContext): WorldSessionTickResult {
    const events: CombatEventMessage[] = [];
    const perPlayerMessages: Array<{ playerId: string; message: WorldServerMessage }> = [];

    for (const player of [...context.players.values()]) {
        if (!player.active) continue;
        if (player.ghost && player.disconnectedAt !== null && context.now - player.disconnectedAt >= context.ghostGraceMs) {
            context.log(`despawn player=${player.id} reason=ghost_expired`);
            context.saveState.captureFinalPatch(player);
            context.saveState.markDirty(player.id);
            context.removePlayer(player.id);
            continue;
        }
        if (player.ghost) continue;

        player.elapsedSeconds = Math.min(context.raidLimitSeconds, player.elapsedSeconds + context.dt);
        if (player.elapsedSeconds >= context.raidLimitSeconds) {
            perPlayerMessages.push({ playerId: player.id, message: context.raidResults.finishPlayer(player.id, 'MIA') });
            continue;
        }

        advancePlayerActors(context, player, events);
    }

    if (context.now - context.lastNestRefreshAt >= context.fieldNestRefreshIntervalMs) {
        context.setLastNestRefreshAt(context.now);
        context.fieldNests.refreshFieldNests(context.now);
    }

    for (const entry of context.enemies.values()) {
        const enemy = entry.enemy;
        if (enemy.stats.hp <= 0) continue;
        if (context.enemyState.advanceEnemy(entry, context.dt) === 'ready') {
            const turnEvents = context.enemyTurnResolver.resolveEnemyTurn(entry, context.now);
            const privateOwnerId = entry.bountyPlayerId;
            if (privateOwnerId) {
                for (const message of turnEvents) {
                    perPlayerMessages.push({ playerId: privateOwnerId, message });
                }
            } else {
                events.push(...turnEvents);
            }
            enemy.actionGauge = 0;
        }
    }

    context.lootResolver.releaseExpiredAutoLoot(context.now);
    context.lootResolver.releaseExpiredLootLocks(context.now);
    for (const player of [...context.players.values()]) {
        if (!player.active || player.ghost) continue;
        if (isPlayerWiped(player, context.actors)) {
            perPlayerMessages.push({ playerId: player.id, message: context.raidResults.finishPlayer(player.id, 'DEAD') });
        }
    }

    return { events, perPlayerMessages };
}

function advancePlayerActors(
    context: WorldSessionTickProcessorContext,
    player: ServerPlayer,
    events: CombatEventMessage[]
): void {
    for (const actorId of player.actorIds) {
        const actor = context.actors.get(actorId);
        if (!actor || actor.isDead) continue;
        const statusCount = actor.statuses.length;
        actor.statuses = advanceTimedStatuses(actor.statuses, context.dt);
        if (actor.statuses.length !== statusCount) {
            const effective = getEffectiveServerActorStats(actor);
            actor.stats.hp = Math.min(actor.stats.hp, effective.maxHp);
            actor.stats.mp = Math.min(actor.stats.mp, effective.maxMp);
        }
        context.updateRestingActor(actor, context.dt);
        if (actor.actionGauge >= FIELD_MAX_ACTION_GAUGE && actor.remainingAp <= 0) {
            readyActor(context, player, actor, events);
        } else if (actor.actionGauge < FIELD_MAX_ACTION_GAUGE) {
            actor.actionGauge = advanceAtb(
                actor.actionGauge,
                getEffectiveServerActorStats(actor).spd,
                context.dt,
                FIELD_ATB_SCALE
                * getCarryAtbMultiplier(player.carriedWeight)
                * getCursedArtifactAtbMultiplier(context.getPlayerCursedArtifactCount(player))
                * getRaidModifierEffects(player.raidModifier).partyAtbMultiplier
            );
            if (actor.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
                actor.actionGauge = FIELD_MAX_ACTION_GAUGE;
                readyActor(context, player, actor, events);
            }
        }
    }
}

function readyActor(
    context: WorldSessionTickProcessorContext,
    player: ServerPlayer,
    actor: ServerActor,
    events: CombatEventMessage[]
): void {
    const event = context.applyCursedArtifactTurnDamage(player, actor);
    if (event) events.push(event);
    if (!actor.isDead && actor.stats.hp > 0) {
        actor.remainingAp = FIELD_MAX_ACTION_GAUGE;
        actor.majorActionUsed = false;
    }
}
