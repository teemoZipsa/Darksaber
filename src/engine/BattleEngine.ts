/**
 * BattleEngine — SRPG battle map engine.
 * Handles turn-based tactical combat on fixed stage maps.
 * Restored from the original GameEngine's combat logic with full features.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { Entity } from '../entity/Entity';
import { TILE_SIZE } from '../map/Chunk';
import { GridRenderer } from '../map/GridRenderer';
import { PartyManager } from '../character/PartyManager';
import type { GridInventory } from '../inventory/GridInventory';
import type { PlayerData } from '../data/PlayerData';
import { StageData } from '../data/StageDB';
import { CombatFormulas } from '../combat/CombatFormulas';
import { Skill } from '../data/SkillDB';
import { CharacterStats } from '../data/Stats';
import { getClassLine } from '../data/ClassTree';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import { ActionMenuUI } from '../ui/ActionMenuUI';
import { EntityInfoUI, EntityDisplayInfo } from '../ui/EntityInfoUI';
import { MagicUI } from '../ui/MagicUI';
import { EffectManager } from '../ui/EffectManager';
import { sfxHit, sfxCritical, sfxMiss, sfxHeal, sfxLevelUp, sfxKill, sfxPromotion, sfxByElement, sfxBuff, sfxDebuff, sfxDrain, sfxMeteor } from '../audio/CombatSFX';
import { UI, Parchment, drawParchmentPanel, drawGlassPanel } from '../ui/UITheme';
import { MinimapUI } from '../ui/MinimapUI';
import { TileType } from '../map/Tile';
import type { GameManager } from './GameManager';

// ═══════════════════════════════════════════════════════════
//  Stage tile rendering
// ═══════════════════════════════════════════════════════════

const STAGE_TILE_COLORS: Record<number, string> = {
    0: '#3a4a2a',   // floor (dark green/stone)
    1: '#2a2a2a',   // wall
};

const STAGE_TILE_WALKABLE: Record<number, boolean> = {
    0: true,
    1: false,
};

// ═══════════════════════════════════════════════════════════
//  BattleEngine
// ═══════════════════════════════════════════════════════════

export class BattleEngine {
    private camera: Camera;
    private gameManager: GameManager;
    private input!: InputManager;

    // Stage data
    private stage: StageData;
    private tiles: number[][];

    // Entities
    private player!: Player;
    private partyPlayers: Player[] = [];
    private enemies: Enemy[] = [];
    private party: PartyManager;
    private inventory!: GridInventory;

    // ATB
    private playerTurnActive: boolean = false;
    private timeScale: number = 10.0;

    // Action menus
    private actionMenuOpen: boolean = false;
    private actionMenuUI: ActionMenuUI;
    private magicUI: MagicUI;
    private floatingText: FloatingTextManager;
    private effectManager: EffectManager;
    private gridRenderer: GridRenderer;
    private entityInfoUI: EntityInfoUI;
    private minimapUI: MinimapUI;

    // Selection & target tracking
    private selectedTarget: Entity | null = null;
    private selectBorderImg: HTMLImageElement = Object.assign(new Image(), { src: '/Image/Etc/Select.png' });
    private isHoveringPlayer: boolean = false;

    // Combat modes
    private moveMode: boolean = false;
    private attackMode: boolean = false;
    private magicTargetMode: boolean = false;
    private walkableTiles: Set<string> = new Set();
    private attackableTiles: Set<string> = new Set();
    private magicTargetTiles: Set<string> = new Set();
    private pendingSkill: Skill | null = null;

    // Player stats cache
    private playerStats!: CharacterStats;

    // Hover tile
    private hoverTileX: number = -1;
    private hoverTileY: number = -1;

    // Combat log
    private combatLog: string[] = [];
    private logScrollOffset: number = 0;

    // Promotion flash effect
    private promotionFlashTimer: number = 0;
    private promotionFlashPlayerIdx: number = -1;

    constructor(
        _canvas: HTMLCanvasElement, _ctx: CanvasRenderingContext2D,
        input: InputManager, camera: Camera,
        party: PartyManager, inventory: GridInventory,
        _playerData: PlayerData, stage: StageData,
        gameManager: GameManager
    ) {
        this.camera = camera;
        this.gameManager = gameManager;
        this.party = party;
        this.inventory = inventory;
        this.input = input;
        this.stage = stage;
        this.tiles = stage.tiles;

        // UI
        this.actionMenuUI = new ActionMenuUI();
        this.magicUI = new MagicUI();
        this.floatingText = new FloatingTextManager();
        this.effectManager = new EffectManager();
        this.gridRenderer = new GridRenderer();
        this.entityInfoUI = new EntityInfoUI();

        // Minimap (adapted for battle stage tiles)
        this.minimapUI = new MinimapUI({
            getTile: (gx, gy) => {
                if (gy < 0 || gy >= this.tiles.length || gx < 0 || gx >= (this.tiles[0]?.length || 0)) return TileType.WALL;
                return this.tiles[gy][gx] === 1 ? TileType.WALL : TileType.GRASS;
            },
            getPlayerPos: () => ({ x: this.player.gridX, y: this.player.gridY }),
            getEnemies: () => this.enemies.map(e => ({ gridX: e.gridX, gridY: e.gridY, color: e.color, isBoss: e.isBoss })),
            getExtractionZones: () => [],
            getLoot: () => [],
        });

        // Magic UI skill select
        this.magicUI.onSkillSelect = (skill: Skill) => {
            if (skill.type === 'heal' || skill.type === 'buff') {
                this.castSkill(skill);
                return;
            }
            this.pendingSkill = skill;
            this.magicTargetMode = true;
            this.magicTargetTiles = this.computeAttackableTiles(
                this.player.gridX, this.player.gridY, skill.range
            );
            this.addCombatLog(`${skill.icon} ${skill.nameKr}: 대상을 선택하세요 (범위: ${skill.range})`);
        };

        // Spawn party at stage start positions
        this.spawnParty();
        // Spawn enemies from stage data
        this.spawnEnemies();

        // Set active player reference
        this.player = this.partyPlayers[0];

        // Cache player stats
        const activeChar = this.party.getActive();
        if (activeChar) this.playerStats = activeChar.stats;

        // Snap camera
        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.snapToTarget();

        this.addCombatLog(`⚔ ${stage.nameKr} 전투 시작!`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Spawning
    // ═══════════════════════════════════════════════════════════

    private spawnParty(): void {
        const members = this.party.getCharacters();
        const colors = ['#00e5ff', '#ff00e5', '#e5ff00', '#ffaa00'];
        for (let i = 0; i < members.length && i < this.stage.startPositions.length; i++) {
            const pos = this.stage.startPositions[i];
            const p = new Player(pos.x, pos.y);
            p.label = members[i].name;
            p.color = colors[i % colors.length];
            // Use Character's portrait image for sprite
            if (members[i].portraitImage && members[i].portraitLoaded) {
                p.image = members[i].portraitImage;
                p.imageLoaded = true;
            } else {
                p.setImage(members[i].portraitImage?.src || '/Image/Character/fighter.png');
            }
            this.partyPlayers.push(p);
        }
    }

    private spawnEnemies(): void {
        for (const ep of this.stage.enemies) {
            const enemy = new Enemy(`enemy_${ep.x}_${ep.y}`, ep.x, ep.y, ep.name, ep.level, ep.color);
            enemy.isBoss = ep.isBoss || false;
            if (ep.imageSrc) enemy.setImage(ep.imageSrc);
            this.enemies.push(enemy);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Update
    // ═══════════════════════════════════════════════════════════

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.camera = camera;
        this.input = input;

        // Mouse wheel zoom
        if (input.mouseWheelDelta !== 0 && !this.magicUI.isVisible()) {
            if (input.mouseWheelDelta > 0) camera.zoomOut();
            else camera.zoomIn();
        }

        // Toggle minimap with M
        if (input.justPressed('KeyM')) {
            this.minimapUI.toggle();
        }

        // Update floating text + effects
        this.floatingText.update(dt);
        this.effectManager.update(dt);

        // Update entity animations
        for (const p of this.partyPlayers) p.update(dt);
        for (const e of this.enemies) e.update(dt);

        // Promotion flash timer
        if (this.promotionFlashTimer > 0) this.promotionFlashTimer -= dt;

        // ─── ATB System (all party members) ─────────────
        const members = this.party.getCharacters();
        for (let i = 0; i < this.partyPlayers.length; i++) {
            const p = this.partyPlayers[i];
            const ch = members[i];
            if (!ch || ch.isDead) continue;
            if (p.actionGauge < 100) {
                p.actionGauge = Math.min(100, p.actionGauge + ch.stats.spd * dt * this.timeScale);
            }
        }

        // Check if active player's ATB is ready
        this.playerTurnActive = (this.player.actionGauge >= 100);

        // Enemy ATB + roaming AI
        for (const enemy of this.enemies) {
            // Aggro check
            let inAggro = false;
            let closestPlayer = this.player;
            let closestDist = Infinity;
            for (const p of this.partyPlayers) {
                const pidx = this.partyPlayers.indexOf(p);
                if (members[pidx]?.isDead) continue;
                const d = Math.abs(p.gridX - enemy.gridX) + Math.abs(p.gridY - enemy.gridY);
                if (d <= enemy.aggroRange) inAggro = true;
                if (d < closestDist) { closestDist = d; closestPlayer = p; }
            }
            enemy.isAggro = inAggro;

            const atbScale = 0.5 + 0.5 * (Math.min(enemy.level, 70) / 70);
            enemy.actionGauge = Math.min(100, enemy.actionGauge + enemy.stats.spd * dt * this.timeScale * atbScale);

            if (enemy.actionGauge >= 100) {
                enemy.actionGauge = 0;
                if (inAggro) {
                    this.processEnemyTurn(enemy, closestPlayer);
                } else {
                    // Peaceful roaming: 30% chance to move randomly
                    if (Math.random() > 0.3) {
                        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
                        const d = dirs[Math.floor(Math.random() * dirs.length)];
                        const nx = enemy.gridX + d[0], ny = enemy.gridY + d[1];
                        if (this.isBattleTileWalkable(nx, ny) && !this.isOccupied(nx, ny)) {
                            if (d[0] > 0) enemy.facing = 'right';
                            else if (d[0] < 0) enemy.facing = 'left';
                            else if (d[1] > 0) enemy.facing = 'down';
                            else enemy.facing = 'up';
                            enemy.gridX = nx;
                            enemy.gridY = ny;
                        }
                    }
                }
            }
        }

        // Camera follow active player
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update();

        // Hover tile
        const worldTile = camera.screenToTile(input.mouseScreenX, input.mouseScreenY);
        this.hoverTileX = worldTile.tileX;
        this.hoverTileY = worldTile.tileY;

        // Track hover over player for movement range display
        this.isHoveringPlayer = (this.hoverTileX === this.player.gridX && this.hoverTileY === this.player.gridY);

        // Route mouse to UI components
        this.entityInfoUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        const zoomForInput = camera.zoom;
        this.actionMenuUI.onMouseMove(input.mouseScreenX / zoomForInput, input.mouseScreenY / zoomForInput);

        // ─── Tab: Switch party member ─────────────────────
        if (input.justPressed('Tab')) {
            const currentIdx = this.partyPlayers.indexOf(this.player);
            for (let offset = 1; offset < this.partyPlayers.length; offset++) {
                const idx = (currentIdx + offset) % this.partyPlayers.length;
                if (members[idx] && !members[idx].isDead) {
                    this.switchToPartyMember(idx);
                    break;
                }
            }
        }

        // ─── Magic UI input ─────────────────────────
        if (this.magicUI.isVisible()) {
            this.magicUI.updateMp(this.playerStats.mp);
            this.magicUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
            if (input.mouseJustDown) this.magicUI.onMouseDown(input.mouseScreenX, input.mouseScreenY);
            if (input.mouseJustUp) this.magicUI.onMouseUp();
            if (input.mouseWheelDelta !== 0) this.magicUI.onScroll(input.mouseWheelDelta);
            return;
        }

        // ─── Escape to cancel ─────────────────────────
        if (input.justPressed('Escape')) {
            if (this.moveMode) { this.moveMode = false; this.walkableTiles.clear(); this.addCombatLog('이동 취소'); }
            if (this.attackMode) { this.attackMode = false; this.attackableTiles.clear(); this.addCombatLog('공격 취소'); }
            if (this.magicTargetMode) { this.magicTargetMode = false; this.magicTargetTiles.clear(); this.pendingSkill = null; this.addCombatLog('마법 시전 취소'); }
            if (this.actionMenuOpen) { this.actionMenuOpen = false; this.actionMenuUI.close(); }
        }

        // ─── Click handling ─────────────────────────
        if (input.mouseJustDown) {
            let hitUI = false;

            // Check entity info close button
            if (this.selectedTarget && this.entityInfoUI.onClick(input.mouseScreenX, input.mouseScreenY)) {
                this.selectedTarget = null;
                hitUI = true;
            }

            // Check action menu click
            if (!hitUI && this.actionMenuOpen) {
                const action = this.actionMenuUI.onClick(input.mouseScreenX / zoomForInput, input.mouseScreenY / zoomForInput);
                if (action) {
                    this.executeAction(action);
                    hitUI = true;
                } else {
                    this.actionMenuOpen = false;
                    this.actionMenuUI.close();
                    hitUI = true;
                }
            }

            // Move mode click
            if (!hitUI && this.moveMode) {
                const tileKey = `${this.hoverTileX},${this.hoverTileY}`;
                if (this.walkableTiles.has(tileKey)) {
                    const dx = this.hoverTileX - this.player.gridX;
                    const dy = this.hoverTileY - this.player.gridY;
                    if (Math.abs(dx) >= Math.abs(dy)) this.player.facing = dx > 0 ? 'right' : 'left';
                    else this.player.facing = dy > 0 ? 'down' : 'up';
                    this.player.gridX = this.hoverTileX;
                    this.player.gridY = this.hoverTileY;
                    this.selectedTarget = this.player;
                    this.playerStats.mp = Math.min(this.playerStats.mp + 1, this.playerStats.maxMp);
                    this.consumeAction();
                    this.moveMode = false;
                    this.walkableTiles.clear();
                    this.actionMenuOpen = false;
                    this.actionMenuUI.close();
                    this.addCombatLog(`이동 완료 (${this.player.gridX}, ${this.player.gridY})`);
                    this.autoSwitchToReady();
                } else {
                    this.moveMode = false;
                    this.walkableTiles.clear();
                    this.addCombatLog('이동 취소');
                }
                hitUI = true;
            }

            // Attack mode click
            if (!hitUI && this.attackMode) {
                const tileKey = `${this.hoverTileX},${this.hoverTileY}`;
                if (this.attackableTiles.has(tileKey)) {
                    const target = this.enemies.find(e => e.gridX === this.hoverTileX && e.gridY === this.hoverTileY);
                    if (target) {
                        this.performAttack(target);
                    } else {
                        this.addCombatLog('적이 없습니다.');
                    }
                } else {
                    this.addCombatLog('공격 취소');
                }
                this.attackMode = false;
                this.attackableTiles.clear();
                hitUI = true;
            }

            // Magic target mode click
            if (!hitUI && this.magicTargetMode && this.pendingSkill) {
                const tileKey = `${this.hoverTileX},${this.hoverTileY}`;
                if (this.magicTargetTiles.has(tileKey)) {
                    const target = this.enemies.find(e => e.gridX === this.hoverTileX && e.gridY === this.hoverTileY);
                    if (target) {
                        this.castSkill(this.pendingSkill, target);
                    } else {
                        this.addCombatLog('적이 없습니다.');
                    }
                } else {
                    this.addCombatLog('마법 시전 취소');
                }
                this.magicTargetMode = false;
                this.magicTargetTiles.clear();
                this.pendingSkill = null;
                hitUI = true;
            }

            // Click on player → toggle action menu
            if (!hitUI) {
                if (this.player.gridX === this.hoverTileX && this.player.gridY === this.hoverTileY) {
                    this.actionMenuOpen = !this.actionMenuOpen;
                    if (this.actionMenuOpen) this.actionMenuUI.open();
                    else this.actionMenuUI.close();
                    this.selectedTarget = this.player;
                } else {
                    if (this.actionMenuOpen) { this.actionMenuOpen = false; this.actionMenuUI.close(); }
                    // Click on party member → switch
                    const clickedPM = this.partyPlayers.find(p => p.gridX === this.hoverTileX && p.gridY === this.hoverTileY);
                    const clickedEnemy = this.enemies.find(e => e.gridX === this.hoverTileX && e.gridY === this.hoverTileY);
                    if (clickedPM && clickedPM !== this.player) {
                        this.switchToPartyMember(this.partyPlayers.indexOf(clickedPM));
                    } else if (clickedEnemy) {
                        this.selectedTarget = clickedEnemy;
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Actions
    // ═══════════════════════════════════════════════════════════

    private executeAction(action: string): void {
        this.actionMenuOpen = false;
        this.actionMenuUI.close();

        if (!this.playerTurnActive) {
            this.addCombatLog('행동 게이지가 차지 않았습니다.');
            return;
        }

        switch (action) {
            case 'move':
                this.moveMode = true;
                this.walkableTiles = this.computeWalkableTiles(
                    this.player.gridX, this.player.gridY, this.player.moveRange
                );
                this.addCombatLog('이동할 위치를 클릭하세요.');
                break;
            case 'attack':
                this.attackMode = true;
                this.attackableTiles = this.computeAttackableTiles(
                    this.player.gridX, this.player.gridY, 1
                );
                this.addCombatLog('공격할 대상을 클릭하세요.');
                break;
            case 'magic': {
                const active = this.party.getActive();
                if (!active) { this.addCombatLog('활성 캐릭터 없음'); break; }
                const cl = getClassLine(active.classLineId);
                const unlocked: string[] = [];
                if (cl) {
                    for (let t = 1; t <= active.currentTier; t++) {
                        const ids = cl.skillUnlocks[t];
                        if (ids) unlocked.push(...ids);
                    }
                }
                this.magicUI.show(active.classLineId, active.currentTier, this.playerStats.mp, this.playerStats.maxMp, unlocked);
                break;
            }
            case 'rest':
                this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 5);
                this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + 3);
                this.addCombatLog('휴식: HP +5, MP +3 회복');
                this.consumeAction();
                this.autoSwitchToReady();
                break;
        }
    }

    private performAttack(target: Enemy): void {
        const defTile = this.tiles[target.gridY]?.[target.gridX] ?? 0;
        const result = CombatFormulas.calcPhysicalDamage(this.playerStats, target.stats, defTile as any);

        // Directional bonus
        const dirBonus = CombatFormulas.getDirectionalMultiplier(
            this.player.gridX, this.player.gridY, target.gridX, target.gridY, target.facing
        );
        if (!result.isMiss) result.damage = Math.max(1, Math.floor(result.damage * dirBonus.multiplier));

        if (result.isMiss) {
            this.addCombatLog(`빗나감! ${target.name} 공격 실패`);
            this.floatingText.spawnDamage(target.gridX, target.gridY, 0, false, true);
            sfxMiss();
        } else {
            const dead = target.takeDamage(result.damage);
            const critText = result.isCrit ? ' CRIT!' : '';
            const dirText = dirBonus.label ? ` [${dirBonus.label}]` : '';
            this.addCombatLog(`${target.name}에게 ${result.damage} 데미지!${critText}${dirText} (HP: ${target.stats.hp}/${target.stats.maxHp})`);
            this.floatingText.spawnDamage(target.gridX, target.gridY, result.damage, result.isCrit, false);
            if (result.isCrit) sfxCritical(); else sfxHit();

            if (dead) this.handleEnemyKill(target);
        }

        this.selectedTarget = target;
        const activeChar = this.party.getActive();
        if (activeChar) activeChar.tickBuffs();
        this.consumeAction();
        this.autoSwitchToReady();
    }

    private castSkill(skill: Skill, target?: Enemy): void {
        const activeChar = this.party.getActive();
        if (!activeChar) return;
        if (this.playerStats.mp < skill.mpCost) {
            this.addCombatLog(`MP 부족! (${skill.mpCost} 필요)`);
            return;
        }

        this.playerStats.mp -= skill.mpCost;

        switch (skill.type) {
            case 'heal': {
                // Special skill branches
                if (skill.id === 'alc_t4') {
                    // Alchemist ether convert (uses HP → MP)
                    const hpCost = Math.floor(this.playerStats.maxHp * 0.2);
                    this.playerStats.hp = Math.max(1, this.playerStats.hp - hpCost);
                    const mpGain = Math.floor(this.playerStats.magAtk * skill.power);
                    this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + mpGain);
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP -${hpCost}, MP +${mpGain}`);
                } else if (skill.id === 'cle_t7' || skill.id === 'shr_t7') {
                    // Full HP + MP restore
                    this.playerStats.hp = this.playerStats.maxHp;
                    this.playerStats.mp = this.playerStats.maxMp;
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP/MP 전회복!`);
                } else if (skill.id === 'alc_t6') {
                    // Sage potion: HP + MP
                    const healAmt = Math.floor(this.playerStats.magAtk * skill.power);
                    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmt);
                    this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + Math.floor(healAmt * 0.5));
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP +${healAmt}, MP +${Math.floor(healAmt * 0.5)}`);
                } else {
                    const healAmt = Math.floor(this.playerStats.magAtk * skill.power);
                    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmt);
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP +${healAmt} 회복`);
                    this.floatingText.spawnHeal(this.player.gridX, this.player.gridY, healAmt);
                    sfxHeal();
                    this.effectManager.spawnHealEffect(this.player.gridX, this.player.gridY);
                }
                break;
            }
            case 'buff': {
                activeChar.applyBuff(skill);
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: 버프/보호 발동!`);
                sfxBuff();
                this.effectManager.spawnBuffEffect(this.player.gridX, this.player.gridY);
                break;
            }
            case 'debuff': {
                if (!target) { this.addCombatLog('대상 없음!'); return; }
                const reduction = skill.power;
                const atkDmg = Math.floor(target.stats.atk * (1 - reduction));
                target.stats.atk = Math.max(1, target.stats.atk - atkDmg);
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: ${target.name} ATK -${atkDmg}`);
                const dmg = Math.floor(this.playerStats.magAtk * 0.5);
                const dead = target.takeDamage(dmg);
                this.floatingText.spawnDamage(target.gridX, target.gridY, dmg, false, false);
                this.addCombatLog(`${target.name}에게 ${dmg} 추가 피해`);
                sfxDebuff();
                this.effectManager.spawnDebuffEffect(target.gridX, target.gridY);
                if (dead) this.handleEnemyKill(target);
                break;
            }
            case 'damage': {
                if (!target) { this.addCombatLog('대상 없음!'); return; }
                const isPhysical = skill.element === 'physical';
                const baseAtk = isPhysical ? this.playerStats.atk : this.playerStats.magAtk;
                const baseDef = isPhysical ? target.stats.def : target.stats.magDef;
                const rawDmg = Math.floor(baseAtk * skill.power - baseDef * 0.5);
                const dmg = Math.max(1, rawDmg);
                const dead = target.takeDamage(dmg);
                this.floatingText.spawnDamage(target.gridX, target.gridY, dmg, false, false);
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: ${target.name}에게 ${dmg} 피해! (HP: ${target.stats.hp}/${target.stats.maxHp})`);
                if (skill.id === 'og_hpdrain' || skill.id === 'og_mpdrain') { sfxDrain(); this.effectManager.spawnDarkEffect(target.gridX, target.gridY); }
                else { sfxByElement(skill.element); this.effectManager.spawnByElement(skill.element, target.gridX, target.gridY); }
                if (dead) this.handleEnemyKill(target);
                break;
            }
            case 'aoe': {
                if (!target) { this.addCombatLog('대상 없음!'); return; }
                const isPhys = skill.element === 'physical';
                const atkStat = isPhys ? this.playerStats.atk : this.playerStats.magAtk;
                const targets: Enemy[] = [];
                for (const e of this.enemies) {
                    const dx = Math.abs(e.gridX - target.gridX);
                    const dy = Math.abs(e.gridY - target.gridY);
                    if (dx <= skill.aoeRadius && dy <= skill.aoeRadius) targets.push(e);
                }
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: ${targets.length}체 대상!`);
                if (skill.id === 'og_meteor') sfxMeteor(); else sfxByElement(skill.element);
                this.effectManager.spawnByElement(skill.element, target.gridX, target.gridY);
                const killList: Enemy[] = [];
                for (const t of targets) {
                    const tDef = isPhys ? t.stats.def : t.stats.magDef;
                    const rawD = Math.floor(atkStat * skill.power - tDef * 0.5);
                    const d = Math.max(1, rawD);
                    const dead = t.takeDamage(d);
                    this.floatingText.spawnDamage(t.gridX, t.gridY, d, false, false);
                    this.addCombatLog(`  ${t.name}: ${d} 피해 (HP: ${t.stats.hp}/${t.stats.maxHp})`);
                    if (dead) killList.push(t);
                }
                for (const k of killList) this.handleEnemyKill(k);
                break;
            }
        }

        if (activeChar) activeChar.tickBuffs();
        this.consumeAction();
        this.magicUI.hide();
        this.autoSwitchToReady();
    }

    private handleEnemyKill(enemy: Enemy): void {
        sfxKill();
        this.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, enemy.expReward, enemy.image);
        this.addCombatLog(`${enemy.name} 처치! +${enemy.expReward} EXP`);

        const active = this.party.getActive();
        if (active) {
            const expResult = active.gainExp(enemy.expReward);
            if (expResult.leveledUp) {
                this.addCombatLog(`${active.name} 레벨 업! Lv.${active.level}`);
                this.playerStats = active.stats;
                sfxLevelUp();
            }
            if (expResult.promoted) {
                this.addCombatLog(`⚡ ${active.name} 승급! → ${expResult.newTierName}`);
                this.triggerPromotionFlash();
                sfxPromotion();
            }
        }

        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);

        // Check win condition: all enemies dead
        if (this.enemies.length === 0) {
            setTimeout(() => {
                this.gameManager.completeBattle(this.stage.rewards, this.stage.id);
            }, 1000);
        }
    }

    private processEnemyTurn(enemy: Enemy, targetPlayer: Player = this.player): void {
        const targetIdx = this.partyPlayers.indexOf(targetPlayer);
        const members = this.party.getCharacters();
        const targetChar = members[targetIdx];
        if (!targetChar || targetChar.isDead) return;

        const dist = Math.abs(enemy.gridX - targetPlayer.gridX) + Math.abs(enemy.gridY - targetPlayer.gridY);

        if (dist <= 1) {
            // Attack
            const defTile = this.tiles[targetPlayer.gridY]?.[targetPlayer.gridX] ?? 0;
            const result = CombatFormulas.calcPhysicalDamage(enemy.stats, targetChar.stats, defTile as any);
            const dirBonus = CombatFormulas.getDirectionalMultiplier(
                enemy.gridX, enemy.gridY, targetPlayer.gridX, targetPlayer.gridY, targetPlayer.facing
            );
            if (!result.isMiss) result.damage = Math.max(1, Math.floor(result.damage * dirBonus.multiplier));

            if (!result.isMiss) {
                targetChar.stats.hp = Math.max(0, targetChar.stats.hp - result.damage);
                if (targetPlayer === this.player) this.playerStats = targetChar.stats;
                this.addCombatLog(`${enemy.name}이(가) ${result.damage} 데미지! [${targetChar.name}]`);
                this.floatingText.spawnDamage(targetPlayer.gridX, targetPlayer.gridY, result.damage, result.isCrit, false);
                if (result.isCrit) sfxCritical(); else sfxHit();

                if (targetChar.stats.hp <= 0) {
                    targetChar.isDead = true;
                    targetChar.exp = 0;
                    this.addCombatLog(`${targetChar.name} 사망!!`);
                    if (targetPlayer === this.player) {
                        const nextChar = this.party.markActiveDead();
                        if (nextChar) {
                            const nextIdx = members.indexOf(nextChar);
                            this.playerStats = nextChar.stats;
                            this.player = this.partyPlayers[nextIdx];
                            this.addCombatLog(`${nextChar.name} (으)로 교체!`);
                        } else {
                            this.addCombatLog('출격조 전원 사망!');
                            setTimeout(() => this.gameManager.failBattle(), 1500);
                        }
                    } else if (this.party.isSquadWiped()) {
                        this.addCombatLog('출격조 전원 사망!');
                        setTimeout(() => this.gameManager.failBattle(), 1500);
                    }
                }
            } else {
                this.addCombatLog(`${enemy.name} 공격 빗나감!`);
                this.floatingText.spawnDamage(targetPlayer.gridX, targetPlayer.gridY, 0, false, true);
                sfxMiss();
            }
        } else {
            // Move toward player
            const dx = targetPlayer.gridX - enemy.gridX;
            const dy = targetPlayer.gridY - enemy.gridY;
            let nx = enemy.gridX, ny = enemy.gridY;
            if (Math.abs(dx) >= Math.abs(dy)) nx += Math.sign(dx);
            else ny += Math.sign(dy);

            if (this.isBattleTileWalkable(nx, ny) && !this.isOccupied(nx, ny)) {
                if (nx > enemy.gridX) enemy.facing = 'right';
                else if (nx < enemy.gridX) enemy.facing = 'left';
                else if (ny > enemy.gridY) enemy.facing = 'down';
                else if (ny < enemy.gridY) enemy.facing = 'up';
                enemy.gridX = nx;
                enemy.gridY = ny;
            }
        }
    }

    private consumeAction(): void {
        this.player.actionGauge = 0;
        this.playerTurnActive = false;
        this.actionMenuOpen = false;
        this.actionMenuUI.close();

        // Heal Ring: 10% HP recovery on every action
        const active = this.party.getActive();
        if (active) {
            const hasHealRing = Array.from(active.equipment.values()).some(
                p => p.item.id === 'heal_ring'
            );
            if (hasHealRing) {
                const healAmt = Math.floor(active.stats.maxHp * 0.1);
                active.stats.hp = Math.min(active.stats.maxHp, active.stats.hp + healAmt);
                this.playerStats = active.stats;
                this.addCombatLog(`💚 힐 링: HP +${healAmt} 회복`);
                this.floatingText.spawnHeal(this.player.gridX, this.player.gridY, healAmt);
            }
        }
    }

    /** Switch control to a specific party member */
    private switchToPartyMember(idx: number): void {
        if (idx < 0 || idx >= this.partyPlayers.length) return;
        this.party.switchTo(idx);
        const active = this.party.getActive();
        if (active) {
            this.player = this.partyPlayers[idx];
            this.playerStats = active.stats;
            this.selectedTarget = this.player;
            this.addCombatLog(`${active.name} (으)로 교체!`);
            this.playerTurnActive = (this.player.actionGauge >= 100);
            // Reset all active modes
            this.moveMode = false; this.walkableTiles.clear();
            this.attackMode = false; this.attackableTiles.clear();
            this.magicTargetMode = false; this.magicTargetTiles.clear();
            this.pendingSkill = null;
            this.actionMenuOpen = false; this.actionMenuUI.close();
            this.camera.followTile(this.player.gridX, this.player.gridY);
            this.camera.snapToTarget();
        }
    }

    /** Auto-switch to next party member whose ATB is full */
    private autoSwitchToReady(): void {
        if (this.partyPlayers.length <= 1) return;
        const members = this.party.getCharacters();
        const currentIdx = this.partyPlayers.indexOf(this.player);
        for (let offset = 1; offset < this.partyPlayers.length; offset++) {
            const idx = (currentIdx + offset) % this.partyPlayers.length;
            if (members[idx] && !members[idx].isDead && this.partyPlayers[idx].actionGauge >= 100) {
                this.switchToPartyMember(idx);
                return;
            }
        }
    }

    /** Trigger promotion flash effect */
    private triggerPromotionFlash(): void {
        this.promotionFlashTimer = 1.5;
        this.promotionFlashPlayerIdx = this.partyPlayers.indexOf(this.player);
    }

    // ═══════════════════════════════════════════════════════════
    //  Tile helpers
    // ═══════════════════════════════════════════════════════════

    private isBattleTileWalkable(x: number, y: number): boolean {
        if (x < 0 || y < 0 || y >= this.stage.height || x >= this.stage.width) return false;
        return STAGE_TILE_WALKABLE[this.tiles[y][x]] ?? false;
    }

    private isOccupied(x: number, y: number): boolean {
        return this.partyPlayers.some(p => p.gridX === x && p.gridY === y) ||
               this.enemies.some(e => e.gridX === x && e.gridY === y);
    }

    /** BFS walkable tiles (walls block path) */
    private computeWalkableTiles(startX: number, startY: number, range: number): Set<string> {
        const result = new Set<string>();
        const queue: { x: number; y: number; dist: number }[] = [{ x: startX, y: startY, dist: 0 }];
        const visited = new Set<string>();
        visited.add(`${startX},${startY}`);

        while (queue.length > 0) {
            const { x, y, dist } = queue.shift()!;
            if (dist > 0) result.add(`${x},${y}`);
            if (dist >= range) continue;

            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            for (const [ddx, ddy] of dirs) {
                const nx = x + ddx, ny = y + ddy;
                const key = `${nx},${ny}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (this.isBattleTileWalkable(nx, ny) && !this.isOccupied(nx, ny)) {
                    queue.push({ x: nx, y: ny, dist: dist + 1 });
                }
            }
        }
        return result;
    }

    private computeAttackableTiles(cx: number, cy: number, range: number): Set<string> {
        const tiles = new Set<string>();
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
        for (const [dx, dy] of dirs) {
            for (let r = 1; r <= range; r++) {
                tiles.add(`${cx + dx * r},${cy + dy * r}`);
            }
        }
        return tiles;
    }

    private addCombatLog(msg: string): void {
        this.combatLog.push(msg);
        if (this.combatLog.length > 200) this.combatLog.shift();
        this.logScrollOffset = 0;
    }

    // ═══════════════════════════════════════════════════════════
    //  Render
    // ═══════════════════════════════════════════════════════════

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();
        const zoom = camera.zoom;

        // Dark background
        ctx.fillStyle = '#0a0c1a';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(zoom, zoom);

        const renderW = Math.ceil(width / zoom);
        const renderH = Math.ceil(height / zoom);

        // ─── Render stage tiles ─────────────────────
        for (let ty = 0; ty < this.stage.height; ty++) {
            for (let tx = 0; tx < this.stage.width; tx++) {
                const tileType = this.tiles[ty][tx];
                const sx = tx * TILE_SIZE - camX;
                const sy = ty * TILE_SIZE - camY;

                // Skip off-screen tiles
                if (sx > renderW || sy > renderH || sx + TILE_SIZE < 0 || sy + TILE_SIZE < 0) continue;

                ctx.fillStyle = STAGE_TILE_COLORS[tileType] || '#333';
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(sx, sy, TILE_SIZE, TILE_SIZE);
            }
        }

        // ─── Render highlights (using GridRenderer) ─────────────────────
        if (this.moveMode && this.walkableTiles.size > 0) {
            this.gridRenderer.renderWalkableTiles(ctx, this.walkableTiles, camX, camY, 'rgba(255, 200, 0, 0.20)', 'rgba(255, 200, 0, 0.6)');
        } else if (this.attackMode && this.attackableTiles.size > 0) {
            this.gridRenderer.renderWalkableTiles(ctx, this.attackableTiles, camX, camY, 'rgba(255, 60, 60, 0.25)', 'rgba(255, 60, 60, 0.7)');
        } else if (this.magicTargetMode && this.magicTargetTiles.size > 0) {
            this.gridRenderer.renderWalkableTiles(ctx, this.magicTargetTiles, camX, camY, 'rgba(180, 80, 255, 0.25)', 'rgba(180, 80, 255, 0.7)');
        } else if (this.isHoveringPlayer || this.actionMenuOpen) {
            this.gridRenderer.renderRange(ctx, this.player.gridX, this.player.gridY, this.player.moveRange, camX, camY, 'rgba(255, 200, 0, 0.15)', 'rgba(255, 200, 0, 0.5)');
        }

        // Hover tile highlight
        this.gridRenderer.renderHoverTile(ctx, this.hoverTileX, this.hoverTileY, camX, camY);

        // ─── Render enemies (using GridRenderer) ─────────────────────
        for (const enemy of this.enemies) {
            const eColor = enemy.isAggro ? '#ff1744' : enemy.color;
            this.gridRenderer.renderEntity(ctx, enemy, camX, camY, eColor);

            // HP bar above enemy
            const sx = enemy.pixelX * TILE_SIZE - camX;
            const sy = enemy.pixelY * TILE_SIZE - camY - 6;
            const barW = TILE_SIZE - 8;
            const hpRatio = enemy.stats.hp / enemy.stats.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx + 4, sy, barW, 4);
            ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : hpRatio > 0.2 ? '#ff9800' : '#f44336';
            ctx.fillRect(sx + 4, sy, barW * hpRatio, 4);

            // Boss crown
            if (enemy.isBoss) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('👑', sx + TILE_SIZE / 2, sy - 4);
                ctx.textAlign = 'start';
            }

            // Selection border
            if (this.selectedTarget === enemy && this.selectBorderImg.complete) {
                const ex = enemy.pixelX * TILE_SIZE - camX;
                const ey = enemy.pixelY * TILE_SIZE - camY;
                const pad = 4;
                ctx.drawImage(this.selectBorderImg, ex - pad, ey - pad, TILE_SIZE + pad * 2, TILE_SIZE + pad * 2);
            }
        }

        // ─── Render party players (using GridRenderer) ─────────────────────
        for (const p of this.partyPlayers) {
            this.gridRenderer.renderEntity(ctx, p, camX, camY);

            // Highlight active player
            if (p === this.player) {
                const px = p.gridX * TILE_SIZE - camX;
                const py = p.gridY * TILE_SIZE - camY;
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
            }

            // Selection border
            if (this.selectedTarget === p && this.selectBorderImg.complete) {
                const spx = p.gridX * TILE_SIZE - camX;
                const spy = p.gridY * TILE_SIZE - camY;
                const pad = 4;
                ctx.drawImage(this.selectBorderImg, spx - pad, spy - pad, TILE_SIZE + pad * 2, TILE_SIZE + pad * 2);
            }
        }

        // Effects + floating text
        this.effectManager.render(ctx, camera);
        this.floatingText.render(ctx, camX, camY);

        // Action menu or ready indicator
        const playerSX = this.player.gridX * TILE_SIZE - camX;
        const playerSY = this.player.gridY * TILE_SIZE - camY;
        if (this.actionMenuOpen) {
            this.actionMenuUI.render(ctx, playerSX, playerSY, this.playerTurnActive);
        } else if (this.playerTurnActive) {
            this.actionMenuUI.renderReadyIndicator(ctx, playerSX, playerSY);
        }

        // Promotion flash effect
        if (this.promotionFlashTimer > 0 && this.promotionFlashPlayerIdx >= 0) {
            const flashPlayer = this.partyPlayers[this.promotionFlashPlayerIdx];
            if (flashPlayer) {
                const fx = flashPlayer.gridX * TILE_SIZE - camX;
                const fy = flashPlayer.gridY * TILE_SIZE - camY;
                const cx = fx + TILE_SIZE / 2;
                const cy = fy + TILE_SIZE / 2;
                const t = this.promotionFlashTimer / 1.5;
                const alpha = t * 0.8;
                const radius = TILE_SIZE * (2.5 - t * 1.5);

                ctx.save();
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                grad.addColorStop(0, `rgba(255, 255, 100, ${alpha})`);
                grad.addColorStop(0.4, `rgba(255, 200, 50, ${alpha * 0.6})`);
                grad.addColorStop(1, `rgba(255, 150, 0, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();

                // Star sparkles
                const time = 1.5 - this.promotionFlashTimer;
                for (let i = 0; i < 8; i++) {
                    const angle = (Math.PI * 2 / 8) * i + time * 3;
                    const dist = TILE_SIZE * (0.5 + time * 1.2);
                    const sparkX = cx + Math.cos(angle) * dist;
                    const sparkY = cy + Math.sin(angle) * dist;
                    const size = 3 + Math.sin(time * 10 + i) * 2;
                    ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, size, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.font = 'bold 16px "DOSMyungjo", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(255, 255, 100, ${alpha})`;
                ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                ctx.lineWidth = 3;
                const textY = cy - TILE_SIZE - (1 - t) * 30;
                ctx.strokeText('⚡ 승급!', cx, textY);
                ctx.fillText('⚡ 승급!', cx, textY);
                ctx.restore();
            }
        }

        ctx.restore();

        // ═══ HUD (scaled) ═══
        ctx.save();
        ctx.scale(scale, scale);
        const vw = Math.floor(width / scale);
        const vh = Math.floor(height / scale);

        // Stage name + info panel
        const panelX = 16;
        const panelW = 210;
        let curY = 12;

        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold 14px "DOSMyungjo", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`⚔ ${this.stage.nameKr}`, panelX, curY);
        curY += 22;

        // Player info panel
        const active = this.party.getActive();
        if (active) {
            const infoH = 58;
            drawParchmentPanel(ctx, panelX, curY, panelW, infoH);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 11px ${UI.fontMono}`;
            ctx.textAlign = 'left';
            ctx.fillText(`${active.name} Lv.${active.level}`, panelX + 12, curY + 10);

            // HP bar
            const barX = panelX + 12;
            const barW = panelW - 24;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(barX, curY + 26, barW, 8);
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(barX, curY + 26, barW * (this.playerStats.hp / this.playerStats.maxHp), 8);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `9px ${UI.fontMono}`;
            ctx.fillText(`HP ${this.playerStats.hp}/${this.playerStats.maxHp}`, barX, curY + 24);

            // MP bar
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(barX, curY + 40, barW, 8);
            ctx.fillStyle = '#2196f3';
            ctx.fillRect(barX, curY + 40, barW * (this.playerStats.mp / this.playerStats.maxMp), 8);
            ctx.fillStyle = Parchment.textDark;
            ctx.fillText(`MP ${this.playerStats.mp}/${this.playerStats.maxMp}`, barX, curY + 38);

            curY += infoH + 6;
        }

        // Party ATB bars
        const members = this.party.getCharacters();
        for (let i = 0; i < this.partyPlayers.length; i++) {
            const p = this.partyPlayers[i];
            const ch = members[i];
            if (!ch || ch.isDead) continue;
            const isActive = (p === this.player);
            drawGlassPanel(ctx, panelX, curY, panelW, 18, { radius: 3, shadow: false, bg: 'rgba(12, 14, 24, 0.5)' });
            ctx.fillStyle = isActive ? UI.textAccent : UI.textSecondary;
            ctx.font = `9px ${UI.fontMono}`;
            ctx.textAlign = 'left';
            ctx.fillText(`${ch.name}`, panelX + 4, curY + 12);
            // ATB bar
            const atbX = panelX + 80;
            const atbW = panelW - 84;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(atbX, curY + 4, atbW, 10);
            const atbColor = p.actionGauge >= 100 ? '#39ff14' : '#e67e22';
            ctx.fillStyle = atbColor;
            ctx.fillRect(atbX, curY + 4, atbW * (p.actionGauge / 100), 10);
            if (p.actionGauge >= 100) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold 8px ${UI.fontMono}`;
                ctx.textAlign = 'center';
                ctx.fillText('준비!', atbX + atbW / 2, curY + 12);
                ctx.textAlign = 'left';
            }
            curY += 20;
        }

        // EntityInfoUI position
        this.entityInfoUI.setPosition(panelX, curY + 4);

        // Entity info display
        if (this.selectedTarget) {
            let displayInfo: EntityDisplayInfo;
            const partyIdx = this.partyPlayers.indexOf(this.selectedTarget as Player);
            if (this.selectedTarget === this.player) {
                displayInfo = {
                    name: active ? active.name : '지휘관', level: active ? active.level : 1,
                    hp: this.playerStats.hp, maxHp: this.playerStats.maxHp,
                    mp: this.playerStats.mp, maxMp: this.playerStats.maxMp,
                    actionGauge: this.player.actionGauge,
                    exp: active ? active.exp : 0, maxExp: active ? active.expToNext : 100,
                    buffs: active ? active.buffs.map(b => b.icon) : [],
                    atk: this.playerStats.atk, def: this.playerStats.def,
                    magAtk: this.playerStats.magAtk, magDef: this.playerStats.magDef,
                    spriteColor: this.player.color, spriteImage: active?.portraitImage
                };
            } else if (partyIdx >= 0) {
                const charData = members[partyIdx];
                const pp = this.partyPlayers[partyIdx];
                if (charData) {
                    displayInfo = {
                        name: charData.name, level: charData.level,
                        hp: charData.stats.hp, maxHp: charData.stats.maxHp,
                        mp: charData.stats.mp, maxMp: charData.stats.maxMp,
                        actionGauge: pp.actionGauge,
                        exp: charData.exp, maxExp: charData.expToNext,
                        buffs: charData.buffs.map(b => b.icon),
                        atk: charData.stats.atk, def: charData.stats.def,
                        magAtk: charData.stats.magAtk, magDef: charData.stats.magDef,
                        spriteColor: pp.color, spriteImage: charData.portraitImage
                    };
                } else {
                    displayInfo = { name: '파티원', level: 1, hp: 100, maxHp: 100, mp: 0, maxMp: 0, actionGauge: pp.actionGauge, buffs: [], atk: 0, def: 0, magAtk: 0, magDef: 0, spriteColor: pp.color };
                }
            } else {
                const enemy = this.selectedTarget as Enemy;
                displayInfo = {
                    name: enemy.name || enemy.label, level: enemy.level,
                    hp: enemy.stats.hp, maxHp: enemy.stats.maxHp,
                    mp: enemy.stats.mp, maxMp: enemy.stats.maxMp,
                    actionGauge: enemy.actionGauge, buffs: [],
                    atk: enemy.stats.atk, def: enemy.stats.def,
                    magAtk: enemy.stats.magAtk, magDef: enemy.stats.magDef,
                    spriteColor: enemy.color
                };
            }
            this.entityInfoUI.render(ctx, displayInfo);
        }

        // Turn indicator
        if (this.playerTurnActive) {
            const pulse = 0.6 + Math.sin(performance.now() / 300) * 0.4;
            ctx.fillStyle = `rgba(0, 255, 136, ${pulse})`;
            ctx.font = `bold 14px "DOSMyungjo", sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('⚡ YOUR TURN', vw / 2, 20);
        }

        // Mode indicators
        if (this.moveMode) {
            ctx.fillStyle = 'rgba(0, 150, 255, 0.8)';
            ctx.font = `12px ${UI.fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText('🚶 이동할 타일을 클릭 (ESC 취소)', vw / 2, vh - 50);
        }
        if (this.attackMode) {
            ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
            ctx.font = `12px ${UI.fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText('⚔ 공격할 적을 클릭 (ESC 취소)', vw / 2, vh - 50);
        }
        if (this.magicTargetMode) {
            ctx.fillStyle = 'rgba(200, 50, 255, 0.8)';
            ctx.font = `12px ${UI.fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText('✨ 마법 대상을 클릭 (ESC 취소)', vw / 2, vh - 50);
        }

        // ─── Combat log (scrollable) ───────────────────
        this.renderCombatLog(ctx, vw, vh);

        // Magic UI overlay
        if (this.magicUI.isVisible()) {
            this.magicUI.render(ctx, vw, vh);
        }

        // Minimap (right side)
        this.minimapUI.render(ctx, vw, 114);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    private renderCombatLog(ctx: CanvasRenderingContext2D, _vw: number, canvasH: number): void {
        if (this.combatLog.length === 0) return;
        const logX = 12;
        const lineH = 18;
        const visibleLines = 5;
        const logH = visibleLines * lineH + 16;
        const logY = canvasH - logH - 12;
        const logW = 360;

        // Scroll via mouse wheel when hovered
        const mx = this.input.mouseScreenX;
        const my = this.input.mouseScreenY;
        const isHovered = mx >= logX && mx <= logX + logW && my >= logY && my <= logY + logH;
        if (isHovered && this.input.mouseWheelDelta !== 0) {
            this.logScrollOffset += this.input.mouseWheelDelta > 0 ? -1 : 1;
            this.logScrollOffset = Math.max(0, Math.min(this.combatLog.length - visibleLines, this.logScrollOffset));
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(logX, logY, logW, logH);
        ctx.clip();

        const startIdx = Math.max(0, this.combatLog.length - visibleLines - this.logScrollOffset);
        const endIdx = Math.min(this.combatLog.length, startIdx + visibleLines);

        for (let i = startIdx; i < endIdx; i++) {
            const lineIdx = i - startIdx;
            const drawY = logY + 14 + lineIdx * lineH;
            const age = this.combatLog.length - 1 - i;
            const alpha = this.logScrollOffset > 0 ? 0.85 : Math.max(0.3, 0.9 - (age * 0.12));
            ctx.fillStyle = `rgba(232, 228, 222, ${alpha})`;
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.textAlign = 'left';
            ctx.fillText(this.combatLog[i], logX + 8, drawY);
        }
        ctx.restore();

        // Scroll indicator
        if (this.logScrollOffset > 0) {
            ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
            ctx.font = `bold 11px ${UI.fontPrimary}`;
            ctx.textAlign = 'right';
            ctx.fillText('⬇ 최근', logX + logW - 8, logY + logH - 4);
            ctx.textAlign = 'start';

            if (isHovered && this.input.mouseJustDown && my >= logY + logH - 18) {
                this.logScrollOffset = 0;
            }
        }
    }
}
