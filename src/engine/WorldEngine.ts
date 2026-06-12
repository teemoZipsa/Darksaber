/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { AudioManager } from './AudioManager';
import { SettingsManager } from './SettingsManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { GridInventory, type PlacedItem } from '../inventory/GridInventory';
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
import { getStoryQuestByDungeonId, isStoryQuestAvailable, type StoryQuestDefinition } from '../data/StoryQuestData';
import { getStoryScenarioByDungeonId } from '../data/StoryScenarioData';
import {
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    getStatus,
    hasStatus,
    removeActionStanceStatusesFromCarrier,
    removeStatusesFromCarrier,
    resolveTurnStartStatuses,
} from '../combat/StatusEffects';
import { ActionMenuUI, type ActionMenuSlotState, type ActionType } from '../ui/ActionMenuUI';
import { EntityInfoUI } from '../ui/EntityInfoUI';
import { EffectManager } from '../ui/EffectManager';
import { FusionTempleUI } from '../ui/FusionTempleUI';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import { MinimapUI } from '../ui/MinimapUI';
import type { GameManager } from './GameManager';
import { WorldMap, type WorldDungeonInfo } from '../map/WorldMap';
import { TutorialTrainingMap } from '../map/TutorialTrainingMap';
import { StoryInteriorMap } from '../map/StoryInteriorMap';
import { getStoryInteriorLayout, isStoryInteriorDungeon, type StoryInteriorLayout } from '../data/StoryInteriorData';
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
import { NetworkRaidState, type NetworkRaidCloseReason } from './world/NetworkRaidState';
import { classifyNetworkActorSnapshots } from './world/NetworkSnapshotOwnership';
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
    type AutoLootCell,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type GridSnapshot,
    type InventoryConsumedMessage,
    type InventoryItemCountSnapshot,
    type LootGrantMessage,
    type LootSnapshot,
    type PlayerIntentKind,
    type RaidResultMessage,
    type WorldRealmId,
    type WorldSnapshot,
} from '../net/WorldProtocol';

export interface WorldEngineOptions {
    startIntroTutorial?: boolean;
}

type IntroTutorialStep = 'move' | 'attack' | 'rest' | 'magic' | 'defeat';

const INTRO_TUTORIAL_ACTOR_RENDER_SCALE = 1.16;

const INTRO_TUTORIAL_INSTRUCTOR_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    left: 3,
    right: 2,
};

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

const INTRO_TUTORIAL_STEP_NUMBER: Record<IntroTutorialStep, number> = {
    move: 1,
    attack: 2,
    rest: 3,
    magic: 4,
    defeat: 5,
};

