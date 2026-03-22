/**
 * GameEngine — the master orchestrator.
 * Manages the game loop with fixed timestep update + variable render.
 * Coordinates all subsystems: WorldMap, Camera, InputManager, Entities,
 * Inventory, Enemies, and Combat.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
import { WorldMap } from '../map/WorldMap';
import { GridRenderer } from '../map/GridRenderer';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import { ExtractionZone } from '../entity/ExtractionZone';
import { BossSpawner } from '../entity/BossSpawner';
import { RemotePlayer } from '../entity/RemotePlayer';
import { TILE_SIZE } from '../map/Chunk';
import { TILE_PROPERTIES } from '../map/Tile';
import { GridInventory } from '../inventory/GridInventory';
import { InventoryUI } from '../inventory/InventoryUI';
import { PartyUI } from '../ui/PartyUI'; // Added
import { EntityInfoUI, EntityDisplayInfo } from '../ui/EntityInfoUI';
import { Entity } from '../entity/Entity';
import { ActionMenuUI } from '../ui/ActionMenuUI';
import type { ActionType } from '../ui/ActionMenuUI';
import { CharacterCreationUI } from '../ui/CharacterCreationUI';
import { ITEMS, getItemDef } from '../data/ItemDB';
import { CombatFormulas } from '../combat/CombatFormulas';
import { createBaseStats } from '../data/Stats';
import { PartyManager } from '../character/PartyManager';
import { CharacterPanelUI } from '../character/CharacterPanelUI';
import { Character } from '../character/Character';
import { GameState } from './GameState';
import { LobbyUI } from '../ui/LobbyUI';
import { NetworkManager } from '../network/NetworkManager';
import { t, i18n } from '../i18n/LanguageManager';
import { UI, drawGlassPanel, drawBar, renderGameTitle, Parchment, drawParchmentPanel } from '../ui/UITheme';
import { SettingsUI } from '../ui/SettingsUI';
import { CursorManager } from '../ui/CursorManager';
import { MinimapUI } from '../ui/MinimapUI';
import { MagicUI } from '../ui/MagicUI';
import { Skill } from '../data/SkillDB';
import { FogOfWar } from '../map/FogOfWar';

export class GameEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isRunning: boolean = false;

    // Subsystems
    private camera: Camera;
    private input: InputManager;
    private worldMap: WorldMap;
    private gridRenderer: GridRenderer;
    private player: Player;
    private partyPlayers: Player[] = [];
    // private turnManager: TurnManager; // Temporarily unused in extraction MVP

    // Phase 3: Inventory
    private inventory: GridInventory;
    private inventoryUI: InventoryUI;
    private partyUI: PartyUI; // Added
    private entityInfoUI!: EntityInfoUI;
    private actionMenuUI!: ActionMenuUI;
    private isHoveringPlayer: boolean = false;
    private actionMenuOpen: boolean = false;
    private fogOfWar: FogOfWar = new FogOfWar();
    private minimapUI!: MinimapUI;

    // Click-to-move system
    private moveMode: boolean = false;
    private walkableTiles: Set<string> = new Set();

    // Click-to-attack system
    private attackMode: boolean = false;
    private attackableTiles: Set<string> = new Set();

    // Magic system
    private magicUI!: MagicUI;
    private magicTargetMode: boolean = false;
    private pendingSkill: Skill | null = null;
    private magicTargetTiles: Set<string> = new Set();

    // Emote system (no ATB cost)
    private emotePickerOpen: boolean = false;
    private activeEmote: string = '';
    private promotionFlashTimer: number = 0;  // countdown for promotion flash effect
    private promotionFlashPlayerIdx: number = -1; // which partyPlayer index is flashing
    private emoteTimer: number = 0;
    private readonly EMOTE_LIST = ['😀', '😂', '😎', '🤔', '😡', '❤️', '👍', '✌️', '🔥', '💀', '🎉', '😱'];

    // Quick-slot popup (no ATB cost)
    private quickSlotOpen: boolean = false;
    private qsPanelX: number = 0;
    private qsPanelY: number = 0;
    private qsPosSet: boolean = false;
    private qsDragging: boolean = false;
    private qsDragOffX: number = 0;
    private qsDragOffY: number = 0;

    // Phase 3: Enemies
    private enemies: Enemy[] = [];
    private combatLog: string[] = [];
    private logScrollOffset: number = 0;

    // Party System
    private party: PartyManager;
    private charUI: CharacterPanelUI;

    // Game State
    private state: GameState = GameState.CHARACTER_CREATION;
    private charCreateUI!: CharacterCreationUI;
    private lobbyUI: LobbyUI;
    private selectedTarget: Entity | null = null;

    // Selection & Gameover images
    private selectBorderImg: HTMLImageElement = Object.assign(new Image(), { src: '/Image/Etc/Select.png' });
    private gameoverBgImg: HTMLImageElement = Object.assign(new Image(), { src: '/Image/Background/Gameover.jpeg' });


    // Player combat stats
    private playerStats = createBaseStats({ mov: 4 });


    // Mouse hover
    private hoverTileX: number = 0;
    private hoverTileY: number = 0;

    // Performance
    private lastTime: number = 0;
    private fps: number = 0;

    // Raid Extraction
    private raidTimeRemaining: number = 0;
    private raidResult: 'WIN' | 'MIA' | 'DEAD' = 'WIN';
    private playerTurnActive: boolean = false;

    // Boss System
    private bossSpawner: BossSpawner;

    // Multiplayer
    private network: NetworkManager;
    private remotePlayers: Map<string, RemotePlayer> = new Map();
    private myNetworkId: string = '';
    // private playerNickname: string = '';

    // Gold currency
    private gold: number = 500;

    // Analytics
    private frameCount: number = 0;
    private fpsTimer: number = 0;

    // Canvas dimensions (for convenience, though local vars are used in render)
    private canvasW: number;
    private canvasH: number;

    // Settings Sync
    private lastSettingsVersion: number = 0;

    // Global Settings UI (available in all states)
    private settingsUI: SettingsUI = new SettingsUI();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = this.canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2D context');
        this.ctx = context;

        this.canvasW = canvas.width;
        this.canvasH = canvas.height;

        // Initialize subsystems
        this.resize();
        this.camera = new Camera(this.canvas.width, this.canvas.height);
        this.input = new InputManager(canvas);
        this.worldMap = new WorldMap();
        this.gridRenderer = new GridRenderer();

        // Apply custom sword cursor
        CursorManager.applySwordCursor(this.canvas);

        // Inventory
        this.inventory = new GridInventory(10, 6);
        this.inventoryUI = new InventoryUI(this.inventory);

        // Give player some starter items
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'short_sword')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'battle_t1_body')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'herb_cheap')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'herb_cheap')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'mp_potion')!);

        // Party System
        this.party = new PartyManager();
        // this.inventoryUI = new InventoryUI(this.inventory); // This line was duplicated, removed.
        this.charUI = new CharacterPanelUI(this.party);
        this.charUI.getGold = () => this.gold;
        this.partyUI = new PartyUI(this.party); // Added
        this.partyUI.onCharClick = (_char: Character) => {
            // Open character info panel from party click
            if (!this.charUI.isVisible()) this.charUI.toggle();
        };
        this.entityInfoUI = new EntityInfoUI();
        this.actionMenuUI = new ActionMenuUI();
        this.minimapUI = new MinimapUI({
            getTile: (gx, gy) => this.worldMap.getTileAt(gx, gy),
            getPlayerPos: () => ({ x: this.player.gridX, y: this.player.gridY }),
            getEnemies: () => this.enemies.map(e => ({
                gridX: e.gridX, gridY: e.gridY,
                color: e.color, isBoss: e.isBoss
            })),
            getExtractionZones: () => this.worldMap.extractionZones.map(z => ({
                centerX: z.x, centerY: z.y, radius: z.radius
            })),
            getLoot: () => this.worldMap.loot.map(l => ({
                gridX: l.x, gridY: l.y
            })),
        });

        // Magic UI
        this.magicUI = new MagicUI();
        this.magicUI.onSkillSelect = (skill: Skill) => {
            // Self-target skills: cast immediately
            if (skill.type === 'heal' || skill.type === 'buff') {
                this.castSkill(skill);
                return;
            }
            // Damage/debuff/aoe: enter target selection mode
            this.pendingSkill = skill;
            this.magicTargetMode = true;
            this.magicTargetTiles = this.computeAttackableTiles(
                this.player.gridX, this.player.gridY, skill.range
            );
            this.addCombatLog(`${skill.icon} ${skill.nameKr}: 대상을 선택하세요 (범위: ${skill.range})`);
        };
        // Boss Spawner
        this.bossSpawner = new BossSpawner();

        // Network Manager
        this.network = new NetworkManager();
        this.setupNetworkCallbacks();

        // Lobby UI
        this.lobbyUI = new LobbyUI(this.party, this.inventory);
        this.lobbyUI.onDeploy(() => {
            this.state = GameState.RAID;
            this.lobbyUI.toggle(); // hide lobby
            this.partyUI.isRaidMode = true;
            this.addCombatLog(t('log.deployed'));

            const members = this.party.getCharacters();
            this.partyPlayers = [];
            const colors = ['#00e5ff', '#ff00e5', '#e5ff00']; // Distinct colors for party members
            const spawnPositions = [
                { x: this.player.gridX, y: this.player.gridY },
                { x: this.player.gridX - 1, y: this.player.gridY },
                { x: this.player.gridX + 1, y: this.player.gridY },
                { x: this.player.gridX, y: this.player.gridY - 1 },
                { x: this.player.gridX, y: this.player.gridY + 1 }
            ];
            let posIdx = 0;
            
            for (let i = 0; i < members.length; i++) {
                let px = this.player.gridX;
                let py = this.player.gridY;
                for (let tries = posIdx; tries < spawnPositions.length; tries++) {
                     const nx = spawnPositions[tries].x;
                     const ny = spawnPositions[tries].y;
                     const tType = this.worldMap.getTileAt(nx, ny);
                     if (TILE_PROPERTIES[tType] && TILE_PROPERTIES[tType].walkable) {
                         px = nx;
                         py = ny;
                         posIdx = tries + 1;
                         break;
                     }
                }
                const p = new Player(px, py);
                p.label = members[i].name;
                p.color = colors[i % colors.length];
                // Set character sprite from Character's tier-based portrait
                const charPortrait = members[i].portraitImage?.src || '/Image/Character/fighter.png';
                p.setImage(charPortrait);
                this.partyPlayers.push(p);
            }
            if (this.partyPlayers.length > 0) {
                this.player = this.partyPlayers[0];
                this.party.switchTo(0);
                this.inventoryUI.setActiveCharacter(members[0]);
            }

            // Spawn some test loot
            this.worldMap.loot = [
                new LootObject('loot_1', this.player.gridX + 2, this.player.gridY + 1, [getItemDef('herb_common')!]),
                new LootObject('loot_2', this.player.gridX + 4, this.player.gridY + 2, [getItemDef('short_sword')!]),
                new LootObject('loot_3', this.player.gridX + 3, this.player.gridY + 3, [getItemDef('battle_t1_boots')!]),
            ];

            // Spawn an Extraction Zone randomly between 15-25 tiles away on walkable terrain
            let extX = 0, extY = 0;
            let attempts = 0;
            let found = false;
            while (!found && attempts < 100) {
                const signX = Math.random() > 0.5 ? 1 : -1;
                const signY = Math.random() > 0.5 ? 1 : -1;
                extX = this.player.gridX + signX * Math.floor(15 + Math.random() * 10);
                extY = this.player.gridY + signY * Math.floor(15 + Math.random() * 10);
                const tileType = this.worldMap.getTileAt(extX, extY);
                if (TILE_PROPERTIES[tileType] && TILE_PROPERTIES[tileType].walkable) {
                    found = true;
                }
                attempts++;
            }
            if (!found) { // fallback
                extX = this.player.gridX + 2;
                extY = this.player.gridY + 2;
            }
            
            this.worldMap.extractionZones = [
                new ExtractionZone(extX, extY, 2)
            ];

            // Spawn bosses independently via BossSpawner (NOT at extraction zone)
            this.bossSpawner.reset();
            const initialBosses = this.bossSpawner.spawnInitialBosses(
                this.player.gridX, this.player.gridY,
                (x, y) => this.worldMap.getTileAt(x, y)
            );
            this.enemies.push(...initialBosses);
            if (initialBosses.length > 0) {
                this.addCombatLog(t('raid.bossSpawn'));
            }

            this.raidTimeRemaining = 20 * 60; // 20 minutes
            this.fogOfWar.reset(); // Fresh fog for each raid
        });

        // Multiplayer connection callbacks
        this.lobbyUI.onConnect((url: string) => {
            this.connectToServer(url);
        });
        this.lobbyUI.onDisconnect(() => {
            this.disconnectFromServer();
        });
        this.network.onConnectionChange = (connected: boolean) => {
            this.lobbyUI.setConnectionStatus(connected, false);
        };

        // Shop integration
        const shopUI = this.lobbyUI.getShopUI();
        shopUI.getGold = () => this.gold;
        shopUI.onBuy = (item, price) => {
            if (this.gold < price) return false;
            const placed = this.inventory.autoPlace(item);
            if (!placed) return false;
            this.gold -= price;
            return true;
        };

        // Spawn player near world center
        this.player = new Player(0, 0);
        this.partyPlayers = [this.player];

        // Load initial chunks FIRST so terrain data exists for spawn search
        this.worldMap.updateLoadedChunks(0, 0);

        // Now find a walkable tile
        this.findWalkableSpawn();

        // Snap camera to player's actual spawn position
        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.snapToTarget();

        // Reload chunks centered on the actual spawn position
        const center = this.camera.getWorldCenter();
        this.worldMap.updateLoadedChunks(center.x, center.y);

        // Spawn some test enemies near the player
        this.spawnEnemiesAround(this.player.gridX, this.player.gridY, 5);

        // Static UI translation hook
        i18n.subscribe(() => {});

        // Resize handler
        window.addEventListener('resize', () => this.resize());

        // Initialize Character Creation
        this.charCreateUI = new CharacterCreationUI();
        this.charCreateUI.onComplete = (name, classId, gender) => {
            // this.playerNickname = name;
            this.player.label = name;
            // Use class tier name as character name
            const mainChar = new Character('char_main', '', classId);
            mainChar.name = mainChar.getTierName(); // e.g. 파이터, 나이트...
            mainChar.gender = gender;
            this.party.addToRoster(mainChar);
            this.party.deployCharacter(mainChar);
            
            // Link GameEngine combat stats to character stats to fix HP/MP sync delay
            this.playerStats = mainChar.stats;

            // Create starter roster characters using class tier names
            const cleric = new Character('char_cleric', '', 'cleric');
            cleric.name = cleric.getTierName();
            cleric.gender = 'F';
            const archer = new Character('char_archer', '', 'archer');
            archer.name = archer.getTierName();
            archer.gender = 'M';
            const shrine = new Character('char_shrine', '', 'shrine');
            shrine.name = shrine.getTierName();
            shrine.gender = 'F';
            const cavalry = new Character('char_cavalry', '', 'cavalry');
            cavalry.name = cavalry.getTierName();
            cavalry.gender = 'M';

            this.party.addToRoster(cleric);
            this.party.addToRoster(archer);
            this.party.addToRoster(shrine);
            this.party.addToRoster(cavalry);

            this.inventoryUI.setActiveCharacter(this.party.getActive()!);
            
            this.charCreateUI.destroy();
            this.state = GameState.LOBBY;
            this.lobbyUI.toggle();
        };
    }

    private spawnEnemiesAround(cx: number, cy: number, count: number): void {
        const namesEn = ['Slime', 'Goblin', 'Bat', 'Skeleton', 'Spider'];
        const namesKo = ['슬라임', '고블린', '박쥐', '스켈레톤', '거미'];
        const colors = ['#66bb6a', '#ff7043', '#ab47bc', '#bdbdbd', '#8d6e63'];
        const names = i18n.lang === 'ko' ? namesKo : namesEn;
        let spawned = 0;

        for (let r = 5; r < 30 && spawned < count; r++) {
            for (let dy = -r; dy <= r && spawned < count; dy++) {
                for (let dx = -r; dx <= r && spawned < count; dx++) {
                    if (Math.abs(dx) + Math.abs(dy) !== r) continue;
                    const tx = cx + dx;
                    const ty = cy + dy;
                    const tile = this.worldMap.getTileAt(tx, ty);
                    
                    const occupied = this.enemies.some(e => e.gridX === tx && e.gridY === ty) ||
                                     (this.player.gridX === tx && this.player.gridY === ty);

                    if (TILE_PROPERTIES[tile].walkable && !occupied && Math.random() < 0.15) {
                        const idx = spawned % names.length;
                        const level = 1 + Math.floor(Math.random() * 3);
                        this.enemies.push(new Enemy(
                            `enemy_${spawned}`, tx, ty,
                            names[idx], level, colors[idx]
                        ));
                        spawned++;
                    }
                }
            }
        }
    }

    private findWalkableSpawn(): void {
        for (let radius = 0; radius < 50; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const tile = this.worldMap.getTileAt(dx, dy);
                    if (TILE_PROPERTIES[tile].walkable) {
                        this.player.gridX = dx;
                        this.player.gridY = dy;
                        return;
                    }
                }
            }
        }
    }

    private resize(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvasW = this.canvas.width; // Added
        this.canvasH = this.canvas.height; // Added
        if (this.camera) {
            this.camera.setViewSize(this.canvas.width, this.canvas.height);
        }
    }

    public start(): void {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    public stop(): void {
        this.isRunning = false;
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;

        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.render();
        this.input.endFrame();

        requestAnimationFrame((t) => this.loop(t));
    }

    private update(dt: number): void {
        if (this.lastSettingsVersion !== SettingsManager.lastUpdated) {
            this.lastSettingsVersion = SettingsManager.lastUpdated;
            this.worldMap.markAllDirty();
        }

        // FPS counter
        this.frameCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 1.0) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        // ─── SETTINGS MODAL (Global — top priority) ──────────────
        const uiScale = SettingsManager.getUIScale();
        const smx = this.input.mouseScreenX / uiScale;
        const smy = this.input.mouseScreenY / uiScale;
        if (this.settingsUI.isVisible()) {
            if (this.input.mouseJustDown) {
                this.settingsUI.onMouseDown(smx, smy);
            }
            return;
        }

        // ─── SETTINGS BUTTON HIT TEST (top-right gear icon) ──────
        if (this.state !== GameState.LOBBY && this.input.mouseJustDown) {
            const vw = Math.floor(this.canvasW / uiScale);
            const btnX = vw - 60;
            const btnY = 10;
            if (smx >= btnX && smx <= btnX + 50 &&
                smy >= btnY && smy <= btnY + 36) {
                this.settingsUI.show();
                return;
            }
        }

        // ─── CHARACTER CREATION LOGIC ─────────────────────────────
        if (this.state === GameState.CHARACTER_CREATION) {
             this.charCreateUI.onMouseMove(smx, smy);
             if (this.input.mouseJustDown) {
                 this.charCreateUI.onMouseDown(smx, smy);
             }
             this.charCreateUI.updateInput(this.input);
             return;
        }

        // ─── LOBBY LOGIC ──────────────────────────────────────────
        if (this.state === GameState.LOBBY) {
            this.lobbyUI.updateInput(this.input);
            return; // Halt raid simulation while in lobby
        }

        // ─── RESULTS LOGIC ──────────────────────────────────────────
        if (this.state === GameState.RESULTS) {
            // Wait for input to return to lobby
            if (this.input.justPressed('Enter') || this.input.mouseJustDown) {
                this.returnToLobby();
            }
            return;
        }

        // ─── RAID LOGIC ───────────────────────────────────────────

        // Mouse wheel zoom (skip if hovering combat log area)
        if (this.input.mouseWheelDelta !== 0) {
            const logAreaX = 12, logAreaW = 360;
            const logAreaH = 5 * 18 + 16;
            const logAreaY = this.canvasH - logAreaH - 12;
            const mx = this.input.mouseScreenX;
            const my = this.input.mouseScreenY;
            const overLog = mx >= logAreaX && mx <= logAreaX + logAreaW && my >= logAreaY && my <= logAreaY + logAreaH;
            if (!overLog) {
                if (this.input.mouseWheelDelta > 0) this.camera.zoomOut();
                else this.camera.zoomIn();
            }
        }

        // Update loaded chunks based on camera position
        const worldCenter = this.camera.getWorldCenter();
        this.worldMap.updateLoadedChunks(worldCenter.x, worldCenter.y);

        this.raidTimeRemaining -= dt;
        if (this.raidTimeRemaining <= 0) {
            this.addCombatLog('MIA: Time limits exceeded!');
            this.processDeathPenalty();
            this.raidResult = 'MIA';
            this.state = GameState.RESULTS;
            return;
        }

        // ─── BOSS SPAWNER ─────────────────────────────────────────
        const bossCount = this.enemies.filter(e => e.isBoss).length;
        const newBosses = this.bossSpawner.update(
            dt, bossCount, this.player.gridX, this.player.gridY,
            (x, y) => this.worldMap.getTileAt(x, y)
        );
        if (newBosses.length > 0) {
            this.enemies.push(...newBosses);
            this.addCombatLog(t('raid.bossSpawn'));
        }

        // ─── ENTITY UPDATES AND ANIMATIONS ────────────────────────
        for (const p of this.partyPlayers) p.update(dt);
        for (const enemy of this.enemies) {
            enemy.update(dt);
        }
        for (const rp of this.remotePlayers.values()) {
            rp.updateInterpolation(dt);
            rp.update(dt);
        }

        // Cycle characters with Tab
        if (this.input.justPressed('Tab')) {
            const members = this.party.getCharacters();
            if (members.length > 1) {
                let nextIdx = (this.party.getActiveIndex() + 1) % members.length;
                const startIdx = nextIdx;
                while (members[nextIdx].isDead) {
                    nextIdx = (nextIdx + 1) % members.length;
                    if (nextIdx === startIdx) break;
                }
                this.switchToPartyMember(nextIdx);
            }
        }

        // Toggle inventory with I
        if (this.input.justPressed('KeyI')) {
            this.inventoryUI.toggle();
            if (this.inventoryUI.isVisible() && this.charUI.isVisible()) this.charUI.toggle(); // mutually exclusive
            if (this.inventoryUI.isVisible() && this.partyUI.isVisible()) this.partyUI.toggle(); // mutually exclusive
        }

        // C key — removed (character info now accessed via Party UI click)
        // Toggle party UI with P
        if (this.input.justPressed('KeyP')) {
            this.partyUI.toggle();
            if (this.partyUI.isVisible() && this.inventoryUI.isVisible()) this.inventoryUI.toggle(); // mutually exclusive
            if (this.partyUI.isVisible() && this.charUI.isVisible()) this.charUI.toggle(); // mutually exclusive
        }

        // Toggle minimap with M
        if (this.input.justPressed('KeyM')) {
            this.minimapUI.toggle();
        }

        // If magic UI is open, route input to it
        if (this.magicUI.isVisible()) {
            this.magicUI.updateMp(this.playerStats.mp);
            this.magicUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
            if (this.input.mouseJustDown) {
                this.magicUI.onMouseDown(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            if (this.input.mouseJustUp) {
                this.magicUI.onMouseUp();
            }
            if (this.input.mouseWheelDelta !== 0) {
                this.magicUI.onScroll(this.input.mouseWheelDelta);
            }
            return; // block game input while magic panel is open
        }

        // If any UI is open, route input to it and prevent game input
        if (this.inventoryUI.isVisible()) {
            this.inventoryUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
            if (this.input.mouseJustDown) {
                this.inventoryUI.onMouseDown(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            if (this.input.mouseJustUp) {
                this.inventoryUI.onMouseUp(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            return; // don't process game input while inventory is open
        }

        if (this.charUI.isVisible()) {
            this.charUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
            if (this.input.mouseClicked) {
                if (this.charUI.onClick(this.input.mouseScreenX, this.input.mouseScreenY)) {
                    // Switched character!
                    const active = this.party.getActive();
                    if (active) {
                        const idx = this.party.getCharacters().indexOf(active);
                        if (idx >= 0 && this.partyPlayers[idx]) {
                            this.player = this.partyPlayers[idx];
                            this.playerStats = active.stats;
                            this.playerTurnActive = (this.player.actionGauge >= 100);
                            this.actionMenuOpen = false;
                        }
                        this.addCombatLog(`Switched to ${active.name}`);
                        this.inventoryUI.setActiveCharacter(active);
                    }
                }
            }
            return; // don't process game input while character UI is open
        }

        if (this.partyUI.isVisible()) {
            this.partyUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
            if (this.input.mouseJustDown) {
                this.partyUI.onMouseDown(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            if (this.input.mouseJustUp) {
                this.partyUI.onMouseUp(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            return; // don't process game input while party UI is open
        }

        // Fill party member gauges
        const timeScale = 10;
        const members = this.party.getCharacters();
        for (let i = 0; i < this.partyPlayers.length; i++) {
            const p = this.partyPlayers[i];
            const char = members[i];
            if (!char || char.isDead) continue;
            
            // Only fill if not full, or if full but it's not the active player's turn waiting for input
            if (p !== this.player || !this.playerTurnActive) {
                p.actionGauge = Math.min(100, p.actionGauge + char.getCombatStats().spd * dt * timeScale);
                if (p === this.player && p.actionGauge >= 100) {
                    this.playerTurnActive = true;
                    p.actionGauge = 100;
                }
            }
        }

        // Fill enemy gauges — ALWAYS (independent of player turn)
        for (const enemy of this.enemies) {
            let inAggro = false;
            let closestDist = 999;
            let closestPlayer = this.player;
            for (const p of this.partyPlayers) {
                const char = members[this.partyPlayers.indexOf(p)];
                if (char && char.isDead) continue; // Ignore dead characters
                
                const dist = Math.abs(enemy.gridX - p.gridX) + Math.abs(enemy.gridY - p.gridY);
                if (dist <= enemy.aggroRange) {
                    inAggro = true;
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestPlayer = p;
                    }
                }
            }

            enemy.isAggro = inAggro;
            // Always fill ATB gauge so enemy can act autonomously 
            enemy.actionGauge = Math.min(100, enemy.actionGauge + enemy.stats.spd * dt * timeScale);
            
            if (enemy.actionGauge >= 100) {
                enemy.actionGauge = 0;
                if (inAggro) {
                    // Aggressive: attack/pursue closest player
                    this.processSingleEnemyTurn(enemy, closestPlayer);
                } else {
                    // Peaceful: random roaming
                    // 30% chance to just stand still
                    if (Math.random() > 0.3) {
                        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                        const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
                        const targetX = enemy.gridX + randomDir[0];
                        const targetY = enemy.gridY + randomDir[1];
                        const tile = this.worldMap.getTileAt(targetX, targetY);
                        
                        const isOccupied = (x: number, y: number) => {
                            return this.partyPlayers.some(p => p.gridX === x && p.gridY === y) ||
                                   this.enemies.some(e => e !== enemy && e.gridX === x && e.gridY === y);
                        };

                        if (TILE_PROPERTIES[tile] && TILE_PROPERTIES[tile].walkable && !isOccupied(targetX, targetY)) {
                            enemy.gridX = targetX;
                            enemy.gridY = targetY;
                        }
                    }
                }
            }
        }

        // ─── CANCEL MOVE/ATTACK MODE ─────────────────────────
        if (this.input.justPressed('Escape')) {
            if (this.moveMode) {
                this.moveMode = false;
                this.walkableTiles.clear();
                this.addCombatLog('이동 취소');
            }
            if (this.attackMode) {
                this.attackMode = false;
                this.attackableTiles.clear();
                this.addCombatLog('공격 취소');
            }
            if (this.emotePickerOpen) {
                this.emotePickerOpen = false;
            }
            if (this.quickSlotOpen) {
                this.quickSlotOpen = false;
            }
        }

        // ─── EMOTE TIMER ────────────────────────────────────
        if (this.emoteTimer > 0) {
            this.emoteTimer -= dt;
            if (this.emoteTimer <= 0) {
                this.activeEmote = '';
            }
        }

        // ─── PROMOTION FLASH TIMER ──────────────────────────
        if (this.promotionFlashTimer > 0) {
            this.promotionFlashTimer -= dt;
        }

        // Camera follow
        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.update();

        // Hover tile
        const hover = this.camera.screenToTile(this.input.mouseScreenX, this.input.mouseScreenY);
        this.hoverTileX = hover.tileX;
        this.hoverTileY = hover.tileY;

        // Track hover over player for movement range display
        this.isHoveringPlayer = (this.hoverTileX === this.player.gridX && this.hoverTileY === this.player.gridY);

        // Route mouse move to UI components for hover states
        this.entityInfoUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
        // Action menu renders in zoom-scaled world coords; convert mouse to match
        const zoomForInput = this.camera.zoom;
        this.actionMenuUI.onMouseMove(this.input.mouseScreenX / zoomForInput, this.input.mouseScreenY / zoomForInput);

        // Click to select target, action menu, emote picker, or move/attack
        if (this.input.mouseJustDown) {
            let hitUI = false;

            // Check quick-slot click
            if (this.quickSlotOpen) {
                const consumables = this.inventory.items.filter(p => p.item.slot === 'consumable');
                const slotW = 240;
                const rowH = 40;
                const headerH = 34;
                const panelH = headerH + Math.max(1, consumables.length) * rowH + 12;
                const mx = this.input.mouseScreenX / zoomForInput;
                const my = this.input.mouseScreenY / zoomForInput;

                // Outside panel → close
                if (mx < this.qsPanelX || mx > this.qsPanelX + slotW ||
                    my < this.qsPanelY || my > this.qsPanelY + panelH) {
                    this.quickSlotOpen = false;
                    hitUI = true;
                } else {
                    // Close button
                    if (mx >= this.qsPanelX + slotW - 24 && mx <= this.qsPanelX + slotW &&
                        my >= this.qsPanelY && my <= this.qsPanelY + 24) {
                        this.quickSlotOpen = false;
                        hitUI = true;
                    }
                    // Header drag
                    else if (my >= this.qsPanelY && my <= this.qsPanelY + headerH &&
                             mx >= this.qsPanelX && mx < this.qsPanelX + slotW - 24) {
                        this.qsDragging = true;
                        this.qsDragOffX = mx - this.qsPanelX;
                        this.qsDragOffY = my - this.qsPanelY;
                        hitUI = true;
                    }
                    // Item click
                    else {
                        let clickedItem = false;
                        for (let i = 0; i < consumables.length; i++) {
                            const iy = this.qsPanelY + headerH + i * rowH;
                            if (mx >= this.qsPanelX && mx < this.qsPanelX + slotW && my >= iy && my < iy + rowH) {
                                this.useConsumable(consumables[i]);
                                clickedItem = true;
                                break;
                            }
                        }
                        if (!clickedItem) {
                            // Clicked inside panel but not on an item — do nothing (don't close)
                        }
                        hitUI = true;
                    }
                }
            }

            // Check emote picker click
            if (this.emotePickerOpen) {
                const zPickerX = this.input.mouseScreenX / zoomForInput;
                const zPickerY = this.input.mouseScreenY / zoomForInput;
                const playerSX = this.player.gridX * TILE_SIZE - this.camera.x;
                const playerSY = this.player.gridY * TILE_SIZE - this.camera.y;
                const cols = 4;
                const emojiSize = 36;
                const gridW = cols * emojiSize;
                const rows = Math.ceil(this.EMOTE_LIST.length / cols);
                const gridH = rows * emojiSize;
                const gridX = playerSX + TILE_SIZE / 2 - gridW / 2;
                const gridY = playerSY - gridH - 20;
                const mx = zPickerX;
                const my = zPickerY;
                if (mx >= gridX && mx < gridX + gridW && my >= gridY && my < gridY + gridH) {
                    const col = Math.floor((mx - gridX) / emojiSize);
                    const row = Math.floor((my - gridY) / emojiSize);
                    const idx = row * cols + col;
                    if (idx >= 0 && idx < this.EMOTE_LIST.length) {
                        this.activeEmote = this.EMOTE_LIST[idx];
                        this.emoteTimer = 3;
                        this.emotePickerOpen = false;
                        this.addCombatLog(`감정표현: ${this.activeEmote}`);
                    }
                    hitUI = true;
                } else {
                    this.emotePickerOpen = false;
                    hitUI = true;
                }
            }

            // Check entity info close button
            if (this.selectedTarget && this.entityInfoUI.onClick(this.input.mouseScreenX, this.input.mouseScreenY)) {
                this.selectedTarget = null;
                hitUI = true;
            }

            // Check action menu click
            if (!hitUI && this.actionMenuOpen) {
                const action = this.actionMenuUI.onClick(this.input.mouseScreenX / zoomForInput, this.input.mouseScreenY / zoomForInput);
                if (action) {
                    this.executeAction(action);
                    hitUI = true;
                } else {
                    // Clicked outside menu — close it
                    this.actionMenuOpen = false;
                    this.actionMenuUI.close();
                    hitUI = true;
                }
            }

            // ─── MOVE MODE: Click-to-move ─────────────────────────
            if (!hitUI && this.moveMode) {
                const tileKey = `${this.hoverTileX},${this.hoverTileY}`;
                if (this.walkableTiles.has(tileKey)) {
                    // Move player to clicked tile
                    this.player.gridX = this.hoverTileX;
                    this.player.gridY = this.hoverTileY;
                    this.selectedTarget = this.player;

                    // Consume ATB
                    this.consumeAction();
                    this.playerTurnActive = false;
                    this.moveMode = false;
                    this.walkableTiles.clear();
                    this.actionMenuOpen = false;
                    this.actionMenuUI.close();

                    this.playerStats.mp = Math.min(this.playerStats.mp + 1, this.playerStats.maxMp);

                    // Update chunks
                    const worldX = this.player.gridX * TILE_SIZE + TILE_SIZE / 2;
                    const worldY = this.player.gridY * TILE_SIZE + TILE_SIZE / 2;
                    this.worldMap.updateLoadedChunks(worldX, worldY);
                    this.checkLootAndExtraction();
                    this.network.sendMove(this.player.gridX, this.player.gridY);
                    this.addCombatLog(`이동 완료 (${this.player.gridX}, ${this.player.gridY})`);

                    // Auto-switch to next ready character
                    this.autoSwitchToReady();
                } else {
                    // Clicked outside range — cancel move mode
                    this.moveMode = false;
                    this.walkableTiles.clear();
                    this.addCombatLog('이동 취소');
                }
                hitUI = true;
            }

            // ─── ATTACK MODE: Click-to-attack ─────────────────────
            if (!hitUI && this.attackMode) {
                const activeChar = this.party.getActive();
                const combatStats = activeChar ? activeChar.getCombatStats() : this.playerStats;
                const tileKey = `${this.hoverTileX},${this.hoverTileY}`;
                if (this.attackableTiles.has(tileKey)) {
                    const target = this.enemies.find(e => e.gridX === this.hoverTileX && e.gridY === this.hoverTileY);
                    if (target) {
                        this.selectedTarget = target;
                        const defTile = this.worldMap.getTileAt(target.gridX, target.gridY);
                        const result = CombatFormulas.calcPhysicalDamage(combatStats, target.stats, defTile);
                        if (result.isMiss) {
                            this.addCombatLog(`빗나감! ${target.name} 공격 실패`);
                        } else {
                            const dead = target.takeDamage(result.damage);
                            const critText = result.isCrit ? ' CRIT!' : '';
                            this.addCombatLog(`${target.name}에게 ${result.damage} 데미지!${critText} (HP: ${target.stats.hp}/${target.stats.maxHp})`);
                            if (dead) {
                                this.addCombatLog(`${target.name} 처치! +${target.expReward} EXP`);
                                if (activeChar) {
                                    const expResult = activeChar.gainExp(target.expReward);
                                    if (expResult.leveledUp) {
                                        this.addCombatLog(`Level Up! ${activeChar.name} Lv.${activeChar.level}`);
                                        this.playerStats = activeChar.stats;
                                    }
                                    if (expResult.promoted) {
                                        this.addCombatLog(`⚡ ${activeChar.name} 승급! → ${expResult.newTierName}`);
                                        this.triggerPromotionFlash();
                                    }
                                }
                                if (target.isBoss && target.lootTableId) {
                                    const lootItem = getItemDef(target.lootTableId);
                                    if (lootItem) {
                                        const placed = this.inventory.autoPlace(lootItem);
                                        if (placed) this.addCombatLog(`${t('raid.bossLoot')}${lootItem.name}`);
                                        else this.addCombatLog('배낭 가득! 보스 루팅 소실.');
                                    }
                                    this.network.sendBossKilled(target.id);
                                }
                                const idx = this.enemies.indexOf(target);
                                if (idx >= 0) this.enemies.splice(idx, 1);
                            }
                        }
                        this.network.sendAttack(target.id);
                    } else {
                        this.addCombatLog('적이 없습니다.');
                    }
                    // Consume ATB
                    this.consumeAction();
                    if (activeChar) activeChar.tickBuffs();
                    this.playerTurnActive = false;
                    this.attackMode = false;
                    this.attackableTiles.clear();

                    // Auto-switch to next ready character
                    this.autoSwitchToReady();
                } else {
                    this.attackMode = false;
                    this.attackableTiles.clear();
                    this.addCombatLog('공격 취소');
                }
                hitUI = true;
            }

            // ─── MAGIC TARGET MODE: Click-to-cast ────────────────────
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
                    this.magicTargetMode = false;
                    this.magicTargetTiles.clear();
                    this.pendingSkill = null;
                    this.addCombatLog('마법 시전 취소');
                }
                hitUI = true;
            }

            if (!hitUI) {
                if (this.player.gridX === this.hoverTileX && this.player.gridY === this.hoverTileY) {
                    // Toggle action menu on player click
                    this.actionMenuOpen = !this.actionMenuOpen;
                    if (this.actionMenuOpen) {
                        this.actionMenuUI.open();
                    } else {
                        this.actionMenuUI.close();
                    }
                    this.selectedTarget = this.player;
                } else {
                    // Close menu if clicking elsewhere
                    if (this.actionMenuOpen) {
                        this.actionMenuOpen = false;
                        this.actionMenuUI.close();
                    }
                    const clickedPartyMember = this.partyPlayers.find(p => p.gridX === this.hoverTileX && p.gridY === this.hoverTileY);
                    const clickedEnemy = this.enemies.find(e => e.gridX === this.hoverTileX && e.gridY === this.hoverTileY);
                    
                    if (clickedPartyMember && clickedPartyMember !== this.player) {
                        // Switch control to clicked party member
                        const idx = this.partyPlayers.indexOf(clickedPartyMember);
                        this.switchToPartyMember(idx);
                    } else if (clickedEnemy) {
                        this.selectedTarget = clickedEnemy;
                    }
                    
                    const clickedLoot = this.worldMap.loot.find(l => l.x === this.hoverTileX && l.y === this.hoverTileY);
                    if (clickedLoot) {
                        const dx = Math.abs(this.player.gridX - clickedLoot.x);
                        const dy = Math.abs(this.player.gridY - clickedLoot.y);
                        if (dx <= 1 && dy <= 1) { // adjacent — open directly

                            clickedLoot.opened = true;
                            this.inventoryUI.setExternalGrid(clickedLoot.inventory, '보물상자');
                            if (!this.inventoryUI.isVisible()) this.inventoryUI.toggle();
                            this.addCombatLog('상자를 검색합니다.');
                        } else {
                            this.addCombatLog('상자가 너무 멉니다.');
                        }

                    }
                }
            }
        }

        // Update UI
        this.updateUI();
    }

    private executeAction(action: ActionType): void {
        this.actionMenuOpen = false;
        this.actionMenuUI.close();

        // Emote — no ATB required
        if (action === 'emote') {
            this.emotePickerOpen = !this.emotePickerOpen;
            return;
        }
        // Tool — no ATB required
        if (action === 'tool') {
            this.quickSlotOpen = !this.quickSlotOpen;
            return;
        }

        if (!this.playerTurnActive) {
            this.addCombatLog('행동 게이지가 차지 않았습니다.');
            return;
        }

        switch (action) {
            case 'attack':
                // Enter attack mode: compute attackable tiles
                this.attackMode = true;
                this.attackableTiles = this.computeAttackableTiles(
                    this.player.gridX, this.player.gridY, 1 // 1 = melee range
                );
                this.addCombatLog('공격할 대상을 클릭하세요.');
                break;
            case 'move':
                // Enter move mode: compute walkable tiles via BFS
                this.moveMode = true;
                this.walkableTiles = this.computeWalkableTiles(
                    this.player.gridX, this.player.gridY, this.player.moveRange
                );
                this.addCombatLog('이동할 위치를 클릭하세요.');
                break;
            case 'rest':
                // Skip turn, recover small HP/MP
                this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 5);
                this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + 3);
                this.addCombatLog('휴식: HP +5, MP +3 회복');
                this.consumeAction();
                this.playerTurnActive = false;
                this.autoSwitchToReady();
                break;
            case 'magic': {
                const active = this.party.getActive();
                if (!active) { this.addCombatLog('활성 캐릭터 없음'); break; }
                this.magicUI.show(
                    active.classLineId,
                    active.currentTier,
                    this.playerStats.mp,
                    this.playerStats.maxMp
                );
                break;
            }
        }
    }

    /** Cast a skill on a target or self */
    private castSkill(skill: Skill, targetEnemy?: Enemy): void {
        const activeChar = this.party.getActive();
        const cbStats = activeChar ? activeChar.getCombatStats() : this.playerStats;

        // MP check
        if (this.playerStats.mp < skill.mpCost) {
            this.addCombatLog(`MP 부족! (${skill.mpCost} 필요)`);
            return;
        }
        this.playerStats.mp -= skill.mpCost;

        switch (skill.type) {
            case 'heal': {
                // Special: alchemist ether convert (mp cost=0, uses HP)
                if (skill.id === 'alc_t4') {
                    const hpCost = Math.floor(this.playerStats.maxHp * 0.2);
                    this.playerStats.hp = Math.max(1, this.playerStats.hp - hpCost);
                    const mpGain = Math.floor(cbStats.magAtk * skill.power);
                    this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + mpGain);
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP -${hpCost}, MP +${mpGain}`);
                } else if (skill.id === 'cle_t7' || skill.id === 'shr_t7') {
                    // Full HP+MP restore
                    this.playerStats.hp = this.playerStats.maxHp;
                    this.playerStats.mp = this.playerStats.maxMp;
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP/MP 전회복!`);
                } else if (skill.id === 'alc_t6') {
                    // Sage potion: HP + MP
                    const healAmt = Math.floor(cbStats.magAtk * skill.power);
                    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmt);
                    this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + Math.floor(healAmt * 0.5));
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP +${healAmt}, MP +${Math.floor(healAmt * 0.5)}`);
                } else {
                    const healAmt = Math.floor(cbStats.magAtk * skill.power);
                    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmt);
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: HP +${healAmt} 회복`);
                }
                break;
            }
            case 'buff': {
                if (activeChar) {
                    activeChar.applyBuff(skill);
                    this.addCombatLog(`${skill.icon} ${skill.nameKr}: 버프/보호 발동!`);
                }
                break;
            }
            case 'debuff': {
                if (!targetEnemy) { this.addCombatLog('대상 없음!'); return; }
                const reduction = skill.power;
                const atkDmg = Math.floor(targetEnemy.stats.atk * (1 - reduction));
                targetEnemy.stats.atk = Math.max(1, targetEnemy.stats.atk - atkDmg);
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: ${targetEnemy.name} ATK -${atkDmg}`);
                // Also deal minor damage
                const dmg = Math.floor(cbStats.magAtk * 0.5);
                const dead = targetEnemy.takeDamage(dmg);
                this.addCombatLog(`${targetEnemy.name}에게 ${dmg} 추가 피해`);
                if (dead) this.handleEnemyKill(targetEnemy);
                break;
            }
            case 'damage': {
                if (!targetEnemy) { this.addCombatLog('대상 없음!'); return; }
                const isPhysical = skill.element === 'physical';
                const baseAtk = isPhysical ? cbStats.atk : cbStats.magAtk;
                const baseDef = isPhysical ? targetEnemy.stats.def : targetEnemy.stats.magDef;
                const rawDmg = Math.floor(baseAtk * skill.power - baseDef * 0.5);
                const dmg = Math.max(1, rawDmg);
                const dead = targetEnemy.takeDamage(dmg);
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: ${targetEnemy.name}에게 ${dmg} 피해! (HP: ${targetEnemy.stats.hp}/${targetEnemy.stats.maxHp})`);
                if (dead) this.handleEnemyKill(targetEnemy);
                break;
            }
            case 'aoe': {
                if (!targetEnemy) { this.addCombatLog('대상 없음!'); return; }
                const isPhys = skill.element === 'physical';
                const atkStat = isPhys ? cbStats.atk : cbStats.magAtk;
                const targets: Enemy[] = [];
                // Find all enemies in AoE radius around target
                for (const e of this.enemies) {
                    const dx = Math.abs(e.gridX - targetEnemy.gridX);
                    const dy = Math.abs(e.gridY - targetEnemy.gridY);
                    if (dx <= skill.aoeRadius && dy <= skill.aoeRadius) {
                        targets.push(e);
                    }
                }
                this.addCombatLog(`${skill.icon} ${skill.nameKr}: ${targets.length}체 대상!`);
                const killList: Enemy[] = [];
                for (const t of targets) {
                    const tDef = isPhys ? t.stats.def : t.stats.magDef;
                    const rawD = Math.floor(atkStat * skill.power - tDef * 0.5);
                    const d = Math.max(1, rawD);
                    const dead = t.takeDamage(d);
                    this.addCombatLog(`  ${t.name}: ${d} 피해 (HP: ${t.stats.hp}/${t.stats.maxHp})`);
                    if (dead) killList.push(t);
                }
                for (const k of killList) this.handleEnemyKill(k);
                break;
            }
        }

        // Consume ATB and tick buffs
        this.consumeAction();
        if (activeChar) activeChar.tickBuffs();
        this.playerTurnActive = false;
        this.magicTargetMode = false;
        this.magicTargetTiles.clear();
        this.pendingSkill = null;

        // Auto-switch to next ready character
        this.autoSwitchToReady();
    }

    /** Handle enemy kill — grant EXP, loot, remove from list */
    private handleEnemyKill(enemy: Enemy): void {
        this.addCombatLog(`${enemy.name} 처치! +${enemy.expReward} EXP`);
        const active = this.party.getActive();
        if (active) {
            const expResult = active.gainExp(enemy.expReward);
            if (expResult.leveledUp) {
                this.addCombatLog(`${active.name} 레벨 업! Lv.${active.level}`);
                this.playerStats = active.stats; // refresh
            }
            if (expResult.promoted) {
                this.addCombatLog(`⚡ ${active.name} 승급! → ${expResult.newTierName}`);
                this.triggerPromotionFlash();
            }
        }
        if (enemy.isBoss && enemy.lootTableId) {
            const lootItem = getItemDef(enemy.lootTableId);
            if (lootItem) {
                const placed = this.inventory.autoPlace(lootItem);
                if (placed) this.addCombatLog(`${t('raid.bossLoot')}${lootItem.name}`);
                else this.addCombatLog('배낭 가득! 보스 루팅 소실.');
            }
            this.network.sendBossKilled(enemy.id);
        }
        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
    }

    /**
     * BFS to compute walkable tiles within range.
     * Excludes tiles blocked by walls (cannot walk through obstacles).
     */
    private computeWalkableTiles(startX: number, startY: number, range: number): Set<string> {
        const result = new Set<string>();
        const queue: { x: number; y: number; dist: number }[] = [{ x: startX, y: startY, dist: 0 }];
        const visited = new Set<string>();
        visited.add(`${startX},${startY}`);

        while (queue.length > 0) {
            const { x, y, dist } = queue.shift()!;
            if (dist > 0) result.add(`${x},${y}`); // Don't include the starting tile

            if (dist >= range) continue;

            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                const key = `${nx},${ny}`;
                if (visited.has(key)) continue;
                visited.add(key);

                const tile = this.worldMap.getTileAt(nx, ny);
                if (TILE_PROPERTIES[tile].walkable) {
                    // Check for enemy blocking
                    const blocked = this.enemies.some(e => e.gridX === nx && e.gridY === ny);
                    if (!blocked) {
                        queue.push({ x: nx, y: ny, dist: dist + 1 });
                    }
                }
            }
        }
        return result;
    }

    /**
     * Compute attackable tiles: 4 cardinal directions up to given range.
     * Only includes tiles with enemies on them.
     */
    private computeAttackableTiles(cx: number, cy: number, range: number): Set<string> {
        const result = new Set<string>();
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
        for (const [dx, dy] of dirs) {
            for (let r = 1; r <= range; r++) {
                const tx = cx + dx * r;
                const ty = cy + dy * r;
                result.add(`${tx},${ty}`);
            }
        }
        return result;
    }

    // @ts-ignore
    private attackAdjacentEnemy(): void {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.isAdjacentTo(this.player.gridX, this.player.gridY)) {
                this.selectedTarget = enemy;
                const defTile = this.worldMap.getTileAt(enemy.gridX, enemy.gridY);
                const result = CombatFormulas.calcPhysicalDamage(this.playerStats, enemy.stats, defTile);

                if (result.isMiss) {
                    this.addCombatLog(`Miss! Attack on ${enemy.label} missed.`);
                } else {
                    const dead = enemy.takeDamage(result.damage);
                    const critText = result.isCrit ? ' CRIT!' : '';
                    this.addCombatLog(`Hit ${enemy.label} for ${result.damage} dmg!${critText}`);

                    if (dead) {
                        this.addCombatLog(`${enemy.label} defeated! +${enemy.expReward} EXP`);

                        // Give EXP
                        const activeChar = this.party.getActive();
                        if (activeChar) {
                            const expResult = activeChar.gainExp(enemy.expReward);
                            if (expResult.leveledUp) {
                                this.addCombatLog(`Level Up! ${activeChar.name} Lv.${activeChar.level}`);
                                this.playerStats = activeChar.stats;
                            }
                            if (expResult.promoted) {
                                this.addCombatLog(`⚡ ${activeChar.name} 승급! → ${expResult.newTierName}`);
                                this.triggerPromotionFlash();
                            }
                        }

                        // Boss loot drops
                        if (enemy.isBoss && enemy.lootTableId) {
                            const lootItem = getItemDef(enemy.lootTableId);
                            if (lootItem) {
                                const placed = this.inventory.autoPlace(lootItem);
                                if (placed) {
                                    this.addCombatLog(`${t('raid.bossLoot')}${lootItem.name}`);
                                } else {
                                    this.addCombatLog(`Backpack full! Boss loot lost.`);
                                }
                            }
                            this.network.sendBossKilled(enemy.id);
                        }

                        this.enemies.splice(i, 1);
                    }
                }
                this.network.sendAttack(enemy.id);
                return; // only attack one enemy per action
            }
        }
        this.addCombatLog(t('log.noEnemy'));
    }

    private processSingleEnemyTurn(enemy: Enemy, targetPlayer: Player = this.player): void {
        const targetInd = this.partyPlayers.indexOf(targetPlayer);
        const targetChar = this.party.getCharacters()[targetInd];
        if (!targetChar || targetChar.isDead) return;

        if (enemy.isAdjacentTo(targetPlayer.gridX, targetPlayer.gridY)) {
            // Attack player
            this.selectedTarget = targetPlayer;
            const defTile = this.worldMap.getTileAt(targetPlayer.gridX, targetPlayer.gridY);
            const result = CombatFormulas.calcPhysicalDamage(enemy.stats, targetChar.stats, defTile);
            if (!result.isMiss) {
                targetChar.stats.hp = Math.max(0, targetChar.stats.hp - result.damage);
                this.addCombatLog(`${enemy.name} ${t('log.hitYou').replace('{dmg}', String(result.damage))} [${targetChar.name}]`);
                if (targetChar.stats.hp <= 0) {
                    targetChar.isDead = true;
                    targetChar.exp = 0; // EXP reset on death
                    this.addCombatLog(`${targetChar.name} 사망!!`);
                    if (targetPlayer === this.player) {
                        const nextChar = this.party.markActiveDead();
                        if (nextChar) {
                            const nextInd = this.party.getCharacters().indexOf(nextChar);
                            this.playerStats = nextChar.stats;
                            this.player = this.partyPlayers[nextInd];
                            this.inventoryUI.setActiveCharacter(nextChar);
                            this.addCombatLog(`${nextChar.name} (으)로 교체!`);
                        } else {
                            this.addCombatLog('출격조 전원 사망! 은신처로 복귀합니다.');
                            this.processDeathPenalty();
                            this.raidResult = 'DEAD';
                            this.state = GameState.RESULTS;
                        }
                    } else if (this.party.isSquadWiped()) {
                        this.addCombatLog('출격조 전원 사망! 은신처로 복귀합니다.');
                        this.processDeathPenalty();
                        this.raidResult = 'DEAD';
                        this.state = GameState.RESULTS;
                    }
                }
            } else {
                this.addCombatLog(`${enemy.name} ${t('log.missedYou')}`);
            }
        } else {
            // Move toward player
            const isOccupied = (x: number, y: number) => {
                return this.partyPlayers.some(p => p.gridX === x && p.gridY === y) ||
                       this.enemies.some(e => e !== enemy && e.gridX === x && e.gridY === y);
            };
            enemy.moveToward(targetPlayer.gridX, targetPlayer.gridY, (x, y) => this.worldMap.getTileAt(x, y), isOccupied);
        }
    }

    /**
     * Switch control to a specific party member by index.
     * Updates this.player, this.playerStats, camera, and resets action modes.
     */
    private switchToPartyMember(idx: number): void {
        if (idx < 0 || idx >= this.partyPlayers.length) return;
        this.party.switchTo(idx);
        const active = this.party.getActive();
        if (active) {
            this.player = this.partyPlayers[idx];
            this.playerStats = active.stats;
            this.inventoryUI.setActiveCharacter(active);
            this.selectedTarget = this.player;
            this.addCombatLog(`${active.name} (으)로 교체!`);
            this.playerTurnActive = (this.player.actionGauge >= 100);
            // Reset all active modes
            this.moveMode = false;
            this.walkableTiles.clear();
            this.attackMode = false;
            this.attackableTiles.clear();
            this.magicTargetMode = false;
            this.magicTargetTiles.clear();
            this.pendingSkill = null;
            this.actionMenuOpen = false;
            this.actionMenuUI.close();
            // Move camera to the switched character (snap instantly)
            this.camera.followTile(this.player.gridX, this.player.gridY);
            this.camera.snapToTarget();
        }
    }

    /**
     * After consuming ATB, auto-switch to the next party member whose
     * action gauge is full (>= 100). If none are ready, do nothing.
     */
    private autoSwitchToReady(): void {
        if (this.partyPlayers.length <= 1) return;
        const members = this.party.getCharacters();
        const currentIdx = this.partyPlayers.indexOf(this.player);
        // Search starting from next index, wrapping around
        for (let offset = 1; offset < this.partyPlayers.length; offset++) {
            const idx = (currentIdx + offset) % this.partyPlayers.length;
            if (members[idx] && !members[idx].isDead && this.partyPlayers[idx].actionGauge >= 100) {
                this.switchToPartyMember(idx);
                return;
            }
        }
        // No one is ready — stay on current (waiting for ATB)
    }

    /** Trigger promotion flash effect on the current player */
    private triggerPromotionFlash(): void {
        this.promotionFlashTimer = 1.5; // 1.5 seconds
        this.promotionFlashPlayerIdx = this.partyPlayers.indexOf(this.player);
    }

    /** Consume action gauge + apply Heal Ring effect if equipped */
    private consumeAction(): void {
        this.player.actionGauge = 0;
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
            }
        }
    }

    private checkLootAndExtraction(): void {
        // Check for loot
        for (let i = this.worldMap.loot.length - 1; i >= 0; i--) {
            const loot = this.worldMap.loot[i];
            if (loot.x === this.player.gridX && loot.y === this.player.gridY && !loot.opened) {
                // ... auto pickup logic later
            }
        }

        // Check for extraction zone
        for (const zone of this.worldMap.extractionZones) {
            if (zone.contains(this.player.gridX, this.player.gridY)) {
                this.addCombatLog(t('log.extraction'));
                this.raidResult = 'WIN';
                this.state = GameState.RESULTS;
                return;
            }
        }
    }

    /** Use a consumable item from the quick-slot */
    private useConsumable(placed: import('../inventory/GridInventory').PlacedItem): void {
        const item = placed.item;
        const lang = i18n.lang;
        const name = lang === 'ko' ? item.nameKr : item.name;

        if (item.stats?.hp) {
            const heal = item.stats.hp;
            this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + heal);
            this.addCombatLog(lang === 'ko' ? `${name} 사용! HP +${heal} 회복` : `Used ${name}! HP +${heal}`);
        } else if (item.stats?.mp) {
            const restore = item.stats.mp;
            this.playerStats.mp = Math.min(this.playerStats.maxMp, this.playerStats.mp + restore);
            this.addCombatLog(lang === 'ko' ? `${name} 사용! MP +${restore} 회복` : `Used ${name}! MP +${restore}`);
        } else if (item.id === 'repair_kit') {
            this.addCombatLog(lang === 'ko' ? `${name} 사용! 무기 수리` : `Used ${name}! Weapon repaired`);
        } else {
            this.addCombatLog(lang === 'ko' ? `${name} 사용!` : `Used ${name}!`);
        }

        // Remove from inventory
        this.inventory.remove(placed);
        // Close quick-slot if empty
        const remaining = this.inventory.items.filter(p => p.item.slot === 'consumable');
        if (remaining.length === 0) {
            this.quickSlotOpen = false;
        }
    }

    private processDeathPenalty(): void {
        // Lose entire shared backpack
        const items = [...this.inventory.items];
        for (const item of items) {
            this.inventory.remove(item);
        }

        // Lose 1 random equipped item from EVERY active character
        const charList = this.party.getCharacters();
        for (const char of charList) {
            const equippedSlots = Array.from(char.equipment.keys());
            if (equippedSlots.length > 0) {
                const randomSlot = equippedSlots[Math.floor(Math.random() * equippedSlots.length)];
                char.unequip(randomSlot);
                this.addCombatLog(`${char.name} ${t('log.lostItem').replace('{slot}', randomSlot)}`);
            }
        }
    }

    private addCombatLog(msg: string): void {
        this.combatLog.push(msg);
        if (this.combatLog.length > 200) this.combatLog.shift();
        // Auto-reset scroll to latest on new message
        this.logScrollOffset = 0;
    }

    private render(): void {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.ctx.clearRect(0, 0, width, height);

        // Apply UI scale
        const scale = SettingsManager.getUIScale();
        const vw = Math.floor(width / scale);
        const vh = Math.floor(height / scale);
        this.ctx.save();
        this.ctx.scale(scale, scale);

        if (this.state === GameState.CHARACTER_CREATION) {
            this.charCreateUI.render(this.ctx, vw, vh, this.settingsUI.isVisible());
            
            this.renderSettingsButton(this.ctx, vw);
            if (this.settingsUI.isVisible()) this.settingsUI.render(this.ctx, vw, vh);
            this.ctx.restore();
            return;
        }

        if (this.state === GameState.LOBBY) {
            this.lobbyUI.render(this.ctx, vw, vh);
            this.ctx.restore();
            return; // only render lobby
        }

        if (this.state === GameState.RESULTS) {
            this.renderResults();
            this.ctx.restore();
            return;
        }

        // ─── RAID RENDER ──────────────────────────────────────────
        // World renders with zoom
        this.ctx.restore();
        const zoom = this.camera.zoom;
        const camX = this.camera.x;
        const camY = this.camera.y;

        // Clear
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(0, 0, width, height);

        // Apply camera zoom transform
        this.ctx.save();
        this.ctx.scale(zoom, zoom);

        // 1. Render world map (chunks) — use zoom-adjusted viewport size
        const renderW = Math.ceil(width / zoom);
        const renderH = Math.ceil(height / zoom);
        this.worldMap.render(this.ctx, camX, camY, renderW, renderH);

        // 2. Render movement/attack range indicator
        if (this.moveMode && this.walkableTiles.size > 0) {
            this.gridRenderer.renderWalkableTiles(
                this.ctx, this.walkableTiles, camX, camY,
                'rgba(255, 200, 0, 0.20)',
                'rgba(255, 200, 0, 0.6)'
            );
        } else if (this.attackMode && this.attackableTiles.size > 0) {
            this.gridRenderer.renderWalkableTiles(
                this.ctx, this.attackableTiles, camX, camY,
                'rgba(255, 60, 60, 0.25)',
                'rgba(255, 60, 60, 0.7)'
            );
        } else if (this.magicTargetMode && this.magicTargetTiles.size > 0) {
            this.gridRenderer.renderWalkableTiles(
                this.ctx, this.magicTargetTiles, camX, camY,
                'rgba(180, 80, 255, 0.25)',
                'rgba(180, 80, 255, 0.7)'
            );
        } else if (this.isHoveringPlayer || this.actionMenuOpen) {
            this.gridRenderer.renderRange(
                this.ctx,
                this.player.gridX, this.player.gridY,
                this.player.moveRange,
                camX, camY,
                'rgba(255, 200, 0, 0.15)',
                'rgba(255, 200, 0, 0.5)'
            );
        }

        // 3. Render hover highlight
        this.gridRenderer.renderHoverTile(this.ctx, this.hoverTileX, this.hoverTileY, camX, camY);

        // 4. Render loot objects
        for (const loot of this.worldMap.loot) {
            loot.render(this.ctx, loot.x * TILE_SIZE - camX, loot.y * TILE_SIZE - camY, TILE_SIZE);
        }

        // 5. Render extraction zones
        for (const zone of this.worldMap.extractionZones) {
            zone.render(this.ctx, (gx, gy) => ({
                x: gx * TILE_SIZE - camX,
                y: gy * TILE_SIZE - camY
            }), TILE_SIZE);
        }

        // 6. Render enemies
        for (const enemy of this.enemies) {
            const eColor = enemy.isAggro ? '#ff1744' : enemy.color;
            this.gridRenderer.renderEntity(this.ctx, enemy, camX, camY, eColor);

            // HP bar above enemy
            const sx = enemy.pixelX * TILE_SIZE - camX;
            const sy = enemy.pixelY * TILE_SIZE - camY - 6;
            const barW = TILE_SIZE - 8;
            const hpRatio = enemy.stats.hp / enemy.stats.maxHp;
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillRect(sx + 4, sy, barW, 4);
            this.ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : hpRatio > 0.2 ? '#ff9800' : '#f44336';
            this.ctx.fillRect(sx + 4, sy, barW * hpRatio, 4);

            // Draw select border for selectedTarget enemy
            if (this.selectedTarget === enemy && this.selectBorderImg.complete) {
                const ex = enemy.pixelX * TILE_SIZE - camX;
                const ey = enemy.pixelY * TILE_SIZE - camY;
                const pad = 4;
                this.ctx.drawImage(this.selectBorderImg, ex - pad, ey - pad, TILE_SIZE + pad * 2, TILE_SIZE + pad * 2);
            }
        }

        // 7. Render remote players (multiplayer)
        for (const rp of this.remotePlayers.values()) {
            const rpX = rp.pixelX * TILE_SIZE - camX;
            const rpY = rp.pixelY * TILE_SIZE - camY;
            // Skip if off-screen
            if (rpX > -TILE_SIZE && rpX < width && rpY > -TILE_SIZE && rpY < height) {
                this.gridRenderer.renderEntity(this.ctx, rp, camX, camY);
                // Name tag above remote player
                this.ctx.fillStyle = '#ffaa00';
                this.ctx.font = '10px "DOSMyungjo", sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(rp.name, rpX + TILE_SIZE / 2, rpY - 8);
                this.ctx.textAlign = 'start';
            }
        }

        // 7.5 Render player entities
        for (const p of this.partyPlayers) {
            this.gridRenderer.renderEntity(this.ctx, p, camX, camY);
            // Highlight active player
            if (p === this.player) {
                const px = p.gridX * TILE_SIZE - camX;
                const py = p.gridY * TILE_SIZE - camY;
                this.ctx.strokeStyle = '#ffff00';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            // Draw select border for selectedTarget
            if (this.selectedTarget === p && this.selectBorderImg.complete) {
                const spx = p.gridX * TILE_SIZE - camX;
                const spy = p.gridY * TILE_SIZE - camY;
                const pad = 4;
                this.ctx.drawImage(this.selectBorderImg, spx - pad, spy - pad, TILE_SIZE + pad * 2, TILE_SIZE + pad * 2);
            }
        }

        // 7.55 Fog of War overlay
        // Update fog for all party members (clear walked tiles)
        for (const p of this.partyPlayers) {
            this.fogOfWar.update(p.gridX, p.gridY);
        }
        this.fogOfWar.render(
            this.ctx,
            this.player.gridX, this.player.gridY,
            camX, camY,
            renderW, renderH
        );

        // 7.6 Render action menu (if open) or shoe indicator (if ATB ready)
        const playerSX = this.player.gridX * TILE_SIZE - camX;
        const playerSY = this.player.gridY * TILE_SIZE - camY;
        if (this.actionMenuOpen) {
            this.actionMenuUI.render(this.ctx, playerSX, playerSY, this.playerTurnActive);
        } else if (this.playerTurnActive) {
            this.actionMenuUI.renderReadyIndicator(this.ctx, playerSX, playerSY);
        }

        // 7.7 Render active emote bubble ABOVE main player
        if (this.activeEmote && this.emoteTimer > 0) {
            this.ctx.save();
            const bubbleX = playerSX + TILE_SIZE / 2;
            const bubbleY = playerSY - 24;
            // Bubble background
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.beginPath();
            this.ctx.arc(bubbleX, bubbleY, 16, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            // Emoji
            this.ctx.font = '18px "DOSMyungjo", sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(this.activeEmote, bubbleX, bubbleY);
            this.ctx.restore();
        }

        // 7.7b Render promotion flash effect
        if (this.promotionFlashTimer > 0 && this.promotionFlashPlayerIdx >= 0) {
            const flashPlayer = this.partyPlayers[this.promotionFlashPlayerIdx];
            if (flashPlayer) {
                const fx = flashPlayer.gridX * TILE_SIZE - this.camera.x;
                const fy = flashPlayer.gridY * TILE_SIZE - this.camera.y;
                const cx = fx + TILE_SIZE / 2;
                const cy = fy + TILE_SIZE / 2;
                const t = this.promotionFlashTimer / 1.5; // 1.0 → 0.0
                const alpha = t * 0.8;
                const radius = TILE_SIZE * (2.5 - t * 1.5); // expands outward

                this.ctx.save();
                // Radial glow
                const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                grad.addColorStop(0, `rgba(255, 255, 100, ${alpha})`);
                grad.addColorStop(0.4, `rgba(255, 200, 50, ${alpha * 0.6})`);
                grad.addColorStop(1, `rgba(255, 150, 0, 0)`);
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                this.ctx.fill();

                // Star sparkles
                const sparkleCount = 8;
                const time = 1.5 - this.promotionFlashTimer;
                for (let i = 0; i < sparkleCount; i++) {
                    const angle = (Math.PI * 2 / sparkleCount) * i + time * 3;
                    const dist = TILE_SIZE * (0.5 + time * 1.2);
                    const sx = cx + Math.cos(angle) * dist;
                    const sy = cy + Math.sin(angle) * dist;
                    const size = 3 + Math.sin(time * 10 + i) * 2;
                    this.ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
                    this.ctx.beginPath();
                    this.ctx.arc(sx, sy, size, 0, Math.PI * 2);
                    this.ctx.fill();
                }

                // "승급!" text floating up
                this.ctx.font = 'bold 16px "DOSMyungjo", sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillStyle = `rgba(255, 255, 100, ${alpha})`;
                this.ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                this.ctx.lineWidth = 3;
                const textY = cy - TILE_SIZE - (1 - t) * 30;
                this.ctx.strokeText('⚡ 승급!', cx, textY);
                this.ctx.fillText('⚡ 승급!', cx, textY);
                this.ctx.restore();
            }
        }

        // 7.8 Render emote picker grid
        if (this.emotePickerOpen) {
            this.ctx.save();
            const cols = 4;
            const emojiSize = 36;
            const gridW = cols * emojiSize;
            const rows = Math.ceil(this.EMOTE_LIST.length / cols);
            const gridH = rows * emojiSize;
            const gx = playerSX + TILE_SIZE / 2 - gridW / 2;
            const gy = playerSY - gridH - 20;
            // Panel background
            this.ctx.fillStyle = 'rgba(20, 22, 36, 0.92)';
            this.ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.roundRect(gx - 6, gy - 6, gridW + 12, gridH + 12, 8);
            this.ctx.fill();
            this.ctx.stroke();
            // Emojis
            this.ctx.font = '22px "DOSMyungjo", sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            for (let i = 0; i < this.EMOTE_LIST.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const ex = gx + col * emojiSize + emojiSize / 2;
                const ey = gy + row * emojiSize + emojiSize / 2;
                const mx = this.input.mouseScreenX;
                const my = this.input.mouseScreenY;
                if (mx >= gx + col * emojiSize && mx < gx + (col + 1) * emojiSize &&
                    my >= gy + row * emojiSize && my < gy + (row + 1) * emojiSize) {
                    this.ctx.fillStyle = 'rgba(255, 200, 0, 0.2)';
                    this.ctx.fillRect(gx + col * emojiSize, gy + row * emojiSize, emojiSize, emojiSize);
                }
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText(this.EMOTE_LIST[i], ex, ey);
            }
            this.ctx.restore();
        }

        // 7.9 Render quick-slot panel (glass style)
        if (this.quickSlotOpen) {
            // Handle drag movement
            if (this.qsDragging) {
                if (this.input.mouseIsDown) {
                    this.qsPanelX = this.input.mouseScreenX / this.camera.zoom - this.qsDragOffX;
                    this.qsPanelY = this.input.mouseScreenY / this.camera.zoom - this.qsDragOffY;
                    this.qsPosSet = true;
                } else {
                    this.qsDragging = false;
                }
            }

            this.ctx.save();
            const consumables = this.inventory.items.filter(p => p.item.slot === 'consumable');
            const slotW = 240;
            const rowH = 40;
            const headerH = 34;
            const panelH = headerH + Math.max(1, consumables.length) * rowH + 12;

            // Position near character (centered like MagicUI) on first open
            if (!this.qsPosSet) {
                const vw = Math.floor(this.canvasW / SettingsManager.getUIScale());
                const vh = Math.floor(this.canvasH / SettingsManager.getUIScale());
                this.qsPanelX = Math.floor((vw - slotW) / 2);
                this.qsPanelY = Math.floor((vh - panelH) / 2);
                this.qsPosSet = true;
            }

            const panelX = this.qsPanelX;
            const panelY = this.qsPanelY;

            // Glass panel backdrop
            drawGlassPanel(this.ctx, panelX, panelY, slotW, panelH, {
                radius: 10, shadow: true, bg: 'rgba(8, 10, 24, 0.92)'
            });

            // Header
            this.ctx.fillStyle = 'rgba(240, 192, 80, 0.12)';
            this.ctx.fillRect(panelX + 1, panelY + 1, slotW - 2, headerH);

            // Drag handle dots
            this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
            for (let d = 0; d < 3; d++) {
                this.ctx.fillRect(panelX + 6, panelY + 10 + d * 6, 2, 2);
            }

            // Title
            this.ctx.fillStyle = UI.textAccent;
            this.ctx.font = `bold 13px ${UI.fontPrimary}`;
            this.ctx.textAlign = 'left';
            this.ctx.fillText('✦ ' + (i18n.lang === 'ko' ? '도구' : 'Tools'), panelX + 14, panelY + 22);

            // Close button
            this.ctx.fillStyle = 'rgba(255,80,80,0.7)';
            this.ctx.font = `bold 14px ${UI.fontPrimary}`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('✕', panelX + slotW - 14, panelY + 19);
            this.ctx.textAlign = 'left';

            // Divider
            this.ctx.strokeStyle = UI.borderSubtle;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(panelX + 8, panelY + headerH);
            this.ctx.lineTo(panelX + slotW - 8, panelY + headerH);
            this.ctx.stroke();

            if (consumables.length === 0) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
                this.ctx.font = `12px ${UI.fontPrimary}`;
                this.ctx.fillText(i18n.lang === 'ko' ? '사용 가능한 아이템이 없습니다' : 'No usable items', panelX + 12, panelY + headerH + 28);
            } else {
                for (let i = 0; i < consumables.length; i++) {
                    const placed = consumables[i];
                    const iy = panelY + headerH + i * rowH;
                    const mx = this.input.mouseScreenX;
                    const my = this.input.mouseScreenY;
                    const isHover = mx >= panelX && mx < panelX + slotW && my >= iy && my < iy + rowH;

                    // Hover highlight
                    if (isHover) {
                        this.ctx.fillStyle = 'rgba(240, 192, 80, 0.12)';
                        this.ctx.fillRect(panelX + 2, iy, slotW - 4, rowH);
                    }

                    // Icon
                    this.ctx.font = '16px serif';
                    this.ctx.fillStyle = '#fff';
                    this.ctx.fillText(placed.item.icon, panelX + 10, iy + 26);

                    // Name
                    const name = i18n.lang === 'ko' ? placed.item.nameKr : placed.item.name;
                    this.ctx.font = `12px ${UI.fontPrimary}`;
                    this.ctx.fillStyle = isHover ? UI.textAccent : '#e0e0e0';
                    this.ctx.fillText(name, panelX + 34, iy + 18);

                    // Description
                    const desc = i18n.lang === 'ko' ? (placed.item.descriptionKr || placed.item.description) : placed.item.description;
                    this.ctx.font = `10px ${UI.fontPrimary}`;
                    this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    this.ctx.fillText(desc, panelX + 34, iy + 32);

                    // Row divider
                    if (i < consumables.length - 1) {
                        this.ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                        this.ctx.beginPath();
                        this.ctx.moveTo(panelX + 10, iy + rowH);
                        this.ctx.lineTo(panelX + slotW - 10, iy + rowH);
                        this.ctx.stroke();
                    }
                }
            }
        }

        // === END WORLD ZOOM TRANSFORM ===
        this.ctx.restore();

        // 8. Render Raid Timer — minimal glow text, no box
        this.ctx.save();
        this.ctx.font = `bold 20px ${UI.fontMono}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        const timerColor = this.raidTimeRemaining < 60 ? UI.danger : UI.textPrimary;
        if (this.raidTimeRemaining < 60) {
            this.ctx.shadowColor = UI.danger;
            this.ctx.shadowBlur = 12;
        } else {
            this.ctx.shadowColor = 'rgba(0,0,0,0.6)';
            this.ctx.shadowBlur = 4;
        }
        this.ctx.fillStyle = timerColor;
        const m = Math.floor(this.raidTimeRemaining / 60).toString().padStart(2, '0');
        const s = Math.floor(this.raidTimeRemaining % 60).toString().padStart(2, '0');
        this.ctx.fillText(`${m}:${s}`, width / 2, 14);
        this.ctx.shadowBlur = 0;
        this.ctx.textAlign = 'start';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.restore();

        // 9. Player HP/MP bars — positioned below tile label
        this.renderPlayerBars();

        // 10. Combat log — fading text from bottom
        this.renderCombatLog(height);
    
        // 11. FPS counter — left side, under logo
        if (SettingsManager.getFPS()) {
            drawGlassPanel(this.ctx, 12, 56, 64, 20, {
                radius: 4, shadow: false, bg: 'rgba(12, 14, 24, 0.5)'
            });
            this.ctx.fillStyle = UI.textMuted;
            this.ctx.font = `10px ${UI.fontMono}`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${this.fps} FPS`, 44, 70);
            this.ctx.textAlign = 'start';
        }

        // 12. Hover tile info — glass chip
        const hoverTile = this.worldMap.getTileAt(this.hoverTileX, this.hoverTileY);
        const hoverProps = TILE_PROPERTIES[hoverTile];
        const tileLabel = `${t(hoverProps.labelKey)} (${this.hoverTileX},${this.hoverTileY})`;
        this.ctx.font = `11px ${UI.fontMono}`;
        const tileLabelW = this.ctx.measureText(tileLabel).width + 20;
        drawGlassPanel(this.ctx, width - tileLabelW - 12, 86, tileLabelW, 24, {
            radius: UI.radiusSm, shadow: false, bg: 'rgba(12, 14, 24, 0.5)'
        });
        this.ctx.fillStyle = UI.textSecondary;
        this.ctx.font = `11px ${UI.fontMono}`;
        this.ctx.textAlign = 'right';
        this.ctx.fillText(tileLabel, width - 20, 102);
        this.ctx.textAlign = 'start';

        // 12.5 Minimap
        this.minimapUI.render(this.ctx, width, 114);

        // 13. Online players indicator — glass chip
        if (this.network.connected) {
            const onlineCount = this.remotePlayers.size + 1;
            const onlineText = `${t('mp.online')}${onlineCount}${t('mp.players')}`;
            this.ctx.font = `11px ${UI.fontPrimary}`;
            const onlineW = this.ctx.measureText(onlineText).width + 20;
            drawGlassPanel(this.ctx, 12, 10, onlineW, 24, {
                radius: UI.radiusSm, shadow: false, bg: 'rgba(12, 14, 24, 0.5)'
            });
            this.ctx.fillStyle = UI.success;
            this.ctx.fillText(onlineText, 22, 26);
        }

        // 14. UIs (Inventory, Character, Party)
        this.inventoryUI.render(this.ctx, width, height);
        this.partyUI.render(this.ctx, width, height);
        this.charUI.render(this.ctx, width, height);
        this.magicUI.render(this.ctx, width, height);

        // 15. Entity Info tracking pop-up
        if (this.selectedTarget) {
            let displayInfo: EntityDisplayInfo;
            // Check if selectedTarget is a party member (Player entity)
            const partyIdx = this.partyPlayers.indexOf(this.selectedTarget as Player);
            if (this.selectedTarget === this.player) {
                const active = this.party.getActive();
                displayInfo = {
                    name: active ? active.name : '지휘관',
                    level: active ? active.level : 1,
                    hp: this.playerStats.hp,
                    maxHp: this.playerStats.maxHp,
                    mp: this.playerStats.mp,
                    maxMp: this.playerStats.maxMp,
                    actionGauge: this.player.actionGauge,
                    exp: active ? active.exp : 0,
                    maxExp: active ? active.expToNext : 100,
                    buffs: active ? active.buffs.map(b => b.icon) : [],
                    atk: this.playerStats.atk,
                    def: this.playerStats.def,
                    magAtk: this.playerStats.magAtk,
                    magDef: this.playerStats.magDef,
                    spriteColor: this.player.color,
                    spriteImage: active?.portraitImage
                };
            } else if (partyIdx >= 0) {
                // It's a party member — get their Character data
                const members = this.party.getCharacters();
                const charData = members[partyIdx];
                const partyPlayer = this.partyPlayers[partyIdx];
                if (charData) {
                    displayInfo = {
                        name: charData.name,
                        level: charData.level,
                        hp: charData.stats.hp,
                        maxHp: charData.stats.maxHp,
                        mp: charData.stats.mp,
                        maxMp: charData.stats.maxMp,
                        actionGauge: partyPlayer.actionGauge,
                        exp: charData.exp,
                        maxExp: charData.expToNext,
                        buffs: charData.buffs.map(b => b.icon),
                        atk: charData.stats.atk,
                        def: charData.stats.def,
                        magAtk: charData.stats.magAtk,
                        magDef: charData.stats.magDef,
                        spriteColor: partyPlayer.color,
                        spriteImage: charData.portraitImage
                    };
                } else {
                    displayInfo = {
                        name: partyPlayer.label || '파티원',
                        level: 1,
                        hp: 100, maxHp: 100, mp: 0, maxMp: 0,
                        actionGauge: partyPlayer.actionGauge,
                        buffs: [], atk: 0, def: 0, magAtk: 0, magDef: 0,
                        spriteColor: partyPlayer.color,
                        spriteImage: partyPlayer.image
                    };
                }
            } else {
                const enemy = this.selectedTarget as Enemy;
                displayInfo = {
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
                    spriteColor: enemy.color
                };
            }
            this.entityInfoUI.render(this.ctx, displayInfo);
        }
        // === UI OVERLAYS (scaled) ===
        this.ctx.save();
        this.ctx.scale(scale, scale);

        // ─── Canvas Unified Left Panel (title + info + key help) ─────
        const panelX = 16;
        const panelW = 210;
        let curY = 12;

        // 1. Epic Title
        const titleH = renderGameTitle(this.ctx, panelX, curY, {
            scale: 0.7, subtitle: t('ui.subtitle')
        });
        curY += titleH + 8;

        // 2. Info Panel — position + terrain
        const tile = this.worldMap.getTileAt(this.player.gridX, this.player.gridY);
        const tileProps = TILE_PROPERTIES[tile];
        const infoLine1 = `${t('ui.pos')}: (${this.player.gridX}, ${this.player.gridY})`;
        const infoLine2 = `${t('ui.terrain')}: ${t(tileProps.labelKey)} | ${t('ui.enemies')}: ${this.enemies.length}`;
        const infoH = 48;

        drawParchmentPanel(this.ctx, panelX, curY, panelW, infoH);
        this.ctx.fillStyle = Parchment.textDark;
        this.ctx.font = `bold 11px ${UI.fontMono}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(infoLine1, panelX + 12, curY + 12);
        this.ctx.fillStyle = Parchment.textMid;
        this.ctx.font = `10px ${UI.fontMono}`;
        this.ctx.fillText(infoLine2, panelX + 12, curY + 28);
        curY += infoH + 6;



        // Update EntityInfoUI position to stack below
        this.entityInfoUI.setPosition(panelX, curY);

        this.ctx.textAlign = 'start';
        this.ctx.textBaseline = 'alphabetic';

        // Settings gear button (top-right)
        this.renderSettingsButton(this.ctx, vw);

        // Settings modal overlay (on top of everything)
        if (this.settingsUI.isVisible()) {
            this.settingsUI.render(this.ctx, vw, vh);
        }
        this.ctx.restore();
    }

    /** Renders a "설정" button in the top-right corner */
    private renderSettingsButton(ctx: CanvasRenderingContext2D, canvasW: number): void {
        const btnX = canvasW - 60;
        const btnY = 10;
        const btnW = 50;
        const btnH = 36;

        ctx.save();
        ctx.fillStyle = 'rgba(40, 36, 28, 0.7)';
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Gear icon ⚙ + small label
        ctx.fillStyle = '#c8a84e';
        ctx.font = `bold 13px "DOSMyungjo", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚙ 설정', btnX + btnW / 2, btnY + btnH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }
    private renderResults(): void {
        // Use virtual (scaled) dimensions for proper centering
        const scale = SettingsManager.getUIScale();
        const w = Math.floor(this.canvasW / scale);
        const h = Math.floor(this.canvasH / scale);

        // Background
        if (this.raidResult !== 'WIN' && this.gameoverBgImg.complete) {
            // Draw gameover background scaled to fill
            this.ctx.drawImage(this.gameoverBgImg, 0, 0, w, h);
            // Dark overlay for text readability
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            this.ctx.fillRect(0, 0, w, h);
        } else {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            this.ctx.fillRect(0, 0, w, h);
        }

        this.ctx.font = 'bold 48px "DOSMyungjo", sans-serif';
        this.ctx.textAlign = 'center';

        if (this.raidResult === 'WIN') {
            this.ctx.fillStyle = '#00ff88';
            this.ctx.fillText(t('raid.success'), w / 2, h / 2 - 40);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '18px "DOSMyungjo", sans-serif';
            this.ctx.fillText(t('raid.successDesc'), w / 2, h / 2 + 10);
        } else {
            this.ctx.fillStyle = '#ff3333';
            this.ctx.fillText(this.raidResult === 'MIA' ? t('raid.mia') : t('raid.died'), w / 2, h / 2 - 40);
            this.ctx.fillStyle = '#ff8888';
            this.ctx.font = '18px "DOSMyungjo", sans-serif';
            this.ctx.fillText(t('raid.failDesc'), w / 2, h / 2 + 10);
        }

        this.ctx.fillStyle = '#aaa';
        this.ctx.fillText(t('raid.return'), w / 2, h / 2 + 70);
        
        this.ctx.textAlign = 'start';
    }

    private renderPlayerBars(): void {
        const { width } = this.canvas;
        const barW = 140;
        const barH = 8;
        const barX = width - barW - 16;
        const barY = 56;

        // HP bar — slim, rounded, with label
        const hpRatio = this.playerStats.hp / this.playerStats.maxHp;
        drawBar(this.ctx, barX, barY, barW, barH, hpRatio, UI.hp, UI.hpBg, {
            radius: barH / 2,
            valueText: `${this.playerStats.hp}/${this.playerStats.maxHp}`,
        });
        this.ctx.fillStyle = UI.textSecondary;
        this.ctx.font = `bold 9px ${UI.fontPrimary}`;
        this.ctx.textAlign = 'right';
        this.ctx.fillText('HP', barX - 4, barY + barH - 1);
        this.ctx.textAlign = 'start';

        // MP bar
        const mpRatio = this.playerStats.mp / this.playerStats.maxMp;
        drawBar(this.ctx, barX, barY + barH + 6, barW, barH, mpRatio, UI.mp, UI.mpBg, {
            radius: barH / 2,
            valueText: `${this.playerStats.mp}/${this.playerStats.maxMp}`,
        });
        this.ctx.fillStyle = UI.textSecondary;
        this.ctx.font = `bold 9px ${UI.fontPrimary}`;
        this.ctx.textAlign = 'right';
        this.ctx.fillText('MP', barX - 4, barY + barH * 2 + 5);
        this.ctx.textAlign = 'start';
    }

    private renderCombatLog(canvasH: number): void {
        if (this.combatLog.length === 0) return;
        const logX = 12;
        const lineH = 18;
        const visibleLines = 5;
        const logH = visibleLines * lineH + 16;
        const logY = canvasH - logH - 12;
        const logW = 360;

        // Check if mouse is hovering over log area
        const mx = this.input.mouseScreenX;
        const my = this.input.mouseScreenY;
        const isHovered = mx >= logX && mx <= logX + logW && my >= logY && my <= logY + logH;

        // Handle scroll via mouse wheel when hovered
        if (isHovered && this.input.mouseWheelDelta !== 0) {
            this.logScrollOffset += this.input.mouseWheelDelta > 0 ? -1 : 1;
            this.logScrollOffset = Math.max(0, Math.min(this.combatLog.length - visibleLines, this.logScrollOffset));
        }

        // Render visible messages (no background — vibe UI style)
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(logX, logY, logW, logH);
        this.ctx.clip();

        const startIdx = Math.max(0, this.combatLog.length - visibleLines - this.logScrollOffset);
        const endIdx = Math.min(this.combatLog.length, startIdx + visibleLines);

        for (let i = startIdx; i < endIdx; i++) {
            const lineIdx = i - startIdx;
            const drawY = logY + 14 + lineIdx * lineH;
            const age = this.combatLog.length - 1 - i;
            const alpha = this.logScrollOffset > 0 ? 0.85 : Math.max(0.3, 0.9 - (age * 0.12));
            this.ctx.fillStyle = `rgba(232, 228, 222, ${alpha})`;
            this.ctx.font = `12px ${UI.fontPrimary}`;
            this.ctx.textAlign = 'left';
            this.ctx.fillText(this.combatLog[i], logX + 8, drawY);
        }
        this.ctx.restore();

        // Scroll indicator when scrolled up
        if (this.logScrollOffset > 0) {
            this.ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
            this.ctx.font = `bold 11px ${UI.fontPrimary}`;
            this.ctx.textAlign = 'right';
            this.ctx.fillText('\u2b07 \ucd5c\uadfc', logX + logW - 8, logY + logH - 4);
            this.ctx.textAlign = 'start';

            // Click '\u2b07 \ucd5c\uadfc' to snap down
            if (isHovered && this.input.mouseJustDown && my >= logY + logH - 18) {
                this.logScrollOffset = 0;
            }
        }
    }


    private returnToLobby(): void {
        this.state = GameState.LOBBY;
        this.lobbyUI.toggle();
        this.partyUI.isRaidMode = false;
        this.addCombatLog('Returned to Lobby.');
        // Reset death states and heal all roster characters
        this.party.resetForNewRaid();
        const active = this.party.getActive();
        if (active) {
            this.playerStats = active.stats;
            this.inventoryUI.setActiveCharacter(active);
        }

        // Disconnect from server when returning to lobby
        this.network.disconnect();
        this.remotePlayers.clear();
    }

    private setupNetworkCallbacks(): void {
        this.network.onWelcome = (msg) => {
            this.myNetworkId = msg.playerId || '';
            // Add existing players
            if (msg.players) {
                for (const p of msg.players) {
                    const rp = new RemotePlayer(p.id, p.name, p.x, p.y);
                    this.remotePlayers.set(p.id, rp);
                }
            }
            this.addCombatLog(`${t('mp.connected')}`);
        };

        this.network.onPlayerJoin = (msg) => {
            if (msg.playerId && msg.playerId !== this.myNetworkId) {
                const rp = new RemotePlayer(msg.playerId, msg.playerName || 'Unknown', msg.x || 0, msg.y || 0);
                this.remotePlayers.set(msg.playerId, rp);
                this.addCombatLog(`${msg.playerName}${t('mp.joined')}`);
            }
        };

        this.network.onPlayerMove = (msg) => {
            if (msg.playerId) {
                const rp = this.remotePlayers.get(msg.playerId);
                if (rp) {
                    rp.setPosition(msg.x || 0, msg.y || 0);
                }
            }
        };

        this.network.onPlayerLeave = (msg) => {
            if (msg.playerId) {
                const rp = this.remotePlayers.get(msg.playerId);
                if (rp) {
                    this.addCombatLog(`${rp.name}${t('mp.left')}`);
                    this.remotePlayers.delete(msg.playerId);
                }
            }
        };

        this.network.onBossKilled = (msg) => {
            if (msg.enemyId) {
                const idx = this.enemies.findIndex(e => e.id === msg.enemyId);
                if (idx >= 0) {
                    this.addCombatLog(`${this.enemies[idx].label} was killed by another player!`);
                    this.enemies.splice(idx, 1);
                }
            }
        };
    }

    /** Public method for LobbyUI to connect to multiplayer server */
    public connectToServer(url: string): void {
        this.network.connect(url, this.party.getActive()?.name || 'Player');
    }

    /** Public method for LobbyUI to disconnect from multiplayer server */
    public disconnectFromServer(): void {
        this.network.disconnect();
        this.remotePlayers.clear();
    }

    /** Check if connected to multiplayer server */
    public isNetworkConnected(): boolean {
        return this.network.connected;
    }

    /** Check if currently connecting */
    public isNetworkConnecting(): boolean {
        return this.network.connecting;
    }

    private updateUI(): void {
        // All UI is canvas-rendered — no HTML updates needed
    }
}
