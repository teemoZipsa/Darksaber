/**
 * ShopUI — RPG merchant panel.
 * Left panel buys from the selected shop category, right panel sells from registered grids.
 */

import { ItemDef } from '../data/ItemDB';
import { getDefaultShopKindForFacility, getSellPrice, getShopItems, isSellableItem, ShopItem, type ShopKind } from '../data/ShopData';
import type { ShopFacilityId } from '../data/TownFacilityData';
import { t, i18n } from '../i18n/LanguageManager';
import { GridInventory, PlacedItem } from '../inventory/GridInventory';
import { drawItemIcon } from './ItemIconRenderer';

const CELL = 42;
const ROW_H = 54;
const SLOT_FRAME = 'rgba(160, 130, 60, 0.7)';

export interface ShopEntry {
    shopItem: ShopItem;
    item: ItemDef;
    remaining: number;
}

export interface ShopSellSource {
    id: string;
    label: string;
    grid: GridInventory;
}

export interface SellEntry {
    source: ShopSellSource;
    placed: PlacedItem;
    price: number;
}

export const SHOP_KIND_TABS: Array<{ id: ShopKind; labelKey: string; icon: string }> = [
    { id: 'weapon', labelKey: 'shop.weapon', icon: '⚔️' },
    { id: 'armor', labelKey: 'shop.armor', icon: '🛡️' },
    { id: 'accessory', labelKey: 'shop.accessory', icon: '💍' },
    { id: 'consumable', labelKey: 'shop.consumable', icon: '🧪' },
];

export class ShopUI {
    private visible = false;
    private entries: ShopEntry[] = [];
    private sellSources: ShopSellSource[] = [];
    private activeKind: ShopKind = 'weapon';
    private townId: string | null = null;
    private facilityId: ShopFacilityId | null = null;

    private buyScrollY = 0;
    private sellScrollY = 0;
    private hoverBuyIndex = -1;
    private hoverSellIndex = -1;
    private mouseX = 0;

    private panelX = 0;
    private panelY = 0;
    private panelW = 900;
    private panelH = 520;
    private tabY = 0;
    private buyX = 0;
    private sellX = 0;
    private buyW = 0;
    private sellW = 0;
    private listY = 0;
    private listH = 0;

    private pendingSell: SellEntry | null = null;
    private confirmRect = { x: 0, y: 0, w: 0, h: 0 };
    private cancelRect = { x: 0, y: 0, w: 0, h: 0 };
    private feedbackText = '';
    private feedbackTimer = 0;

    public onBuy: ((item: ItemDef, price: number) => boolean) | null = null;
    public onSell: ((placed: PlacedItem, sourceGrid: GridInventory, price: number) => boolean) | null = null;
    public getGold: (() => number) | null = null;

    constructor() {
        this.refreshInventory();
    }

    public setSellSources(sources: ShopSellSource[]): void {
        this.sellSources = sources;
        this.clampSellScroll();
    }

    public refreshInventory(): void {
        const shopItems = this.facilityId
            ? getShopItems(this.townId ?? undefined, this.facilityId)
            : getShopItems(this.townId ?? undefined);
        this.entries = shopItems.map(({ shopEntry, item }) => ({
            shopItem: shopEntry,
            item,
            remaining: shopEntry.stock,
        }));
        this.clampBuyScroll();
    }

    public setTownId(townId: string | null): void {
        if (this.townId === townId) return;
        this.townId = townId;
        this.refreshInventory();
    }

    public setFacilityId(facilityId: ShopFacilityId | null): void {
        if (this.facilityId === facilityId) return;
        this.facilityId = facilityId;
        if (facilityId) this.activeKind = getDefaultShopKindForFacility(facilityId);
        this.buyScrollY = 0;
        this.refreshInventory();
    }

    public toggle(): void {
        this.visible = !this.visible;
        if (this.visible) this.refreshInventory();
        else this.pendingSell = null;
    }

    public isVisible(): boolean { return this.visible; }

    // ── React (DOM overlay) accessors / actions ────────────────────
    /** Live gold value via the injected getter. */
    public getGoldValue(): number { return this.getGold ? this.getGold() : 0; }

    public getActiveKind(): ShopKind { return this.activeKind; }
    public setActiveKind(kind: ShopKind): void { this.activeKind = kind; }

    /** Buy entries for the active category (live). */
    public listBuyEntries(): ShopEntry[] { return this.getBuyEntries(); }
    /** All sellable entries across the registered sell sources (live). */
    public listSellEntries(): SellEntry[] { return this.getSellEntries(); }

