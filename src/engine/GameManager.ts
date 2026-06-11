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
import { GridInventory, type PlacedItem } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { ITEMS } from '../data/ItemDB';
import { getClassLine } from '../data/ClassTree';
import { getStoryCompanionRewards } from '../data/StoryQuestData';
import { renderGameTitle } from '../ui/UITheme';
import { t } from '../i18n/LanguageManager';
import { InventoryUI } from '../inventory/InventoryUI';
import { PartyUI } from '../ui/PartyUI';
import { CharacterPanelUI } from '../character/CharacterPanelUI';
import { TransitionManager } from '../ui/TransitionManager';
import { PauseMenuUI } from '../ui/PauseMenuUI';
import { SettingsUI } from '../ui/SettingsUI';
import { HitStop } from './world/HitStop';
import { AudioManager } from './AudioManager';
import type { UiStore } from '../ui/react/UiStore';
import type { WorldTownSession } from './world/WorldTownSession';
import type { WorldRaidSession } from './world/WorldRaidSession';
import type { AccountProgress, AuthCharacter, AuthClient, CharacterSave, InventorySaveItem } from '../net/AuthClient';
import { normalizeLoadout, normalizeUpgradeLevels } from '../magic/MagicLoadout';
import { getExpToNext as originalExpToNext } from '../data/original/originalProgression';

