/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { GridInventory, type PlacedItem } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { getItemDef } from '../data/ItemDB';
import { rollBossRune } from '../data/SocketLoot';
import { getClassLine, isMasterClassLineId } from '../data/ClassTree';
import { getClassAttackProfile } from '../data/AttackPatternProfiles';
import { t } from '../i18n/LanguageManager';
import {
    BURGOS_CASTLE_DUNGEON_ID,
    MONSTER_ROW_BY_FACING,
    MONSTER_SPRITE_PATH,
    getMonsterDefinition,
    type MonsterId,
} from '../data/MonsterCatalog';
import {
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    hasStatus,
    resolveTurnStartStatuses,
} from '../combat/StatusEffects';
import { ActionMenuUI } from '../ui/ActionMenuUI';
import { EntityInfoUI } from '../ui/EntityInfoUI';
import { EffectManager } from '../ui/EffectManager';
import { FusionTempleUI } from '../ui/FusionTempleUI';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import { MinimapUI } from '../ui/MinimapUI';
import type { GameManager } from './GameManager';
import { WorldMap, type WorldDungeonInfo } from '../map/WorldMap';
import { TownInfo } from '../map/BiomeMask';
import { fuseActivePartyBranch, getFusionCandidates, hasActiveMasterCharacter } from '../character/FusionSystem';
import type { MasterBranch } from '../data/ClassTree';
import { TilePoint, manhattan, tileKey } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import { enqueueReadyActor } from '../field/FieldActionEconomy';
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
import { HitStop } from './world/HitStop';
import { HIT_FEEDBACK, strongerCombatFeedback, type CombatFeedbackKind } from './world/CombatFeedback';
import { NetworkRaidClient, type NetworkRaidStatus } from '../net/NetworkRaidClient';
import {
    DEFAULT_WORLD_SERVER_URL,
    type ActionRejectedMessage,
    type ActorSnapshot,
    type CombatEventMessage,
    type GridSnapshot,
    type LootGrantMessage,
    type LootSnapshot,
    type RaidResultMessage,
    type WorldSnapshot,
} from '../net/WorldProtocol';

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
    private networkPlayerId: string | null = null;
    private pendingLootPicks = new Map<string, { placed: PlacedItem; source: { gridX: number; gridY: number }; at: number }>();
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
    private activeTurnActorId: string | null = null;
    private readyQueue: string[] = [];
    private remainingActionPoints = 0;
    private reservedAction: FieldIntent | null = null;
    private hoverTile: TilePoint = { x: -1, y: -1 };
    private combatLog: string[] = [];
    private feedbackGroups = new Map<string, CombatFeedbackKind>();
    private followRepathTimer: number = 0;
    private floatingText = new FloatingTextManager();
    private effectManager = new EffectManager();
    private attackCues: AttackCue[] = [];
    private worldTime: number = 0;
    private dismissedTempleVisitKey: string | null = null;
    private dismissedDungeonVisitKey: string | null = null;

    constructor(
        canvas: HTMLCanvasElement,
        _ctx: CanvasRenderingContext2D,
        _input: InputManager,
        camera: Camera,
        party: PartyManager,
        _inventory: GridInventory,
        playerData: PlayerData,
        gameManager: GameManager
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
        this.combatController = new WorldCombatController({
            log: (message) => this.addCombatLog(message),
            spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
            spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
            spawnHitEffect: (x, y, isCrit, feedbackGroupId, feedbackKind) => {
                this.effectManager.spawnHitEffect(x, y, isCrit);
                this.registerCombatFeedback(feedbackKind ?? (isCrit ? 'critical' : 'normal'), feedbackGroupId);
            },
            spawnKillEffect: (enemy, feedbackGroupId) => {
                this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
                this.registerCombatFeedback('kill', feedbackGroupId);
            },
            spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
            spawnLoot: (enemy) => this.spawnEnemyLoot(enemy),
            awardExp: (actor, enemy) => this.awardDefeatExp(actor, enemy),
            onEnemyDefeated: (enemy) => this.completeDungeonIfBossDefeated(enemy),
            flushFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
        });
        this.movementController = new WorldMovementController({
            getPartyActors: () => this.partyActors,
            getFieldEnemies: () => this.fieldEnemies,
            getTileAt: (x, y) => this.worldMap.getTileAt(x, y),
            getTerrainTraitsForActorId: (actorId) => this.getTerrainTraitsForActorId(actorId),
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
                getFieldEnemies: () => this.fieldEnemies,
                getEnemyById: (enemyId) => this.getEnemyById(enemyId),
                getRemainingActionPoints: () => this.remainingActionPoints,
                getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
                getBoundsTiles: () => this.worldMap.getBoundsTiles(),
                hasFieldLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to),
                spendAp: (cost) => this.spendAp(cost),
                reopenActionMenu: (actor) => this.reopenActionMenu(actor),
                resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
                handleEnemyDefeated: (actor, enemy, feedbackGroupId) => this.handleEnemyDefeated(actor, enemy, feedbackGroupId),
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
                beginFeedbackGroup: () => this.beginCombatFeedbackGroup(),
                flushFeedbackGroup: (feedbackGroupId) => this.flushCombatFeedbackGroup(feedbackGroupId),
            }
        );
        this.toolController = new WorldToolController(
            {
                getActivePartyTurnActor: () => this.getActivePartyTurnActor(),
                getRemainingActionPoints: () => this.remainingActionPoints,
                getInventoryItems: () => this.gameManager.inventory.items,
                removeInventoryItem: (placed) => this.gameManager.inventory.remove(placed),
                spendAp: (cost) => this.spendAp(cost),
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
                getRemainingActionPoints: () => this.remainingActionPoints,
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
                submitMoveIntent: (actor, tile, path, apCost, pathCost) =>
                    this.submitNetworkMoveIntent(actor, tile, path, apCost, pathCost),
                tryActorAttack: (actor, enemy) => this.tryActorAttack(actor, enemy),
                openLoot: (loot) => this.openLoot(loot),
                openMagic: (actor) => this.openFieldMagic(actor),
                openTool: (actor) => this.openFieldTool(actor),
                hasCastableFieldSkill: (actor) => !this.isNetworkRaid && this.magicController.hasCastableFieldSkill(actor.character),
                hasUsableCombatTool: (actor) => !this.isNetworkRaid && this.toolController.hasUsableCombatTool(actor),
                reopenActionMenu: (actor) => this.reopenActionMenu(actor),
                closeActionMenu: () => this.closeActionMenu(),
                closeTacticalMenu: () => this.closeTacticalMenu(),
                resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
                endActorTurn: (actor, reason, atbCarryover) => this.endActorTurn(actor, reason, atbCarryover),
                clearActorIntent: (actor) => this.clearActorIntent(actor),
                setReservedAction: (intent) => { this.reservedAction = intent; },
                selectEnemy: (enemyId) => this.selectionController.selectEnemy(enemyId),
                selectLoot: (lootId) => this.selectionController.selectLoot(lootId),
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
            worldMap: this.worldMap,
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
            getFieldEnemies: () => this.fieldEnemies,
            getActiveTurnActorId: () => this.activeTurnActorId,
            getRemainingActionPoints: () => this.remainingActionPoints,
            getHoverTile: () => this.hoverTile,
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
            closeTacticalMenu: () => this.closeTacticalMenu(),
            clearIntent: () => this.clearIntent(),
            log: (message) => this.addCombatLog(message),
            getCombatLog: () => this.combatLog,
            onUnhandledEscape: () => this.gameManager.openPauseMenu(),
        });
        this.gameManager.inventoryUI.onRaidLootSecured = (placed, source) => {
            if (!this.isNetworkRaid || !this.networkRaidClient || !source || !this.selectionController.lootId) return;
            const intentId = this.networkRaidClient.sendLootPickup(this.selectionController.lootId, source.gridX, source.gridY);
            this.pendingLootPicks.set(intentId, { placed, source, at: Date.now() });
            this.purgeStaleLootPicks();
        };

        this.spawnPartyAtCurrentHub();
        this.player = this.getControlledActor()?.entity ?? new Player(0, 0);
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.openTown(this.getCurrentHubTown());

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.snapToTarget();
        this.addCombatLog('마을에 도착했습니다. 출격 준비를 마치세요.');
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

        if (this.isNetworkRaid) {
            this.updateNetworkRaid(dt, input, camera);
            return;
        }

        this.inputController.process(input, camera);

        const partyMovement = this.movementController.updatePartyActors({
            dt,
            controlled: this.getControlledActor(),
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
        this.checkDungeonArrival();

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
        this.renderController.render(ctx, camera, width, height);
    }

    private spawnPartyAtCurrentHub(): void {
        this.placePartyNear(this.worldMap.getTownSpawnTile(this.getCurrentHubTown()));
    }

    private placePartyNear(anchorTile: TilePoint): void {
        const members = this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);
        this.partyActors = this.fieldSpawnController.createPartyActors(anchorTile, members);
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
        this.currentPhase = 'town';
        this.raidSession.enterTown(town.id);
        this.townSession.show(town);
    }

    private async beginRaidFromCurrentHub(): Promise<void> {
        if (this.isNetworkRaidConnecting) return;
        const town = this.getCurrentHubTown();
        this.isNetworkRaidConnecting = true;
        this.addCombatLog('월드 서버 접속 중...');

        try {
            this.closeNetworkRaidClient(false);
            this.networkRaidClient = this.createNetworkRaidClient();
            const welcome = await this.networkRaidClient.connectAndJoin({
                originHubId: town.id,
                partyComposition: this.createPartyCompositionSnapshot(town),
            });

            this.networkPlayerId = welcome.playerId;
            this.isNetworkRaid = true;
            this.currentPhase = 'raid';
            this.raidSession.beginRaidFromTown(town.id);
            this.dismissedDungeonVisitKey = null;
            this.party.resetForNewRaid();
            this.townSession.applyPendingRestForRaidStart();
            this.placePartyNear(welcome.spawnTile);
            this.player = this.getControlledActor()?.entity ?? this.player;
            this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
            this.fieldEnemies = [];
            this.worldMap.loot = [];
            this.clearFieldTurnState();
            this.addCombatLog(`${town.nameKr}에서 네트워크 월드로 출격.`);
        } catch (error) {
            this.isNetworkRaid = false;
            this.networkPlayerId = null;
            this.closeNetworkRaidClient(false);
            this.currentPhase = 'town';
            this.openTown(town);
            this.addCombatLog(`월드 서버 접속 실패: ${error instanceof Error ? error.message : 'unknown error'}`);
        } finally {
            this.isNetworkRaidConnecting = false;
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
        this.reservedAction = null;
        this.closeActionMenu();
        this.magicController.reset();
        this.toolController?.reset();
        for (const actor of this.partyActors) {
            actor.path = [];
            actor.queuedIntent = null;
            actor.entity.actionGauge = 0;
        }
        for (const entry of this.fieldEnemies) {
            entry.path = [];
            entry.enemy.actionGauge = 0;
            entry.enemy.isAggro = false;
        }
    }

    private spawnStarterFieldContent(): void {
        const anchor = this.getControlledActor()?.entity;
        if (!anchor) return;
        const content = this.fieldSpawnController.createStarterFieldContent(anchor, {
            masterRealm: this.worldMap.getRealm() === 'master',
        });
        this.fieldEnemies = content.enemies;
        this.worldMap.loot = content.loot;
    }

    private createNetworkRaidClient(): NetworkRaidClient {
        return new NetworkRaidClient({
            url: DEFAULT_WORLD_SERVER_URL,
            onSnapshot: (snapshot) => this.applyNetworkSnapshot(snapshot),
            onCombatEvent: (event) => this.handleNetworkCombatEvent(event),
            onLootGrant: (grant) => this.openNetworkLoot(grant),
            onRaidResult: (result) => this.handleNetworkRaidResult(result),
            onActionRejected: (rejection) => this.handleNetworkActionRejected(rejection),
            onErrorMessage: (error) => this.addCombatLog(`서버 오류(${error.code}): ${error.message}`),
            onStatusChange: (status) => this.handleNetworkStatusChange(status),
            onGraceExpired: () => this.handleNetworkGraceExpired(),
        });
    }

    private handleNetworkStatusChange(status: NetworkRaidStatus): void {
        switch (status) {
            case 'connecting':
                this.addCombatLog('네트워크 상태: Connecting');
                break;
            case 'connected':
                this.addCombatLog('네트워크 상태: Connected');
                break;
            case 'reconnecting':
                this.addCombatLog('네트워크 상태: Reconnecting');
                break;
            case 'disconnected':
                this.addCombatLog('네트워크 상태: Disconnected');
                break;
            case 'idle':
                break;
        }
    }

    private createPartyCompositionSnapshot(town: TownInfo): ActorSnapshot[] {
        const exit = this.worldMap.getTownExitTile(town);
        return this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE).map((character, index) => ({
            id: character.id,
            localActorId: character.id,
            name: character.name,
            classLineId: character.classLineId,
            level: character.level,
            tile: {
                x: exit.x + (index === 2 ? 1 : 0),
                y: exit.y + (index === 1 ? 1 : 0),
            },
            stats: { ...character.stats },
            statuses: character.statuses.map((status) => ({ ...status })),
            actionGauge: 0,
            remainingAp: 0,
            facing: 'down',
            isDead: character.isDead,
        }));
    }

    private updateNetworkRaid(dt: number, input: InputManager, camera: Camera): void {
        this.inputController.process(input, camera);
        for (const actor of this.partyActors) actor.entity.update(dt);
        for (const entry of this.fieldEnemies) entry.enemy.update(dt);
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.refreshLootState();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
    }

    private applyNetworkSnapshot(snapshot: WorldSnapshot): void {
        this.raidSession.elapsedSeconds = snapshot.raidTimer.elapsedSeconds;
        const ownSnapshots = snapshot.partyActors.filter((actor) => actor.ownerPlayerId === this.networkPlayerId);
        const remoteSnapshots = snapshot.partyActors.filter((actor) => actor.ownerPlayerId !== this.networkPlayerId);
        const previousActors = this.partyActors;
        const localCharacters = this.party.getCharacters();
        const ownByLocalId = new Map(ownSnapshots.map((actor) => [actor.localActorId ?? actor.id, actor]));
        const nextLocalActors: FieldActor[] = [];

        for (const character of localCharacters) {
            const actorSnapshot = ownByLocalId.get(character.id);
            const existing = previousActors.find((actor) => actor.character === character);
            if (!actorSnapshot) {
                if (existing) nextLocalActors.push(existing);
                continue;
            }
            const actor = existing ?? {
                id: actorSnapshot.id,
                character,
                entity: new Player(actorSnapshot.tile.x, actorSnapshot.tile.y),
                path: [],
                queuedIntent: null,
            };
            this.applyActorSnapshot(actor, actorSnapshot);
            nextLocalActors.push(actor);
        }

        const nextRemoteActors: FieldActor[] = [];
        const seenRemoteIds = new Set<string>();
        for (const actorSnapshot of remoteSnapshots) {
            seenRemoteIds.add(actorSnapshot.id);
            let actor = this.remotePartyActors.get(actorSnapshot.id);
            if (!actor) {
                const character = new Character(
                    actorSnapshot.localActorId ?? actorSnapshot.id,
                    actorSnapshot.name,
                    actorSnapshot.classLineId
                );
                actor = {
                    id: actorSnapshot.id,
                    character,
                    entity: new Player(actorSnapshot.tile.x, actorSnapshot.tile.y),
                    path: [],
                    queuedIntent: null,
                };
                this.remotePartyActors.set(actorSnapshot.id, actor);
            }
            this.applyActorSnapshot(actor, actorSnapshot);
            nextRemoteActors.push(actor);
        }
        for (const actorId of [...this.remotePartyActors.keys()]) {
            if (!seenRemoteIds.has(actorId)) this.remotePartyActors.delete(actorId);
        }

        this.partyActors = [...nextLocalActors, ...nextRemoteActors];
        this.fieldEnemies = snapshot.enemies.map((enemySnapshot) => {
            const existing = this.fieldEnemies.find((entry) => entry.enemy.id === enemySnapshot.id)?.enemy;
            const enemy = existing ?? new Enemy(
                enemySnapshot.id,
                enemySnapshot.tile.x,
                enemySnapshot.tile.y,
                enemySnapshot.name,
                enemySnapshot.level,
                enemySnapshot.color,
                enemySnapshot.role
            );
            enemy.gridX = enemySnapshot.tile.x;
            enemy.gridY = enemySnapshot.tile.y;
            enemy.stats = { ...enemySnapshot.stats };
            enemy.statuses = enemySnapshot.statuses.map((status) => ({ ...status }));
            enemy.actionGauge = enemySnapshot.actionGauge;
            enemy.facing = enemySnapshot.facing;
            enemy.isAggro = enemySnapshot.isAggro;
            enemy.isBoss = enemySnapshot.isBoss;
            enemy.color = enemySnapshot.color;
            enemy.name = enemySnapshot.name;
            if (enemySnapshot.monsterId && !enemy.walkSprite) this.applyMonsterSprite(enemy, enemySnapshot.monsterId);
            return {
                enemy,
                home: { ...enemySnapshot.home },
                path: [],
            };
        });
        this.worldMap.loot = snapshot.loot.map((lootSnapshot) => this.createLootFromSnapshot(lootSnapshot));

        const controlled = this.getControlledActor();
        const ownReady = snapshot.readyActors.filter((actorId) => ownSnapshots.some((actor) => actor.id === actorId));
        this.activeTurnActorId = controlled && ownReady.includes(controlled.id)
            ? controlled.id
            : ownReady[0] ?? null;
        this.remainingActionPoints = this.activeTurnActorId
            ? snapshot.remainingApByActor[this.activeTurnActorId] ?? 0
            : 0;
        if (controlled) {
            this.player = controlled.entity;
            if (!this.selectionController.hasSelection()) this.selectionController.selectActor(controlled.id);
        }
    }

    private applyActorSnapshot(actor: FieldActor, snapshot: ActorSnapshot): void {
        actor.id = snapshot.id;
        actor.character.stats = { ...snapshot.stats };
        actor.character.statuses = snapshot.statuses.map((status) => ({ ...status }));
        actor.character.isDead = snapshot.isDead;
        actor.character.level = snapshot.level;
        actor.entity.gridX = snapshot.tile.x;
        actor.entity.gridY = snapshot.tile.y;
        actor.entity.actionGauge = snapshot.actionGauge;
        actor.entity.facing = snapshot.facing;
        actor.entity.label = snapshot.name;
        actor.path = [];
        actor.queuedIntent = null;
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

    private createLootFromSnapshot(snapshot: LootSnapshot): LootObject {
        const loot = new LootObject(snapshot.id, snapshot.tile.x, snapshot.tile.y, [], {
            sourceLabel: snapshot.sourceLabel,
            kind: snapshot.kind,
            gridW: snapshot.gridSnapshot.width,
            gridH: snapshot.gridSnapshot.height,
        });
        loot.inventory = this.gridFromSnapshot(snapshot.gridSnapshot);
        loot.opened = snapshot.opened;
        return loot;
    }

    private gridFromSnapshot(snapshot: GridSnapshot): GridInventory {
        const grid = new GridInventory(snapshot.width, snapshot.height);
        for (const itemSnapshot of snapshot.items) {
            const item = getItemDef(itemSnapshot.itemId);
            if (!item) continue;
            const placed = grid.place(item, itemSnapshot.gridX, itemSnapshot.gridY);
            if (!placed) continue;
            placed.durability = itemSnapshot.durability;
            placed.quantity = itemSnapshot.quantity;
            placed.acquiredInRaid = itemSnapshot.acquiredInRaid;
            placed.sockets = itemSnapshot.sockets?.flatMap((itemId) => {
                const socket = getItemDef(itemId);
                return socket ? [socket] : [];
            });
        }
        return grid;
    }

    private openNetworkLoot(grant: LootGrantMessage): void {
        const grid = this.gridFromSnapshot(grant.gridSnapshot);
        this.gameManager.inventoryUI.setExternalGrid(grid, `전리품 ${grant.lootId}`, { isRaidLoot: true });
        if (!this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
        this.selectionController.selectLoot(grant.lootId);
    }

    private handleNetworkActionRejected(rejection: ActionRejectedMessage): void {
        const pending = this.pendingLootPicks.get(rejection.intentId);
        if (pending) {
            this.pendingLootPicks.delete(rejection.intentId);
            this.gameManager.inventoryUI.revertRaidLoot(pending.placed, pending.source);
            this.addCombatLog(`전리품 획득 실패: ${rejection.reason}`);
            return;
        }
        this.addCombatLog(`서버 거부: ${rejection.reason}`);
    }

    private purgeStaleLootPicks(): void {
        const now = Date.now();
        for (const [intentId, pick] of this.pendingLootPicks) {
            if (now - pick.at > 10_000) this.pendingLootPicks.delete(intentId);
        }
    }

    private handleNetworkCombatEvent(event: CombatEventMessage): void {
        const targetEnemy = this.getEnemyById(event.targetId);
        const targetActor = this.partyActors.find((actor) => actor.id === event.targetId);
        const sourceActor = this.partyActors.find((actor) => actor.id === event.sourceId);
        const sourceEnemy = this.getEnemyById(event.sourceId);
        const feedbackGroupId = this.beginCombatFeedbackGroup();

        if (targetEnemy) {
            if (event.kind === 'kill') {
                this.effectManager.spawnKillEffect(targetEnemy.gridX, targetEnemy.gridY, targetEnemy.color, targetEnemy.expReward, targetEnemy.image);
                this.registerCombatFeedback('kill', feedbackGroupId);
            } else {
                this.floatingText.spawnDamage(targetEnemy.gridX, targetEnemy.gridY, event.value ?? 0, false, event.kind === 'miss');
                if (event.kind !== 'miss' && (event.value ?? 0) > 0) {
                    this.effectManager.spawnHitEffect(targetEnemy.gridX, targetEnemy.gridY);
                    this.registerCombatFeedback('normal', feedbackGroupId);
                }
            }
        }
        if (targetActor) {
            this.floatingText.spawnDamage(targetActor.entity.gridX, targetActor.entity.gridY, event.value ?? 0, false, event.kind === 'miss');
            if (event.kind !== 'miss' && (event.value ?? 0) > 0) {
                this.effectManager.spawnHitEffect(targetActor.entity.gridX, targetActor.entity.gridY);
                this.registerCombatFeedback(event.kind === 'down' ? 'kill' : 'normal', feedbackGroupId);
            }
            if (event.kind === 'down') this.floatingText.spawnStatus(targetActor.entity.gridX, targetActor.entity.gridY, 'DOWN');
        }
        if (sourceActor && targetEnemy) this.spawnAttackCue(this.actorTile(sourceActor), this.enemyTile(targetEnemy), '#72e8ff');
        if (sourceEnemy && targetActor) this.spawnAttackCue(this.enemyTile(sourceEnemy), this.actorTile(targetActor), '#ff8a55');
        this.flushCombatFeedbackGroup(feedbackGroupId);
        this.addCombatLog(this.formatNetworkCombatEvent(event));
    }

    private formatNetworkCombatEvent(event: CombatEventMessage): string {
        if (event.kind === 'miss') return `${event.sourceId} → ${event.targetId} 빗나감`;
        if (event.kind === 'kill') return `${event.sourceId} → ${event.targetId} 처치`;
        if (event.kind === 'down') return `${event.sourceId} → ${event.targetId} 행동 불능`;
        if (event.kind === 'status') return `${event.sourceId} → ${event.targetId} 상태 변화`;
        return `${event.sourceId} → ${event.targetId} ${event.value ?? 0} 피해`;
    }

    private handleNetworkRaidResult(result: RaidResultMessage): void {
        if (result.playerId !== this.networkPlayerId) return;
        this.closeNetworkRaidClient(false);
        this.isNetworkRaid = false;
        this.networkPlayerId = null;
        this.raidSession.elapsedSeconds = result.elapsedSeconds;
        this.raidSession.kills = result.kills;
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
        this.addCombatLog('월드 서버 재접속 시간이 초과되었습니다.');
        this.closeNetworkRaidClient(false);
        this.isNetworkRaid = false;
        this.networkPlayerId = null;
        this.raidOutcomeController.completeFailure('MIA');
    }

    private closeNetworkRaidClient(sendLeave: boolean, reason: 'town' | 'wipe' | 'manual' = 'manual'): void {
        this.pendingLootPicks.clear();
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

    private checkDungeonArrival(): void {
        if (!this.raidSession.active || this.raidOutcomeController.isVisible() || this.townSession.isVisible() || this.fusionTempleUI.isVisible()) {
            return;
        }

        const actor = this.getControlledActor();
        if (!actor) return;

        const dungeon = this.worldMap.getDungeonAtTile(actor.entity.gridX, actor.entity.gridY);
        if (!dungeon) {
            this.dismissedDungeonVisitKey = null;
            return;
        }
        if (dungeon.id !== BURGOS_CASTLE_DUNGEON_ID) return;

        const key = this.getCurrentDungeonVisitKey(dungeon);
        if (!key || this.dismissedDungeonVisitKey === key) return;
        if (this.raidSession.activeDungeonId) {
            this.dismissedDungeonVisitKey = key;
            return;
        }
        if (this.raidSession.isDungeonCleared(dungeon.id)) {
            this.dismissedDungeonVisitKey = key;
            return;
        }
        if (this.isEntityMoving(actor.entity)) return;

        const hostileActive = this.fieldEnemies.some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro);
        if (hostileActive) {
            this.addCombatLog('주변 전투를 정리해야 부르고스성에 들어갈 수 있습니다.');
            this.dismissedDungeonVisitKey = key;
            return;
        }

        this.enterBurgosCastle(dungeon);
    }

    private enterBurgosCastle(dungeon: WorldDungeonInfo): void {
        this.closeFieldOverlays();
        this.clearFieldTurnState();
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.raidSession.startDungeonEncounter(dungeon.id);

        const entrance = this.worldMap.getDungeonEntranceTile(dungeon);
        this.placePartyNear({ x: entrance.x - 6, y: entrance.y });
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);

        const content = this.fieldSpawnController.createBurgosCastleEncounter(entrance);
        this.fieldEnemies = content.enemies;
        this.worldMap.loot = content.loot;
        this.clearFieldTurnState();
        this.dismissedDungeonVisitKey = this.getCurrentDungeonVisitKey(dungeon);
        this.addCombatLog(t('story.ep01.enterDungeonLog'));
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
        this.townSession.hide();
        this.raidSession.failBackToTown(this.raidSession.currentHubTownId);
        this.currentPhase = 'master';
        this.worldMap.setRealm('master');
        this.placePartyNear(this.worldMap.getPrimaryTempleTile());
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.spawnStarterFieldContent();
        this.clearFieldTurnState();
        this.dismissedTempleVisitKey = this.getCurrentTempleVisitKey();
        this.addCombatLog('마스터 월드에 진입했습니다. T8~T10 성장이 시작됩니다.');
    }

    private returnToMortalWorld(): void {
        this.fusionTempleUI.hide();
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

    private getCurrentDungeonVisitKey(dungeon: WorldDungeonInfo): string | null {
        const actor = this.getControlledActor();
        if (!actor) return null;
        return `${this.worldMap.getRealm()}:${dungeon.id}:${actor.entity.gridX},${actor.entity.gridY}`;
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
        const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, items, {
            sourceLabel: `${enemy.name} 전리품`,
            kind: 'corpse',
        });
        this.worldMap.loot.push(loot);
    }

    private submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        if (!this.isNetworkRaid || !this.networkRaidClient) return false;
        this.networkRaidClient.sendIntent(actor.id, 'move', { tile, path, apCost, pathCost });
        return true;
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        if (this.isNetworkRaid) {
            if (!this.networkRaidClient) return false;
            this.networkRaidClient.sendIntent(actor.id, 'attack', { targetId: enemy.id });
            return true;
        }
        if (!this.canActorAttackTarget(actor, enemy)) return false;
        const profile = this.getActorAttackProfile(actor);
        const targetEnemies = this.getAttackPatternTargetEnemies(actor, enemy);
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
        return result.executed;
    }

    private tryEnemyCounterAttack(enemy: Enemy, actor: FieldActor): boolean {
        const result = this.combatController.tryEnemyCounterAttack({
            enemy,
            actor,
            getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
            getActorTerrainTraits: (targetActor) => this.getActorTerrainTraits(targetActor),
        });
        this.applyCombatResult(result);
        return result.executed;
    }

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void {
        this.awardDefeatExp(actor, enemy);
        this.raidSession.recordKill();
        this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
        this.registerCombatFeedback('kill', feedbackGroupId);
        this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
        enemy.isAggro = false;
        this.selectionController.clearEnemyIfSelected(enemy.id);

        this.spawnEnemyLoot(enemy);
        this.completeDungeonIfBossDefeated(enemy);
    }

    private completeDungeonIfBossDefeated(enemy: Enemy): void {
        if (!enemy.isBoss || this.raidSession.activeDungeonId !== BURGOS_CASTLE_DUNGEON_ID) return;
        this.raidSession.completeDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
        this.fieldEnemies = [];
        this.worldMap.loot = this.worldMap.loot.filter((loot) => loot.id === `corpse_${enemy.id}`);
        this.selectionController.clear();
        this.clearFieldTurnState();
        this.addCombatLog(t('story.ep01.objectiveCompleteLog'));
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
        this.selectionController.selectLoot(loot.id);
        this.addCombatLog(`${loot.sourceLabel} 검색 중.`);
        this.clearControlledPath();
        this.requireControlledActor().queuedIntent = null;

        this.gameManager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
        if (!this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
    }

    private openFieldMagic(actor: FieldActor): void {
        if (this.isNetworkRaid) {
            this.addCombatLog('네트워크 raid V1에서는 마법/아이템 사용이 비활성화되어 있습니다.');
            this.reopenActionMenu(actor);
            return;
        }
        this.magicController.open(actor);
    }

    private openFieldTool(actor: FieldActor): void {
        if (this.isNetworkRaid) {
            this.addCombatLog('네트워크 raid V1에서는 마법/아이템 사용이 비활성화되어 있습니다.');
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

    private getControlledActor(): FieldActor | null {
        // partyActors may also hold remote players' actors during a network raid, so
        // resolve the controlled actor by local Character identity rather than by raw
        // index, which could otherwise point at someone else's unit.
        const characters = this.party.getCharacters();
        const activeChar = characters[this.party.getActiveIndex()];
        const localActors = this.partyActors.filter((actor) => characters.includes(actor.character));
        return localActors.find((actor) => actor.character === activeChar)
            ?? localActors.find((actor) => !actor.character.isDead)
            ?? localActors[0]
            ?? null;
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

        if (actor.id !== this.activeTurnActorId) {
            this.addCombatLog('아직 행동 순서가 아닙니다.');
            return;
        }

        if (this.actionMenuUI.getIsOpen()) {
            this.closeActionMenu();
            return;
        }

        this.closeTacticalMenu();
        const available = this.playerActionController.getAvailableTurnActions(actor);
        this.actionMenuUI.open(available);
    }

    private closeActionMenu(): void {
        this.actionMenuUI.close();
    }

    private spendAp(cost: number): boolean {
        if (cost < 0 || this.remainingActionPoints < cost) return false;
        this.remainingActionPoints -= cost;
        return true;
    }

    private resumeOrEndActiveTurn(actor: FieldActor): void {
        if (actor.id !== this.activeTurnActorId) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) {
            this.endActorTurn(actor, '행동 불능');
            return;
        }
        if (this.playerActionController.hasExecutableAction(actor)) {
            this.reopenActionMenu(actor);
            return;
        }
        this.endActorTurn(actor, '행동력 소진');
    }

    private reopenActionMenu(actor: FieldActor): void {
        if (actor.id !== this.activeTurnActorId) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) return;
        this.selectionController.selectActor(actor.id);
        this.closeTacticalMenu();
        this.actionMenuUI.open(this.playerActionController.getAvailableTurnActions(actor));
    }

    private endActorTurn(actor: FieldActor, reason: string, atbCarryover: number = 0): void {
        if (this.isNetworkRaid && this.networkRaidClient && actor.id === this.activeTurnActorId) {
            this.networkRaidClient.sendIntent(actor.id, 'endTurn', { reason });
        }
        actor.entity.actionGauge = atbCarryover;
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
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
        this.remainingActionPoints = Math.max(1, Math.floor(actor.character.stats.actionLimit || 15));
        actor.entity.actionGauge = 100;
        this.selectionController.selectActor(actor.id);
        if (!this.processActorTurnStartStatuses(actor)) {
            this.endActorTurn(actor, '상태이상');
            return;
        }
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(`${actor.character.name} 턴 시작: 행동 ${this.remainingActionPoints}`);
        if (!this.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, '가능한 행동 없음');
        else {
            this.closeTacticalMenu();
            this.actionMenuUI.open(this.playerActionController.getAvailableTurnActions(actor));
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

        this.applyCombatResult(this.enemyTurnController.beginEnemyTurn(entry));
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

    private getPatternContext(actor: FieldActor, selectedTile?: TilePoint): PatternContext {
        const bounds = this.worldMap.getBoundsTiles();
        return {
            casterTile: this.actorTile(actor),
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

    private hasFieldLineOfSight(from: TilePoint, to: TilePoint): boolean {
        return hasLineOfSight(from, to, (tile) =>
            isTerrainLineOfSightBlocking(this.worldMap.getTileAt(tile.x, tile.y))
        );
    }

    private canActorAttackTarget(actor: FieldActor, enemy: Enemy): boolean {
        return this.getActorAttackTargetFailure(actor, enemy) === null;
    }

    private getActorAttackTargetFailure(actor: FieldActor, enemy: Enemy): AttackTargetFailure | null {
        const profile = this.getActorAttackProfile(actor);
        const target = this.enemyTile(enemy);
        return resolveActorAttackTargetFailure({
            profile,
            context: this.getPatternContext(actor),
            selectedContext: this.getPatternContext(actor, target),
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