    public canSell(entry: SellEntry): boolean { return isSellableItem(entry.placed.item); }

    /** Attempt a purchase; decrements remaining stock on success. */
    public buy(entry: ShopEntry): boolean {
        if (entry.remaining === 0) return false;
        const success = this.onBuy?.(entry.item, entry.shopItem.buyPrice) ?? false;
        if (success && entry.remaining > 0) entry.remaining--;
        return success;
    }

    /** Attempt a sale; validates the item still lives in its source grid. */
    public sell(entry: SellEntry): boolean {
        if (!entry.source.grid.items.includes(entry.placed)) return false;
        return this.onSell?.(entry.placed, entry.source.grid, entry.price) ?? false;
    }

    public show(): void {
        this.visible = true;
        this.refreshInventory();
    }

    public hide(): void {
        this.visible = false;
        this.pendingSell = null;
        this.feedbackText = '';
    }

    public onMouseMove(sx: number, sy: number): void {
        if (!this.visible) return;
        this.mouseX = sx;

        if (this.pendingSell) {
            this.hoverBuyIndex = -1;
            this.hoverSellIndex = -1;
            return;
        }

        this.hoverBuyIndex = this.indexAt(sx, sy, this.buyX, this.buyW, this.buyScrollY, this.getBuyEntries().length);
        this.hoverSellIndex = this.indexAt(sx, sy, this.sellX, this.sellW, this.sellScrollY, this.getSellEntries().length);
    }

    public onMouseDown(sx: number, sy: number): void {
        if (!this.visible || this.pendingSell) return;

        if (sy >= this.tabY && sy <= this.tabY + 34) {
            const tabW = 150;
            for (let i = 0; i < SHOP_KIND_TABS.length; i++) {
                const tx = this.panelX + 18 + i * (tabW + 8);
                if (sx >= tx && sx <= tx + tabW) {
                    this.activeKind = SHOP_KIND_TABS[i].id;
                    this.buyScrollY = 0;
                    this.hoverBuyIndex = -1;
                    return;
                }
            }
        }
    }

    public onMouseUp(sx: number, sy: number): void {
        if (!this.visible) return;

        if (this.pendingSell) {
            if (this.inRect(sx, sy, this.confirmRect)) this.commitPendingSell();
            else if (this.inRect(sx, sy, this.cancelRect)) this.pendingSell = null;
            return;
        }

        const buyIndex = this.indexAt(sx, sy, this.buyX, this.buyW, this.buyScrollY, this.getBuyEntries().length);
        if (buyIndex >= 0) {
            const entry = this.getBuyEntries()[buyIndex];
            if (!entry || entry.remaining === 0) return;
            const success = this.onBuy?.(entry.item, entry.shopItem.buyPrice) ?? false;
            if (success && entry.remaining > 0) entry.remaining--;
            return;
        }

        const sellEntries = this.getSellEntries();
        const sellIndex = this.indexAt(sx, sy, this.sellX, this.sellW, this.sellScrollY, sellEntries.length);
        if (sellIndex >= 0) {
            const entry = sellEntries[sellIndex];
            if (!entry) return;
            if (!isSellableItem(entry.placed.item)) {
                this.setFeedback(t('shop.cannotSell'));
                return;
            }
            this.pendingSell = entry;
        }
    }

    public onScroll(delta: number): void {
        if (!this.visible || this.pendingSell) return;
        const amount = delta * 30;
        if (this.mouseX >= this.sellX && this.mouseX <= this.sellX + this.sellW) {
            this.sellScrollY += amount;
            this.clampSellScroll();
        } else {
            this.buyScrollY += amount;
            this.clampBuyScroll();
        }
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        this.panelW = Math.min(980, Math.max(640, canvasW - 40));
        this.panelH = Math.min(560, Math.max(440, canvasH - 90));
        this.panelX = Math.floor((canvasW - this.panelW) / 2);
        this.panelY = Math.floor((canvasH - this.panelH) / 2);

        const gutter = 14;
        this.buyW = Math.floor((this.panelW - 36 - gutter) / 2);
        this.sellW = this.panelW - 36 - gutter - this.buyW;
        this.buyX = this.panelX + 18;
        this.sellX = this.buyX + this.buyW + gutter;
        this.tabY = this.panelY + 44;
        this.listY = this.panelY + 118;
        this.listH = this.panelY + this.panelH - 26 - this.listY;
        this.clampBuyScroll();
        this.clampSellScroll();

        this.feedbackTimer = Math.max(0, this.feedbackTimer - 1 / 60);

        this.renderFrame(ctx);
        this.renderTabs(ctx);
        this.renderPanel(ctx, this.buyX, this.buyW, t('shop.buyPanel'), this.getBuyEntries(), 'buy');
        this.renderPanel(ctx, this.sellX, this.sellW, t('shop.sellPanel'), this.getSellEntries(), 'sell');

        if (this.feedbackTimer > 0 && this.feedbackText) {
            ctx.fillStyle = '#d96860';
            ctx.font = 'bold 12px DOSMyungjo, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.feedbackText, this.panelX + this.panelW / 2, this.panelY + this.panelH - 8);
            ctx.textAlign = 'start';
        }

        if (this.pendingSell) this.renderSellConfirm(ctx);
    }

