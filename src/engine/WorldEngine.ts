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
import { ActionMenuUI } from '../ui/ActionMenuUI';
import { EntityInfoUI } from '../ui/EntityInfoUI';
import { EffectManager } from '../ui/EffectManager';
import { FusionTempleUI } from '../ui/FusionTempleUI';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { TownInfo } from '../map/BiomeMask';
import { resolveFieldHit } from '../field/FieldInteraction';
import type { TilePoint } from '../field/FieldPathing';
import type { FieldActor, FieldEnemy, FieldHitParty, FieldTurnEndReason } from '../field/FieldTypes';
import { WorldRaidSession, type WorldPhase } from './world/WorldRaidSession';
import { WorldTownSession } from './world/WorldTownSession';
import type { CombatResult } from './world/WorldCombatController';
import { WorldTurnStateController } from './world/WorldTurnStateController';
import { WorldFieldFeedbackState } from './world/WorldFieldFeedbackState';
import type { WorldEngineActionTurnFlow } from './world/WorldEngineActionTurnFlow';
import type { WorldEngineUpdateFlow } from './world/WorldEngineUpdateFlow';
import {
    createWorldEngineActionTurnFlow,
    createWorldEngineUpdateFlow,
} from './world/WorldEngineFlows';
import { runWorldEngineStartupFlow } from './world/WorldEngineStartupFlow';
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
    createWorldEngineActionControllers,
    type WorldEngineActionControllers,
} from './world/WorldEngineActionControllers';
import {
    createWorldEnginePresentationControllers,
    type WorldEnginePresentationControllers,
} from './world/WorldEnginePresentationControllers';
import {
    createWorldEngineRaidLifecycleControllers,
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
    private canvas: HTMLCanvasElement;
    private camera: Camera;
    private party: PartyManager;
    private playerData: PlayerData;
    private gameManager: GameManager;
    private worldMap: WorldMap;
    private player!: Player;
    private partyActors: FieldActor[] = [];
    private fieldEnemies: FieldEnemy[] = [];
    private remotePartyActors: Map<string, FieldActor> = new Map();
    private networkState?: WorldEngineNetworkState;
    private actionMenuUI = new ActionMenuUI();
    private entityInfoUI = new EntityInfoUI();
    private fusionTempleUI = new FusionTempleUI();
    private townSession: WorldTownSession;
    private raidSession: WorldRaidSession;
    private currentPhase: WorldPhase = 'lobby';
    private combatControllers!: WorldEngineCombatControllers;
    private actionControllers!: WorldEngineActionControllers;
    private raidLifecycleControllers!: WorldEngineRaidLifecycleControllers;
    private presentationControllers!: WorldEnginePresentationControllers;
    private scenarioNetworkControllers!: WorldEngineScenarioNetworkControllers;
    private worldControllers!: WorldEngineWorldControllers;
    private actionTurnFlow?: WorldEngineActionTurnFlow;
    private updateFlow?: WorldEngineUpdateFlow;
    private turnStateController = new WorldTurnStateController();
    private hoverTile: TilePoint = { x: -1, y: -1 };
    private fieldFeedback = new WorldFieldFeedbackState();
    private followRepathTimer: number = 0;
    private fanfareLeaderActorId: string | null = null;
    private floatingText = new FloatingTextManager();
    private effectManager = new EffectManager();
    private worldTime: number = 0;

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
        this.canvas = canvas;
        this.camera = camera;
        this.party = party;
        this.playerData = playerData;
        this.gameManager = gameManager;
        this.worldMap = new WorldMap();
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
        runWorldEngineStartupFlow({
            camera,
            options,
            spawnPartyAtCurrentHub: () => this.spawnPartyAtCurrentHub(),
            getControlledActor: () => this.getControlledActor(),
            setPlayer: (player) => { this.player = player; },
            getPlayer: () => this.player,
            selectActor: (actorId) => this.actionControllers.selectionController.selectActor(actorId),
            startIntroTutorial: () => this.startIntroTutorial(),
            hasStoredNetworkResumeToken: () => NetworkRaidClient.hasStoredResumeToken(),
            beginRaidFromCurrentHub: () => { void this.beginRaidFromCurrentHub(); },
            openCurrentHubTown: () => this.openTown(this.getCurrentHubTown()),
            addCombatLog: (message) => this.addCombatLog(message),
        });
    }

    private initializeWorldSupportControllers(): void {
        const worldControllers = createWorldEngineWorldControllers({
            camera: this.camera,
            party: this.party,
            raidSession: this.raidSession,
            fusionTempleUI: this.fusionTempleUI,
            floatingText: this.floatingText,
            effectManager: this.effectManager,
            getWorldTime: () => this.worldTime,
            getWorldMap: () => this.worldMap,
            getPlayer: () => this.player,
            setPlayer: (player) => { this.player = player; },
            getControlledActor: () => this.getControlledActor(),
            getPartyActors: () => this.partyActors,
            getFieldEnemies: () => this.fieldEnemies,
            setFieldEnemies: (enemies) => { this.fieldEnemies = enemies; },
            isNetworkRaid: () => this.getNetworkState().isRaid,
            getPhase: () => this.currentPhase,
            setPhase: (phase) => { this.currentPhase = phase; },
            beginRaidFromCurrentHub: (realm) => { void this.beginRaidFromCurrentHub(realm); },
            closeFieldOverlays: () => this.closeFieldOverlays(),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            placePartyNear: (tile) => this.placePartyNear(tile),
            clearWorldLoot: () => { this.worldMap.loot = []; },
            selectActor: (actorId) => this.actionControllers.selectionController.selectActor(actorId),
            addCombatLog: (message) => this.addCombatLog(message),
        });
        this.worldControllers = worldControllers;
    }

    private initializeScenarioNetworkControllers(): void {
        const scenarioNetworkControllers = createWorldEngineScenarioNetworkControllers({
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            camera: this.camera,
            raidSession: this.raidSession,
            townSession: this.townSession,
            fusionTempleUI: this.fusionTempleUI,
            actionMenuUI: this.actionMenuUI,
            floatingText: this.floatingText,
            effectManager: this.effectManager,
            fieldFeedback: this.fieldFeedback,
            turnStateController: this.turnStateController,
            getWorldMap: () => this.worldMap,
            setWorldMap: (worldMap) => { this.worldMap = worldMap; },
            getPlayer: () => this.player,
            setPlayer: (player) => { this.player = player; },
            getPartyActors: () => this.partyActors,
            setPartyActors: (actors) => { this.partyActors = actors; },
            getRemotePartyActors: () => this.remotePartyActors,
            clearRemotePartyActors: () => this.remotePartyActors.clear(),
            getFieldEnemies: () => this.fieldEnemies,
            setFieldEnemies: (fieldEnemies) => { this.fieldEnemies = fieldEnemies; },
            getControlledActor: () => this.getControlledActor(),
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            getCurrentHubTown: () => this.getCurrentHubTown(),
            openTown: (town) => this.openTown(town),
            placePartyNear: (tile, overrideMembers) => this.placePartyNear(tile, overrideMembers),
            closeFieldOverlays: () => this.closeFieldOverlays(),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            selectActor: (actorId) => this.actionControllers.selectionController.selectActor(actorId),
            clearSelection: () => this.actionControllers.selectionController.clear(),
            hasSelection: () => this.actionControllers.selectionController.hasSelection(),
            selectLoot: (lootId) => this.actionControllers.selectionController.selectLoot(lootId),
            isNetworkRaid: () => this.getNetworkState().isRaid,
            getNetworkRaidClient: () => this.getNetworkState().raidClient,
            getNetworkPlayerId: () => this.getNetworkState().playerId,
            isRaidOutcomeVisible: () => this.raidLifecycleControllers.raidOutcomeController.isVisible(),
            setCurrentPhase: (phase) => { this.currentPhase = phase; },
            getTurnActionStates: (actor) => this.actionControllers.playerActionController.getTurnActionStates(actor),
            getPlayerActionMode: () => this.actionControllers.playerActionController.getMode(),
            hasExecutableAction: (actor) => this.actionControllers.playerActionController.hasExecutableAction(actor),
            reopenActionMenu: (actor) => this.reopenActionMenu(actor),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            updateAttackCues: (dt) => this.updateAttackCues(dt),
            beginCombatFeedbackGroup: () => this.beginCombatFeedbackGroup(),
            registerCombatFeedback: (kind, feedbackGroupId) => this.registerCombatFeedback(kind, feedbackGroupId),
            flushCombatFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            spawnKillEffect: (enemy, feedbackGroupId, actor) => {
                const exp = actor ? enemy.calcExpFor(actor.character.level) : enemy.expReward;
                this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, exp, enemy);
                this.registerCombatFeedback('kill', feedbackGroupId);
            },
            addCombatLog: (message) => this.addCombatLog(message),
        });
        this.scenarioNetworkControllers = scenarioNetworkControllers;
    }

    private initializeCombatActionControllers(): void {
        const combatControllers = createWorldEngineCombatControllers({
            party: this.party,
            gameManager: this.gameManager,
            raidSession: this.raidSession,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            storyScenarioController: this.scenarioNetworkControllers.storyScenarioController,
            networkIntentController: this.scenarioNetworkControllers.networkIntentController,
            floatingText: this.floatingText,
            effectManager: this.effectManager,
            fieldFeedback: this.fieldFeedback,
            getWorldMap: () => this.worldMap,
            isNetworkRaid: () => this.getNetworkState().isRaid,
            getPartyActors: () => this.partyActors,
            getFieldEnemies: () => this.fieldEnemies,
            getControlledActor: () => this.getControlledActor(),
            getActorById: (actorId) => this.getActorById(actorId),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
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
            beginCombatFeedbackGroup: () => this.beginCombatFeedbackGroup(),
            registerCombatFeedback: (kind, feedbackGroupId) => this.registerCombatFeedback(kind, feedbackGroupId),
            flushCombatFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            addCombatLog: (message) => this.addCombatLog(message),
        });
        this.combatControllers = combatControllers;
        const actionControllers = createWorldEngineActionControllers({
            gameManager: this.gameManager,
            storyScenarioController: this.scenarioNetworkControllers.storyScenarioController,
            networkSyncController: this.scenarioNetworkControllers.networkSyncController,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            turnStateController: this.turnStateController,
            movementController: this.combatControllers.movementController,
            floatingText: this.floatingText,
            effectManager: this.effectManager,
            getWorldMap: () => this.worldMap,
            isNetworkRaid: () => this.getNetworkState().isRaid,
            getNetworkRaidClient: () => this.getNetworkState().raidClient,
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            getControlledActor: () => this.getControlledActor(),
            getPartyActors: () => this.partyActors,
            getFieldEnemies: () => this.fieldEnemies,
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
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
            getFanfareLeaderId: () => this.fanfareLeaderActorId,
            setFanfareLeaderId: (actorId) => {
                this.fanfareLeaderActorId = actorId;
                this.followRepathTimer = 0;
            },
            getFanfareFollowerCount: (actor) => this.getFanfareFollowerCount(actor),
            tryActorAttack: (actor, enemy) => this.tryActorAttack(actor, enemy),
            closeActionMenu: () => this.closeActionMenu(),
            closeTacticalMenu: () => this.closeTacticalMenu(),
            endActorTurn: (actor, reason, atbCarryover) => this.endActorTurn(actor, reason, atbCarryover),
            clearActorIntent: (actor) => this.clearActorIntent(actor),
            setReservedAction: (intent) => this.turnStateController.setReservedAction(intent),
            beginCombatFeedbackGroup: () => this.beginCombatFeedbackGroup(),
            registerCombatFeedback: (kind, feedbackGroupId) => this.registerCombatFeedback(kind, feedbackGroupId),
            flushCombatFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            addCombatLog: (message) => this.addCombatLog(message),
        });
        this.actionControllers = actionControllers;
    }

    private initializeRaidLifecycleControllers(): void {
        const raidLifecycleControllers = createWorldEngineRaidLifecycleControllers({
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            raidSession: this.raidSession,
            townSession: this.townSession,
            storyScenarioController: this.scenarioNetworkControllers.storyScenarioController,
            networkSyncController: this.scenarioNetworkControllers.networkSyncController,
            getWorldMap: () => this.worldMap,
            getTownById: (townId) => this.getTownById(townId),
            getCurrentHubTown: () => this.getCurrentHubTown(),
            getNetworkRaidClient: () => this.getNetworkState().raidClient,
            setNetworkRaidClient: (client) => { this.getNetworkState().raidClient = client; },
            isNetworkRaid: () => this.getNetworkState().isRaid,
            setIsNetworkRaid: (isNetworkRaid) => { this.getNetworkState().isRaid = isNetworkRaid; },
            isNetworkRaidConnecting: () => this.getNetworkState().isConnecting,
            setIsNetworkRaidConnecting: (isConnecting) => { this.getNetworkState().isConnecting = isConnecting; },
            isNetworkWasReconnecting: () => this.getNetworkState().wasReconnecting,
            setNetworkWasReconnecting: (wasReconnecting) => { this.getNetworkState().wasReconnecting = wasReconnecting; },
            getNetworkPlayerId: () => this.getNetworkState().playerId,
            setNetworkPlayerId: (playerId) => { this.getNetworkState().playerId = playerId; },
            closeFieldOverlays: () => this.closeFieldOverlays(),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            clearIntroTutorialStateForNetworkRaid: () => this.scenarioNetworkControllers.tutorialController.clearForNetworkRaid(),
            clearRemotePartyActors: () => this.remotePartyActors.clear(),
            placePartyNear: (tile) => this.placePartyNear(tile),
            getControlledActor: () => this.getControlledActor(),
            getPlayer: () => this.player,
            setPlayer: (player) => { this.player = player; },
            setPartyActors: (actors) => { this.partyActors = actors; },
            setFieldEnemies: (enemies) => { this.fieldEnemies = enemies; },
            selectActor: (actorId) => this.actionControllers.selectionController.selectActor(actorId),
            isTurnCombatActive: () => this.isTurnCombatActive(),
            setPhase: (phase) => { this.currentPhase = phase; },
            openTown: (town) => this.openTown(town),
            applyNetworkSnapshot: (snapshot) => this.applyNetworkSnapshot(snapshot),
            handleNetworkCombatEvent: (event) => this.handleNetworkCombatEvent(event),
            openNetworkLoot: (grant) => this.openNetworkLoot(grant),
            handleNetworkAutoLootGrant: (grant) => this.handleNetworkAutoLootGrant(grant),
            handleNetworkInventoryConsumed: (message) => this.handleNetworkInventoryConsumed(message),
            handleNetworkActionRejected: (rejection) => this.handleNetworkActionRejected(rejection),
            log: (message) => this.addCombatLog(message),
        });
        this.raidLifecycleControllers = raidLifecycleControllers;
    }

    private initializePresentationControllers(): void {
        const presentationControllers = createWorldEnginePresentationControllers({
            canvas: this.canvas,
            party: this.party,
            playerData: this.playerData,
            townSession: this.townSession,
            raidSession: this.raidSession,
            fusionTempleUI: this.fusionTempleUI,
            actionMenuUI: this.actionMenuUI,
            entityInfoUI: this.entityInfoUI,
            effectManager: this.effectManager,
            floatingText: this.floatingText,
            minimapUI: this.worldControllers.minimapUI,
            magicController: this.actionControllers.magicController,
            toolController: this.actionControllers.toolController,
            playerActionController: this.actionControllers.playerActionController,
            raidOutcomeController: this.raidLifecycleControllers.raidOutcomeController,
            selectionController: this.actionControllers.selectionController,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            turnStateController: this.turnStateController,
            fieldFeedback: this.fieldFeedback,
            getWorldMap: () => this.worldMap,
            getWorldTime: () => this.worldTime,
            getPhase: () => this.currentPhase,
            getPlayer: () => this.player,
            getControlledActor: () => this.getControlledActor(),
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            getPartyActors: () => this.partyActors,
            getFieldEnemies: () => this.fieldEnemies,
            getSpendableActionGauge: () => this.getSpendableActionGauge(),
            getHoverTile: () => this.hoverTile,
            setHoverTile: (tile) => { this.hoverTile = tile; },
            getPathPreviewTiles: (actor) => this.getPathPreviewTiles(actor),
            resolveFieldHitAt: (tile) => this.resolveFieldHitAt(tile),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            isTurnCombatActive: () => this.isTurnCombatActive(),
            switchToNextAliveActor: () => this.switchToNextAliveActor(),
            switchToPartyMember: (index) => this.switchToPartyMember(index),
            toggleActionMenuForControlled: () => this.toggleActionMenuForControlled(),
            closeActionMenu: () => this.closeActionMenu(),
            dismissActionMenuTurn: () => this.dismissActionMenuTurn(),
            closeTacticalMenu: () => this.closeTacticalMenu(),
            clearIntent: () => this.clearIntent(),
            openPauseMenu: () => this.gameManager.openPauseMenu(),
            addCombatLog: (message) => this.addCombatLog(message),
        });
        this.presentationControllers = presentationControllers;
    }

    private isTurnCombatActive(): boolean {
        return isWorldTurnCombatActive({
            fieldEnemies: this.fieldEnemies,
            turnStateController: this.turnStateController,
            actionMenuUI: this.actionMenuUI,
            playerActionController: this.actionControllers.playerActionController,
            tacticalController: this.presentationControllers.tacticalController,
            magicController: this.actionControllers.magicController,
            toolController: this.actionControllers.toolController,
            partyActors: this.partyActors,
        });
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.getUpdateFlow().update(dt, input, camera);
    }

    private getUpdateFlow(): WorldEngineUpdateFlow {
        this.updateFlow ??= createWorldEngineUpdateFlow({
            townSession: this.townSession,
            raidOutcomeController: this.raidLifecycleControllers.raidOutcomeController,
            fusionTempleUI: this.fusionTempleUI,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            inputController: this.presentationControllers.inputController,
            effectManager: this.effectManager,
            floatingText: this.floatingText,
            playerActionController: this.actionControllers.playerActionController,
            tacticalController: this.presentationControllers.tacticalController,
            raidLifecycleController: this.raidLifecycleControllers.raidLifecycleController,
            templeController: this.worldControllers.templeController,
            storyScenarioController: this.scenarioNetworkControllers.storyScenarioController,
            advanceWorldTime: (dt) => { this.worldTime += dt; },
            isNetworkRaid: () => this.getNetworkState().isRaid,
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
        return this.updateFlow;
    }

    private updatePartyMovement(dt: number): void {
        const partyMovement = this.combatControllers.movementController.updatePartyActors({
            dt,
            controlled: this.getFanfareLeaderActor(),
            activeTurnActorId: this.turnStateController.getActiveTurnActorId(),
            followRepathTimer: this.followRepathTimer,
        });
        this.followRepathTimer = partyMovement.followRepathTimer;
        for (const actorId of partyMovement.readyActorIds) this.turnStateController.enqueueReadyActor(actorId);
    }

    private updateEnemyMovement(dt: number): void {
        const enemyMovement = this.combatControllers.movementController.updateEnemies({
            dt,
            activeTurnActorId: this.turnStateController.getActiveTurnActorId(),
        });
        for (const enemyId of enemyMovement.readyEnemyIds) this.turnStateController.enqueueReadyActor(enemyId);
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
        return this.townSession.isVisible() || this.raidLifecycleControllers.raidOutcomeController.isVisible() || this.fusionTempleUI.isVisible();
    }

    public isQuestJournalAvailable(): boolean {
        return !this.raidLifecycleControllers.raidOutcomeController.isVisible() && !this.fusionTempleUI.isVisible();
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
        this.partyActors = this.combatControllers.fieldSpawnController.createPartyActors(anchorTile, members);
        this.fanfareLeaderActorId = null;
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
        this.turnStateController.clear();
        this.fanfareLeaderActorId = null;
        this.worldControllers.restingController.clearTimers();
        this.closeActionMenu();
        this.actionControllers.magicController.reset();
        this.actionControllers.toolController?.reset();
        for (const actor of this.partyActors) {
            actor.path = [];
            actor.queuedIntent = null;
            actor.entity.actionGauge = 0;
            removeStatusesFromCarrier(actor.character, (status) => status.kind === 'resting');
        }
        for (const entry of this.fieldEnemies) {
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
        for (const actor of this.partyActors) actor.entity.update(dt);
        for (const entry of this.fieldEnemies) entry.enemy.update(dt);
        this.scenarioNetworkControllers.networkSyncController.refreshMovePathPreview();
        this.effectManager.update(dt);
        this.floatingText.update(dt);
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
        this.effectManager.update(dt);
        this.floatingText.update(dt);
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
        const partyTargets: FieldHitParty[] = this.partyActors.map((actor) => ({
            ...actor,
            gridX: actor.entity.gridX,
            gridY: actor.entity.gridY,
        }));
        return resolveFieldHit(tile, {
            party: partyTargets,
            enemies: this.fieldEnemies.map((entry) => entry.enemy),
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
            partyActors: this.partyActors,
            characters,
            activeIndex: this.party.getActiveIndex(),
        });
    }

    private getFanfareFollowerCount(actor: FieldActor): number {
        return getWorldFanfareFollowerCount({
            partyActors: this.partyActors,
            characters: this.party.getCharacters(),
            actor,
            isNetworkRaid: this.getNetworkState().isRaid,
        });
    }

    private getFanfareLeaderActor(): FieldActor | null {
        const leader = getWorldFanfareLeaderActor({
            partyActors: this.partyActors,
            characters: this.party.getCharacters(),
            leaderActorId: this.fanfareLeaderActorId,
            isNetworkRaid: this.getNetworkState().isRaid,
        });
        if (!leader) this.fanfareLeaderActorId = null;
        return leader;
    }

    private getActivePartyTurnActor(): FieldActor | null {
        return getWorldActivePartyTurnActor(this.partyActors, this.turnStateController.getActiveTurnActorId());
    }

    private switchToNextAliveActor(): void {
        const current = this.party.getActiveIndex();
        for (let offset = 1; offset <= this.partyActors.length; offset++) {
            const next = (current + offset) % this.partyActors.length;
            if (this.switchToPartyMember(next)) return;
        }
    }

    private switchToPartyMember(index: number): boolean {
        const actor = this.partyActors[index];
        if (!actor || actor.character.isDead) return false;
        if (this.scenarioNetworkControllers.tutorialController.isActive() && actor.id !== this.turnStateController.getActiveTurnActorId()) {
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
        this.actionTurnFlow ??= createWorldEngineActionTurnFlow({
            actionMenuUI: this.actionMenuUI,
            tutorialController: this.scenarioNetworkControllers.tutorialController,
            turnStateController: this.turnStateController,
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
        return this.actionTurnFlow;
    }

    private toggleActionMenuForControlled(): void {
        this.getActionTurnFlow().toggleActionMenuForControlled();
    }

    private closeActionMenu(): void {
        this.actionMenuUI.close();
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

    private endActorTurn(actor: FieldActor, reason: FieldTurnEndReason, atbCarryover: number = this.turnStateController.getRemainingActionPoints()): void {
        this.getActionTurnFlow().endActorTurn(actor, reason, atbCarryover);
    }

    private endEnemyTurn(enemy: Enemy): void {
        enemy.actionGauge = 0;
        this.turnStateController.endActiveTurn();
    }

    private startNextReadyTurn(): void {
        this.clearInvalidActiveTurn();
        if (this.turnStateController.isReadyTurnBlocked()) return;

        while (this.turnStateController.hasReadyActors()) {
            const actorId = this.turnStateController.shiftReadyActorId();
            if (!actorId) return;
            const actor = this.partyActors.find((candidate) => candidate.id === actorId);
            if (actor) {
                if (actor.character.isDead) continue;
                this.beginActorTurn(actor);
                return;
            }

            const enemyEntry = this.fieldEnemies.find((entry) => entry.enemy.id === actorId);
            if (!enemyEntry || enemyEntry.enemy.stats.hp <= 0) continue;
            this.beginEnemyTurn(enemyEntry);
            if (this.turnStateController.getActiveTurnActorId()) return;
        }
    }

    private clearInvalidActiveTurn(): void {
        const cleared = this.turnStateController.clearInvalidActiveTurn((actorId) => {
            const activePartyActor = this.partyActors.find((actor) => actor.id === actorId);
            if (activePartyActor && !activePartyActor.character.isDead && activePartyActor.character.stats.hp > 0) return true;

            const activeEnemy = this.fieldEnemies.find((entry) => entry.enemy.id === actorId)?.enemy;
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
        const index = this.partyActors.indexOf(actor);
        if (index >= 0) this.switchToPartyMember(index);
        actor.entity.actionGauge = this.turnStateController.beginActorTurn(actor.id);
        this.actionControllers.selectionController.selectActor(actor.id);
        if (!this.combatControllers.turnStartResolver.processActorTurnStart(actor)) {
            this.endActorTurn(actor, 'statusBlocked');
            return;
        }
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(formatT('field.log.turnStart', {
            name: actor.character.name,
            gauge: t('ui.actionGauge'),
            value: this.turnStateController.getRemainingActionPoints(),
        }));
        if (!this.actionControllers.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, 'noExecutableAction');
        else {
            this.closeTacticalMenu();
            this.actionMenuUI.open(this.scenarioNetworkControllers.tutorialController.getActionMenuStates(actor));
        }
    }

    private beginEnemyTurn(entry: FieldEnemy): void {
        const enemy = entry.enemy;
        this.turnStateController.beginEnemyTurn(enemy.id);
        this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'READY');

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
        for (const entry of this.fieldEnemies) {
            entry.previewIntent = this.combatControllers.enemyTurnController.previewEnemyIntent(entry);
        }
    }

    private getActorById(actorId: string): FieldActor | null {
        return getWorldActorById(this.partyActors, actorId);
    }

    private getEnemyById(enemyId: string): Enemy | null {
        return getWorldEnemyById(this.fieldEnemies, enemyId);
    }

    private getSpendableActionGauge(): number {
        return getWorldSpendableActionGauge({
            turnStateController: this.turnStateController,
            isNetworkRaid: this.getNetworkState().isRaid,
            activeActor: this.getActivePartyTurnActor(),
        });
    }

    private getBackpackCursedArtifactCount(): number {
        return getWorldBackpackCursedArtifactCount(this.gameManager.inventory.items);
    }

    private clearIntent(): void {
        if (this.turnStateController.getReservedAction()) return;
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
        this.fieldFeedback.addCombatLog(message);
    }

    private updateAttackCues(dt: number): void {
        this.fieldFeedback?.updateAttackCues(dt);
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

    private getNetworkState(): WorldEngineNetworkState {
        this.networkState ??= createWorldEngineNetworkState();
        return this.networkState;
    }

}
