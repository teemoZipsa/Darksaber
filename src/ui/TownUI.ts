/**
 * TownUI — Mount & Blade / Uncharted Waters style town visit screen.
 * Shown when the player enters a town during a raid.
 *
 * Tabs:
 *   1. 창고 (Storage)  — Stash + Equipment + Backpack
 *   2. 상점 (Shop)     — Buy/sell items
 *   3. 휴식 (Rest)     — Town-specific food/rest buffs and injury treatment
 *   4. 퀘스트 (Quest)  — Quest board (placeholder)
 *   5. 소문 (Rumors)   — World gossip & info
 *
 * Bottom: 출격 (Deploy) button to leave town and continue the raid.
 */

import { GridInventory } from '../inventory/GridInventory';
import { InventoryUI } from '../inventory/InventoryUI';
import { ShopUI } from './ShopUI';
import { InputManager } from '../engine/InputManager';
import { renderGameTitle, UI } from './UITheme';
import { TownInfo } from '../map/BiomeMask';
import type { Character } from '../character/Character';
import { t } from '../i18n/LanguageManager';
import {
    getRestFacility,
    getRestMenu,
    INJURY_TREATMENT_PRICE,
    type RestFacility,
} from '../data/RestFacilityData';

type TownTab = 'storage' | 'shop' | 'rest' | 'quest' | 'rumors';

