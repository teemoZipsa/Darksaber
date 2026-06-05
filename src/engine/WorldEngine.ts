/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { AudioManager } from './AudioManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { GridInventory } from '../inventory/GridInventory';
import { getCarryAtbMultiplier, getPartyCarriedWeight } from '../inventory/CarryWeight';
import { PlayerData } from '../data/PlayerData';
import { getItemDef } from '../data/ItemDB';
import { rollBossRune } from '../data/SocketLoot';
import { getClassLine, isMasterClassLineId } from '../data/ClassTree';
import { normalizeLoadout } from '../magic/MagicLoadout';
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
    getStatus,
    hasStatus,
    removeActionStanceStatusesFromCarrier,
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
import { fuseActivePartyBranch, getFusionCandidates, hasActiveMasterCharacter } from '../character/FusionSystem';
import type { MasterBranch } from '../data/ClassTree';
import { TilePoint, manhattan, tileKey } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import { FIELD_MAX_ACTION_GAUGE, MIN_FIELD_ACTION_GAUGE_COST, enqueueReadyActor, type FieldApAction } from '../field/FieldActionEconomy';
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
import { resolveTownArrival } from '../raid/RaidRules';
import type { AttackCue, FieldActor, FieldEnemy, FieldHitParty, FieldIntent } from '../field/FieldTypes';
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
import { HitStop } from './world/HitStop';
import { HIT_FEEDBACK, strongerCombatFeedback, type CombatFeedbackKind } from './world/CombatFeedback';
import { NetworkRaidClient, WorldServerError, type NetworkRaidStatus } from '../net/NetworkRaidClient';
import {
    formatNetworkDeployFailure,
    formatNetworkStatusLog,
    formatReconnectRestoredLog,
    formatWorldServerErrorLog,
    getWorldServerErrorMessage,
} from '../net/NetworkRaidMessages';
import { DEFAULT_AUTH_SERVER_URL } from '../net/AuthClient';
import {
    DEFAULT_WORLD_SERVER_URL,
    type ActionRejectedMessage,
    type ActorSnapshot,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type InventoryConsumedMessage,
    type InventoryItemCountSnapshot,
    type LootGrantMessage,
    type RaidResultMessage,
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
    private activeTurnActorId: string | null = null;
    private readyQueue: string[] = [];
    private remainingActionPoints = 0;
    private majorActionUsedThisTurn = false;
    private reservedAction: FieldIntent | null = null;
    private restingRecoveryTimers = new Map<string, number>();
    private hoverTile: TilePoint = { x: -1, y: -1 };
    private combatLog: string[] = [];
    private feedbackGroups = new Map<string, CombatFeedbackKind>();
    private followRepathTimer: number = 0;
    private fanfareLeaderActorId: string | null = null;
    private floatingText = new FloatingTextManager();
    private effectManager = new EffectManager();
    private attackCues: AttackCue[] = [];
    private worldTime: number = 0;
    private dismissedTempleVisitKey: string | null = null;

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
        const initialHubTownId = this.getTownById(this.playerData.currentHubTownId)?.id ?? 'central_castle';
        this.raidSession = new WorldRaidSession(initialHubTownId);
        this.townSession = new WorldTownSession({
            party: this.party,
            playerData: this.playerData,
            gameManager: this.gameManager,
            onDeploy: () => this.beginRaidFromCurrentHub(),
            log: (message) => this.addCombatLog(message),
        });
        this.fusionTempleUI.onFuse = (branch) => this.performTempleFusion(branch);
        this.fusionTempleUI.onEnterMasterWorld = () => this.enterMasterWorld();
        this.fusionTempleUI.onReturnToMortalWorld = () => this.returnToMortalWorld();
        this.fusionTempleUI.onClose = () => {
            this.dismissedTempleVisitKey = this.getCurrentTempleVisitKey();
        };
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
                this.activeTurnActorId = actorId;
                this.remainingActionPoints = remainingActionPoints;
                this.majorActionUsedThisTurn = majorActionUsed;
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
            getActiveTurnActorId: () => this.activeTurnActorId,
            setActiveTurnActorId: (actorId) => { this.activeTurnActorId = actorId; },
            getRemainingActionPoints: () => this.remainingActionPoints,
            setRemainingActionPoints: (points) => { this.remainingActionPoints = points; },
            setMajorActionUsedThisTurn: (used) => { this.majorActionUsedThisTurn = used; },
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
                isMajorActionUsed: () => this.majorActionUsedThisTurn,
                markMajorActionUsed: () => this.markMajorActionUsed(),
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
                isMajorActionUsed: () => this.majorActionUsedThisTurn,
                markMajorActionUsed: () => this.markMajorActionUsed(),
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
                getReservedAction: () => this.reservedAction,
                getActiveTurnActorId: () => this.activeTurnActorId,
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
                spendAp: (cost) => this.spendAp(cost),
                isMajorActionUsed: () => this.majorActionUsedThisTurn,
                markMajorActionUsed: () => this.markMajorActionUsed(),
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
                setReservedAction: (intent) => { this.reservedAction = intent; },
                selectEnemy: (enemyId) => this.selectionController.selectEnemy(enemyId),
                selectLoot: (lootId) => this.selectionController.selectLoot(lootId),
                filterActionTiles: (action, actor, tiles) => this.filterIntroTutorialActionTiles(action, actor, tiles),
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
            placePartyAtTown: (town) => {
                this.placePartyNear(this.worldMap.getTownSpawnTile(town));
                this.player = this.getControlledActor()?.entity ?? this.player;
                this.clearFieldTurnState();
            },
            openTown: (town) => this.openTown(town),
            setPhase: (phase) => { this.currentPhase = phase; },
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
            getActiveTurnActorId: () => this.activeTurnActorId,
            getRemainingActionPoints: () => this.getSpendableActionGauge(),
            getMajorActionUsedThisTurn: () => this.majorActionUsedThisTurn,
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
            getActiveTurnActorId: () => this.activeTurnActorId,
            getReservedAction: () => this.reservedAction,
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
        this.gameManager.inventoryUI.onRaidLootSecured = (placed, source) => {
            if (!this.isNetworkRaid || !this.networkRaidClient || !source || !this.selectionController.lootId) return;
            const intentId = this.networkRaidClient.sendLootPickup(this.selectionController.lootId, source.gridX, source.gridY);
            this.networkSyncController.addPendingLootPick(intentId, placed, source);
            this.networkSyncController.purgeStaleLootPicks();
        };

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

        if (this.tutorialController.isActive() && input.mouseRightJustDown) {
            this.addIntroTutorialBlockedLog();
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        this.inputController.process(input, camera);

        const partyMovement = this.movementController.updatePartyActors({
            dt,
            controlled: this.getFanfareLeaderActor(),
            activeTurnActorId: this.activeTurnActorId,
            followRepathTimer: this.followRepathTimer,
        });
        this.followRepathTimer = partyMovement.followRepathTimer;
        for (const actorId of partyMovement.readyActorIds) enqueueReadyActor(this.readyQueue, actorId);

        const enemyMovement = this.movementController.updateEnemies({
            dt,
            activeTurnActorId: this.activeTurnActorId,
        });
        for (const enemyId of enemyMovement.readyEnemyIds) enqueueReadyActor(this.readyQueue, enemyId);
        this.updateRestingActors(dt);
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.playerActionController.processQueuedIntents();
        this.refreshLootState();
        this.tacticalController.updateMarkers(dt);
        this.startNextReadyTurn();
        this.updateRaidTimer(dt);
        this.checkRaidEndConditions();
        this.checkTempleArrival();
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
        if (this.isNetworkRaid) {
            // Reaching town while still flagged as a network raid means the player is
            // abandoning the run client-side, so tell the server instead of going silent.
            this.closeNetworkRaidClient(true);
            this.isNetworkRaid = false;
            this.networkPlayerId = null;
        }
        this.closeFieldOverlays();
        AudioManager.stopBgm(600);
        this.currentPhase = 'town';
        this.raidSession.enterTown(town.id);
        this.townSession.show(town);
    }

    private async beginRaidFromCurrentHub(requestedRealm?: WorldRealmId): Promise<void> {
        if (this.isNetworkRaidConnecting) return;
        this.clearIntroTutorialStateForNetworkRaid();
        const targetRealm = requestedRealm ?? this.worldMap.getRealm();
        if (this.worldMap.getRealm() !== targetRealm) this.worldMap.setRealm(targetRealm);
        const town = this.getCurrentHubTown();
        const authContext = this.gameManager.getNetworkAuthContext();
        if (!authContext) {
            this.addCombatLog(t('mp.deployNoAuth'));
            this.currentPhase = 'town';
            this.townSession.show(town);
            return;
        }
        this.isNetworkRaidConnecting = true;
        this.addCombatLog(t('mp.deployConnecting'));
        const isResumeJoin = NetworkRaidClient.hasStoredResumeToken();

        try {
            let joinAuthContext = await this.refreshNetworkAuthContext(authContext) ?? authContext;
            let welcome;
            try {
                welcome = await this.connectNetworkRaid(town, targetRealm, joinAuthContext);
            } catch (error) {
                if (!(error instanceof WorldServerError) || error.code !== 'AUTH_FAILED') throw error;
                const refreshed = await this.refreshNetworkAuthContext(authContext, true);
                if (!refreshed || refreshed.accessToken === joinAuthContext.accessToken) throw error;
                this.addCombatLog(t('mp.deployRetryAuth'));
                joinAuthContext = refreshed;
                welcome = await this.connectNetworkRaid(town, targetRealm, joinAuthContext);
            }

            this.applyServerCompletedQuestIds(welcome.completedQuestIds);
            this.townSession.hide();
            this.closeFieldOverlays();
            this.networkPlayerId = welcome.playerId;
            this.isNetworkRaid = true;
            this.currentPhase = 'raid';
            this.raidSession.beginRaidFromTown(town.id);
            this.storyScenarioController.resetVisitState();
            if (!isResumeJoin) {
                this.party.resetForNewRaid();
                this.townSession.applyPendingRestForRaidStart();
            }
            this.remotePartyActors.clear();
            this.storyScenarioController.resetNetworkState();
            this.partyActors = [];
            this.placePartyNear(welcome.spawnTile);
            this.player = this.getControlledActor()?.entity ?? this.player;
            this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
            this.fieldEnemies = [];
            this.worldMap.loot = [];
            this.clearFieldTurnState();
            this.addCombatLog(isResumeJoin
                ? `${this.worldMap.getDisplayName()} 서버 원정에 재접속했습니다.`
                : `${town.nameKr}에서 ${this.worldMap.getDisplayName()} 서버로 출격.`);
        } catch (error) {
            if (this.shouldReloadDevAutoStartAuth(error)) {
                console.warn('[Darksaber] Dev auth expired after server restart; reloading to issue a fresh dev session.');
                this.addCombatLog(t('mp.devAuthReload'));
                this.currentPhase = 'town';
                this.townSession.show(town);
                this.townSession.setDeployError(t('mp.devAuthRefreshing'));
                try {
                    localStorage.removeItem('darksaber_world_resume_token');
                } catch {
                    // Ignore storage failures during dev recovery.
                }
                window.setTimeout(() => window.location.reload(), 250);
                return;
            }
            this.isNetworkRaid = false;
            this.networkPlayerId = null;
            this.closeNetworkRaidClient(false);
            const errorMessage = getWorldServerErrorMessage(error);
            console.error('[Darksaber] World deploy failed', error);
            this.addCombatLog(formatNetworkDeployFailure(error));
            this.addCombatLog(t('mp.deployUnavailable'));
            this.currentPhase = 'town';
            this.townSession.show(town);
            this.townSession.setDeployError(formatT('mp.deployFailed', { message: errorMessage }));
        } finally {
            this.isNetworkRaidConnecting = false;
        }
    }

    private shouldReloadDevAutoStartAuth(error: unknown): boolean {
        if (!import.meta.env.DEV) return false;
        if (!(error instanceof WorldServerError) || error.code !== 'AUTH_FAILED') return false;
        const devStart = new URLSearchParams(window.location.search).get('devStart');
        return devStart === '1' || devStart === 'town';
    }

    private async connectNetworkRaid(
        town: TownInfo,
        requestedRealm: WorldRealmId,
        authContext: { accessToken: string; characterId: string }
    ) {
        this.closeNetworkRaidClient(false);
        this.networkRaidClient = this.createNetworkRaidClient();
        return this.networkRaidClient.connectAndJoin({
            accessToken: authContext.accessToken,
            characterId: authContext.characterId,
            originHubId: town.id,
            partyComposition: this.createPartyCompositionSnapshot(town),
            carriedWeight: getPartyCarriedWeight(this.gameManager.inventory.items, this.party.getCharacters()),
            carriedItems: this.createCarriedItemCounts(),
            completedQuestIds: Array.from(this.playerData.clearedStages),
            requestedRealm,
        });
    }

    private async refreshNetworkAuthContext(
        authContext: { accessToken: string; characterId: string },
        logFailure = false
    ): Promise<{ accessToken: string; characterId: string } | null> {
        try {
            const response = await fetch(`${DEFAULT_AUTH_SERVER_URL}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) {
                if (logFailure) this.addCombatLog(`인증 토큰 갱신 실패: HTTP ${response.status}`);
                return null;
            }
            const parsed = await response.json() as unknown;
            const accessToken = typeof parsed === 'object' && parsed !== null && 'accessToken' in parsed
                && typeof (parsed as { accessToken?: unknown }).accessToken === 'string'
                ? (parsed as { accessToken: string }).accessToken
                : null;
            if (!accessToken) return null;
            this.gameManager.updateNetworkAccessToken(accessToken);
            return { ...authContext, accessToken };
        } catch (error) {
            if (logFailure) this.addCombatLog(`인증 토큰 갱신 실패: ${error instanceof Error ? error.message : 'unknown error'}`);
            return null;
        }
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
        this.activeTurnActorId = null;
        this.readyQueue = [];
        this.remainingActionPoints = 0;
        this.majorActionUsedThisTurn = false;
        this.reservedAction = null;
        this.fanfareLeaderActorId = null;
        this.restingRecoveryTimers.clear();
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
            entry.enemy.actionGauge = 0;
            entry.enemy.isAggro = false;
        }
    }

    private createNetworkRaidClient(): NetworkRaidClient {
        return new NetworkRaidClient({
            url: DEFAULT_WORLD_SERVER_URL,
            onSnapshot: (snapshot) => this.applyNetworkSnapshot(snapshot),
            onCombatEvent: (event) => this.handleNetworkCombatEvent(event),
            onLootGrant: (grant) => this.openNetworkLoot(grant),
            onAutoLootGrant: (grant) => this.handleNetworkAutoLootGrant(grant),
            onInventoryConsumed: (message) => this.handleNetworkInventoryConsumed(message),
            onRaidResult: (result) => this.handleNetworkRaidResult(result),
            onActionRejected: (rejection) => this.handleNetworkActionRejected(rejection),
            onErrorMessage: (error) => this.addCombatLog(formatWorldServerErrorLog(error)),
            onStatusChange: (status) => this.handleNetworkStatusChange(status),
            onGraceExpired: () => this.handleNetworkGraceExpired(),
        });
    }

    private handleNetworkStatusChange(status: NetworkRaidStatus): void {
        switch (status) {
            case 'connecting':
                this.addCombatLog(formatNetworkStatusLog(status));
                break;
            case 'connected':
                this.addCombatLog(this.networkWasReconnecting
                    ? formatReconnectRestoredLog()
                    : formatNetworkStatusLog(status));
                this.networkWasReconnecting = false;
                break;
            case 'reconnecting':
                this.networkWasReconnecting = true;
                this.addCombatLog(formatNetworkStatusLog(status));
                break;
            case 'disconnected':
                this.addCombatLog(formatNetworkStatusLog(status));
                this.networkWasReconnecting = false;
                break;
            case 'idle':
                break;
        }
    }

    private createPartyCompositionSnapshot(town: TownInfo): ActorSnapshot[] {
        const exit = this.worldMap.getTownExitTile(town);
        return this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE).map((character, index) => {
            this.syncCharacterMovementToClass(character);
            return {
                id: character.id,
                localActorId: character.id,
                name: character.name,
                classLineId: character.classLineId,
                currentTier: character.currentTier,
                level: character.level,
                tile: {
                    x: exit.x + (index === 2 ? 1 : 0),
                    y: exit.y + (index === 1 ? 1 : 0),
                },
                stats: { ...character.stats },
                statuses: character.statuses.map((status) => ({ ...status })),
                actionGauge: 0,
                remainingAp: 0,
                majorActionUsed: false,
                facing: 'down',
                isDead: character.isDead,
                magicLoadout: normalizeLoadout(character.magicLoadout, character),
                skillUpgradeLevels: { ...character.skillUpgradeLevels },
            };
        });
    }

    private createCarriedItemCounts(): InventoryItemCountSnapshot[] {
        const counts = new Map<string, number>();
        for (const placed of this.gameManager.inventory.items) {
            const quantity = Math.max(1, Math.floor(placed.quantity));
            counts.set(placed.item.id, (counts.get(placed.item.id) ?? 0) + quantity);
        }
        return [...counts.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
    }

    private applyServerCompletedQuestIds(completedQuestIds: readonly string[] | undefined): void {
        if (!completedQuestIds) return;
        this.playerData.clearedStages = new Set(completedQuestIds);
    }

    private updateNetworkRaid(dt: number, input: InputManager, camera: Camera): void {
        this.inputController.process(input, camera);
        for (const actor of this.partyActors) actor.entity.update(dt);
        for (const entry of this.fieldEnemies) entry.enemy.update(dt);
        this.networkSyncController.refreshMovePathPreview();
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.refreshLootState();
        this.storyScenarioController.checkDungeonArrival();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
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

    private handleNetworkRaidResult(result: RaidResultMessage): void {
        if (result.playerId !== this.networkPlayerId) return;
        this.closeNetworkRaidClient(false);
        this.isNetworkRaid = false;
        this.networkPlayerId = null;
        this.raidSession.elapsedSeconds = result.elapsedSeconds;
        this.raidSession.kills = result.kills;
        this.storyScenarioController.applyNetworkScenarioResult(result.completedDungeonIds);
        if (result.result === 'SURVIVED') {
            const town = this.getTownById(result.extractionTownId) ?? this.getCurrentHubTown();
            this.raidOutcomeController.completeSuccess(town);
        } else if (result.result === 'DEAD' || result.result === 'MIA') {
            this.raidOutcomeController.completeFailure(result.result);
        } else {
            this.raidSession.failBackToTown(this.raidSession.currentHubTownId);
            this.openTown(this.getCurrentHubTown());
        }
    }

    private handleNetworkGraceExpired(): void {
        if (!this.isNetworkRaid || !this.raidSession.active) return;
        this.addCombatLog(t('mp.graceExpired'));
        this.closeNetworkRaidClient(false);
        this.isNetworkRaid = false;
        this.networkPlayerId = null;
        this.raidOutcomeController.completeFailure('MIA');
    }

    private closeNetworkRaidClient(sendLeave: boolean, reason: 'town' | 'wipe' | 'manual' = 'manual'): void {
        this.networkSyncController.clearPendingState();
        this.storyScenarioController.resetNetworkState();
        this.remotePartyActors.clear();
        if (!this.networkRaidClient) return;
        if (sendLeave) this.networkRaidClient.leave(reason);
        else this.networkRaidClient.close();
        this.networkRaidClient = null;
    }

    private checkTempleArrival(): void {
        const actor = this.getControlledActor();
        if (!actor) return;

        const temple = this.worldMap.getTempleAtTile(actor.entity.gridX, actor.entity.gridY);
        if (!temple) {
            this.dismissedTempleVisitKey = null;
            return;
        }

        const key = this.getCurrentTempleVisitKey();
        if (!key || this.dismissedTempleVisitKey === key || this.fusionTempleUI.isVisible()) return;

        const hostileActive = this.fieldEnemies.some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro);
        if (hostileActive) {
            this.addCombatLog('주변의 적을 정리해야 신전에 들어갈 수 있습니다.');
            this.dismissedTempleVisitKey = key;
            return;
        }

        this.openFusionTemple();
    }

    private openFusionTemple(): void {
        this.closeFieldOverlays();
        this.clearFieldTurnState();
        this.fusionTempleUI.show({
            realm: this.worldMap.getRealm(),
            candidates: getFusionCandidates(this.party),
            canEnterMasterWorld: hasActiveMasterCharacter(this.party),
        });
        this.addCombatLog(this.worldMap.getRealm() === 'master' ? '현세의 문에 도착했습니다.' : '융합의 신전에 들어섰습니다.');
    }

    private performTempleFusion(branch: MasterBranch): void {
        const result = fuseActivePartyBranch(this.party, branch);
        this.addCombatLog(result.message);
        if (!result.success) {
            this.fusionTempleUI.show({
                realm: this.worldMap.getRealm(),
                candidates: getFusionCandidates(this.party),
                canEnterMasterWorld: hasActiveMasterCharacter(this.party),
            });
            return;
        }

        this.fusionTempleUI.hide();
        this.enterMasterWorld();
    }

    private enterMasterWorld(): void {
        if (!hasActiveMasterCharacter(this.party)) {
            this.addCombatLog('마스터 클래스가 있어야 마스터 월드에 들어갈 수 있습니다.');
            return;
        }

        this.fusionTempleUI.hide();
        void this.beginRaidFromCurrentHub('master');
    }

    private returnToMortalWorld(): void {
        this.fusionTempleUI.hide();
        if (this.isNetworkRaid || this.currentPhase === 'raid') {
            void this.beginRaidFromCurrentHub('mortal');
            return;
        }
        this.raidSession.failBackToTown(this.raidSession.currentHubTownId);
        this.currentPhase = 'lobby';
        this.worldMap.setRealm('mortal');
        this.placePartyNear(this.worldMap.getPrimaryTempleTile());
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.clearFieldTurnState();
        this.dismissedTempleVisitKey = this.getCurrentTempleVisitKey();
        this.addCombatLog('현세의 융합 신전으로 돌아왔습니다.');
    }

    private getCurrentTempleVisitKey(): string | null {
        const actor = this.getControlledActor();
        if (!actor) return null;
        const temple = this.worldMap.getTempleAtTile(actor.entity.gridX, actor.entity.gridY);
        if (!temple) return null;
        return `${this.worldMap.getRealm()}:${temple.id}:${actor.entity.gridX},${actor.entity.gridY}`;
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

    private markMajorActionUsed(): void {
        if (this.activeTurnActorId) this.majorActionUsedThisTurn = true;
    }

    private updateRestingActors(dt: number): void {
        for (const actor of this.partyActors) {
            if (actor.character.isDead || actor.character.stats.hp <= 0) {
                this.restingRecoveryTimers.delete(actor.id);
                continue;
            }
            const resting = getStatus(actor.character.statuses, 'resting');
            if (!resting) {
                this.restingRecoveryTimers.delete(actor.id);
                continue;
            }

            const effective = getEffectiveStatsForCharacter(actor.character);
            if (resting.sourceType !== 'action' && actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
                this.stopResting(actor, `${actor.character.name}: 휴식 완료`);
                continue;
            }

            let timer = (this.restingRecoveryTimers.get(actor.id) ?? 0) + dt;
            const ticks = Math.floor(timer);
            if (ticks <= 0) {
                this.restingRecoveryTimers.set(actor.id, timer);
                continue;
            }
            timer -= ticks;
            this.restingRecoveryTimers.set(actor.id, timer);

            const hpPerTick = Math.max(2, Math.floor(effective.maxHp * 0.03));
            const mpPerTick = effective.maxMp > 0 ? Math.max(1, Math.floor(effective.maxMp * 0.03)) : 0;
            const beforeHp = actor.character.stats.hp;
            const beforeMp = actor.character.stats.mp;
            actor.character.stats.hp = Math.min(effective.maxHp, actor.character.stats.hp + hpPerTick * ticks);
            actor.character.stats.mp = Math.min(effective.maxMp, actor.character.stats.mp + mpPerTick * ticks);
            const hpGain = actor.character.stats.hp - beforeHp;
            const mpGain = actor.character.stats.mp - beforeMp;

            if (hpGain > 0) this.floatingText.spawnHeal(actor.entity.gridX, actor.entity.gridY, hpGain);
            if (mpGain > 0) this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, `MP+${mpGain}`);
            if (hpGain > 0 || mpGain > 0) this.effectManager.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);

            if (resting.sourceType !== 'action' && actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
                this.stopResting(actor, `${actor.character.name}: 휴식 완료`);
            }
        }
    }

    private stopResting(actor: FieldActor, logMessage?: string): void {
        const removed = removeStatusesFromCarrier(actor.character, (status) => status.kind === 'resting');
        this.restingRecoveryTimers.delete(actor.id);
        if (removed.length === 0) return;
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'REST END');
        if (logMessage) this.addCombatLog(logMessage);
    }

    private snapshotPartyHp(): Map<string, number> {
        return new Map(this.partyActors.map((actor) => [actor.id, actor.character.stats.hp]));
    }

    private interruptRestingForDamage(beforeHpByActorId: Map<string, number>): void {
        for (const actor of this.partyActors) {
            const beforeHp = beforeHpByActorId.get(actor.id);
            if (beforeHp === undefined) continue;
            if (actor.character.stats.hp < beforeHp) {
                this.stopResting(actor, `${actor.character.name}: 피해로 휴식 중단`);
                removeActionStanceStatusesFromCarrier(actor.character);
            }
        }
    }

    private updateRaidTimer(dt: number): void {
        const result = this.raidSession.advanceTimer(dt, {
            townVisible: this.townSession.isVisible(),
            resultVisible: this.raidOutcomeController.isVisible(),
            turnCombatActive: this.isTurnCombatActive(),
        });
        if (result.advanced) this.townSession.advancePartyTimedRestStatuses(dt);
        if (result.expired) {
            this.raidOutcomeController.completeFailure('MIA');
        }
    }

    private isTurnCombatActive(): boolean {
        if (this.fieldEnemies.some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro)) return true;
        if (this.activeTurnActorId) return true;
        if (this.readyQueue.length > 0) return true;
        if (this.reservedAction) return true;
        if (this.actionMenuUI.getIsOpen() || this.playerActionController.getMode()) return true;
        if (this.tacticalController.isOpen()) return true;
        if (this.magicController.isActive()) return true;
        if (this.toolController?.isActive()) return true;
        return this.partyActors.some((actor) => actor.queuedIntent || actor.path.length > 0);
    }

    private checkRaidEndConditions(): void {
        if (!this.raidSession.active || this.raidOutcomeController.isVisible()) return;
        if (this.party.isSquadWiped()) {
            this.raidOutcomeController.completeFailure('DEAD');
            return;
        }
        this.checkTownArrival();
    }

    private checkTownArrival(): void {
        const actor = this.getControlledActor();
        if (!actor || !this.worldMap.isWalkable(actor.entity.gridX, actor.entity.gridY)) return;

        const town = this.worldMap.getTownAtTile(actor.entity.gridX, actor.entity.gridY);
        const arrival = resolveTownArrival(town?.id, this.raidSession.departureTownId, this.raidSession.active);
        if (arrival.kind === 'none') {
            this.raidSession.clearDepartureBlock();
            return;
        }
        if (arrival.kind === 'departureBlocked') {
            if (this.raidSession.shouldReportDepartureBlock(arrival.townId)) {
                this.addCombatLog('출발한 마을로는 생환할 수 없습니다. 다른 마을로 이동하세요.');
            }
            return;
        }

        const destination = town ?? this.getTownById(arrival.townId ?? '') ?? this.getCurrentHubTown();
        this.raidOutcomeController.completeSuccess(destination);
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
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        const bossRune = enemy.isBoss ? rollBossRune(enemy.level) : null;
        const items = [bossRune, herb].filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (items.length === 0) return;
        const storyInteriorBossReturn = enemy.isBoss ? this.storyScenarioController.getActiveInterior() : null;
        const lootMap = storyInteriorBossReturn?.previousWorldMap ?? this.worldMap;
        const lootTile = storyInteriorBossReturn?.returnTile ?? { x: enemy.gridX, y: enemy.gridY };

        if (!enemy.isBoss) {
            const failedItems: typeof items = [];
            const acquiredNames: string[] = [];
            const bag = this.gameManager.inventoryUI.getBag();
            for (const item of items) {
                const placed = bag.autoPlace(item);
                if (placed) {
                    placed.acquiredInRaid = true;
                    acquiredNames.push(item.nameKr);
                } else {
                    failedItems.push(item);
                }
            }
            if (acquiredNames.length > 0) {
                this.addCombatLog(`${enemy.name} ${t('raid.autoLoot')}: ${acquiredNames.join(', ')}`);
            }
            if (failedItems.length === 0) return;

            this.addCombatLog(`${enemy.name}: ${t('raid.autoLootFull')}`);
            const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, failedItems, {
                sourceLabel: `${enemy.name} 전리품`,
                kind: 'corpse',
            });
            this.worldMap.loot.push(loot);
            return;
        }

        const loot = new LootObject(`corpse_${enemy.id}`, lootTile.x, lootTile.y, items, {
            sourceLabel: `${enemy.name} 전리품`,
            kind: 'corpse',
        });
        lootMap.loot.push(loot);
        if (storyInteriorBossReturn) {
            this.addCombatLog(formatT('story.interior.rewardAtEntrance', { source: enemy.name }));
        }
    }

    private submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        if (!this.isNetworkRaid || !this.networkRaidClient) return false;
        const intentId = this.networkRaidClient.sendIntent(actor.id, 'move', { tile, path, apCost, pathCost });
        this.networkSyncController.trackPendingMove(intentId, actor.id, tile, path);
        return true;
    }

    private submitNetworkActionIntent(actor: FieldActor, action: 'defend' | 'rest'): boolean {
        if (!this.isNetworkRaid || !this.networkRaidClient?.getIsOpen()) return false;
        this.networkRaidClient.sendIntent(actor.id, action, {});
        return true;
    }

    private submitNetworkUseItemIntent(actor: FieldActor, itemId: string): boolean {
        if (!this.isNetworkRaid || !this.networkRaidClient?.getIsOpen()) return false;
        this.networkRaidClient.sendIntent(actor.id, 'useItem', { itemId });
        return true;
    }

    private submitNetworkSkillIntent(actor: FieldActor, skillId: string, targetId?: string): boolean {
        if (!this.isNetworkRaid || !this.networkRaidClient?.getIsOpen()) return false;
        this.networkRaidClient.sendIntent(actor.id, 'castSkill', { skillId, targetId });
        return true;
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        if (this.isNetworkRaid) {
            if (!this.networkRaidClient) return false;
            this.networkRaidClient.sendIntent(actor.id, 'attack', { targetId: enemy.id });
            return true;
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
        if (this.isNetworkRaid) {
            this.selectionController.selectLoot(loot.id);
            this.addCombatLog(`${loot.sourceLabel} 서버 점유 요청.`);
            this.networkRaidClient?.sendIntent(this.requireControlledActor().id, 'interact', { lootId: loot.id });
            return;
        }
        if (!this.tutorialController.isActive()) {
            this.addCombatLog('서버 세션 밖에서는 전리품을 열 수 없습니다.');
            return;
        }
        this.selectionController.selectLoot(loot.id);
        this.addCombatLog(`${loot.sourceLabel} 검색 중.`);
        this.clearControlledPath();
        this.requireControlledActor().queuedIntent = null;

        this.gameManager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
        if (!this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
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
        for (const loot of this.worldMap.loot) {
            loot.opened = loot.inventory.items.length === 0;
        }
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
        if (!this.activeTurnActorId) return null;
        return this.partyActors.find((actor) => actor.id === this.activeTurnActorId && !actor.character.isDead) ?? null;
    }

    private requireControlledActor(): FieldActor {
        const actor = this.getControlledActor();
        if (!actor) throw new Error('No active field actor');
        return actor;
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
        if (this.tutorialController.isActive() && actor.id !== this.activeTurnActorId) {
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

        if (!this.activeTurnActorId && actor.entity.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
            this.beginActorTurn(actor);
        }

        if (actor.id !== this.activeTurnActorId) {
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
        const carryover = this.remainingActionPoints >= FIELD_MAX_ACTION_GAUGE
            ? 0
            : this.remainingActionPoints;
        this.endActorTurn(actor, '대기', carryover);
    }

    private spendAp(cost: number): boolean {
        if (this.remainingActionPoints <= 0) this.remainingActionPoints = this.getSpendableActionGauge();
        if (cost < 0 || this.remainingActionPoints < cost) return false;
        this.remainingActionPoints -= cost;
        const actor = this.getActivePartyTurnActor();
        if (actor) actor.entity.actionGauge = this.remainingActionPoints;
        return true;
    }

    private resumeOrEndActiveTurn(actor: FieldActor): void {
        if (actor.id !== this.activeTurnActorId) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) {
            this.endActorTurn(actor, '행동 불능', 0);
            return;
        }
        if (this.playerActionController.hasExecutableAction(actor)) {
            this.reopenActionMenu(actor);
            return;
        }
        this.endActorTurn(actor, '행동 게이지 부족', this.remainingActionPoints);
    }

    private reopenActionMenu(actor: FieldActor): void {
        if (actor.id !== this.activeTurnActorId) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) return;
        if (this.remainingActionPoints <= 0 && actor.entity.actionGauge >= MIN_FIELD_ACTION_GAUGE_COST) {
            this.remainingActionPoints = Math.floor(actor.entity.actionGauge);
        }
        this.selectionController.selectActor(actor.id);
        this.closeTacticalMenu();
        this.actionMenuUI.open(this.getActionMenuStates(actor));
    }

    private endActorTurn(actor: FieldActor, reason: string, atbCarryover: number = this.remainingActionPoints): void {
        if (this.isNetworkRaid && this.networkRaidClient && actor.id === this.activeTurnActorId) {
            this.networkRaidClient.sendIntent(actor.id, 'endTurn', { reason });
        }
        actor.entity.actionGauge = Math.max(0, Math.min(FIELD_MAX_ACTION_GAUGE, atbCarryover));
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.majorActionUsedThisTurn = false;
        this.reservedAction = null;
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
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.majorActionUsedThisTurn = false;
        this.reservedAction = null;
    }

    private startNextReadyTurn(): void {
        this.clearInvalidActiveTurn();
        if (this.activeTurnActorId || this.reservedAction) return;

        while (this.readyQueue.length > 0) {
            const actorId = this.readyQueue.shift()!;
            const actor = this.partyActors.find((candidate) => candidate.id === actorId);
            if (actor) {
                if (actor.character.isDead) continue;
                this.beginActorTurn(actor);
                return;
            }

            const enemyEntry = this.fieldEnemies.find((entry) => entry.enemy.id === actorId);
            if (!enemyEntry || enemyEntry.enemy.stats.hp <= 0) continue;
            this.beginEnemyTurn(enemyEntry);
            if (this.activeTurnActorId) return;
        }
    }

    private clearInvalidActiveTurn(): void {
        if (!this.activeTurnActorId) return;

        const activePartyActor = this.partyActors.find((actor) => actor.id === this.activeTurnActorId);
        if (activePartyActor && !activePartyActor.character.isDead && activePartyActor.character.stats.hp > 0) return;

        const activeEnemy = this.fieldEnemies.find((entry) => entry.enemy.id === this.activeTurnActorId)?.enemy;
        if (activeEnemy && activeEnemy.stats.hp > 0) return;

        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.majorActionUsedThisTurn = false;
        this.reservedAction = null;
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
        this.activeTurnActorId = actor.id;
        this.remainingActionPoints = FIELD_MAX_ACTION_GAUGE;
        this.majorActionUsedThisTurn = false;
        actor.entity.actionGauge = FIELD_MAX_ACTION_GAUGE;
        this.selectionController.selectActor(actor.id);
        if (!this.processActorTurnStartStatuses(actor)) {
            this.endActorTurn(actor, '상태이상');
            return;
        }
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(formatT('field.log.turnStart', {
            name: actor.character.name,
            gauge: t('ui.actionGauge'),
            value: this.remainingActionPoints,
        }));
        if (!this.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, '가능한 행동 없음');
        else {
            this.closeTacticalMenu();
            this.actionMenuUI.open(this.getActionMenuStates(actor));
        }
    }

    private beginEnemyTurn(entry: FieldEnemy): void {
        const enemy = entry.enemy;
        this.activeTurnActorId = enemy.id;
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
        return actor.path;
    }

    private getSpendableActionGauge(): number {
        if (this.activeTurnActorId && this.isNetworkRaid) {
            return Math.max(0, Math.floor(this.remainingActionPoints));
        }
        const actor = this.getActivePartyTurnActor();
        if (!actor) return this.remainingActionPoints;
        return Math.max(this.remainingActionPoints, Math.floor(actor.entity.actionGauge));
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
        if (this.reservedAction) return;
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
        const id = `world:${this.worldTime}:${this.feedbackGroups.size + 1}:${Math.random().toString(36).slice(2, 8)}`;
        this.feedbackGroups.set(id, 'status');
        return id;
    }

    private registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void {
        if (!feedbackGroupId) {
            this.applyCombatFeedback(kind);
            return;
        }
        const current = this.feedbackGroups.get(feedbackGroupId);
        this.feedbackGroups.set(feedbackGroupId, strongerCombatFeedback(current, kind));
    }

    private flushCombatFeedbackGroup(feedbackGroupId: string): void {
        const kind = this.feedbackGroups.get(feedbackGroupId);
        if (!kind) return;
        this.feedbackGroups.delete(feedbackGroupId);
        this.applyCombatFeedback(kind);
    }

    private applyCombatFeedback(kind: CombatFeedbackKind): void {
        const feedback = HIT_FEEDBACK[kind];
        if (feedback.shake > 0) this.camera.shake(feedback.shake, feedback.shakeMs);
        if (feedback.hitstopMs > 0) HitStop.freeze(feedback.hitstopMs);
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
