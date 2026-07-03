import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import type { Player } from '../../entity/Player';
import type { GameManager } from '../GameManager';
import type { Camera } from '../Camera';
import { WorldMap } from '../../map/WorldMap';
import type { WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';

export interface WorldEngineCoreState {
    canvas: HTMLCanvasElement | undefined;
    camera: Camera | undefined;
    party: PartyManager | undefined;
    playerData: PlayerData | undefined;
    gameManager: GameManager | undefined;
    worldMap: WorldMap;
    player: Player | undefined;
    townSession: WorldTownSession | undefined;
    raidSession: WorldRaidSession | undefined;
}

export function createWorldEngineCoreState(initial: Partial<WorldEngineCoreState> = {}): WorldEngineCoreState {
    return {
        canvas: initial.canvas,
        camera: initial.camera,
        party: initial.party,
        playerData: initial.playerData,
        gameManager: initial.gameManager,
        worldMap: initial.worldMap ?? new WorldMap(),
        player: initial.player,
        townSession: initial.townSession,
        raidSession: initial.raidSession,
    };
}
