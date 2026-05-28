/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
import { t } from '../i18n/LanguageManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import { TILE_SIZE } from '../map/Chunk';
import { PartyManager } from '../character/PartyManager';
import type { Character } from '../character/Character';
import type { GridInventory } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { getItemDef } from '../data/ItemDB';
import { getClassLine } from '../data/ClassTree';
import { Skill, getLearnedSkills } from '../data/SkillDB';
import { getClassAttackProfile, getSkillAttackProfile } from '../data/AttackPatternProfiles';
import { resolveSkillEffect, SkillEffectEnemyInput, SkillEffectResult, SkillTerrainContext } from '../combat/SkillEffectResolver';
import {
    applyGuardToDamage,
    applyStatus,
    applyStatuses,
    cleanseNegativeStatuses,
    createStatus,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    getStatusIcons,
    hasStatus,
    resolveTurnStartStatuses,
    type StatusKind,
} from '../combat/StatusEffects';
import { ActionMenuUI, ActionType } from '../ui/ActionMenuUI';
import { EntityDisplayInfo, EntityInfoUI } from '../ui/EntityInfoUI';
import { MagicUI } from '../ui/MagicUI';
import { TacticalContextMenuUI } from '../ui/TacticalContextMenuUI';
import { RaidResultUI } from '../ui/RaidResultUI';
import { EffectManager } from '../ui/EffectManager';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { TownInfo } from '../map/BiomeMask';
import { FieldPassableQuery, TilePoint, findPathToAny, findPathWithCost, findReachableTilesByCost, manhattan, tileKey, tilesInRange } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import {
    TacticalMarkerStore,
    buildTacticalMenuItems,
    makeTacticalTargetKey,
    type TacticalCommand,
    type TacticalTargetRef,
} from '../field/TacticalMarkers';
import { getRightClickDisposition, type WorldInteractionMode } from '../field/WorldInteractionMode';
import { advanceAtb, resolveAggroState } from '../field/FieldCombat';
import { decideEnemyAction, type BossPattern, type EnemyAIDecision, type EnemyAIUnit, type EnemyRole } from '../field/EnemyAI';
import { ATTACK_AP_COST, INTERACT_AP_COST, MAGIC_AP_COST, MOVE_AP_PER_TILE, enqueueReadyActor, hasExecutableFieldAction } from '../field/FieldActionEconomy';
import { hasLineOfSight } from '../field/LineOfSight';
import {
    AttackPatternProfile,
    PatternContext,
    getEffectTiles,
    getSelectableTiles,
} from '../field/TargetPatterns';
import {
    canAffordTerrainCost,
    describeTerrainForHover,
    getTerrainMoveCost,
    isTerrainLineOfSightBlocking,
    isTerrainPassable,
    terrainCostToApCost,
    TerrainActorTraits,
} from '../field/TerrainRules';
import {
    computeRaidFailureLoss,
    mergeSnapshots,
    RaidOutcome,
    RaidResultType,
    snapshotPlacedItem,
    type HeroRaidStatus,
} from '../raid/RaidOutcome';
import { resolveTownArrival } from '../raid/RaidRules';
import { ACTOR_COLORS, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, ENEMY_LEASH_RANGE, FIELD_ATB_SCALE, FORMATION_OFFSETS, MOVEMENT_REPATH_INTERVAL } from '../field/FieldConfig';
import type { AttackCue, FieldActor, FieldEnemy, FieldHitParty, FieldIntent, FieldMagicState } from '../field/FieldTypes';
import { getEnemyRoleLabel } from '../field/FieldDisplay';
import {
    buildSkillTerrainContext,
    getActorAttackTargetFailure as resolveActorAttackTargetFailure,
    getAttackFailureMessage,
    getSkillCandidateEnemies as resolveSkillCandidateEnemies,
    type AttackTargetFailure,
} from '../field/FieldTargeting';
import type { WorldRenderModel } from './world/WorldRenderModel';
import { WorldRaidSession, type WorldPhase } from './world/WorldRaidSession';
import { WorldTownSession } from './world/WorldTownSession';
import { WorldFieldRenderer } from './world/WorldFieldRenderer';
import { WorldCombatController, createCombatResult, type CombatResult } from './world/WorldCombatController';

