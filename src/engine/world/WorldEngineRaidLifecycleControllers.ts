import type { Character } from '../../character/Character';
import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import type { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import type { NetworkRaidClient } from '../../net/NetworkRaidClient';
import type {
    ActionRejectedMessage,
    AutoLootGrantMessage,
    CombatEventMessage,
    InventoryConsumedMessage,
    LootGrantMessage,
    WorldSnapshot,
} from '../../net/WorldProtocol';
import type { GameManager } from '../GameManager';
import { syncCharacterMovementToClass } from './WorldEngineFieldHelpers';
import type { WorldEngineNetworkState } from './WorldEngineNetworkState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineSharedControllerPorts } from './WorldEngineSharedControllerPorts';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';
import { WorldRaidLifecycleController } from './WorldRaidLifecycleController';
import { WorldRaidOutcomeController } from './WorldRaidOutcomeController';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import type { WorldTownSession } from './WorldTownSession';

export interface WorldEngineRaidLifecycleControllerPorts {
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    storyScenarioController: WorldStoryScenarioController;
    networkSyncController: WorldNetworkSyncController;
    getWorldMap(): WorldMap;
    getTownById(townId: string): TownInfo | null;
    getCurrentHubTown(): TownInfo;
    getNetworkRaidClient(): NetworkRaidClient | null;
    setNetworkRaidClient(client: NetworkRaidClient | null): void;
    isNetworkRaid(): boolean;
    setIsNetworkRaid(isNetworkRaid: boolean): void;
    isNetworkRaidConnecting(): boolean;
    setIsNetworkRaidConnecting(isConnecting: boolean): void;
    isNetworkWasReconnecting(): boolean;
    setNetworkWasReconnecting(wasReconnecting: boolean): void;
    getNetworkPlayerId(): string | null;
    setNetworkPlayerId(playerId: string | null): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    clearIntroTutorialStateForNetworkRaid(): void;
    clearRemotePartyActors(): void;
    placePartyNear(tile: TilePoint): void;
    getControlledActor(): FieldActor | null;
    getPlayer(): Player;
    setPlayer(player: Player): void;
    setPartyActors(actors: FieldActor[]): void;
    setFieldEnemies(enemies: FieldEnemy[]): void;
    selectActor(actorId: string | null): void;
    isTurnCombatActive(): boolean;
    setPhase(phase: WorldPhase): void;
    openTown(town: TownInfo): void;
    applyNetworkSnapshot(snapshot: WorldSnapshot): void;
    handleNetworkCombatEvent(event: CombatEventMessage): void;
    openNetworkLoot(grant: LootGrantMessage): void;
    handleNetworkAutoLootGrant(grant: AutoLootGrantMessage): void;
    handleNetworkInventoryConsumed(message: InventoryConsumedMessage): void;
    handleNetworkActionRejected(rejection: ActionRejectedMessage): void;
    log(message: string): void;
}

export interface WorldEngineRaidLifecycleControllers {
    raidOutcomeController: WorldRaidOutcomeController;
    raidLifecycleController: WorldRaidLifecycleController;
}

export interface WorldEngineRaidLifecycleControllerSources {
    ports: WorldEngineSharedControllerPorts;
    getNetworkState(): WorldEngineNetworkState;
    getScenarioNetworkControllers(): WorldEngineScenarioNetworkControllers;
    getTownById(townId: string): TownInfo | null;
    isTurnCombatActive(): boolean;
    applyNetworkSnapshot(snapshot: WorldSnapshot): void;
    handleNetworkCombatEvent(event: CombatEventMessage): void;
    openNetworkLoot(grant: LootGrantMessage): void;
    handleNetworkAutoLootGrant(grant: AutoLootGrantMessage): void;
    handleNetworkInventoryConsumed(message: InventoryConsumedMessage): void;
    handleNetworkActionRejected(rejection: ActionRejectedMessage): void;
}

export function createWorldEngineRaidLifecycleControllersFromSources(
    sources: WorldEngineRaidLifecycleControllerSources
): WorldEngineRaidLifecycleControllers {
    const scenarioNetworkControllers = sources.getScenarioNetworkControllers();
    const networkState = () => sources.getNetworkState();

    return createWorldEngineRaidLifecycleControllers({
        ...sources.ports,
        storyScenarioController: scenarioNetworkControllers.storyScenarioController,
        networkSyncController: scenarioNetworkControllers.networkSyncController,
        getTownById: (townId) => sources.getTownById(townId),
        setNetworkRaidClient: (client) => { networkState().raidClient = client; },
        setIsNetworkRaid: (isNetworkRaid) => { networkState().isRaid = isNetworkRaid; },
        isNetworkRaidConnecting: () => networkState().isConnecting,
        setIsNetworkRaidConnecting: (isConnecting) => { networkState().isConnecting = isConnecting; },
        isNetworkWasReconnecting: () => networkState().wasReconnecting,
        setNetworkWasReconnecting: (wasReconnecting) => { networkState().wasReconnecting = wasReconnecting; },
        setNetworkPlayerId: (playerId) => { networkState().playerId = playerId; },
        clearIntroTutorialStateForNetworkRaid: () => scenarioNetworkControllers.tutorialController.clearForNetworkRaid(),
        isTurnCombatActive: () => sources.isTurnCombatActive(),
        setPhase: (phase) => sources.ports.setCurrentPhase(phase),
        applyNetworkSnapshot: (snapshot) => sources.applyNetworkSnapshot(snapshot),
        handleNetworkCombatEvent: (event) => sources.handleNetworkCombatEvent(event),
        openNetworkLoot: (grant) => sources.openNetworkLoot(grant),
        handleNetworkAutoLootGrant: (grant) => sources.handleNetworkAutoLootGrant(grant),
        handleNetworkInventoryConsumed: (message) => sources.handleNetworkInventoryConsumed(message),
        handleNetworkActionRejected: (rejection) => sources.handleNetworkActionRejected(rejection),
        log: (message) => sources.ports.addCombatLog(message),
    });
}

export function createWorldEngineRaidLifecycleControllers(
    ports: WorldEngineRaidLifecycleControllerPorts
): WorldEngineRaidLifecycleControllers {
    const raidOutcomeController = new WorldRaidOutcomeController({
        party: ports.party,
        playerData: ports.playerData,
        gameManager: ports.gameManager,
        raidSession: ports.raidSession,
        townSession: ports.townSession,
        getTownById: (townId) => ports.getTownById(townId),
        getCurrentHubTown: () => ports.getCurrentHubTown(),
        resetStoryScenarioStateForRaidEnd: () => ports.storyScenarioController.resetRunState(),
        placePartyAtTown: (town) => {
            ports.placePartyNear(ports.getWorldMap().getTownSpawnTile(town));
            ports.setPlayer(ports.getControlledActor()?.entity ?? ports.getPlayer());
            ports.clearFieldTurnState();
        },
        openTown: (town) => ports.openTown(town),
        setPhase: (phase) => ports.setPhase(phase),
        log: (message) => ports.log(message),
    });
    const raidLifecycleController = new WorldRaidLifecycleController({
        party: ports.party,
        playerData: ports.playerData,
        gameManager: ports.gameManager,
        raidSession: ports.raidSession,
        townSession: ports.townSession,
        raidOutcomeController,
        storyScenarioController: ports.storyScenarioController,
        networkSyncController: ports.networkSyncController,
        getWorldMap: () => ports.getWorldMap(),
        getTownById: (townId) => ports.getTownById(townId),
        getCurrentHubTown: () => ports.getCurrentHubTown(),
        getNetworkRaidClient: () => ports.getNetworkRaidClient(),
        setNetworkRaidClient: (client) => ports.setNetworkRaidClient(client),
        isNetworkRaid: () => ports.isNetworkRaid(),
        setIsNetworkRaid: (isNetworkRaid) => ports.setIsNetworkRaid(isNetworkRaid),
        isNetworkRaidConnecting: () => ports.isNetworkRaidConnecting(),
        setIsNetworkRaidConnecting: (isConnecting) => ports.setIsNetworkRaidConnecting(isConnecting),
        isNetworkWasReconnecting: () => ports.isNetworkWasReconnecting(),
        setNetworkWasReconnecting: (wasReconnecting) => ports.setNetworkWasReconnecting(wasReconnecting),
        getNetworkPlayerId: () => ports.getNetworkPlayerId(),
        setNetworkPlayerId: (playerId) => ports.setNetworkPlayerId(playerId),
        closeFieldOverlays: () => ports.closeFieldOverlays(),
        clearFieldTurnState: () => ports.clearFieldTurnState(),
        clearIntroTutorialStateForNetworkRaid: () => ports.clearIntroTutorialStateForNetworkRaid(),
        clearRemotePartyActors: () => ports.clearRemotePartyActors(),
        placePartyNear: (tile) => ports.placePartyNear(tile),
        getControlledActor: () => ports.getControlledActor(),
        setPlayer: (player) => ports.setPlayer(player),
        setPartyActors: (actors) => ports.setPartyActors(actors),
        setFieldEnemies: (enemies) => ports.setFieldEnemies(enemies),
        clearWorldLoot: () => {
            ports.getWorldMap().loot = [];
        },
        selectActor: (actorId) => ports.selectActor(actorId),
        syncCharacterMovementToClass: (character: Character) => syncCharacterMovementToClass(character),
        isTurnCombatActive: () => ports.isTurnCombatActive(),
        setPhase: (phase) => ports.setPhase(phase),
        applyNetworkSnapshot: (snapshot) => ports.applyNetworkSnapshot(snapshot),
        handleNetworkCombatEvent: (event) => ports.handleNetworkCombatEvent(event),
        openNetworkLoot: (grant) => ports.openNetworkLoot(grant),
        handleNetworkAutoLootGrant: (grant) => ports.handleNetworkAutoLootGrant(grant),
        handleNetworkInventoryConsumed: (message) => ports.handleNetworkInventoryConsumed(message),
        handleNetworkActionRejected: (rejection) => ports.handleNetworkActionRejected(rejection),
        log: (message) => ports.log(message),
    });
    return { raidOutcomeController, raidLifecycleController };
}