const INTRO_TUTORIAL_EXPECTED_ACTION: Record<IntroTutorialStep, ActionType> = {
    move: 'move',
    attack: 'attack',
    rest: 'rest',
    magic: 'magic',
    defeat: 'attack',
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
    private networkRaid = new NetworkRaidState();
    private pendingNetworkScenarioEnter: { intentId: string; dungeonId: string; visitKey: string | null } | null = null;
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
    private fanfareLeaderActorId: string | null = null;
    private floatingText = new FloatingTextManager();
    private effectManager = new EffectManager();
    private attackCues: AttackCue[] = [];
    private worldTime: number = 0;
    private dismissedTempleVisitKey: string | null = null;
    private dismissedDungeonVisitKey: string | null = null;
    private activeStoryInterior: { dungeonId: string; layout: StoryInteriorLayout; previousWorldMap: WorldMap; returnTile: TilePoint } | null = null;
    private introTutorialActive = false;
    private introTutorialEnemyId: string | null = null;
    private introTutorialStep: IntroTutorialStep = 'move';
    private introTutorialPreviousWorldMap: WorldMap | null = null;
    private introTutorialInstructor: Player | null = null;
    private introTutorialCompletePending = false;

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
            useServerMarket: this.gameManager.getNetworkAuthContext() !== null,
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
                this.completeDungeonIfBossDefeated(enemy);
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
                hasCastableFieldSkill: (actor) => (this.getNetworkRaidState().isActive() || this.introTutorialActive) && this.magicController.hasCastableFieldSkill(actor.character),
                hasUsableCombatTool: (actor) => (this.getNetworkRaidState().isActive() || this.introTutorialActive) && this.toolController.hasUsableCombatTool(actor),
                getCombatToolAvailability: (actor) => (this.getNetworkRaidState().isActive() || this.introTutorialActive)
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
            getTutorialActors: () => this.introTutorialInstructor ? [this.introTutorialInstructor] : [],
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
            const client = this.getNetworkRaidState().getClient();
            if (!this.getNetworkRaidState().isActive() || !client || !source || !this.selectionController.lootId) return;
            const intentId = client.sendLootPickup(this.selectionController.lootId, source.gridX, source.gridY);
            this.pendingLootPicks.set(intentId, { placed, source, at: Date.now() });
            this.purgeStaleLootPicks();
        };

        this.spawnPartyAtCurrentHub();
        this.player = this.getControlledActor()?.entity ?? new Player(0, 0);
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        if (options.startIntroTutorial) {
            this.startIntroTutorial();
        } else if (NetworkRaidClient.hasStoredResumeToken()) {
            this.addCombatLog(t('mp.resumeAttempt'));
            void this.beginRaidFromCurrentHub();
        } else {
            this.openTown(this.getCurrentHubTown());
            this.addCombatLog(t('field.log.townReady'));
        }

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.snapToTarget();
    }

    private getNetworkRaidState(): NetworkRaidState {
        if (!this.networkRaid) {
            this.networkRaid = new NetworkRaidState();
            const legacy = this as unknown as {
                isNetworkRaid?: boolean;
                networkPlayerId?: string | null;
                networkRaidClient?: NetworkRaidClient | null;
            };
            if (legacy.networkRaidClient) this.networkRaid.setClient(legacy.networkRaidClient);
            if (legacy.isNetworkRaid) this.networkRaid.activate(legacy.networkPlayerId ?? '');
        }
        return this.networkRaid;
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

        if (this.introTutorialActive && this.introTutorialCompletePending) {
            this.updateIntroTutorialCompletion(input, dt, camera);
            return;
        }

        if (this.introTutorialActive && input.justPressed('Escape')) {
            this.finishIntroTutorial(true);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        if (this.getNetworkRaidState().isActive()) {
            this.updateNetworkRaid(dt, input, camera);
            return;
        }

        if (this.introTutorialActive && input.mouseRightJustDown) {
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
        this.renderController.render(ctx, camera, width, height, { hideWorldHud: this.introTutorialActive });
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
        this.placePartyNear(trainingMap.getPlayerStartTile(), this.getIntroTutorialCharacters());
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
        enemy.facing = 'left';
        enemy.setWalkSprite(
            `${MONSTER_SPRITE_PATH}/206R.png`,
            32,
            32,
            3,
            8,
            MONSTER_ROW_BY_FACING,
            INTRO_TUTORIAL_ACTOR_RENDER_SCALE
        );
        this.fieldEnemies = [{ enemy, home: enemyTile, path: [] }];
        this.introTutorialActive = true;
        this.introTutorialEnemyId = enemy.id;
        this.introTutorialStep = 'move';
        this.introTutorialCompletePending = false;

        this.prepareIntroTutorialActorTurn(actor);
        this.selectionController.selectActor(actor.id);
        this.actionMenuUI.open(this.getActionMenuStates(actor));
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
        this.introTutorialCompletePending = false;
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

    private completeIntroTutorial(): void {
        if (!this.introTutorialActive || this.introTutorialCompletePending) return;
        this.addCombatLog(t('tutorial.world.completeLog'));
        this.introTutorialCompletePending = true;
        this.clearFieldTurnState();
    }

    private updateIntroTutorialCompletion(input: InputManager, dt: number, camera: Camera): void {
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);

        if (input.mouseJustDown || input.justPressed('Enter') || input.justPressed('Space')) {
            this.finishIntroTutorial(false);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update(dt);
            return;
        }

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update(dt);
    }

    private restoreIntroTutorialWorldMap(): void {
        if (!this.introTutorialPreviousWorldMap) return;
        this.worldMap = this.introTutorialPreviousWorldMap;
        this.introTutorialPreviousWorldMap = null;
    }

    private enterStoryInteriorMap(dungeonId: string, returnTile: TilePoint): StoryInteriorLayout | null {
        const layout = getStoryInteriorLayout(dungeonId);
        if (!layout) return null;
        if (this.activeStoryInterior?.dungeonId === dungeonId) return layout;

        const previousWorldMap = this.activeStoryInterior?.previousWorldMap ?? this.worldMap;
        this.worldMap = new StoryInteriorMap(layout);
        this.activeStoryInterior = {
            dungeonId,
            layout,
            previousWorldMap,
            returnTile: { ...returnTile },
        };
        this.worldMap.loot = [];
        this.dismissedDungeonVisitKey = null;
        return layout;
    }

    private exitActiveStoryInterior(options: { placePartyAtReturn?: boolean } = {}): void {
        const active = this.activeStoryInterior;
        if (!active) return;

        this.worldMap = active.previousWorldMap;
        this.activeStoryInterior = null;
        if (options.placePartyAtReturn) {
            this.placePartyNear(active.returnTile);
            this.player = this.getControlledActor()?.entity ?? this.player;
            this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        }
    }

    private clearIntroTutorialStateForNetworkRaid(): void {
        if (!this.introTutorialActive && !this.introTutorialPreviousWorldMap) return;
        this.restoreIntroTutorialWorldMap();
        this.introTutorialActive = false;
        this.introTutorialEnemyId = null;
        this.introTutorialStep = 'move';
        this.introTutorialInstructor = null;
        this.introTutorialCompletePending = false;
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.remotePartyActors.clear();
        this.clearFieldTurnState();
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
            INTRO_TUTORIAL_INSTRUCTOR_ROW_BY_FACING,
            INTRO_TUTORIAL_ACTOR_RENDER_SCALE
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

    private getActionMenuStates(actor: FieldActor): ActionMenuSlotState[] {
        const states = this.playerActionController.getTurnActionStates(actor);
        if (!this.introTutorialActive || this.introTutorialCompletePending) return states;

        const expected = INTRO_TUTORIAL_EXPECTED_ACTION[this.introTutorialStep];
        return states.map((state) => {
            if (state.type === expected) {
                return {
                    ...state,
                    highlighted: state.enabled,
                    emphasisLabel: t(`tutorial.world.action.${expected}`),
                };
            }

            return {
                ...state,
                enabled: false,
                highlighted: false,
                disabledReason: t('tutorial.world.blockedAction'),
            };
        });
    }

    private filterIntroTutorialActionTiles(action: 'move' | 'attack' | 'interact', actor: FieldActor, tiles: Set<string>): Set<string> {
        if (!this.introTutorialActive || this.introTutorialCompletePending) return tiles;
        if (this.introTutorialStep !== 'move' || action !== 'move') return tiles;

        const focusedTiles = new Set<string>();
        for (const key of tiles) {
            const [xText, yText] = key.split(',');
            const tile = { x: Number(xText), y: Number(yText) };
            if (Number.isFinite(tile.x) && Number.isFinite(tile.y) && this.canActorAttackIntroTutorialEnemyFrom(actor, tile)) {
                focusedTiles.add(key);
            }
        }
        return focusedTiles.size > 0 ? focusedTiles : tiles;
    }

    private addIntroTutorialBlockedLog(): void {
        const message = t('tutorial.world.blockedInput');
        if (this.combatLog[this.combatLog.length - 1] === message) return;
        this.addCombatLog(message);
    }

    private prepareIntroTutorialActorTurn(actor: FieldActor): void {
        this.activeTurnActorId = actor.id;
        this.remainingActionPoints = FIELD_MAX_ACTION_GAUGE;
        this.majorActionUsedThisTurn = false;
        actor.entity.actionGauge = FIELD_MAX_ACTION_GAUGE;
    }

    private renderIntroTutorialHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        if (this.introTutorialCompletePending) {
            this.renderIntroTutorialCompleteModal(ctx, width, height);
            return;
        }

        const scale = SettingsManager.getUIScale();
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const combatLogReserveW = 496;
        const panelGap = 24;
        const canFitBesideCombatLog = uiW >= combatLogReserveW + panelGap + 560 + 16;
        const panelW = canFitBesideCombatLog
            ? Math.min(720, uiW - combatLogReserveW - panelGap - 16)
            : Math.min(720, uiW - 32);
        const panelH = 196;
        const x = canFitBesideCombatLog
            ? combatLogReserveW + panelGap
            : Math.max(16, Math.floor((uiW - panelW) / 2));
        const y = canFitBesideCombatLog
            ? Math.max(16, uiH - panelH - 18)
            : Math.max(92, Math.floor(uiH * 0.16));
        const expected = INTRO_TUTORIAL_EXPECTED_ACTION[this.introTutorialStep];

        ctx.save();
        ctx.scale(scale, scale);
        ctx.fillStyle = 'rgba(12, 9, 8, 0.96)';
        ctx.strokeStyle = '#d6b16d';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(240, 192, 80, 0.28)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.roundRect(x, y, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(240, 192, 80, 0.12)';
        ctx.fillRect(x + 14, y + 42, panelW - 28, 52);
        ctx.strokeStyle = 'rgba(240, 192, 80, 0.38)';
        ctx.strokeRect(x + 14, y + 42, panelW - 28, 52);

        ctx.fillStyle = '#f0c050';
        ctx.font = '18px "DOSMyungjo", serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${t('tutorial.world.title')} ${INTRO_TUTORIAL_STEP_NUMBER[this.introTutorialStep]}/5`, x + 18, y + 28);

        ctx.fillStyle = '#120d0a';
        ctx.fillRect(x + 18, y + 50, 92, 26);
        ctx.strokeStyle = '#f0c050';
        ctx.strokeRect(x + 18, y + 50, 92, 26);
        ctx.fillStyle = '#ffe8a8';
        ctx.font = 'bold 14px "DOSMyungjo", serif';
        ctx.fillText(t('tutorial.world.instructor'), x + 28, y + 68);

        ctx.fillStyle = '#e8e0d0';
        ctx.font = 'bold 17px sans-serif';
        this.drawWrappedText(ctx, t(`tutorial.world.dialogue.${this.introTutorialStep}`), x + 126, y + 59, panelW - 158, 21, 2);

        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 26px "DOSMyungjo", serif';
        this.drawWrappedText(ctx, t(`tutorial.world.press.${this.introTutorialStep}`), x + 18, y + 122, panelW - 36, 30, 2);

        ctx.fillStyle = '#f6e0aa';
        ctx.font = 'bold 14px sans-serif';
        this.drawWrappedText(ctx, t(`tutorial.world.target.${this.introTutorialStep}`), x + 18, y + 156, panelW - 36, 18, 2);

        ctx.fillStyle = '#a99773';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${t('tutorial.world.onlyAction')}  ${t('tutorial.world.lineEsc')}`, x + 18, y + panelH - 16);

        ctx.fillStyle = 'rgba(240, 192, 80, 0.2)';
        ctx.fillRect(x + panelW - 128, y + 18, 110, 24);
        ctx.strokeStyle = '#f0c050';
        ctx.strokeRect(x + panelW - 128, y + 18, 110, 24);
        ctx.fillStyle = '#ffe8a8';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t(`tutorial.world.action.${expected}`), x + panelW - 73, y + 35);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    private drawWrappedText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number,
        maxLines: number
    ): void {
        const words = text.split(/\s+/);
        let line = '';
        let lineCount = 0;

        for (const word of words) {
            const nextLine = line ? `${line} ${word}` : word;
            if (ctx.measureText(nextLine).width > maxWidth && line) {
                ctx.fillText(line, x, y + lineCount * lineHeight);
                line = word;
                lineCount++;
                if (lineCount >= maxLines) return;
            } else {
                line = nextLine;
            }
        }

        if (line && lineCount < maxLines) {
            ctx.fillText(line, x, y + lineCount * lineHeight);
        }
    }

    private renderIntroTutorialCompleteModal(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const scale = SettingsManager.getUIScale();
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const panelW = Math.min(620, uiW - 40);
        const panelH = Math.min(320, Math.max(286, uiH - 24));
        const x = Math.floor((uiW - panelW) / 2);
        const y = Math.floor((uiH - panelH) / 2);
        const buttonW = Math.min(340, panelW - 72);
        const buttonH = 48;
        const buttonX = x + Math.floor((panelW - buttonW) / 2);
        const buttonY = y + panelH - 88;
        const nextBoxW = panelW - 92;
        const nextBoxH = 44;
        const nextBoxX = x + 46;
        const nextBoxY = buttonY - nextBoxH - 18;
        const crestX = x + panelW / 2;
        const crestY = y + 54;

        ctx.save();
        ctx.scale(scale, scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        ctx.fillRect(0, 0, uiW, uiH);

        ctx.globalAlpha = 0.98;
        ctx.fillStyle = '#15100d';
        ctx.strokeStyle = '#d6b16d';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(240, 192, 80, 0.32)';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.roundRect(x, y, panelW, panelH, 12);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.strokeStyle = 'rgba(240, 192, 80, 0.36)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 34, crestY);
        ctx.lineTo(crestX - 44, crestY);
        ctx.moveTo(crestX + 44, crestY);
        ctx.lineTo(x + panelW - 34, crestY);
        ctx.stroke();

        ctx.fillStyle = '#20150f';
        ctx.strokeStyle = '#f0c050';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(crestX, crestY, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f0c050';
        ctx.font = 'bold 26px "DOSMyungjo", serif';
        ctx.fillText('✓', crestX, crestY + 1);

        ctx.fillStyle = '#f0c050';
        ctx.font = '30px "DOSMyungjo", serif';
        ctx.fillText(t('tutorial.world.completeTitle'), x + panelW / 2, y + 114);

        ctx.fillStyle = '#e8e0d0';
        ctx.font = 'bold 16px sans-serif';
        this.drawWrappedText(ctx, t('tutorial.world.completeLine'), x + panelW / 2, y + 150, panelW - 96, 22, 2);

        ctx.fillStyle = 'rgba(240, 192, 80, 0.1)';
        ctx.strokeStyle = 'rgba(240, 192, 80, 0.44)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(nextBoxX, nextBoxY, nextBoxW, nextBoxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#a99773';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('tutorial.world.completeNextLabel'), nextBoxX + 18, nextBoxY + 15);

        ctx.fillStyle = '#ffe8a8';
        ctx.font = 'bold 16px "DOSMyungjo", serif';
        ctx.fillText(t('tutorial.world.completeReward'), nextBoxX + 18, nextBoxY + 31);

        ctx.fillStyle = '#f0c050';
        ctx.strokeStyle = '#ffe8a8';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(240, 192, 80, 0.45)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(buttonX, buttonY, buttonW, buttonH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#1b1008';
        ctx.font = 'bold 18px "DOSMyungjo", serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('tutorial.world.completeNext'), x + panelW / 2, buttonY + buttonH / 2 + 1);

        ctx.fillStyle = '#a99773';
        ctx.font = '12px sans-serif';
        ctx.fillText(t('tutorial.world.completeInputHint'), x + panelW / 2, buttonY + buttonH + 22);
        ctx.restore();
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

    private getIntroTutorialCharacters(): Character[] {
        const active = this.party.getActive() ?? this.party.getCharacters()[0];
        return active ? [active] : [];
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
        if (this.getNetworkRaidState().isActive()) {
            // Reaching town while still flagged as a network raid means the player is
            // abandoning the run client-side, so tell the server instead of going silent.
            this.closeNetworkRaidClient(true);
            this.getNetworkRaidState().deactivate();
        }
        this.closeFieldOverlays();
        AudioManager.stopBgm(600);
        this.currentPhase = 'town';
        this.raidSession.enterTown(town.id);
        this.townSession.show(town);
    }

    private async beginRaidFromCurrentHub(requestedRealm?: WorldRealmId): Promise<void> {
        if (this.getNetworkRaidState().isConnecting()) return;
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
        this.getNetworkRaidState().setConnecting(true);
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
            this.getNetworkRaidState().activate(welcome.playerId);
            this.currentPhase = 'raid';
            this.raidSession.beginRaidFromTown(town.id);
            this.dismissedDungeonVisitKey = null;
            if (!isResumeJoin) {
                this.party.resetForNewRaid();
                this.townSession.applyPendingRestForRaidStart();
            }
            this.remotePartyActors.clear();
            this.pendingNetworkScenarioEnter = null;
            this.getNetworkRaidState().clearScenarioEntries();
            this.partyActors = [];
            this.placePartyNear(welcome.spawnTile);
            this.player = this.getControlledActor()?.entity ?? this.player;
            this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
            this.fieldEnemies = [];
            this.worldMap.loot = [];
            this.clearFieldTurnState();
            this.addCombatLog(isResumeJoin
                ? formatT('mp.deployResumed', { world: this.worldMap.getDisplayName() })
                : formatT('mp.deployStarted', { town: town.nameKr, world: this.worldMap.getDisplayName() }));
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
            this.getNetworkRaidState().deactivate();
            this.closeNetworkRaidClient(false);
            const errorMessage = getWorldServerErrorMessage(error);
            console.error('[Darksaber] World deploy failed', error);
            this.addCombatLog(formatNetworkDeployFailure(error));
            this.addCombatLog(t('mp.deployUnavailable'));
            this.currentPhase = 'town';
            this.townSession.show(town);
            this.townSession.setDeployError(formatT('mp.deployFailed', { message: errorMessage }));
        } finally {
            this.getNetworkRaidState().setConnecting(false);
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
        const client = this.createNetworkRaidClient();
        this.getNetworkRaidState().setClient(client);
        return client.connectAndJoin({
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
                if (logFailure) this.addCombatLog(formatT('mp.authRefreshFailedHttp', { status: response.status }));
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
            if (logFailure) this.addCombatLog(formatT('mp.authRefreshFailed', { message: error instanceof Error ? error.message : 'unknown error' }));
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
                this.addCombatLog(this.getNetworkRaidState().statusWasReconnecting(status)
                    ? formatReconnectRestoredLog()
                    : formatNetworkStatusLog(status));
                break;
            case 'reconnecting':
                this.getNetworkRaidState().statusWasReconnecting(status);
                this.addCombatLog(formatNetworkStatusLog(status));
                break;
            case 'disconnected':
                this.addCombatLog(formatNetworkStatusLog(status));
                this.getNetworkRaidState().statusWasReconnecting(status);
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
        this.refreshNetworkMovePathPreview();
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.refreshLootState();
        this.checkDungeonArrival();

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
        const { ownSnapshots, remoteSnapshots } = classifyNetworkActorSnapshots({
            snapshot,
            playerId: this.getNetworkRaidState().playerId(),
            localCharacterIds,
        });
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
                character.currentTier = actorSnapshot.currentTier;
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
        this.applyNetworkScenarioSnapshot(snapshot.scenario);
    }

    private applyActorSnapshot(actor: FieldActor, snapshot: ActorSnapshot): void {
        actor.id = snapshot.id;
        actor.character.stats = { ...snapshot.stats };
        actor.character.statuses = snapshot.statuses.map((status) => ({ ...status }));
        actor.character.isDead = snapshot.isDead;
        actor.character.currentTier = snapshot.currentTier;
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
            containerType: snapshot.containerType,
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
        this.gameManager.inventoryUI.setExternalGrid(grid, formatT('field.log.lootSource', { source: grant.lootId }), { isRaidLoot: true });
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

        this.getNetworkRaidState().getClient()?.sendAutoLootResolve(grant.lootId, acceptedCells);
        if (acquiredNames.length > 0) {
            this.addCombatLog(`${grant.sourceName} ${t('raid.autoLoot')}: ${acquiredNames.join(', ')}`);
        }
        if (blocked) this.addCombatLog(`${grant.sourceName}: ${t('raid.autoLootFull')}`);
    }

    private handleNetworkInventoryConsumed(message: InventoryConsumedMessage): void {
        let remaining = Math.max(0, Math.floor(message.quantity));
        if (remaining <= 0) return;
        for (const placed of [...this.gameManager.inventory.items]) {
            if (placed.item.id !== message.itemId || placed.quantity <= 0) continue;
            const consumed = Math.min(remaining, placed.quantity);
            placed.quantity -= consumed;
            remaining -= consumed;
            if (placed.quantity <= 0) this.gameManager.inventory.remove(placed);
            if (remaining <= 0) break;
        }
    }

    private handleNetworkActionRejected(rejection: ActionRejectedMessage): void {
        const rejectedMoveActorId = this.getNetworkRaidState().consumeRejectedMoveActorId(rejection.intentId);
        if (this.pendingNetworkScenarioEnter?.intentId === rejection.intentId) {
            const visitKey = this.pendingNetworkScenarioEnter.visitKey;
            this.pendingNetworkScenarioEnter = null;
            this.dismissedDungeonVisitKey = visitKey;
            this.addCombatLog(formatT('mp.scenarioRejected', { reason: rejection.reason }));
            return;
        }
        const pending = this.pendingLootPicks.get(rejection.intentId);
        if (pending) {
            this.pendingLootPicks.delete(rejection.intentId);
            this.gameManager.inventoryUI.revertRaidLoot(pending.placed, pending.source);
            this.addCombatLog(formatT('mp.lootRejected', { reason: rejection.reason }));
            return;
        }
        this.addCombatLog(formatT('mp.actionRejected', { reason: rejection.reason }));
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
                this.addCombatLog(t('mp.lootPending'));
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
                this.effectManager.spawnKillEffect(targetEnemy.gridX, targetEnemy.gridY, targetEnemy.color, targetEnemy.expReward, targetEnemy);
                this.registerCombatFeedback('kill', feedbackGroupId);
            } else if (event.kind === 'status') {
                this.floatingText.spawnStatus(targetEnemy.gridX, targetEnemy.gridY, 'WEAK');
                this.effectManager.spawnDebuffEffect(targetEnemy.gridX, targetEnemy.gridY);
                this.registerCombatFeedback('status', feedbackGroupId);
            } else {
                this.floatingText.spawnDamage(targetEnemy.gridX, targetEnemy.gridY, event.value ?? 0, false, event.kind === 'miss');
                if (event.kind !== 'miss' && (event.value ?? 0) > 0) {
                    this.effectManager.spawnHitEffect(targetEnemy.gridX, targetEnemy.gridY);
                    this.registerCombatFeedback('normal', feedbackGroupId);
                }
            }
        }
        if (targetActor) {
            if (event.kind === 'heal') {
                this.floatingText.spawnHeal(targetActor.entity.gridX, targetActor.entity.gridY, event.value ?? 0);
                this.effectManager.spawnHealEffect(targetActor.entity.gridX, targetActor.entity.gridY);
                this.registerCombatFeedback('normal', feedbackGroupId);
            } else if (event.kind === 'status') {
                this.floatingText.spawnStatus(targetActor.entity.gridX, targetActor.entity.gridY, 'BUFF');
            } else {
                this.floatingText.spawnDamage(targetActor.entity.gridX, targetActor.entity.gridY, event.value ?? 0, false, event.kind === 'miss');
            }
            if (event.kind !== 'miss' && event.kind !== 'heal' && (event.value ?? 0) > 0) {
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

    private applyNetworkScenarioSnapshot(scenario: WorldSnapshot['scenario'] | undefined): void {
        if (!scenario) return;

        const enteredDungeonIds = scenario.enteredDungeonIds ?? [];
        const completedDungeonIds = scenario.completedDungeonIds ?? [];
        const completedSet = new Set(completedDungeonIds);

        for (const dungeonId of enteredDungeonIds) {
            if (!this.getNetworkRaidState().markScenarioEntered(dungeonId)) continue;
            const storyQuest = getStoryQuestByDungeonId(dungeonId);
            if (storyQuest) this.addCombatLog(t(storyQuest.enterLogKey));
            const scenario = getStoryScenarioByDungeonId(dungeonId);
            if (scenario && isStoryInteriorDungeon(dungeonId)) {
                this.addCombatLog(formatT('story.interior.enterLog', { dungeon: scenario.dungeonNameKr }));
            }
        }

        if (scenario.activeDungeonId) {
            if (this.raidSession.activeDungeonId !== scenario.activeDungeonId) {
                this.raidSession.startDungeonEncounter(scenario.activeDungeonId);
                this.selectionController.clear();
                this.clearFieldTurnState();
            }
            const controlled = this.getControlledActor();
            if (controlled) this.enterStoryInteriorMap(scenario.activeDungeonId, this.actorTile(controlled));
        } else if (!scenario.activeDungeonId && this.raidSession.activeDungeonId && !completedSet.has(this.raidSession.activeDungeonId)) {
            this.exitActiveStoryInterior();
            this.raidSession.activeDungeonId = null;
            this.selectionController.clear();
            this.clearFieldTurnState();
        }

        for (const dungeonId of completedDungeonIds) {
            if (this.raidSession.isDungeonCleared(dungeonId)) continue;
            const storyQuest = getStoryQuestByDungeonId(dungeonId);
            if (storyQuest) this.completeStoryDungeonObjective(dungeonId, storyQuest, { clearEnemies: false });
            else this.raidSession.completeDungeonEncounter(dungeonId);
        }

        if (
            this.pendingNetworkScenarioEnter
            && (
                enteredDungeonIds.includes(this.pendingNetworkScenarioEnter.dungeonId)
                || completedSet.has(this.pendingNetworkScenarioEnter.dungeonId)
                || scenario.activeDungeonId === this.pendingNetworkScenarioEnter.dungeonId
            )
        ) {
            this.pendingNetworkScenarioEnter = null;
        }
    }

    private formatNetworkCombatEvent(event: CombatEventMessage): string {
        const sourceName = event.sourceName ?? this.getNetworkEntityName(event.sourceId);
        const targetName = event.targetName ?? this.getNetworkEntityName(event.targetId);
        const params = { source: sourceName, target: targetName, value: event.value ?? 0 };
        if (event.kind === 'miss') return formatT('field.log.combat.miss', params);
        if (event.kind === 'kill') return formatT('field.log.combat.kill', params);
        if (event.kind === 'heal') return formatT('field.log.combat.heal', params);
        if (event.kind === 'down') return formatT('field.log.combat.down', params);
        if (event.kind === 'status') return formatT('field.log.combat.status', params);
        return formatT('field.log.combat.damage', params);
    }

    private getNetworkEntityName(entityId: string): string {
        const actor = this.partyActors.find((candidate) => candidate.id === entityId);
        if (actor) return actor.character.name || actor.entity.label || entityId;
        const enemy = this.getEnemyById(entityId);
        if (enemy) return enemy.name || enemy.label || entityId;
        return entityId;
    }

    private handleNetworkRaidResult(result: RaidResultMessage): void {
        if (result.playerId !== this.getNetworkRaidState().playerId()) return;
        this.closeNetworkRaidClient(false);
        this.getNetworkRaidState().deactivate();
        this.raidSession.elapsedSeconds = result.elapsedSeconds;
        this.raidSession.kills = result.kills;
        this.applyNetworkScenarioResult(result.completedDungeonIds);
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
        if (!this.getNetworkRaidState().isActive() || !this.raidSession.active) return;
        this.addCombatLog(t('mp.graceExpired'));
        this.closeNetworkRaidClient(false);
        this.getNetworkRaidState().deactivate();
        this.raidOutcomeController.completeFailure('MIA');
    }

    private applyNetworkScenarioResult(completedDungeonIds: readonly string[] | undefined): void {
        for (const dungeonId of completedDungeonIds ?? []) {
            if (this.raidSession.isDungeonCleared(dungeonId)) continue;
            const storyQuest = getStoryQuestByDungeonId(dungeonId);
            if (storyQuest) this.completeStoryDungeonObjective(dungeonId, storyQuest, { clearEnemies: false });
            else this.raidSession.completeDungeonEncounter(dungeonId);
        }
    }

    private closeNetworkRaidClient(sendLeave: boolean, reason: NetworkRaidCloseReason = 'manual'): void {
        this.pendingLootPicks.clear();
        this.pendingNetworkScenarioEnter = null;
        this.remotePartyActors.clear();
        this.getNetworkRaidState().closeClient(sendLeave, reason);
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
            this.addCombatLog(t('field.log.templeBlocked'));
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
            this.addCombatLog(formatT('field.log.dungeonBlocked', { dungeon: dungeon.nameKr }));
            this.dismissedDungeonVisitKey = key;
            return;
        }

        if (this.getNetworkRaidState().isActive()) {
            this.enterNetworkStoryDungeon(dungeon);
            return;
        }

        this.enterStoryDungeon(dungeon);
    }

    private enterNetworkStoryDungeon(dungeon: WorldDungeonInfo): void {
        const actor = this.getControlledActor();
        const client = this.getNetworkRaidState().getClient();
        if (!actor || !client) return;

        const visitKey = this.getCurrentDungeonVisitKey(dungeon);
        this.dismissedDungeonVisitKey = visitKey;
        const intentId = client.sendScenarioEnter(actor.id, dungeon.id);
        this.pendingNetworkScenarioEnter = { intentId, dungeonId: dungeon.id, visitKey };
        this.addCombatLog(formatT('field.log.scenarioRequest', { dungeon: dungeon.nameKr }));
    }

    private enterStoryDungeon(dungeon: WorldDungeonInfo): void {
        const storyQuest = getStoryQuestByDungeonId(dungeon.id);
        if (!storyQuest) return;

        this.dismissedDungeonVisitKey = this.getCurrentDungeonVisitKey(dungeon);
        if (isStoryInteriorDungeon(dungeon.id)) {
            this.startLocalStoryInteriorDungeon(dungeon, storyQuest);
            return;
        }

        this.addCombatLog(formatT('field.log.scenarioServerOnly', { dungeon: dungeon.nameKr }));
    }

    private startLocalStoryInteriorDungeon(dungeon: WorldDungeonInfo, storyQuest: StoryQuestDefinition): void {
        const actor = this.getControlledActor();
        if (!actor) return;

        const scenario = getStoryScenarioByDungeonId(dungeon.id);
        const layout = this.enterStoryInteriorMap(dungeon.id, this.actorTile(actor));
        if (!scenario || !layout) return;

        this.raidSession.startDungeonEncounter(dungeon.id);
        this.closeFieldOverlays();
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.placePartyNear(layout.playerStart);
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.clearFieldTurnState();

        const guardDefinition = getMonsterDefinition('303R' as MonsterId);
        this.fieldEnemies = [];
        for (let index = 0; index < scenario.guardCount; index++) {
            const tile = layout.guardTiles[index] ?? layout.guardTiles[layout.guardTiles.length - 1] ?? layout.playerStart;
            const enemy = new Enemy(
                `story_${dungeon.id}_guard_${index}`,
                tile.x,
                tile.y,
                guardDefinition.name,
                Math.max(scenario.guardLevel, guardDefinition.level),
                guardDefinition.color,
                guardDefinition.role
            );
            enemy.aggroRange = Math.max(guardDefinition.aggroRange, 8);
            enemy.isAggro = true;
            this.applyMonsterSprite(enemy, guardDefinition.id);
            this.fieldEnemies.push({ enemy, home: { ...tile }, path: [] });
        }

        if (scenario.bossName) {
            const boss = new Enemy(
                `story_${dungeon.id}_boss`,
                layout.bossTile.x,
                layout.bossTile.y,
                scenario.bossName,
                scenario.bossLevel,
                scenario.bossColor,
                'boss'
            );
            boss.aggroRange = 10;
            boss.isAggro = true;
            boss.isBoss = true;
            this.applyMonsterSprite(boss, 'burgos_wolf_boss');
            this.fieldEnemies.push({ enemy: boss, home: { ...layout.bossTile }, path: [] });
        }

        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.snapToTarget();
        this.addCombatLog(formatT('story.interior.enterLog', { dungeon: dungeon.nameKr }));
        this.addCombatLog(t(storyQuest.enterLogKey));
    }

    private openFusionTemple(): void {
        this.closeFieldOverlays();
        this.clearFieldTurnState();
        this.fusionTempleUI.show({
            realm: this.worldMap.getRealm(),
            candidates: getFusionCandidates(this.party),
            canEnterMasterWorld: hasActiveMasterCharacter(this.party),
        });
        this.addCombatLog(t(this.worldMap.getRealm() === 'master' ? 'field.log.templeMasterGate' : 'field.log.templeFusion'));
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
            this.addCombatLog(t('field.log.masterClassRequired'));
            return;
        }

        this.fusionTempleUI.hide();
        void this.beginRaidFromCurrentHub('master');
    }

    private returnToMortalWorld(): void {
        this.fusionTempleUI.hide();
        if (this.getNetworkRaidState().isActive() || this.currentPhase === 'raid') {
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
        this.addCombatLog(t('field.log.returnedToMortalTemple'));
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
            const resting = getStatus(actor.character.statuses, 'resting');
            if (!resting) {
                this.restingRecoveryTimers.delete(actor.id);
                continue;
            }

            const effective = getEffectiveStatsForCharacter(actor.character);
            if (resting.sourceType !== 'action' && actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
                this.stopResting(actor, formatT('field.log.restComplete', { name: actor.character.name }));
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
                this.stopResting(actor, formatT('field.log.restComplete', { name: actor.character.name }));
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
                this.stopResting(actor, formatT('field.log.restInterruptedDamage', { name: actor.character.name }));
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
                this.addCombatLog(t('field.log.departureTownBlocked'));
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
        const storyInteriorBossReturn = enemy.isBoss ? this.activeStoryInterior : null;
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
                sourceLabel: formatT('field.log.lootSource', { source: enemy.name }),
                kind: 'corpse',
            });
            this.worldMap.loot.push(loot);
            return;
        }

        const loot = new LootObject(`corpse_${enemy.id}`, lootTile.x, lootTile.y, items, {
            sourceLabel: formatT('field.log.lootSource', { source: enemy.name }),
            kind: 'corpse',
        });
        lootMap.loot.push(loot);
        if (storyInteriorBossReturn) {
            this.addCombatLog(formatT('story.interior.rewardAtEntrance', { source: enemy.name }));
        }
    }

    private submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        const intentId = this.sendNetworkIntent(actor.id, 'move', { tile, path, apCost, pathCost }, { requireOpen: false });
        if (!intentId) return false;
        this.getNetworkRaidState().registerPendingMove(intentId, actor.id, tile, path);
        return true;
    }

    private submitNetworkActionIntent(actor: FieldActor, action: 'defend' | 'rest'): boolean {
        return Boolean(this.sendNetworkIntent(actor.id, action, {}));
    }

    private submitNetworkUseItemIntent(actor: FieldActor, itemId: string): boolean {
        return Boolean(this.sendNetworkIntent(actor.id, 'useItem', { itemId }));
    }

    private submitNetworkSkillIntent(actor: FieldActor, skillId: string, targetId?: string): boolean {
        return Boolean(this.sendNetworkIntent(actor.id, 'castSkill', { skillId, targetId }));
    }

    private sendNetworkIntent(
        actorId: string,
        kind: PlayerIntentKind,
        payload: unknown,
        options: { requireOpen?: boolean } = {}
    ): string | null {
        return this.getNetworkRaidState().sendIntent(actorId, kind, payload, options);
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        if (this.getNetworkRaidState().isActive()) {
            return Boolean(this.sendNetworkIntent(actor.id, 'attack', { targetId: enemy.id }, { requireOpen: false }));
        }
        if (!this.introTutorialActive) {
            this.addCombatLog(t('field.log.serverCombatOnly'));
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
        if (this.introTutorialActive && enemy.id === this.introTutorialEnemyId) {
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
        const completedInterior = this.activeStoryInterior?.dungeonId === dungeonId ? this.activeStoryInterior : null;
        if (this.activeStoryInterior?.dungeonId === dungeonId) {
            this.exitActiveStoryInterior({ placePartyAtReturn: !this.getNetworkRaidState().isActive() });
        }
        this.selectionController.clear();
        this.clearFieldTurnState();
        const scenario = getStoryScenarioByDungeonId(dungeonId);
        if (completedInterior && scenario) {
            this.addCombatLog(formatT('story.interior.returnLog', { dungeon: scenario.dungeonNameKr }));
        }
        this.addCombatLog(t(storyQuest.objectiveCompleteLogKey));
    }

    private awardDefeatExp(actor: FieldActor, enemy: Enemy): void {
        const canGainExp = this.canCharacterGainExpInCurrentRealm(actor.character);
        this.addCombatLog(canGainExp
            ? formatT('field.log.enemyDefeatedExp', { enemy: enemy.name, exp: enemy.expReward })
            : formatT('field.log.enemyDefeated', { enemy: enemy.name }));
        if (canGainExp) {
            const expResult = actor.character.gainExp(enemy.expReward);
            if (expResult.promoted && expResult.newTierName) {
                this.addCombatLog(formatT('field.log.actorPromoted', { name: actor.character.name, tier: expResult.newTierName }));
            }
            if (expResult.emblemUnlocked) {
                this.addCombatLog(formatT('field.log.emblemUnlocked', { name: actor.character.name }));
            }
        } else {
            this.addCombatLog(t('field.log.noGrowthRealm'));
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
            this.addCombatLog(formatT('field.log.actorDown', { name: actor.character.name }));
            this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'DOWN');
            if (next) {
                const nextIndex = this.partyActors.findIndex((candidate) => candidate.character === next);
                if (nextIndex >= 0) this.switchToPartyMember(nextIndex);
            } else {
                this.addCombatLog(t('field.log.partyAllDown'));
            }
            return;
        }

        actor.character.isDead = true;
        actor.character.exp = 0;
        this.addCombatLog(formatT('field.log.actorDown', { name: actor.character.name }));
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'DOWN');
    }

    private openLoot(loot: LootObject): void {
        if (this.getNetworkRaidState().isActive()) {
            this.selectionController.selectLoot(loot.id);
            this.addCombatLog(formatT('field.log.lootLockRequest', { source: loot.sourceLabel }));
            this.sendNetworkIntent(this.requireControlledActor().id, 'interact', { lootId: loot.id });
            return;
        }
        if (!this.introTutorialActive) {
            this.addCombatLog(t('field.log.serverLootOnly'));
            return;
        }
        this.selectionController.selectLoot(loot.id);
        this.addCombatLog(formatT('field.log.lootSearch', { source: loot.sourceLabel }));
        this.clearControlledPath();
        this.requireControlledActor().queuedIntent = null;

        this.gameManager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
        if (!this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
    }

    private openFieldMagic(actor: FieldActor): void {
        if (!this.getNetworkRaidState().isActive() && !this.introTutorialActive) {
            this.addCombatLog(t('field.log.serverMagicOnly'));
            this.reopenActionMenu(actor);
            return;
        }
        this.magicController.open(actor);
    }

    private openFieldTool(actor: FieldActor): void {
        if (!this.getNetworkRaidState().isActive() && !this.introTutorialActive) {
            this.addCombatLog(t('field.log.serverToolOnly'));
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
        if (this.getNetworkRaidState().isActive()) return 0;
        return this.getLocalPartyActors().filter((candidate) => candidate !== actor && !candidate.character.isDead).length;
    }

    private getFanfareLeaderActor(): FieldActor | null {
        if (!this.fanfareLeaderActorId || this.getNetworkRaidState().isActive()) return null;
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
        if (this.introTutorialActive && actor.id !== this.activeTurnActorId) {
            this.addIntroTutorialBlockedLog();
            return false;
        }
        if (!this.party.getCharacters().includes(actor.character)) {
            this.selectionController.selectActor(actor.id);
            this.addCombatLog(formatT('field.log.remoteDisplayOnly', { name: actor.character.name }));
            return false;
        }
        if (!this.party.switchTo(index)) return false;
        this.player = actor.entity;
        this.selectionController.selectActor(actor.id);
        this.playerActionController.clearTargeting();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.addCombatLog(formatT('field.log.actorControl', { name: actor.character.name }));
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
            this.addCombatLog(t('field.log.notTurn'));
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
        if (this.introTutorialActive) {
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
        this.endActorTurn(actor, 'field.log.reason.wait', carryover);
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
            this.endActorTurn(actor, 'field.log.reason.incapacitated', 0);
            return;
        }
        if (this.playerActionController.hasExecutableAction(actor)) {
            this.reopenActionMenu(actor);
            return;
        }
        this.endActorTurn(actor, 'field.log.reason.gaugeLow', this.remainingActionPoints);
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
        const reasonLabel = reason.startsWith('field.log.reason.') ? t(reason) : reason;
        if (actor.id === this.activeTurnActorId) this.sendNetworkIntent(actor.id, 'endTurn', { reason }, { requireOpen: false });
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
        this.addCombatLog(formatT('field.log.turnEnd', { name: actor.character.name, reason: reasonLabel }));
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
        if (result.expiredReaction) this.addCombatLog(formatT('field.log.statusReactionExpired', { name: actor.character.name }));
        if (result.poisonDamage > 0) {
            this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, result.poisonDamage, false, false);
            this.effectManager.spawnDebuffEffect(actor.entity.gridX, actor.entity.gridY);
            this.addCombatLog(formatT('field.log.statusPoisonDamage', { name: actor.character.name, value: result.poisonDamage }));
            this.stopResting(actor, formatT('field.log.restInterruptedDamage', { name: actor.character.name }));
        }
        if (result.regenHealing > 0) {
            this.floatingText.spawnHeal(actor.entity.gridX, actor.entity.gridY, result.regenHealing);
            this.effectManager.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
            this.addCombatLog(formatT('field.log.statusRegenHealing', { name: actor.character.name, value: result.regenHealing }));
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
        if (result.expiredReaction) this.addCombatLog(formatT('field.log.statusReactionExpired', { name: enemy.name }));
        if (result.poisonDamage > 0) {
            this.floatingText.spawnDamage(enemy.gridX, enemy.gridY, result.poisonDamage, false, false);
            this.effectManager.spawnDebuffEffect(enemy.gridX, enemy.gridY);
            this.addCombatLog(formatT('field.log.statusPoisonDamage', { name: enemy.name, value: result.poisonDamage }));
        }
        if (result.regenHealing > 0) {
            this.floatingText.spawnHeal(enemy.gridX, enemy.gridY, result.regenHealing);
            this.effectManager.spawnHealEffect(enemy.gridX, enemy.gridY);
            this.addCombatLog(formatT('field.log.statusRegenHealing', { name: enemy.name, value: result.regenHealing }));
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
            this.endActorTurn(actor, 'field.log.reason.statusBlocked');
            return;
        }
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(formatT('field.log.turnStart', {
            name: actor.character.name,
            gauge: t('ui.actionGauge'),
            value: this.remainingActionPoints,
        }));
        if (!this.playerActionController.hasExecutableAction(actor)) this.endActorTurn(actor, 'field.log.reason.noExecutableAction');
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
        return this.getNetworkRaidState().getPathPreviewTiles(actor.id, actor.path);
    }

    private refreshNetworkMovePathPreview(): void {
        this.getNetworkRaidState().refreshMovePathPreview((actorId) => {
            const actor = this.partyActors.find((candidate) => candidate.id === actorId);
            if (!actor) return null;
            return {
                id: actor.id,
                tile: { x: actor.entity.gridX, y: actor.entity.gridY },
                isMoving: this.isEntityMoving(actor.entity),
                hasReachedTile: (tile) => this.hasEntityReachedPreviewTile(actor, tile),
            };
        });
    }

    private hasEntityReachedPreviewTile(actor: FieldActor, tile: TilePoint): boolean {
        return Math.abs(actor.entity.pixelX - tile.x) < 0.03 && Math.abs(actor.entity.pixelY - tile.y) < 0.03;
    }

    private getSpendableActionGauge(): number {
        if (this.activeTurnActorId && this.getNetworkRaidState().isActive()) {
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
        const snapshotKeys = new Set(ownSnapshots.map((actor) => `${actor.id}:${actor.tile.x},${actor.tile.y}`));
        const pending = this.getNetworkRaidState().consumePendingMoveReopen(snapshotKeys);
        if (!pending) return;

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