/** Random rumors per town, cycling for variety */
const RUMORS_KR: string[] = [
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


    // Tab button rects for click detection
    private tabRects: Array<{ x: number; y: number; w: number; h: number; tab: TownTab }> = [];

    // Rumors state (random selection per visit)
    private currentRumors: string[] = [];

    // Deploy button rect
    private deployBtnRect = { x: 0, y: 0, w: 0, h: 0 };
    private restMenuRects: Array<{ x: number; y: number; w: number; h: number; menuId: string }> = [];
    private restTreatRect = { x: 0, y: 0, w: 0, h: 0 };
    private restConfirmMenuId: string | null = null;
    private restConfirmRect = { x: 0, y: 0, w: 0, h: 0 };
    private restCancelRect = { x: 0, y: 0, w: 0, h: 0 };
    private restFeedbackText = '';
    private restFeedbackTimer = 0;

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
        this.restConfirmMenuId = null;
        this.restFeedbackText = '';
        this.restFeedbackTimer = 0;
    }

    public isVisible(): boolean { return this.visible; }

    private showTab(tab: TownTab): void {
        if (tab === 'rest' && !this.getCurrentRestFacility()) {
            tab = 'storage';
        }
        this.activeTab = tab;
        this.restConfirmMenuId = null;

        // Hide all sub-UIs
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
            // rest, quest and rumors are rendered inline (no sub-UI)
        }
    }

    // ── Input ──────────────────────────────────────────────────────

    public updateInput(input: InputManager): void {
        if (!this.visible) return;

        if (input.uiMouseX !== undefined && input.uiMouseY !== undefined) {
            if (this.activeTab === 'storage') {
                this.inventoryUI.onMouseMove(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'shop') {
                this.shopUI.onMouseMove(input.uiMouseX, input.uiMouseY);
            }
        }

        if (input.mouseJustDown) {
            const mx = input.uiMouseX;
            const my = input.uiMouseY;

            if (this.activeTab === 'rest' && this.handleRestMouseDown(mx, my)) return;

            // Tab clicks
            for (const rect of this.tabRects) {
                if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
                    this.showTab(rect.tab);
                    return;
                }
            }

            // Deploy button
            if (mx >= this.deployBtnRect.x && mx <= this.deployBtnRect.x + this.deployBtnRect.w &&
                my >= this.deployBtnRect.y && my <= this.deployBtnRect.y + this.deployBtnRect.h) {
                if (this.onDeployAction) {
                    this.hide();
                    this.onDeployAction();
                }
                return;
            }

            // Route to sub-UIs
            if (this.activeTab === 'storage') {
                this.inventoryUI.onMouseDown(mx, my);
            } else if (this.activeTab === 'shop') {
                this.shopUI.onMouseDown(mx, my);
            }
        }

        if (input.mouseJustUp) {
            if (this.activeTab === 'storage') {
                this.inventoryUI.onMouseUp(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'shop') {
                this.shopUI.onMouseUp(input.uiMouseX, input.uiMouseY);
            }
        }

        if (input.mouseWheelDelta !== 0 && this.activeTab === 'shop') {
            this.shopUI.onScroll(input.mouseWheelDelta);
        }
    }

    // ── Rendering ──────────────────────────────────────────────────

    public render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        if (!this.visible || !this.currentTown) return;

        // ── Full-screen dark overlay ──
        ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
        ctx.fillRect(0, 0, w, h);

        // ── Title ──
        renderGameTitle(ctx, 12, 6, { scale: 0.7 });

        // Town name header
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `bold 26px ${UI.fontPrimary}`;
        ctx.fillStyle = '#c8a84e';
        ctx.fillText(`🏰 ${this.currentTown.nameKr}`, w / 2, 52);
        ctx.font = `14px ${UI.fontPrimary}`;
        ctx.fillStyle = '#8a8a6a';
        ctx.fillText(this.currentTown.name, w / 2, 82);
        ctx.restore();

        // ── Tab bar ──
        this.renderTabs(ctx, w);

        // ── Content area ──
        const contentY = 140;
        const contentH = h - contentY - 100;

        switch (this.activeTab) {
            case 'storage':
                this.inventoryUI.render(ctx, w, h);
                break;
            case 'shop':
                this.syncShopSources();
                this.shopUI.render(ctx, w, h);
                break;
            case 'rest':
                this.renderRestTab(ctx, w, contentY, contentH);
                break;
            case 'quest':
                this.renderQuestTab(ctx, w, contentY, contentH);
                break;
            case 'rumors':
                this.renderRumorsTab(ctx, w, contentY, contentH);
                break;
        }

        // ── Deploy button ──
        this.renderDeployButton(ctx, w, h);
    }

    private renderTabs(ctx: CanvasRenderingContext2D, w: number): void {
        const restFacility = this.getCurrentRestFacility();
        const tabs: { label: string; tab: TownTab }[] = [
            { label: '📦 창고', tab: 'storage' },
            { label: '🛒 상점', tab: 'shop' },
            ...(restFacility ? [{ label: `${this.getRestFacilityIcon(restFacility.type)} ${t('tab.rest')}`, tab: 'rest' as const }] : []),
            { label: '📜 퀘스트', tab: 'quest' },
            { label: '💬 소문', tab: 'rumors' },
        ];

        const tabW = 120;
        const tabH = 36;
        const gap = 8;
        const totalW = tabs.length * tabW + (tabs.length - 1) * gap;
        const startX = (w - totalW) / 2;
        const tabY = 100;

        this.tabRects = [];

        for (let i = 0; i < tabs.length; i++) {
            const x = startX + i * (tabW + gap);
            const isActive = tabs[i].tab === this.activeTab;

            // Tab background
            ctx.fillStyle = isActive ? '#3a2a18' : '#1e1814';
            ctx.strokeStyle = isActive ? '#c8a84e' : '#5a4a3a';
            ctx.lineWidth = isActive ? 2 : 1;

            // Rounded rect
            const r = 4;
            ctx.beginPath();
            ctx.moveTo(x + r, tabY);
            ctx.lineTo(x + tabW - r, tabY);
            ctx.arcTo(x + tabW, tabY, x + tabW, tabY + r, r);
            ctx.lineTo(x + tabW, tabY + tabH);
            ctx.lineTo(x, tabY + tabH);
            ctx.lineTo(x, tabY + r);
            ctx.arcTo(x, tabY, x + r, tabY, r);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Label
            ctx.font = `bold 14px ${UI.fontPrimary}`;
            ctx.fillStyle = isActive ? '#c8a84e' : '#8a7a5a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tabs[i].label, x + tabW / 2, tabY + tabH / 2);

            this.tabRects.push({ x, y: tabY, w: tabW, h: tabH, tab: tabs[i].tab });
        }
    }

    private handleRestMouseDown(mx: number, my: number): boolean {
        if (this.restConfirmMenuId) {
            if (mx >= this.restConfirmRect.x && mx <= this.restConfirmRect.x + this.restConfirmRect.w &&
                my >= this.restConfirmRect.y && my <= this.restConfirmRect.y + this.restConfirmRect.h) {
                this.purchaseRestMenu(this.restConfirmMenuId);
                this.restConfirmMenuId = null;
                return true;
            }
            if (mx >= this.restCancelRect.x && mx <= this.restCancelRect.x + this.restCancelRect.w &&
                my >= this.restCancelRect.y && my <= this.restCancelRect.y + this.restCancelRect.h) {
                this.restConfirmMenuId = null;
                return true;
            }
            return true;
        }

        if (mx >= this.restTreatRect.x && mx <= this.restTreatRect.x + this.restTreatRect.w &&
            my >= this.restTreatRect.y && my <= this.restTreatRect.y + this.restTreatRect.h) {
            const ok = this.onTreatInjuries?.() ?? false;
            this.setRestFeedback(ok ? t('rest.treated') : t('rest.noGold'));
            return true;
        }

        for (const rect of this.restMenuRects) {
            if (mx < rect.x || mx > rect.x + rect.w || my < rect.y || my > rect.y + rect.h) continue;
            const pending = this.getPendingRestMenuId?.() ?? null;
            if (pending === rect.menuId) {
                this.setRestFeedback(t('rest.current'));
            } else if (pending) {
                this.restConfirmMenuId = rect.menuId;
            } else {
                this.purchaseRestMenu(rect.menuId);
            }
            return true;
        }

        return false;
    }

    private purchaseRestMenu(menuId: string): void {
        const ok = this.onPurchaseRestMenu?.(menuId) ?? false;
        this.setRestFeedback(ok ? t('rest.purchased') : t('rest.noGold'));
    }

    private setRestFeedback(text: string): void {
        this.restFeedbackText = text;
        this.restFeedbackTimer = 180;
    }

    private renderRestTab(ctx: CanvasRenderingContext2D, w: number, y: number, _h: number): void {
        const facility = this.getCurrentRestFacility();
        if (!facility) return;

        const panelW = Math.min(760, w - 80);
        const panelH = 430;
        const px = (w - panelW) / 2;
        const py = y + 12;
        const pendingId = this.getPendingRestMenuId?.() ?? null;
        const pendingMenu = pendingId ? getRestMenu(pendingId) : null;
        const injuredCount = this.getInjuredCount?.() ?? 0;

        this.restMenuRects = [];
        this.restTreatRect = { x: 0, y: 0, w: 0, h: 0 };

        ctx.fillStyle = '#1a1510';
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeRect(px, py, panelW, panelH);

        ctx.font = `bold 21px ${UI.fontPrimary}`;
        ctx.fillStyle = '#c8a84e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${this.getRestFacilityIcon(facility.type)} ${t(facility.nameKey)}`, w / 2, py + 30);

        ctx.strokeStyle = '#3a2a18';
        ctx.beginPath();
        ctx.moveTo(px + 22, py + 56);
        ctx.lineTo(px + panelW - 22, py + 56);
        ctx.stroke();

        ctx.font = `13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#b8a980';
        ctx.fillText(`${t('rest.current')}: ${pendingMenu ? t(pendingMenu.nameKey) : t('rest.none')}`, px + 28, py + 82);

        const menuY = py + 105;
        const cardGap = 14;
        const cardW = (panelW - 56 - cardGap * (facility.menu.length - 1)) / Math.max(1, facility.menu.length);
        const cardH = 150;
        for (let i = 0; i < facility.menu.length; i++) {
            const menu = facility.menu[i];
            const x = px + 28 + i * (cardW + cardGap);
            const isCurrent = pendingId === menu.id;

            ctx.fillStyle = isCurrent ? '#2a2316' : '#221e16';
            ctx.strokeStyle = isCurrent ? '#c8a84e' : '#3a3020';
            ctx.lineWidth = isCurrent ? 2 : 1;
            ctx.fillRect(x, menuY, cardW, cardH);
            ctx.strokeRect(x, menuY, cardW, cardH);

            ctx.font = `bold 16px ${UI.fontPrimary}`;
            ctx.fillStyle = '#e6d3a4';
            ctx.textAlign = 'left';
            ctx.fillText(t(menu.nameKey), x + 14, menuY + 26);

            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillStyle = '#9a8b66';
            this.drawWrappedText(ctx, t(menu.descKey), x + 14, menuY + 50, cardW - 28, 17, 3);

            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.fillStyle = '#d2b55c';
            ctx.fillText(`${menu.price}G`, x + 14, menuY + cardH - 18);

            const btnW = 86;
            const btnH = 28;
            const btnX = x + cardW - btnW - 12;
            const btnY = menuY + cardH - btnH - 10;
            this.drawSmallButton(ctx, btnX, btnY, btnW, btnH, isCurrent ? t('rest.current') : t('rest.purchase'));
            this.restMenuRects.push({ x: btnX, y: btnY, w: btnW, h: btnH, menuId: menu.id });
        }

        const injuryY = menuY + cardH + 26;
        ctx.fillStyle = '#181812';
        ctx.strokeStyle = '#3a3020';
        ctx.lineWidth = 1;
        ctx.fillRect(px + 28, injuryY, panelW - 56, 84);
        ctx.strokeRect(px + 28, injuryY, panelW - 56, 84);

        ctx.font = `bold 16px ${UI.fontPrimary}`;
        ctx.fillStyle = '#d8c690';
        ctx.textAlign = 'left';
        ctx.fillText(t('rest.injuryTitle'), px + 44, injuryY + 28);

        ctx.font = `13px ${UI.fontPrimary}`;
        ctx.fillStyle = injuredCount > 0 ? '#d08a6a' : '#8a8a6a';
        const injuryText = injuredCount > 0
            ? `${t('rest.injuryCount')}: ${injuredCount} (${injuredCount * INJURY_TREATMENT_PRICE}G)`
            : t('rest.injuryNone');
        ctx.fillText(injuryText, px + 44, injuryY + 56);

        if (injuredCount > 0) {
            const btnW = 128;
            const btnH = 34;
            const btnX = px + panelW - btnW - 44;
            const btnY = injuryY + 25;
            this.drawSmallButton(ctx, btnX, btnY, btnW, btnH, t('rest.treat'));
            this.restTreatRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        }

        if (this.restFeedbackText) {
            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.fillStyle = '#c8a84e';
            ctx.textAlign = 'center';
            ctx.fillText(this.restFeedbackText, w / 2, py + panelH - 22);
            this.restFeedbackTimer--;
            if (this.restFeedbackTimer <= 0) this.restFeedbackText = '';
        }

        if (this.restConfirmMenuId) {
            this.renderRestConfirm(ctx, w, py + 120);
        }
    }

    private renderRestConfirm(ctx: CanvasRenderingContext2D, w: number, y: number): void {
        const modalW = 420;
        const modalH = 180;
        const x = (w - modalW) / 2;
        const menu = getRestMenu(this.restConfirmMenuId ?? '');

        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        ctx.fillRect(0, 0, w, 900);

        ctx.fillStyle = '#211810';
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, modalW, modalH);
        ctx.strokeRect(x, y, modalW, modalH);

        ctx.font = `bold 19px ${UI.fontPrimary}`;
        ctx.fillStyle = '#e0c878';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('rest.replaceTitle'), x + modalW / 2, y + 38);

        ctx.font = `13px ${UI.fontPrimary}`;
        ctx.fillStyle = '#c8b890';
        const target = menu ? t(menu.nameKey) : '';
        ctx.fillText(target ? `${target} - ${t('rest.replaceDesc')}` : t('rest.replaceDesc'), x + modalW / 2, y + 78);

        const btnW = 120;
        const btnH = 34;
        const gap = 18;
        const confirmX = x + modalW / 2 - btnW - gap / 2;
        const cancelX = x + modalW / 2 + gap / 2;
        const btnY = y + 118;
        this.drawSmallButton(ctx, confirmX, btnY, btnW, btnH, t('rest.confirm'));
        this.drawSmallButton(ctx, cancelX, btnY, btnW, btnH, t('rest.cancel'), true);
        this.restConfirmRect = { x: confirmX, y: btnY, w: btnW, h: btnH };
        this.restCancelRect = { x: cancelX, y: btnY, w: btnW, h: btnH };
    }

    private drawSmallButton(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        muted: boolean = false
    ): void {
        ctx.fillStyle = muted ? '#2a2720' : '#3a2a18';
        ctx.strokeStyle = muted ? '#5a5040' : '#c8a84e';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.font = `bold 12px ${UI.fontPrimary}`;
        ctx.fillStyle = muted ? '#a09070' : '#e0d0a0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, y + h / 2);
    }

    private drawWrappedText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxW: number,
        lineH: number,
        maxLines: number
    ): void {
        const words = text.split(' ');
        let line = '';
        let lineNo = 0;
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (ctx.measureText(candidate).width > maxW && line) {
                ctx.fillText(line, x, y + lineNo * lineH);
                line = word;
                lineNo++;
                if (lineNo >= maxLines) return;
            } else {
                line = candidate;
            }
        }
        if (line && lineNo < maxLines) ctx.fillText(line, x, y + lineNo * lineH);
    }

    private getRestFacilityIcon(type: RestFacility['type']): string {
        switch (type) {
            case 'tavern': return '🍺';
            case 'tea_house': return '🍵';
            case 'shrine': return '⛩️';
            case 'barracks': return '🍛';
            case 'inn':
            default:
                return '🛏️';
        }
    }

    private renderQuestTab(ctx: CanvasRenderingContext2D, w: number, y: number, _h: number): void {
        const panelW = 500;
        const panelH = 400;
        const px = (w - panelW) / 2;
        const py = y + 20;

        // Panel background
        ctx.fillStyle = '#1a1510';
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeRect(px, py, panelW, panelH);

        // Title
        ctx.font = `bold 20px ${UI.fontPrimary}`;
        ctx.fillStyle = '#c8a84e';
        ctx.textAlign = 'center';
        ctx.fillText('📜 퀘스트 게시판', w / 2, py + 30);

        // Separator  
        ctx.strokeStyle = '#3a2a18';
        ctx.beginPath();
        ctx.moveTo(px + 20, py + 48);
        ctx.lineTo(px + panelW - 20, py + 48);
        ctx.stroke();

        // Placeholder quests
        const quests = [
            { id: 'quest:first_survival', name: '첫 생환', desc: '출발지가 아닌 다른 마을로 생환하기', reward: '200G', done: false },
            { name: '위협 제거', desc: '보스 1마리 처치하기', reward: '전직 상점 해금', done: false },
            { name: '약초 수집 (일일)', desc: '약초 3개를 마을로 가져오기', reward: '100G', done: false },
            { name: '사냥터 정리 (일일)', desc: '적 10마리 처치하기', reward: '150G', done: false },
        ].map((quest) => ({
            ...quest,
            done: 'id' in quest && quest.id ? !!this.getQuestDone?.(quest.id) : quest.done,
        }));

        ctx.textAlign = 'left';
        for (let i = 0; i < quests.length; i++) {
            const qy = py + 65 + i * 75;

            // Quest box
            ctx.fillStyle = '#221e16';
            ctx.fillRect(px + 15, qy, panelW - 30, 65);
            ctx.strokeStyle = '#3a3020';
            ctx.strokeRect(px + 15, qy, panelW - 30, 65);

            // Status icon
            ctx.font = `16px ${UI.fontPrimary}`;
            ctx.fillStyle = quests[i].done ? '#4caf50' : '#8a7a5a';
            ctx.fillText(quests[i].done ? '✅' : '⬜', px + 25, qy + 22);

            // Name
            ctx.font = `bold 15px ${UI.fontPrimary}`;
            ctx.fillStyle = '#e0d0b0';
            ctx.fillText(quests[i].name, px + 50, qy + 22);

            // Description
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillStyle = '#8a8a6a';
            ctx.fillText(quests[i].desc, px + 50, qy + 42);

            // Reward
            ctx.fillStyle = '#c8a84e';
            ctx.font = `bold 12px ${UI.fontPrimary}`;
            ctx.textAlign = 'right';
            ctx.fillText(`보상: ${quests[i].reward}`, px + panelW - 25, qy + 22);
            ctx.textAlign = 'left';
        }

        // Footer note
        ctx.font = `12px ${UI.fontPrimary}`;
        ctx.fillStyle = '#5a5040';
        ctx.textAlign = 'center';
        ctx.fillText('※ 전리품 창고 저장은 현재 세션 한정입니다.', w / 2, py + panelH - 15);
    }

    private renderRumorsTab(ctx: CanvasRenderingContext2D, w: number, y: number, _h: number): void {
        const panelW = 500;
        const panelH = 350;
        const px = (w - panelW) / 2;
        const py = y + 20;

        // Panel background
        ctx.fillStyle = '#1a1510';
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeRect(px, py, panelW, panelH);

        // Title
        ctx.font = `bold 20px ${UI.fontPrimary}`;
        ctx.fillStyle = '#c8a84e';
        ctx.textAlign = 'center';
        ctx.fillText('💬 소문', w / 2, py + 30);

        // NPC icon
        ctx.font = '40px serif';
        ctx.fillText('👤', w / 2, py + 70);

        // Separator
        ctx.strokeStyle = '#3a2a18';
        ctx.beginPath();
        ctx.moveTo(px + 20, py + 90);
        ctx.lineTo(px + panelW - 20, py + 90);
        ctx.stroke();

        // Rumors
        ctx.textAlign = 'left';
        for (let i = 0; i < this.currentRumors.length; i++) {
            const ry = py + 115 + i * 65;

            // Speech bubble background
            ctx.fillStyle = '#221e16';
            ctx.fillRect(px + 20, ry, panelW - 40, 50);
            ctx.strokeStyle = '#3a3020';
            ctx.strokeRect(px + 20, ry, panelW - 40, 50);

            // Quote mark
            ctx.font = `18px ${UI.fontPrimary}`;
            ctx.fillStyle = '#5a4a3a';
            ctx.fillText('❝', px + 30, ry + 22);

            // Rumor text (word-wrap manually)
            ctx.font = `13px ${UI.fontPrimary}`;
            ctx.fillStyle = '#c0b080';
            const maxW = panelW - 90;
            const text = this.currentRumors[i];
            if (ctx.measureText(text).width > maxW) {
                // Simple split at midpoint
                const mid = Math.floor(text.length / 2);
                let splitAt = text.lastIndexOf(' ', mid);
                if (splitAt < 0) splitAt = mid;
                ctx.fillText(text.slice(0, splitAt), px + 55, ry + 20);
                ctx.fillText(text.slice(splitAt), px + 55, ry + 38);
            } else {
                ctx.fillText(text, px + 55, ry + 30);
            }
        }

        // Footer
        ctx.font = `italic 12px ${UI.fontPrimary}`;
        ctx.fillStyle = '#5a5040';
        ctx.textAlign = 'center';
        ctx.fillText(`— ${this.currentTown?.nameKr || '마을'} 주민들의 이야기 —`, w / 2, py + panelH - 15);
    }

    private renderDeployButton(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const btnW = 200;
        const btnH = 48;
        const btnX = (w - btnW) / 2;
        const btnY = h - 70;

        this.deployBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };

        // Button background (red like lobby deploy)
        const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
        grad.addColorStop(0, '#8b2020');
        grad.addColorStop(1, '#5a1515');
        ctx.fillStyle = grad;

        // Rounded rect
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(btnX + r, btnY);
        ctx.lineTo(btnX + btnW - r, btnY);
        ctx.arcTo(btnX + btnW, btnY, btnX + btnW, btnY + r, r);
        ctx.lineTo(btnX + btnW, btnY + btnH - r);
        ctx.arcTo(btnX + btnW, btnY + btnH, btnX + btnW - r, btnY + btnH, r);
        ctx.lineTo(btnX + r, btnY + btnH);
        ctx.arcTo(btnX, btnY + btnH, btnX, btnY + btnH - r, r);
        ctx.lineTo(btnX, btnY + r);
        ctx.arcTo(btnX, btnY, btnX + r, btnY, r);
        ctx.closePath();
        ctx.fill();

        // Border
        ctx.strokeStyle = '#c05050';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.font = `bold 20px ${UI.fontPrimary}`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚔️ 출격', btnX + btnW / 2, btnY + btnH / 2);
        ctx.textBaseline = 'alphabetic';
    }
}
