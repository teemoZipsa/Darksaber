import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { Player } from '../../entity/Player';
import type { FieldHit } from '../../field/FieldInteraction';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy, FieldHitParty } from '../../field/FieldTypes';
import type { WorldMap } from '../../map/WorldMap';
import type { ActionMenuUI } from '../../ui/ActionMenuUI';
import type { EntityInfoUI } from '../../ui/EntityInfoUI';
import type { EffectManager } from '../../ui/EffectManager';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { FusionTempleUI } from '../../ui/FusionTempleUI';
import type { MinimapUI } from '../../ui/MinimapUI';
import { isEntityMoving } from './WorldEngineFieldHelpers';
import { getWorldActorTerrainTraits } from './WorldAttackTargeting';
import { WorldInputController } from './WorldInputController';
import { WorldRenderController } from './WorldRenderController';
import type { WorldMagicController } from './WorldMagicController';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldPlayerActionController } from './WorldPlayerActionController';
import type { WorldRaidOutcomeController } from './WorldRaidOutcomeController';
import type { WorldSelectionController } from './WorldSelectionController';
import type { WorldToolController } from './WorldToolController';
import { WorldTacticalController } from './WorldTacticalController';
import type { WorldTownSession } from './WorldTownSession';
import type { WorldTutorialController } from './WorldTutorialController';
import type { WorldFieldFeedbackState } from './WorldFieldFeedbackState';
import type { WorldTurnStateController } from './WorldTurnStateController';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineRaidLifecycleControllers } from './WorldEngineRaidLifecycleControllers';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineSharedControllerPorts } from './WorldEngineSharedControllerPorts';
import type { WorldEngineUiState } from './WorldEngineUiState';
import type { WorldEngineWorldControllers } from './WorldEngineWorldControllers';
import type { GameManager } from '../GameManager';
import { SettingsManager } from '../SettingsManager';

type WorldPresentationFieldHit = FieldHit<FieldHitParty, Enemy, LootObject>;

export interface WorldEnginePresentationControllerPorts {
    canvas: HTMLCanvasElement;
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    townSession: WorldTownSession;
    raidSession: WorldRaidSession;
    fusionTempleUI: FusionTempleUI;
    actionMenuUI: ActionMenuUI;
    entityInfoUI: EntityInfoUI;
    effectManager: EffectManager;
    floatingText: FloatingTextManager;
    minimapUI: MinimapUI;
    magicController: WorldMagicController;
    toolController: WorldToolController;
    playerActionController: WorldPlayerActionController;
    raidOutcomeController: WorldRaidOutcomeController;
    selectionController: WorldSelectionController;
    tutorialController: WorldTutorialController;
    turnStateController: WorldTurnStateController;
    fieldFeedback: WorldFieldFeedbackState;
    getWorldMap(): WorldMap;
    getWorldTime(): number;
    getPhase(): WorldPhase;
    getPlayer(): Player;
    getControlledActor(): FieldActor | null;
    getActivePartyTurnActor(): FieldActor | null;
    getPartyActors(): FieldActor[];
    getFieldEnemies(): FieldEnemy[];
    getSpendableActionGauge(): number;
    getHoverTile(): TilePoint;
    setHoverTile(tile: TilePoint): void;
    getPathPreviewTiles(actor: FieldActor | null): TilePoint[];
    resolveFieldHitAt(tile: TilePoint): WorldPresentationFieldHit;
    getEnemyById(enemyId: string): Enemy | null;
    isTurnCombatActive(): boolean;
    switchToNextAliveActor(): void;
    switchToPartyMember(index: number): boolean;
    toggleActionMenuForControlled(): void;
    closeActionMenu(): void;
    dismissActionMenuTurn(): void;
    closeTacticalMenu(): void;
    clearIntent(): void;
    openPauseMenu(): void;
    addCombatLog(message: string): void;
}

export interface WorldEnginePresentationControllers {
    tacticalController: WorldTacticalController;
    renderController: WorldRenderController;
    inputController: WorldInputController;
}

