import type { FieldActor, FieldTurnEndReason } from '../../field/FieldTypes';
import type { ActionMenuUI } from '../../ui/ActionMenuUI';
import type { EffectManager } from '../../ui/EffectManager';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { FusionTempleUI } from '../../ui/FusionTempleUI';
import type { Camera } from '../Camera';
import type { InputManager } from '../InputManager';
import { WorldEngineActionTurnFlow } from './WorldEngineActionTurnFlow';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineNetworkState } from './WorldEngineNetworkState';
import type { WorldEnginePresentationControllers } from './WorldEnginePresentationControllers';
import type { WorldEngineRaidLifecycleControllers } from './WorldEngineRaidLifecycleControllers';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineUiState } from './WorldEngineUiState';
import { WorldEngineUpdateFlow } from './WorldEngineUpdateFlow';
import type { WorldEngineWorldControllers } from './WorldEngineWorldControllers';
import type { WorldNetworkIntentController } from './WorldNetworkIntentController';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import type { WorldTempleController } from './WorldTempleController';
import type { WorldTownSession } from './WorldTownSession';
import type { WorldTutorialController } from './WorldTutorialController';
import type { WorldTurnStateController } from './WorldTurnStateController';

export interface WorldEngineUpdateFlowPorts {
    townSession: WorldTownSession;
    raidOutcomeController: WorldEngineRaidLifecycleControllers['raidOutcomeController'];
    fusionTempleUI: FusionTempleUI;
    tutorialController: WorldTutorialController;
    inputController: WorldEnginePresentationControllers['inputController'];
    effectManager: EffectManager;
    floatingText: FloatingTextManager;
    playerActionController: WorldEngineActionControllers['playerActionController'];
    tacticalController: WorldEnginePresentationControllers['tacticalController'];
    raidLifecycleController: WorldEngineRaidLifecycleControllers['raidLifecycleController'];
    templeController: WorldTempleController;
    storyScenarioController: WorldStoryScenarioController;
    advanceWorldTime(dt: number): void;
    isNetworkRaid(): boolean;
    updateNetworkRaid(dt: number, input: InputManager, camera: Camera): void;
    updateStoryPresentation(dt: number, camera: Camera): boolean;
    refreshOpenActionMenuState(): void;
    updatePartyMovement(dt: number): void;
    updateEnemyMovement(dt: number): void;
    refreshEnemyIntentPreviews(): void;
    updateRestingActors(dt: number): void;
    updateAttackCues(dt: number): void;
    refreshLootState(): void;
    startNextReadyTurn(): void;
    syncControlledPlayer(): void;
    followPlayerCamera(camera: Camera, dt: number): void;
}

export interface WorldEngineUpdateFlowSources {
    townSession: WorldTownSession;
    getUiState(): WorldEngineUiState;
    getNetworkState(): WorldEngineNetworkState;
    getRuntimeState(): WorldEngineRuntimeState;
    getActionControllers(): WorldEngineActionControllers;
    getPresentationControllers(): WorldEnginePresentationControllers;
    getRaidLifecycleControllers(): WorldEngineRaidLifecycleControllers;
    getWorldControllers(): WorldEngineWorldControllers;
    getScenarioNetworkControllers(): WorldEngineScenarioNetworkControllers;
    updateNetworkRaid(dt: number, input: InputManager, camera: Camera): void;
    updateStoryPresentation(dt: number, camera: Camera): boolean;
    refreshOpenActionMenuState(): void;
    updatePartyMovement(dt: number): void;
    updateEnemyMovement(dt: number): void;
    refreshEnemyIntentPreviews(): void;
    updateRestingActors(dt: number): void;
    updateAttackCues(dt: number): void;
    refreshLootState(): void;
    startNextReadyTurn(): void;
    syncControlledPlayer(): void;
    followPlayerCamera(camera: Camera, dt: number): void;
}

