/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { PartyManager } from '../character/PartyManager';
import type { Character } from '../character/Character';
import { GridInventory } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { formatT, t } from '../i18n/LanguageManager';
import { removeStatusesFromCarrier } from '../combat/StatusEffects';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { TownInfo } from '../map/BiomeMask';
import { resolveFieldHit } from '../field/FieldInteraction';
import type { TilePoint } from '../field/FieldPathing';
import type { FieldActor, FieldEnemy, FieldHitParty, FieldTurnEndReason } from '../field/FieldTypes';
import { WorldRaidSession } from './world/WorldRaidSession';
import { WorldTownSession } from './world/WorldTownSession';
import type { CombatResult } from './world/WorldCombatController';
import type { WorldTurnStateController } from './world/WorldTurnStateController';
import {
    createWorldEngineSharedControllerPorts,
    type WorldEngineSharedControllerPorts,
} from './world/WorldEngineSharedControllerPorts';
import {
    createWorldEngineControllerState,
    type WorldEngineControllerState,
} from './world/WorldEngineControllerState';
import {
    createWorldEngineCoreState,
    type WorldEngineCoreState,
} from './world/WorldEngineCoreState';
import {
    createWorldEngineFieldState,
    type WorldEngineFieldState,
} from './world/WorldEngineFieldState';
import {
    createWorldEngineFlowState,
    type WorldEngineFlowState,
} from './world/WorldEngineFlowState';
import {
    createWorldEngineRuntimeState,
    type WorldEngineRuntimeState,
} from './world/WorldEngineRuntimeState';
import {
    createWorldEngineUiState,
    type WorldEngineUiState,
} from './world/WorldEngineUiState';
import type { WorldEngineActionTurnFlow } from './world/WorldEngineActionTurnFlow';
import type { WorldEngineUpdateFlow } from './world/WorldEngineUpdateFlow';
import {
    createWorldEngineActionTurnFlow,
    createWorldEngineUpdateFlowFromSources,
} from './world/WorldEngineFlows';
import { runWorldEngineStartupFlowFromSources } from './world/WorldEngineStartupFlow';
import {
    createWorldEngineNetworkState,
    type WorldEngineNetworkState,
} from './world/WorldEngineNetworkState';
import {
    createWorldEngineScenarioNetworkControllers,
    type WorldEngineScenarioNetworkControllers,
} from './world/WorldEngineScenarioNetworkControllers';
import {
    createWorldEngineWorldControllers,
    type WorldEngineWorldControllers,
} from './world/WorldEngineWorldControllers';
import {
    createWorldEngineCombatControllers,
    type WorldEngineCombatControllers,
} from './world/WorldEngineCombatControllers';
import {
    createWorldEngineActionControllersFromSources,
    type WorldEngineActionControllers,
} from './world/WorldEngineActionControllers';
import {
    createWorldEnginePresentationControllersFromSources,
    type WorldEnginePresentationControllers,
} from './world/WorldEnginePresentationControllers';
import {
    createWorldEngineRaidLifecycleControllersFromSources,
    type WorldEngineRaidLifecycleControllers,
} from './world/WorldEngineRaidLifecycleControllers';
import {
    getWorldBackpackCursedArtifactCount,
    getWorldPathPreviewTiles,
    getWorldSpendableActionGauge,
    isWorldTurnCombatActive,
} from './world/WorldEngineTurnQueries';
import {
    getWorldActivePartyTurnActor,
    getWorldActorById,
    getWorldControlledActor,
    getWorldEnemyById,
    getWorldFanfareFollowerCount,
    getWorldFanfareLeaderActor,
} from './world/WorldEngineActorQueries';
import type { CombatFeedbackKind } from './world/CombatFeedback';
import {
    syncCharacterMovementToClass,
} from './world/WorldEngineFieldHelpers';
import { NetworkRaidClient } from '../net/NetworkRaidClient';
import {
    type ActionRejectedMessage,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type InventoryConsumedMessage,
    type LootGrantMessage,
    type WorldRealmId,
    type WorldSnapshot,
} from '../net/WorldProtocol';

export interface WorldEngineOptions {
    startIntroTutorial?: boolean;
}

export class WorldEngine {
    private coreState?: WorldEngineCoreState;
    private fieldState?: WorldEngineFieldState;
    private networkState?: WorldEngineNetworkState;
    private uiState?: WorldEngineUiState;
    private runtimeState?: WorldEngineRuntimeState;
    private flowState?: WorldEngineFlowState;
    private controllerState?: WorldEngineControllerState;

    constructor(
        canvas: HTMLCanvasElement,
        _ctx: CanvasRenderingContext2D,
        _input: InputManager,
        camera: Camera,
        party: PartyManager,
        _inventory: GridInventory,
        playerData: PlayerData,
        gameManager: GameManager,
        options: WorldEngineOptions = {}
    ) {
        this.coreState = createWorldEngineCoreState({
            canvas,
            camera,
            party,
            playerData,
            gameManager,
            worldMap: new WorldMap(),
        });
        const initialHubTownId = this.getTownById(this.playerData.currentHubTownId)?.id ?? 'central_castle';
        this.raidSession = new WorldRaidSession(initialHubTownId);
        this.townSession = new WorldTownSession({
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            onDeploy: () => this.beginRaidFromCurrentHub(),
            log: (message) => this.addCombatLog(message),
        });
        this.initializeWorldSupportControllers();
        this.initializeScenarioNetworkControllers();
        this.initializeCombatActionControllers();
        this.initializeRaidLifecycleControllers();
        this.initializePresentationControllers();
        runWorldEngineStartupFlowFromSources({
            camera,
            options,
            ports: this.getSharedControllerPorts(),
            getActionControllers: () => this.actionControllers,
            spawnPartyAtCurrentHub: () => this.spawnPartyAtCurrentHub(),
            startIntroTutorial: () => this.startIntroTutorial(),
            beginRaidFromCurrentHub: () => { void this.beginRaidFromCurrentHub(); },
        });
    }