export interface WorldEnginePresentationControllerSources {
    canvas: HTMLCanvasElement;
    ports: WorldEngineSharedControllerPorts;
    getUiState(): WorldEngineUiState;
    getRuntimeState(): WorldEngineRuntimeState;
    getActionControllers(): WorldEngineActionControllers;
    getRaidLifecycleControllers(): WorldEngineRaidLifecycleControllers;
    getScenarioNetworkControllers(): WorldEngineScenarioNetworkControllers;
    getWorldControllers(): WorldEngineWorldControllers;
    getSpendableActionGauge(): number;
    getPathPreviewTiles(actor: FieldActor | null): TilePoint[];
    resolveFieldHitAt(tile: TilePoint): WorldPresentationFieldHit;
    isTurnCombatActive(): boolean;
    switchToNextAliveActor(): void;
    switchToPartyMember(index: number): boolean;
    toggleActionMenuForControlled(): void;
    closeActionMenu(): void;
    dismissActionMenuTurn(): void;
    closeTacticalMenu(): void;
    clearIntent(): void;
    openPauseMenu(): void;
}

export function createWorldEnginePresentationControllersFromSources(
    sources: WorldEnginePresentationControllerSources
): WorldEnginePresentationControllers {
    const uiState = sources.getUiState();
    const actionControllers = sources.getActionControllers();
    const raidLifecycleControllers = sources.getRaidLifecycleControllers();
    const scenarioNetworkControllers = sources.getScenarioNetworkControllers();
    const worldControllers = sources.getWorldControllers();

    return createWorldEnginePresentationControllers({
        ...sources.ports,
        canvas: sources.canvas,
        entityInfoUI: uiState.entityInfoUI,
        minimapUI: worldControllers.minimapUI,
        magicController: actionControllers.magicController,
        toolController: actionControllers.toolController,
        playerActionController: actionControllers.playerActionController,
        raidOutcomeController: raidLifecycleControllers.raidOutcomeController,
        selectionController: actionControllers.selectionController,
        tutorialController: scenarioNetworkControllers.tutorialController,
        getWorldTime: () => sources.getRuntimeState().worldTime,
        getPhase: () => sources.getRuntimeState().currentPhase,
        getSpendableActionGauge: () => sources.getSpendableActionGauge(),
        getHoverTile: () => sources.getRuntimeState().hoverTile,
        setHoverTile: (tile) => { sources.getRuntimeState().hoverTile = tile; },
        getPathPreviewTiles: (actor) => sources.getPathPreviewTiles(actor),
        resolveFieldHitAt: (tile) => sources.resolveFieldHitAt(tile),
        isTurnCombatActive: () => sources.isTurnCombatActive(),
        switchToNextAliveActor: () => sources.switchToNextAliveActor(),
        switchToPartyMember: (index) => sources.switchToPartyMember(index),
        toggleActionMenuForControlled: () => sources.toggleActionMenuForControlled(),
        closeActionMenu: () => sources.closeActionMenu(),
        dismissActionMenuTurn: () => sources.dismissActionMenuTurn(),
        closeTacticalMenu: () => sources.closeTacticalMenu(),
        clearIntent: () => sources.clearIntent(),
        openPauseMenu: () => sources.openPauseMenu(),
    });
}