export class WorldEngine {
    private canvas: HTMLCanvasElement;
    private party: PartyManager;
    private playerData: PlayerData;
    private gameManager: GameManager;
    private worldMap: WorldMap;
    private player: Player;
    private partyActors: FieldActor[] = [];
    private fieldEnemies: FieldEnemy[] = [];
    private selectedActorId: string | null = null;
    private selectedEnemyId: string | null = null;
    private selectedLootId: string | null = null;
    private actionMenuOpen = false;
    private actionMenuUI = new ActionMenuUI();
    private entityInfoUI = new EntityInfoUI();
    private magicUI = new MagicUI();
    private tacticalMenuUI = new TacticalContextMenuUI();
    private townSession: WorldTownSession;
    private raidSession: WorldRaidSession;
    private currentPhase: WorldPhase = 'lobby';
    private combatController: WorldCombatController;
    private raidResultUI = new RaidResultUI();
    private tacticalMarkers = new TacticalMarkerStore();
    private tacticalMenuTarget: TacticalTargetRef | null = null;
    private actionMode: 'move' | 'attack' | 'interact' | null = null;
    private actionTiles: Set<string> = new Set();
    private fieldMagicState: FieldMagicState = { mode: 'idle' };
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
        this.combatController = new WorldCombatController({
            log: (message) => this.addCombatLog(message),
            spawnDamage: (x, y, amount, isCrit, isMiss) => this.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
            spawnStatus: (x, y, text) => this.floatingText.spawnStatus(x, y, text),
            spawnHitEffect: (x, y, isCrit) => this.effectManager.spawnHitEffect(x, y, isCrit),
            spawnKillEffect: (enemy) => this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image),
            spawnAttackCue: (from, to, color, label) => this.spawnAttackCue(from, to, color, label),
            spawnLoot: (enemy) => this.spawnEnemyLoot(enemy),
        });
        this.raidResultUI.onClose = () => this.openPendingTownAfterResult();

        this.spawnPartyAtCurrentHub();
        this.player = this.getControlledActor()?.entity ?? new Player(0, 0);
        this.selectedActorId = this.getControlledActor()?.id ?? null;
        this.magicUI.onSkillSelect = (skill: Skill) => this.handleMagicSkillSelect(skill);
        this.openTown(this.getCurrentHubTown());

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.snapToTarget();
        this.addCombatLog('마을에 도착했습니다. 출격 준비를 마치세요.');
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.worldTime += dt;
        this.townSession.sync();

        if (this.raidResultUI.isVisible()) {
            this.raidResultUI.updateInput(input);
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

        if (input.mouseWheelDelta !== 0 && !this.magicUI.isVisible()) {
            if (input.mouseWheelDelta > 0) camera.zoomOut();
            else camera.zoomIn();
        }

        const screenTile = camera.screenToTile(input.mouseScreenX, input.mouseScreenY);
        this.hoverTile = { x: screenTile.tileX, y: screenTile.tileY };
        this.entityInfoUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.actionMenuUI.onMouseMove(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
        this.magicUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.tacticalMenuUI.onMouseMove(input.uiMouseX, input.uiMouseY);
        this.updateMagicHoverPreview();

        if (!this.isInputLockedByReservation()) {
            if (input.mouseRightJustDown && !this.magicUI.isVisible()) {
                this.handleFieldRightClick(this.hoverTile, input);
            } else if (input.justPressed('Escape')) {
                if (this.tacticalMenuUI.getIsOpen()) this.closeTacticalMenu();
                else if (this.fieldMagicState.mode !== 'idle' || this.magicUI.isVisible()) this.resetMagicState();
                else this.clearIntent();
            } else if (this.tacticalMenuUI.getIsOpen()) {
                if (input.mouseJustDown) this.handleTacticalMenuClick(input.uiMouseX, input.uiMouseY);
            } else if (this.magicUI.isVisible()) {
                this.magicUI.updateMp(this.getControlledActor()?.character.stats.mp ?? 0);
                if (input.mouseWheelDelta !== 0) this.magicUI.onScroll(input.mouseWheelDelta);
                if (input.mouseJustDown) {
                    this.magicUI.onMouseDown(input.mouseScreenX, input.mouseScreenY);
                    if (!this.magicUI.isVisible() && this.fieldMagicState.mode === 'menu') this.resetMagicState();
                }
                if (input.mouseJustUp) this.magicUI.onMouseUp();
            } else if (this.fieldMagicState.mode === 'targeting') {
                if (input.mouseJustDown) this.handleMagicTargetClick(this.hoverTile);
            } else {
                if (input.justPressed('Tab')) this.switchToNextAliveActor();
                if (input.mouseJustDown) this.handleFieldClick(this.hoverTile, input, camera);
            }
        }

        this.updatePartyActors(dt);
        this.updateEnemies(dt);
        this.effectManager.update(dt);
        this.floatingText.update(dt);
        this.updateAttackCues(dt);
        this.processQueuedIntents();
        this.refreshLootState();
        this.updateTacticalMarkers(dt);
        this.startNextReadyTurn();
        this.updateRaidTimer(dt);
        this.checkRaidEndConditions();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update();
    }

    public isModalOverlayVisible(): boolean {
        return this.townSession.isVisible() || this.raidResultUI.isVisible();
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        const model = this.buildRenderModel();
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();

        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

        const viewW = width / camera.zoom;
        const viewH = height / camera.zoom;
        this.worldMap.updateLoadedChunks(model.player.pixelX * TILE_SIZE, model.player.pixelY * TILE_SIZE);
        this.worldMap.render(ctx, camX, camY, viewW, viewH);

        WorldFieldRenderer.renderActionTiles(ctx, model, camX, camY);
        WorldFieldRenderer.renderMagicTargetTiles(ctx, model, camX, camY);
        WorldFieldRenderer.renderPathPreview(ctx, model, camX, camY);
        WorldFieldRenderer.renderTacticalMarkers(ctx, model, camX, camY);
        WorldFieldRenderer.renderSelectedLoot(ctx, model, camX, camY);
        WorldFieldRenderer.renderEnemies(ctx, model, camX, camY);
        WorldFieldRenderer.renderPartyActors(ctx, model, camX, camY);
        WorldFieldRenderer.renderAttackCues(ctx, model, camX, camY);
        this.effectManager.render(ctx, camera);
        this.floatingText.render(ctx, camX, camY);
        WorldFieldRenderer.renderHoverTile(ctx, model, camX, camY);
        this.renderActionMenu(ctx, camX, camY);

        ctx.restore();

        ctx.save();
        ctx.scale(scale, scale);
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const infoY = WorldFieldRenderer.renderHudPanels(ctx, model, uiW, uiH);
        if (model.selectedDisplayInfo) {
            this.entityInfoUI.setPosition(16, infoY + 18);
            this.entityInfoUI.render(ctx, model.selectedDisplayInfo);
        }
        this.tacticalMenuUI.render(ctx);
        this.magicUI.render(ctx, uiW, uiH);
        if (this.townSession.isVisible()) this.townSession.render(ctx, uiW, uiH);
        if (this.raidResultUI.isVisible()) this.raidResultUI.render(ctx, uiW, uiH);
        ctx.restore();
    }

    private buildRenderModel(): WorldRenderModel {
        const activeActor = this.getControlledActor();
        const terrainHoverLines = this.hoverTile.x >= 0 && this.hoverTile.y >= 0
            ? describeTerrainForHover(
                this.worldMap.getTileAt(this.hoverTile.x, this.hoverTile.y),
                activeActor ? this.getActorTerrainTraits(activeActor) : {}
            )
            : [];
        const selectedLoot = this.selectedLootId
            ? this.worldMap.loot.find((candidate) => candidate.id === this.selectedLootId) ?? null
            : null;

        return {
            worldTime: this.worldTime,
            phase: this.currentPhase,
            player: this.player,
            activeCharacter: this.party.getActive() ?? null,
            controlledActor: activeActor,
            partyActors: this.partyActors,
            fieldEnemies: this.fieldEnemies,
            activeTurnActorId: this.activeTurnActorId,
            remainingActionPoints: this.remainingActionPoints,
            selectedActorId: this.selectedActorId,
            selectedEnemyId: this.selectedEnemyId,
            selectedLootId: this.selectedLootId,
            selectedDisplayInfo: this.getSelectedDisplayInfo(),
            hasSelection: this.hasSelection(),
            actionMode: this.actionMode,
            actionTiles: this.actionTiles,
            actionMenuOpen: this.actionMenuOpen,
            fieldMagicState: this.fieldMagicState,
            hoverTile: this.hoverTile,
            hoverTileWalkable: this.hoverTile.x >= 0 && this.hoverTile.y >= 0
                ? this.worldMap.isWalkable(this.hoverTile.x, this.hoverTile.y)
                : false,
            terrainHoverLines,
            tacticalMarkers: this.tacticalMarkers.getMarkers(),
            selectedLootTile: selectedLoot ? { x: selectedLoot.x, y: selectedLoot.y } : null,
            attackCues: this.attackCues,
            combatLog: this.combatLog,
            gold: this.playerData.gold,
            raid: {
                active: this.raidSession.active,
                elapsedSeconds: this.raidSession.elapsedSeconds,
                limitSeconds: this.raidSession.limitSeconds,
                departureTownId: this.raidSession.departureTownId,
                timerAdvancing: this.raidSession.shouldAdvanceTimer({
                    townVisible: this.townSession.isVisible(),
                    resultVisible: this.raidResultUI.isVisible(),
                    turnCombatActive: this.isTurnCombatActive(),
                }),
            },
        };
    }

    private spawnPartyAtCurrentHub(): void {
        this.placePartyNear(this.worldMap.getTownSpawnTile(this.getCurrentHubTown()));
    }

    private placePartyNear(anchorTile: TilePoint): void {
        const members = this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);

        this.partyActors = members.map((character, index) => {
            const tile = this.findNearbyWalkableTile({
                x: anchorTile.x + (FORMATION_OFFSETS[index]?.x ?? 0),
                y: anchorTile.y + (FORMATION_OFFSETS[index]?.y ?? 0),
            }, `party_${index}`);
            const entity = new Player(tile.x, tile.y);
            entity.color = ACTOR_COLORS[index % ACTOR_COLORS.length];
            entity.label = character.name;
            if (character.portraitImage && character.portraitLoaded) {
                entity.image = character.portraitImage;
                entity.imageLoaded = true;
            } else {
                entity.setImage(character.portraitImage?.src || '/Image/Character/fighter.png');
            }
            return {
                id: character.id,
                character,
                entity,
                path: [],
                queuedIntent: null,
            };
        });
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
        this.party.resetForNewRaid();
        this.townSession.applyPendingRestForRaidStart();
        this.placePartyNear(this.worldMap.getTownExitTile(town));
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.selectedActorId = this.getControlledActor()?.id ?? null;
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
        this.resetMagicState();
        this.clearActionMode();
    }

    private clearFieldTurnState(): void {
        this.activeTurnActorId = null;
        this.readyQueue = [];
        this.remainingActionPoints = 0;
        this.reservedAction = null;
        this.actionMenuOpen = false;
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

        const enemySeeds = [
            { offset: { x: 7, y: 3 }, name: '늑대인간', level: 1, color: '#d95763', role: 'bruiser' as EnemyRole },
            { offset: { x: 10, y: -2 }, name: '에우리티온', level: 2, color: '#ff8a4a', role: 'archer' as EnemyRole },
            { offset: { x: -6, y: 6 }, name: '미노타우로스', level: 1, color: '#b86cff', role: 'tank' as EnemyRole },
            { offset: { x: 12, y: 4 }, name: '나이아드', level: 2, color: '#6fdc8c', role: 'healer' as EnemyRole },
            { offset: { x: -9, y: -4 }, name: '만드라고라', level: 1, color: '#8fb6ff', role: 'coward' as EnemyRole },
            { offset: { x: -11, y: 5 }, name: '마도사 마기', level: 2, color: '#9a7cff', role: 'support' as EnemyRole },
        ];

        this.fieldEnemies = enemySeeds.map((seed, index) => {
            const tile = this.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, `enemy_${index}`);
            const enemy = new Enemy(`field_enemy_${index}`, tile.x, tile.y, seed.name, seed.level, seed.color, seed.role);
            enemy.aggroRange = ENEMY_AGGRO_RANGE;
            return { enemy, home: tile, path: [] };
        });

        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        const sword = getItemDef('short_sword');
        const lootSeeds = [
            { offset: { x: 3, y: 2 }, id: 'field_chest_1', label: '버려진 보급 상자', item: herb, kind: 'chest' as const },
            { offset: { x: -3, y: 4 }, id: 'field_pack_1', label: '전사자의 배낭', item: sword, kind: 'corpse' as const },
        ];

        this.worldMap.loot = lootSeeds.flatMap((seed) => {
            if (!seed.item) return [];
            const tile = this.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, seed.id);
            return [new LootObject(seed.id, tile.x, tile.y, [seed.item], { sourceLabel: seed.label, kind: seed.kind })];
        });
    }

    private handleFieldClick(tile: TilePoint, input: InputManager, camera: Camera): void {
        const hit = this.resolveFieldHitAt(tile);

        if (this.hasSelection() && this.entityInfoUI.onClick(input.mouseScreenX, input.mouseScreenY)) {
            this.clearSelection();
            return;
        }

        if (this.actionMenuOpen) {
            const action = this.actionMenuUI.onClick(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
            if (action) {
                this.executeFieldAction(action);
                return;
            }
            this.closeActionMenu();
            return;
        }

        if (this.actionMode) {
            this.handleActionTargetClick(tile, hit);
            return;
        }

        switch (hit.kind) {
            case 'enemy':
                this.selectedEnemyId = hit.enemy.id;
                this.selectedActorId = null;
                this.selectedLootId = null;
                this.addCombatLog(`${hit.enemy.name} 선택`);
                break;
            case 'party': {
                const index = this.partyActors.findIndex((actor) => actor.id === hit.party.id);
                if (index >= 0) this.switchToPartyMember(index);
                const actor = this.partyActors[index];
                if (actor && actor.id === this.activeTurnActorId) this.toggleActionMenuForControlled();
                break;
            }
            case 'loot':
                this.selectedActorId = null;
                this.selectedEnemyId = null;
                this.selectedLootId = hit.loot.id;
                this.addCombatLog(`${hit.loot.sourceLabel} 선택`);
                break;
            case 'ground':
                this.closeActionMenu();
                break;
            case 'blocked':
                this.clearIntent();
                this.addCombatLog('갈 수 없는 위치입니다.');
                break;
        }
    }

    private executeFieldAction(action: ActionType): void {
        const actor = this.getActivePartyTurnActor();
        if (!actor) return;

        if (actor.entity.actionGauge < 100 || this.activeTurnActorId !== actor.id) {
            this.addCombatLog('행동 게이지가 차지 않았습니다.');
            this.closeActionMenu();
            return;
        }

        this.closeActionMenu();
        this.clearActionMode();

        switch (action) {
            case 'move':
                if (hasStatus(actor.character.statuses, 'immobilize')) {
                    this.addCombatLog('이동불가 상태입니다.');
                    this.reopenActionMenu(actor);
                    break;
                }
                if (this.remainingActionPoints < MOVE_AP_PER_TILE || !this.hasExecutableMove(actor)) {
                    this.addCombatLog('이동할 행동력이 부족합니다.');
                    this.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'move';
                this.actionTiles = this.computeWalkableTiles(actor);
                this.addCombatLog('이동할 타일을 클릭하세요.');
                break;
            case 'attack':
                if (this.remainingActionPoints < ATTACK_AP_COST) {
                    this.addCombatLog('공격할 행동력이 부족합니다.');
                    this.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'attack';
                this.actionTiles = this.computeAttackableTiles(actor);
                this.addCombatLog(this.hasExecutableAttack(actor) ? '공격할 적을 클릭하세요.' : '사거리 안의 적을 선택하세요.');
                break;
            case 'magic':
                if (hasStatus(actor.character.statuses, 'silence')) {
                    this.addCombatLog('침묵 상태로 마법을 사용할 수 없습니다.');
                    this.reopenActionMenu(actor);
                    break;
                }
                this.openMagicMenu(actor);
                break;
            case 'open':
                if (this.remainingActionPoints < INTERACT_AP_COST || !this.hasExecutableInteract(actor)) {
                    this.addCombatLog('조사할 수 있는 대상이 없습니다.');
                    this.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'interact';
                this.actionTiles = this.computeInteractTiles(actor);
                this.addCombatLog('조사할 상자나 전리품을 클릭하세요.');
                break;
            case 'rest':
                {
                    const effective = getEffectiveStatsForCharacter(actor.character);
                    actor.character.stats.hp = Math.min(effective.maxHp, actor.character.stats.hp + 5);
                    actor.character.stats.mp = Math.min(effective.maxMp, actor.character.stats.mp + 3);
                }
                this.floatingText.spawnHeal(actor.entity.gridX, actor.entity.gridY, 5);
                this.effectManager.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
                this.addCombatLog('휴식: HP +5, MP +3 회복. 다음 행동 게이지는 보존되지 않습니다.');
                this.endActorTurn(actor, '휴식');
                break;
            case 'defend':
                actor.character.statuses = applyStatus(actor.character.statuses, createStatus('guard'));
                this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'GUARD');
                this.effectManager.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
                this.addCombatLog('방어 태세: 다음 피격 피해 감소');
                this.endActorTurn(actor, '방어');
                break;
            case 'counter':
                actor.character.statuses = applyStatus(actor.character.statuses, createStatus('counterReady'));
                this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'COUNTER');
                this.effectManager.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
                this.addCombatLog('반격 태세: 다음 피격 시 반격 준비');
                this.endActorTurn(actor, '반격 태세');
                break;
            default:
                this.addCombatLog('아직 필드에서 사용할 수 없는 행동입니다.');
                break;
        }
    }

    private handleActionTargetClick(tile: TilePoint, hit: ReturnType<typeof resolveFieldHit>): void {
        const actor = this.getActivePartyTurnActor();
        if (!actor) return;

        if (this.actionMode === 'attack') {
            if (hit.kind !== 'enemy') {
                this.addCombatLog('공격할 적이 없습니다.');
                return;
            } else {
                const enemy = this.getEnemyById(hit.enemy.id);
                if (!enemy) {
                    this.addCombatLog('공격할 적이 없습니다.');
                    return;
                }
                this.selectedEnemyId = enemy.id;
                this.selectedActorId = null;
                this.selectedLootId = null;
                const failure = this.getActorAttackTargetFailure(actor, enemy);
                if (failure) {
                    this.addCombatLog(getAttackFailureMessage(failure));
                    return;
                }
                if (this.spendAp(ATTACK_AP_COST) && this.tryActorAttack(actor, enemy)) {
                    this.resumeOrEndActiveTurn(actor);
                }
            }
            this.clearActionMode();
            return;
        }

        const selectedTileKey = tileKey(tile.x, tile.y);
        if (!this.actionTiles.has(selectedTileKey)) {
            this.addCombatLog('선택할 수 없는 위치입니다.');
            this.clearActionMode();
            return;
        }

        if (this.actionMode === 'move') {
            const queued = this.queueMoveIntent(actor, tile);
            if (queued) {
                this.addCombatLog(`이동 시작 (${tile.x}, ${tile.y})`);
            }
            this.clearActionMode();
            return;
        }

        if (this.actionMode === 'interact') {
            if (hit.kind !== 'loot') {
                this.addCombatLog('조사할 대상이 없습니다.');
            } else {
                const loot = this.worldMap.loot.find((candidate) => candidate.id === hit.loot.id);
                if (!loot) {
                    this.addCombatLog('조사할 대상이 없습니다.');
                    this.clearActionMode();
                    return;
                }
                this.selectedLootId = loot.id;
                if (!this.spendAp(INTERACT_AP_COST)) {
                    this.addCombatLog('조사할 행동력이 부족합니다.');
                    this.clearActionMode();
                    return;
                }
                this.openLoot(loot);
                this.resumeOrEndActiveTurn(actor);
            }
            this.clearActionMode();
        }
    }

    private openMagicMenu(actor: FieldActor): void {
        if (hasStatus(actor.character.statuses, 'silence')) {
            this.addCombatLog('침묵 상태로 마법을 사용할 수 없습니다.');
            this.reopenActionMenu(actor);
            return;
        }
        if (this.remainingActionPoints < MAGIC_AP_COST) {
            this.addCombatLog('마법을 사용할 행동력이 부족합니다.');
            this.reopenActionMenu(actor);
            return;
        }

        const unlocked = this.getUnlockedSkillIds(actor.character);
        const learned = getLearnedSkills(actor.character.classLineId, actor.character.currentTier, unlocked);
        if (learned.length === 0) {
            this.addCombatLog('사용 가능한 마법이 없습니다.');
            this.reopenActionMenu(actor);
            return;
        }

        this.fieldMagicState = { mode: 'menu' };
        this.closeTacticalMenu();
        const effective = getEffectiveStatsForCharacter(actor.character);
        this.magicUI.show(
            actor.character.classLineId,
            actor.character.currentTier,
            actor.character.stats.mp,
            effective.maxMp,
            unlocked
        );
        this.addCombatLog('마법을 선택하세요.');
    }

    private handleMagicSkillSelect(skill: Skill): void {
        const actor = this.getActivePartyTurnActor();
        if (!actor) return;

        if (this.remainingActionPoints < MAGIC_AP_COST) {
            this.addCombatLog('마법을 사용할 행동력이 부족합니다.');
            this.resetMagicState();
            this.reopenActionMenu(actor);
            return;
        }

        if (actor.character.stats.mp < skill.mpCost) {
            this.addCombatLog(`MP 부족! (${skill.mpCost} 필요)`);
            this.resetMagicState();
            this.reopenActionMenu(actor);
            return;
        }

        if (skill.type === 'heal' || skill.type === 'buff') {
            this.castFieldSkill(actor, skill);
            return;
        }

        const validTiles = this.computeMagicTargetTiles(actor, skill);
        this.fieldMagicState = { mode: 'targeting', skill, validTiles, hoverAoeTiles: new Set() };
        this.addCombatLog(`${skill.icon} ${skill.nameKr}: 대상을 선택하세요.`);
    }

    private handleMagicTargetClick(tile: TilePoint): void {
        const actor = this.getActivePartyTurnActor();
        if (!actor || this.fieldMagicState.mode !== 'targeting') return;

        const targetTileKey = tileKey(tile.x, tile.y);
        if (!this.fieldMagicState.validTiles.has(targetTileKey)) {
            this.addCombatLog('마법 사거리 밖입니다.');
            return;
        }

        const enemy = this.fieldEnemies
            .map((entry) => entry.enemy)
            .find((candidate) => candidate.stats.hp > 0 && candidate.gridX === tile.x && candidate.gridY === tile.y);
        if (!enemy) {
            this.addCombatLog('대상을 선택하세요.');
            return;
        }

        this.castFieldSkill(actor, this.fieldMagicState.skill, enemy);
    }

    private castFieldSkill(actor: FieldActor, skill: Skill, targetEnemy?: Enemy): void {
        if (this.remainingActionPoints < MAGIC_AP_COST) {
            this.addCombatLog('마법을 사용할 행동력이 부족합니다.');
            this.reopenActionMenu(actor);
            return;
        }
        if (actor.character.stats.mp < skill.mpCost) {
            this.addCombatLog(`MP 부족! (${skill.mpCost} 필요)`);
            this.reopenActionMenu(actor);
            return;
        }
        if ((skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe') && !targetEnemy) {
            this.addCombatLog('대상 없음!');
            return;
        }

        const targetEnemies = this.getSkillCandidateEnemies(skill, targetEnemy);
        const effect = resolveSkillEffect({
            casterStats: actor.character.stats,
            casterCharacter: actor.character,
            skill,
            targetEnemy: targetEnemy ? this.toSkillEnemyInput(targetEnemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => this.toSkillEnemyInput(enemy)),
            targetsResolvedByPattern: Boolean(targetEnemy),
            terrainContext: this.getSkillTerrainContext(actor, targetEnemies, targetEnemy),
        });

        if (!this.spendAp(MAGIC_AP_COST)) {
            this.addCombatLog('마법을 사용할 행동력이 부족합니다.');
            this.reopenActionMenu(actor);
            return;
        }

        this.applySkillEffect(actor, skill, effect);
        this.resetMagicState();
        this.resumeOrEndActiveTurn(actor);
    }

    private applySkillEffect(actor: FieldActor, skill: Skill, effect: SkillEffectResult): void {
        const effective = getEffectiveStatsForCharacter(actor.character);
        actor.character.stats.mp = Math.max(0, Math.min(effective.maxMp, actor.character.stats.mp + effect.casterMpDelta));
        actor.character.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.character.stats.hp + effect.casterHpDelta));
        if (effect.casterHpDelta > 0) {
            this.floatingText.spawnHeal(actor.entity.gridX, actor.entity.gridY, effect.casterHpDelta);
            this.effectManager.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        } else if (effect.casterHpDelta < 0) {
            this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, Math.abs(effect.casterHpDelta), false, false);
            this.effectManager.spawnHitEffect(actor.entity.gridX, actor.entity.gridY);
        }
        if (effect.cleansesCasterStatuses) {
            actor.character.statuses = cleanseNegativeStatuses(actor.character.statuses);
            this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'CLEANSE');
            this.effectManager.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        }
        if (effect.casterStatusEffects) {
            actor.character.statuses = applyStatuses(actor.character.statuses, effect.casterStatusEffects);
            this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'BUFF');
            this.effectManager.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        } else if (effect.appliesBuff) {
            actor.character.applyBuff(effect.appliesBuff);
            this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'BUFF');
            this.effectManager.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        }

        let counterTriggered = false;
        for (const enemyResult of effect.enemyResults) {
            const enemy = this.getEnemyById(enemyResult.enemyId);
            if (!enemy) continue;

            if (enemyResult.statusEffects) {
                enemy.statuses = applyStatuses(enemy.statuses, enemyResult.statusEffects);
                this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'WEAK');
                this.effectManager.spawnDebuffEffect(enemy.gridX, enemy.gridY);
            }

            if (skill.element !== 'none' && skill.element !== 'physical') {
                this.effectManager.spawnByElement(skill.element, enemy.gridX, enemy.gridY);
            } else {
                this.effectManager.spawnHitEffect(enemy.gridX, enemy.gridY);
            }
            const guarded = applyGuardToDamage(enemy.statuses, enemyResult.damage);
            enemy.statuses = guarded.statuses;
            const dead = enemy.takeDamage(guarded.damage);
            this.floatingText.spawnDamage(enemy.gridX, enemy.gridY, guarded.damage, false, false);
            if (guarded.guarded) this.addCombatLog(`${enemy.name} 방어: 피해 감소`);
            if (dead) this.handleEnemyDefeated(actor, enemy);
            else if (!guarded.guarded && !counterTriggered && this.tryEnemyCounterAttack(enemy, actor)) counterTriggered = true;
        }

        for (const log of effect.logs) this.addCombatLog(log);
    }

    private toSkillEnemyInput(enemy: Enemy): SkillEffectEnemyInput {
        return {
            id: enemy.id,
            name: enemy.name,
            gridX: enemy.gridX,
            gridY: enemy.gridY,
            stats: getEffectiveStatsForEnemy(enemy),
        };
    }

    private getUnlockedSkillIds(character: Character): string[] {
        const classLine = getClassLine(character.classLineId);
        const unlocked: string[] = [];
        if (!classLine) return unlocked;

        for (let tier = 1; tier <= character.currentTier; tier++) {
            const ids = classLine.skillUnlocks[tier];
            if (ids) unlocked.push(...ids);
        }
        return unlocked;
    }

    private getLearnedFieldSkills(character: Character): Skill[] {
        return getLearnedSkills(character.classLineId, character.currentTier, this.getUnlockedSkillIds(character));
    }

    private hasCastableFieldSkill(character: Character): boolean {
        if (hasStatus(character.statuses, 'silence')) return false;
        return this.getLearnedFieldSkills(character).some((skill) => character.stats.mp >= skill.mpCost);
    }

    private computeMagicTargetTiles(actor: FieldActor, skill: Skill): Set<string> {
        const result = new Set<string>();
        const profile = getSkillAttackProfile(skill);
        for (const tile of getSelectableTiles(profile, this.getPatternContext(actor))) {
            result.add(tileKey(tile.x, tile.y));
        }
        return result;
    }

    private updateMagicHoverPreview(): void {
        if (this.fieldMagicState.mode !== 'targeting') return;
        const actor = this.getActivePartyTurnActor();
        if (!actor) return;

        const enemy = this.fieldEnemies
            .map((entry) => entry.enemy)
            .find((candidate) =>
                candidate.stats.hp > 0 &&
                candidate.gridX === this.hoverTile.x &&
                candidate.gridY === this.hoverTile.y &&
                this.fieldMagicState.mode === 'targeting' &&
                this.fieldMagicState.validTiles.has(`${candidate.gridX},${candidate.gridY}`)
            );
        const hoverAoeTiles = new Set<string>();
        if (enemy) {
            const profile = getSkillAttackProfile(this.fieldMagicState.skill);
            for (const tile of getEffectTiles(profile, this.getPatternContext(actor, this.enemyTile(enemy)))) {
                hoverAoeTiles.add(tileKey(tile.x, tile.y));
            }
        }

        this.fieldMagicState = {
            ...this.fieldMagicState,
            hoverAoeTiles,
        };
    }

    private resetMagicState(): void {
        this.fieldMagicState = { mode: 'idle' };
        this.magicUI.hide();
    }

    private queueMoveIntent(actor: FieldActor, tile: TilePoint): boolean {
        const movementBudget = this.getActorTerrainMovementBudget(actor);
        const pathResult = findPathWithCost(this.actorTile(actor), tile, (query) => this.isFieldPassable(query), (step) => this.getActorTerrainStepCost(actor, step), {
            actorId: actor.id,
            intent: 'move',
            maxNodes: 8000,
            maxCost: movementBudget,
        });
        const path = pathResult.path;
        if (path.length === 0 && !this.isActorAt(actor, tile)) {
            this.clearActorIntent(actor);
            this.addCombatLog('이동 경로를 찾지 못했습니다.');
            return false;
        }

        const apCost = terrainCostToApCost(pathResult.cost);
        if (!this.spendAp(apCost)) {
            this.addCombatLog('이동할 행동력이 부족합니다.');
            return false;
        }

        actor.path = path;
        actor.queuedIntent = { kind: 'move', tile, path, apCost, pathCost: pathResult.cost };
        this.reservedAction = actor.queuedIntent;
        this.closeActionMenu();
        return true;
    }

    private updatePartyActors(dt: number): void {
        const controlled = this.getControlledActor();
        this.followRepathTimer -= dt;

        for (const actor of this.partyActors) {
            if (actor.character.isDead) continue;
            if (actor.id !== this.activeTurnActorId) {
                actor.entity.actionGauge = advanceAtb(actor.entity.actionGauge, getEffectiveStatsForCharacter(actor.character).spd, dt, FIELD_ATB_SCALE);
                if (actor.entity.actionGauge >= 100) {
                    actor.entity.actionGauge = 100;
                    enqueueReadyActor(this.readyQueue, actor.id);
                }
            }
            this.stepActorAlongPath(actor);
            actor.entity.update(dt);
        }

        if (controlled && this.followRepathTimer <= 0) {
            this.followRepathTimer = MOVEMENT_REPATH_INTERVAL;
            this.updateFollowerPaths(controlled);
        }
    }

    private updateFollowerPaths(controlled: FieldActor): void {
        for (let i = 0; i < this.partyActors.length; i++) {
            const actor = this.partyActors[i];
            if (actor === controlled || actor.character.isDead || actor.queuedIntent?.kind === 'attack') continue;
            if (actor.path.length > 0) continue;

            const offset = FORMATION_OFFSETS[i % FORMATION_OFFSETS.length];
            const preferred = { x: controlled.entity.gridX + offset.x, y: controlled.entity.gridY + offset.y };
            if (manhattan(this.actorTile(actor), preferred) <= 1) continue;

            const goals = [preferred, ...tilesInRange(preferred, 1)]
                .filter((tile) => this.isFieldPassable({
                    ...tile,
                    actorId: actor.id,
                    intent: 'follow',
                    goal: preferred,
                }));
            const path = findPathToAny(this.actorTile(actor), goals, (query) => this.isFieldPassable(query), {
                actorId: actor.id,
                intent: 'follow',
                maxNodes: 2000,
            });
            if (path.length > 0) {
                actor.path = path;
                actor.queuedIntent = { kind: 'move', tile: path[path.length - 1] };
            }
        }
    }

    private updateEnemies(dt: number): void {
        const aliveActors = this.partyActors.filter((actor) => !actor.character.isDead);

        for (const entry of this.fieldEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            enemy.update(dt);

            const closest = this.findClosestActor(this.enemyTile(enemy), aliveActors);
            if (!closest) continue;

            const enemyTile = this.enemyTile(enemy);
            const distanceToTarget = manhattan(enemyTile, this.actorTile(closest));
            const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
            enemy.isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, leashExceeded);
            if (!enemy.isAggro && this.hasAggroAllyNear(entry, enemy.aiProfile.assistRange)) enemy.isAggro = true;

            if (enemy.id !== this.activeTurnActorId) {
                enemy.actionGauge = advanceAtb(enemy.actionGauge, getEffectiveStatsForEnemy(enemy).spd, dt, FIELD_ATB_SCALE * 0.7);
                if (enemy.actionGauge >= 100) {
                    enemy.actionGauge = 100;
                    enqueueReadyActor(this.readyQueue, enemy.id);
                }
            }
        }
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

    private handleFieldRightClick(tile: TilePoint, input: InputManager): void {
        const mode = this.getWorldInteractionMode();
        const disposition = getRightClickDisposition(mode);

        if (disposition === 'ignore') return;

        if (disposition === 'cancelTargeting') {
            if (mode.kind === 'magicTargeting') this.resetMagicState();
            else this.clearActionMode();
            this.closeActionMenu();
            this.closeTacticalMenu();
            this.addCombatLog(t('tactical.log.cancelTargeting'));
            return;
        }

        if (disposition === 'reopenTacticalMenu') {
            this.closeTacticalMenu();
        } else {
            this.closeActionMenu();
        }

        this.openTacticalMenu(tile, input.uiMouseX, input.uiMouseY);
    }

    private handleTacticalMenuClick(mx: number, my: number): void {
        const result = this.tacticalMenuUI.onClick(mx, my);
        if (!result) return;
        if (result === 'outside') {
            this.closeTacticalMenu();
            return;
        }

        this.executeTacticalCommand(result);
    }

    private openTacticalMenu(tile: TilePoint, uiX: number, uiY: number): void {
        const target = this.getTacticalTarget(tile);
        const items = buildTacticalMenuItems(target);
        const scale = SettingsManager.getUIScale();
        const vw = Math.floor(this.canvas.width / scale);
        const vh = Math.floor(this.canvas.height / scale);
        this.tacticalMenuTarget = target;
        this.tacticalMenuUI.open(uiX, uiY, items, vw, vh);
    }

    private closeTacticalMenu(): void {
        this.tacticalMenuTarget = null;
        this.tacticalMenuUI.close();
    }

    private executeTacticalCommand(command: TacticalCommand): void {
        const target = this.tacticalMenuTarget;
        if (!target) return;

        switch (command) {
            case 'ping':
                this.tacticalMarkers.addPing(target);
                this.addCombatLog(t('tactical.log.ping'));
                break;
            case 'rally':
                if (target.kind === 'ground') {
                    this.tacticalMarkers.setRally(target.tile);
                    this.addCombatLog(t('tactical.log.rally'));
                }
                break;
            case 'watch':
                if (this.tacticalMarkers.setWatch(target)) {
                    this.addCombatLog(t('tactical.log.watch'));
                }
                break;
            case 'clear':
                this.tacticalMarkers.clear(target);
                this.addCombatLog(t('tactical.log.clear'));
                break;
        }

        this.closeTacticalMenu();
    }

    private getTacticalTarget(tile: TilePoint): TacticalTargetRef {
        const hit = this.resolveFieldHitAt(tile);
        switch (hit.kind) {
            case 'enemy':
                return {
                    kind: 'enemy',
                    tile: this.enemyTile(hit.enemy),
                    targetKey: makeTacticalTargetKey('enemy', hit.enemy.id),
                };
            case 'party':
                return {
                    kind: 'party',
                    tile: { x: hit.party.entity.gridX, y: hit.party.entity.gridY },
                    targetKey: makeTacticalTargetKey('party', hit.party.id),
                };
            case 'loot':
                return {
                    kind: 'loot',
                    tile: { x: hit.loot.x, y: hit.loot.y },
                    targetKey: makeTacticalTargetKey('loot', hit.loot.id),
                };
            case 'ground':
                return { kind: 'ground', tile: hit.tile };
            case 'blocked':
                return { kind: 'blocked', tile: hit.tile };
        }
    }

    private processQueuedIntents(): void {
        for (const actor of this.partyActors) {
            if (actor.character.isDead || actor.path.length > 0 || this.isEntityMoving(actor.entity) || !actor.queuedIntent) continue;

            if (actor.queuedIntent.kind === 'move') {
                actor.queuedIntent = null;
                if (this.reservedAction?.kind === 'move' && this.activeTurnActorId === actor.id) {
                    this.reservedAction = null;
                    this.resumeOrEndActiveTurn(actor);
                }
                continue;
            }

            if (actor.queuedIntent.kind === 'attack' && actor.queuedIntent.enemyId) {
                const enemy = this.getEnemyById(actor.queuedIntent.enemyId);
                if (enemy && enemy.stats.hp > 0) this.tryActorAttack(actor, enemy);
                else this.clearActorIntent(actor);
            }

            if (actor.queuedIntent.kind === 'interact' && actor.queuedIntent.lootId) {
                const loot = this.worldMap.loot.find((candidate) => candidate.id === actor.queuedIntent?.lootId);
                if (loot && !loot.opened && manhattan(this.actorTile(actor), { x: loot.x, y: loot.y }) <= 1) {
                    this.openLoot(loot);
                }
                this.clearActorIntent(actor);
            }
        }
    }

    private updateRaidTimer(dt: number): void {
        const result = this.raidSession.advanceTimer(dt, {
            townVisible: this.townSession.isVisible(),
            resultVisible: this.raidResultUI.isVisible(),
            turnCombatActive: this.isTurnCombatActive(),
        });
        if (result.advanced) this.townSession.advancePartyTimedRestStatuses(dt);
        if (result.expired) {
            this.completeRaidFailure('MIA');
        }
    }

    private isTurnCombatActive(): boolean {
        if (this.fieldEnemies.some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro)) return true;
        if (this.activeTurnActorId) return true;
        if (this.readyQueue.length > 0) return true;
        if (this.reservedAction) return true;
        if (this.actionMenuOpen || this.actionMode) return true;
        if (this.tacticalMenuUI.getIsOpen()) return true;
        if (this.magicUI.isVisible() || this.fieldMagicState.mode !== 'idle') return true;
        return this.partyActors.some((actor) => actor.queuedIntent || actor.path.length > 0);
    }

    private checkRaidEndConditions(): void {
        if (!this.raidSession.active || this.raidResultUI.isVisible()) return;
        if (this.party.isSquadWiped()) {
            this.completeRaidFailure('DEAD');
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
        this.completeRaidSuccess(destination);
    }

    private completeRaidSuccess(destination: TownInfo): void {
        if (!this.raidSession.active) return;

        const heroStatuses = this.createHeroStatuses();
        const secured = this.secureRaidLoot();
        const questRewards: string[] = [];
        let goldReward = 0;

        if (!this.playerData.isCleared('quest:first_survival')) {
            this.playerData.markCleared('quest:first_survival');
            this.playerData.addGold(200);
            goldReward = 200;
            questRewards.push('퀘스트 완료: 첫 생환');
        }

        this.raidSession.completeAtTown(destination.id);
        this.playerData.currentHubTownId = destination.id;
        this.playerData.save();

        this.townSession.clearRestStatusesFromParty();
        this.townSession.applyRaidInjuries(this.raidSession.downedCharacterIds);
        this.party.resetForNewRaid();
        this.placePartyNear(this.worldMap.getTownSpawnTile(destination));
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.clearFieldTurnState();

        const outcome: RaidOutcome = {
            result: 'SURVIVED',
            elapsedSeconds: this.raidSession.elapsedSeconds,
            kills: this.raidSession.kills,
            departureTownId: this.raidSession.departureTownId,
            extractionTownId: destination.id,
            heroStatuses,
            looted: secured,
            secured,
            lost: [],
            equipmentLost: [],
            goldReward,
            questRewards,
            notes: ['전리품과 창고는 현재 세션에서만 유지됩니다.'],
        };
        this.showRaidResult(outcome, destination);
        this.addCombatLog(`${destination.nameKr} 생환 성공.`);
    }

    private completeRaidFailure(result: Exclude<RaidResultType, 'SURVIVED'>): void {
        if (!this.raidSession.active) return;

        const heroStatuses = this.createHeroStatuses();
        const loss = computeRaidFailureLoss(this.gameManager.inventory.items, this.party.getCharacters());
        this.gameManager.inventory.clear();
        for (const lost of loss.equipmentLost) {
            const character = this.party.getCharacters().find((candidate) => candidate.id === lost.characterId);
            character?.unequip(lost.slot);
        }

        const returnTown = this.getTownById(this.raidSession.departureTownId) ?? this.getCurrentHubTown();
        this.raidSession.failBackToTown(returnTown.id);
        this.playerData.currentHubTownId = returnTown.id;
        this.playerData.save();

        this.townSession.clearRestStatusesFromParty();
        this.townSession.applyRaidInjuries(this.raidSession.downedCharacterIds);
        this.party.resetForNewRaid();
        this.placePartyNear(this.worldMap.getTownSpawnTile(returnTown));
        this.player = this.getControlledActor()?.entity ?? this.player;
        this.clearFieldTurnState();

        const outcome: RaidOutcome = {
            result,
            elapsedSeconds: this.raidSession.elapsedSeconds,
            kills: this.raidSession.kills,
            departureTownId: this.raidSession.departureTownId,
            extractionTownId: returnTown.id,
            heroStatuses,
            looted: [],
            secured: [],
            lost: mergeSnapshots(loss.backpackLost),
            equipmentLost: loss.equipmentLost,
            notes: [result === 'MIA' ? '시간 초과로 실종 처리되었습니다.' : '출격조가 전멸했습니다.'],
        };
        this.showRaidResult(outcome, returnTown);
        this.addCombatLog(result === 'MIA' ? '시간 초과. 손실이 적용되었습니다.' : '전멸. 손실이 적용되었습니다.');
    }

    private showRaidResult(outcome: RaidOutcome, nextTown: TownInfo): void {
        this.currentPhase = 'lobby';
        this.raidSession.setPendingTownAfterResult(nextTown.id);
        this.townSession.hide();
        this.raidResultUI.show(outcome);
    }

    private openPendingTownAfterResult(): void {
        const nextTown = this.getTownById(this.raidSession.consumePendingTownAfterResultId() ?? '')
            ?? this.getCurrentHubTown();
        this.openTown(nextTown);
    }

    private createHeroStatuses(): HeroRaidStatus[] {
        return this.party.getCharacters().map((character) => ({
            characterId: character.id,
            characterName: character.name,
            hp: character.stats.hp,
            maxHp: character.stats.maxHp,
            isDead: character.isDead || character.stats.hp <= 0,
        }));
    }

    private secureRaidLoot() {
        const backpackSecured = [...this.gameManager.inventory.items].filter((placed) => placed.acquiredInRaid);
        const equippedSecured = this.party.getCharacters().flatMap((character) =>
            [...character.equipment.values()].filter((placed) => placed.acquiredInRaid)
        );
        const secured = mergeSnapshots([...backpackSecured, ...equippedSecured].map(snapshotPlacedItem));

        for (const placed of backpackSecured) {
            const moved = this.gameManager.stash.autoPlace(placed.item);
            if (moved) {
                moved.durability = placed.durability;
                moved.quantity = placed.quantity;
                moved.sockets = placed.sockets;
                moved.acquiredInRaid = false;
                this.gameManager.inventory.remove(placed);
            } else {
                placed.acquiredInRaid = false;
            }
        }
        for (const placed of equippedSecured) {
            placed.acquiredInRaid = false;
        }

        return secured;
    }

    private applyCombatResult(result: CombatResult): void {
        for (const enemyId of result.killedEnemyIds) {
            this.raidSession.recordKill();
            if (this.selectedEnemyId === enemyId) this.selectedEnemyId = null;
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

    private enemyAttack(entry: FieldEnemy, actor: FieldActor, range: number = 1): void {
        const enemy = entry.enemy;
        if (!this.canEnemyAttackTarget(enemy, actor, range)) return;
        const result = this.combatController.enemyAttack({
            enemy,
            actor,
            range,
            getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
            getActorTerrainTraits: (targetActor) => this.getActorTerrainTraits(targetActor),
            directionFromTo: (from, to) => this.directionFromTo(from, to),
            tryActorCounterAttack: (counterActor, counterEnemy) => this.runActorCounterAttack(counterActor, counterEnemy),
        });
        this.applyCombatResult(result);
    }

    private runActorCounterAttack(actor: FieldActor, enemy: Enemy): CombatResult {
        return this.combatController.tryActorCounterAttack({
            actor,
            enemy,
            canActorAttackTarget: (counterActor, counterEnemy) => this.canActorAttackTarget(counterActor, counterEnemy),
            getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
        });
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

    private enemyStepToward(entry: FieldEnemy, actor: FieldActor, desiredRange: number = 1): void {
        const enemy = entry.enemy;
        const targetTile = this.actorTile(actor);
        if (manhattan(this.enemyTile(enemy), targetTile) <= desiredRange) return;

        const goals = tilesInRange(targetTile, desiredRange)
            .filter((tile) => manhattan(tile, targetTile) === desiredRange)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: enemy.id,
                intent: 'enemy',
                goal: targetTile,
            }));
        const path = findPathToAny(this.enemyTile(enemy), goals, (query) => this.isFieldPassable(query), {
            actorId: enemy.id,
            intent: 'enemy',
            maxNodes: 2500,
        });
        if (path.length === 0) return;

        const next = path[0];
        enemy.facing = this.directionFromTo(this.enemyTile(enemy), next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private enemyStepAway(entry: FieldEnemy, actor: FieldActor): boolean {
        const enemy = entry.enemy;
        const start = this.enemyTile(enemy);
        const target = this.actorTile(actor);
        const startDistance = manhattan(start, target);
        const candidates = tilesInRange(start, 1)
            .filter((tile) => manhattan(tile, start) === 1)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: enemy.id,
                intent: 'enemy',
            }))
            .sort((a, b) => manhattan(b, target) - manhattan(a, target));
        const next = candidates.find((tile) => manhattan(tile, target) > startDistance);
        if (!next) return false;

        enemy.facing = this.directionFromTo(start, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
        return true;
    }

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy): void {
        this.addCombatLog(`${enemy.name} 처치! +${enemy.expReward} EXP`);
        this.raidSession.recordKill();
        this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
        this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
        actor.character.gainExp(enemy.expReward);
        enemy.isAggro = false;
        if (this.selectedEnemyId === enemy.id) this.selectedEnemyId = null;

        this.spawnEnemyLoot(enemy);
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
        this.selectedLootId = loot.id;
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

    private stepActorAlongPath(actor: FieldActor): void {
        if (this.isEntityMoving(actor.entity) || actor.path.length === 0) return;

        const next = actor.path[0];
        if (!this.isFieldPassable({
            ...next,
            actorId: actor.id,
            intent: actor.queuedIntent?.kind === 'attack' ? 'attack' : actor.queuedIntent?.kind === 'interact' ? 'interact' : 'move',
            goal: actor.queuedIntent?.tile,
        })) {
            actor.path = [];
            return;
        }

        actor.path.shift();
        actor.entity.facing = this.directionFromTo(this.actorTile(actor), next);
        actor.entity.gridX = next.x;
        actor.entity.gridY = next.y;
    }

    private isFieldPassable(query: FieldPassableQuery): boolean {
        const tile = this.worldMap.getTileAt(query.x, query.y);
        if (!isTerrainPassable(tile, this.getTerrainTraitsForActorId(query.actorId))) return false;

        const enemyAtTile = this.fieldEnemies.some((entry) =>
            entry.enemy.id !== query.actorId &&
            entry.enemy.stats.hp > 0 &&
            entry.enemy.gridX === query.x &&
            entry.enemy.gridY === query.y
        );
        if (enemyAtTile) return false;

        if (query.intent === 'enemy') {
            return !this.partyActors.some((actor) =>
                !actor.character.isDead &&
                actor.id !== query.actorId &&
                actor.entity.gridX === query.x &&
                actor.entity.gridY === query.y
            );
        }

        return true;
    }

    private findNearbyWalkableTile(tile: TilePoint, actorId: string): TilePoint {
        if (this.isFieldPassable({ ...tile, actorId, intent: 'move' })) return tile;

        for (let radius = 1; radius <= 8; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const candidate = { x: tile.x + dx, y: tile.y + dy };
                    if (this.isFieldPassable({ ...candidate, actorId, intent: 'move' })) return candidate;
                }
            }
        }
        return tile;
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
        this.selectedActorId = actor.id;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
        this.clearActionMode();
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.addCombatLog(`${actor.character.name} 조작`);
        return true;
    }

    private toggleActionMenuForControlled(): void {
        const actor = this.getControlledActor();
        if (!actor) return;
        this.selectedActorId = actor.id;
        this.selectedEnemyId = null;
        this.selectedLootId = null;

        if (actor.id !== this.activeTurnActorId) {
            this.addCombatLog('아직 행동 순서가 아닙니다.');
            return;
        }

        if (this.actionMenuOpen) {
            this.closeActionMenu();
            return;
        }

        this.closeTacticalMenu();
        const available = this.getAvailableTurnActions(actor);
        this.actionMenuOpen = true;
        this.actionMenuUI.open(available);
    }

    private closeActionMenu(): void {
        this.actionMenuOpen = false;
        this.actionMenuUI.close();
    }

    private clearActionMode(): void {
        this.actionMode = null;
        this.actionTiles.clear();
    }

    private getAvailableTurnActions(actor: FieldActor): ActionType[] {
        const available: ActionType[] = ['move', 'attack', 'magic'];
        if (this.hasExecutableInteract(actor)) available.push('open');
        available.push('defend', 'counter', 'rest');
        return available;
    }

    private spendAp(cost: number): boolean {
        if (cost < 0 || this.remainingActionPoints < cost) return false;
        this.remainingActionPoints -= cost;
        return true;
    }

    private resumeOrEndActiveTurn(actor: FieldActor): void {
        if (actor.id !== this.activeTurnActorId) return;
        if (this.hasExecutableAction(actor)) {
            this.reopenActionMenu(actor);
            return;
        }
        this.endActorTurn(actor, '행동력 소진');
    }

    private reopenActionMenu(actor: FieldActor): void {
        if (actor.id !== this.activeTurnActorId) return;
        this.selectedActorId = actor.id;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
        this.closeTacticalMenu();
        this.actionMenuOpen = true;
        this.actionMenuUI.open(this.getAvailableTurnActions(actor));
    }

    private endActorTurn(actor: FieldActor, reason: string, atbCarryover: number = 0): void {
        actor.entity.actionGauge = atbCarryover;
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.reservedAction = null;
        this.clearActorIntent(actor);
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.clearActionMode();
        this.resetMagicState();
        this.addCombatLog(`${actor.character.name} 턴 종료: ${reason}`);
    }

    private endEnemyTurn(enemy: Enemy): void {
        enemy.actionGauge = 0;
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.reservedAction = null;
    }

    private startNextReadyTurn(): void {
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
        this.selectedActorId = actor.id;
        if (!this.processActorTurnStartStatuses(actor)) {
            this.endActorTurn(actor, '상태이상');
            return;
        }
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
        this.addCombatLog(`${actor.character.name} 턴 시작: 행동 ${this.remainingActionPoints}`);
        if (!this.hasExecutableAction(actor)) this.endActorTurn(actor, '가능한 행동 없음');
        else {
            this.actionMenuOpen = true;
            this.closeTacticalMenu();
            this.actionMenuUI.open(this.getAvailableTurnActions(actor));
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

        const aliveActors = this.partyActors.filter((actor) => !actor.character.isDead);
        const closest = this.findClosestActor(this.enemyTile(enemy), aliveActors);
        if (!closest) {
            this.endEnemyTurn(enemy);
            return;
        }

        const enemyTile = this.enemyTile(enemy);
        const distanceToTarget = manhattan(enemyTile, this.actorTile(closest));
        const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
        enemy.isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, leashExceeded);
        if (!enemy.isAggro && this.hasAggroAllyNear(entry, enemy.aiProfile.assistRange)) enemy.isAggro = true;
        if (!enemy.isAggro || this.isEntityMoving(enemy)) {
            this.endEnemyTurn(enemy);
            return;
        }

        enemy.aiMemory.turnCount += 1;
        const decision = decideEnemyAction({
            self: this.toEnemyAIUnit(enemy),
            targets: aliveActors.map((actor) => this.toActorAIUnit(actor)),
            allies: this.fieldEnemies
                .map((candidate) => candidate.enemy)
                .filter((candidate) => candidate.stats.hp > 0)
                .map((candidate) => this.toEnemyAIUnit(candidate)),
            profile: enemy.aiProfile,
            turnCount: enemy.aiMemory.turnCount,
            hasLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to),
        });
        this.executeEnemyDecision(entry, decision);
        this.endEnemyTurn(enemy);
    }

    private executeEnemyDecision(entry: FieldEnemy, decision: EnemyAIDecision): void {
        const enemy = entry.enemy;
        switch (decision.kind) {
            case 'attack': {
                const actor = this.getActorById(decision.targetId);
                if (!actor) return;
                if (this.canEnemyAttackTarget(enemy, actor, decision.range)) {
                    this.enemyAttack(entry, actor, decision.range);
                } else if (!hasStatus(enemy.statuses, 'immobilize')) {
                    this.enemyStepToward(entry, actor, Math.max(1, Math.min(decision.range, enemy.aiProfile.preferredRange)));
                }
                break;
            }
            case 'moveToward': {
                const actor = this.getActorById(decision.targetId);
                if (!actor) return;
                if (hasStatus(enemy.statuses, 'immobilize')) {
                    this.addCombatLog(`${enemy.name}: 이동불가`);
                    this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'ROOT');
                    return;
                }
                this.enemyStepToward(entry, actor, decision.desiredRange);
                break;
            }
            case 'moveAway': {
                const actor = this.getActorById(decision.targetId);
                if (!actor) return;
                if (hasStatus(enemy.statuses, 'immobilize')) {
                    this.addCombatLog(`${enemy.name}: 이동불가`);
                    this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'ROOT');
                    return;
                }
                if (!this.enemyStepAway(entry, actor) && this.canEnemyAttackTarget(enemy, actor, enemy.aiProfile.attackRange)) {
                    this.enemyAttack(entry, actor, enemy.aiProfile.attackRange);
                }
                break;
            }
            case 'healAlly': {
                const ally = this.getEnemyById(decision.allyId);
                if (ally) this.enemyHealAlly(enemy, ally);
                break;
            }
            case 'buffAlly': {
                const ally = this.getEnemyById(decision.allyId);
                if (ally) this.enemyBuffAlly(enemy, ally, decision.status);
                break;
            }
            case 'debuffTarget': {
                const actor = this.getActorById(decision.targetId);
                if (actor) this.enemyDebuffActor(enemy, actor, decision.status);
                break;
            }
            case 'guard':
                enemy.statuses = applyStatus(enemy.statuses, createStatus('guard'));
                this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'GUARD');
                this.effectManager.spawnBuffEffect(enemy.gridX, enemy.gridY);
                this.addCombatLog(`${enemy.name}: 방어 태세`);
                break;
            case 'bossPattern':
                this.executeBossPattern(entry, decision.pattern, decision.targetId);
                break;
            case 'wait':
                this.addCombatLog(`${enemy.name}: 대기`);
                break;
        }
    }

    private enemyHealAlly(caster: Enemy, ally: Enemy): void {
        const stats = getEffectiveStatsForEnemy(caster);
        const amount = Math.max(8, Math.floor(stats.magAtk * 2 + caster.level * 2));
        const before = ally.stats.hp;
        ally.stats.hp = Math.min(ally.stats.maxHp, ally.stats.hp + amount);
        const healed = ally.stats.hp - before;
        if (healed <= 0) return;
        this.floatingText.spawnHeal(ally.gridX, ally.gridY, healed);
        this.effectManager.spawnHealEffect(ally.gridX, ally.gridY);
        this.addCombatLog(`${caster.name} → ${ally.name} ${healed} 회복`);
    }

    private enemyBuffAlly(caster: Enemy, ally: Enemy, status: StatusKind): void {
        ally.statuses = applyStatus(ally.statuses, createStatus(status));
        this.floatingText.spawnStatus(ally.gridX, ally.gridY, 'BUFF');
        this.effectManager.spawnBuffEffect(ally.gridX, ally.gridY);
        this.addCombatLog(`${caster.name} → ${ally.name} 강화`);
    }

    private enemyDebuffActor(caster: Enemy, actor: FieldActor, status: StatusKind): void {
        actor.character.statuses = applyStatus(actor.character.statuses, createStatus(status));
        this.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'WEAK');
        this.effectManager.spawnDebuffEffect(actor.entity.gridX, actor.entity.gridY);
        this.addCombatLog(`${caster.name} → ${actor.character.name} 약화`);
    }

    private executeBossPattern(entry: FieldEnemy, pattern: BossPattern, targetId: string): void {
        const enemy = entry.enemy;
        const target = this.getActorById(targetId);
        if (!target) return;

        switch (pattern) {
            case 'enrage':
                enemy.statuses = applyStatus(enemy.statuses, createStatus('allUp', { durationTurns: 4, magnitude: 1.3 }));
                this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'ENRAGE');
                this.effectManager.spawnDarkEffect(enemy.gridX, enemy.gridY);
                this.addCombatLog(`${enemy.name}: 광폭화`);
                return;
            case 'darkPulse': {
                this.effectManager.spawnDarkEffect(enemy.gridX, enemy.gridY);
                const victims = this.partyActors.filter((actor) =>
                    !actor.character.isDead && manhattan(this.enemyTile(enemy), this.actorTile(actor)) <= 2
                );
                if (victims.length === 0) {
                    this.enemyStepToward(entry, target, 2);
                    return;
                }
                this.addCombatLog(`${enemy.name}: 암흑 파동 (${victims.length}명)`);
                for (const victim of victims) this.enemySpellDamage(enemy, victim, 0.7, 'dark');
                return;
            }
            case 'cleave': {
                const victims = this.partyActors.filter((actor) =>
                    !actor.character.isDead && manhattan(this.enemyTile(enemy), this.actorTile(actor)) <= 1
                );
                this.addCombatLog(`${enemy.name}: 휩쓸기`);
                for (const victim of victims) this.enemyAttack(entry, victim, 1);
                return;
            }
            case 'voidBolt':
                this.addCombatLog(`${enemy.name}: 공허 탄환`);
                this.spawnAttackCue(this.enemyTile(enemy), this.actorTile(target), '#b86cff', 'BOLT');
                this.enemySpellDamage(enemy, target, 1, 'dark');
                return;
        }
    }

    private enemySpellDamage(enemy: Enemy, actor: FieldActor, power: number, element: 'dark' | 'fire' | 'ice' | 'lightning' | 'wind' | 'earth'): void {
        const attacker = getEffectiveStatsForEnemy(enemy);
        const defender = getEffectiveStatsForCharacter(actor.character);
        const baseDamage = Math.max(1, Math.floor((attacker.magAtk * 1.5 - defender.magDef * 0.6) * power));
        const guarded = applyGuardToDamage(actor.character.statuses, baseDamage);
        actor.character.statuses = guarded.statuses;
        const damage = guarded.damage;
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - damage);
        this.effectManager.spawnByElement(element, actor.entity.gridX, actor.entity.gridY);
        this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, damage, false, false);
        this.addCombatLog(`${enemy.name} → ${actor.character.name} ${damage} 마법 피해`);
        if (actor.character.stats.hp <= 0 && !actor.character.isDead) this.handleActorDown(actor);
    }

    private getActorById(actorId: string): FieldActor | null {
        return this.partyActors.find((actor) => actor.id === actorId && !actor.character.isDead) ?? null;
    }

    private toEnemyAIUnit(enemy: Enemy): EnemyAIUnit {
        return {
            id: enemy.id,
            name: enemy.name,
            tile: this.enemyTile(enemy),
            hp: enemy.stats.hp,
            maxHp: enemy.stats.maxHp,
            role: enemy.role,
            isBoss: enemy.isBoss,
            isAggro: enemy.isAggro,
            statusKinds: enemy.statuses.map((status) => status.kind),
        };
    }

    private toActorAIUnit(actor: FieldActor): EnemyAIUnit {
        return {
            id: actor.id,
            name: actor.character.name,
            tile: this.actorTile(actor),
            hp: actor.character.stats.hp,
            maxHp: actor.character.stats.maxHp,
            statusKinds: actor.character.statuses.map((status) => status.kind),
        };
    }

    private canEnemyAttackTarget(enemy: Enemy, actor: FieldActor, range: number): boolean {
        const distance = manhattan(this.enemyTile(enemy), this.actorTile(actor));
        if (distance > range) return false;
        return range <= 1 || this.hasFieldLineOfSight(this.enemyTile(enemy), this.actorTile(actor));
    }

    private hasAggroAllyNear(entry: FieldEnemy, range: number): boolean {
        const selfTile = this.enemyTile(entry.enemy);
        return this.fieldEnemies.some((candidate) =>
            candidate.enemy.id !== entry.enemy.id &&
            candidate.enemy.stats.hp > 0 &&
            candidate.enemy.isAggro &&
            manhattan(selfTile, this.enemyTile(candidate.enemy)) <= range
        );
    }

    private findClosestActor(point: TilePoint, actors: FieldActor[]): FieldActor | null {
        let closest: FieldActor | null = null;
        let closestDist = Infinity;
        for (const actor of actors) {
            const distance = manhattan(point, this.actorTile(actor));
            if (distance < closestDist) {
                closest = actor;
                closestDist = distance;
            }
        }
        return closest;
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

    private getSkillCandidateEnemies(skill: Skill, targetEnemy?: Enemy): Enemy[] {
        const alive = this.fieldEnemies
            .map((entry) => entry.enemy)
            .filter((enemy) => enemy.stats.hp > 0);
        if (!targetEnemy) return alive;

        const actor = this.getActivePartyTurnActor();
        if (!actor) return [targetEnemy];
        const profile = getSkillAttackProfile(skill);
        return resolveSkillCandidateEnemies(alive, profile, this.getPatternContext(actor, this.enemyTile(targetEnemy)), targetEnemy);
    }

    private getSkillTerrainContext(actor: FieldActor, targetEnemies: Enemy[], targetEnemy?: Enemy): SkillTerrainContext {
        return buildSkillTerrainContext({
            casterTile: this.actorTile(actor),
            targetEnemies,
            targetEnemy,
            getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
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

    private isInputLockedByReservation(): boolean {
        const actor = this.getActivePartyTurnActor();
        return Boolean(this.reservedAction && actor && (actor.path.length > 0 || this.isEntityMoving(actor.entity)));
    }

    private getWorldInteractionMode(): WorldInteractionMode {
        if (this.isInputLockedByReservation()) return { kind: 'reservedAction' };
        if (this.tacticalMenuUI.getIsOpen()) return { kind: 'tacticalMenu' };
        if (this.fieldMagicState.mode === 'targeting') return { kind: 'magicTargeting' };
        if (this.actionMode) return { kind: 'actionTargeting', action: this.actionMode };
        if (this.actionMenuOpen) return { kind: 'actionMenu' };
        return { kind: 'idle' };
    }

    private updateTacticalMarkers(dt: number): void {
        this.tacticalMarkers.update(dt, (targetKey) => this.resolveTacticalMarkerTile(targetKey));
    }

    private resolveTacticalMarkerTile(targetKey: string): TilePoint | null {
        const separator = targetKey.indexOf(':');
        if (separator < 0) return null;
        const kind = targetKey.slice(0, separator);
        const id = targetKey.slice(separator + 1);

        if (kind === 'enemy') {
            const enemy = this.getEnemyById(id);
            return enemy && enemy.stats.hp > 0 ? this.enemyTile(enemy) : null;
        }

        if (kind === 'loot') {
            const loot = this.worldMap.loot.find((candidate) => candidate.id === id && !candidate.opened);
            return loot ? { x: loot.x, y: loot.y } : null;
        }

        if (kind === 'party') {
            const actor = this.partyActors.find((candidate) => candidate.id === id && !candidate.character.isDead);
            return actor ? this.actorTile(actor) : null;
        }

        return null;
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
        this.selectedActorId = actor?.id ?? null;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
        this.closeActionMenu();
        this.closeTacticalMenu();
        this.clearActionMode();
        this.resetMagicState();
    }

    private clearActorIntent(actor: FieldActor): void {
        actor.path = [];
        actor.queuedIntent = null;
    }

    private clearControlledPath(): void {
        const actor = this.getControlledActor();
        if (actor) actor.path = [];
    }

    private clearSelection(): void {
        this.selectedActorId = null;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
    }

    private hasSelection(): boolean {
        return Boolean(this.selectedActorId || this.selectedEnemyId || this.selectedLootId);
    }

    private hasExecutableAction(actor: FieldActor): boolean {
        const hasApAction = hasExecutableFieldAction({
            remainingAp: this.remainingActionPoints,
            hasReachableMove: this.hasExecutableMove(actor),
            hasAttackTarget: this.hasExecutableAttack(actor),
            hasInteractTarget: this.hasExecutableInteract(actor),
            hasMagicAvailable: this.hasExecutableMagic(actor),
        });
        return hasApAction || this.remainingActionPoints > 0;
    }

    private hasExecutableMove(actor: FieldActor): boolean {
        if (hasStatus(actor.character.statuses, 'immobilize')) return false;
        return this.remainingActionPoints >= MOVE_AP_PER_TILE && this.computeWalkableTiles(actor).size > 0;
    }

    private hasExecutableAttack(actor: FieldActor): boolean {
        if (this.remainingActionPoints < ATTACK_AP_COST) return false;
        return this.fieldEnemies.some((entry) =>
            entry.enemy.stats.hp > 0 && this.canActorAttackTarget(actor, entry.enemy)
        );
    }

    private hasExecutableInteract(actor: FieldActor): boolean {
        return this.remainingActionPoints >= INTERACT_AP_COST && this.hasAdjacentLoot(actor);
    }

    private hasExecutableMagic(actor: FieldActor): boolean {
        if (hasStatus(actor.character.statuses, 'silence')) return false;
        return this.remainingActionPoints >= MAGIC_AP_COST && this.hasCastableFieldSkill(actor.character);
    }

    private computeWalkableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        const movementBudget = this.getActorTerrainMovementBudget(actor);
        const maxCost = Math.min(
            movementBudget,
            this.remainingActionPoints / MOVE_AP_PER_TILE
        );
        if (maxCost <= 0) return result;

        const reachable = findReachableTilesByCost(
            start,
            (query) => this.isFieldPassable(query),
            (tile) => this.getActorTerrainStepCost(actor, tile),
            maxCost,
            { actorId: actor.id, intent: 'move', maxNodes: 8000 }
        );

        for (const [key, reachableTile] of reachable) {
            if (
                reachableTile.cost <= movementBudget + 1e-9 &&
                canAffordTerrainCost(reachableTile.cost, this.remainingActionPoints)
            ) {
                result.add(key);
            }
        }

        return result;
    }

    private computeAttackableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const profile = this.getActorAttackProfile(actor);
        for (const tile of getSelectableTiles(profile, this.getPatternContext(actor))) {
            result.add(tileKey(tile.x, tile.y));
        }
        return result;
    }

    private computeInteractTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        for (const tile of tilesInRange(start, 1)) {
            if (tile.x === start.x && tile.y === start.y) continue;
            result.add(`${tile.x},${tile.y}`);
        }
        return result;
    }

    private hasAdjacentLoot(actor: FieldActor): boolean {
        const actorTile = this.actorTile(actor);
        return this.worldMap.loot.some((loot) =>
            !loot.opened && manhattan(actorTile, { x: loot.x, y: loot.y }) <= 1
        );
    }

    private addCombatLog(message: string): void {
        this.combatLog.push(message);
        if (this.combatLog.length > 7) this.combatLog.shift();
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

    private renderActionMenu(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const actor = this.getControlledActor();
        if (!actor || actor.character.isDead) return;

        const px = actor.entity.pixelX * TILE_SIZE - camX;
        const py = actor.entity.pixelY * TILE_SIZE - camY;
        const ready = actor.entity.actionGauge >= 100;
        if (this.actionMenuOpen) {
            this.actionMenuUI.render(ctx, px, py, ready);
        } else if (ready) {
            this.actionMenuUI.renderReadyIndicator(ctx, px, py);
        }
    }

    private getSelectedDisplayInfo(): EntityDisplayInfo | null {
        if (this.selectedActorId) {
            const actor = this.partyActors.find((candidate) => candidate.id === this.selectedActorId);
            if (!actor) return null;
            const stats = getEffectiveStatsForCharacter(actor.character);
            return {
                name: actor.character.name,
                className: actor.character.getTierName(),
                level: actor.character.level,
                hp: stats.hp,
                maxHp: stats.maxHp,
                mp: stats.mp,
                maxMp: stats.maxMp,
                actionGauge: actor.entity.actionGauge,
                exp: actor.character.exp,
                maxExp: actor.character.expToNext,
                buffs: getStatusIcons(actor.character.statuses),
                atk: stats.atk,
                def: stats.def,
                magAtk: stats.magAtk,
                magDef: stats.magDef,
                spriteColor: actor.entity.color,
                spriteImage: actor.character.portraitImage,
            };
        }

        if (this.selectedEnemyId) {
            const enemy = this.getEnemyById(this.selectedEnemyId);
            if (!enemy) return null;
            const stats = getEffectiveStatsForEnemy(enemy);
            return {
                name: enemy.name || enemy.label,
                className: getEnemyRoleLabel(enemy.role),
                level: enemy.level,
                hp: enemy.stats.hp,
                maxHp: enemy.stats.maxHp,
                mp: enemy.stats.mp,
                maxMp: enemy.stats.maxMp,
                actionGauge: enemy.actionGauge,
                buffs: getStatusIcons(enemy.statuses),
                atk: stats.atk,
                def: stats.def,
                magAtk: stats.magAtk,
                magDef: stats.magDef,
                spriteColor: enemy.color,
                spriteImage: enemy.image,
            };
        }

        return null;
    }

}
