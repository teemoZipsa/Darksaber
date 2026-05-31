/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { AudioManager } from './AudioManager';
import { SettingsManager } from './SettingsManager';
import { Entity } from '../entity/Entity';
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
    ZAMORA_FORTRESS_DUNGEON_ID,
    getMonsterDefinition,
    type MonsterId,
} from '../data/MonsterCatalog';
import { getStoryQuestByDungeonId, isStoryQuestAvailable, type StoryQuestDefinition } from '../data/StoryQuestData';
import { getStoryScenarioByDungeonId } from '../data/StoryScenarioData';
import {
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    hasStatus,
    removeStatusesFromCarrier,
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
import { TutorialTrainingMap } from '../map/TutorialTrainingMap';
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
import { HitStop } from './world/HitStop';
import { HIT_FEEDBACK, strongerCombatFeedback, type CombatFeedbackKind } from './world/CombatFeedback';
import { NetworkRaidClient, type NetworkRaidStatus } from '../net/NetworkRaidClient';
import {
    DEFAULT_WORLD_SERVER_URL,
    type ActionRejectedMessage,
    type ActorSnapshot,
    type AutoLootCell,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type GridSnapshot,
    type LootGrantMessage,
    type LootSnapshot,
    type RaidResultMessage,
    type WorldSnapshot,
} from '../net/WorldProtocol';

export interface WorldEngineOptions {
    startIntroTutorial?: boolean;
}

type IntroTutorialStep = 'move' | 'attack' | 'rest' | 'magic' | 'defeat';

const INTRO_TUTORIAL_STEP_ACTION: Partial<Record<IntroTutorialStep, FieldApAction>> = {
    move: 'move',
    attack: 'attack',
    rest: 'rest',
    magic: 'magic',
};

const INTRO_TUTORIAL_NEXT_STEP: Record<IntroTutorialStep, IntroTutorialStep | null> = {
    move: 'attack',
    attack: 'rest',
    rest: 'magic',
    magic: 'defeat',
    defeat: null,
};

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
    private pendingNetworkMoveReopen: { intentId: string; actorId: string; tile: TilePoint } | null = null;
    private pendingLootPicks = new Map<string, { placed: PlacedItem; source: { gridX: number; gridY: number }; at: number; timedOut?: boolean }>();
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
    private majorActionUsedThisTurn = false;
    private reservedAction: FieldIntent | null = null;
    private restingRecoveryTimers = new Map<string, number>();
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
    private introTutorialActive = false;
    private introTutorialEnemyId: string | null = null;
    private introTutorialStep: IntroTutorialStep = 'move';
    private introTutorialPreviousWorldMap: WorldMap | null = null;
    private introTutorialInstructor: Player | null = null;

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
            spawnLoot: (enemy) => {
                if (!this.isIntroTutorialEnemy(enemy)) this.spawnEnemyLoot(enemy);
            },
            awardExp: (actor, enemy) => {
                if (!this.isIntroTutorialEnemy(enemy)) this.awardDefeatExp(actor, enemy);
            },
            onEnemyDefeated: (enemy) => {
                if (this.isIntroTutorialEnemy(enemy)) {
                    this.addCombatLog(t('tutorial.world.completeLog'));
                    this.finishIntroTutorial(false);
                    return;
                }
                this.completeDungeonIfBossDefeated(enemy);
            },
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
                submitMoveIntent: (actor, tile, path, apCost, pathCost) =>
                    this.submitNetworkMoveIntent(actor, tile, path, apCost, pathCost),
                tryActorAttack: (actor, enemy) => this.tryActorAttack(actor, enemy),
                openLoot: (loot) => this.openLoot(loot),
                openMagic: (actor) => this.openFieldMagic(actor),
                openTool: (actor) => this.openFieldTool(actor),
                hasCastableFieldSkill: (actor) => !this.isNetworkRaid && this.magicController.hasCastableFieldSkill(actor.character),
                hasUsableCombatTool: (actor) => !this.isNetworkRaid && this.toolController.hasUsableCombatTool(actor),
                getCombatToolAvailability: (actor) => this.isNetworkRaid
                    ? { hasRecoveryConsumable: false, hasEffectiveRecovery: false }
                    : this.toolController.getCombatToolAvailability(actor),
                reopenActionMenu: (actor) => this.reopenActionMenu(actor),
                closeActionMenu: () => this.closeActionMenu(),
                closeTacticalMenu: () => this.closeTacticalMenu(),
                resumeOrEndActiveTurn: (actor) => this.resumeOrEndActiveTurn(actor),
                endActorTurn: (actor, reason, atbCarryover) => this.endActorTurn(actor, reason, atbCarryover),
                clearActorIntent: (actor) => this.clearActorIntent(actor),
                setReservedAction: (intent) => { this.reservedAction = intent; },
                selectEnemy: (enemyId) => this.selectionController.selectEnemy(enemyId),
                selectLoot: (lootId) => this.selectionController.selectLoot(lootId),
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
            getTutorialActors: () => this.introTutorialInstructor ? [this.introTutorialInstructor] : [],
            getFieldEnemies: () => this.fieldEnemies,
            getActiveTurnActorId: () => this.activeTurnActorId,
            getRemainingActionPoints: () => this.getSpendableActionGauge(),
            getMajorActionUsedThisTurn: () => this.majorActionUsedThisTurn,
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
        if (options.startIntroTutorial) {
            this.startIntroTutorial();
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

        if (this.introTutorialActive && input.justPressed('Escape')) {
            this.finishIntroTutorial(true);
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
        if (this.introTutorialActive) this.renderIntroTutorialHud(ctx, width, height);
    }

    public startIntroTutorial(): void {
        if (this.introTutorialActive) return;
        const town = this.getCurrentHubTown();
        const trainingMap = new TutorialTrainingMap();
        this.introTutorialPreviousWorldMap = this.worldMap;
        this.worldMap = trainingMap;
        this.townSession.hide();
        this.closeFieldOverlays();
        this.currentPhase = 'raid';
        this.raidSession.beginRaidFromTown(town.id);
        this.dismissedDungeonVisitKey = null;
        this.party.resetForNewRaid();
        this.townSession.applyPendingRestForRaidStart();
        this.remotePartyActors.clear();
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.placePartyNear(trainingMap.getPlayerStartTile());
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.clearFieldTurnState();
        this.introTutorialInstructor = this.createIntroTutorialInstructor(trainingMap.getInstructorTile());

        const actor = this.getControlledActor();
        if (!actor) {
            this.restoreIntroTutorialWorldMap();
            this.openTown(town);
            return;
        }

        const enemyTile = trainingMap.getPracticeEnemyTile();
        const enemy = new Enemy('intro_tutorial_enemy', enemyTile.x, enemyTile.y, t('tutorial.world.enemy'), 1, '#b64048', 'bruiser');
        enemy.aggroRange = 0;
        enemy.expReward = 0;
        enemy.stats.maxHp = 42;
        enemy.stats.hp = 42;
        enemy.stats.atk = 1;
        enemy.stats.def = 0;
        enemy.stats.spd = 0;
        enemy.actionGauge = 0;
        this.fieldEnemies = [{ enemy, home: enemyTile, path: [] }];
        this.introTutorialActive = true;
        this.introTutorialEnemyId = enemy.id;
        this.introTutorialStep = 'move';

        this.prepareIntroTutorialActorTurn(actor);
        this.selectionController.selectActor(actor.id);
        this.actionMenuUI.open(this.playerActionController.getTurnActionStates(actor));
        this.camera.followTile(actor.entity.gridX, actor.entity.gridY);
        this.camera.snapToTarget();
        AudioManager.playBgm('bgm.tutorial.training', { fadeMs: 400 });
        this.addCombatLog(t('tutorial.world.startLog'));
        this.addCombatLog(t('tutorial.world.step.move.log'));
    }

    private finishIntroTutorial(skipped: boolean): void {
        this.restoreIntroTutorialWorldMap();
        const town = this.getCurrentHubTown();
        this.introTutorialActive = false;
        this.introTutorialEnemyId = null;
        this.introTutorialStep = 'move';
        this.introTutorialInstructor = null;
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.remotePartyActors.clear();
        this.placePartyNear(this.worldMap.getTownSpawnTile(town));
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.clearFieldTurnState();
        this.openTown(town);
        this.addCombatLog(t(skipped ? 'tutorial.world.skipLog' : 'tutorial.world.townLog'));
    }

    private restoreIntroTutorialWorldMap(): void {
        if (!this.introTutorialPreviousWorldMap) return;
        this.worldMap = this.introTutorialPreviousWorldMap;
        this.introTutorialPreviousWorldMap = null;
    }

    private createIntroTutorialInstructor(tile: TilePoint): Player {
        const instructor = new Player(tile.x, tile.y);
        instructor.id = 'intro_tutorial_instructor';
        instructor.label = t('tutorial.world.instructor');
        instructor.color = '#f0c050';
        instructor.facing = 'down';
        instructor.setWalkSprite(
            '/assets/images/characters/animations/infantry_t4_walk.png',
            32,
            32,
            3,
            6,
            Entity.WALK_ROW_BY_FACING,
            1.7
        );
        return instructor;
    }

    private advanceIntroTutorialStep(action: FieldApAction): void {
        if (!this.introTutorialActive) return;
        const expected = INTRO_TUTORIAL_STEP_ACTION[this.introTutorialStep];
        if (action !== expected) return;

        if (action === 'move') {
            const actor = this.getActivePartyTurnActor() ?? this.getControlledActor();
            if (actor && !this.canActorAttackIntroTutorialEnemyFrom(actor, this.actorTile(actor))) {
                this.prepareIntroTutorialActorTurn(actor);
                this.addCombatLog(t('tutorial.world.step.move.closeLog'));
                return;
            }
        }

        const next = INTRO_TUTORIAL_NEXT_STEP[this.introTutorialStep];
        if (!next) return;
        this.introTutorialStep = next;

        const actor = this.getActivePartyTurnActor() ?? this.getControlledActor();
        if (actor) this.prepareIntroTutorialActorTurn(actor);
        this.addCombatLog(t(`tutorial.world.step.${next}.log`));
    }

    private canActorAttackIntroTutorialEnemyFrom(actor: FieldActor, casterTile: TilePoint): boolean {
        const enemy = this.introTutorialEnemyId ? this.getEnemyById(this.introTutorialEnemyId) : null;
        if (!enemy || enemy.stats.hp <= 0) return false;
        return this.getActorAttackTargetFailureFromTile(actor, casterTile, enemy) === null;
    }

    private isIntroTutorialEnemy(enemy: Enemy): boolean {
        return this.introTutorialActive && enemy.id === this.introTutorialEnemyId;
    }

    private prepareIntroTutorialActorTurn(actor: FieldActor): void {
        this.activeTurnActorId = actor.id;
        this.remainingActionPoints = FIELD_MAX_ACTION_GAUGE;
        this.majorActionUsedThisTurn = false;
        actor.entity.actionGauge = FIELD_MAX_ACTION_GAUGE;
    }

    private renderIntroTutorialHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const scale = SettingsManager.getUIScale();
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const panelW = Math.min(560, uiW - 32);
        const panelH = 136;
        const x = Math.max(16, Math.floor((uiW - panelW) / 2));
        const y = Math.max(16, uiH - panelH - 18);

        ctx.save();
        ctx.scale(scale, scale);
        ctx.globalAlpha = 0.94;
        ctx.fillStyle = '#1a1410';
        ctx.strokeStyle = '#c8a36d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#f0c050';
        ctx.font = '18px "DOSMyungjo", serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('tutorial.world.title'), x + 18, y + 30);

        ctx.fillStyle = '#e8e0d0';
        ctx.font = '13px sans-serif';
        ctx.fillText(t('tutorial.world.instructorLine'), x + 18, y + 58);
        ctx.fillStyle = '#cbb992';
        ctx.fillText(t(`tutorial.world.step.${this.introTutorialStep}`), x + 18, y + 82);
        ctx.fillStyle = '#ffd700';
        ctx.fillText(t('tutorial.world.lineEsc'), x + 18, y + 108);
        ctx.restore();
    }

    private spawnPartyAtCurrentHub(): void {
        this.placePartyNear(this.worldMap.getTownSpawnTile(this.getCurrentHubTown()));
    }

    private placePartyNear(anchorTile: TilePoint): void {
        const members = this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);
        members.forEach((character) => this.syncCharacterMovementToClass(character));
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
        AudioManager.stopBgm(600);
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

            this.townSession.hide();
            this.closeFieldOverlays();
            this.networkPlayerId = welcome.playerId;
            this.isNetworkRaid = true;
            this.currentPhase = 'raid';
            this.raidSession.beginRaidFromTown(town.id);
            this.dismissedDungeonVisitKey = null;
            this.party.resetForNewRaid();
            this.townSession.applyPendingRestForRaidStart();
            this.remotePartyActors.clear();
            this.partyActors = [];
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
            this.addCombatLog(`월드 서버 접속 실패: ${error instanceof Error ? error.message : 'unknown error'}`);
            this.beginLocalRaidFromTown(town);
        } finally {
            this.isNetworkRaidConnecting = false;
        }
    }

    private beginLocalRaidFromTown(town: TownInfo): void {
        this.townSession.hide();
        this.closeFieldOverlays();
        this.currentPhase = 'raid';
        this.raidSession.beginRaidFromTown(town.id);
        this.dismissedDungeonVisitKey = null;
        this.party.resetForNewRaid();
        this.townSession.applyPendingRestForRaidStart();
        this.remotePartyActors.clear();
        this.placePartyNear(this.worldMap.getTownExitTile(town));
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.spawnStarterFieldContent();
        this.clearFieldTurnState();
        this.addCombatLog(`${town.nameKr}에서 로컬 월드로 출격.`);
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
            onAutoLootGrant: (grant) => this.handleNetworkAutoLootGrant(grant),
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
        return this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE).map((character, index) => {
            this.syncCharacterMovementToClass(character);
            return {
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
            majorActionUsed: false,
            facing: 'down',
            isDead: character.isDead,
        };
        });
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
        const previousActors = this.partyActors;
        const localCharacters = this.party.getCharacters();
        const localCharacterIds = new Set(localCharacters.map((character) => character.id));
        const localPlayerActorIds = new Set(
            snapshot.players.find((player) => player.playerId === this.networkPlayerId)?.actorIds ?? []
        );
        const isOwnActorSnapshot = (actor: ActorSnapshot): boolean =>
            actor.ownerPlayerId === this.networkPlayerId
            || localPlayerActorIds.has(actor.id)
            || (actor.localActorId ? localCharacterIds.has(actor.localActorId) : false);
        const ownSnapshots = snapshot.partyActors.filter(isOwnActorSnapshot);
        const remoteSnapshots = snapshot.partyActors.filter((actor) => !isOwnActorSnapshot(actor));
        const ownByLocalId = new Map(ownSnapshots.map((actor) => [actor.localActorId ?? actor.id, actor]));
        const nextLocalActors: FieldActor[] = [];

        for (const character of localCharacters) {
            const actorSnapshot = ownByLocalId.get(character.id);
            const existing = previousActors.find((actor) => actor.character === character);
            if (!actorSnapshot) {
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
        const activeTurnSnapshot = this.activeTurnActorId
            ? ownSnapshots.find((actor) => actor.id === this.activeTurnActorId)
            : undefined;
        this.remainingActionPoints = this.activeTurnActorId
            ? this.resolveSnapshotRemainingGauge(
                activeTurnSnapshot?.remainingAp ?? snapshot.remainingApByActor[this.activeTurnActorId] ?? 0,
                activeTurnSnapshot?.actionGauge ?? 0
            )
            : 0;
        this.majorActionUsedThisTurn = this.activeTurnActorId
            ? Boolean(ownSnapshots.find((actor) => actor.id === this.activeTurnActorId)?.majorActionUsed)
            : false;
        if (controlled) {
            this.player = controlled.entity;
            if (!this.selectionController.hasSelection()) this.selectionController.selectActor(controlled.id);
        }
        this.reopenPendingNetworkMoveMenu(ownSnapshots);
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
            placed.sockets = (itemSnapshot.sockets ?? []).flatMap((itemId) => {
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

    private handleNetworkAutoLootGrant(grant: AutoLootGrantMessage): void {
        const grid = this.gridFromSnapshot(grant.gridSnapshot);
        const bag = this.gameManager.inventoryUI.getBag();
        const acceptedCells: AutoLootCell[] = [];
        const acquiredNames: string[] = [];
        let blocked = false;

        for (const placed of [...grid.items]) {
            const source = { gridX: placed.gridX, gridY: placed.gridY };
            grid.remove(placed);
            if (bag.autoPlaceExisting(placed)) {
                placed.acquiredInRaid = true;
                acceptedCells.push(source);
                acquiredNames.push(placed.item.nameKr);
            } else {
                grid.placeExisting(placed, source.gridX, source.gridY);
                blocked = true;
            }
        }

        this.networkRaidClient?.sendAutoLootResolve(grant.lootId, acceptedCells);
        if (acquiredNames.length > 0) {
            this.addCombatLog(`${grant.sourceName} ${t('raid.autoLoot')}: ${acquiredNames.join(', ')}`);
        }
        if (blocked) this.addCombatLog(`${grant.sourceName}: ${t('raid.autoLootFull')}`);
    }

    private handleNetworkActionRejected(rejection: ActionRejectedMessage): void {
        const rejectedMoveActorId = this.pendingNetworkMoveReopen?.intentId === rejection.intentId
            ? this.pendingNetworkMoveReopen.actorId
            : null;
        if (this.pendingNetworkMoveReopen?.intentId === rejection.intentId) {
            this.pendingNetworkMoveReopen = null;
        }
        const pending = this.pendingLootPicks.get(rejection.intentId);
        if (pending) {
            this.pendingLootPicks.delete(rejection.intentId);
            this.gameManager.inventoryUI.revertRaidLoot(pending.placed, pending.source);
            this.addCombatLog(`전리품 획득 실패: ${rejection.reason}`);
            return;
        }
        this.addCombatLog(`서버 거부: ${rejection.reason}`);
        if (!rejectedMoveActorId) return;
        const actor = this.partyActors.find((entry) => entry.id === rejectedMoveActorId);
        if (!actor || actor.id !== this.activeTurnActorId) return;
        if (this.remainingActionPoints < MIN_FIELD_ACTION_GAUGE_COST) return;
        if (this.actionMenuUI.getIsOpen()) return;
        if (this.playerActionController.getMode() !== null) return;
        if (this.playerActionController.hasExecutableAction(actor)) this.reopenActionMenu(actor);
    }

    private purgeStaleLootPicks(): void {
        const now = Date.now();
        for (const pick of this.pendingLootPicks.values()) {
            if (now - pick.at > 10_000 && !pick.timedOut) {
                pick.timedOut = true;
                this.addCombatLog('전리품 획득 응답 지연: 서버 응답을 기다리는 중입니다.');
            }
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
        const sourceName = event.sourceName ?? this.getNetworkEntityName(event.sourceId);
        const targetName = event.targetName ?? this.getNetworkEntityName(event.targetId);
        if (event.kind === 'miss') return `${sourceName} → ${targetName} 빗나감`;
        if (event.kind === 'kill') return `${sourceName} → ${targetName} 처치`;
        if (event.kind === 'down') return `${sourceName} → ${targetName} 행동 불능`;
        if (event.kind === 'status') return `${sourceName} → ${targetName} 상태 변화`;
        return `${sourceName} → ${targetName} ${event.value ?? 0} 피해`;
    }

    private getNetworkEntityName(entityId: string): string {
        const actor = this.partyActors.find((candidate) => candidate.id === entityId);
        if (actor) return actor.character.name || actor.entity.label || entityId;
        const enemy = this.getEnemyById(entityId);
        if (enemy) return enemy.name || enemy.label || entityId;
        return entityId;
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
        const storyQuest = getStoryQuestByDungeonId(dungeon.id);
        if (!storyQuest) return;

        const key = this.getCurrentDungeonVisitKey(dungeon);
        if (!key || this.dismissedDungeonVisitKey === key) return;
        if (!isStoryQuestAvailable(storyQuest, this.playerData)) {
            const lockedLogKey = dungeon.id === 'sicilio_island'
                ? 'story.sicilioRouteLockedLog'
                : 'story.dungeonLockedLog';
            this.addCombatLog(t(lockedLogKey));
            this.dismissedDungeonVisitKey = key;
            return;
        }
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
            this.addCombatLog(`${dungeon.nameKr}에 들어가려면 주변 전투를 정리해야 합니다.`);
            this.dismissedDungeonVisitKey = key;
            return;
        }

        this.enterStoryDungeon(dungeon);
    }

    private enterStoryDungeon(dungeon: WorldDungeonInfo): void {
        const storyQuest = getStoryQuestByDungeonId(dungeon.id);
        if (!storyQuest) return;

        this.closeFieldOverlays();
        this.clearFieldTurnState();
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.raidSession.startDungeonEncounter(dungeon.id);

        const entrance = this.worldMap.getDungeonEntranceTile(dungeon);
        this.placePartyNear({ x: entrance.x - 6, y: entrance.y });
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);

        const content = this.createStoryDungeonEncounter(dungeon.id, entrance);
        this.fieldEnemies = content.enemies;
        this.worldMap.loot = content.loot;
        this.clearFieldTurnState();
        this.dismissedDungeonVisitKey = this.getCurrentDungeonVisitKey(dungeon);
        if (storyQuest.bgmKey) AudioManager.playBgm(storyQuest.bgmKey, { fadeMs: 400 });
        this.addCombatLog(t(storyQuest.enterLogKey));

        const scenario = getStoryScenarioByDungeonId(dungeon.id);
        if (scenario?.episode === 17) {
            this.completeStoryDungeonObjective(dungeon.id, storyQuest, { clearEnemies: false });
        }
    }

    private createStoryDungeonEncounter(dungeonId: string, entrance: { x: number; y: number }) {
        if (dungeonId === BURGOS_CASTLE_DUNGEON_ID) {
            return this.fieldSpawnController.createBurgosCastleEncounter(entrance);
        }
        if (dungeonId === ZAMORA_FORTRESS_DUNGEON_ID) {
            return this.fieldSpawnController.createZamoraFortressEncounter(entrance);
        }
        const scenario = getStoryScenarioByDungeonId(dungeonId);
        if (scenario) {
            return this.fieldSpawnController.createStoryScenarioEncounter(scenario, entrance);
        }
        return { enemies: [], loot: [] };
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

    private markMajorActionUsed(): void {
        if (this.activeTurnActorId) this.majorActionUsedThisTurn = true;
    }

    private updateRestingActors(dt: number): void {
        for (const actor of this.partyActors) {
            if (actor.character.isDead || actor.character.stats.hp <= 0) {
                this.restingRecoveryTimers.delete(actor.id);
                continue;
            }
            if (!hasStatus(actor.character.statuses, 'resting')) {
                this.restingRecoveryTimers.delete(actor.id);
                continue;
            }

            const effective = getEffectiveStatsForCharacter(actor.character);
            if (actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
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

            if (actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
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

        const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, items, {
            sourceLabel: `${enemy.name} 전리품`,
            kind: 'corpse',
        });
        this.worldMap.loot.push(loot);
    }

    private submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        if (!this.isNetworkRaid || !this.networkRaidClient) return false;
        const intentId = this.networkRaidClient.sendIntent(actor.id, 'move', { tile, path, apCost, pathCost });
        this.pendingNetworkMoveReopen = { intentId, actorId: actor.id, tile: { ...tile } };
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
        if (this.introTutorialActive && enemy.id === this.introTutorialEnemyId) {
            this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
            this.registerCombatFeedback('kill', feedbackGroupId);
            this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
            enemy.isAggro = false;
            this.selectionController.clearEnemyIfSelected(enemy.id);
            this.addCombatLog(t('tutorial.world.completeLog'));
            this.finishIntroTutorial(false);
            return;
        }

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
        const dungeonId = this.raidSession.activeDungeonId;
        const storyQuest = dungeonId ? getStoryQuestByDungeonId(dungeonId) : null;
        if (!enemy.isBoss || !dungeonId || !storyQuest) return;
        this.completeStoryDungeonObjective(dungeonId, storyQuest);
    }

    private completeStoryDungeonObjective(
        dungeonId: string,
        storyQuest: StoryQuestDefinition,
        options: { clearEnemies?: boolean } = {}
    ): void {
        this.raidSession.completeDungeonEncounter(dungeonId);
        if (options.clearEnemies ?? true) this.fieldEnemies = [];
        this.selectionController.clear();
        this.clearFieldTurnState();
        this.addCombatLog(t(storyQuest.objectiveCompleteLogKey));
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

        if (!this.activeTurnActorId && actor.entity.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
            this.beginActorTurn(actor);
        }

        if (actor.id !== this.activeTurnActorId) {
            this.addCombatLog('아직 행동 순서가 아닙니다.');
            return;
        }

        if (this.actionMenuUI.getIsOpen()) {
            this.closeActionMenu();
            return;
        }

        this.closeTacticalMenu();
        this.actionMenuUI.open(this.playerActionController.getTurnActionStates(actor));
    }

    private closeActionMenu(): void {
        this.actionMenuUI.close();
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
        this.actionMenuUI.open(this.playerActionController.getTurnActionStates(actor));
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
        this.addCombatLog(`${actor.character.name} 턴 시작: ATB ${this.remainingActionPoints}%`);
        if (!this.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, '가능한 행동 없음');
        else {
            this.closeTacticalMenu();
            this.actionMenuUI.open(this.playerActionController.getTurnActionStates(actor));
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

    private getSpendableActionGauge(): number {
        if (this.activeTurnActorId && this.isNetworkRaid) {
            return Math.max(0, Math.floor(this.remainingActionPoints));
        }
        const actor = this.getActivePartyTurnActor();
        if (!actor) return this.remainingActionPoints;
        return Math.max(this.remainingActionPoints, Math.floor(actor.entity.actionGauge));
    }

    private resolveSnapshotRemainingGauge(remainingGauge: number, actionGauge: number): number {
        if (remainingGauge > 0) return remainingGauge;
        return actionGauge >= MIN_FIELD_ACTION_GAUGE_COST ? Math.floor(actionGauge) : 0;
    }

    private reopenPendingNetworkMoveMenu(ownSnapshots: ActorSnapshot[]): void {
        const pending = this.pendingNetworkMoveReopen;
        if (!pending) return;

        const actorSnapshot = ownSnapshots.find((actor) => actor.id === pending.actorId);
        if (!actorSnapshot) {
            this.pendingNetworkMoveReopen = null;
            return;
        }
        if (actorSnapshot.tile.x !== pending.tile.x || actorSnapshot.tile.y !== pending.tile.y) return;

        this.pendingNetworkMoveReopen = null;
        const actor = this.partyActors.find((entry) => entry.id === pending.actorId);
        if (!actor || actor.id !== this.activeTurnActorId) return;
        if (this.remainingActionPoints < MIN_FIELD_ACTION_GAUGE_COST) return;
        if (this.actionMenuUI.getIsOpen()) return;
        if (this.playerActionController.getMode() !== null) return;
        if (this.playerActionController.hasExecutableAction(actor)) this.reopenActionMenu(actor);
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