export function createWorldEnginePresentationControllers(
    ports: WorldEnginePresentationControllerPorts
): WorldEnginePresentationControllers {
    const tacticalController = new WorldTacticalController({
        resolveFieldHitAt: (tile) => ports.resolveFieldHitAt(tile),
        getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
        getPartyActors: () => ports.getPartyActors(),
        getLoot: () => ports.getWorldMap().loot,
        log: (message) => ports.addCombatLog(message),
    });

    const renderController = new WorldRenderController({
        party: ports.party,
        playerData: ports.playerData,
        getWorldMap: () => ports.getWorldMap(),
        townSession: ports.townSession,
        raidSession: ports.raidSession,
        fusionTempleUI: ports.fusionTempleUI,
        actionMenuUI: ports.actionMenuUI,
        entityInfoUI: ports.entityInfoUI,
        effectManager: ports.effectManager,
        floatingText: ports.floatingText,
        minimapUI: ports.minimapUI,
        magicController: ports.magicController,
        toolController: ports.toolController,
        playerActionController: ports.playerActionController,
        raidOutcomeController: ports.raidOutcomeController,
        tacticalController,
        selectionController: ports.selectionController,
        getWorldTime: () => ports.getWorldTime(),
        getPhase: () => ports.getPhase(),
        getPlayer: () => ports.getPlayer(),
        getControlledActor: () => ports.getControlledActor(),
        getPartyActors: () => ports.getPartyActors(),
        getTutorialActors: () => ports.tutorialController.getInstructor() ? [ports.tutorialController.getInstructor()!] : [],
        getFieldEnemies: () => ports.getFieldEnemies(),
        getActiveTurnActorId: () => ports.turnStateController.getActiveTurnActorId(),
        getRemainingActionPoints: () => ports.getSpendableActionGauge(),
        getMajorActionUsedThisTurn: () => ports.turnStateController.getMajorActionUsedThisTurn(),
        getHoverTile: () => ports.getHoverTile(),
        getPathPreviewTiles: (actor) => ports.getPathPreviewTiles(actor),
        getAttackCues: () => ports.fieldFeedback.attackCues,
        getCombatLog: () => ports.fieldFeedback.combatLog,
        isCombatPresentationBusy: () => ports.fieldFeedback.isCombatPresentationBusy(),
        hasBackpackItem: (itemId) => ports.gameManager.inventory.items.some((placed) => placed.item.id === itemId),
        getActorTerrainTraits: (actor) => getWorldActorTerrainTraits(actor),
        isTurnCombatActive: () => ports.isTurnCombatActive(),
    });

    const inputController = new WorldInputController({
        actionMenuUI: ports.actionMenuUI,
        entityInfoUI: ports.entityInfoUI,
        magicController: ports.magicController,
        toolController: ports.toolController,
        minimapUI: ports.minimapUI,
        playerActionController: ports.playerActionController,
        selectionController: ports.selectionController,
        tacticalController,
        getCanvasSize: () => {
            const uiScale = SettingsManager.getUIScale();
            return {
                width: Math.floor((ports.canvas.clientWidth || ports.canvas.width) / uiScale),
                height: Math.floor((ports.canvas.clientHeight || ports.canvas.height) / uiScale),
            };
        },
        isFieldHudInteractive: () => !ports.tutorialController.isActive(),
        getActivePartyTurnActor: () => ports.getActivePartyTurnActor(),
        getActiveTurnActorId: () => ports.turnStateController.getActiveTurnActorId(),
        getReservedAction: () => ports.turnStateController.getReservedAction(),
        getControlledActor: () => ports.getControlledActor(),
        getPartyActors: () => ports.getPartyActors(),
        getHoverTile: () => ports.getHoverTile(),
        setHoverTile: (tile) => ports.setHoverTile(tile),
        isEntityMoving: (entity) => isEntityMoving(entity),
        resolveFieldHitAt: (tile) => ports.resolveFieldHitAt(tile),
        switchToNextAliveActor: () => ports.switchToNextAliveActor(),
        switchToPartyMember: (index) => ports.switchToPartyMember(index),
        toggleActionMenuForControlled: () => ports.toggleActionMenuForControlled(),
        closeActionMenu: () => ports.closeActionMenu(),
        dismissActionMenuTurn: () => ports.dismissActionMenuTurn(),
        closeTacticalMenu: () => ports.closeTacticalMenu(),
        clearIntent: () => ports.clearIntent(),
        log: (message) => ports.addCombatLog(message),
        getCombatLog: () => ports.fieldFeedback.combatLog,
        isCombatPresentationBusy: () => ports.fieldFeedback.isCombatPresentationBusy(),
        onUnhandledEscape: () => ports.openPauseMenu(),
    });

    return {
        tacticalController,
        renderController,
        inputController,
    };
}
