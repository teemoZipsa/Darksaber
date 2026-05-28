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
import type { Character } from '../character/Character';
import type { GridInventory } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { getItemDef } from '../data/ItemDB';
import { getClassLine, isMasterClassLineId } from '../data/ClassTree';
import { getClassAttackProfile } from '../data/AttackPatternProfiles';
import { BURGOS_CASTLE_DUNGEON_ID } from '../data/MonsterCatalog';
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
import { WorldRaidOutcomeController } from './world/WorldRaidOutcomeController';
import { WorldTacticalController } from './world/WorldTacticalController';
import { WorldSelectionController } from './world/WorldSelectionController';
import { WorldFieldSpawnController } from './world/WorldFieldSpawnController';
import { WorldRenderController } from './world/WorldRenderController';
import { WorldInputController } from './world/WorldInputController';
import { HitStop } from './world/HitStop';

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
            spawnHitEffect: (x, y, isCrit) => {
                this.effectManager.spawnHitEffect(x, y, isCrit);
                this.applyHitFeel(isCrit);
            },
            spawnKillEffect: (enemy) => {
                this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
                // A kill is the strongest impact — bigger shake, longer pause.
                this.camera.shake(16, 320);
                HitStop.freeze(60);
            },
            spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
            spawnLoot: (enemy) => this.spawnEnemyLoot(enemy),
            awardExp: (actor, enemy) => this.awardDefeatExp(actor, enemy),
            onEnemyDefeated: (enemy) => this.completeDungeonIfBossDefeated(enemy),
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
                spawnElementEffect: (element, x, y) => this.effectManager.spawnByElement(element, x, y),
                spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
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
                handleEnemyDefeated: (actor, enemy) => this.handleEnemyDefeated(actor, enemy),
                tryEnemyCounterAttack: (enemy, actor) => this.tryEnemyCounterAttack(enemy, actor),
            },
            {
                log: (message) => this.addCombatLog(message),
                spawnHeal: (x, y, amount) => this.floatingText.spawnHeal(x, y, amount),
                spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
                spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
                spawnHealEffect: (x, y) => this.effectManager.spawnHealEffect(x, y),
                spawnHitEffect: (x, y) => {
                    this.effectManager.spawnHitEffect(x, y);
                    this.applyHitFeel(false);
                },
                spawnBuffEffect: (x, y) => this.effectManager.spawnBuffEffect(x, y),
                spawnDebuffEffect: (x, y) => this.effectManager.spawnDebuffEffect(x, y),
                spawnElementEffect: (element, x, y) => this.effectManager.spawnByElement(element, x, y),
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
                tryActorAttack: (actor, enemy) => this.tryActorAttack(actor, enemy),
                openLoot: (loot) => this.openLoot(loot),
                openMagic: (actor) => this.magicController.open(actor),
                hasCastableFieldSkill: (actor) => this.magicController.hasCastableFieldSkill(actor.character),
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
            camera.update();
            return;
        }

        if (this.fusionTempleUI.isVisible()) {
            this.fusionTempleUI.updateInput(input);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update();
            return;
        }

        if (this.townSession.isVisible()) {
            this.townSession.updateInput(input);
            camera.followTile(this.player.gridX, this.player.gridY);
            camera.update();
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
        camera.update();
    }

    public isModalOverlayVisible(): boolean {
        return this.townSession.isVisible() || this.raidOutcomeController.isVisible() || this.fusionTempleUI.isVisible();
    }

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
        this.closeFieldOverlays();
        this.currentPhase = 'town';
        this.raidSession.enterTown(town.id);
        this.townSession.show(town);
    }

    private beginRaidFromCurrentHub(): void {
        const town = this.getCurrentHubTown();
        this.currentPhase = 'raid';
        this.raidSession.beginRaidFromTown(town.id);
        this.dismissedDungeonVisitKey = null;
        this.party.resetForNewRaid();
        this.townSession.applyPendingRestForRaidStart();
        this.placePartyNear(this.worldMap.getTownExitTile(town));
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectionController.selectActor(this.getControlledActor()?.id ?? null);
        this.fieldEnemies = [];
        this.worldMap.loot = [];
        this.spawnStarterFieldContent();
        this.clearFieldTurnState();
        this.addCombatLog(`${town.nameKr}에서 출격. 다른 마을로 생환하세요.`);
    }

    private closeFieldOverlays(): void {
        if (this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
        if (this.gameManager.partyUI.isVisible()) this.gameManager.partyUI.toggle();
        if (this.gameManager.charUI.isVisible()) this.gameManager.charUI.toggle();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.magicController.reset();
        this.playerActionController.clearTargeting();
    }

    private clearFieldTurnState(): void {
        this.activeTurnActorId = null;
        this.readyQueue = [];
        this.remainingActionPoints = 0;
        this.reservedAction = null;
        this.closeActionMenu();
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
        this.addCombatLog('부르고스성 진입. 보스를 쓰러뜨리면 던전이 종료됩니다.');
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
        if (!herb) return;
        const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, [herb], {
            sourceLabel: `${enemy.name} 전리품`,
            kind: 'corpse',
        });
        this.worldMap.loot.push(loot);
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
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

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy): void {
        this.awardDefeatExp(actor, enemy);
        this.raidSession.recordKill();
        this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
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
        this.worldMap.loot = [];
        this.selectionController.clear();
        this.clearFieldTurnState();
        this.addCombatLog('부르고스성 클리어. 던전이 종료되었습니다.');
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
        this.selectionController.selectLoot(loot.id);
        this.addCombatLog(`${loot.sourceLabel} 검색 중.`);
        this.clearControlledPath();
        this.requireControlledActor().queuedIntent = null;

        this.gameManager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
        if (!this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
    }

    private refreshLootState(): void {
        for (const loot of this.worldMap.loot) {
            loot.opened = loot.inventory.items.length === 0;
        }
    }

    private getControlledActor(): FieldActor | null {
        return this.partyActors[this.party.getActiveIndex()] ?? this.partyActors.find((actor) => !actor.character.isDead) ?? null;
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
        actor.entity.actionGauge = atbCarryover;
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.reservedAction = null;
        this.clearActorIntent(actor);
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.playerActionController.clearTargeting();
        this.magicController.reset();
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
        return actor ? this.getActorTerrainTraits(actor) : {};
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

    /** Apply screen-shake + hit-pause for a successful hit. Crit hits are stronger. */
    private applyHitFeel(isCrit: boolean): void {
        if (isCrit) {
            this.camera.shake(14, 280);
            HitStop.freeze(50);
        } else {
            this.camera.shake(6, 180);
            HitStop.freeze(18);
        }
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