    private getSharedControllerPorts(): WorldEngineSharedControllerPorts {
        return createWorldEngineSharedControllerPorts({
            camera: this.camera,
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            raidSession: this.raidSession,
            townSession: this.townSession,
            getUiState: () => this.getUiState(),
            getFlowState: () => this.getFlowState(),
            getFieldState: () => this.getFieldState(),
            getNetworkState: () => this.getNetworkState(),
            getRuntimeState: () => this.getRuntimeState(),
            getActionControllers: () => this.actionControllers,
            getRaidLifecycleControllers: () => this.raidLifecycleControllers,
            getWorldMap: () => this.worldMap,
            setWorldMap: (worldMap) => { this.worldMap = worldMap; },
            getPlayer: () => this.player,
            setPlayer: (player) => { this.player = player; },
            getControlledActor: () => this.getControlledActor(),
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            getCurrentHubTown: () => this.getCurrentHubTown(),
            openTown: (town) => this.openTown(town),
            placePartyNear: (tile, overrideMembers) => this.placePartyNear(tile, overrideMembers),
            closeFieldOverlays: () => this.closeFieldOverlays(),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            reopenActionMenu: (actor) => this.reopenActionMenu(actor),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            updateAttackCues: (dt) => this.updateAttackCues(dt),
            beginCombatFeedbackGroup: () => this.beginCombatFeedbackGroup(),
            registerCombatFeedback: (kind, feedbackGroupId) => this.registerCombatFeedback(kind, feedbackGroupId),
            flushCombatFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            addCombatLog: (message) => this.addCombatLog(message),
        });
    }

    private initializeWorldSupportControllers(): void {
        const sharedPorts = this.getSharedControllerPorts();
        const worldControllers = createWorldEngineWorldControllers({
            ...sharedPorts,
            getWorldTime: () => this.getRuntimeState().worldTime,
            getPhase: () => this.getRuntimeState().currentPhase,
            setPhase: (phase) => { this.getRuntimeState().currentPhase = phase; },
            beginRaidFromCurrentHub: (realm) => { void this.beginRaidFromCurrentHub(realm); },
            clearWorldLoot: () => { this.worldMap.loot = []; },
        });
        this.worldControllers = worldControllers;
    }

