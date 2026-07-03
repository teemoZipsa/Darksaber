import type { WorldMap } from '../src/map/WorldMap';
import type {
    RaidResultMessage,
    WorldClientMessage,
} from '../src/net/WorldProtocol';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type {
    ServerActor,
    ServerPlayer,
} from './WorldSessionTypes';

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
        const finalResult = result === 'SURVIVED' && !this.isValidExtractionTown(player, extractionTownId) ? 'LEFT' : result;
        const message = this.createRaidResultMessage(playerId, finalResult, player, extractionTownId);
        this.context.log(`raid result player=${playerId} result=${finalResult} kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        if (player) {
            const survived = finalResult === 'SURVIVED';
            if (survived) {
                message.firstSurvivalBonusGranted = this.context.saveState.grantsFirstSurvivalBonus(player);
            }
            this.context.saveState.captureFinalPatch(player, survived ? extractionTownId : undefined, survived);
            this.context.saveState.markDirty(playerId);
        }
        this.context.removePlayer(playerId);
        return message;
    }

    public finishPlayerForShutdown(playerId: string): RaidResultMessage {
        const player = this.context.players.get(playerId);
        const extractionTownId = player?.departureTownId ?? this.resolveExtractionTownId(player);
        const message = this.createRaidResultMessage(playerId, 'SURVIVED', player, extractionTownId);
        this.context.log(`raid result player=${playerId} result=SURVIVED reason=server_shutdown kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        if (player) {
            message.firstSurvivalBonusGranted = this.context.saveState.grantsFirstSurvivalBonus(player);
            this.context.saveState.captureFinalPatch(player, extractionTownId, true);
            this.context.saveState.markDirty(playerId);
        }
        this.context.removePlayer(playerId);
        return message;
    }

    public resolveRequestedRaidResult(
        playerId: string,
        reason: Extract<WorldClientMessage, { type: 'WORLD_LEAVE' }>['reason']
    ): RaidResultMessage['result'] {
        if (reason === 'wipe') return 'DEAD';
        if (reason !== 'town') return 'LEFT';
        const player = this.context.players.get(playerId);
        return this.isValidExtractionTown(player, this.resolveExtractionTownId(player)) ? 'SURVIVED' : 'LEFT';
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
        };
    }

    private resolveExtractionTownId(player: ServerPlayer | undefined): string {
        if (!player) return 'central_castle';
        const actor = player.actorIds.map((id) => this.context.actors.get(id)).find(Boolean);
        if (!actor) return player.departureTownId;
        const town = this.context.worldMap.getTownAtTile(actor.tile.x, actor.tile.y);
        return town?.id ?? player.departureTownId;
    }

    private isValidExtractionTown(player: ServerPlayer | undefined, extractionTownId: string): boolean {
        if (!player) return false;
        if (extractionTownId === player.departureTownId) return false;
        const actor = player.actorIds.map((id) => this.context.actors.get(id)).find(Boolean);
        if (!actor) return false;
        return this.context.worldMap.getTownAtTile(actor.tile.x, actor.tile.y)?.id === extractionTownId;
    }
}