export interface AuthenticatedCharacterSession {
    accessToken: string;
    character: AuthCharacter;
    save: CharacterSave;
    accountProgress: AccountProgress;
    /** Optional — enables server persistence of magic loadout/upgrade changes. */
    authClient?: AuthClient;
}

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

    // Title screen
    private titleBg = new Image();
    private titleBgLoaded = false;
    private termsHovered = false;

    // Transitions + pause + settings
    private transitions = new TransitionManager();
    private pauseMenu = new PauseMenuUI();
    private settingsUI = new SettingsUI();
    private questJournalOpen = false;
    private magicLoadoutOpen = false;
    private startIntroTutorialOnWorldInit = false;
    private networkAuthContext: { accessToken: string; characterId: string } | null = null;
    private authClient: AuthClient | null = null;
    private networkSaveRevision = 0;

    // React DOM UI overlay bridge (attached after construction in main.ts)
    private uiStore?: UiStore;

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
        this.playerData.setCharacterSaveProvider(() => this.buildLocalCharacterSavePatch());
        this.syncStoryCompanionsToRoster();

        this.loadInitialSoloInventory();

        this.inventoryUI = new InventoryUI(this.inventory);
        this.partyUI = new PartyUI(this.party);
        this.charUI = new CharacterPanelUI(this.party);
        this.charUI.getGold = () => this.playerData.gold;

        // Title background image
        this.titleBg.src = '/assets/images/backgrounds/start.jpg';
        this.titleBg.onload = () => { this.titleBgLoaded = true; };

        this.pauseMenu.onResume = () => undefined;
        this.pauseMenu.onOpenSettings = () => this.settingsUI.open();
        this.pauseMenu.onReturnToTitle = () => {
            this.pauseMenu.close();
            this.transitionTo(GameState.TITLE);
        };
        this.settingsUI.onClose = () => this.pauseMenu.open();

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
        this.transitions.fadeInFromBlack(500);
        AudioManager.init();
        this.scheduleFrame();
    }

    /**
     * Schedule the next frame. Normally uses requestAnimationFrame. In DEV only,
     * when the tab is hidden (e.g. the headless preview), rAF is paused by the
     * browser — so we fall back to a timer to keep the loop alive for verification.
     * Hidden-tab timers are clamped to ~1s by Chrome, i.e. ~1fps, which is enough
     * to drive state and capture. No effect in production builds.
     */
    private scheduleFrame(): void {
        if (import.meta.env.DEV && typeof document !== 'undefined' && document.hidden) {
            setTimeout(() => this.loop(performance.now()), 16);
        } else {
            requestAnimationFrame((frameTime) => this.loop(frameTime));
        }
    }

    /**
     * Transition to a new state with a fade. The mid-callback (state switch + any
     * heavy init) runs while the screen is fully black so the user never sees a flash.
     */
    public transitionTo(next: GameState, prepare?: () => void): void {
        this.transitions.requestTransition({
            midCallback: () => {
                if (prepare) prepare();
                this.state = next;
            },
        });
    }

    /** Called by WorldEngine when ESC has no in-world target to cancel. */
    public openPauseMenu(): void {
        if (this.state !== GameState.WORLD) return;
        this.pauseMenu.open();
    }

    public closePauseMenu(): void {
        this.pauseMenu.close();
    }

    /** Attach the React DOM overlay store (called once from main.ts after boot). */
    public attachUiStore(store: UiStore): void {
        this.uiStore = store;
    }

    /**
     * True when a DOM-overlay modal owns the screen. The world engine must not
     * process input while this is the case (the DOM scrim also absorbs clicks,
     * but this guard keeps correctness independent of DOM layering).
     */
    public isDomModalOpen(): boolean {
        return this.charUI.isVisible() || this.pauseMenu.isVisible()
            || this.settingsUI.isVisible() || this.partyUI.isVisible()
            || this.questJournalOpen || this.magicLoadoutOpen;
    }

    /**
     * The active town-visit session, or null when not in a town. Consumed by the
     * React DOM overlay (TownScreen). The world is already frozen while a town is
     * visible (see WorldEngine.isModalOverlayVisible), so this needs no extra guard.
     */
    public getTownSession(): WorldTownSession | null {
        if (this.state !== GameState.WORLD || !this.worldEngine) return null;
        return this.worldEngine.getTownSession();
    }

    public getRaidSession(): WorldRaidSession | null {
        if (this.state !== GameState.WORLD || !this.worldEngine) return null;
        return this.worldEngine.getRaidSession();
    }

    public isQuestJournalOpen(): boolean {
        return this.questJournalOpen;
    }

    public closeQuestJournal(): void {
        this.questJournalOpen = false;
    }

    private toggleQuestJournal(): void {
        if (!this.worldEngine?.isQuestJournalAvailable()) return;
        if (!this.questJournalOpen) {
            if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
            if (this.charUI.isVisible()) this.charUI.toggle();
            if (this.partyUI.isVisible()) this.partyUI.toggle();
            this.magicLoadoutOpen = false;
        }
        this.questJournalOpen = !this.questJournalOpen;
    }

    // ─── Magic loadout panel (DOM overlay, K key) ─────────────────
    public isMagicLoadoutOpen(): boolean {
        return this.magicLoadoutOpen;
    }

    public closeMagicLoadout(): void {
        this.magicLoadoutOpen = false;
    }

    /** Persist the active character's magic loadout + upgrade levels (local + network). */
    public saveActiveCharacterMagic(): void {
        this.playerData.save();
        this.persistActiveCharacterSaveToServer();
    }

    /** Push the roster save (incl. magic loadout/upgrades) to the server, if authed. */
    private persistActiveCharacterSaveToServer(): void {
        const client = this.authClient;
        const ctx = this.networkAuthContext;
        if (!client || !ctx) return;
        const rosterSnapshot = this.buildRosterSnapshot();
        void client
            .updateCharacterSave(ctx.characterId, { rosterSnapshot }, this.networkSaveRevision)
            .then((save) => { this.networkSaveRevision = save.revision; })
            .catch(() => { /* best-effort; local save already applied, retried on next change */ });
    }

    private buildLocalCharacterSavePatch(): Partial<Pick<CharacterSave, 'inventory' | 'equipment' | 'partySnapshot' | 'rosterSnapshot'>> {
        return {
            inventory: this.buildInventorySaveSnapshot(),
            equipment: this.buildEquipmentSaveSnapshot(),
            partySnapshot: {
                activeCharacterIds: this.party.getCharacters().map((character) => character.id),
            },
            rosterSnapshot: this.buildRosterSnapshot(),
        };
    }

    private buildInventorySaveSnapshot(): CharacterSave['inventory'] {
        return {
            width: this.inventory.width,
            height: this.inventory.height,
            items: this.inventory.items.map(placedItemToSaveItem),
        };
    }

    private buildEquipmentSaveSnapshot(): Record<string, unknown> {
        return {
            characters: this.party.getRoster().map((character) => ({
                id: character.id,
                slots: Object.fromEntries(
                    [...character.equipment.entries()].map(([slot, placed]) => [slot, placedItemToSaveItem(placed)])
                ),
            })),
        };
    }

    /** Serialize the current roster into the persisted rosterSnapshot shape. */
    private buildRosterSnapshot(): Record<string, unknown> {
        return {
            characters: this.party.getRoster().map((character) => ({
                id: character.id,
                name: character.name,
                classKey: character.classLineId,
                classLineId: character.classLineId,
                gender: character.gender,
                tier: character.currentTier,
                level: character.level,
                exp: character.exp,
                baseStats: character.stats,
                magicLoadout: normalizeLoadout(character.magicLoadout, character),
                skillUpgradeLevels: { ...character.skillUpgradeLevels },
            })),
        };
    }

    private toggleMagicLoadout(): void {
        if (!this.magicLoadoutOpen) {
            if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
            if (this.charUI.isVisible()) this.charUI.toggle();
            if (this.partyUI.isVisible()) this.partyUI.toggle();
            this.questJournalOpen = false;
        }
        this.magicLoadoutOpen = !this.magicLoadoutOpen;
    }

    // ─── World inventory (DOM overlay) ────────────────────────────
    /** The standalone world inventory is open (I/Tab), and not inside a town. */
    public isWorldInventoryOpen(): boolean {
        return this.state === GameState.WORLD
            && this.inventoryUI.isVisible()
            && !this.getTownSession()?.isVisible();
    }
    public closeWorldInventory(): void {
        if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
    }

    // ─── Character creation (DOM overlay) ─────────────────────────
    public isCharCreationState(): boolean { return this.state === GameState.CHARACTER_CREATION; }

    /** Create the player character from the DOM creation screen and enter the world. */
    public completeCharacterCreation(name: string, classId: string, gender: string): void {
        const charId = `player_${Date.now()}`;
        const char = new Character(charId, name.trim() || 'Hero', classId);
        char.gender = gender;
        this.party.addToRoster(char);
        this.party.deployCharacter(char);
        this.party.switchTo(0);
        this.syncStoryCompanionsToRoster();
        this.inventoryUI.setActiveCharacter(char);
        this.startIntroTutorialOnWorldInit = true;
        this.transitionTo(GameState.WORLD, () => this.initWorldEngine());
    }

    public enterAuthenticatedCharacter(session: AuthenticatedCharacterSession): void {
        this.networkAuthContext = {
            accessToken: session.accessToken,
            characterId: session.character.id,
        };
        this.authClient = session.authClient ?? null;
        this.networkSaveRevision = session.save.revision;
        this.party.clear();
        this.inventory.clear();
        this.stash.clear();
        this.loadRosterFromSave(session.character, session.save);
        this.loadInventoryFromSave(session.save);
        this.playerData.applyCharacterSave(session.save);
        this.playerData.clearedStages = new Set([...this.playerData.clearedStages, ...session.accountProgress.completedQuests]);
        this.syncStoryCompanionsToRoster();
        this.onActiveCharacterChanged();
        this.startIntroTutorialOnWorldInit = false;
        this.transitionTo(GameState.WORLD, () => this.initWorldEngine());
    }

    public updateNetworkAccessToken(accessToken: string): void {
        if (!this.networkAuthContext) return;
        this.networkAuthContext = { ...this.networkAuthContext, accessToken };
    }

    public getNetworkAuthContext(): { accessToken: string; characterId: string } | null {
        return this.networkAuthContext;
    }

    private loadInitialSoloInventory(): void {
        const localSave = this.playerData.toCharacterSave();
        if (localSave.inventory.items.length > 0) {
            this.loadInventoryFromSave(localSave);
            return;
        }

        const sword = ITEMS.find(i => i.id === 'short_sword');
        if (sword) this.inventory.autoPlace(sword);
        const herb = ITEMS.find(i => i.id === 'herb_cheap');
        if (herb) { this.inventory.autoPlace(herb); this.inventory.autoPlace(herb); }
        const mpPot = ITEMS.find(i => i.id === 'mp_potion');
        if (mpPot) this.inventory.autoPlace(mpPot);
    }

    public syncStoryCompanionsToRoster(): void {
        const roster = this.party.getRoster();
        for (const companion of getStoryCompanionRewards()) {
            if (!this.playerData.hasStoryCompanion(companion.companionId)) continue;
            if (roster.some((character) => character.id === companion.companionId)) continue;
            this.party.addToRoster(new Character(companion.companionId, t(companion.nameKey), companion.classId));
        }
    }

    private loadRosterFromSave(selectedCharacter: AuthCharacter, save: CharacterSave): void {
        const rosterEntries = readRosterEntries(save, selectedCharacter);
        const activeIds = readStringArray(save.partySnapshot.activeCharacterIds);
        const characters = new Map<string, Character>();
        for (const entry of rosterEntries) {
            const character = new Character(entry.id, entry.name, entry.classKey);
            character.gender = entry.gender;
            character.currentTier = entry.tier;
            character.level = entry.level;
            character.exp = entry.exp;
            character.expToNext = calcExpToNext(character.classLineId, character.currentTier, character.level);
            character.stats = { ...character.stats, ...entry.baseStats };
            // Original-aligned classes are stat-determined by (tier, level); recompute so
            // saves created with the old/server base stats don't keep stale off-scale values.
            character.syncOriginalBaseStats();
            character.magicLoadout = normalizeLoadout(entry.magicLoadout, character);
            character.skillUpgradeLevels = normalizeUpgradeLevels(entry.skillUpgradeLevels);
            this.party.addToRoster(character);
            characters.set(character.id, character);
        }

        const deployIds = activeIds.length > 0 ? activeIds : [selectedCharacter.id];
        for (const id of deployIds.slice(0, this.party.MAX_ACTIVE_PARTY_SIZE)) {
            const character = characters.get(id);
            if (character) this.party.deployCharacter(character);
        }
        if (this.party.getCharacters().length === 0) {
            const fallback = characters.get(selectedCharacter.id) ?? this.party.getRoster()[0];
            if (fallback) this.party.deployCharacter(fallback);
        }
        this.party.switchTo(0);
    }

    private loadInventoryFromSave(save: CharacterSave): void {
        this.inventory.clear();
        for (const entry of save.inventory.items) this.placeSavedInventoryItem(entry);
    }

    private placeSavedInventoryItem(entry: InventorySaveItem): void {
        const item = ITEMS.find((candidate) => candidate.id === entry.itemId);
        if (!item) return;
        const placed = this.inventory.place(item, entry.gridX, entry.gridY) ?? this.inventory.autoPlace(item);
        if (!placed) return;
        placed.quantity = Math.max(1, Math.floor(entry.quantity));
        placed.durability = Math.max(0, Math.min(item.maxDurability, Math.floor(entry.durability)));
        placed.acquiredInRaid = entry.acquiredInRaid;
        placed.sockets = (entry.sockets ?? []).flatMap((itemId) => {
            const socket = ITEMS.find((candidate) => candidate.id === itemId);
            return socket ? [socket] : [];
        });
    }

    // ─── Pause menu (DOM overlay) ─────────────────────────────────
    public isPauseMenuOpen(): boolean { return this.pauseMenu.isVisible(); }

    public pauseResume(): void {
        if (!this.pauseMenu.isVisible()) return;
        AudioManager.playUi('ui.cancel');
        this.pauseMenu.close();
    }

    public pauseOpenSettings(): void {
        AudioManager.playUi('ui.confirm');
        // Settings is still a canvas modal; close the DOM pause first so its scrim
        // doesn't sit above the canvas Settings panel. settingsUI.onClose reopens pause.
        this.pauseMenu.close();
        this.settingsUI.open();
    }

    public pauseReturnToTitle(): void {
        AudioManager.playUi('ui.confirm');
        this.pauseMenu.close();
        this.transitionTo(GameState.TITLE);
    }

    // ─── Settings menu (DOM overlay) ──────────────────────────────
    public isSettingsMenuOpen(): boolean { return this.settingsUI.isVisible(); }

    public closeSettingsMenu(): void {
        AudioManager.playUi('ui.cancel');
        this.settingsUI.close();
        this.pauseMenu.open(); // Settings is always opened from pause — return there.
    }

    /**
     * Called when the active party member changes (e.g. from the DOM character
     * panel's tab switch) so dependent UI stays in sync.
     */
    public onActiveCharacterChanged(): void {
        const active = this.party.getActive();
        if (active) this.inventoryUI.setActiveCharacter(active);
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;
        const elapsedMs = timestamp - this.lastTime;
        const frameInterval = SettingsManager.getFrameInterval();
        if (frameInterval > 0 && elapsedMs < frameInterval) {
            this.scheduleFrame();
            return;
        }

        const rawDt = Math.min(elapsedMs / 1000, 0.1); // cap dt
        this.lastTime = frameInterval > 0 ? timestamp - (elapsedMs % frameInterval) : timestamp;

        // Hit-pause freezes world time. Transitions and overlays keep their own clock.
        const dt = rawDt * HitStop.timeScale;

        this.transitions.update(timestamp);
        this.update(dt);
        this.render();
        this.input.endFrame();
        // Drive the React DOM overlay: one notification per frame so it reflects
        // freshly-updated game state (gold, HP/MP, active character, etc.).
        this.uiStore?.tick();
        this.scheduleFrame();
    }

    // ═══════════════════════════════════════════════════════════
    //  Update
    // ═══════════════════════════════════════════════════════════

    private update(dt: number): void {
        const scale = SettingsManager.getUIScale();
        const smx = this.input.mouseScreenX / scale;
        const smy = this.input.mouseScreenY / scale;

        // While the screen is fading out / held black, swallow input so the user
        // can't double-trigger transitions or interact with stale state.
        if (this.transitions.isInputLocked()) return;

        switch (this.state) {
            case GameState.TITLE:
                // Hover detection for terms link
                const termsBounds = this.getTermsLinkBounds(scale);
                this.termsHovered = (
                    smx >= termsBounds.x &&
                    smx <= termsBounds.x + termsBounds.w &&
                    smy >= termsBounds.y &&
                    smy <= termsBounds.y + termsBounds.h
                );

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
                        this.transitionTo(GameState.WORLD, () => this.initWorldEngine());
                    } else {
                        this.transitionTo(GameState.CHARACTER_CREATION);
                    }
                }
                break;

            case GameState.CHARACTER_CREATION:
                // Rendered & handled by the React DOM overlay (CharacterCreation).
                break;

            case GameState.WORLD:
                // Settings is now a React DOM overlay; handle ESC-to-close, freeze world.
                if (this.settingsUI.isVisible()) {
                    if (this.input.justPressed('Escape')) this.closeSettingsMenu();
                    break;
                }
                // Pause menu is a React DOM overlay; it owns its own clicks.
                // We only handle ESC-to-resume here and freeze the world while open.
                if (this.pauseMenu.isVisible()) {
                    if (this.input.justPressed('Escape')) this.pauseResume();
                    break;
                }

                if (this.input.justPressed('KeyJ')) {
                    this.toggleQuestJournal();
                }
                if (this.questJournalOpen) {
                    if (this.input.justPressed('Escape')) this.closeQuestJournal();
                    break;
                }

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
                if (this.input.justPressed('KeyK')) {
                    this.toggleMagicLoadout();
                }
                if (this.magicLoadoutOpen) {
                    if (this.input.justPressed('Escape')) this.closeMagicLoadout();
                    break;
                }

                // Inventory is a React DOM overlay; it owns its own pointer handling.
                // Freeze the world while it is open.
                if (this.inventoryUI.isVisible()) break;
                // The character panel is now a React DOM overlay (see ui/react).
                // It owns its own pointer handling; the DOM panel sits above the
                // canvas so clicks never reach InputManager. We only need to keep
                // the world frozen while it (or any DOM modal) is open.
                // partyUI is now a React DOM overlay (see ui/react/party); world
                // input is frozen below via isDomModalOpen while it's open.
                if (this.isDomModalOpen()) break;

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

        this.ctx.clearRect(0, 0, w, h);

        switch (this.state) {
            case GameState.TITLE:
                this.renderTitle(w, h);
                break;

            case GameState.CHARACTER_CREATION:
                // Drawn by the React DOM overlay (CharacterCreation).
                break;

            case GameState.WORLD:
                this.worldEngine.render(this.ctx, this.camera, w, h);
                // inventoryUI + charUI + pauseMenu + settingsUI + partyUI are all
                // rendered by the React DOM overlay now.
                break;

        }

        // Transition overlay sits on top of everything.
        this.transitions.render(this.ctx, w, h);
    }

    // ═══════════════════════════════════════════════════════════
    //  Init helpers
    // ═══════════════════════════════════════════════════════════

    private initWorldEngine(): void {
        const startIntroTutorial = this.startIntroTutorialOnWorldInit;
        this.startIntroTutorialOnWorldInit = false;
        this.worldEngine = new WorldEngine(
            this.canvas, this.ctx, this.input, this.camera,
            this.party, this.inventory, this.playerData,
            this,
            { startIntroTutorial }
        );
    }

    private getTermsLinkBounds(scale: number): { x: number; y: number; w: number; h: number } {
        const text = t('title.terms');
        this.ctx.save();
        this.ctx.font = '14px "DOSMyungjo", sans-serif';
        const width = Math.ceil(this.ctx.measureText(text).width);
        this.ctx.restore();

        const height = 16;
        const bottom = Math.floor(this.canvas.height / scale) - 8;
        return { x: 12, y: bottom - height, w: width, h: height };
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

        const titleScale = Math.min(3.65, Math.max(1.35, (w - 48) / 275));
        const titleY = Math.max(28, cy - Math.round(50 * titleScale));
        const titleH = renderGameTitle(this.ctx, cx, titleY, { scale: titleScale, subtitle: '', align: 'center', glow: 'subtle' });

        const promptSize = Math.round(Math.min(28, Math.max(18, titleScale * 7)));
        const promptText = t('title.pressEnter');
        const promptY = Math.min(h - 70, titleY + titleH + Math.round(20 * titleScale));
        this.ctx.font = `${promptSize}px "DOSMyungjo", sans-serif`;
        this.ctx.textAlign = 'center';
        const pulse = 0.75 + Math.sin(performance.now() / 500) * 0.15;
        this.ctx.globalAlpha = pulse;
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        this.ctx.shadowBlur = 8;
        this.ctx.lineWidth = Math.max(2, Math.round(promptSize / 7));
        this.ctx.strokeStyle = 'rgba(20, 10, 0, 0.85)';
        this.ctx.strokeText(promptText, cx, promptY);
        this.ctx.fillStyle = 'rgba(255, 210, 120, 0.95)';
        this.ctx.fillText(promptText, cx, promptY);
        this.ctx.shadowBlur = 0;
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

interface SavedRosterEntry {
    id: string;
    name: string;
    classKey: string;
    gender: string;
    tier: number;
    level: number;
    exp: number;
    baseStats: Partial<AuthCharacter['baseStats']>;
    magicLoadout: string[];
    skillUpgradeLevels: Record<string, number>;
}

function readRosterEntries(save: CharacterSave, selectedCharacter: AuthCharacter): SavedRosterEntry[] {
    const rawCharacters = Array.isArray(save.rosterSnapshot.characters) ? save.rosterSnapshot.characters : [];
    const entries = rawCharacters.flatMap((raw): SavedRosterEntry[] => {
        if (!isRecord(raw)) return [];
        const id = typeof raw.id === 'string' ? raw.id : null;
        const name = typeof raw.name === 'string' ? raw.name : null;
        const classKey = typeof raw.classKey === 'string'
            ? raw.classKey
            : typeof raw.classLineId === 'string'
                ? raw.classLineId
                : null;
        if (!id || !name || !classKey) return [];
        return [{
            id,
            name,
            classKey,
            gender: typeof raw.gender === 'string' ? raw.gender : 'M',
            tier: positiveInt(raw.tier ?? raw.currentTier, 1),
            level: positiveInt(raw.level, 1),
            exp: positiveInt(raw.exp, 0),
            baseStats: isRecord(raw.baseStats) ? raw.baseStats : {},
            magicLoadout: readStringArray(raw.magicLoadout),
            skillUpgradeLevels: readNumberRecord(raw.skillUpgradeLevels),
        }];
    });
    if (!entries.some((entry) => entry.id === selectedCharacter.id)) {
        entries.unshift({
            id: selectedCharacter.id,
            name: selectedCharacter.name,
            classKey: selectedCharacter.classKey,
            gender: 'M',
            tier: selectedCharacter.tier,
            level: selectedCharacter.level,
            exp: selectedCharacter.exp,
            baseStats: selectedCharacter.baseStats,
            magicLoadout: [],
            skillUpgradeLevels: {},
        });
    }
    return entries;
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function placedItemToSaveItem(placed: PlacedItem): InventorySaveItem {
    return {
        itemId: placed.item.id,
        gridX: placed.gridX,
        gridY: placed.gridY,
        quantity: Math.max(1, Math.floor(placed.quantity)),
        durability: Math.max(0, Math.floor(placed.durability)),
        ...(placed.acquiredInRaid ? { acquiredInRaid: true } : {}),
        ...(placed.sockets && placed.sockets.length > 0 ? { sockets: placed.sockets.map((item) => item.id) } : {}),
    };
}

function readNumberRecord(value: unknown): Record<string, number> {
    if (!isRecord(value)) return {};
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
    }
    return result;
}

function calcExpToNext(classLineId: string, currentTier: number, level: number): number {
    const original = originalExpToNext(classLineId, currentTier, level);
    if (original !== undefined) return original;
    const classLine = getClassLine(classLineId);
    const tierIndex = classLine?.tiers.findIndex((tier) => tier.tier === currentTier) ?? 0;
    const tierMult = Math.pow(1.15, Math.max(0, tierIndex));
    const levelMult = Math.pow(1.08, Math.max(0, level - 1));
    return Math.floor(50 * tierMult * levelMult);
}

function positiveInt(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
