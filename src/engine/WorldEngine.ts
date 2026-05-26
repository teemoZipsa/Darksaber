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
import { CombatFormulas } from '../combat/CombatFormulas';
import { resolveSkillEffect, SkillEffectEnemyInput, SkillEffectResult, SkillTerrainContext } from '../combat/SkillEffectResolver';
import {
    applyGuardToDamage,
    applyStatus,
    applyStatuses,
    cleanseNegativeStatuses,
    consumeStatus,
    createStatus,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    getStatusIcons,
    hasStatus,
    resolveTurnStartStatuses,
    type StatusKind,
} from '../combat/StatusEffects';
import { UI, renderGameTitle, Parchment, drawParchmentPanel, drawGlassPanel } from '../ui/UITheme';
import { ActionMenuUI, ActionType } from '../ui/ActionMenuUI';
import { EntityDisplayInfo, EntityInfoUI } from '../ui/EntityInfoUI';
import { MagicUI } from '../ui/MagicUI';
import { TacticalContextMenuUI } from '../ui/TacticalContextMenuUI';
import { EffectManager } from '../ui/EffectManager';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { TileType } from '../map/Tile';
import { FieldPassableQuery, TilePoint, findPathToAny, findPathWithCost, findReachableTilesByCost, manhattan, tileKey, tilesInRange } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import {
    TacticalMarkerStore,
    buildTacticalMenuItems,
    makeTacticalTargetKey,
    type TacticalCommand,
    type TacticalMarker,
    type TacticalTargetRef,
} from '../field/TacticalMarkers';
import { getRightClickDisposition, type WorldInteractionMode } from '../field/WorldInteractionMode';
import { advanceAtb, resolveAggroState } from '../field/FieldCombat';
import { decideEnemyAction, type BossPattern, type EnemyAIDecision, type EnemyAIUnit, type EnemyRole } from '../field/EnemyAI';
import { ATTACK_AP_COST, INTERACT_AP_COST, MAGIC_AP_COST, MOVE_AP_PER_TILE, enqueueReadyActor, getWaitAtbCarryover, hasExecutableFieldAction } from '../field/FieldActionEconomy';
import { hasLineOfSight } from '../field/LineOfSight';
import {
    AttackPatternProfile,
    PatternContext,
    getEffectTiles,
    getSelectDistance,
    getSelectableTiles,
    isSelectableTile,
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

interface FieldIntent {
    kind: 'move' | 'attack' | 'interact' | 'magic' | 'rest' | 'wait' | 'defend' | 'counter';
    tile?: TilePoint;
    path?: TilePoint[];
    enemyId?: string;
    lootId?: string;
    skillId?: string;
    targetEnemyId?: string;
    apCost?: number;
    pathCost?: number;
}

interface FieldActor {
    id: string;
    character: Character;
    entity: Player;
    path: TilePoint[];
    queuedIntent: FieldIntent | null;
}

interface FieldEnemy {
    enemy: Enemy;
    home: TilePoint;
    path: TilePoint[];
}

type FieldHitParty = FieldActor & { gridX: number; gridY: number };

type FieldMagicState =
    | { mode: 'idle' }
    | { mode: 'menu' }
    | { mode: 'targeting'; skill: Skill; validTiles: Set<string>; hoverAoeTiles: Set<string> };

interface AttackCue {
    from: TilePoint;
    to: TilePoint;
    timer: number;
    duration: number;
    color: string;
    label?: string;
}

const ACTOR_COLORS = ['#00e5ff', '#ff4fd8', '#ffd447'];
const FORMATION_OFFSETS: TilePoint[] = [
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
];
const FIELD_ATB_SCALE = 10;
const ENEMY_AGGRO_RANGE = 6;
const ENEMY_EXIT_RANGE = 10;
const ENEMY_LEASH_RANGE = 16;
const MOVEMENT_REPATH_INTERVAL = 0.35;
const ENEMY_ROLE_GLYPHS: Record<EnemyRole, string> = {
    bruiser: 'M',
    tank: 'T',
    archer: 'R',
    healer: '+',
    coward: '!',
    support: 'S',
    boss: 'B',
};

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

        this.spawnPartyAtCentralTown();
        this.player = this.getControlledActor()?.entity ?? new Player(0, 0);
        this.selectedActorId = this.getControlledActor()?.id ?? null;
        this.spawnStarterFieldContent();
        this.magicUI.onSkillSelect = (skill: Skill) => this.handleMagicSkillSelect(skill);

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.snapToTarget();
        this.addCombatLog('월드 필드 진입. 클릭으로 이동합니다.');
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.worldTime += dt;
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

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update();
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();

        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

        const viewW = width / camera.zoom;
        const viewH = height / camera.zoom;
        this.worldMap.updateLoadedChunks(this.player.pixelX * TILE_SIZE, this.player.pixelY * TILE_SIZE);
        this.worldMap.render(ctx, camX, camY, viewW, viewH);

        this.renderActionTiles(ctx, camX, camY);
        this.renderMagicTargetTiles(ctx, camX, camY);
        this.renderPathPreview(ctx, camX, camY);
        this.renderTacticalMarkers(ctx, camX, camY);
        this.renderSelectedLoot(ctx, camX, camY);
        this.renderEnemies(ctx, camX, camY);
        this.renderPartyActors(ctx, camX, camY);
        this.renderAttackCues(ctx, camX, camY);
        this.effectManager.render(ctx, camera);
        this.floatingText.render(ctx, camX, camY);
        this.renderHoverTile(ctx, camX, camY);
        this.renderActionMenu(ctx, camX, camY);

        ctx.restore();

        ctx.save();
        ctx.scale(scale, scale);
        this.renderHud(ctx, Math.floor(width / scale), Math.floor(height / scale));
        ctx.restore();
    }

    private spawnPartyAtCentralTown(): void {
        const towns = this.worldMap.getTowns();
        const centralTown = towns.find((town) => town.id === 'central_castle') ?? towns[0];
        const spawn = this.worldMap.getTownSpawnTile(centralTown);
        const members = this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);

        this.partyActors = members.map((character, index) => {
            const tile = this.findNearbyWalkableTile({
                x: spawn.x + (FORMATION_OFFSETS[index]?.x ?? 0),
                y: spawn.y + (FORMATION_OFFSETS[index]?.y ?? 0),
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
                actor.character.stats.hp = Math.min(actor.character.stats.maxHp, actor.character.stats.hp + 5);
                actor.character.stats.mp = Math.min(actor.character.stats.maxMp, actor.character.stats.mp + 3);
                this.floatingText.spawnHeal(actor.entity.gridX, actor.entity.gridY, 5);
                this.effectManager.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
                this.addCombatLog('휴식: HP +5, MP +3 회복');
                this.endActorTurn(actor, '휴식');
                break;
            case 'wait':
                this.addCombatLog('대기: 다음 행동 게이지 일부 보존');
                this.endActorTurn(actor, '대기', this.getWaitCarryover(actor));
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
                    this.addCombatLog(this.getAttackFailureMessage(failure));
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
        this.magicUI.show(
            actor.character.classLineId,
            actor.character.currentTier,
            actor.character.stats.mp,
            actor.character.stats.maxMp,
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
        actor.character.stats.mp = Math.max(0, Math.min(actor.character.stats.maxMp, actor.character.stats.mp + effect.casterMpDelta));
        actor.character.stats.hp = Math.max(0, Math.min(actor.character.stats.maxHp, actor.character.stats.hp + effect.casterHpDelta));
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

    private tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        const start = this.actorTile(actor);
        if (!this.canActorAttackTarget(actor, enemy)) return false;
        if (actor.entity.actionGauge < 100) return false;
        const profile = this.getActorAttackProfile(actor);
        const targetEnemies = this.getAttackPatternTargetEnemies(actor, enemy);
        if (targetEnemies.length === 0) return false;

        actor.entity.facing = this.directionFromTo(start, this.enemyTile(enemy));
        this.spawnAttackCue(start, this.enemyTile(enemy), '#72e8ff');

        let counterTriggered = false;
        for (const target of targetEnemies) {
            const targetTile = this.enemyTile(target);
            const isRanged = manhattan(start, targetTile) > 1;
            const result = CombatFormulas.calcPhysicalDamage(
                actor.character.getCombatStats(),
                getEffectiveStatsForEnemy(target),
                this.worldMap.getTileAt(target.gridX, target.gridY),
                { isRanged }
            );
            const dirBonus = CombatFormulas.getDirectionalMultiplier(
                actor.entity.gridX,
                actor.entity.gridY,
                target.gridX,
                target.gridY,
                target.facing
            );
            if (!result.isMiss) {
                result.damage = Math.max(1, Math.floor(result.damage * dirBonus.multiplier));
                if (profile.damageMultiplier !== undefined) {
                    result.damage = Math.max(1, Math.floor(result.damage * profile.damageMultiplier));
                }
            }

            if (result.isMiss) {
                this.floatingText.spawnDamage(target.gridX, target.gridY, 0, false, true);
                this.addCombatLog(`${actor.character.name} 명중 실패: ${target.name} (${Math.floor(result.hitChance ?? 0)}%)`);
                continue;
            }

            const guarded = applyGuardToDamage(target.statuses, result.damage);
            target.statuses = guarded.statuses;
            const dealtDamage = guarded.damage;
            const dead = target.takeDamage(dealtDamage);
            this.floatingText.spawnDamage(target.gridX, target.gridY, dealtDamage, result.isCrit, false);
            this.effectManager.spawnHitEffect(target.gridX, target.gridY, result.isCrit);
            const critText = result.isCrit ? ' 치명' : '';
            const dirText = dirBonus.label ? ` ${dirBonus.label}` : '';
            this.addCombatLog(`${actor.character.name} → ${target.name} ${dealtDamage} 피해${critText}${dirText}`);
            if (guarded.guarded) this.addCombatLog(`${target.name} 방어: 피해 감소`);
            this.logPhysicalTerrainEffect(result);

            if (dead) this.handleEnemyDefeated(actor, target);
            else if (!guarded.guarded && !counterTriggered && this.tryEnemyCounterAttack(target, actor)) counterTriggered = true;
        }
        return true;
    }

    private enemyAttack(entry: FieldEnemy, actor: FieldActor, range: number = 1): void {
        const enemy = entry.enemy;
        if (!this.canEnemyAttackTarget(enemy, actor, range)) return;
        const result = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(enemy),
            getEffectiveStatsForCharacter(actor.character),
            this.worldMap.getTileAt(actor.entity.gridX, actor.entity.gridY),
            { defenderTraits: this.getActorTerrainTraits(actor), isRanged: range > 1 }
        );
        enemy.actionGauge = 0;
        enemy.facing = this.directionFromTo(this.enemyTile(enemy), this.actorTile(actor));
        this.spawnAttackCue(this.enemyTile(enemy), this.actorTile(actor), enemy.isBoss ? '#ff4ea3' : '#ff8a55');

        if (result.isMiss) {
            this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, 0, false, true);
            this.addCombatLog(`${enemy.name} 명중 실패: ${actor.character.name} (${Math.floor(result.hitChance ?? 0)}%)`);
            return;
        }

        const guarded = applyGuardToDamage(actor.character.statuses, result.damage);
        actor.character.statuses = guarded.statuses;
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - guarded.damage);
        this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, guarded.damage, result.isCrit, false);
        this.effectManager.spawnHitEffect(actor.entity.gridX, actor.entity.gridY, result.isCrit);
        this.addCombatLog(`${enemy.name} → ${actor.character.name} ${guarded.damage} 피해${result.isCrit ? ' 치명' : ''}`);
        if (guarded.guarded) this.addCombatLog(`${actor.character.name} 방어: 피해 감소`);
        this.logPhysicalTerrainEffect(result);

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            this.handleActorDown(actor);
            return;
        }
        if (!guarded.guarded) this.tryActorCounterAttack(actor, enemy);
    }

    private tryActorCounterAttack(actor: FieldActor, enemy: Enemy): boolean {
        const consumed = consumeStatus(actor.character.statuses, 'counterReady');
        if (!consumed.consumed) return false;
        actor.character.statuses = consumed.statuses;
        if (actor.character.isDead || actor.character.stats.hp <= 0 || enemy.stats.hp <= 0) return false;
        if (!this.canActorAttackTarget(actor, enemy)) {
            this.addCombatLog(`${actor.character.name} 반격 실패: 사거리 밖`);
            return false;
        }

        const result = CombatFormulas.calcPhysicalDamage(
            actor.character.getCombatStats(),
            getEffectiveStatsForEnemy(enemy),
            this.worldMap.getTileAt(enemy.gridX, enemy.gridY),
            { isRanged: manhattan(this.actorTile(actor), this.enemyTile(enemy)) > 1 }
        );
        if (result.isMiss) {
            this.floatingText.spawnDamage(enemy.gridX, enemy.gridY, 0, false, true);
            this.addCombatLog(`${actor.character.name} 반격 빗나감: ${enemy.name}`);
            return true;
        }

        const damage = Math.max(1, Math.floor(result.damage * (consumed.consumed.magnitude || 0.75)));
        const dead = enemy.takeDamage(damage);
        this.spawnAttackCue(this.actorTile(actor), this.enemyTile(enemy), '#9ff6ff');
        this.floatingText.spawnDamage(enemy.gridX, enemy.gridY, damage, result.isCrit, false);
        this.effectManager.spawnHitEffect(enemy.gridX, enemy.gridY, result.isCrit);
        this.addCombatLog(`${actor.character.name} 반격 → ${enemy.name} ${damage} 피해`);
        if (dead) this.handleEnemyDefeated(actor, enemy);
        return true;
    }

    private tryEnemyCounterAttack(enemy: Enemy, actor: FieldActor): boolean {
        const consumed = consumeStatus(enemy.statuses, 'counterReady');
        if (!consumed.consumed) return false;
        enemy.statuses = consumed.statuses;
        if (enemy.stats.hp <= 0 || actor.character.isDead || actor.character.stats.hp <= 0) return false;
        if (manhattan(this.enemyTile(enemy), this.actorTile(actor)) > 1) {
            this.addCombatLog(`${enemy.name} 반격 실패: 사거리 밖`);
            return false;
        }

        const result = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(enemy),
            getEffectiveStatsForCharacter(actor.character),
            this.worldMap.getTileAt(actor.entity.gridX, actor.entity.gridY),
            { defenderTraits: this.getActorTerrainTraits(actor) }
        );
        if (result.isMiss) {
            this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, 0, false, true);
            this.addCombatLog(`${enemy.name} 반격 빗나감`);
            return true;
        }

        const damage = Math.max(1, Math.floor(result.damage * (consumed.consumed.magnitude || 0.75)));
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - damage);
        this.spawnAttackCue(this.enemyTile(enemy), this.actorTile(actor), '#ff9b66');
        this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, damage, result.isCrit, false);
        this.effectManager.spawnHitEffect(actor.entity.gridX, actor.entity.gridY, result.isCrit);
        this.addCombatLog(`${enemy.name} 반격 → ${actor.character.name} ${damage} 피해`);
        if (actor.character.stats.hp <= 0 && !actor.character.isDead) this.handleActorDown(actor);
        return true;
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
        this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
        this.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
        actor.character.gainExp(enemy.expReward);
        enemy.isAggro = false;
        if (this.selectedEnemyId === enemy.id) this.selectedEnemyId = null;

        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (herb) {
            const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, [herb], {
                sourceLabel: `${enemy.name} 전리품`,
                kind: 'corpse',
            });
            this.worldMap.loot.push(loot);
        }
    }

    private handleActorDown(actor: FieldActor): void {
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
        available.push('defend', 'counter', 'rest', 'wait');
        return available;
    }

    private spendAp(cost: number): boolean {
        if (cost < 0 || this.remainingActionPoints < cost) return false;
        this.remainingActionPoints -= cost;
        return true;
    }

    private getWaitCarryover(actor: FieldActor): number {
        return getWaitAtbCarryover(this.remainingActionPoints, actor.character.stats.actionLimit || 1);
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
        const result = resolveTurnStartStatuses(actor.character.stats, actor.character.statuses);
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
        actor.character.stats.hp = Math.max(0, Math.min(actor.character.stats.maxHp, actor.character.stats.hp + result.hpDelta));

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            this.handleActorDown(actor);
            return false;
        }
        return true;
    }

    private processEnemyTurnStartStatuses(entry: FieldEnemy): boolean {
        const enemy = entry.enemy;
        const result = resolveTurnStartStatuses(enemy.stats, enemy.statuses);
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
        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - baseDamage);
        this.effectManager.spawnByElement(element, actor.entity.gridX, actor.entity.gridY);
        this.floatingText.spawnDamage(actor.entity.gridX, actor.entity.gridY, baseDamage, false, false);
        this.addCombatLog(`${enemy.name} → ${actor.character.name} ${baseDamage} 마법 피해`);
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

    private getActorAttackTargetFailure(actor: FieldActor, enemy: Enemy): 'tooClose' | 'blocked' | 'outOfRange' | null {
        const profile = this.getActorAttackProfile(actor);
        const target = this.enemyTile(enemy);
        const context = this.getPatternContext(actor);
        if (isSelectableTile(profile, context, target)) {
            const effectTileKeys = new Set(
                getEffectTiles(profile, this.getPatternContext(actor, target)).map((tile) => tileKey(tile.x, tile.y))
            );
            return effectTileKeys.has(tileKey(target.x, target.y)) ? null : 'blocked';
        }
        if (this.isAttackTargetTooClose(profile, this.actorTile(actor), target)) return 'tooClose';
        if (isSelectableTile(profile, context, target, { ignoreLineOfSight: true })) return 'blocked';
        return 'outOfRange';
    }

    private getAttackFailureMessage(failure: 'tooClose' | 'blocked' | 'outOfRange'): string {
        switch (failure) {
            case 'tooClose': return '너무 가까운 대상입니다.';
            case 'blocked': return '공격 경로가 막혔습니다.';
            case 'outOfRange': return '공격 사거리 밖입니다.';
        }
    }

    private isAttackTargetTooClose(profile: AttackPatternProfile, from: TilePoint, to: TilePoint): boolean {
        const minRange = profile.select.minRange ?? 1;
        if (minRange <= 1) return false;
        if (profile.select.kind === 'orthogonalLine' && from.x !== to.x && from.y !== to.y) return false;
        const distance = getSelectDistance(profile.select, from, to);
        return distance > 0 && distance < minRange;
    }

    private getSkillCandidateEnemies(skill: Skill, targetEnemy?: Enemy): Enemy[] {
        const alive = this.fieldEnemies
            .map((entry) => entry.enemy)
            .filter((enemy) => enemy.stats.hp > 0);
        if (!targetEnemy) return alive;

        const actor = this.getActivePartyTurnActor();
        if (!actor) return [targetEnemy];
        const profile = getSkillAttackProfile(skill);
        const effectTileKeys = new Set(
            getEffectTiles(profile, this.getPatternContext(actor, this.enemyTile(targetEnemy)))
                .map((tile) => tileKey(tile.x, tile.y))
        );
        return alive.filter((enemy) => effectTileKeys.has(tileKey(enemy.gridX, enemy.gridY)));
    }

    private getSkillTerrainContext(actor: FieldActor, targetEnemies: Enemy[], targetEnemy?: Enemy): SkillTerrainContext {
        const targetTiles: Record<string, TileType> = {};
        for (const enemy of targetEnemies) {
            targetTiles[enemy.id] = this.worldMap.getTileAt(enemy.gridX, enemy.gridY);
        }
        return {
            casterTile: this.worldMap.getTileAt(actor.entity.gridX, actor.entity.gridY),
            impactTile: targetEnemy ? this.worldMap.getTileAt(targetEnemy.gridX, targetEnemy.gridY) : undefined,
            targetTiles,
        };
    }

    private logPhysicalTerrainEffect(result: { terrainMultiplier?: number; hitChance?: number }): void {
        const notes: string[] = [];
        if (result.terrainMultiplier !== undefined && result.terrainMultiplier < 0.999) {
            notes.push(`피해 -${Math.round((1 - result.terrainMultiplier) * 100)}%`);
        }
        if (notes.length > 0) this.addCombatLog(`지형 효과: ${notes.join(', ')}`);
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

    private renderPathPreview(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const actor = this.getControlledActor();
        if (!actor || actor.path.length === 0) return;

        ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
        actor.path.forEach((tile, index) => {
            ctx.fillRect(tile.x * TILE_SIZE - camX + 8, tile.y * TILE_SIZE - camY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
            const pulse = 0.55 + 0.45 * Math.sin(this.worldTime * 8 - index * 0.8);
            ctx.fillStyle = `rgba(180, 245, 255, ${0.35 + pulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(
                tile.x * TILE_SIZE - camX + TILE_SIZE / 2,
                tile.y * TILE_SIZE - camY + TILE_SIZE / 2,
                3 + pulse * 2,
                0,
                Math.PI * 2
            );
            ctx.fill();
            ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
        });
    }

    private renderTacticalMarkers(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const markers = this.tacticalMarkers.getMarkers();
        if (markers.length === 0) return;

        ctx.save();
        for (const marker of markers) {
            const sx = marker.tile.x * TILE_SIZE - camX;
            const sy = marker.tile.y * TILE_SIZE - camY;
            const cx = sx + TILE_SIZE / 2;
            const cy = sy + TILE_SIZE / 2;
            const pulse = 0.5 + 0.5 * Math.sin(this.worldTime * 7);
            const color = this.getTacticalMarkerColor(marker);
            const alpha = marker.kind === 'ping'
                ? Math.max(0.2, Math.min(1, marker.ttl / 3))
                : Math.max(0.45, Math.min(1, marker.ttl / 30));

            ctx.globalAlpha = alpha;
            ctx.lineWidth = 2;

            if (marker.kind === 'rally') {
                ctx.strokeStyle = color;
                ctx.fillStyle = 'rgba(40, 245, 150, 0.18)';
                ctx.beginPath();
                ctx.moveTo(cx, sy + 6);
                ctx.lineTo(sx + TILE_SIZE - 7, cy);
                ctx.lineTo(cx, sy + TILE_SIZE - 6);
                ctx.lineTo(sx + 7, cy);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx, sy + 10);
                ctx.lineTo(cx, sy + TILE_SIZE - 8);
                ctx.stroke();
            } else if (marker.kind === 'watch') {
                const r = 12 + pulse * 3;
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx - 5, cy);
                ctx.lineTo(cx + 5, cy);
                ctx.moveTo(cx, cy - 5);
                ctx.lineTo(cx, cy + 5);
                ctx.stroke();
            } else {
                const r = 8 + pulse * 7;
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx - r - 3, cy);
                ctx.lineTo(cx - r + 5, cy);
                ctx.moveTo(cx + r - 5, cy);
                ctx.lineTo(cx + r + 3, cy);
                ctx.moveTo(cx, cy - r - 3);
                ctx.lineTo(cx, cy - r + 5);
                ctx.moveTo(cx, cy + r - 5);
                ctx.lineTo(cx, cy + r + 3);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    private getTacticalMarkerColor(marker: TacticalMarker): string {
        if (marker.kind === 'rally') return 'rgba(80, 255, 160, 0.95)';
        if (marker.targetKind === 'enemy') return 'rgba(255, 78, 78, 0.95)';
        if (marker.targetKind === 'loot') return 'rgba(255, 220, 74, 0.95)';
        if (marker.targetKind === 'party') return 'rgba(82, 246, 255, 0.95)';
        if (marker.targetKind === 'blocked') return 'rgba(255, 115, 90, 0.88)';
        return 'rgba(240, 192, 80, 0.95)';
    }

    private renderActionTiles(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (!this.actionMode || this.actionTiles.size === 0) return;

        const colors = {
            move: ['rgba(255, 204, 66, 0.18)', 'rgba(255, 204, 66, 0.68)'],
            attack: ['rgba(255, 70, 70, 0.24)', 'rgba(255, 70, 70, 0.78)'],
            interact: ['rgba(88, 210, 255, 0.20)', 'rgba(88, 210, 255, 0.72)'],
        } as const;
        const [fill, stroke] = colors[this.actionMode];

        for (const key of this.actionTiles) {
            const [x, y] = key.split(',').map(Number);
            const sx = x * TILE_SIZE - camX;
            const sy = y * TILE_SIZE - camY;
            ctx.fillStyle = fill;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

            const edge = [[0, -1], [0, 1], [-1, 0], [1, 0]]
                .some(([dx, dy]) => !this.actionTiles.has(`${x + dx},${y + dy}`));
            if (edge) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }
        }
    }

    private renderMagicTargetTiles(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (this.fieldMagicState.mode !== 'targeting') return;

        for (const key of this.fieldMagicState.validTiles) {
            const [x, y] = key.split(',').map(Number);
            const sx = x * TILE_SIZE - camX;
            const sy = y * TILE_SIZE - camY;
            ctx.fillStyle = 'rgba(170, 80, 255, 0.20)';
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(190, 110, 255, 0.65)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        for (const key of this.fieldMagicState.hoverAoeTiles) {
            const [x, y] = key.split(',').map(Number);
            const sx = x * TILE_SIZE - camX;
            const sy = y * TILE_SIZE - camY;
            ctx.fillStyle = 'rgba(255, 80, 220, 0.24)';
            ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.strokeStyle = 'rgba(255, 150, 240, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        }
    }

    private renderSelectedLoot(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (!this.selectedLootId) return;
        const loot = this.worldMap.loot.find((candidate) => candidate.id === this.selectedLootId);
        if (!loot) return;

        ctx.strokeStyle = '#f3d66b';
        ctx.lineWidth = 3;
        ctx.strokeRect(loot.x * TILE_SIZE - camX + 5, loot.y * TILE_SIZE - camY + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }

    private renderPartyActors(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const controlled = this.getControlledActor();
        for (const actor of this.partyActors) {
            if (actor.character.isDead) continue;
            const entity = actor.entity;
            const px = entity.pixelX * TILE_SIZE - camX;
            const py = entity.pixelY * TILE_SIZE - camY;

            if (entity.image && entity.imageLoaded) {
                ctx.drawImage(entity.image, px, py, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = entity.color;
                ctx.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
            }

            if (actor === controlled) {
                ctx.strokeStyle = '#52f6ff';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            if (this.selectedActorId === actor.id) {
                ctx.strokeStyle = '#ffdd55';
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }

            this.renderGauge(ctx, px + 4, py - 7, TILE_SIZE - 8, actor.entity.actionGauge / 100, '#39ff88');
            this.renderHpBar(ctx, px + 4, py + TILE_SIZE + 3, TILE_SIZE - 8, actor.character.stats.hp, actor.character.stats.maxHp);
            if (actor.entity.actionGauge >= 100 || actor.id === this.activeTurnActorId) {
                this.renderReadyRing(ctx, px, py, '#5fffd0');
            }
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

    private renderEnemies(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        for (const entry of this.fieldEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            const px = enemy.pixelX * TILE_SIZE - camX;
            const py = enemy.pixelY * TILE_SIZE - camY;

            if (enemy.image && enemy.imageLoaded) {
                ctx.drawImage(enemy.image, px, py, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = enemy.isAggro ? '#ff4d5e' : enemy.color;
                ctx.fillRect(px + 7, py + 7, TILE_SIZE - 14, TILE_SIZE - 14);
            }

            if (this.selectedEnemyId === enemy.id) {
                ctx.strokeStyle = '#ffdd55';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            this.renderEnemyRoleBadge(ctx, enemy, px, py);
            this.renderGauge(ctx, px + 5, py - 7, TILE_SIZE - 10, enemy.actionGauge / 100, '#ffb84d');
            this.renderHpBar(ctx, px + 5, py + TILE_SIZE + 3, TILE_SIZE - 10, enemy.stats.hp, enemy.stats.maxHp);
            if (enemy.actionGauge >= 100 || enemy.id === this.activeTurnActorId) {
                this.renderReadyRing(ctx, px, py, enemy.isBoss ? '#ff4ea3' : '#ffb84d');
            }
        }
    }

    private renderEnemyRoleBadge(ctx: CanvasRenderingContext2D, enemy: Enemy, px: number, py: number): void {
        const glyph = ENEMY_ROLE_GLYPHS[enemy.role] ?? 'M';
        ctx.fillStyle = enemy.isBoss ? 'rgba(80, 0, 45, 0.88)' : 'rgba(10, 14, 24, 0.78)';
        ctx.strokeStyle = enemy.isBoss ? '#ff4ea3' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE - 8, py + 8, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 9px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, px + TILE_SIZE - 8, py + 8);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private renderReadyRing(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
        const pulse = 0.5 + 0.5 * Math.sin(this.worldTime * 7);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45 + pulse * 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * (0.48 + pulse * 0.07), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    private renderAttackCues(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        for (const cue of this.attackCues) {
            const progress = cue.timer / cue.duration;
            const alpha = Math.max(0, 1 - progress);
            const fromX = cue.from.x * TILE_SIZE - camX + TILE_SIZE / 2;
            const fromY = cue.from.y * TILE_SIZE - camY + TILE_SIZE / 2;
            const toX = cue.to.x * TILE_SIZE - camX + TILE_SIZE / 2;
            const toY = cue.to.y * TILE_SIZE - camY + TILE_SIZE / 2;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / len;
            const uy = dy / len;
            const headX = fromX + dx * Math.min(1, 0.35 + progress * 0.65);
            const headY = fromY + dy * Math.min(1, 0.35 + progress * 0.65);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = cue.color;
            ctx.fillStyle = cue.color;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(fromX + ux * 10, fromY + uy * 10);
            ctx.lineTo(headX, headY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(headX, headY);
            ctx.lineTo(headX - ux * 12 - uy * 6, headY - uy * 12 + ux * 6);
            ctx.lineTo(headX - ux * 12 + uy * 6, headY - uy * 12 - ux * 6);
            ctx.closePath();
            ctx.fill();
            if (cue.label) {
                ctx.font = `bold 10px ${UI.fontMono}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cue.label, headX, headY - 16);
            }
            ctx.restore();
        }
    }

    private renderHoverTile(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (this.hoverTile.x < 0 || this.hoverTile.y < 0) return;
        ctx.strokeStyle = this.worldMap.isWalkable(this.hoverTile.x, this.hoverTile.y)
            ? 'rgba(255,255,255,0.32)'
            : 'rgba(255,70,70,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.hoverTile.x * TILE_SIZE - camX + 1, this.hoverTile.y * TILE_SIZE - camY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    private renderGauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number, color: string): void {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x, y, w, 4);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), 4);
    }

    private renderHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number): void {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = '#d95454';
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, hp / Math.max(1, maxHp))), 5);
    }

    private renderHud(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        renderGameTitle(ctx, 16, 12, { scale: 0.7, subtitle: '' });

        const active = this.party.getActive();
        if (active) {
            drawParchmentPanel(ctx, 16, 56, 210, 80);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 11px ${UI.fontMono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${active.name} Lv.${active.level}`, 28, 68);
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `10px ${UI.fontMono}`;
            ctx.fillText(`HP ${active.stats.hp}/${active.stats.maxHp}  MP ${active.stats.mp}/${active.stats.maxMp}`, 28, 84);
            ctx.fillText(`ATB ${Math.floor(this.player.actionGauge)}%`, 28, 100);
            const activeActor = this.getControlledActor();
            const apText = activeActor?.id === this.activeTurnActorId
                ? `${this.remainingActionPoints}/${active.stats.actionLimit}`
                : `-/${active.stats.actionLimit}`;
            ctx.fillText(`AP ${apText}`, 28, 116);
        }

        drawParchmentPanel(ctx, 16, 146, 130, 28);
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold 11px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(`${this.playerData.gold} G`, 28, 154);

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.fillText(`(${this.player.gridX}, ${this.player.gridY})`, 16, 184);

        const selectedInfo = this.getSelectedDisplayInfo();
        if (selectedInfo) {
            this.entityInfoUI.setPosition(16, 202);
            this.entityInfoUI.render(ctx, selectedInfo);
        }

        this.renderTerrainHoverInfo(ctx, vw);
        this.renderActionModeHint(ctx, vw, vh);
        this.renderCombatLog(ctx, vw, vh);
        this.tacticalMenuUI.render(ctx);
        this.magicUI.render(ctx, vw, vh);

        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText('캐릭터 클릭 행동 메뉴 | Tab 교체 | ESC 취소 | I 인벤토리', vw - 16, vh - 16);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private renderTerrainHoverInfo(ctx: CanvasRenderingContext2D, vw: number): void {
        if (this.hoverTile.x < 0 || this.hoverTile.y < 0) return;
        const activeActor = this.getControlledActor();
        const tile = this.worldMap.getTileAt(this.hoverTile.x, this.hoverTile.y);
        const lines = describeTerrainForHover(tile, activeActor ? this.getActorTerrainTraits(activeActor) : {});
        const w = 214;
        const h = 18 + lines.length * 14;
        const x = Math.max(16, vw - w - 16);
        const y = 56;
        drawGlassPanel(ctx, x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((line, index) => {
            ctx.fillText(line, x + 10, y + 9 + index * 14);
        });
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
                className: this.getEnemyRoleLabel(enemy.role),
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

    private getEnemyRoleLabel(role: EnemyRole): string {
        switch (role) {
            case 'tank': return '탱커형 몬스터';
            case 'archer': return '궁수형 몬스터';
            case 'healer': return '힐러형 몬스터';
            case 'coward': return '도망형 몬스터';
            case 'support': return '지원형 몬스터';
            case 'boss': return '보스 몬스터';
            case 'bruiser':
            default:
                return '근접형 몬스터';
        }
    }

    private renderActionModeHint(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        if (this.fieldMagicState.mode === 'targeting') {
            ctx.fillStyle = 'rgba(200, 90, 255, 0.9)';
            ctx.font = `bold 12px ${UI.fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText('마법 대상을 클릭 (ESC 취소)', vw / 2, vh - 50);
            ctx.textAlign = 'start';
            return;
        }

        if (!this.actionMode) return;

        const text = this.actionMode === 'move'
            ? '이동할 타일을 클릭 (ESC 취소)'
            : this.actionMode === 'attack'
                ? '공격할 적을 클릭 (ESC 취소)'
                : '조사할 대상을 클릭 (ESC 취소)';
        ctx.fillStyle = this.actionMode === 'attack'
            ? 'rgba(255, 80, 80, 0.88)'
            : this.actionMode === 'interact'
                ? 'rgba(88, 210, 255, 0.88)'
                : 'rgba(255, 204, 66, 0.9)';
        ctx.font = `bold 12px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(text, vw / 2, vh - 50);
        ctx.textAlign = 'start';
    }

    private renderCombatLog(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        const x = this.hasSelection() ? 240 : 16;
        const y = Math.max(188, vh - 150);
        const w = Math.max(260, Math.min(430, vw - x - 16));
        const h = 112;
        drawGlassPanel(ctx, x, y, w, h);
        ctx.font = `10px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const visible = this.combatLog.slice(-5);
        visible.forEach((line, index) => {
            ctx.fillStyle = this.getCombatLogColor(line);
            ctx.fillText(line, x + 12, y + 12 + index * 18, w - 24);
        });
    }

    private getCombatLogColor(line: string): string {
        if (line.includes('처치') || line.includes('치명')) return '#ffd15f';
        if (line.includes('피해') || line.includes('약화') || line.includes('독')) return '#ff8a8a';
        if (line.includes('회복') || line.includes('강화') || line.includes('방어')) return '#9dffb0';
        if (line.includes('명중 실패') || line.includes('빗나감')) return '#d9d9e8';
        if (line.includes('턴 시작') || line.includes('READY')) return '#88ddff';
        return 'rgba(255,255,255,0.78)';
    }
}