    private getBuyEntries(): ShopEntry[] {
        return this.entries.filter((entry) => entry.shopItem.shopKind === this.activeKind);
    }

    private getSellEntries(): SellEntry[] {
        const entries: SellEntry[] = [];
        for (const source of this.sellSources) {
            for (const placed of source.grid.items) {
                if (!isSellableItem(placed.item)) continue;
                entries.push({
                    source,
                    placed,
                    price: getSellPrice(placed.item, this.townId ?? undefined) * Math.max(1, placed.quantity),
                });
            }
        }
        return entries;
    }

    private commitPendingSell(): void {
        if (!this.pendingSell) return;
        const entry = this.pendingSell;
        this.pendingSell = null;
        if (!entry.source.grid.items.includes(entry.placed)) return;
        const success = this.onSell?.(entry.placed, entry.source.grid, entry.price) ?? false;
        if (success) {
            this.setFeedback(t('shop.soldItem'));
            this.clampSellScroll();
        }
    }

    private indexAt(sx: number, sy: number, x: number, w: number, scrollY: number, count: number): number {
        if (sx < x || sx > x + w || sy < this.listY || sy > this.listY + this.listH) return -1;
        const index = Math.floor((sy - this.listY + scrollY) / ROW_H);
        return index >= 0 && index < count ? index : -1;
    }

    private inRect(sx: number, sy: number, rect: { x: number; y: number; w: number; h: number }): boolean {
        return sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h;
    }

    private clampBuyScroll(): void {
        this.buyScrollY = this.clampScroll(this.buyScrollY, this.getBuyEntries().length);
    }

    private clampSellScroll(): void {
        this.sellScrollY = this.clampScroll(this.sellScrollY, this.getSellEntries().length);
    }

    private clampScroll(scrollY: number, count: number): number {
        const maxScroll = Math.max(0, count * ROW_H - Math.max(1, this.listH));
        return Math.max(0, Math.min(scrollY, maxScroll));
    }

    private setFeedback(text: string): void {
        this.feedbackText = text;
        this.feedbackTimer = 2.2;
    }

