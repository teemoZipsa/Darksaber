/**
 * GameManager — Master orchestrator for the new Sin Eater game loop.
 * Manages title, character creation, and the unified WORLD combat mode.
 * Owns the canvas, input system, and shared data (party, inventory, gold).
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
import { GameState } from './GameState';
import { WorldEngine } from './WorldEngine';
import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { GridInventory } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { CharacterCreationUI } from '../ui/CharacterCreationUI';
import { ITEMS } from '../data/ItemDB';
import { renderGameTitle } from '../ui/UITheme';
import { t } from '../i18n/LanguageManager';
import { InventoryUI } from '../inventory/InventoryUI';
import { PartyUI } from '../ui/PartyUI';
import { CharacterPanelUI } from '../character/CharacterPanelUI';

export class GameManager {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private input: InputManager;
    private camera: Camera;

    private state: GameState = GameState.TITLE;
    private isRunning: boolean = false;
    private lastTime: number = 0;

    // Shared data
    public party: PartyManager;
    public inventory: GridInventory;
    public stash: GridInventory;
    public playerData: PlayerData;

    // Unified field/combat engine
    private worldEngine!: WorldEngine;

    // Field UI overlays
    public inventoryUI: InventoryUI;
    public partyUI: PartyUI;
    public charUI: CharacterPanelUI;

    // Character creation
    private charCreateUI!: CharacterCreationUI;

    // Title screen
    private titleBg = new Image();
    private titleBgLoaded = false;
    private termsHovered = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.input = new InputManager(canvas);
        this.camera = new Camera(canvas.width, canvas.height);

        // Shared systems
        this.party = new PartyManager();
        this.inventory = new GridInventory(10, 6);
        this.stash = new GridInventory(15, 10);
        this.playerData = new PlayerData();
        this.playerData.load();

        // Give starter items
        const sword = ITEMS.find(i => i.id === 'short_sword');
        if (sword) this.inventory.autoPlace(sword);
        const herb = ITEMS.find(i => i.id === 'herb_cheap');
        if (herb) { this.inventory.autoPlace(herb); this.inventory.autoPlace(herb); }
        const mpPot = ITEMS.find(i => i.id === 'mp_potion');
        if (mpPot) this.inventory.autoPlace(mpPot);

        this.inventoryUI = new InventoryUI(this.inventory);
        this.partyUI = new PartyUI(this.party);
        this.charUI = new CharacterPanelUI(this.party);
        this.charUI.getGold = () => this.playerData.gold;

        // Character creation UI
        this.charCreateUI = new CharacterCreationUI();

        // Title background image
        this.titleBg.src = 'public/assets/Start.jpg';
        this.titleBg.onload = () => { this.titleBgLoaded = true; };

        this.charCreateUI.onComplete = (name: string, classId: string, gender: string) => {
            const charId = `player_${Date.now()}`;
            const char = new Character(charId, name, classId);
            char.gender = gender;
            this.party.addToRoster(char);
            this.party.deployCharacter(char);
            this.party.switchTo(0);
            this.inventoryUI.setActiveCharacter(char);
            this.charCreateUI.destroy(); // Remove HTML name input from DOM
            this.initWorldEngine();
            this.state = GameState.WORLD;
        };

        // Resize handler
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.camera.setViewSize(this.canvas.width, this.canvas.height);
        };
        window.addEventListener('resize', resize);
        resize();
    }

    // ═══════════════════════════════════════════════════════════
    //  Game Loop
    // ═══════════════════════════════════════════════════════════

    public start(): void {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); // cap dt
        this.lastTime = timestamp;

        this.update(dt);
        this.render();
        this.input.endFrame();
        requestAnimationFrame((t) => this.loop(t));
    }

    // ═══════════════════════════════════════════════════════════
    //  Update
    // ═══════════════════════════════════════════════════════════

    private update(dt: number): void {
        const scale = SettingsManager.getUIScale();
        const smx = this.input.mouseScreenX / scale;
        const smy = this.input.mouseScreenY / scale;

        switch (this.state) {
            case GameState.TITLE:
                // Hover detection for terms link
                this.termsHovered = (smx >= 12 && smx <= 112 && smy >= Math.floor(this.canvas.height / scale) - 24 && smy <= Math.floor(this.canvas.height / scale) - 8);

                if (this.input.mouseJustDown) {
                    // Check terms link click
                    if (this.termsHovered) {
                        window.open('/legal.html', '_blank');
                        break;
                    }
                }
                if (this.input.mouseJustDown || this.input.justPressed('Enter') || this.input.justPressed('Space')) {
                    // Check if we have a saved party
                    if (this.party.getCharacters().length > 0) {
                        this.initWorldEngine();
                        this.state = GameState.WORLD;
                    } else {
                        this.state = GameState.CHARACTER_CREATION;
                    }
                }
                break;

            case GameState.CHARACTER_CREATION:
                this.charCreateUI.onMouseMove(smx, smy);
                if (this.input.mouseJustDown) {
                    this.charCreateUI.onMouseDown(smx, smy);
                }
                this.charCreateUI.updateInput(this.input);
                break;

            case GameState.WORLD:
                if (this.worldEngine.isModalOverlayVisible()) {
                    this.worldEngine.update(dt, this.input, this.camera);
                    break;
                }

                if (this.input.justPressed('KeyI')) {
                    this.inventoryUI.toggle();
                    if (this.inventoryUI.isVisible() && this.charUI.isVisible()) this.charUI.toggle();
                    if (this.inventoryUI.isVisible() && this.partyUI.isVisible()) this.partyUI.toggle();
                }
                if (this.input.justPressed('KeyP')) {
                    this.partyUI.toggle();
                    if (this.partyUI.isVisible() && this.inventoryUI.isVisible()) this.inventoryUI.toggle();
                    if (this.partyUI.isVisible() && this.charUI.isVisible()) this.charUI.toggle();
                }
                if (this.input.justPressed('KeyC')) {
                    this.charUI.toggle();
                    if (this.charUI.isVisible() && this.inventoryUI.isVisible()) this.inventoryUI.toggle();
                    if (this.charUI.isVisible() && this.partyUI.isVisible()) this.partyUI.toggle();
                }

                // Route input
                if (this.inventoryUI.isVisible()) {
                    this.inventoryUI.onMouseMove(smx, smy);
                    if (this.input.mouseJustDown) this.inventoryUI.onMouseDown(smx, smy);
                    if (this.input.mouseJustUp) this.inventoryUI.onMouseUp(smx, smy);
                    break;
                }
                if (this.charUI.isVisible()) {
                    this.charUI.onMouseMove(smx, smy);
                    if (this.input.mouseClicked) {
                        if (this.charUI.onClick(smx, smy)) {
                            const active = this.party.getActive();
                            if (active) this.inventoryUI.setActiveCharacter(active);
                        }
                    }
                    break;
                }
                if (this.partyUI.isVisible()) {
                    this.partyUI.onMouseMove(smx, smy);
                    if (this.input.mouseJustDown) this.partyUI.onMouseDown(smx, smy);
                    if (this.input.mouseJustUp) this.partyUI.onMouseUp(smx, smy);
                    break;
                }

                this.worldEngine.update(dt, this.input, this.camera);
                break;

        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Render
    // ═══════════════════════════════════════════════════════════

    private render(): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const scale = SettingsManager.getUIScale();

        this.ctx.clearRect(0, 0, w, h);

        switch (this.state) {
            case GameState.TITLE:
                this.renderTitle(w, h);
                break;

            case GameState.CHARACTER_CREATION:
                this.ctx.save();
                this.ctx.scale(scale, scale);
                const vw = Math.floor(w / scale);
                const vh = Math.floor(h / scale);
                this.charCreateUI.render(this.ctx, vw, vh);
                this.ctx.restore();
                break;

            case GameState.WORLD:
                this.worldEngine.render(this.ctx, this.camera, w, h);
                this.ctx.save();
                this.ctx.scale(scale, scale);
                const vw_world = Math.floor(w / scale);
                const vh_world = Math.floor(h / scale);
                if (this.inventoryUI.isVisible()) this.inventoryUI.render(this.ctx, vw_world, vh_world);
                if (this.partyUI.isVisible()) this.partyUI.render(this.ctx, vw_world, vh_world);
                if (this.charUI.isVisible()) this.charUI.render(this.ctx, vw_world, vh_world);
                this.ctx.restore();
                break;

        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Init helpers
    // ═══════════════════════════════════════════════════════════

    private initWorldEngine(): void {
        this.worldEngine = new WorldEngine(
            this.canvas, this.ctx, this.input, this.camera,
            this.party, this.inventory, this.playerData,
            this
        );
    }

    // ═══════════════════════════════════════════════════════════
    //  Render helpers
    // ═══════════════════════════════════════════════════════════

    private renderTitle(w: number, h: number): void {
        // Background image
        if (this.titleBgLoaded) {
            this.ctx.drawImage(this.titleBg, 0, 0, w, h);
        } else {
            this.ctx.fillStyle = '#0a0c1a';
            this.ctx.fillRect(0, 0, w, h);
        }

        const cx = w / 2;
        const cy = h / 2;

        renderGameTitle(this.ctx, cx - 140, cy - 80, { scale: 1.2, subtitle: '' });

        this.ctx.fillStyle = 'rgba(255, 200, 100, 0.7)';
        this.ctx.font = `16px "DOSMyungjo", sans-serif`;
        this.ctx.textAlign = 'center';
        const pulse = 0.5 + Math.sin(performance.now() / 500) * 0.3;
        this.ctx.globalAlpha = pulse;
        this.ctx.fillText(t('title.pressEnter'), cx, cy + 40);
        this.ctx.globalAlpha = 1;
        this.ctx.textAlign = 'start';

        // Terms | Privacy link (bottom-left)
        const scale = SettingsManager.getUIScale();
        this.ctx.save();
        this.ctx.scale(scale, scale);
        const vh = Math.floor(h / scale);
        this.ctx.fillStyle = this.termsHovered ? 'rgba(220,190,100,0.9)' : 'rgba(160,140,100,0.7)';
        this.ctx.font = '14px "DOSMyungjo", sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(t('title.terms'), 12, vh - 8);
        this.ctx.textAlign = 'start';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.restore();
    }

}
