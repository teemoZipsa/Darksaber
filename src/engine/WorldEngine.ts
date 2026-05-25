/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field AP turn combat live here; the legacy
 * BattleEngine remains only for explicit staged encounters.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
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
import { CombatFormulas } from '../combat/CombatFormulas';
import { resolveSkillEffect, SkillEffectEnemyInput, SkillEffectResult } from '../combat/SkillEffectResolver';
import { UI, renderGameTitle, Parchment, drawParchmentPanel, drawGlassPanel } from '../ui/UITheme';
import { ActionMenuUI, ActionType } from '../ui/ActionMenuUI';
import { EntityDisplayInfo, EntityInfoUI } from '../ui/EntityInfoUI';
import { MagicUI } from '../ui/MagicUI';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { FieldPassableQuery, TilePoint, findPath, findPathToAny, isInRange, manhattan, tilesInRange } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import { advanceAtb, resolveAggroState } from '../field/FieldCombat';
import { ATTACK_AP_COST, INTERACT_AP_COST, MAGIC_AP_COST, MOVE_AP_PER_TILE, enqueueReadyActor, getMoveApCost, hasExecutableFieldAction } from '../field/FieldActionEconomy';

interface FieldIntent {
    kind: 'move' | 'attack' | 'interact' | 'magic' | 'rest' | 'wait';
    tile?: TilePoint;
    path?: TilePoint[];
    enemyId?: string;
    lootId?: string;
    skillId?: string;
    targetEnemyId?: string;
    apCost?: number;
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

export class WorldEngine {
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