    private renderFrame(ctx: CanvasRenderingContext2D): void {
        ctx.fillStyle = 'rgba(8, 10, 18, 0.97)';
        ctx.fillRect(this.panelX, this.panelY, this.panelW, this.panelH);

        ctx.strokeStyle = '#8a7030';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.panelX + 1, this.panelY + 1, this.panelW - 2, this.panelH - 2);
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.panelX + 4, this.panelY + 4, this.panelW - 8, this.panelH - 8);

        ctx.fillStyle = '#c8a84e';
        ctx.font = 'bold 18px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('shop.title'), this.panelX + this.panelW / 2, this.panelY + 28);

        const gold = this.getGold ? this.getGold() : 0;
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 14px DOSMyungjo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`💰 ${gold}G`, this.panelX + this.panelW - 18, this.panelY + 28);
        ctx.textAlign = 'start';
    }

    private renderTabs(ctx: CanvasRenderingContext2D): void {
        const tabW = 150;
        for (let i = 0; i < SHOP_KIND_TABS.length; i++) {
            const tab = SHOP_KIND_TABS[i];
            const x = this.panelX + 18 + i * (tabW + 8);
            const active = this.activeKind === tab.id;
            ctx.fillStyle = active ? 'rgba(200, 170, 80, 0.22)' : 'rgba(20, 24, 35, 0.7)';
            ctx.fillRect(x, this.tabY, tabW, 34);
            ctx.strokeStyle = active ? '#c8a84e' : 'rgba(130, 110, 50, 0.35)';
            ctx.lineWidth = active ? 2 : 1;
            ctx.strokeRect(x, this.tabY, tabW, 34);

            ctx.fillStyle = active ? '#f1d476' : '#9a947e';
            ctx.font = `bold 12px DOSMyungjo, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`${tab.icon} ${t(tab.labelKey)}`, x + tabW / 2, this.tabY + 22);
        }
        ctx.textAlign = 'start';
    }

    private renderPanel(
        ctx: CanvasRenderingContext2D,
        x: number,
        w: number,
        title: string,
        entries: Array<ShopEntry | SellEntry>,
        kind: 'buy' | 'sell'
    ): void {
        ctx.fillStyle = 'rgba(15, 18, 28, 0.82)';
        ctx.fillRect(x, this.listY - 32, w, this.listH + 34);
        ctx.strokeStyle = 'rgba(130, 110, 50, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, this.listY - 32, w, this.listH + 34);

        ctx.fillStyle = '#c8a84e';
        ctx.font = 'bold 14px DOSMyungjo, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title, x + 10, this.listY - 11);
        ctx.fillStyle = '#888';
        ctx.font = '11px DOSMyungjo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(kind === 'buy' ? t('shop.gold') : t('shop.sellPrice'), x + w - 10, this.listY - 11);
        ctx.textAlign = 'start';

        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, this.listY, w - 2, this.listH);
        ctx.clip();

        for (let i = 0; i < entries.length; i++) {
            const rowY = this.listY + i * ROW_H - (kind === 'buy' ? this.buyScrollY : this.sellScrollY);
            if (rowY > this.listY + this.listH || rowY + ROW_H < this.listY) continue;
            const isHover = kind === 'buy' ? i === this.hoverBuyIndex : i === this.hoverSellIndex;
            if (kind === 'buy') this.renderBuyRow(ctx, entries[i] as ShopEntry, x, w, rowY, i, isHover);
            else this.renderSellRow(ctx, entries[i] as SellEntry, x, w, rowY, i, isHover);
        }

        ctx.restore();
        this.renderEmptyMessage(ctx, x, w, entries.length, kind);
        this.renderScrollIndicator(ctx, x, w, entries.length, kind === 'buy' ? this.buyScrollY : this.sellScrollY);
    }

    private renderBuyRow(ctx: CanvasRenderingContext2D, entry: ShopEntry, x: number, w: number, y: number, index: number, hover: boolean): void {
        const soldOut = entry.remaining === 0;
        const canAfford = (this.getGold ? this.getGold() : 0) >= entry.shopItem.buyPrice;
        this.renderRowBase(ctx, x, w, y, index, hover && !soldOut);
        this.renderItemIcon(ctx, entry.item, x + 8, y + 5, soldOut ? 0.35 : 1);

        ctx.fillStyle = soldOut ? '#555' : '#ddd';
        ctx.font = 'bold 13px DOSMyungjo, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.itemName(entry.item), x + 58, y + 20);
        ctx.fillStyle = '#777';
        ctx.font = '10px DOSMyungjo, sans-serif';
        ctx.fillText(this.statSummary(entry.item), x + 58, y + 37);

        if (entry.remaining >= 0) {
            ctx.fillStyle = soldOut ? '#aa4444' : '#888';
            ctx.textAlign = 'right';
            ctx.fillText(soldOut ? t('shop.soldOut') : `x${entry.remaining}`, x + w - 82, y + 38);
        }

        ctx.fillStyle = soldOut ? '#555' : (canAfford ? '#ffd700' : '#cc4444');
        ctx.font = 'bold 13px DOSMyungjo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${entry.shopItem.buyPrice}G`, x + w - 10, y + 21);
        if (hover && !soldOut && canAfford) {
            ctx.fillStyle = 'rgba(80, 200, 80, 0.78)';
            ctx.font = 'bold 11px DOSMyungjo, sans-serif';
            ctx.fillText(`▶ ${t('shop.buy')}`, x + w - 10, y + 41);
        }
        ctx.textAlign = 'start';
    }

    private renderSellRow(ctx: CanvasRenderingContext2D, entry: SellEntry, x: number, w: number, y: number, index: number, hover: boolean): void {
        this.renderRowBase(ctx, x, w, y, index, hover);
        this.renderItemIcon(ctx, entry.placed.item, x + 8, y + 5, 1);

        const qty = Math.max(1, entry.placed.quantity);
        ctx.fillStyle = '#ddd';
        ctx.font = 'bold 13px DOSMyungjo, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${this.itemName(entry.placed.item)}${qty > 1 ? ` x${qty}` : ''}`, x + 58, y + 19);
        ctx.fillStyle = '#8f927b';
        ctx.font = '10px DOSMyungjo, sans-serif';
        ctx.fillText(entry.source.label, x + 58, y + 35);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 13px DOSMyungjo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${entry.price}G`, x + w - 10, y + 21);
        if (hover) {
            ctx.fillStyle = 'rgba(230, 165, 76, 0.78)';
            ctx.font = 'bold 11px DOSMyungjo, sans-serif';
            ctx.fillText(`▶ ${t('shop.sell')}`, x + w - 10, y + 41);
        }
        ctx.textAlign = 'start';
    }

    private renderRowBase(ctx: CanvasRenderingContext2D, x: number, w: number, y: number, index: number, hover: boolean): void {
        ctx.fillStyle = hover ? 'rgba(200, 170, 80, 0.12)' : (index % 2 === 0 ? 'rgba(20, 24, 35, 0.8)' : 'rgba(15, 18, 28, 0.8)');
        ctx.fillRect(x + 6, y + 2, w - 12, ROW_H - 6);
        if (hover) {
            ctx.strokeStyle = 'rgba(200, 170, 80, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 6, y + 2, w - 12, ROW_H - 6);
        }
    }

    private renderItemIcon(ctx: CanvasRenderingContext2D, item: ItemDef, x: number, y: number, alpha: number): void {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = item.color + '88';
        ctx.fillRect(x, y, CELL - 4, CELL - 4);
        ctx.strokeStyle = SLOT_FRAME;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, CELL - 4, CELL - 4);
        drawItemIcon(ctx, item, x + 4, y + 4, CELL - 12, CELL - 12, { fontSize: 18 });
        ctx.restore();
    }

    private renderEmptyMessage(ctx: CanvasRenderingContext2D, x: number, w: number, count: number, kind: 'buy' | 'sell'): void {
        if (count > 0) return;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '13px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(kind === 'buy' ? t('shop.emptyBuy') : t('shop.emptySell'), x + w / 2, this.listY + 42);
        ctx.textAlign = 'start';
    }

    private renderScrollIndicator(ctx: CanvasRenderingContext2D, x: number, w: number, count: number, scrollY: number): void {
        const totalH = count * ROW_H;
        if (totalH <= this.listH) return;
        const thumbH = Math.max(20, (this.listH / totalH) * this.listH);
        const thumbY = this.listY + (scrollY / totalH) * this.listH;
        ctx.fillStyle = 'rgba(160, 130, 60, 0.35)';
        ctx.fillRect(x + w - 6, thumbY, 4, thumbH);
    }

    private renderSellConfirm(ctx: CanvasRenderingContext2D): void {
        if (!this.pendingSell) return;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.fillRect(this.panelX, this.panelY, this.panelW, this.panelH);

        const w = 360;
        const h = 150;
        const x = this.panelX + (this.panelW - w) / 2;
        const y = this.panelY + (this.panelH - h) / 2;
        ctx.fillStyle = 'rgba(18, 16, 14, 0.98)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const entry = this.pendingSell;
        const qty = Math.max(1, entry.placed.quantity);
        ctx.fillStyle = '#f1e3bf';
        ctx.font = 'bold 15px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('shop.sellConfirm'), x + w / 2, y + 30);
        ctx.fillStyle = '#c8a84e';
        ctx.font = '13px DOSMyungjo, sans-serif';
        ctx.fillText(`${this.itemName(entry.placed.item)}${qty > 1 ? ` x${qty}` : ''} → ${entry.price}G`, x + w / 2, y + 62);

        this.confirmRect = { x: x + 42, y: y + 96, w: 122, h: 34 };
        this.cancelRect = { x: x + w - 164, y: y + 96, w: 122, h: 34 };
        this.renderButton(ctx, this.confirmRect, t('shop.sellAll'), true);
        this.renderButton(ctx, this.cancelRect, t('shop.cancel'), false);
        ctx.textAlign = 'start';
    }

    private renderButton(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, label: string, primary: boolean): void {
        ctx.fillStyle = primary ? 'rgba(130, 82, 34, 0.96)' : 'rgba(44, 38, 31, 0.96)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = primary ? '#d7a450' : '#5e5544';
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = '#f1e3bf';
        ctx.font = 'bold 12px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
        ctx.textBaseline = 'alphabetic';
    }

    private itemName(item: ItemDef): string {
        return i18n.lang === 'ko' ? item.nameKr : item.name;
    }

    private statSummary(item: ItemDef): string {
        const stats: string[] = [];
        if (item.stats?.atk) stats.push(`ATK+${item.stats.atk}`);
        if (item.stats?.def) stats.push(`DEF+${item.stats.def}`);
        if (item.stats?.magAtk) stats.push(`MAG+${item.stats.magAtk}`);
        if (item.stats?.hp) stats.push(`HP+${item.stats.hp}`);
        return stats.join(' · ') || item.descriptionKr || item.description;
    }
}
