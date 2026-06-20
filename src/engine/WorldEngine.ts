/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import type { LootObject } from '../entity/LootObject';
import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { GridInventory } from '../inventory/GridInventory';
import { getCarryAtbMultiplier, getPartyCarriedWeight } from '../inventory/CarryWeight';
import { PlayerData } from '../data/PlayerData';
import { getItemDef } from '../data/ItemDB';
import { getClassLine, isMasterClassLineId } from '../data/ClassTree';
import { getClassAttackProfile } from '../data/AttackPatternProfiles';
import { formatT, t } from '../i18n/LanguageManager';
import {
    MONSTER_ROW_BY_FACING,
    MONSTER_SPRITE_PATH,
    getMonsterDefinition,
    type MonsterId,
} from '../data/MonsterCatalog';
import {
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    hasStatus,
    removeStatusesFromCarrier,
    resolveTurnStartStatuses,
} from '../combat/StatusEffects';
import { ActionMenuUI, type ActionMenuSlotState } from '../ui/ActionMenuUI';
import { EntityInfoUI } from '../ui/EntityInfoUI';
import { EffectManager } from '../ui/EffectManager';
import { FusionTempleUI } from '../ui/FusionTempleUI';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import { MinimapUI } from '../ui/MinimapUI';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { TownInfo } from '../map/BiomeMask';
import { TilePoint, manhattan, tileKey } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import { FIELD_MAX_ACTION_GAUGE, MIN_FIELD_ACTION_GAUGE_COST, type FieldApAction } from '../field/FieldActionEconomy';
import { hasLineOfSight } from '../field/LineOfSight';
import {
    AttackPatternProfile,
    PatternContext,
    getEffectTiles,
} from '../field/TargetPatterns';
import {
    getTerrainMoveCost,
    isTerrainLineOfSightBlocking,
    TerrainActorTraits,
} from '../field/TerrainRules';
import type { AttackCue, FieldActor, FieldEnemy, FieldHitParty } from '../field/FieldTypes';
import {
    getActorAttackTargetFailure as resolveActorAttackTargetFailure,
    type AttackTargetFailure,
} from '../field/FieldTargeting';
import { WorldRaidSession, type WorldPhase } from './world/WorldRaidSession';
import { WorldTownSession } from './world/WorldTownSession';
import { WorldCombatController, createCombatResult, type CombatResult } from './world/WorldCombatController';
import { WorldMovementController } from './world/WorldMovementController';
import { WorldEnemyTurnController } from './world/WorldEnemyTurnController';
import { WorldMagicController } from './world/WorldMagicController';
import { WorldPlayerActionController } from './world/WorldPlayerActionController';
import { WorldToolController } from './world/WorldToolController';
import { WorldRaidOutcomeController } from './world/WorldRaidOutcomeController';
import { WorldTacticalController } from './world/WorldTacticalController';
import { WorldSelectionController } from './world/WorldSelectionController';
import { WorldFieldSpawnController } from './world/WorldFieldSpawnController';
import { WorldRenderController } from './world/WorldRenderController';
import { WorldInputController } from './world/WorldInputController';
import { WorldStoryScenarioController } from './world/WorldStoryScenarioController';
import { WorldNetworkSyncController } from './world/WorldNetworkSyncController';
import { WorldTutorialController } from './world/WorldTutorialController';
import { WorldRaidLifecycleController } from './world/WorldRaidLifecycleController';
import { WorldTempleController } from './world/WorldTempleController';
import { WorldRestingController } from './world/WorldRestingController';
import { WorldLootController } from './world/WorldLootController';
import { WorldCombatFeedbackController } from './world/WorldCombatFeedbackController';
import { WorldNetworkIntentController } from './world/WorldNetworkIntentController';
import { WorldTurnStateController } from './world/WorldTurnStateController';
import type { CombatFeedbackKind } from './world/CombatFeedback';
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
    private player: Player;
    private partyActors: FieldActor[] = [];
    private fieldEnemies: FieldEnemy[] = [];
    private remotePartyActors: Map<string, FieldActor> = new Map();
    private networkRaidClient: NetworkRaidClient | null = null;
    private isNetworkRaid = false;
    private isNetworkRaidConnecting = false;
    private networkWasReconnecting = false;
    private networkPlayerId: string | null = null;
    private actionMenuUI = new ActionMenuUI();
    private entityInfoUI = new EntityInfoUI();
    private fusionTempleUI = new FusionTempleUI();
    private minimapUI: MinimapUI;
    private townSession: WorldTownSession;
    private raidSession: WorldRaidSession;
    private currentPhase: WorldPhase = 'lobby';
    private combatController: WorldCombatController;
    private movementController: WorldMovementController;
    private enemyTurnController: WorldEnemyTurnController;
    private magicController: WorldMagicController;
    private toolController: WorldToolController;
    private playerActionController: WorldPlayerActionController;
    private raidOutcomeController: WorldRaidOutcomeController;
    private tacticalController: WorldTacticalController;
    private selectionController: WorldSelectionController;
    private fieldSpawnController: WorldFieldSpawnController;
    private renderController: WorldRenderController;
    private inputController: WorldInputController;
    private storyScenarioController: WorldStoryScenarioController;
    private networkSyncController: WorldNetworkSyncController;
    private tutorialController: WorldTutorialController;
    private raidLifecycleController: WorldRaidLifecycleController;
    private templeController: WorldTempleController;
    private restingController: WorldRestingController;
    private lootController: WorldLootController;
    private combatFeedbackController: WorldCombatFeedbackController;
    private networkIntentController: WorldNetworkIntentController;
    private turnStateController = new WorldTurnStateController();
    private hoverTile: TilePoint = { x: -1, y: -1 };
    private combatLog: string[] = [];
    private followRepathTimer: number = 0;
    private fanfareLeaderActorId: string | null = null;
    private floatingText = new FloatingTextManager();
    private effectManager = new EffectManager();
    private attackCues: AttackCue[] = [];
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
        this.minimapUI = new MinimapUI({
            getTile: (gx, gy) => this.worldMap.getTileAt(gx, gy),
            getPlayerPos: () => ({ x: this.player.gridX, y: this.player.gridY }),
            getBounds: () => this.worldMap.getBoundsTiles(),
            getLandmarks: () => this.worldMap.getMapLandmarks(),
            getEnemies: () => this.fieldEnemies.map((entry) => entry.enemy),
            getExtractionZones: () => this.worldMap.extractionZones,
            getLoot: () => this.worldMap.loot,
        });
        this.combatFeedbackController = new WorldCombatFeedbackController({
            getWorldTime: () => this.worldTime,
            shakeCamera: (amount, durationMs) => this.camera.shake(amount, durationMs),
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
        this.templeController = new WorldTempleController({
            party: this.party,
            raidSession: this.raidSession,
            fusionTempleUI: this.fusionTempleUI,
            getWorldMap: () => this.worldMap,
            getControlledActor: () => this.getControlledActor(),
            getFieldEnemies: () => this.fieldEnemies,
            isNetworkRaid: () => this.isNetworkRaid,
            getPhase: () => this.currentPhase,
            setPhase: (phase) => { this.currentPhase = phase; },
            beginRaidFromCurrentHub: (realm) => { void this.beginRaidFromCurrentHub(realm); },
            closeFieldOverlays: () => this.closeFieldOverlays(),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            placePartyNear: (tile) => this.placePartyNear(tile),
            setPlayer: (player) => { this.player = player; },
            setFieldEnemies: (enemies) => { this.fieldEnemies = enemies; },
            clearWorldLoot: () => { this.worldMap.loot = []; },
            selectActor: (actorId) => this.selectionController.selectActor(actorId),
            log: (message) => this.addCombatLog(message),
        });
        this.restingController = new WorldRestingController({
            getPartyActors: () => this.partyActors,
            spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
            spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
            spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
            log: (message) => this.addCombatLog(message),
        });
        this.storyScenarioController = new WorldStoryScenarioController({
            playerData: this.playerData,
            raidSession: this.raidSession,
            getWorldMap: () => this.worldMap,
            setWorldMap: (worldMap) => { this.worldMap = worldMap; },
            getPlayer: () => this.player,
            setPlayer: (player) => { this.player = player; },
            getFieldEnemies: () => this.fieldEnemies,
            setFieldEnemies: (fieldEnemies) => { this.fieldEnemies = fieldEnemies; },
            getControlledActor: () => this.getControlledActor(),
            actorTile: (actor) => this.actorTile(actor),
            placePartyNear: (tile) => this.placePartyNear(tile),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            closeFieldOverlays: () => this.closeFieldOverlays(),
            selectActor: (actorId) => this.selectionController.selectActor(actorId),
            clearSelection: () => this.selectionController.clear(),
            applyMonsterSprite: (enemy, monsterId) => this.applyMonsterSprite(enemy, monsterId),
            isEntityMoving: (entity) => this.isEntityMoving(entity),
            isNetworkRaid: () => this.isNetworkRaid,
            getNetworkRaidClient: () => this.networkRaidClient,
            isRaidOutcomeVisible: () => this.raidOutcomeController.isVisible(),
            isTownVisible: () => this.townSession.isVisible(),
            isFusionTempleVisible: () => this.fusionTempleUI.isVisible(),
            followCameraToPlayer: () => {
                this.camera.followTile(this.player.gridX, this.player.gridY);
                this.camera.snapToTarget();
            },
            focusCameraOnTile: (tile) => {
                this.camera.followTile(tile.x, tile.y);
                this.camera.snapToTarget();
            },
            autoPlaceRewardItem: (itemId) => {
                const item = getItemDef(itemId);
                if (!item) return false;
                const placed = this.gameManager.inventory.autoPlace(item);
                if (placed) placed.acquiredInRaid = true;
                return Boolean(placed);
            },
            spawnDamage: (x, y, amount) => this.floatingText.spawnDamage(x, y, amount, false, false),
            log: (message) => this.addCombatLog(message),
        });
        this.tutorialController = new WorldTutorialController({
            party: this.party,
            raidSession: this.raidSession,
            townSession: this.townSession,
            getWorldMap: () => this.worldMap,
            setWorldMap: (worldMap) => { this.worldMap = worldMap; },
            getCurrentHubTown: () => this.getCurrentHubTown(),
            openTown: (town) => this.openTown(town),
            closeFieldOverlays: () => this.closeFieldOverlays(),
            resetStoryVisitState: () => this.storyScenarioController.resetVisitState(),
            resetPartyForRaid: () => this.party.resetForNewRaid(),
            applyPendingRestForRaidStart: () => this.townSession.applyPendingRestForRaidStart(),
            clearRemotePartyActors: () => this.remotePartyActors.clear(),
            setFieldEnemies: (fieldEnemies) => { this.fieldEnemies = fieldEnemies; },
            placePartyNear: (tile, overrideMembers) => this.placePartyNear(tile, overrideMembers),
            getControlledActor: () => this.getControlledActor(),
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            setPlayer: (player) => { this.player = player; },
            getPlayer: () => this.player,
            selectActor: (actorId) => this.selectionController.selectActor(actorId),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            setCurrentPhaseToRaid: () => { this.currentPhase = 'raid'; },
            setActiveTurn: (actorId, remainingActionPoints, majorActionUsed) => {
                if (actorId) this.turnStateController.setActiveTurn(actorId, remainingActionPoints, majorActionUsed);
                else this.turnStateController.endActiveTurn();
            },
            getTurnActionStates: (actor) => this.playerActionController.getTurnActionStates(actor),
            openActionMenu: (states) => this.actionMenuUI.open(states),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            actorTile: (actor) => this.actorTile(actor),
            getActorAttackTargetFailureFromTile: (actor, casterTile, enemy) =>
                this.getActorAttackTargetFailureFromTile(actor, casterTile, enemy),
            updateEffects: (dt) => this.effectManager.update(dt),
            updateFloatingText: (dt) => this.floatingText.update(dt),
            updateAttackCues: (dt) => this.updateAttackCues(dt),
            followCameraToPlayer: (camera, dt) => {
                camera.followTile(this.player.gridX, this.player.gridY);
                if (dt !== undefined) camera.update(dt);
            },
            snapCameraToActor: (actor) => {
                this.camera.followTile(actor.entity.gridX, actor.entity.gridY);
                this.camera.snapToTarget();
            },
            getLastCombatLog: () => this.combatLog[this.combatLog.length - 1],
            log: (message) => this.addCombatLog(message),
        });
        this.networkSyncController = new WorldNetworkSyncController({
            party: this.party,
            gameManager: this.gameManager,
            storyScenarioController: this.storyScenarioController,
            getNetworkPlayerId: () => this.networkPlayerId,
            getNetworkRaidClient: () => this.networkRaidClient,
            getWorldMap: () => this.worldMap,
            getPartyActors: () => this.partyActors,
            setPartyActors: (actors) => { this.partyActors = actors; },
            getRemotePartyActors: () => this.remotePartyActors,
            getFieldEnemies: () => this.fieldEnemies,
            setFieldEnemies: (fieldEnemies) => { this.fieldEnemies = fieldEnemies; },
            getControlledActor: () => this.getControlledActor(),
            setPlayer: (player) => { this.player = player; },
            getActiveTurnActorId: () => this.turnStateController.getActiveTurnActorId(),
            setActiveTurnActorId: (actorId) => this.turnStateController.setActiveTurnActorId(actorId),
            getRemainingActionPoints: () => this.turnStateController.getRemainingActionPoints(),
            setRemainingActionPoints: (points) => this.turnStateController.setRemainingActionPoints(points),
            setMajorActionUsedThisTurn: (used) => this.turnStateController.setMajorActionUsedThisTurn(used),
            hasSelection: () => this.selectionController.hasSelection(),
            selectActor: (actorId) => this.selectionController.selectActor(actorId),
            selectLoot: (lootId) => this.selectionController.selectLoot(lootId),
            getActionMenuIsOpen: () => this.actionMenuUI.getIsOpen(),
            getPlayerActionMode: () => this.playerActionController.getMode(),
            hasExecutableAction: (actor) => this.playerActionController.hasExecutableAction(actor),
            reopenActionMenu: (actor) => this.reopenActionMenu(actor),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            actorTile: (actor) => this.actorTile(actor),
            enemyTile: (enemy) => this.enemyTile(enemy),
            applyMonsterSprite: (enemy, monsterId) => this.applyMonsterSprite(enemy, monsterId),
            isEntityMoving: (entity) => this.isEntityMoving(entity),
            beginCombatFeedbackGroup: () => this.beginCombatFeedbackGroup(),
            registerCombatFeedback: (kind, feedbackGroupId) => this.registerCombatFeedback(kind, feedbackGroupId),
            flushCombatFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
            spawnKillEffect: (enemy, feedbackGroupId) => {
                this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy);
                this.registerCombatFeedback('kill', feedbackGroupId);
            },
            spawnDebuffEffect: (x, y) => this.effectManager.spawnDebuffEffect(x, y),
            spawnHitEffect: (x, y) => this.effectManager.spawnHitEffect(x, y),
            spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
            spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
            spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
            spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
            log: (message) => this.addCombatLog(message),
        });
        this.networkIntentController = new WorldNetworkIntentController({
            networkSyncController: this.networkSyncController,
            isNetworkRaid: () => this.isNetworkRaid,
            getNetworkRaidClient: () => this.networkRaidClient,
        });
        this.combatController = new WorldCombatController({
            log: (message) => this.addCombatLog(message),
            spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
            spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
            spawnHitEffect: (x, y, isCrit, feedbackGroupId, feedbackKind) => {
                this.effectManager.spawnHitEffect(x, y, isCrit);
                this.registerCombatFeedback(feedbackKind ?? (isCrit ? 'critical' : 'normal'), feedbackGroupId);
            },
            spawnKillEffect: (enemy, feedbackGroupId) => {
                this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy);
                this.registerCombatFeedback('kill', feedbackGroupId);
            },
            spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
            spawnLoot: (enemy) => {
                if (!this.isIntroTutorialEnemy(enemy)) this.spawnEnemyLoot(enemy);
            },
            awardExp: (actor, enemy) => {
                if (!this.isIntroTutorialEnemy(enemy)) this.awardDefeatExp(actor, enemy);
            },
            onEnemyDefeated: (enemy) => {
                if (this.isIntroTutorialEnemy(enemy)) {
                    this.completeIntroTutorial();
                    return;
                }
                this.storyScenarioController.completeDungeonIfBossDefeated(enemy);
            },
            flushFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
        });
        this.movementController = new WorldMovementController({
            getPartyActors: () => this.partyActors,
            getFieldEnemies: () => this.fieldEnemies,
            getTileAt: (x, y) => this.worldMap.getTileAt(x, y),
            isGroundWalkable: (x, y) => this.worldMap.isWalkable(x, y),
            getTerrainTraitsForActorId: (actorId) => this.getTerrainTraitsForActorId(actorId),
            getPartyCarryAtbMultiplier: () => getCarryAtbMultiplier(
                getPartyCarriedWeight(this.gameManager.inventory.items, this.party.getCharacters())
            ),
        });
        this.fieldSpawnController = new WorldFieldSpawnController(this.movementController);
        this.enemyTurnController = new WorldEnemyTurnController(
            {
                getPartyActors: () => this.partyActors,
                getFieldEnemies: () => this.fieldEnemies,
                getActorById: (actorId) => this.getActorById(actorId),
                getEnemyById: (enemyId) => this.getEnemyById(enemyId),
                getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
                getActorTerrainTraits: (actor) => this.getActorTerrainTraits(actor),
                canEnemyAttackTarget: (enemy, actor, range) => this.canEnemyAttackTarget(enemy, actor, range),
                canActorAttackTarget: (actor, enemy) => this.canActorAttackTarget(actor, enemy),
                hasFieldLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to),
                directionFromTo: (from, to) => this.directionFromTo(from, to),
            },
            this.movementController,
            this.combatController,
            {
                log: (message) => this.addCombatLog(message),
                spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
                spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
                spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
                spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
                spawnBuffEffect: (x, y) => this.effectManager.spawnBuffEffect(x, y),
                spawnDebuffEffect: (x, y) => this.effectManager.spawnDebuffEffect(x, y),
                spawnDarkEffect: (x, y) => this.effectManager.spawnDarkEffect(x, y),
                spawnElementEffect: (element, x, y, feedbackGroupId) => {
                    this.effectManager.spawnByElement(element, x, y);
                    this.registerCombatFeedback('normal', feedbackGroupId);
                },
                spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
                beginFeedbackGroup: () => this.beginCombatFeedbackGroup(),
                flushFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            }
        );
        this.selectionController = new WorldSelectionController({
            getPartyActors: () => this.partyActors,
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            getLootById: (lootId) => this.worldMap.loot.find((candidate) => candidate.id === lootId) ?? null,
        });
        this.lootController = new WorldLootController({
            gameManager: this.gameManager,
            selectionController: this.selectionController,
            storyScenarioController: this.storyScenarioController,
            networkSyncController: this.networkSyncController,
            getWorldMap: () => this.worldMap,
            isNetworkRaid: () => this.isNetworkRaid,
            isLocalLootEnabled: () => this.tutorialController.isActive(),
            getNetworkRaidClient: () => this.networkRaidClient,
            getControlledActor: () => this.getControlledActor(),
            clearControlledPath: () => this.clearControlledPath(),
            log: (message) => this.addCombatLog(message),
        });
        this.magicController = new WorldMagicController(
            {
                getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
                getPartyActors: () => this.partyActors,
                getFieldEnemies: () => this.fieldEnemies,
                getEnemyById: (enemyId) => this.getEnemyById(enemyId),
                getRemainingActionPoints: () => this.getSpendableActionGauge(),
                getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
                getBoundsTiles: () => this.worldMap.getBoundsTiles(),
                hasFieldLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to),
                spendAp: (cost) => this.spendAp(cost),
                isMajorActionUsed: () => this.turnStateController.isMajorActionUsed(),
                markMajorActionUsed: () => this.turnStateController.markMajorActionUsed(),
                submitNetworkSkillIntent: (actor, skill, targetEnemy) => this.submitNetworkSkillIntent(actor, skill.id, targetEnemy?.id),
                reopenActionMenu: (actor) => this.reopenActionMenu(actor),
                resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
                handleEnemyDefeated: (actor, enemy, feedbackGroupId) => this.handleEnemyDefeated(actor, enemy, feedbackGroupId),
                onActionCompleted: (action) => this.advanceIntroTutorialStep(action),
            },
            {
                log: (message) => this.addCombatLog(message),
                spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
                spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
                spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
                spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
                spawnHitEffect: (x, y, feedbackGroupId, feedbackKind) => {
                    this.effectManager.spawnHitEffect(x, y);
                    this.registerCombatFeedback(feedbackKind ?? 'normal', feedbackGroupId);
                },
                spawnBuffEffect: (x, y) => this.effectManager.spawnBuffEffect(x, y),
                spawnDebuffEffect: (x, y) => this.effectManager.spawnDebuffEffect(x, y),
                spawnElementEffect: (element, x, y, feedbackGroupId) => {
                    this.effectManager.spawnByElement(element, x, y);
                    this.registerCombatFeedback('normal', feedbackGroupId);
                },
                spawnSkillEffect: (skill, x, y, phase, feedbackGroupId) => {
                    this.effectManager.spawnSkillEffect(skill, x, y, phase);
                    if (feedbackGroupId) {
                        const kind = skill.type === 'debuff' ? 'status' : 'normal';
                        this.registerCombatFeedback(kind, feedbackGroupId);
                    }
                },
                beginFeedbackGroup: () => this.beginCombatFeedbackGroup(),
                flushFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            }
        );
        this.toolController = new WorldToolController(
            {
                getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
                getRemainingActionPoints: () => this.getSpendableActionGauge(),
                getInventoryItems: () => this.gameManager.inventory.items,
                removeInventoryItem: (placed) => this.gameManager.inventory.remove(placed),
                spendAp: (cost) => this.spendAp(cost),
                isMajorActionUsed: () => this.turnStateController.isMajorActionUsed(),
                markMajorActionUsed: () => this.turnStateController.markMajorActionUsed(),
                submitNetworkUseItem: (actor, itemId) => this.submitNetworkUseItemIntent(actor, itemId),
                reopenActionMenu: (actor) => this.reopenActionMenu(actor),
                resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
            },
            {
                log: (message) => this.addCombatLog(message),
                spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
                spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
                spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
            }
        );
        this.playerActionController = new WorldPlayerActionController(
            {
                getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
                getPartyActors: () => this.partyActors,
                getFieldEnemies: () => this.fieldEnemies,
                getRemainingActionPoints: () => this.getSpendableActionGauge(),
                getReservedAction: () => this.turnStateController.getReservedAction(),
                getActiveTurnActorId: () => this.turnStateController.getActiveTurnActorId(),
                getActorTerrainMovementBudget: (actor) => this.getActorTerrainMovementBudget(actor),
                getActorTerrainStepCost: (actor, tile) => this.getActorTerrainStepCost(actor, tile),
                getActorAttackProfile: (actor) => this.getActorAttackProfile(actor),
                getPatternContext: (actor) => this.getPatternContext(actor),
                getActorAttackTargetFailure: (actor, enemy) => this.getActorAttackTargetFailure(actor, enemy),
                getEnemyById: (enemyId) => this.getEnemyById(enemyId),
                getLootById: (lootId) => this.worldMap.loot.find((candidate) => candidate.id === lootId) ?? null,
                getLoot: () => this.worldMap.loot,
                isActorAt: (actor, tile) => this.isActorAt(actor, tile),
                isEntityMoving: (entity) => this.isEntityMoving(entity),
                isFieldPassable: (query) => this.movementController.isFieldPassable(query),
                getBlockedMoveMessage: (tile) => this.storyScenarioController.getLockedDoorMessage(tile),
                spendAp: (cost) => this.spendAp(cost),
                isMajorActionUsed: () => this.turnStateController.isMajorActionUsed(),
                markMajorActionUsed: () => this.turnStateController.markMajorActionUsed(),
                getFanfareLeaderId: () => this.fanfareLeaderActorId,
                setFanfareLeaderId: (actorId) => {
                    this.fanfareLeaderActorId = actorId;
                    this.followRepathTimer = 0;
                },
                getFanfareFollowerCount: (actor) => this.getFanfareFollowerCount(actor),
                submitMoveIntent: (actor, tile, path, apCost, pathCost) =>
                    this.submitNetworkMoveIntent(actor, tile, path, apCost, pathCost),
                submitActionIntent: (actor, action) => this.submitNetworkActionIntent(actor, action),
                tryActorAttack: (actor, enemy) => this.tryActorAttack(actor, enemy),
                openLoot: (loot) => this.openLoot(loot),
                openMagic: (actor) => this.openFieldMagic(actor),
                openTool: (actor) => this.openFieldTool(actor),
                hasCastableFieldSkill: (actor) => (this.isNetworkRaid || this.tutorialController.isActive()) && this.magicController.hasCastableFieldSkill(actor.character),
                hasUsableCombatTool: (actor) => (this.isNetworkRaid || this.tutorialController.isActive()) && this.toolController.hasUsableCombatTool(actor),
                getCombatToolAvailability: (actor) => (this.isNetworkRaid || this.tutorialController.isActive())
                    ? this.toolController.getCombatToolAvailability(actor)
                    : { hasRecoveryConsumable: false, hasEffectiveRecovery: false },
                reopenActionMenu: (actor) => this.reopenActionMenu(actor),
                closeActionMenu: () => this.closeActionMenu(),
                closeTacticalMenu: () => this.closeTacticalMenu(),
                resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
                endActorTurn: (actor, reason, atbCarryover) => this.endActorTurn(actor, reason, atbCarryover),
                clearActorIntent: (actor) => this.clearActorIntent(actor),
                setReservedAction: (intent) => this.turnStateController.setReservedAction(intent),
                selectEnemy: (enemyId) => this.selectionController.selectEnemy(enemyId),
                selectLoot: (lootId) => this.selectionController.selectLoot(lootId),
                filterActionTiles: (action, actor, tiles) => this.filterIntroTutorialActionTiles(action, actor, tiles),
                getAdditionalInteractTiles: (actor) => this.storyScenarioController.getInspectableFieldEventTiles(actor),
                interactAtTile: (actor, tile) => this.storyScenarioController.playFieldEventAt(tile, actor),
                onActionCompleted: (action) => this.advanceIntroTutorialStep(action),
            },
            {
                log: (message) => this.addCombatLog(message),
                spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
                spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
                spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
                spawnBuffEffect: (x, y) => this.effectManager.spawnBuffEffect(x, y),
            }
        );
        this.raidOutcomeController = new WorldRaidOutcomeController({
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            raidSession: this.raidSession,
            townSession: this.townSession,
            getTownById: (townId) => this.getTownById(townId),
            getCurrentHubTown: () => this.getCurrentHubTown(),
            resetStoryScenarioStateForRaidEnd: () => this.storyScenarioController.resetRunState(),
            placePartyAtTown: (town) => {
                this.placePartyNear(this.worldMap.getTownSpawnTile(town));
                this.player = this.getControlledActor()?.entity ?? this.player;
                this.clearFieldTurnState();
            },
            openTown: (town) => this.openTown(town),
            setPhase: (phase) => { this.currentPhase = phase; },
            log: (message) => this.addCombatLog(message),
        });
        this.raidLifecycleController = new WorldRaidLifecycleController({
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            raidSession: this.raidSession,
            townSession: this.townSession,
            raidOutcomeController: this.raidOutcomeController,
            storyScenarioController: this.storyScenarioController,
            networkSyncController: this.networkSyncController,
            getWorldMap: () => this.worldMap,
            getTownById: (townId) => this.getTownById(townId),
            getCurrentHubTown: () => this.getCurrentHubTown(),
            getNetworkRaidClient: () => this.networkRaidClient,
            setNetworkRaidClient: (client) => { this.networkRaidClient = client; },
            isNetworkRaid: () => this.isNetworkRaid,
            setIsNetworkRaid: (isNetworkRaid) => { this.isNetworkRaid = isNetworkRaid; },
            isNetworkRaidConnecting: () => this.isNetworkRaidConnecting,
            setIsNetworkRaidConnecting: (isConnecting) => { this.isNetworkRaidConnecting = isConnecting; },
            isNetworkWasReconnecting: () => this.networkWasReconnecting,
            setNetworkWasReconnecting: (wasReconnecting) => { this.networkWasReconnecting = wasReconnecting; },
            getNetworkPlayerId: () => this.networkPlayerId,
            setNetworkPlayerId: (playerId) => { this.networkPlayerId = playerId; },
            closeFieldOverlays: () => this.closeFieldOverlays(),
            clearFieldTurnState: () => this.clearFieldTurnState(),
            clearIntroTutorialStateForNetworkRaid: () => this.clearIntroTutorialStateForNetworkRaid(),
            clearRemotePartyActors: () => this.remotePartyActors.clear(),
            placePartyNear: (tile) => this.placePartyNear(tile),
            getControlledActor: () => this.getControlledActor(),
            setPlayer: (player) => { this.player = player; },
            setPartyActors: (actors) => { this.partyActors = actors; },
            setFieldEnemies: (enemies) => { this.fieldEnemies = enemies; },
            clearWorldLoot: () => { this.worldMap.loot = []; },
            selectActor: (actorId) => this.selectionController.selectActor(actorId),
            syncCharacterMovementToClass: (character) => this.syncCharacterMovementToClass(character),
            isTurnCombatActive: () => this.isTurnCombatActive(),
            setPhase: (phase) => { this.currentPhase = phase; },
            applyNetworkSnapshot: (snapshot) => this.applyNetworkSnapshot(snapshot),
            handleNetworkCombatEvent: (event) => this.handleNetworkCombatEvent(event),
            openNetworkLoot: (grant) => this.openNetworkLoot(grant),
            handleNetworkAutoLootGrant: (grant) => this.handleNetworkAutoLootGrant(grant),
            handleNetworkInventoryConsumed: (message) => this.handleNetworkInventoryConsumed(message),
            handleNetworkActionRejected: (rejection) => this.handleNetworkActionRejected(rejection),
            log: (message) => this.addCombatLog(message),
        });
        this.tacticalController = new WorldTacticalController({
            resolveFieldHitAt: (tile) => this.resolveFieldHitAt(tile),
            getEnemyById: (enemyId) => this.getEnemyById(enemyId),
            getPartyActors: () => this.partyActors,
            getLoot: () => this.worldMap.loot,
            log: (message) => this.addCombatLog(message),
        });
        this.renderController = new WorldRenderController({
            party: this.party,
            playerData: this.playerData,
            getWorldMap: () => this.worldMap,
            townSession: this.townSession,
            raidSession: this.raidSession,
            fusionTempleUI: this.fusionTempleUI,
            actionMenuUI: this.actionMenuUI,
            entityInfoUI: this.entityInfoUI,
            effectManager: this.effectManager,
            floatingText: this.floatingText,
            minimapUI: this.minimapUI,
            magicController: this.magicController,
            toolController: this.toolController,
            playerActionController: this.playerActionController,
            raidOutcomeController: this.raidOutcomeController,
            tacticalController: this.tacticalController,
            selectionController: this.selectionController,
            getWorldTime: () => this.worldTime,
            getPhase: () => this.currentPhase,
            getPlayer: () => this.player,
            getControlledActor: () => this.getControlledActor(),
            getPartyActors: () => this.partyActors,
            getTutorialActors: () => this.tutorialController.getInstructor() ? [this.tutorialController.getInstructor()!] : [],
            getFieldEnemies: () => this.fieldEnemies,
            getActiveTurnActorId: () => this.turnStateController.getActiveTurnActorId(),
            getRemainingActionPoints: () => this.getSpendableActionGauge(),
            getMajorActionUsedThisTurn: () => this.turnStateController.getMajorActionUsedThisTurn(),
            getHoverTile: () => this.hoverTile,
            getPathPreviewTiles: (actor) => this.getPathPreviewTiles(actor),
            getAttackCues: () => this.attackCues,
            getCombatLog: () => this.combatLog,
            getActorTerrainTraits: (actor) => this.getActorTerrainTraits(actor),
            isTurnCombatActive: () => this.isTurnCombatActive(),
        });
        this.inputController = new WorldInputController({
            actionMenuUI: this.actionMenuUI,
            entityInfoUI: this.entityInfoUI,
            magicController: this.magicController,
            toolController: this.toolController,
            minimapUI: this.minimapUI,
            playerActionController: this.playerActionController,
            selectionController: this.selectionController,
            tacticalController: this.tacticalController,
            getCanvasSize: () => ({ width: this.canvas.width, height: this.canvas.height }),
            getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
            getActiveTurnActorId: () => this.turnStateController.getActiveTurnActorId(),
            getReservedAction: () => this.turnStateController.getReservedAction(),
            getControlledActor: () => this.getControlledActor(),
            getPartyActors: () => this.partyActors,
            getHoverTile: () => this.hoverTile,
            setHoverTile: (tile) => { this.hoverTile = tile; },
            isEntityMoving: (entity) => this.isEntityMoving(entity),
            resolveFieldHitAt: (tile) => this.resolveFieldHitAt(tile),
            switchToNextAliveActor: () => this.switchToNextAliveActor(),
            switchToPartyMember: (index) => this.switchToPartyMember(index),
            toggleActionMenuForControlled: () => this.toggleActionMenuForControlled(),
            closeActionMenu: () => this.closeActionMenu(),
            dismissActionMenuTurn: () => this.dismissActionMenuTurn(),
            closeTacticalMenu: () => this.closeTacticalMenu(),
            clearIntent: () => this.clearIntent(),
            log: (message) => this.addCombatLog(message),
            getCombatLog: () => this.combatLog,
            onUnhandledEscape: () => this.gameManager.openPauseMenu(),
        });
        this.spawnPartyAtCurrentHub();
        this.player = this.getControlledActor()?.entity ?? new Player(0, 0);
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        if (options.startIntroTutorial) {
            this.startIntroTutorial();
        } else if (NetworkRaidClient.hasStoredResumeToken()) {
            this.addCombatLog('월드 세션 재접속 중...');
            void this.beginRaidFromCurrentHub();
        } else {
            this.openTown(this.getCurrentHubTown());
            this.addCombatLog('마을에 도착했습니다. 출격 준비를 마치세요.');
        }

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.snapToTarget();
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.worldTime += dt;
        this.townSession.sync();

        if (this.raidOutcomeController.isVisible()) {
            this.raidOutcomeController.updateInput(input);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        if (this.fusionTempleUI.isVisible()) {
            this.fusionTempleUI.updateInput(input);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        if (this.townSession.isVisible()) {
            this.townSession.updateInput(input);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        if (this.tutorialController.isActive() && this.tutorialController.isCompletePending()) {
            this.updateIntroTutorialCompletion(input, dt, camera);
            return;
        }

        if (this.tutorialController.isActive() && input.justPressed('Escape')) {
            this.finishIntroTutorial(true);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        if (this.isNetworkRaid) {
            this.updateNetworkRaid(dt, input, camera);
            return;
        }

        if (this.updateStoryPresentation(dt, camera)) return;

        if (this.tutorialController.isActive() && input.mouseRightJustDown) {
            this.addIntroTutorialBlockedLog();
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        this.refreshOpenActionMenuState();
        this.inputController.process(input, camera);

        const partyMovement = this.movementController.updatePartyActors({
            dt,
            controlled: this.getFanfareLeaderActor(),
            activeTurnActorId: this.turnStateController.getActiveTurnActorId(),
            followRepathTimer: this.followRepathTimer,
        });
        this.followRepathTimer = partyMovement.followRepathTimer;
        for (const actorId of partyMovement.readyActorIds) this.turnStateController.enqueueReadyActor(actorId);

        const enemyMovement = this.movementController.updateEnemies({
            dt,
            activeTurnActorId: this.turnStateController.getActiveTurnActorId(),
        });
        for (const enemyId of enemyMovement.readyEnemyIds) this.turnStateController.enqueueReadyActor(enemyId);
        this.refreshEnemyIntentPreviews();
        this.refreshOpenActionMenuState();
        this.updateRestingActors(dt);
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.playerActionController.processQueuedIntents();
        this.refreshLootState();
        this.tacticalController.updateMarkers(dt);
        this.startNextReadyTurn();
        this.raidLifecycleController.updateRaidTimer(dt);
        this.raidLifecycleController.checkRaidEndConditions();
        this.templeController.checkArrival();
        this.storyScenarioController.checkDungeonArrival();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
    }

    public isModalOverlayVisible(): boolean {
        return this.townSession.isVisible() || this.raidOutcomeController.isVisible() || this.fusionTempleUI.isVisible();
    }

    public isQuestJournalAvailable(): boolean {
        return !this.raidOutcomeController.isVisible() && !this.fusionTempleUI.isVisible();
    }

    /** Town visit session (consumed by the React DOM overlay via GameManager). */
    public getTownSession(): WorldTownSession { return this.townSession; }

    public getRaidSession(): WorldRaidSession { return this.raidSession; }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        this.renderController.render(ctx, camera, width, height, { hideWorldHud: this.tutorialController.isActive() });
        if (this.tutorialController.isActive()) this.renderIntroTutorialHud(ctx, width, height);
    }

    public startIntroTutorial(): void {
        this.tutorialController.start();
    }

    private finishIntroTutorial(skipped: boolean): void {
        this.tutorialController.finish(skipped);
    }

    private completeIntroTutorial(): void {
        this.tutorialController.complete();
    }

    private updateIntroTutorialCompletion(input: InputManager, dt: number, camera: Camera): void {
        this.tutorialController.updateCompletion(input, dt, camera);
    }

    private clearIntroTutorialStateForNetworkRaid(): void {
        this.tutorialController.clearForNetworkRaid();
    }

    private advanceIntroTutorialStep(action: FieldApAction): void {
        this.tutorialController.advanceStep(action);
    }

    private isIntroTutorialEnemy(enemy: Enemy): boolean {
        return this.tutorialController.isTutorialEnemy(enemy);
    }

    private getActionMenuStates(actor: FieldActor): ActionMenuSlotState[] {
        return this.tutorialController.getActionMenuStates(actor);
    }

    private filterIntroTutorialActionTiles(action: 'move' | 'attack' | 'interact', actor: FieldActor, tiles: Set<string>): Set<string> {
        return this.tutorialController.filterActionTiles(action, actor, tiles);
    }

    private addIntroTutorialBlockedLog(): void {
        this.tutorialController.addBlockedLog();
    }

    private renderIntroTutorialHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.tutorialController.renderHud(ctx, width, height);
    }

    private spawnPartyAtCurrentHub(): void {
        this.placePartyNear(this.worldMap.getTownSpawnTile(this.getCurrentHubTown()));
    }

    private placePartyNear(anchorTile: TilePoint, overrideMembers?: Character[]): void {
        const members = (overrideMembers ?? this.party.getCharacters()).slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);
        members.forEach((character) => this.syncCharacterMovementToClass(character));
        this.partyActors = this.fieldSpawnController.createPartyActors(anchorTile, members);
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
        this.raidLifecycleController.openTown(town);
    }

    private async beginRaidFromCurrentHub(requestedRealm?: WorldRealmId): Promise<void> {
        return this.raidLifecycleController.beginRaidFromCurrentHub(requestedRealm);
    }

    public closeNetworkRaidClient(sendLeave: boolean, reason: 'town' | 'wipe' | 'manual' = 'manual'): void {
        this.raidLifecycleController.closeNetworkRaidClient(sendLeave, reason);
    }

    private closeFieldOverlays(): void {
        if (this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
        if (this.gameManager.partyUI.isVisible()) this.gameManager.partyUI.toggle();
        if (this.gameManager.charUI.isVisible()) this.gameManager.charUI.toggle();
        this.gameManager.closeQuestJournal();
        this.gameManager.closePauseMenu();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.magicController.reset();
        this.toolController?.reset();
        this.playerActionController.clearTargeting();
    }

    private clearFieldTurnState(): void {
        this.turnStateController.clear();
        this.fanfareLeaderActorId = null;
        this.restingController.clearTimers();
        this.closeActionMenu();
        this.magicController.reset();
        this.toolController?.reset();
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
        this.inputController.process(input, camera);
        for (const actor of this.partyActors) actor.entity.update(dt);
        for (const entry of this.fieldEnemies) entry.enemy.update(dt);
        this.networkSyncController.refreshMovePathPreview();
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.refreshLootState();
        this.storyScenarioController.checkDungeonArrival();
        this.refreshOpenActionMenuState();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
    }

    private updateStoryPresentation(dt: number, camera: Camera): boolean {
        if (!this.storyScenarioController.isPresentationActive()) return false;
        this.storyScenarioController.updatePresentation(dt);
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.update(dt);
        return true;
    }

    private applyNetworkSnapshot(snapshot: WorldSnapshot): void {
        this.raidSession.elapsedSeconds = snapshot.raidTimer.elapsedSeconds;
        this.networkSyncController.applySnapshot(snapshot);
    }

    private applyMonsterSprite(enemy: Enemy, monsterId: string): void {
        try {
            const definition = getMonsterDefinition(monsterId as MonsterId);
            enemy.setWalkSprite(
                `${MONSTER_SPRITE_PATH}/${definition.sprite}`,
                definition.frameSize,
                definition.frameSize,
                definition.frameCount,
                definition.framesPerSecond,
                MONSTER_ROW_BY_FACING,
                definition.renderScale
            );
        } catch {
            // Snapshot can still render with the fallback colored glyph.
        }
    }

    private openNetworkLoot(grant: LootGrantMessage): void {
        this.networkSyncController.openLoot(grant);
    }

    private handleNetworkAutoLootGrant(grant: AutoLootGrantMessage): void {
        this.networkSyncController.handleAutoLootGrant(grant);
    }

    private handleNetworkInventoryConsumed(message: InventoryConsumedMessage): void {
        this.networkSyncController.handleInventoryConsumed(message);
    }

    private handleNetworkActionRejected(rejection: ActionRejectedMessage): void {
        this.networkSyncController.handleActionRejected(rejection);
    }

    private handleNetworkCombatEvent(event: CombatEventMessage): void {
        this.networkSyncController.handleCombatEvent(event);
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
        this.tacticalController.close();
    }

    private updateRestingActors(dt: number): void {
        this.restingController.update(dt);
    }

    private stopResting(actor: FieldActor, logMessage?: string): void {
        this.restingController.stop(actor, logMessage);
    }

    private snapshotPartyHp(): Map<string, number> {
        return this.restingController.snapshotPartyHp();
    }

    private interruptRestingForDamage(beforeHpByActorId: Map<string, number>): void {
        this.restingController.interruptForDamage(beforeHpByActorId);
    }

    private isTurnCombatActive(): boolean {
        if (this.fieldEnemies.some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro)) return true;
        if (this.turnStateController.hasTurnActivity()) return true;
        if (this.actionMenuUI.getIsOpen() || this.playerActionController.getMode()) return true;
        if (this.tacticalController.isOpen()) return true;
        if (this.magicController.isActive()) return true;
        if (this.toolController?.isActive()) return true;
        return this.partyActors.some((actor) => actor.queuedIntent || actor.path.length > 0);
    }

    private applyCombatResult(result: CombatResult): void {
        for (const enemyId of result.killedEnemyIds) {
            this.raidSession.recordKill();
            this.selectionController.clearEnemyIfSelected(enemyId);
        }
        for (const characterId of result.downedCharacterIds) {
            const actor = this.partyActors.find((candidate) => candidate.character.id === characterId);
            if (actor && !actor.character.isDead) this.handleActorDown(actor);
            else this.raidSession.recordCharacterDown(characterId);
        }
    }

    private spawnEnemyLoot(enemy: Enemy): void {
        this.lootController.spawnEnemyLoot(enemy);
    }

    private submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        return this.networkIntentController.submitMove(actor, tile, path, apCost, pathCost);
    }

    private submitNetworkActionIntent(actor: FieldActor, action: 'defend' | 'rest'): boolean {
        return this.networkIntentController.submitAction(actor, action);
    }

    private submitNetworkUseItemIntent(actor: FieldActor, itemId: string): boolean {
        return this.networkIntentController.submitUseItem(actor, itemId);
    }

    private submitNetworkSkillIntent(actor: FieldActor, skillId: string, targetId?: string): boolean {
        return this.networkIntentController.submitSkill(actor, skillId, targetId);
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        if (this.isNetworkRaid) {
            return this.networkIntentController.submitAttack(actor, enemy);
        }
        if (!this.tutorialController.isActive()) {
            this.addCombatLog('서버 세션 밖에서는 전투 행동을 실행할 수 없습니다.');
            return false;
        }
        if (!this.canActorAttackTarget(actor, enemy)) return false;
        const profile = this.getActorAttackProfile(actor);
        const targetEnemies = this.getAttackPatternTargetEnemies(actor, enemy);
        const beforeHpByActorId = this.snapshotPartyHp();
        const result = this.combatController.tryActorAttack({
            actor,
            selectedEnemy: enemy,
            targetEnemies,
            profile,
            getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
            directionFromTo: (from, to) => this.directionFromTo(from, to),
            tryEnemyCounterAttack: (counterEnemy, counterActor) => {
                const countered = this.tryEnemyCounterAttack(counterEnemy, counterActor);
                return createCombatResult(countered);
            },
        });
        this.applyCombatResult(result);
        this.interruptRestingForDamage(beforeHpByActorId);
        return result.executed;
    }

    private tryEnemyCounterAttack(enemy: Enemy, actor: FieldActor): boolean {
        const beforeHpByActorId = this.snapshotPartyHp();
        const result = this.combatController.tryEnemyCounterAttack({
            enemy,
            actor,
            getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
            getActorTerrainTraits: (targetActor) => this.getActorTerrainTraits(targetActor),
        });
        this.applyCombatResult(result);
        this.interruptRestingForDamage(beforeHpByActorId);
        return result.executed;
    }

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void {
        if (this.isIntroTutorialEnemy(enemy)) {
            this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy);
            this.registerCombatFeedback('kill', feedbackGroupId);
            this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
            enemy.isAggro = false;
            this.selectionController.clearEnemyIfSelected(enemy.id);
            this.completeIntroTutorial();
            return;
        }

        this.awardDefeatExp(actor, enemy);
        this.raidSession.recordKill();
        this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy);
        this.registerCombatFeedback('kill', feedbackGroupId);
        this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
        enemy.isAggro = false;
        this.selectionController.clearEnemyIfSelected(enemy.id);

        this.spawnEnemyLoot(enemy);
        this.storyScenarioController.playEnemyDefeatEvent(enemy);
        this.storyScenarioController.completeDungeonIfBossDefeated(enemy);
    }

    private awardDefeatExp(actor: FieldActor, enemy: Enemy): void {
        const canGainExp = this.canCharacterGainExpInCurrentRealm(actor.character);
        this.addCombatLog(canGainExp ? `${enemy.name} 처치! +${enemy.expReward} EXP` : `${enemy.name} 처치!`);
        if (canGainExp) {
            const expResult = actor.character.gainExp(enemy.expReward);
            if (expResult.promoted && expResult.newTierName) {
                this.addCombatLog(`${actor.character.name} 승급: ${expResult.newTierName}`);
            }
            if (expResult.emblemUnlocked) {
                this.addCombatLog(`${actor.character.name}: 융합 문장 각성`);
            }
        } else {
            this.addCombatLog('이 월드에서는 해당 티어가 성장하지 않습니다.');
        }
    }

    private canCharacterGainExpInCurrentRealm(character: Character): boolean {
        const isMaster = isMasterClassLineId(character.classLineId) || character.currentTier >= 8;
        return this.worldMap.getRealm() === 'master' ? isMaster : !isMaster;
    }

    private handleActorDown(actor: FieldActor): void {
        this.raidSession.recordCharacterDown(actor.character.id);
        const index = this.partyActors.indexOf(actor);
        if (index === this.party.getActiveIndex()) {
            const next = this.party.markActiveDead();
            this.addCombatLog(`${actor.character.name} 쓰러짐`);
            this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'DOWN');
            if (next) {
                const nextIndex = this.partyActors.findIndex((candidate) => candidate.character === next);
                if (nextIndex >= 0) this.switchToPartyMember(nextIndex);
            } else {
                this.addCombatLog('출격조 전원 행동 불능');
            }
            return;
        }

        actor.character.isDead = true;
        actor.character.exp = 0;
        this.addCombatLog(`${actor.character.name} 쓰러짐`);
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'DOWN');
    }

    private openLoot(loot: LootObject): void {
        this.lootController.openLoot(loot);
    }

    private openFieldMagic(actor: FieldActor): void {
        if (!this.isNetworkRaid && !this.tutorialController.isActive()) {
            this.addCombatLog('서버 세션 밖에서는 마법을 사용할 수 없습니다.');
            this.reopenActionMenu(actor);
            return;
        }
        this.magicController.open(actor);
    }

    private openFieldTool(actor: FieldActor): void {
        if (!this.isNetworkRaid && !this.tutorialController.isActive()) {
            this.addCombatLog('서버 세션 밖에서는 도구를 사용할 수 없습니다.');
            this.reopenActionMenu(actor);
            return;
        }
        this.toolController.open(actor);
    }

    private refreshLootState(): void {
        this.lootController.refreshLootState();
    }

    private getLocalPartyActors(): FieldActor[] {
        // partyActors may also hold remote players' actors during a network raid, so
        // resolve local actors by Character identity rather than by raw index.
        const characters = this.party.getCharacters();
        return this.partyActors.filter((actor) => characters.includes(actor.character));
    }

    private getControlledActor(): FieldActor | null {
        const characters = this.party.getCharacters();
        const activeChar = characters[this.party.getActiveIndex()];
        const localActors = this.getLocalPartyActors();
        return localActors.find((actor) => actor.character === activeChar)
            ?? localActors.find((actor) => !actor.character.isDead)
            ?? localActors[0]
            ?? null;
    }

    private getFanfareFollowerCount(actor: FieldActor): number {
        if (this.isNetworkRaid) return 0;
        return this.getLocalPartyActors().filter((candidate) => candidate !== actor && !candidate.character.isDead).length;
    }

    private getFanfareLeaderActor(): FieldActor | null {
        if (!this.fanfareLeaderActorId || this.isNetworkRaid) return null;
        const leader = this.getLocalPartyActors().find((actor) => actor.id === this.fanfareLeaderActorId && !actor.character.isDead) ?? null;
        if (!leader) this.fanfareLeaderActorId = null;
        return leader;
    }

    private getActivePartyTurnActor(): FieldActor | null {
        const activeTurnActorId = this.turnStateController.getActiveTurnActorId();
        if (!activeTurnActorId) return null;
        return this.partyActors.find((actor) => actor.id === activeTurnActorId && !actor.character.isDead) ?? null;
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
        if (this.tutorialController.isActive() && actor.id !== this.turnStateController.getActiveTurnActorId()) {
            this.addIntroTutorialBlockedLog();
            return false;
        }
        if (!this.party.getCharacters().includes(actor.character)) {
            this.selectionController.selectActor(actor.id);
            this.addCombatLog(`${actor.character.name}: 원격 플레이어는 표시 전용입니다.`);
            return false;
        }
        if (!this.party.switchTo(index)) return false;
        this.player = actor.entity;
        this.selectionController.selectActor(actor.id);
        this.playerActionController.clearTargeting();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.addCombatLog(`${actor.character.name} 조작`);
        return true;
    }

    private toggleActionMenuForControlled(): void {
        const actor = this.getControlledActor();
        if (!actor) return;
        this.selectionController.selectActor(actor.id);

        if (!this.turnStateController.getActiveTurnActorId() && actor.entity.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
            this.beginActorTurn(actor);
        }

        if (actor.id !== this.turnStateController.getActiveTurnActorId()) {
            this.addCombatLog('아직 행동 순서가 아닙니다.');
            return;
        }

        if (this.actionMenuUI.getIsOpen()) {
            this.dismissActionMenuTurn();
            return;
        }

        this.closeTacticalMenu();
        this.actionMenuUI.open(this.getActionMenuStates(actor));
    }

    private closeActionMenu(): void {
        this.actionMenuUI.close();
    }

    private refreshOpenActionMenuState(): void {
        if (!this.actionMenuUI.getIsOpen()) return;
        const actor = this.getActivePartyTurnActor();
        if (!actor) {
            this.closeActionMenu();
            return;
        }
        this.actionMenuUI.updateStates(this.getActionMenuStates(actor));
    }

    private dismissActionMenuTurn(): void {
        if (this.tutorialController.isActive()) {
            const actor = this.getActivePartyTurnActor();
            if (actor) this.reopenActionMenu(actor);
            this.addIntroTutorialBlockedLog();
            return;
        }
        const actor = this.getActivePartyTurnActor();
        if (!actor) {
            this.closeActionMenu();
            return;
        }
        const carryover = this.turnStateController.getDismissCarryover();
        this.endActorTurn(actor, '대기', carryover);
    }

    private spendAp(cost: number): boolean {
        if (!this.turnStateController.spendAp(cost, this.getSpendableActionGauge())) return false;
        const actor = this.getActivePartyTurnActor();
        if (actor) actor.entity.actionGauge = this.turnStateController.getRemainingActionPoints();
        return true;
    }

    private resumeOrEndActiveTurn(actor: FieldActor): void {
        if (actor.id !== this.turnStateController.getActiveTurnActorId()) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) {
            this.endActorTurn(actor, '행동 불능', 0);
            return;
        }
        if (this.playerActionController.hasExecutableAction(actor)) {
            this.reopenActionMenu(actor);
            return;
        }
        this.endActorTurn(actor, '행동 게이지 부족', this.turnStateController.getRemainingActionPoints());
    }

    private reopenActionMenu(actor: FieldActor): void {
        if (actor.id !== this.turnStateController.getActiveTurnActorId()) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) return;
        if (this.turnStateController.getRemainingActionPoints() <= 0 && actor.entity.actionGauge >= MIN_FIELD_ACTION_GAUGE_COST) {
            this.turnStateController.setRemainingActionPoints(Math.floor(actor.entity.actionGauge));
        }
        this.selectionController.selectActor(actor.id);
        this.closeTacticalMenu();
        this.actionMenuUI.open(this.getActionMenuStates(actor));
    }

    private endActorTurn(actor: FieldActor, reason: string, atbCarryover: number = this.turnStateController.getRemainingActionPoints()): void {
        if (actor.id === this.turnStateController.getActiveTurnActorId()) this.networkIntentController.submitEndTurn(actor, reason);
        actor.entity.actionGauge = Math.max(0, Math.min(FIELD_MAX_ACTION_GAUGE, atbCarryover));
        this.turnStateController.endActiveTurn();
        this.clearActorIntent(actor);
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.playerActionController.clearTargeting();
        this.magicController.reset();
        this.toolController?.reset();
        this.addCombatLog(`${actor.character.name} 턴 종료: ${reason}`);
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
        this.playerActionController.clearTargeting();
        this.magicController.reset();
        this.toolController?.reset();
    }

    private processActorTurnStartStatuses(actor: FieldActor): boolean {
        const result = resolveTurnStartStatuses(getEffectiveStatsForCharacter(actor.character), actor.character.statuses);
        actor.character.statuses = result.statuses;
        if (result.expiredReaction) this.addCombatLog(`${actor.character.name}: 방어/반격 태세 해제`);
        if (result.poisonDamage > 0) {
            this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, result.poisonDamage, false, false);
            this.effectManager.spawnDebuffEffect(actor.entity.gridX, actor.entity.gridY);
            this.addCombatLog(`${actor.character.name}: 독 ${result.poisonDamage} 피해`);
            this.stopResting(actor, `${actor.character.name}: 피해로 휴식 중단`);
        }
        if (result.regenHealing > 0) {
            this.floatingText.spawnHeal(actor.entity.gridX, actor.entity.gridY, result.regenHealing);
            this.effectManager.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
            this.addCombatLog(`${actor.character.name}: 재생 ${result.regenHealing} 회복`);
        }
        const effective = getEffectiveStatsForCharacter(actor.character);
        actor.character.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.character.stats.hp + result.hpDelta));

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            this.handleActorDown(actor);
            return false;
        }
        return true;
    }

    private processEnemyTurnStartStatuses(entry: FieldEnemy): boolean {
        const enemy = entry.enemy;
        const result = resolveTurnStartStatuses(getEffectiveStatsForEnemy(enemy), enemy.statuses);
        enemy.statuses = result.statuses;
        if (result.expiredReaction) this.addCombatLog(`${enemy.name}: 방어/반격 태세 해제`);
        if (result.poisonDamage > 0) {
            this.floatingText.spawnDamage(enemy.gridX, enemy.gridY, result.poisonDamage, false, false);
            this.effectManager.spawnDebuffEffect(enemy.gridX, enemy.gridY);
            this.addCombatLog(`${enemy.name}: 독 ${result.poisonDamage} 피해`);
        }
        if (result.regenHealing > 0) {
            this.floatingText.spawnHeal(enemy.gridX, enemy.gridY, result.regenHealing);
            this.effectManager.spawnHealEffect(enemy.gridX, enemy.gridY);
            this.addCombatLog(`${enemy.name}: 재생 ${result.regenHealing} 회복`);
        }
        enemy.stats.hp = Math.max(0, Math.min(enemy.stats.maxHp, enemy.stats.hp + result.hpDelta));

        if (enemy.stats.hp <= 0) {
            const actor = this.getControlledActor() ?? this.partyActors.find((candidate) => !candidate.character.isDead);
            if (actor) this.handleEnemyDefeated(actor, enemy);
            else enemy.isAggro = false;
            return false;
        }
        return true;
    }

    private beginActorTurn(actor: FieldActor): void {
        const index = this.partyActors.indexOf(actor);
        if (index >= 0) this.switchToPartyMember(index);
        actor.entity.actionGauge = this.turnStateController.beginActorTurn(actor.id);
        this.selectionController.selectActor(actor.id);
        if (!this.processActorTurnStartStatuses(actor)) {
            this.endActorTurn(actor, '상태이상');
            return;
        }
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(formatT('field.log.turnStart', {
            name: actor.character.name,
            gauge: t('ui.actionGauge'),
            value: this.turnStateController.getRemainingActionPoints(),
        }));
        if (!this.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, '가능한 행동 없음');
        else {
            this.closeTacticalMenu();
            this.actionMenuUI.open(this.getActionMenuStates(actor));
        }
    }

    private beginEnemyTurn(entry: FieldEnemy): void {
        const enemy = entry.enemy;
        this.turnStateController.beginEnemyTurn(enemy.id);
        this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'READY');

        if (!this.processEnemyTurnStartStatuses(entry)) {
            this.endEnemyTurn(enemy);
            return;
        }

        const beforeHpByActorId = this.snapshotPartyHp();
        this.applyCombatResult(this.enemyTurnController.beginEnemyTurn(entry));
        this.interruptRestingForDamage(beforeHpByActorId);
        this.endEnemyTurn(enemy);
    }

    private refreshEnemyIntentPreviews(): void {
        for (const entry of this.fieldEnemies) {
            entry.previewIntent = this.enemyTurnController.previewEnemyIntent(entry);
        }
    }

    private getActorById(actorId: string): FieldActor | null {
        return this.partyActors.find((actor) => actor.id === actorId && !actor.character.isDead) ?? null;
    }

    private canEnemyAttackTarget(enemy: Enemy, actor: FieldActor, range: number): boolean {
        const distance = manhattan(this.enemyTile(enemy), this.actorTile(actor));
        if (distance > range) return false;
        return range <= 1 || this.hasFieldLineOfSight(this.enemyTile(enemy), this.actorTile(actor));
    }

    private getEnemyById(enemyId: string): Enemy | null {
        return this.fieldEnemies.find((entry) => entry.enemy.id === enemyId)?.enemy ?? null;
    }

    private getAttackRange(character: Character): number {
        return getClassLine(character.classLineId)?.attackRange ?? 1;
    }

    private getActorAttackProfile(actor: FieldActor): AttackPatternProfile {
        return getClassAttackProfile(actor.character.classLineId, this.getAttackRange(actor.character));
    }

    private getAttackPatternTargetEnemies(actor: FieldActor, selectedEnemy: Enemy): Enemy[] {
        const profile = this.getActorAttackProfile(actor);
        const effectTileKeys = new Set(
            getEffectTiles(profile, this.getPatternContext(actor, this.enemyTile(selectedEnemy)))
                .map((tile) => tileKey(tile.x, tile.y))
        );
        return this.fieldEnemies
            .map((entry) => entry.enemy)
            .filter((enemy) => enemy.stats.hp > 0 && effectTileKeys.has(tileKey(enemy.gridX, enemy.gridY)));
    }

    private getPatternContext(actor: FieldActor, selectedTile?: TilePoint, casterTile: TilePoint = this.actorTile(actor)): PatternContext {
        const bounds = this.worldMap.getBoundsTiles();
        return {
            casterTile,
            selectedTile,
            isInsideMap: (tile) => tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height,
            isBlockingTile: (tile) => isTerrainLineOfSightBlocking(this.worldMap.getTileAt(tile.x, tile.y)),
            hasLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to),
        };
    }

    private getActorTerrainMovementBudget(actor: FieldActor): number {
        if (hasStatus(actor.character.statuses, 'immobilize')) return 0;
        return Math.max(1, getEffectiveStatsForCharacter(actor.character).mov || actor.entity.moveRange);
    }

    private syncCharacterMovementToClass(character: Character): void {
        const baseMovRange = getClassLine(character.classLineId)?.baseMovRange;
        if (baseMovRange !== undefined) character.stats.mov = baseMovRange;
    }

    private getActorTerrainTraits(actor: FieldActor): TerrainActorTraits {
        const classLine = getClassLine(actor.character.classLineId);
        return {
            ignoresTerrain: classLine?.ignoresTerrain ?? false,
            waterBonus: classLine?.waterBonus ?? false,
        };
    }

    private getTerrainTraitsForActorId(actorId?: string): TerrainActorTraits {
        const actor = actorId ? this.partyActors.find((candidate) => candidate.id === actorId) : undefined;
        return actor ? this.getActorTerrainTraits(actor) : { ignoresTerrain: false, waterBonus: false };
    }

    private getActorTerrainStepCost(actor: FieldActor, tile: TilePoint): number {
        return getTerrainMoveCost(this.worldMap.getTileAt(tile.x, tile.y), this.getActorTerrainTraits(actor));
    }

    private getPathPreviewTiles(actor: FieldActor | null): TilePoint[] {
        if (!actor) return [];
        const networkPreview = this.networkSyncController.getPathPreviewTiles(actor);
        if (networkPreview) return networkPreview;
        if (this.isEntityMoving(actor.entity)) {
            const currentTarget = this.actorTile(actor);
            const [nextStep] = actor.path;
            if (!nextStep || nextStep.x !== currentTarget.x || nextStep.y !== currentTarget.y) {
                return [currentTarget, ...actor.path];
            }
        }
        return actor.path;
    }

    private getSpendableActionGauge(): number {
        if (this.turnStateController.getActiveTurnActorId() && this.isNetworkRaid) {
            return Math.max(0, Math.floor(this.turnStateController.getRemainingActionPoints()));
        }
        const actor = this.getActivePartyTurnActor();
        if (!actor) return this.turnStateController.getRemainingActionPoints();
        return Math.max(this.turnStateController.getRemainingActionPoints(), Math.floor(actor.entity.actionGauge));
    }

    private hasFieldLineOfSight(from: TilePoint, to: TilePoint): boolean {
        return hasLineOfSight(from, to, (tile) =>
            isTerrainLineOfSightBlocking(this.worldMap.getTileAt(tile.x, tile.y))
        );
    }

    private canActorAttackTarget(actor: FieldActor, enemy: Enemy): boolean {
        return this.getActorAttackTargetFailure(actor, enemy) === null;
    }

    private getActorAttackTargetFailure(actor: FieldActor, enemy: Enemy): AttackTargetFailure | null {
        return this.getActorAttackTargetFailureFromTile(actor, this.actorTile(actor), enemy);
    }

    private getActorAttackTargetFailureFromTile(actor: FieldActor, casterTile: TilePoint, enemy: Enemy): AttackTargetFailure | null {
        const profile = this.getActorAttackProfile(actor);
        const target = this.enemyTile(enemy);
        return resolveActorAttackTargetFailure({
            profile,
            context: this.getPatternContext(actor, undefined, casterTile),
            selectedContext: this.getPatternContext(actor, target, casterTile),
            target,
        });
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }

    private isActorAt(actor: FieldActor, tile: TilePoint): boolean {
        return actor.entity.gridX === tile.x && actor.entity.gridY === tile.y;
    }

    private isEntityMoving(entity: Player | Enemy): boolean {
        return Math.abs(entity.pixelX - entity.gridX) > 0.01 || Math.abs(entity.pixelY - entity.gridY) > 0.01;
    }

    private directionFromTo(from: TilePoint, to: TilePoint): 'up' | 'down' | 'left' | 'right' {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    private clearIntent(): void {
        if (this.turnStateController.getReservedAction()) return;
        const actor = this.getControlledActor();
        if (actor) this.clearActorIntent(actor);
        this.selectionController.selectActor(actor?.id ?? null);
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.playerActionController.clearTargeting();
        this.magicController.reset();
        this.toolController?.reset();
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
        this.combatLog.push(message);
        // Keep a generous history so drag-to-scroll can reach further back.
        if (this.combatLog.length > 200) this.combatLog.shift();
    }

    private beginCombatFeedbackGroup(): string {
        return this.combatFeedbackController.beginGroup();
    }

    private registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void {
        this.combatFeedbackController.register(kind, feedbackGroupId);
    }

    private flushCombatFeedbackGroup(feedbackGroupId: string): void {
        this.combatFeedbackController.flush(feedbackGroupId);
    }

    private spawnAttackCue(from: TilePoint, to: TilePoint, color: string, label?: string): void {
        this.attackCues.push({ from, to, color, label, timer: 0, duration: 0.38 });
    }

    private updateAttackCues(dt: number): void {
        for (let i = this.attackCues.length - 1; i >= 0; i--) {
            this.attackCues[i].timer += dt;
            if (this.attackCues[i].timer >= this.attackCues[i].duration) this.attackCues.splice(i, 1);
        }
    }

}
