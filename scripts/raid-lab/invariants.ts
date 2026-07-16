import type { WorldSession } from '../../server/WorldSession';
import type { ServerActor, ServerPlayer } from '../../server/WorldSessionTypes';
import type { RaidLabInvariantViolation } from './types';

export interface InvariantCheckContext {
    session: WorldSession;
    playerId: string;
    simMs: number;
    actionIndex: number;
    raidFinished: boolean;
}

export function checkRaidLabInvariants(context: InvariantCheckContext): RaidLabInvariantViolation[] {
    const violations: RaidLabInvariantViolation[] = [];
    const push = (code: string, message: string) => {
        violations.push({
            code,
            message,
            simMs: context.simMs,
            actionIndex: context.actionIndex,
        });
    };

    const debug = context.session.getDebugState();
    const player = debug.players.get(context.playerId);

    if (context.raidFinished) {
        if (player) push('player_lingering_after_result', `Player ${context.playerId} still present after raid result`);
        return violations;
    }

    if (!player) {
        push('missing_active_player', `Expected active player ${context.playerId}`);
        return violations;
    }

    checkPlayer(player, push);
    for (const actorId of player.actorIds) {
        const actor = debug.actors.get(actorId);
        if (!actor) {
            push('missing_actor', `Missing actor ${actorId} for player ${player.id}`);
            continue;
        }
        checkActor(actor, push);
    }

    for (const enemy of debug.enemies.values()) {
        if (!Number.isFinite(enemy.enemy.stats.hp)) {
            push('enemy_hp_nonfinite', `Enemy ${enemy.enemy.id} has non-finite HP`);
        }
        if (enemy.enemy.stats.hp < 0) {
            push('enemy_hp_negative', `Enemy ${enemy.enemy.id} HP ${enemy.enemy.stats.hp} < 0`);
        }
    }

    return violations;
}

function checkPlayer(player: ServerPlayer, push: (code: string, message: string) => void): void {
    if (!(player.elapsedSeconds >= 0) || !Number.isFinite(player.elapsedSeconds)) {
        push('elapsed_nonfinite', `elapsedSeconds=${player.elapsedSeconds}`);
    }
    if (player.elapsedSeconds > 30 * 60 + 1) {
        push('elapsed_past_raid_limit', `elapsedSeconds=${player.elapsedSeconds}`);
    }
    if (player.kills < 0) push('kills_negative', `kills=${player.kills}`);
    if (player.carriedWeight < -1e-6) push('carried_weight_negative', `carriedWeight=${player.carriedWeight}`);
    if (!player.departureTownId) push('missing_departure_town', 'departureTownId empty');
    if (player.actorIds.length === 0) push('no_actors', 'Player has zero actorIds');
}

function checkActor(actor: ServerActor, push: (code: string, message: string) => void): void {
    if (!Number.isFinite(actor.stats.hp) || !Number.isFinite(actor.stats.mp)) {
        push('actor_resource_nonfinite', `Actor ${actor.id} hp/mp non-finite`);
    }
    if (actor.stats.hp < 0) push('actor_hp_negative', `Actor ${actor.id} hp=${actor.stats.hp}`);
    if (actor.stats.mp < 0) push('actor_mp_negative', `Actor ${actor.id} mp=${actor.stats.mp}`);
    if (actor.stats.hp > actor.stats.maxHp + 1) {
        push('actor_hp_above_max', `Actor ${actor.id} hp=${actor.stats.hp} maxHp=${actor.stats.maxHp}`);
    }
    if (actor.stats.mp > actor.stats.maxMp + 1) {
        push('actor_mp_above_max', `Actor ${actor.id} mp=${actor.stats.mp} maxMp=${actor.stats.maxMp}`);
    }
    if (actor.actionGauge < -1e-6 || actor.actionGauge > 100 + 1e-6) {
        push('actor_gauge_oob', `Actor ${actor.id} actionGauge=${actor.actionGauge}`);
    }
    if (actor.remainingAp < -1e-6 || actor.remainingAp > 100 + 1e-6) {
        push('actor_ap_oob', `Actor ${actor.id} remainingAp=${actor.remainingAp}`);
    }
    if (actor.isDead && actor.stats.hp > 0) {
        push('actor_dead_with_hp', `Actor ${actor.id} isDead with hp=${actor.stats.hp}`);
    }
    if (!actor.isDead && actor.stats.hp <= 0) {
        push('actor_alive_with_zero_hp', `Actor ${actor.id} hp<=0 but not isDead`);
    }
}
