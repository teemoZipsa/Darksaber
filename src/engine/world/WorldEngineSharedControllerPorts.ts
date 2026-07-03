import type { Character } from '../../character/Character';
import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import type { Enemy } from '../../entity/Enemy';
import type { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import type { NetworkRaidClient } from '../../net/NetworkRaidClient';
import type { GameManager } from '../GameManager';
import type { Camera } from '../Camera';
import type { CombatFeedbackKind } from './CombatFeedback';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineFieldState } from './WorldEngineFieldState';
import type { WorldEngineFlowState } from './WorldEngineFlowState';
import type { WorldEngineNetworkState } from './WorldEngineNetworkState';
import type { WorldEngineRaidLifecycleControllers } from './WorldEngineRaidLifecycleControllers';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineUiState } from './WorldEngineUiState';
import type { WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';

export interface WorldEngineSharedControllerPorts {
    camera: Camera;
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    fusionTempleUI: WorldEngineUiState['fusionTempleUI'];
    actionMenuUI: WorldEngineUiState['actionMenuUI'];
    floatingText: WorldEngineUiState['floatingText'];
    effectManager: WorldEngineUiState['effectManager'];
    fieldFeedback: WorldEngineUiState['fieldFeedback'];
    turnStateController: WorldEngineFlowState['turnStateController'];
    getWorldMap(): WorldMap;
    setWorldMap(worldMap: WorldMap): void;
    getPlayer(): Player;
    setPlayer(player: Player): void;
    getPartyActors(): FieldActor[];
    setPartyActors(actors: FieldActor[]): void;
    getRemotePartyActors(): Map<string, FieldActor>;
    clearRemotePartyActors(): void;
    getFieldEnemies(): FieldEnemy[];
    setFieldEnemies(enemies: FieldEnemy[]): void;
    getControlledActor(): FieldActor | null;
    getActivePartyTurnActor(): FieldActor | null;
    getCurrentHubTown(): TownInfo;
    openTown(town: TownInfo): void;
    placePartyNear(tile: TilePoint, overrideMembers?: Character[]): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    selectActor(actorId: string | null): void;
    clearSelection(): void;
    hasSelection(): boolean;
    selectLoot(lootId: string): void;
    isNetworkRaid(): boolean;
    getNetworkRaidClient(): NetworkRaidClient | null;
    getNetworkPlayerId(): string | null;
    isRaidOutcomeVisible(): boolean;
    setCurrentPhase(phase: WorldEngineRuntimeState['currentPhase']): void;
    getTurnActionStates(actor: FieldActor): ReturnType<WorldEngineActionControllers['playerActionController']['getTurnActionStates']>;
    getPlayerActionMode(): ReturnType<WorldEngineActionControllers['playerActionController']['getMode']>;
    hasExecutableAction(actor: FieldActor): boolean;
    reopenActionMenu(actor: FieldActor): void;
    getEnemyById(enemyId: string): Enemy | null;
    updateAttackCues(dt: number): void;
    beginCombatFeedbackGroup(): string;
    registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void;
    flushCombatFeedbackGroup(feedbackGroupId: string): void;
    addCombatLog(message: string): void;
}

export interface WorldEngineSharedControllerPortSources {
    camera: Camera;
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    getUiState(): WorldEngineUiState;
    getFlowState(): WorldEngineFlowState;
    getFieldState(): WorldEngineFieldState;
    getNetworkState(): WorldEngineNetworkState;
    getRuntimeState(): WorldEngineRuntimeState;
    getActionControllers(): WorldEngineActionControllers;
    getRaidLifecycleControllers(): WorldEngineRaidLifecycleControllers;
    getWorldMap(): WorldMap;
    setWorldMap(worldMap: WorldMap): void;
    getPlayer(): Player;
    setPlayer(player: Player): void;
    getControlledActor(): FieldActor | null;
    getActivePartyTurnActor(): FieldActor | null;
    getCurrentHubTown(): TownInfo;
    openTown(town: TownInfo): void;
    placePartyNear(tile: TilePoint, overrideMembers?: Character[]): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    reopenActionMenu(actor: FieldActor): void;
    getEnemyById(enemyId: string): Enemy | null;
    updateAttackCues(dt: number): void;
    beginCombatFeedbackGroup(): string;
    registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void;
    flushCombatFeedbackGroup(feedbackGroupId: string): void;
    addCombatLog(message: string): void;
}

export function createWorldEngineSharedControllerPorts(
    sources: WorldEngineSharedControllerPortSources
): WorldEngineSharedControllerPorts {
    const uiState = sources.getUiState();
    return {
        camera: sources.camera,
        party: sources.party,
        playerData: sources.playerData,
        gameManager: sources.gameManager,
        raidSession: sources.raidSession,
        townSession: sources.townSession,
        fusionTempleUI: uiState.fusionTempleUI,
        actionMenuUI: uiState.actionMenuUI,
        floatingText: uiState.floatingText,
        effectManager: uiState.effectManager,
        fieldFeedback: uiState.fieldFeedback,
        turnStateController: sources.getFlowState().turnStateController,
        getWorldMap: () => sources.getWorldMap(),
        setWorldMap: (worldMap) => sources.setWorldMap(worldMap),
        getPlayer: () => sources.getPlayer(),
        setPlayer: (player) => sources.setPlayer(player),
        getPartyActors: () => sources.getFieldState().partyActors,
        setPartyActors: (actors) => { sources.getFieldState().partyActors = actors; },
        getRemotePartyActors: () => sources.getFieldState().remotePartyActors,
        clearRemotePartyActors: () => sources.getFieldState().remotePartyActors.clear(),
        getFieldEnemies: () => sources.getFieldState().fieldEnemies,
        setFieldEnemies: (fieldEnemies) => { sources.getFieldState().fieldEnemies = fieldEnemies; },
        getControlledActor: () => sources.getControlledActor(),
        getActivePartyTurnActor: () => sources.getActivePartyTurnActor(),
        getCurrentHubTown: () => sources.getCurrentHubTown(),
        openTown: (town) => sources.openTown(town),
        placePartyNear: (tile, overrideMembers) => sources.placePartyNear(tile, overrideMembers),
        closeFieldOverlays: () => sources.closeFieldOverlays(),
        clearFieldTurnState: () => sources.clearFieldTurnState(),
        selectActor: (actorId) => sources.getActionControllers().selectionController.selectActor(actorId),
        clearSelection: () => sources.getActionControllers().selectionController.clear(),
        hasSelection: () => sources.getActionControllers().selectionController.hasSelection(),
        selectLoot: (lootId) => sources.getActionControllers().selectionController.selectLoot(lootId),
        isNetworkRaid: () => sources.getNetworkState().isRaid,
        getNetworkRaidClient: () => sources.getNetworkState().raidClient,
        getNetworkPlayerId: () => sources.getNetworkState().playerId,
        isRaidOutcomeVisible: () => sources.getRaidLifecycleControllers().raidOutcomeController.isVisible(),
        setCurrentPhase: (phase) => { sources.getRuntimeState().currentPhase = phase; },
        getTurnActionStates: (actor) => sources.getActionControllers().playerActionController.getTurnActionStates(actor),
        getPlayerActionMode: () => sources.getActionControllers().playerActionController.getMode(),
        hasExecutableAction: (actor) => sources.getActionControllers().playerActionController.hasExecutableAction(actor),
        reopenActionMenu: (actor) => sources.reopenActionMenu(actor),
        getEnemyById: (enemyId) => sources.getEnemyById(enemyId),
        updateAttackCues: (dt) => sources.updateAttackCues(dt),
        beginCombatFeedbackGroup: () => sources.beginCombatFeedbackGroup(),
        registerCombatFeedback: (kind, feedbackGroupId) => sources.registerCombatFeedback(kind, feedbackGroupId),
        flushCombatFeedbackGroup: (feedbackGroupId) => sources.flushCombatFeedbackGroup(feedbackGroupId),
        addCombatLog: (message) => sources.addCombatLog(message),
    };
}
