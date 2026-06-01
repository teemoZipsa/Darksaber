/**
 * TownUI — town-visit state holder for the React DOM overlay.
 *
 * The town screen (Mount & Blade / Uncharted Waters style) is now rendered by the
 * React overlay (`ui/react/town/TownScreen`). This class keeps the canvas-side
 * state — which town is open, the active tab, the rolled rumors — and still owns
 * the sub-UIs (shop data + the canvas InventoryUI used by the storage tab, which
 * is migrated last). React reads state through the public accessors and drives
 * changes through `setTab` / `requestDeploy` and the ShopUI/session actions.
 *
 * Tabs are the facilities exposed by TownFacilityData.
 */

import { GridInventory } from '../inventory/GridInventory';
import { InventoryUI } from '../inventory/InventoryUI';
import { ShopUI } from './ShopUI';
import { InputManager } from '../engine/InputManager';
import { TownInfo } from '../map/BiomeMask';
import type { Character } from '../character/Character';
import { t } from '../i18n/LanguageManager';
import { getRestFacility, type RestFacility } from '../data/RestFacilityData';
import { getTownFacilities, type TownFacilityId } from '../data/TownFacilityData';

export type TownTab = TownFacilityId;

/** Random rumor keys per town, cycling for variety. */
export const RUMOR_KEYS: string[] = [
    'rumors.common.eastBoss',
    'rumors.common.desertRelic',
    'rumors.common.poisonMarsh',
    'rumors.common.masterKey',
    'rumors.common.legendaryWeapon',
    'rumors.common.pirates',
    'rumors.common.cursedRelicBuyer',
    'rumors.common.mysteryShip',
    'rumors.common.forestRuins',
    'rumors.common.cursedRelicDisaster',
    'rumors.common.desertOasis',
    'rumors.common.easternLava',
];

export class TownUI {
    // Current town being visited
    private currentTown: TownInfo | null = null;

    // Sub-UIs
    private inventoryUI: InventoryUI;
    private shopUI: ShopUI;
    private backpack: GridInventory;

    // State
    private visible: boolean = false;
    private activeTab: TownTab = 'storage';
    private onDeployAction: (() => void) | null = null;

    // Rumors state (random selection per visit)
    private currentRumors: string[] = [];

    // Player gold reference (updated externally)
    public playerGold: number = 0;
    public getQuestDone: ((questId: string) => boolean) | null = null;
    public getPendingRestMenuId: (() => string | null) | null = null;
    public getInjuredCount: (() => number) | null = null;
    public getMarketRumor: ((townId: string) => string | null) | null = null;
    public onPurchaseRestMenu: ((menuId: string) => boolean) | null = null;
    public onTreatInjuries: (() => boolean) | null = null;

    // Main stash (shared with lobby)
    public stash: GridInventory;

    constructor(activeCharInv: GridInventory, stash: GridInventory) {
        this.backpack = activeCharInv;
        this.stash = stash;
        this.inventoryUI = new InventoryUI(activeCharInv);
        this.inventoryUI.setExternalGrid(this.stash, `🏰 ${t('lobby.stash')}`);
        this.inventoryUI.setHideCloseBtn(true);
        this.shopUI = new ShopUI();
        this.shopUI.getGold = () => this.playerGold;
        this.syncShopSources();
    }

    // ── Callbacks ──────────────────────────────────────────────────

    public onDeploy(callback: () => void): void {
        this.onDeployAction = callback;
    }

    public getShopUI(): ShopUI { return this.shopUI; }
    public getInventoryUI(): InventoryUI { return this.inventoryUI; }

    // ── React (DOM overlay) accessors / actions ────────────────────
    public getActiveTab(): TownTab { return this.activeTab; }
    public setTab(tab: TownTab): void { this.showTab(tab); }
    public getCurrentTown(): TownInfo | null { return this.currentTown; }
    public getRumors(): string[] { return this.currentRumors; }
    public getRestFacilityPublic(): RestFacility | null { return this.getCurrentRestFacility(); }
    /** Leave town (mirrors the old canvas deploy button). */
    public requestDeploy(): void {
        if (this.onDeployAction) {
            this.hide();
            this.onDeployAction();
        }
    }

    private syncShopSources(): void {
        this.shopUI.setSellSources([
            { id: 'backpack', label: t('inv.backpack'), grid: this.backpack },
            { id: 'stash', label: t('lobby.stash'), grid: this.stash },
        ]);
    }

    private getCurrentRestFacility(): RestFacility | null {
        return this.currentTown ? getRestFacility(this.currentTown.id) : null;
    }

    public setActiveCharacter(char: Character): void {
        this.inventoryUI.setActiveCharacter(char);
    }

    // ── Lifecycle ──────────────────────────────────────────────────

    public show(town: TownInfo): void {
        this.currentTown = town;
        this.shopUI.setTownId(town.id);
        this.visible = true;
        this.activeTab = 'storage';

        // Pick 3 random rumors for this visit.
        const rumorPool = RUMOR_KEYS.map((key) => t(key));
        const shuffled = [...rumorPool].sort(() => Math.random() - 0.5);
        const marketRumor = getTownFacilities(town.id).includes('rumors')
            ? this.getMarketRumor?.(town.id) ?? null
            : null;
        this.currentRumors = marketRumor
            ? [marketRumor, ...shuffled.slice(0, 2)]
            : shuffled.slice(0, 3);

        this.showTab('storage');
    }

    public hide(): void {
        this.visible = false;
        if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
        this.shopUI.hide();
        this.currentTown = null;
    }

    public isVisible(): boolean { return this.visible; }

    private showTab(tab: TownTab): void {
        const facilities = this.currentTown ? getTownFacilities(this.currentTown.id) : ['storage'];
        if (!facilities.includes(tab)) {
            tab = 'storage';
        }
        if (tab === 'rest' && !this.getCurrentRestFacility()) {
            tab = 'storage';
        }
        this.activeTab = tab;

        // Toggle the canvas sub-UIs to match the active tab.
        if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
        this.shopUI.hide();

        switch (tab) {
            case 'storage':
                this.inventoryUI.setExternalGrid(this.stash, `🏰 ${t('lobby.stash')}`);
                if (!this.inventoryUI.isVisible()) this.inventoryUI.toggle();
                break;
            case 'weapon_shop':
            case 'armor_shop':
            case 'general_store':
            case 'specialty_trader':
            case 'shrine':
                this.syncShopSources();
                this.shopUI.setTownId(this.currentTown?.id ?? null);
                this.shopUI.setFacilityId(tab);
                this.shopUI.show();
                break;
            // rest / healer / quest / rumors are rendered by the React overlay (no sub-UI).
        }
    }

    // ── Input / rendering ──────────────────────────────────────────
    // The entire town screen — including the storage tab's inventory grid — is now
    // rendered and input-handled by the React DOM overlay (TownScreen / InventoryPanel).
    // These remain so the WorldEngine render/input pipeline can still call them.

    public updateInput(_input: InputManager): void { /* React owns town input */ }

    public render(_ctx: CanvasRenderingContext2D, _w: number, _h: number): void { /* React draws the town */ }
}