export interface WorldEngineActionTurnFlowPorts {
    actionMenuUI: ActionMenuUI;
    tutorialController: WorldTutorialController;
    turnStateController: WorldTurnStateController;
    selectionController: WorldEngineActionControllers['selectionController'];
    playerActionController: WorldEngineActionControllers['playerActionController'];
    networkIntentController: WorldNetworkIntentController;
    magicController: WorldEngineActionControllers['magicController'];
    toolController: WorldEngineActionControllers['toolController'];
    getControlledActor(): FieldActor | null;
    getActivePartyTurnActor(): FieldActor | null;
    getSpendableActionGauge(): number;
    beginActorTurn(actor: FieldActor): void;
    closeActionMenu(): void;
    closeTacticalMenu(): void;
    clearActorIntent(actor: FieldActor): void;
    log(message: string): void;
}

export function createWorldEngineUpdateFlow(ports: WorldEngineUpdateFlowPorts): WorldEngineUpdateFlow {
    return new WorldEngineUpdateFlow({
        advanceWorldTime: (dt) => ports.advanceWorldTime(dt),
        syncTown: () => ports.townSession.sync(),
        isRaidOutcomeVisible: () => ports.raidOutcomeController.isVisible(),
        updateRaidOutcomeInput: (input) => ports.raidOutcomeController.updateInput(input),
        isFusionTempleVisible: () => ports.fusionTempleUI.isVisible(),
        updateFusionTempleInput: (input) => ports.fusionTempleUI.updateInput(input),
        isTownVisible: () => ports.townSession.isVisible(),
        updateTownInput: (input) => ports.townSession.updateInput(input),
        isTutorialActive: () => ports.tutorialController.isActive(),
        isTutorialCompletePending: () => ports.tutorialController.isCompletePending(),
        updateTutorialCompletion: (input, dt, camera) => ports.tutorialController.updateCompletion(input, dt, camera),
        finishTutorial: (skipReward) => ports.tutorialController.finish(skipReward),
        addTutorialBlockedLog: () => ports.tutorialController.addBlockedLog(),
        isNetworkRaid: () => ports.isNetworkRaid(),
        updateNetworkRaid: (dt, input, camera) => ports.updateNetworkRaid(dt, input, camera),
        updateStoryPresentation: (dt, camera) => ports.updateStoryPresentation(dt, camera),
        refreshOpenActionMenuState: () => ports.refreshOpenActionMenuState(),
        processInput: (input, camera) => ports.inputController.process(input, camera),
        updatePartyMovement: (dt) => ports.updatePartyMovement(dt),
        updateEnemyMovement: (dt) => ports.updateEnemyMovement(dt),
        refreshEnemyIntentPreviews: () => ports.refreshEnemyIntentPreviews(),
        updateRestingActors: (dt) => ports.updateRestingActors(dt),
        updateEffects: (dt) => ports.effectManager.update(dt),
        updateFloatingText: (dt) => ports.floatingText.update(dt),
        updateAttackCues: (dt) => ports.updateAttackCues(dt),
        processQueuedIntents: () => ports.playerActionController.processQueuedIntents(),
        refreshLootState: () => ports.refreshLootState(),
        updateTacticalMarkers: (dt) => ports.tacticalController.updateMarkers(dt),
        startNextReadyTurn: () => ports.startNextReadyTurn(),
        updateRaidTimer: (dt) => ports.raidLifecycleController.updateRaidTimer(dt),
        checkRaidEndConditions: () => ports.raidLifecycleController.checkRaidEndConditions(),
        checkTempleArrival: () => ports.templeController.checkArrival(),
        checkDungeonArrival: () => ports.storyScenarioController.checkDungeonArrival(),
        syncControlledPlayer: () => ports.syncControlledPlayer(),
        followPlayerCamera: (camera, dt) => ports.followPlayerCamera(camera, dt),
    });
}

