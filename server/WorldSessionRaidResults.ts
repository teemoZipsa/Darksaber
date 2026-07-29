import type { WorldMap } from '../src/map/WorldMap';
import type {
    RaidResultMessage,
    WorldClientMessage,
} from '../src/net/WorldProtocol';
import {
    coerceRaidResultForTownArrival,
    resolveRaidLeaveResult,
} from '../src/raid/RaidRules';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type {
    ServerActor,
    ServerPlayer,
} from './WorldSessionTypes';
import { buildRaidBalanceTelemetry } from './WorldSessionBalanceTelemetry';
import { settleSurvivedBounty } from './WorldSessionBounty';

export interface WorldSessionRaidResultsContext {
    players: ReadonlyMap<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    worldMap: WorldMap;
    saveState: WorldSessionSaveState;
    log: (message: string) => void;
    removePlayer: (playerId: string) => void;
}

export class WorldSessionRaidResults {
    public constructor(private readonly context: WorldSessionRaidResultsContext) {}

    public finishPlayer(playerId: string, result: RaidResultMessage['result']): RaidResultMessage {
        const player = this.context.players.get(playerId);
        const extractionTownId = this.resolveExtractionTownId(player);
        const finalResult = this.coerceRaidResultForPlayer(result, player);
        const bounty = player && finalResult === 'SURVIVED'
            ? settleSurvivedBounty(player, this.context.saveState)
            : undefined;
        const message = this.createRaidResultMessage(playerId, finalResult, player, extractionTownId);
        if (bounty) message.bounty = bounty;
        this.context.log(`raid result player=${playerId} result=${finalResult} kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        if (player) {
            const survived = finalResult === 'SURVIVED';
            if (survived) {
                message.firstSurvivalBonusGranted = this.context.saveState.grantsFirstSurvivalBonus(player);
                this.context.saveState.captureFinalPatch(player, extractionTownId, true);
            } else {
                const failure = this.context.saveState.captureFinalPatch(player);
                if (failure) message.failure = failure;
            }
            this.context.saveState.markDirty(playerId);
        }
        this.context.removePlayer(playerId);
        return message;
    }

    public resolveRequestedRaidResult(
        playerId: string,
        reason: Extract<WorldClientMessage, { type: 'WORLD_LEAVE' }>['reason']
    ): RaidResultMessage['result'] {
        const player = this.context.players.get(playerId);
        return resolveRaidLeaveResult(
            reason,
            this.resolveCurrentTownId(player),
            player?.departureTownId,
            Boolean(player)
        );
    }

    private createRaidResultMessage(
        playerId: string,
        result: RaidResultMessage['result'],
        player: ServerPlayer | undefined,
        extractionTownId: string
    ): RaidResultMessage {
        return {
            type: 'RAID_RESULT',
            playerId,
            result,
            elapsedSeconds: player?.elapsedSeconds ?? 0,
            kills: player?.kills ?? 0,
            departureTownId: player?.departureTownId ?? 'central_castle',
            extractionTownId,
            completedDungeonIds: player ? [...player.completedDungeonIds] : [],
            ...(player ? { telemetry: buildRaidBalanceTelemetry(player, result) } : {}),
        };
    }

    private resolveExtractionTownId(player: ServerPlayer | undefined): string {
        if (!player) return 'central_castle';
        const actor = player.actorIds.map((id) => this.context.actors.get(id)).find(Boolean);
        if (!actor) return player.departureTownId;
        const town = this.context.worldMap.getTownAtTile(actor.tile.x, actor.tile.y);
        return town?.id ?? player.departureTownId;
    }

    private coerceRaidResultForPlayer(
        result: RaidResultMessage['result'],
        player: ServerPlayer | undefined
    ): RaidResultMessage['result'] {
        return coerceRaidResultForTownArrival(
            result,
            this.resolveCurrentTownId(player),
            player?.departureTownId,
            Boolean(player)
        );
    }

    private resolveCurrentTownId(player: ServerPlayer | undefined): string | null {
        if (!player) return null;
        const actor = player.actorIds.map((id) => this.context.actors.get(id)).find(Boolean);
        if (!actor) return null;
        return this.context.worldMap.getTownAtTile(actor.tile.x, actor.tile.y)?.id ?? null;
    }
}
