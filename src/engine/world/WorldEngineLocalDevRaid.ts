import type { PartyManager } from '../../character/PartyManager';
import type { FieldActor } from '../../field/FieldTypes';
import { formatT, i18n } from '../../i18n/LanguageManager';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineNetworkState } from './WorldEngineNetworkState';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';

export interface WorldEngineLocalDevRaidPorts {
    actionControllers: WorldEngineActionControllers;
    networkState: WorldEngineNetworkState;
    party: PartyManager;
    raidSession: WorldRaidSession;
    runtimeState: WorldEngineRuntimeState;
    scenarioNetworkControllers: WorldEngineScenarioNetworkControllers;
    town: TownInfo;
    townSession: WorldTownSession;
    worldMap: WorldMap;
    addCombatLog(message: string): void;
    clearFieldTurnState(): void;
    closeFieldOverlays(): void;
    getControlledActor(): FieldActor | null;
    placePartyNearTown(town: TownInfo): void;
    syncControlledPlayer(): void;
}

export function beginWorldEngineLocalDevRaidFromCurrentHub(ports: WorldEngineLocalDevRaidPorts): boolean {
    if (!import.meta.env.DEV) return false;
    const {
        actionControllers,
        networkState,
        party,
        raidSession,
        runtimeState,
        scenarioNetworkControllers,
        town,
        townSession,
        worldMap,
    } = ports;
    ports.closeFieldOverlays();
    townSession.hide();
    networkState.isRaid = false;
    networkState.isConnecting = false;
    networkState.playerId = null;
    runtimeState.currentPhase = 'raid';
    raidSession.beginRaidFromTown(town.id);
    party.resetForNewRaid();
    townSession.applyPendingRestForRaidStart();
    scenarioNetworkControllers.storyScenarioController.resetVisitState();
    scenarioNetworkControllers.storyScenarioController.resetNetworkState();
    ports.placePartyNearTown(town);
    const controlled = ports.getControlledActor();
    ports.syncControlledPlayer();
    actionControllers.selectionController.selectActor(controlled?.id ?? null);
    ports.clearFieldTurnState();
    ports.addCombatLog(formatT('mp.deployStarted', {
        town: i18n.lang === 'ko' ? town.nameKr : town.name,
        world: worldMap.getDisplayName(),
    }));
    return true;
}
