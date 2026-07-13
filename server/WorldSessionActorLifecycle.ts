import {
    removeActionStanceStatusesFromCarrier,
} from '../src/combat/StatusEffects';
import { getItemDef } from '../src/data/ItemDB';
import {
    FIELD_MAX_ACTION_GAUGE,
    MIN_FIELD_ACTION_GAUGE_COST,
} from '../src/field/FieldActionEconomy';
import {
    countCursedArtifactsInItemCounts,
    getCursedArtifactTurnDamage,
} from '../src/raid/CursedArtifact';
import type { CombatEventMessage } from '../src/net/WorldProtocol';
import { createActorEvent, getEffectiveServerActorStats } from './WorldSessionHelpers';
import {
    updateRestingActorResources,
} from './WorldSessionSkillState';
import type { ServerActor, ServerPlayer } from './WorldSessionTypes';

export function finishWorldSessionActorIfSpent(actor: ServerActor): void {
    if (actor.remainingAp >= MIN_FIELD_ACTION_GAUGE_COST) return;
    endWorldSessionActorTurn(actor);
}

export function applyWorldSessionCursedArtifactTurnDamage(
    player: ServerPlayer,
    actor: ServerActor
): CombatEventMessage | null {
    const damage = Math.min(
        actor.stats.hp,
        getCursedArtifactTurnDamage(getEffectiveServerActorStats(actor), getWorldSessionPlayerCursedArtifactCount(player))
    );
    if (damage <= 0) return null;

    actor.stats.hp = Math.max(0, actor.stats.hp - damage);
    removeActionStanceStatusesFromCarrier(actor);
    if (actor.stats.hp <= 0) {
        actor.isDead = true;
        actor.remainingAp = 0;
        actor.actionGauge = 0;
        actor.majorActionUsed = false;
    }
    return createActorEvent(actor.isDead ? 'down' : 'curse', actor, actor, damage);
}

export function getWorldSessionPlayerCursedArtifactCount(player: ServerPlayer): number {
    return countCursedArtifactsInItemCounts(player.carriedItems, (itemId) => getItemDef(itemId));
}

export function endWorldSessionActorTurn(actor: ServerActor): void {
    actor.actionGauge = Math.max(0, Math.min(FIELD_MAX_ACTION_GAUGE, actor.remainingAp));
    actor.remainingAp = 0;
    actor.majorActionUsed = false;
}

export function spendWorldSessionActorGauge(actor: ServerActor, cost: number): void {
    actor.remainingAp = Math.max(0, actor.remainingAp - cost);
    actor.actionGauge = actor.remainingAp;
}

export function updateWorldSessionRestingActor(
    actor: ServerActor,
    restingRecoveryTimers: Map<string, number>,
    dt: number
): void {
    const timerUpdate = updateRestingActorResources(actor, restingRecoveryTimers.get(actor.id), dt);
    if (timerUpdate.type === 'delete') {
        restingRecoveryTimers.delete(actor.id);
        return;
    }
    if (timerUpdate.type === 'set') {
        restingRecoveryTimers.set(actor.id, timerUpdate.timer);
    }
}
