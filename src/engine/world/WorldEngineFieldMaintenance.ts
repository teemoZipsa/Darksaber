import { removeStatusesFromCarrier } from '../../combat/StatusEffects';
import type { InputManager } from '../InputManager';
import type { Camera } from '../Camera';
import type { GameManager } from '../GameManager';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineFieldState } from './WorldEngineFieldState';
import type { WorldEngineFlowState } from './WorldEngineFlowState';
import type { WorldEnginePresentationControllers } from './WorldEnginePresentationControllers';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineUiState } from './WorldEngineUiState';
import type { WorldEngineWorldControllers } from './WorldEngineWorldControllers';

export interface WorldEngineFieldOverlayPorts {
    gameManager: GameManager;
    actionControllers: WorldEngineActionControllers;
    presentationControllers: WorldEnginePresentationControllers;
    closeActionMenu(): void;
}

export function closeWorldEngineFieldOverlays(ports: WorldEngineFieldOverlayPorts): void {
    const { gameManager, actionControllers, presentationControllers } = ports;
    if (gameManager.inventoryUI.isVisible()) gameManager.inventoryUI.toggle();
    if (gameManager.partyUI.isVisible()) gameManager.partyUI.toggle();
    if (gameManager.charUI.isVisible()) gameManager.charUI.toggle();
    gameManager.closeQuestJournal();
    gameManager.closePauseMenu();
    ports.closeActionMenu();
    presentationControllers.tacticalController.close();
    actionControllers.magicController.reset();
    actionControllers.toolController?.reset();
    actionControllers.playerActionController.clearTargeting();
}

export interface WorldEngineFieldTurnResetPorts {
    actionControllers: WorldEngineActionControllers;
    fieldState: WorldEngineFieldState;
    flowState: WorldEngineFlowState;
    runtimeState: WorldEngineRuntimeState;
    uiState: WorldEngineUiState;
    worldControllers: WorldEngineWorldControllers;
    closeActionMenu(): void;
}

export function clearWorldEngineFieldTurnState(ports: WorldEngineFieldTurnResetPorts): void {
    const { actionControllers, fieldState, flowState, runtimeState, uiState, worldControllers } = ports;
    flowState.turnStateController.clear();
    uiState.fieldFeedback.clearCombatPresentation();
    runtimeState.fanfareLeaderActorId = null;
    worldControllers.restingController.clearTimers();
    ports.closeActionMenu();
    actionControllers.magicController.reset();
    actionControllers.toolController?.reset();
    for (const actor of fieldState.partyActors) {
        actor.path = [];
        actor.queuedIntent = null;
        actor.entity.actionGauge = 0;
        actor.entity.releaseDefeatedPresentation();
        removeStatusesFromCarrier(actor.character, (status) => status.kind === 'resting');
    }
    for (const entry of fieldState.fieldEnemies) {
        entry.path = [];
        entry.previewIntent = null;
        entry.enemy.actionGauge = 0;
        entry.enemy.isAggro = false;
        entry.enemy.releaseDefeatedPresentation();
    }
}

export interface WorldEngineStoryPresentationPorts {
    camera: Camera;
    scenarioNetworkControllers: WorldEngineScenarioNetworkControllers;
    uiState: WorldEngineUiState;
    updateAttackCues(dt: number): void;
    syncControlledPlayer(): void;
}

export function updateWorldEngineStoryPresentation(
    ports: WorldEngineStoryPresentationPorts,
    dt: number
): boolean {
    const { camera, scenarioNetworkControllers, uiState } = ports;
    if (!scenarioNetworkControllers.storyScenarioController.isPresentationActive()) return false;
    scenarioNetworkControllers.storyScenarioController.updatePresentation(dt);
    uiState.effectManager.update(dt);
    uiState.floatingText.update(dt);
    ports.updateAttackCues(dt);
    ports.syncControlledPlayer();
    camera.update(dt);
    return true;
}

export function updateWorldEngineFieldEntities(fieldState: WorldEngineFieldState, dt: number): void {
    for (const actor of fieldState.partyActors) actor.entity.update(dt);
    for (const entry of fieldState.fieldEnemies) entry.enemy.update(dt);
}

export interface WorldEngineNetworkRaidUpdatePorts {
    camera: Camera;
    fieldState: WorldEngineFieldState;
    input: InputManager;
    presentationControllers: WorldEnginePresentationControllers;
    scenarioNetworkControllers: WorldEngineScenarioNetworkControllers;
    uiState: WorldEngineUiState;
    followPlayerCamera(camera: Camera, dt: number): void;
    refreshLootState(): void;
    refreshOpenActionMenuState(): void;
    syncControlledPlayer(): void;
    updateAttackCues(dt: number): void;
    updateStoryPresentation(dt: number, camera: Camera): boolean;
}

export function updateWorldEngineNetworkRaid(ports: WorldEngineNetworkRaidUpdatePorts, dt: number): void {
    if (ports.updateStoryPresentation(dt, ports.camera)) return;

    ports.refreshOpenActionMenuState();
    ports.presentationControllers.inputController.process(ports.input, ports.camera);
    updateWorldEngineFieldEntities(ports.fieldState, dt);
    ports.scenarioNetworkControllers.networkSyncController.refreshMovePathPreview();
    ports.uiState.effectManager.update(dt);
    ports.uiState.floatingText.update(dt);
    ports.updateAttackCues(dt);
    ports.refreshLootState();
    ports.scenarioNetworkControllers.storyScenarioController.checkDungeonArrival();
    ports.refreshOpenActionMenuState();
    ports.syncControlledPlayer();
    ports.followPlayerCamera(ports.camera, dt);
}
