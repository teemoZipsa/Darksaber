import { MIN_FIELD_ACTION_GAUGE_COST } from '../src/field/FieldActionEconomy';
import type { WorldClientMessage } from '../src/net/WorldProtocol';
import { reject } from './WorldSessionHelpers';
import type { WorldSessionLootResolver } from './WorldSessionLootResolver';
import type { WorldSessionPlayerIntentResolver } from './WorldSessionPlayerIntentResolver';
import type { WorldSessionRaidResults } from './WorldSessionRaidResults';
import type { WorldSessionScenarioRuntime } from './WorldSessionScenarioRuntime';
import type { WorldSessionSkillResolver } from './WorldSessionSkillResolver';
import type { ServerActor, ServerPlayer, WorldSessionMessageResult } from './WorldSessionTypes';

export interface WorldSessionMessageDispatcherContext {
    players: Map<string, ServerPlayer>;
    actors: Map<string, ServerActor>;
    lootResolver: WorldSessionLootResolver;
    playerIntentResolver: WorldSessionPlayerIntentResolver;
    raidResults: WorldSessionRaidResults;
    scenarioRuntime: WorldSessionScenarioRuntime;
    skillResolver: WorldSessionSkillResolver;
    endActorTurn(actor: ServerActor): void;
    log(message: string): void;
}

export function handleWorldSessionMessage(
    context: WorldSessionMessageDispatcherContext,
    playerId: string,
    message: WorldClientMessage,
    now: number
): WorldSessionMessageResult {
    switch (message.type) {
        case 'PLAYER_INTENT':
            return handleWorldSessionIntent(context, playerId, message, now);
        case 'LOOT_PICKUP':
            return context.lootResolver.handleLootPickup(playerId, message.intentId, message.lootId, message.gridX, message.gridY, now);
        case 'AUTO_LOOT_RESOLVE':
            return context.lootResolver.handleAutoLootResolve(playerId, message.lootId, message.acceptedCells);
        case 'SCENARIO_ENTER':
            return context.scenarioRuntime.handleEnter(playerId, message, now);
        case 'SCENARIO_FIELD_EVENT_INTERACT':
            return context.scenarioRuntime.handleFieldEventInteract(playerId, message);
        case 'AMBIENT_SITE_INTERACT':
            return context.scenarioRuntime.handleAmbientSiteInteract(playerId, message);
        case 'WORLD_LEAVE':
            context.log(`leave player=${playerId} reason=${message.reason}`);
            return {
                replies: [context.raidResults.finishPlayer(playerId, context.raidResults.resolveRequestedRaidResult(playerId, message.reason))],
                broadcasts: [],
            };
        default:
            return { replies: [], broadcasts: [] };
    }
}

function handleWorldSessionIntent(
    context: WorldSessionMessageDispatcherContext,
    playerId: string,
    message: Extract<WorldClientMessage, { type: 'PLAYER_INTENT' }>,
    now: number
): WorldSessionMessageResult {
    const actor = context.actors.get(message.actorId);
    const player = context.players.get(playerId);
    if (message.kind === 'endTurn' && actor && player?.active && actor.ownerPlayerId === player.id) {
        context.endActorTurn(actor);
        return { replies: [], broadcasts: [] };
    }
    const validationError = validateWorldSessionActorIntent(player, actor);
    if (validationError) return reject(message.intentId, validationError);

    switch (message.kind) {
        case 'move':
            return context.playerIntentResolver.handleMove(actor!, message.intentId, message.payload);
        case 'attack':
            return context.playerIntentResolver.handleAttack(actor!, message.intentId, message.payload, now);
        case 'interact':
            return context.lootResolver.handleLootInspect(playerId, actor!, message.intentId, message.payload, now);
        case 'defend':
            return context.playerIntentResolver.handleDefend(actor!, message.intentId);
        case 'rest':
            return context.playerIntentResolver.handleRest(actor!, message.intentId);
        case 'endTurn':
            return { replies: [], broadcasts: [] };
        case 'useItem':
            return context.playerIntentResolver.handleUseItem(player!, actor!, message.intentId, message.payload);
        case 'castSkill':
            return context.skillResolver.handleCastSkill(player!, actor!, message.intentId, message.payload, now);
    }
}

function validateWorldSessionActorIntent(player: ServerPlayer | undefined, actor: ServerActor | undefined): string | null {
    if (!player || !player.active) return 'Player is not in an active raid.';
    if (player.ghost) return 'Ghost players cannot act.';
    if (!actor) return 'Actor does not exist.';
    if (actor.ownerPlayerId !== player.id) return 'Actor is not owned by this player.';
    if (actor.isDead || actor.stats.hp <= 0) return 'Actor is down.';
    if (actor.remainingAp < MIN_FIELD_ACTION_GAUGE_COST) return 'Actor action gauge is not ready.';
    return null;
}