export function createWorldEngineUpdateFlowFromSources(
    sources: WorldEngineUpdateFlowSources
): WorldEngineUpdateFlow {
    const uiState = sources.getUiState();
    const actionControllers = sources.getActionControllers();
    const presentationControllers = sources.getPresentationControllers();
    const raidLifecycleControllers = sources.getRaidLifecycleControllers();
    const worldControllers = sources.getWorldControllers();
    const scenarioNetworkControllers = sources.getScenarioNetworkControllers();

    return createWorldEngineUpdateFlow({
        townSession: sources.townSession,
        raidOutcomeController: raidLifecycleControllers.raidOutcomeController,
        fusionTempleUI: uiState.fusionTempleUI,
        tutorialController: scenarioNetworkControllers.tutorialController,
        inputController: presentationControllers.inputController,
        effectManager: uiState.effectManager,
        floatingText: uiState.floatingText,
        playerActionController: actionControllers.playerActionController,
        tacticalController: presentationControllers.tacticalController,
        raidLifecycleController: raidLifecycleControllers.raidLifecycleController,
        templeController: worldControllers.templeController,
        storyScenarioController: scenarioNetworkControllers.storyScenarioController,
        advanceWorldTime: (dt) => { sources.getRuntimeState().worldTime += dt; },
        isNetworkRaid: () => sources.getNetworkState().isRaid,
        updateNetworkRaid: (dt, input, camera) => sources.updateNetworkRaid(dt, input, camera),
        updateStoryPresentation: (dt, camera) => sources.updateStoryPresentation(dt, camera),
        refreshOpenActionMenuState: () => sources.refreshOpenActionMenuState(),
        updatePartyMovement: (dt) => sources.updatePartyMovement(dt),
        updateEnemyMovement: (dt) => sources.updateEnemyMovement(dt),
        refreshEnemyIntentPreviews: () => sources.refreshEnemyIntentPreviews(),
        updateRestingActors: (dt) => sources.updateRestingActors(dt),
        updateAttackCues: (dt) => sources.updateAttackCues(dt),
        refreshLootState: () => sources.refreshLootState(),
        startNextReadyTurn: () => sources.startNextReadyTurn(),
        syncControlledPlayer: () => sources.syncControlledPlayer(),
        followPlayerCamera: (camera, dt) => sources.followPlayerCamera(camera, dt),
    });
}

export function createWorldEngineActionTurnFlow(ports: WorldEngineActionTurnFlowPorts): WorldEngineActionTurnFlow {
    return new WorldEngineActionTurnFlow({
        getControlledActor: () => ports.getControlledActor(),
        getActivePartyTurnActor: () => ports.getActivePartyTurnActor(),
        getSpendableActionGauge: () => ports.getSpendableActionGauge(),
        getActionMenuIsOpen: () => ports.actionMenuUI.getIsOpen(),
        openActionMenu: (states) => ports.actionMenuUI.open(states),
        updateActionMenuStates: (states) => ports.actionMenuUI.updateStates(states),
        closeActionMenu: () => ports.closeActionMenu(),
        closeTacticalMenu: () => ports.closeTacticalMenu(),
        selectActor: (actorId) => ports.selectionController.selectActor(actorId),
        getActionMenuStates: (actor) => ports.tutorialController.getActionMenuStates(actor),
        isTutorialActive: () => ports.tutorialController.isActive(),
        addTutorialBlockedLog: () => ports.tutorialController.addBlockedLog(),
        getActiveTurnActorId: () => ports.turnStateController.getActiveTurnActorId(),
        beginActorTurn: (actor) => ports.beginActorTurn(actor),
        spendTurnAp: (cost, fallbackGauge) => ports.turnStateController.spendAp(cost, fallbackGauge),
        getRemainingActionPoints: () => ports.turnStateController.getRemainingActionPoints(),
        setRemainingActionPoints: (points) => ports.turnStateController.setRemainingActionPoints(points),
        getDismissCarryover: () => ports.turnStateController.getDismissCarryover(),
        endActiveTurn: () => ports.turnStateController.endActiveTurn(),
        hasExecutableAction: (actor) => ports.playerActionController.hasExecutableAction(actor),
        submitEndTurn: (actor, reason: FieldTurnEndReason) => ports.networkIntentController.submitEndTurn(actor, reason),
        clearActorIntent: (actor) => ports.clearActorIntent(actor),
        clearTargeting: () => ports.playerActionController.clearTargeting(),
        resetMagic: () => ports.magicController.reset(),
        resetTool: () => ports.toolController?.reset(),
        log: (message) => ports.log(message),
    });
}