    constructor(
        _canvas: HTMLCanvasElement,
        _ctx: CanvasRenderingContext2D,
        _input: InputManager,
        camera: Camera,
        party: PartyManager,
        _inventory: GridInventory,
        playerData: PlayerData,
        gameManager: GameManager
    ) {
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
        if (input.mouseWheelDelta !== 0 && !this.magicUI.isVisible()) {
            if (input.mouseWheelDelta > 0) camera.zoomOut();
            else camera.zoomIn();
        }

        const screenTile = camera.screenToTile(input.mouseScreenX, input.mouseScreenY);
        this.hoverTile = { x: screenTile.tileX, y: screenTile.tileY };
        this.entityInfoUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.actionMenuUI.onMouseMove(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
        this.magicUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.updateMagicHoverPreview();

        if (!this.isInputLockedByReservation()) {
            if (input.justPressed('Escape')) {
                if (this.fieldMagicState.mode !== 'idle' || this.magicUI.isVisible()) this.resetMagicState();
                else this.clearIntent();
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
        this.processQueuedIntents();
        this.refreshLootState();
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
        this.renderSelectedLoot(ctx, camX, camY);
        this.renderEnemies(ctx, camX, camY);
        this.renderPartyActors(ctx, camX, camY);
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
            { offset: { x: 7, y: 3 }, name: 'Ash Raider', level: 1, color: '#d95763' },
            { offset: { x: 10, y: -2 }, name: 'Wasteland Scout', level: 2, color: '#ff8a4a' },
            { offset: { x: -6, y: 6 }, name: 'Hollow Guard', level: 1, color: '#b86cff' },
        ];

        this.fieldEnemies = enemySeeds.map((seed, index) => {
            const tile = this.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, `enemy_${index}`);
            const enemy = new Enemy(`field_enemy_${index}`, tile.x, tile.y, seed.name, seed.level, seed.color);
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
        const partyTargets: FieldHitParty[] = this.partyActors.map((actor) => ({
            ...actor,
            gridX: actor.entity.gridX,
            gridY: actor.entity.gridY,
        }));
        const hit = resolveFieldHit(tile, {
            party: partyTargets,
            enemies: this.fieldEnemies.map((entry) => entry.enemy),
            loot: this.worldMap.loot,
            isGroundWalkable: (x, y) => this.worldMap.isWalkable(x, y),
        });

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
                this.addCombatLog('휴식: HP +5, MP +3 회복');
                this.endActorTurn(actor, '휴식');
                break;
            case 'wait':
                this.addCombatLog('대기');
                this.endActorTurn(actor, '대기');
                break;
            default:
                this.addCombatLog('아직 필드에서 사용할 수 없는 행동입니다.');
                break;
        }
    }

    private handleActionTargetClick(tile: TilePoint, hit: ReturnType<typeof resolveFieldHit>): void {
        const actor = this.getActivePartyTurnActor();
        if (!actor) return;

        const tileKey = `${tile.x},${tile.y}`;
        if (!this.actionTiles.has(tileKey)) {
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
                if (this.spendAp(ATTACK_AP_COST) && this.tryActorAttack(actor, enemy)) {
                    this.resumeOrEndActiveTurn(actor);
                }
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

        const tileKey = `${tile.x},${tile.y}`;
        if (!this.fieldMagicState.validTiles.has(tileKey)) {
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

        const effect = resolveSkillEffect({
            casterStats: actor.character.stats,
            casterCharacter: actor.character,
            skill,
            targetEnemy: targetEnemy ? this.toSkillEnemyInput(targetEnemy) : undefined,
            allEnemies: this.fieldEnemies.map((entry) => this.toSkillEnemyInput(entry.enemy)),
        });

        if (!this.spendAp(MAGIC_AP_COST)) {
            this.addCombatLog('마법을 사용할 행동력이 부족합니다.');
            this.reopenActionMenu(actor);
            return;
        }

        this.applySkillEffect(actor, effect);
        this.resetMagicState();
        this.resumeOrEndActiveTurn(actor);
    }

    private applySkillEffect(actor: FieldActor, effect: SkillEffectResult): void {
        actor.character.stats.mp = Math.max(0, Math.min(actor.character.stats.maxMp, actor.character.stats.mp + effect.casterMpDelta));
        actor.character.stats.hp = Math.max(0, Math.min(actor.character.stats.maxHp, actor.character.stats.hp + effect.casterHpDelta));
        if (effect.appliesBuff) actor.character.applyBuff(effect.appliesBuff);

        for (const enemyResult of effect.enemyResults) {
            const enemy = this.getEnemyById(enemyResult.enemyId);
            if (!enemy) continue;

            if (enemyResult.statChanges?.atk) {
                enemy.stats.atk = Math.max(1, enemy.stats.atk + enemyResult.statChanges.atk);
            }
            if (enemyResult.statChanges?.def) {
                enemy.stats.def = Math.max(1, enemy.stats.def + enemyResult.statChanges.def);
            }
            if (enemyResult.statChanges?.magAtk) {
                enemy.stats.magAtk = Math.max(1, enemy.stats.magAtk + enemyResult.statChanges.magAtk);
            }
            if (enemyResult.statChanges?.magDef) {
                enemy.stats.magDef = Math.max(1, enemy.stats.magDef + enemyResult.statChanges.magDef);
            }
            if (enemyResult.statChanges?.spd) {
                enemy.stats.spd = Math.max(1, enemy.stats.spd + enemyResult.statChanges.spd);
            }

            const dead = enemy.takeDamage(enemyResult.damage);
            if (dead) this.handleEnemyDefeated(actor, enemy);
        }

        for (const log of effect.logs) this.addCombatLog(log);
    }

    private toSkillEnemyInput(enemy: Enemy): SkillEffectEnemyInput {
        return {
            id: enemy.id,
            name: enemy.name,
            gridX: enemy.gridX,
            gridY: enemy.gridY,
            stats: enemy.stats,
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
        return this.getLearnedFieldSkills(character).some((skill) => character.stats.mp >= skill.mpCost);
    }

    private computeMagicTargetTiles(actor: FieldActor, skill: Skill): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        for (const tile of tilesInRange(start, Math.max(1, skill.range))) {
            result.add(`${tile.x},${tile.y}`);
        }
        return result;
    }

    private updateMagicHoverPreview(): void {
        if (this.fieldMagicState.mode !== 'targeting' || this.fieldMagicState.skill.aoeRadius <= 0) return;

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
            const radius = this.fieldMagicState.skill.aoeRadius;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    hoverAoeTiles.add(`${enemy.gridX + dx},${enemy.gridY + dy}`);
                }
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
        const path = findPath(this.actorTile(actor), tile, (query) => this.isFieldPassable(query), {
            actorId: actor.id,
            intent: 'move',
            maxNodes: 8000,
        });
        if (path.length === 0 && !this.isActorAt(actor, tile)) {
            this.clearActorIntent(actor);
            this.addCombatLog('이동 경로를 찾지 못했습니다.');
            return false;
        }

        const apCost = getMoveApCost(path.length);
        if (!this.spendAp(apCost)) {
            this.addCombatLog('이동할 행동력이 부족합니다.');
            return false;
        }

        actor.path = path;
        actor.queuedIntent = { kind: 'move', tile, path, apCost };
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
                actor.entity.actionGauge = advanceAtb(actor.entity.actionGauge, actor.character.getCombatStats().spd, dt, FIELD_ATB_SCALE);
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

            if (enemy.id !== this.activeTurnActorId) {
                enemy.actionGauge = advanceAtb(enemy.actionGauge, enemy.stats.spd, dt, FIELD_ATB_SCALE * 0.7);
                if (enemy.actionGauge >= 100) {
                    enemy.actionGauge = 100;
                    enqueueReadyActor(this.readyQueue, enemy.id);
                }
            }
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
        const range = this.getAttackRange(actor.character);
        const enemyTile = this.enemyTile(enemy);
        if (!isInRange(this.actorTile(actor), enemyTile, range)) return false;
        if (actor.entity.actionGauge < 100) return false;

        const result = CombatFormulas.calcPhysicalDamage(
            actor.character.getCombatStats(),
            enemy.stats,
            this.worldMap.getTileAt(enemy.gridX, enemy.gridY)
        );
        const dirBonus = CombatFormulas.getDirectionalMultiplier(
            actor.entity.gridX,
            actor.entity.gridY,
            enemy.gridX,
            enemy.gridY,
            enemy.facing
        );
        if (!result.isMiss) result.damage = Math.max(1, Math.floor(result.damage * dirBonus.multiplier));

        actor.entity.facing = this.directionFromTo(this.actorTile(actor), enemyTile);

        if (result.isMiss) {
            this.addCombatLog(`${actor.character.name} 공격 빗나감: ${enemy.name}`);
            return true;
        }

        const dead = enemy.takeDamage(result.damage);
        const critText = result.isCrit ? ' CRIT' : '';
        this.addCombatLog(`${actor.character.name} → ${enemy.name} ${result.damage} 피해${critText}`);

        if (dead) this.handleEnemyDefeated(actor, enemy);
        return true;
    }

    private enemyAttack(entry: FieldEnemy, actor: FieldActor): void {
        const enemy = entry.enemy;
        const result = CombatFormulas.calcPhysicalDamage(
            enemy.stats,
            actor.character.stats,
            this.worldMap.getTileAt(actor.entity.gridX, actor.entity.gridY)
        );
        enemy.actionGauge = 0;
        enemy.facing = this.directionFromTo(this.enemyTile(enemy), this.actorTile(actor));

        if (result.isMiss) {
            this.addCombatLog(`${enemy.name} 공격 빗나감`);
            return;
        }

        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - result.damage);
        this.addCombatLog(`${enemy.name} → ${actor.character.name} ${result.damage} 피해`);

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            this.handleActorDown(actor);
        }
    }

    private enemyStepToward(entry: FieldEnemy, actor: FieldActor): void {
        const enemy = entry.enemy;
        const goals = tilesInRange(this.actorTile(actor), 1)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: enemy.id,
                intent: 'enemy',
                goal: this.actorTile(actor),
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

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy): void {
        this.addCombatLog(`${enemy.name} 처치! +${enemy.expReward} EXP`);
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
        if (!this.worldMap.isWalkable(query.x, query.y)) return false;

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
        available.push('rest', 'wait');
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
        this.actionMenuOpen = true;
        this.actionMenuUI.open(this.getAvailableTurnActions(actor));
    }

    private endActorTurn(actor: FieldActor, reason: string): void {
        actor.entity.actionGauge = 0;
        actor.character.tickBuffs();
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.reservedAction = null;
        this.clearActorIntent(actor);
        this.closeActionMenu();
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

    private beginActorTurn(actor: FieldActor): void {
        const index = this.partyActors.indexOf(actor);
        if (index >= 0) this.switchToPartyMember(index);
        this.activeTurnActorId = actor.id;
        this.remainingActionPoints = Math.max(1, Math.floor(actor.character.stats.actionLimit || 15));
        actor.entity.actionGauge = 100;
        this.selectedActorId = actor.id;
        this.addCombatLog(`${actor.character.name} 턴 시작: 행동 ${this.remainingActionPoints}`);
        if (!this.hasExecutableAction(actor)) this.endActorTurn(actor, '가능한 행동 없음');
        else {
            this.actionMenuOpen = true;
            this.actionMenuUI.open(this.getAvailableTurnActions(actor));
        }
    }

    private beginEnemyTurn(entry: FieldEnemy): void {
        const enemy = entry.enemy;
        this.activeTurnActorId = enemy.id;

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
        if (!enemy.isAggro || this.isEntityMoving(enemy)) {
            this.endEnemyTurn(enemy);
            return;
        }

        if (distanceToTarget <= 1) this.enemyAttack(entry, closest);
        else this.enemyStepToward(entry, closest);
        this.endEnemyTurn(enemy);
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
        return hasExecutableFieldAction({
            remainingAp: this.remainingActionPoints,
            hasReachableMove: this.hasExecutableMove(actor),
            hasAttackTarget: this.hasExecutableAttack(actor),
            hasInteractTarget: this.hasExecutableInteract(actor),
            hasMagicAvailable: this.hasExecutableMagic(actor),
        });
    }

    private hasExecutableMove(actor: FieldActor): boolean {
        return this.remainingActionPoints >= MOVE_AP_PER_TILE && this.computeWalkableTiles(actor).size > 0;
    }

    private hasExecutableAttack(actor: FieldActor): boolean {
        if (this.remainingActionPoints < ATTACK_AP_COST) return false;
        const start = this.actorTile(actor);
        const range = this.getAttackRange(actor.character);
        return this.fieldEnemies.some((entry) =>
            entry.enemy.stats.hp > 0 && isInRange(start, this.enemyTile(entry.enemy), range)
        );
    }

    private hasExecutableInteract(actor: FieldActor): boolean {
        return this.remainingActionPoints >= INTERACT_AP_COST && this.hasAdjacentLoot(actor);
    }

    private hasExecutableMagic(actor: FieldActor): boolean {
        return this.remainingActionPoints >= MAGIC_AP_COST && this.hasCastableFieldSkill(actor.character);
    }

    private computeWalkableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        const range = Math.min(
            Math.max(1, actor.character.stats.mov || actor.entity.moveRange),
            Math.floor(this.remainingActionPoints / MOVE_AP_PER_TILE)
        );
        if (range <= 0) return result;
        const queue: { x: number; y: number; dist: number }[] = [{ ...start, dist: 0 }];
        const visited = new Set<string>([`${start.x},${start.y}`]);

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current.dist > 0) result.add(`${current.x},${current.y}`);
            if (current.dist >= range) continue;

            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const next = { x: current.x + dx, y: current.y + dy };
                const key = `${next.x},${next.y}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (this.isFieldPassable({ ...next, actorId: actor.id, intent: 'move' })) {
                    queue.push({ ...next, dist: current.dist + 1 });
                }
            }
        }

        return result;
    }

    private computeAttackableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        const range = this.getAttackRange(actor.character);
        for (const tile of tilesInRange(start, range)) {
            if (tile.x === start.x && tile.y === start.y) continue;
            result.add(`${tile.x},${tile.y}`);
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

    private renderPathPreview(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const actor = this.getControlledActor();
        if (!actor || actor.path.length === 0) return;

        ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
        for (const tile of actor.path) {
            ctx.fillRect(tile.x * TILE_SIZE - camX + 8, tile.y * TILE_SIZE - camY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        }
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

            this.renderGauge(ctx, px + 5, py - 7, TILE_SIZE - 10, enemy.actionGauge / 100, '#ffb84d');
            this.renderHpBar(ctx, px + 5, py + TILE_SIZE + 3, TILE_SIZE - 10, enemy.stats.hp, enemy.stats.maxHp);
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

        this.renderActionModeHint(ctx, vw, vh);
        this.renderCombatLog(ctx, vw, vh);
        this.magicUI.render(ctx, vw, vh);

        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText('캐릭터 클릭 행동 메뉴 | Tab 교체 | ESC 취소 | I 인벤토리', vw - 16, vh - 16);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private getSelectedDisplayInfo(): EntityDisplayInfo | null {
        if (this.selectedActorId) {
            const actor = this.partyActors.find((candidate) => candidate.id === this.selectedActorId);
            if (!actor) return null;
            const stats = actor.character.stats;
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
                buffs: actor.character.buffs.map((buff) => buff.icon),
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
            return {
                name: enemy.name || enemy.label,
                level: enemy.level,
                hp: enemy.stats.hp,
                maxHp: enemy.stats.maxHp,
                mp: enemy.stats.mp,
                maxMp: enemy.stats.maxMp,
                actionGauge: enemy.actionGauge,
                buffs: [],
                atk: enemy.stats.atk,
                def: enemy.stats.def,
                magAtk: enemy.stats.magAtk,
                magDef: enemy.stats.magDef,
                spriteColor: enemy.color,
                spriteImage: enemy.image,
            };
        }

        return null;
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

    private renderCombatLog(ctx: CanvasRenderingContext2D, _vw: number, vh: number): void {
        const x = this.hasSelection() ? 240 : 16;
        const y = Math.max(188, vh - 150);
        const w = 360;
        const h = 112;
        drawGlassPanel(ctx, x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = `10px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const visible = this.combatLog.slice(-5);
        visible.forEach((line, index) => {
            ctx.fillText(line, x + 12, y + 12 + index * 18);
        });
    }
}
