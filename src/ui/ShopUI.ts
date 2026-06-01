/**
 * ShopUI — merchant state and action layer for the React DOM shop panel.
 *
 * The old canvas merchant panel has been removed. This class now owns only the
 * shop session state, buy/sell entry projection, and callbacks used by
 * `ui/react/town/ShopPanel`.
 */

import { ItemDef } from '../data/ItemDB';
import type { MarketSellQuote } from '../data/MarketData';
import { getDefaultShopKindForFacility, getSellPrice, getShopItems, isSellableItem, ShopItem, type ShopKind } from '../data/ShopData';
import type { ShopFacilityId } from '../data/TownFacilityData';
import { GridInventory, PlacedItem } from '../inventory/GridInventory';

export interface ShopEntry {
    shopItem: ShopItem;
    item: ItemDef;
    remaining: number;
    price: number;
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
    basePrice: number;
    bonusPrice: number;
    contractQuantity?: number;
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
    private remainingByKey = new Map<string, number>();

    public onBuy: ((item: ItemDef, price: number) => boolean) | null = null;
    public onSell: ((placed: PlacedItem, sourceGrid: GridInventory, price: number) => boolean) | null = null;
    public getBuyPrice: ((item: ItemDef, shopItem: ShopItem, townId: string | null) => number) | null = null;
    public getSellPriceForItem: ((placed: PlacedItem, source: ShopSellSource, townId: string | null) => number) | null = null;
    public getSellQuoteForItem: ((placed: PlacedItem, source: ShopSellSource, townId: string | null, quantity: number) => MarketSellQuote) | null = null;
    public getGold: (() => number) | null = null;

    constructor() {
        this.refreshInventory();
    }

    public setSellSources(sources: ShopSellSource[]): void {
        this.sellSources = sources;
    }

    public refreshInventory(): void {
        const shopItems = this.facilityId
            ? getShopItems(this.townId ?? undefined, this.facilityId)
            : getShopItems(this.townId ?? undefined);
        this.entries = shopItems.map(({ shopEntry, item }) => ({
            shopItem: shopEntry,
            item,
            remaining: this.remainingByKey.get(this.entryKey(shopEntry)) ?? shopEntry.stock,
            price: this.resolveBuyPrice(item, shopEntry),
        }));
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
        this.refreshInventory();
    }

    public toggle(): void {
        this.visible = !this.visible;
        if (this.visible) this.refreshInventory();
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

    /** Attempt a purchase; decrements finite stock on success. */
    public buy(entry: ShopEntry): boolean {
        if (entry.remaining === 0) return false;
        entry.price = this.resolveBuyPrice(entry.item, entry.shopItem);
        const success = this.onBuy?.(entry.item, entry.price) ?? false;
        if (success && entry.remaining > 0) {
            entry.remaining--;
            this.remainingByKey.set(this.entryKey(entry.shopItem), entry.remaining);
        }
        return success;
    }

    /** Attempt a sale; validates the item still lives in its source grid. */
    public sell(entry: SellEntry): boolean {
        if (!entry.source.grid.items.includes(entry.placed)) return false;
        const quote = this.resolveSellQuote(entry.placed, entry.source);
        entry.basePrice = quote.basePrice;
        entry.bonusPrice = quote.bonusPrice;
        entry.price = quote.totalPrice;
        entry.contractQuantity = quote.contractQuantity;
        return this.onSell?.(entry.placed, entry.source.grid, entry.price) ?? false;
    }

    public show(): void {
        this.visible = true;
        this.refreshInventory();
    }

    public hide(): void {
        this.visible = false;
    }

    private getBuyEntries(): ShopEntry[] {
        for (const entry of this.entries) {
            entry.price = this.resolveBuyPrice(entry.item, entry.shopItem);
        }
        return this.entries.filter((entry) => entry.shopItem.shopKind === this.activeKind);
    }

    private getSellEntries(): SellEntry[] {
        const entries: SellEntry[] = [];
        for (const source of this.sellSources) {
            for (const placed of source.grid.items) {
                if (!isSellableItem(placed.item)) continue;
                const quote = this.resolveSellQuote(placed, source);
                entries.push({
                    source,
                    placed,
                    price: quote.totalPrice,
                    basePrice: quote.basePrice,
                    bonusPrice: quote.bonusPrice,
                    contractQuantity: quote.contractQuantity,
                });
            }
        }
        return entries;
    }

    private resolveBuyPrice(item: ItemDef, shopItem: ShopItem): number {
        return this.getBuyPrice?.(item, shopItem, this.townId) ?? shopItem.buyPrice;
    }

    private resolveSellPrice(placed: PlacedItem, source: ShopSellSource): number {
        return this.getSellPriceForItem?.(placed, source, this.townId) ?? getSellPrice(placed.item, this.townId ?? undefined);
    }

    private resolveSellQuote(placed: PlacedItem, source: ShopSellSource): MarketSellQuote {
        const quantity = Math.max(1, placed.quantity);
        if (this.getSellQuoteForItem) return this.getSellQuoteForItem(placed, source, this.townId, quantity);
        const basePrice = this.resolveSellPrice(placed, source) * quantity;
        return { basePrice, bonusPrice: 0, totalPrice: basePrice };
    }

    private entryKey(entry: ShopItem): string {
        return [
            this.townId ?? 'default',
            entry.facilityId,
            entry.shopKind,
            entry.itemId,
        ].join(':');
    }
}
