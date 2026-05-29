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
 * Tabs: 창고(storage) / 상점(shop) / 휴식(rest) / 퀘스트(quest) / 소문(rumors).
 */

import { GridInventory } from '../inventory/GridInventory';
import { InventoryUI } from '../inventory/InventoryUI';
import { ShopUI } from './ShopUI';
import { InputManager } from '../engine/InputManager';
import { TownInfo } from '../map/BiomeMask';
import type { Character } from '../character/Character';
import { t } from '../i18n/LanguageManager';
import { getRestFacility, type RestFacility } from '../data/RestFacilityData';

export type TownTab = 'storage' | 'shop' | 'rest' | 'quest' | 'rumors';

/** Random rumors per town, cycling for variety */
export const RUMORS_KR: string[] = [
    '동쪽 대륙에 강력한 보스가 출현했다는 소문이 있다…',
    '사막의 전초기지에서 희귀한 유물이 발견되었다고 한다.',
    '남부 은신처 근처 숲에서 독 늪지대가 넓어지고 있다.',
    '봉인된 방을 열 수 있는 마스터키가 어딘가에 숨겨져 있다…',
    '중앙 성채의 대장장이가 전설의 무기를 만들 수 있다는 소문이…',
    '최근 해안가 근처에 해적들이 출몰하기 시작했다.',
    '동부 거점의 상인이 저주받은 유물을 비싸게 사들인다고 한다.',
    '남동 항구에서 신비한 배가 목격되었다는 이야기가 들린다.',
    '숲속 마을의 장로가 그 숲에 옛 유적 입구가 있다고 말했다.',
    '저주받은 유물을 가진 채로 마을에 들어오면 재앙이 온다는 전설이 있다.',
    '사막 한가운데에 오아시스가 있고, 그곳에 숨겨진 보물이 있다고…',
    '동쪽 대륙의 특수 지역에서는 용암이 솟아오른다고 한다.',
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
    public onPurchaseRestMenu: ((menuId: string) => boolean) | null = null;
    public onTreatInjuries: (() => boolean) | null = null;

    // Main stash (shared with lobby)
    public stash: GridInventory;

    constructor(activeCharInv: GridInventory, stash: GridInventory) {
        this.backpack = activeCharInv;
        this.stash = stash;
        this.inventoryUI = new InventoryUI(activeCharInv);
        this.inventoryUI.setExternalGrid(this.stash, '🏰 마을 창고');
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
        this.visible = true;
        this.activeTab = 'storage';

        // Pick 3 random rumors for this visit
        const shuffled = [...RUMORS_KR].sort(() => Math.random() - 0.5);
        this.currentRumors = shuffled.slice(0, 3);

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
        if (tab === 'rest' && !this.getCurrentRestFacility()) {
            tab = 'storage';
        }
        this.activeTab = tab;

        // Toggle the canvas sub-UIs to match the active tab.
        if (this.inventoryUI.isVisible()) this.inventoryUI.toggle();
        this.shopUI.hide();

        switch (tab) {
            case 'storage':
                this.inventoryUI.setExternalGrid(this.stash, '🏰 마을 창고');
                if (!this.inventoryUI.isVisible()) this.inventoryUI.toggle();
                break;
            case 'shop':
                this.syncShopSources();
                this.shopUI.show();
                break;
            // rest / quest / rumors are rendered by the React overlay (no sub-UI).
        }
    }

    // ── Input ──────────────────────────────────────────────────────

    public updateInput(input: InputManager): void {
        if (!this.visible) return;

        // The DOM overlay (React TownScreen) owns the town chrome, tab bar, deploy
        // button, and the shop/rest/quest/rumors tabs. Only the storage tab's
        // canvas InventoryUI is still driven here.
        if (this.activeTab !== 'storage') return;

        if (input.uiMouseX !== undefined && input.uiMouseY !== undefined) {
            this.inventoryUI.onMouseMove(input.uiMouseX, input.uiMouseY);
        }
        if (input.mouseJustDown) this.inventoryUI.onMouseDown(input.uiMouseX, input.uiMouseY);
        if (input.mouseJustUp) this.inventoryUI.onMouseUp(input.uiMouseX, input.uiMouseY);
    }

    // ── Rendering ──────────────────────────────────────────────────

    public render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        if (!this.visible || !this.currentTown) return;

        // The DOM overlay draws the town chrome and all tabs except storage. The
        // storage tab still uses the canvas InventoryUI (the inventory drag-grid
        // migration is the final, separate step).
        if (this.activeTab === 'storage') {
            this.inventoryUI.render(ctx, w, h);
        }
    }
}