    private initializeScenarioNetworkControllers(): void {
        const sharedPorts = this.getSharedControllerPorts();
        const scenarioNetworkControllers = createWorldEngineScenarioNetworkControllers({
            ...sharedPorts,
            spawnKillEffect: (enemy, feedbackGroupId, actor) => {
                const exp = actor ? enemy.calcExpFor(actor.character.level) : enemy.expReward;
                this.getUiState().effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, exp, enemy);
                this.registerCombatFeedback('kill', feedbackGroupId);
            },
        });
        this.scenarioNetworkControllers = scenarioNetworkControllers;
    }

    private initializeCombatActionControllers(): void {
        const sharedPorts = this.getSharedControllerPorts();
        const combatControllers = createWorldEngineCombatControllers({
            ...sharedPorts,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            storyScenarioController: this.scenarioNetworkControllers.storyScenarioController,
            networkIntentController: this.scenarioNetworkControllers.networkIntentController,
            getActorById: (actorId) => this.getActorById(actorId),
            getBackpackCursedArtifactCount: () => this.getBackpackCursedArtifactCount(),
            handleActorDown: (actor) => this.handleActorDown(actor),
            handleEnemyDefeated: (actor, enemy, feedbackGroupId) => this.handleEnemyDefeated(actor, enemy, feedbackGroupId),
            stopResting: (actor, logMessage) => this.stopResting(actor, logMessage),
            switchToPartyMember: (index) => this.switchToPartyMember(index),
            snapshotPartyHp: () => this.snapshotPartyHp(),
            interruptRestingForDamage: (beforeHpByActorId) => this.interruptRestingForDamage(beforeHpByActorId),
            spawnEnemyLoot: (enemy) => this.spawnEnemyLoot(enemy),
            awardDefeatExp: (actor, enemy) => this.awardDefeatExp(actor, enemy),
            clearEnemyIfSelected: (enemyId) => this.actionControllers.selectionController.clearEnemyIfSelected(enemyId),
        });
        this.combatControllers = combatControllers;
        const actionControllers = createWorldEngineActionControllersFromSources({
            ports: sharedPorts,
            getScenarioNetworkControllers: () => this.scenarioNetworkControllers,
            getCombatControllers: () => this.combatControllers,
            getRuntimeState: () => this.getRuntimeState(),
            getSpendableActionGauge: () => this.getSpendableActionGauge(),
            spendAp: (cost) => this.spendAp(cost),
            submitNetworkMoveIntent: (actor, tile, path, apCost, pathCost) =>
                this.submitNetworkMoveIntent(actor, tile, path, apCost, pathCost),
            submitNetworkActionIntent: (actor, action) => this.submitNetworkActionIntent(actor, action),
            submitNetworkUseItemIntent: (actor, itemId) => this.submitNetworkUseItemIntent(actor, itemId),
            submitNetworkSkillIntent: (actor, skillId, targetId) => this.submitNetworkSkillIntent(actor, skillId, targetId),
            reopenActionMenu: (actor) => this.reopenActionMenu(actor),
            resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
            handleEnemyDefeated: (actor, enemy, feedbackGroupId) => this.handleEnemyDefeated(actor, enemy, feedbackGroupId),
            clearControlledPath: () => this.clearControlledPath(),
            getFanfareFollowerCount: (actor) => this.getFanfareFollowerCount(actor),
            tryActorAttack: (actor, enemy) => this.tryActorAttack(actor, enemy),
            closeActionMenu: () => this.closeActionMenu(),
            closeTacticalMenu: () => this.closeTacticalMenu(),
            endActorTurn: (actor, reason, atbCarryover) => this.endActorTurn(actor, reason, atbCarryover),
            clearActorIntent: (actor) => this.clearActorIntent(actor),
        });
        this.actionControllers = actionControllers;
    }

    private initializeRaidLifecycleControllers(): void {
        const raidLifecycleControllers = createWorldEngineRaidLifecycleControllersFromSources({
            ports: this.getSharedControllerPorts(),
            getNetworkState: () => this.getNetworkState(),
            getScenarioNetworkControllers: () => this.scenarioNetworkControllers,
            getTownById: (townId) => this.getTownById(townId),
            isTurnCombatActive: () => this.isTurnCombatActive(),
            applyNetworkSnapshot: (snapshot) => this.applyNetworkSnapshot(snapshot),
            handleNetworkCombatEvent: (event) => this.handleNetworkCombatEvent(event),
            openNetworkLoot: (grant) => this.openNetworkLoot(grant),
            handleNetworkAutoLootGrant: (grant) => this.handleNetworkAutoLootGrant(grant),
            handleNetworkInventoryConsumed: (message) => this.handleNetworkInventoryConsumed(message),
            handleNetworkActionRejected: (rejection) => this.handleNetworkActionRejected(rejection),
        });
        this.raidLifecycleControllers = raidLifecycleControllers;
    }

    private initializePresentationControllers(): void {
        const presentationControllers = createWorldEnginePresentationControllersFromSources({
            canvas: this.canvas,
            ports: this.getSharedControllerPorts(),
            getUiState: () => this.getUiState(),
            getRuntimeState: () => this.getRuntimeState(),
            getActionControllers: () => this.actionControllers,
            getRaidLifecycleControllers: () => this.raidLifecycleControllers,
            getScenarioNetworkControllers: () => this.scenarioNetworkControllers,
            getWorldControllers: () => this.worldControllers,
            getSpendableActionGauge: () => this.getSpendableActionGauge(),
            getPathPreviewTiles: (actor) => this.getPathPreviewTiles(actor),
            resolveFieldHitAt: (tile) => this.resolveFieldHitAt(tile),
            isTurnCombatActive: () => this.isTurnCombatActive(),
            switchToNextAliveActor: () => this.switchToNextAliveActor(),
            switchToPartyMember: (index) => this.switchToPartyMember(index),
            toggleActionMenuForControlled: () => this.toggleActionMenuForControlled(),
            closeActionMenu: () => this.closeActionMenu(),
            dismissActionMenuTurn: () => this.dismissActionMenuTurn(),
            closeTacticalMenu: () => this.closeTacticalMenu(),
            clearIntent: () => this.clearIntent(),
            openPauseMenu: () => this.gameManager.openPauseMenu(),
        });
        this.presentationControllers = presentationControllers;
    }

    private isTurnCombatActive(): boolean {
        return isWorldTurnCombatActive({
            fieldEnemies: this.getFieldState().fieldEnemies,
            turnStateController: this.getFlowState().turnStateController,
            actionMenuUI: this.getUiState().actionMenuUI,
            playerActionController: this.actionControllers.playerActionController,
            tacticalController: this.presentationControllers.tacticalController,
            magicController: this.actionControllers.magicController,
            toolController: this.actionControllers.toolController,
            partyActors: this.getFieldState().partyActors,
        });
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.getUpdateFlow().update(dt, input, camera);
    }

    private getUpdateFlow(): WorldEngineUpdateFlow {
        const flowState = this.getFlowState();
        flowState.updateFlow ??= createWorldEngineUpdateFlowFromSources({
            townSession: this.townSession,
            getUiState: () => this.getUiState(),
            getNetworkState: () => this.getNetworkState(),
            getRuntimeState: () => this.getRuntimeState(),
            getActionControllers: () => this.actionControllers,
            getPresentationControllers: () => this.presentationControllers,
            getRaidLifecycleControllers: () => this.raidLifecycleControllers,
            getWorldControllers: () => this.worldControllers,
            getScenarioNetworkControllers: () => this.scenarioNetworkControllers,
            updateNetworkRaid: (dt, input, camera) => this.updateNetworkRaid(dt, input, camera),
            updateStoryPresentation: (dt, camera) => this.updateStoryPresentation(dt, camera),
            refreshOpenActionMenuState: () => this.refreshOpenActionMenuState(),
            updatePartyMovement: (dt) => this.updatePartyMovement(dt),
            updateEnemyMovement: (dt) => this.updateEnemyMovement(dt),
            refreshEnemyIntentPreviews: () => this.refreshEnemyIntentPreviews(),
            updateRestingActors: (dt) => this.updateRestingActors(dt),
            updateAttackCues: (dt) => this.updateAttackCues(dt),
            refreshLootState: () => this.refreshLootState(),
            startNextReadyTurn: () => this.startNextReadyTurn(),
            syncControlledPlayer: () => this.syncControlledPlayer(),
            followPlayerCamera: (camera, dt) => this.followPlayerCamera(camera, dt),
        });
        return flowState.updateFlow;
    }

    private updatePartyMovement(dt: number): void {
        const partyMovement = this.combatControllers.movementController.updatePartyActors({
            dt,
            controlled: this.getFanfareLeaderActor(),
            activeTurnActorId: this.getFlowState().turnStateController.getActiveTurnActorId(),
            followRepathTimer: this.getRuntimeState().followRepathTimer,
        });
        this.getRuntimeState().followRepathTimer = partyMovement.followRepathTimer;
        for (const actorId of partyMovement.readyActorIds) this.getFlowState().turnStateController.enqueueReadyActor(actorId);
    }

    private updateEnemyMovement(dt: number): void {
        const enemyMovement = this.combatControllers.movementController.updateEnemies({
            dt,
            activeTurnActorId: this.getFlowState().turnStateController.getActiveTurnActorId(),
        });
        for (const enemyId of enemyMovement.readyEnemyIds) this.getFlowState().turnStateController.enqueueReadyActor(enemyId);
    }

    private syncControlledPlayer(): void {
        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
    }

    private followPlayerCamera(camera: Camera, dt: number): void {
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
    }

    public isModalOverlayVisible(): boolean {
        return this.townSession.isVisible() || this.raidLifecycleControllers.raidOutcomeController.isVisible() || this.getUiState().fusionTempleUI.isVisible();
    }

    public isQuestJournalAvailable(): boolean {
        return !this.raidLifecycleControllers.raidOutcomeController.isVisible() && !this.getUiState().fusionTempleUI.isVisible();
    }

    /** Town visit session (consumed by the React DOM overlay via GameManager). */
    public getTownSession(): WorldTownSession { return this.townSession; }

    public getRaidSession(): WorldRaidSession { return this.raidSession; }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        this.presentationControllers.renderController.render(ctx, camera, width, height, {
            hideWorldHud: this.scenarioNetworkControllers.tutorialController.isActive(),
        });
        if (this.scenarioNetworkControllers.tutorialController.isActive()) {
            this.scenarioNetworkControllers.tutorialController.renderHud(ctx, width, height);
        }
    }

    public startIntroTutorial(): void {
        this.scenarioNetworkControllers.tutorialController.start();
    }

    private spawnPartyAtCurrentHub(): void {
        this.placePartyNear(this.worldMap.getTownSpawnTile(this.getCurrentHubTown()));
    }

    private placePartyNear(anchorTile: TilePoint, overrideMembers?: Character[]): void {
        const members = (overrideMembers ?? this.party.getCharacters()).slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);
        members.forEach((character) => syncCharacterMovementToClass(character));
        this.getFieldState().partyActors = this.combatControllers.fieldSpawnController.createPartyActors(anchorTile, members);
        this.getRuntimeState().fanfareLeaderActorId = null;
    }

    private getTownById(townId: string): TownInfo | null {
        return this.worldMap.getTowns().find((town) => town.id === townId) ?? null;
    }

    private getCurrentHubTown(): TownInfo {
        return this.getTownById(this.raidSession.currentHubTownId)
            ?? this.getTownById('central_castle')
            ?? this.worldMap.getTowns()[0];
    }

    private openTown(town: TownInfo): void {
        this.raidLifecycleControllers.raidLifecycleController.openTown(town);
    }

    private async beginRaidFromCurrentHub(requestedRealm?: WorldRealmId): Promise<void> {
        return this.raidLifecycleControllers.raidLifecycleController.beginRaidFromCurrentHub(requestedRealm);
    }

    public closeNetworkRaidClient(sendLeave: boolean, reason: 'town' | 'wipe' | 'manual' = 'manual'): void {
        this.raidLifecycleControllers.raidLifecycleController.closeNetworkRaidClient(sendLeave, reason);
    }

    private closeFieldOverlays(): void {
        if (this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
        if (this.gameManager.partyUI.isVisible()) this.gameManager.partyUI.toggle();
        if (this.gameManager.charUI.isVisible()) this.gameManager.charUI.toggle();
        this.gameManager.closeQuestJournal();
        this.gameManager.closePauseMenu();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.actionControllers.magicController.reset();
        this.actionControllers.toolController?.reset();
        this.actionControllers.playerActionController.clearTargeting();
    }

    private clearFieldTurnState(): void {
        this.getFlowState().turnStateController.clear();
        this.getRuntimeState().fanfareLeaderActorId = null;
        this.worldControllers.restingController.clearTimers();
        this.closeActionMenu();
        this.actionControllers.magicController.reset();
        this.actionControllers.toolController?.reset();
        for (const actor of this.getFieldState().partyActors) {
            actor.path = [];
            actor.queuedIntent = null;
            actor.entity.actionGauge = 0;
            removeStatusesFromCarrier(actor.character, (status) => status.kind === 'resting');
        }
        for (const entry of this.getFieldState().fieldEnemies) {
            entry.path = [];
            entry.previewIntent = null;
            entry.enemy.actionGauge = 0;
            entry.enemy.isAggro = false;
        }
    }

    private updateNetworkRaid(dt: number, input: InputManager, camera: Camera): void {
        if (this.updateStoryPresentation(dt, camera)) return;

        this.refreshOpenActionMenuState();
        this.presentationControllers.inputController.process(input, camera);
        for (const actor of this.getFieldState().partyActors) actor.entity.update(dt);
        for (const entry of this.getFieldState().fieldEnemies) entry.enemy.update(dt);
        this.scenarioNetworkControllers.networkSyncController.refreshMovePathPreview();
        this.getUiState().effectManager.update(dt);
        this.getUiState().floatingText.update(dt);
        this.updateAttackCues(dt);
        this.refreshLootState();
        this.scenarioNetworkControllers.storyScenarioController.checkDungeonArrival();
        this.refreshOpenActionMenuState();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
    }

    private updateStoryPresentation(dt: number, camera: Camera): boolean {
        if (!this.scenarioNetworkControllers.storyScenarioController.isPresentationActive()) return false;
        this.scenarioNetworkControllers.storyScenarioController.updatePresentation(dt);
        this.getUiState().effectManager.update(dt);
        this.getUiState().floatingText.update(dt);
        this.updateAttackCues(dt);
        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.update(dt);
        return true;
    }

    private applyNetworkSnapshot(snapshot: WorldSnapshot): void {
        if (this.scenarioNetworkControllers.networkEvents) {
            this.scenarioNetworkControllers.networkEvents.applySnapshot(snapshot);
            return;
        }
        this.raidSession.elapsedSeconds = snapshot.raidTimer.elapsedSeconds;
        this.raidSession.setRaidModifier(snapshot.raidTimer.modifier ?? null);
        this.scenarioNetworkControllers.networkSyncController.applySnapshot(snapshot);
    }

    private openNetworkLoot(grant: LootGrantMessage): void {
        if (this.scenarioNetworkControllers.networkEvents) this.scenarioNetworkControllers.networkEvents.openLoot(grant);
        else this.scenarioNetworkControllers.networkSyncController.openLoot(grant);
    }

    private handleNetworkAutoLootGrant(grant: AutoLootGrantMessage): void {
        if (this.scenarioNetworkControllers.networkEvents) this.scenarioNetworkControllers.networkEvents.handleAutoLootGrant(grant);
        else this.scenarioNetworkControllers.networkSyncController.handleAutoLootGrant(grant);
    }

    private handleNetworkInventoryConsumed(message: InventoryConsumedMessage): void {
        if (this.scenarioNetworkControllers.networkEvents) this.scenarioNetworkControllers.networkEvents.handleInventoryConsumed(message);
        else this.scenarioNetworkControllers.networkSyncController.handleInventoryConsumed(message);
    }

    private handleNetworkActionRejected(rejection: ActionRejectedMessage): void {
        if (this.scenarioNetworkControllers.networkEvents) this.scenarioNetworkControllers.networkEvents.handleActionRejected(rejection);
        else this.scenarioNetworkControllers.networkSyncController.handleActionRejected(rejection);
    }

    private handleNetworkCombatEvent(event: CombatEventMessage): void {
        if (this.scenarioNetworkControllers.networkEvents) this.scenarioNetworkControllers.networkEvents.handleCombatEvent(event);
        else this.scenarioNetworkControllers.networkSyncController.handleCombatEvent(event);
    }

    private getPathPreviewTiles(actor: FieldActor | null): TilePoint[] {
        return getWorldPathPreviewTiles(actor, this.scenarioNetworkControllers.networkSyncController);
    }

    private resolveFieldHitAt(tile: TilePoint) {
        const partyTargets: FieldHitParty[] = this.getFieldState().partyActors.map((actor) => ({
            ...actor,
            gridX: actor.entity.gridX,
            gridY: actor.entity.gridY,
        }));
        return resolveFieldHit(tile, {
            party: partyTargets,
            enemies: this.getFieldState().fieldEnemies.map((entry) => entry.enemy),
            loot: this.worldMap.loot,
            isGroundWalkable: (x, y) => this.worldMap.isWalkable(x, y),
        });
    }

    private closeTacticalMenu(): void {
        this.presentationControllers.tacticalController.close();
    }

    private updateRestingActors(dt: number): void {
        this.worldControllers.restingController.update(dt);
    }

    private stopResting(actor: FieldActor, logMessage?: string): void {
        this.worldControllers.restingController.stop(actor, logMessage);
    }

    private snapshotPartyHp(): Map<string, number> {
        return this.worldControllers.restingController.snapshotPartyHp();
    }

    private interruptRestingForDamage(beforeHpByActorId: Map<string, number>): void {
        this.worldControllers.restingController.interruptForDamage(beforeHpByActorId);
    }

    private applyCombatResult(result: CombatResult): void {
        this.combatControllers.combatFlow.applyCombatResult(result);
    }

    private spawnEnemyLoot(enemy: Enemy): void {
        this.actionControllers.lootController.spawnEnemyLoot(enemy);
    }

    private submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        return this.scenarioNetworkControllers.networkIntentController.submitMove(actor, tile, path, apCost, pathCost);
    }

    private submitNetworkActionIntent(actor: FieldActor, action: 'defend' | 'rest'): boolean {
        return this.scenarioNetworkControllers.networkIntentController.submitAction(actor, action);
    }

    private submitNetworkUseItemIntent(actor: FieldActor, itemId: string): boolean {
        return this.scenarioNetworkControllers.networkIntentController.submitUseItem(actor, itemId);
    }

    private submitNetworkSkillIntent(actor: FieldActor, skillId: string, targetId?: string): boolean {
        return this.scenarioNetworkControllers.networkIntentController.submitSkill(actor, skillId, targetId);
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        return this.combatControllers.combatFlow.tryActorAttack(actor, enemy);
    }

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void {
        this.combatControllers.combatFlow.handleEnemyDefeated(actor, enemy, feedbackGroupId);
    }

    private awardDefeatExp(actor: FieldActor, enemy: Enemy): void {
        this.combatControllers.combatFlow.awardDefeatExp(actor, enemy);
    }

    private handleActorDown(actor: FieldActor): void {
        this.combatControllers.combatFlow.handleActorDown(actor);
    }

    private refreshLootState(): void {
        this.actionControllers.lootController.refreshLootState();
    }

    private getControlledActor(): FieldActor | null {
        const characters = this.party.getCharacters();
        return getWorldControlledActor({
            partyActors: this.getFieldState().partyActors,
            characters,
            activeIndex: this.party.getActiveIndex(),
        });
    }

    private getFanfareFollowerCount(actor: FieldActor): number {
        return getWorldFanfareFollowerCount({
            partyActors: this.getFieldState().partyActors,
            characters: this.party.getCharacters(),
            actor,
            isNetworkRaid: this.getNetworkState().isRaid,
        });
    }

    private getFanfareLeaderActor(): FieldActor | null {
        const leader = getWorldFanfareLeaderActor({
            partyActors: this.getFieldState().partyActors,
            characters: this.party.getCharacters(),
            leaderActorId: this.getRuntimeState().fanfareLeaderActorId,
            isNetworkRaid: this.getNetworkState().isRaid,
        });
        if (!leader) this.getRuntimeState().fanfareLeaderActorId = null;
        return leader;
    }

    private getActivePartyTurnActor(): FieldActor | null {
        return getWorldActivePartyTurnActor(this.getFieldState().partyActors, this.getFlowState().turnStateController.getActiveTurnActorId());
    }

    private switchToNextAliveActor(): void {
        const current = this.party.getActiveIndex();
        for (let offset = 1; offset <= this.getFieldState().partyActors.length; offset++) {
            const next = (current + offset) % this.getFieldState().partyActors.length;
            if (this.switchToPartyMember(next)) return;
        }
    }

    private switchToPartyMember(index: number): boolean {
        const actor = this.getFieldState().partyActors[index];
        if (!actor || actor.character.isDead) return false;
        if (this.scenarioNetworkControllers.tutorialController.isActive() && actor.id !== this.getFlowState().turnStateController.getActiveTurnActorId()) {
            this.scenarioNetworkControllers.tutorialController.addBlockedLog();
            return false;
        }
        if (!this.party.getCharacters().includes(actor.character)) {
            this.actionControllers.selectionController.selectActor(actor.id);
            this.addCombatLog(formatT('field.log.remoteDisplayOnly', { name: actor.character.name }));
            return false;
        }
        if (!this.party.switchTo(index)) return false;
        this.player = actor.entity;
        this.actionControllers.selectionController.selectActor(actor.id);
        this.actionControllers.playerActionController.clearTargeting();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.addCombatLog(formatT('field.log.actorControl', { name: actor.character.name }));
        return true;
    }

    private getActionTurnFlow(): WorldEngineActionTurnFlow {
        const flowState = this.getFlowState();
        flowState.actionTurnFlow ??= createWorldEngineActionTurnFlow({
            actionMenuUI: this.getUiState().actionMenuUI,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            turnStateController: flowState.turnStateController,
            selectionController: this.actionControllers.selectionController,
            playerActionController: this.actionControllers.playerActionController,
            networkIntentController: this.scenarioNetworkControllers.networkIntentController,
            magicController: this.actionControllers.magicController,
            toolController: this.actionControllers.toolController,
            getControlledActor: () => this.getControlledActor(),
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            getSpendableActionGauge: () => this.getSpendableActionGauge(),
            beginActorTurn: (actor) => this.beginActorTurn(actor),
            closeActionMenu: () => this.closeActionMenu(),
            closeTacticalMenu: () => this.closeTacticalMenu(),
            clearActorIntent: (actor) => this.clearActorIntent(actor),
            log: (message) => this.addCombatLog(message),
        });
        return flowState.actionTurnFlow;
    }

    private toggleActionMenuForControlled(): void {
        this.getActionTurnFlow().toggleActionMenuForControlled();
    }

    private closeActionMenu(): void {
        this.getUiState().actionMenuUI.close();
    }

    private refreshOpenActionMenuState(): void {
        this.getActionTurnFlow().refreshOpenActionMenuState();
    }

    private dismissActionMenuTurn(): void {
        this.getActionTurnFlow().dismissActionMenuTurn();
    }

    private spendAp(cost: number): boolean {
        return this.getActionTurnFlow().spendAp(cost);
    }

    private resumeOrEndActiveTurn(actor: FieldActor): void {
        this.getActionTurnFlow().resumeOrEndActiveTurn(actor);
    }

    private reopenActionMenu(actor: FieldActor): void {
        this.getActionTurnFlow().reopenActionMenu(actor);
    }

    private endActorTurn(actor: FieldActor, reason: FieldTurnEndReason, atbCarryover: number = this.getFlowState().turnStateController.getRemainingActionPoints()): void {
        this.getActionTurnFlow().endActorTurn(actor, reason, atbCarryover);
    }

    private endEnemyTurn(enemy: Enemy): void {
        enemy.actionGauge = 0;
        this.getFlowState().turnStateController.endActiveTurn();
    }

    private startNextReadyTurn(): void {
        this.clearInvalidActiveTurn();
        if (this.getFlowState().turnStateController.isReadyTurnBlocked()) return;

        while (this.getFlowState().turnStateController.hasReadyActors()) {
            const actorId = this.getFlowState().turnStateController.shiftReadyActorId();
            if (!actorId) return;
            const actor = this.getFieldState().partyActors.find((candidate) => candidate.id === actorId);
            if (actor) {
                if (actor.character.isDead) continue;
                this.beginActorTurn(actor);
                return;
            }

            const enemyEntry = this.getFieldState().fieldEnemies.find((entry) => entry.enemy.id === actorId);
            if (!enemyEntry || enemyEntry.enemy.stats.hp <= 0) continue;
            this.beginEnemyTurn(enemyEntry);
            if (this.getFlowState().turnStateController.getActiveTurnActorId()) return;
        }
    }

    private clearInvalidActiveTurn(): void {
        const cleared = this.getFlowState().turnStateController.clearInvalidActiveTurn((actorId) => {
            const activePartyActor = this.getFieldState().partyActors.find((actor) => actor.id === actorId);
            if (activePartyActor && !activePartyActor.character.isDead && activePartyActor.character.stats.hp > 0) return true;

            const activeEnemy = this.getFieldState().fieldEnemies.find((entry) => entry.enemy.id === actorId)?.enemy;
            return activeEnemy !== undefined && activeEnemy.stats.hp > 0;
        });
        if (!cleared) return;

        this.closeActionMenu();
        this.closeTacticalMenu();
        this.actionControllers.playerActionController.clearTargeting();
        this.actionControllers.magicController.reset();
        this.actionControllers.toolController?.reset();
    }

    private beginActorTurn(actor: FieldActor): void {
        const index = this.getFieldState().partyActors.indexOf(actor);
        if (index >= 0) this.switchToPartyMember(index);
        actor.entity.actionGauge = this.getFlowState().turnStateController.beginActorTurn(actor.id);
        this.actionControllers.selectionController.selectActor(actor.id);
        if (!this.combatControllers.turnStartResolver.processActorTurnStart(actor)) {
            this.endActorTurn(actor, 'statusBlocked');
            return;
        }
        this.getUiState().floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(formatT('field.log.turnStart', {
            name: actor.character.name,
            gauge: t('ui.actionGauge'),
            value: this.getFlowState().turnStateController.getRemainingActionPoints(),
        }));
        if (!this.actionControllers.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, 'noExecutableAction');
        else {
            this.closeTacticalMenu();
            this.getUiState().actionMenuUI.open(this.scenarioNetworkControllers.tutorialController.getActionMenuStates(actor));
        }
    }

    private beginEnemyTurn(entry: FieldEnemy): void {
        const enemy = entry.enemy;
        this.getFlowState().turnStateController.beginEnemyTurn(enemy.id);
        this.getUiState().floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'READY');

        if (!this.combatControllers.turnStartResolver.processEnemyTurnStart(entry)) {
            this.endEnemyTurn(enemy);
            return;
        }

        const beforeHpByActorId = this.snapshotPartyHp();
        this.applyCombatResult(this.combatControllers.enemyTurnController.beginEnemyTurn(entry));
        this.interruptRestingForDamage(beforeHpByActorId);
        this.endEnemyTurn(enemy);
    }

    private refreshEnemyIntentPreviews(): void {
        for (const entry of this.getFieldState().fieldEnemies) {
            entry.previewIntent = this.combatControllers.enemyTurnController.previewEnemyIntent(entry);
        }
    }

    private getActorById(actorId: string): FieldActor | null {
        return getWorldActorById(this.getFieldState().partyActors, actorId);
    }

    private getEnemyById(enemyId: string): Enemy | null {
        return getWorldEnemyById(this.getFieldState().fieldEnemies, enemyId);
    }

    private getSpendableActionGauge(): number {
        return getWorldSpendableActionGauge({
            turnStateController: this.getFlowState().turnStateController,
            isNetworkRaid: this.getNetworkState().isRaid,
            activeActor: this.getActivePartyTurnActor(),
        });
    }

    private getBackpackCursedArtifactCount(): number {
        return getWorldBackpackCursedArtifactCount(this.gameManager.inventory.items);
    }

    private clearIntent(): void {
        if (this.getFlowState().turnStateController.getReservedAction()) return;
        const actor = this.getControlledActor();
        if (actor) this.clearActorIntent(actor);
        this.actionControllers.selectionController.selectActor(actor?.id ?? null);
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.actionControllers.playerActionController.clearTargeting();
        this.actionControllers.magicController.reset();
        this.actionControllers.toolController?.reset();
    }

    private clearActorIntent(actor: FieldActor): void {
        actor.path = [];
        actor.queuedIntent = null;
    }

    private clearControlledPath(): void {
        const actor = this.getControlledActor();
        if (actor) actor.path = [];
    }

    private addCombatLog(message: string): void {
        this.getUiState().fieldFeedback.addCombatLog(message);
    }

    private updateAttackCues(dt: number): void {
        this.getUiState().fieldFeedback?.updateAttackCues(dt);
    }

    private beginCombatFeedbackGroup(): string {
        return this.worldControllers.combatFeedbackController.beginGroup();
    }

    private registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void {
        this.worldControllers.combatFeedbackController.register(kind, feedbackGroupId);
    }

    private flushCombatFeedbackGroup(feedbackGroupId: string): void {
        this.worldControllers.combatFeedbackController.flush(feedbackGroupId);
    }

    public isNetworkRaidActive(): boolean {
        return this.getNetworkState().isRaid;
    }

    public get networkRaidClient(): NetworkRaidClient | null {
        return this.getNetworkState().raidClient;
    }

    public set networkRaidClient(client: NetworkRaidClient | null) {
        this.getNetworkState().raidClient = client;
    }

    public get isNetworkRaid(): boolean {
        return this.getNetworkState().isRaid;
    }

    public set isNetworkRaid(isRaid: boolean) {
        this.getNetworkState().isRaid = isRaid;
    }

    public get partyActors(): FieldActor[] {
        return this.getFieldState().partyActors;
    }

    public set partyActors(actors: FieldActor[]) {
        this.getFieldState().partyActors = actors;
    }

    public get fieldEnemies(): FieldEnemy[] {
        return this.getFieldState().fieldEnemies;
    }

    public set fieldEnemies(enemies: FieldEnemy[]) {
        this.getFieldState().fieldEnemies = enemies;
    }

    public get remotePartyActors(): Map<string, FieldActor> {
        return this.getFieldState().remotePartyActors;
    }

    public set remotePartyActors(actors: Map<string, FieldActor>) {
        this.getFieldState().remotePartyActors = actors;
    }

    public get turnStateController(): WorldTurnStateController {
        return this.getFlowState().turnStateController;
    }

    public set turnStateController(controller: WorldTurnStateController) {
        this.getFlowState().turnStateController = controller;
    }

    public get fieldFeedback(): WorldEngineUiState['fieldFeedback'] {
        return this.getUiState().fieldFeedback;
    }

    private get canvas(): HTMLCanvasElement {
        return this.getCoreState().canvas!;
    }

    private set canvas(canvas: HTMLCanvasElement) {
        this.getCoreState().canvas = canvas;
    }

    private get camera(): Camera {
        return this.getCoreState().camera!;
    }

    private set camera(camera: Camera) {
        this.getCoreState().camera = camera;
    }

    private get party(): PartyManager {
        return this.getCoreState().party!;
    }

    private set party(party: PartyManager) {
        this.getCoreState().party = party;
    }

    private get playerData(): PlayerData {
        return this.getCoreState().playerData!;
    }

    private set playerData(playerData: PlayerData) {
        this.getCoreState().playerData = playerData;
    }

    private get gameManager(): GameManager {
        return this.getCoreState().gameManager!;
    }

    private set gameManager(gameManager: GameManager) {
        this.getCoreState().gameManager = gameManager;
    }

    private get worldMap(): WorldMap {
        return this.getCoreState().worldMap;
    }

    private set worldMap(worldMap: WorldMap) {
        this.getCoreState().worldMap = worldMap;
    }

    private get player(): Player {
        return this.getCoreState().player!;
    }

    private set player(player: Player) {
        this.getCoreState().player = player;
    }

    private get townSession(): WorldTownSession {
        return this.getCoreState().townSession!;
    }

    private set townSession(townSession: WorldTownSession) {
        this.getCoreState().townSession = townSession;
    }

    private get raidSession(): WorldRaidSession {
        return this.getCoreState().raidSession!;
    }

    private set raidSession(raidSession: WorldRaidSession) {
        this.getCoreState().raidSession = raidSession;
    }

    private get combatControllers(): WorldEngineCombatControllers {
        return this.getControllerState().combatControllers!;
    }

    private set combatControllers(controllers: WorldEngineCombatControllers) {
        this.getControllerState().combatControllers = controllers;
    }

    private get actionControllers(): WorldEngineActionControllers {
        return this.getControllerState().actionControllers!;
    }

    private set actionControllers(controllers: WorldEngineActionControllers) {
        this.getControllerState().actionControllers = controllers;
    }

    private get raidLifecycleControllers(): WorldEngineRaidLifecycleControllers {
        return this.getControllerState().raidLifecycleControllers!;
    }

    private set raidLifecycleControllers(controllers: WorldEngineRaidLifecycleControllers) {
        this.getControllerState().raidLifecycleControllers = controllers;
    }

    private get presentationControllers(): WorldEnginePresentationControllers {
        return this.getControllerState().presentationControllers!;
    }

    private set presentationControllers(controllers: WorldEnginePresentationControllers) {
        this.getControllerState().presentationControllers = controllers;
    }

    private get scenarioNetworkControllers(): WorldEngineScenarioNetworkControllers {
        return this.getControllerState().scenarioNetworkControllers!;
    }

    private set scenarioNetworkControllers(controllers: WorldEngineScenarioNetworkControllers) {
        this.getControllerState().scenarioNetworkControllers = controllers;
    }

    private get worldControllers(): WorldEngineWorldControllers {
        return this.getControllerState().worldControllers!;
    }

    private set worldControllers(controllers: WorldEngineWorldControllers) {
        this.getControllerState().worldControllers = controllers;
    }

    private getNetworkState(): WorldEngineNetworkState {
        this.networkState ??= createWorldEngineNetworkState();
        return this.networkState;
    }

    private getCoreState(): WorldEngineCoreState {
        if (!this.coreState) {
            const fallback = createWorldEngineCoreState();
            const injected = this as unknown as WorldEngineCoreState;
            const getOwn = <K extends keyof WorldEngineCoreState>(key: K): WorldEngineCoreState[K] | undefined =>
                Object.prototype.hasOwnProperty.call(this, key) ? injected[key] : undefined;
            this.coreState = {
                canvas: getOwn('canvas') ?? fallback.canvas,
                camera: getOwn('camera') ?? fallback.camera,
                party: getOwn('party') ?? fallback.party,
                playerData: getOwn('playerData') ?? fallback.playerData,
                gameManager: getOwn('gameManager') ?? fallback.gameManager,
                worldMap: getOwn('worldMap') ?? fallback.worldMap,
                player: getOwn('player') ?? fallback.player,
                townSession: getOwn('townSession') ?? fallback.townSession,
                raidSession: getOwn('raidSession') ?? fallback.raidSession,
            };
        }
        return this.coreState;
    }

    private getFieldState(): WorldEngineFieldState {
        if (!this.fieldState) {
            const fallback = createWorldEngineFieldState();
            const injected = this as unknown as WorldEngineFieldState;
            const getOwn = <K extends keyof WorldEngineFieldState>(key: K): WorldEngineFieldState[K] | undefined =>
                Object.prototype.hasOwnProperty.call(this, key) ? injected[key] : undefined;
            this.fieldState = {
                partyActors: getOwn('partyActors') ?? fallback.partyActors,
                fieldEnemies: getOwn('fieldEnemies') ?? fallback.fieldEnemies,
                remotePartyActors: getOwn('remotePartyActors') ?? fallback.remotePartyActors,
            };
        }
        return this.fieldState;
    }

    private getRuntimeState(): WorldEngineRuntimeState {
        this.runtimeState ??= createWorldEngineRuntimeState();
        return this.runtimeState;
    }

    private getFlowState(): WorldEngineFlowState {
        if (!this.flowState) {
            const fallback = createWorldEngineFlowState();
            const injected = this as unknown as WorldEngineFlowState;
            const getOwn = <K extends keyof WorldEngineFlowState>(key: K): WorldEngineFlowState[K] | undefined =>
                Object.prototype.hasOwnProperty.call(this, key) ? injected[key] : undefined;
            this.flowState = {
                turnStateController: getOwn('turnStateController') ?? fallback.turnStateController,
                actionTurnFlow: getOwn('actionTurnFlow') ?? fallback.actionTurnFlow,
                updateFlow: getOwn('updateFlow') ?? fallback.updateFlow,
            };
        }
        return this.flowState;
    }

    private getControllerState(): WorldEngineControllerState {
        this.controllerState ??= createWorldEngineControllerState();
        return this.controllerState;
    }

    private getUiState(): WorldEngineUiState {
        if (!this.uiState) {
            const fallback = createWorldEngineUiState();
            const injected = this as unknown as WorldEngineUiState;
            const getOwn = <K extends keyof WorldEngineUiState>(key: K): WorldEngineUiState[K] | undefined =>
                Object.prototype.hasOwnProperty.call(this, key) ? injected[key] : undefined;
            this.uiState = {
                actionMenuUI: getOwn('actionMenuUI') ?? fallback.actionMenuUI,
                entityInfoUI: getOwn('entityInfoUI') ?? fallback.entityInfoUI,
                fusionTempleUI: getOwn('fusionTempleUI') ?? fallback.fusionTempleUI,
                fieldFeedback: getOwn('fieldFeedback') ?? fallback.fieldFeedback,
                floatingText: getOwn('floatingText') ?? fallback.floatingText,
                effectManager: getOwn('effectManager') ?? fallback.effectManager,
            };
        }
        return this.uiState;
    }

}
