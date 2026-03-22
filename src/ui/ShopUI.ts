/**
 * ShopUI — Dark themed merchant shop panel with category tabs.
 * Buy items with gold, sell items for 50% value.
 * Canvas-rendered overlay within the Lobby.
 */

import { ItemDef } from '../data/ItemDB';
import { getShopItems, ShopItem } from '../data/ShopData';
import { t, i18n } from '../i18n/LanguageManager';

const CELL = 44;
const SLOT_FRAME = 'rgba(160, 130, 60, 0.7)';

interface ShopEntry {
    shopItem: ShopItem;
    item: ItemDef;
    remaining: number;
}

type ShopTab = 'all' | 'weapon' | 'armor' | 'accessory' | 'consumable';

const TAB_DEFS: { id: ShopTab; label: string; icon: string }[] = [
    { id: 'all',        label: '전체',   icon: '📋' },
    { id: 'weapon',     label: '무기',   icon: '⚔️' },
    { id: 'armor',      label: '방어구', icon: '🛡️' },
    { id: 'accessory',  label: '장신구', icon: '💍' },
    { id: 'consumable', label: '소모품', icon: '🧪' },
];

export class ShopUI {
    private visible: boolean = false;
    private entries: ShopEntry[] = [];
    private filteredEntries: ShopEntry[] = [];
    private scrollY: number = 0;
    private hoverIndex: number = -1;
    private activeTab: ShopTab = 'all';
    
    // Drag scroll
    private isDragging = false;
    private dragStartY = 0;
    private dragScrollStart = 0;
    private dragDistance = 0;
    
    // Layout
    private panelX = 0;
    private panelY = 0;
    private panelW = 500;
    private panelH = 440;
    private listY = 0;
    private tabY = 0;
    private readonly TAB_H = 32;
    
    // Callbacks
    public onBuy: ((item: ItemDef, price: number) => boolean) | null = null;
    public onSell: ((item: ItemDef, price: number) => void) | null = null;
    public getGold: (() => number) | null = null;

    constructor() {
        this.refreshInventory();
    }

    public refreshInventory(): void {
        this.entries = getShopItems().map(({ shopEntry, item }) => ({
            shopItem: shopEntry,
            item,
            remaining: shopEntry.stock
        }));
        this.applyFilter();
    }

    private applyFilter(): void {
        this.scrollY = 0;
        if (this.activeTab === 'all') {
            this.filteredEntries = [...this.entries];
        } else {
            this.filteredEntries = this.entries.filter(e => {
                const slot = e.item.slot;
                switch (this.activeTab) {
                    case 'weapon': return slot === 'weapon';
                    case 'armor': return slot === 'head' || slot === 'body' || slot === 'boots' || slot === 'shield';
                    case 'accessory': return slot === 'accessory';
                    case 'consumable': return slot === 'consumable';
                    default: return true;
                }
            });
        }
    }

    private getTabCount(tab: ShopTab): number {
        if (tab === 'all') return this.entries.length;
        return this.entries.filter(e => {
            const slot = e.item.slot;
            switch (tab) {
                case 'weapon': return slot === 'weapon';
                case 'armor': return slot === 'head' || slot === 'body' || slot === 'boots' || slot === 'shield';
                case 'accessory': return slot === 'accessory';
                case 'consumable': return slot === 'consumable';
                default: return true;
            }
        }).length;
    }

    public toggle(): void {
        this.visible = !this.visible;
        if (this.visible) this.refreshInventory();
    }

    public isVisible(): boolean { return this.visible; }

    public show(): void { this.visible = true; this.refreshInventory(); }
    public hide(): void { this.visible = false; }

    public onMouseMove(sx: number, sy: number): void {
        if (!this.visible) return;

        // Handle drag scrolling
        if (this.isDragging) {
            const deltaY = this.dragStartY - sy;
            this.dragDistance += Math.abs(deltaY);
            this.scrollY = this.dragScrollStart + deltaY;
            const listH = this.panelY + this.panelH - 10 - this.listY;
            const maxScroll = Math.max(0, this.filteredEntries.length * 52 - listH);
            this.scrollY = Math.max(0, Math.min(this.scrollY, maxScroll));
            this.dragStartY = sy;
            this.dragScrollStart = this.scrollY;
            return;
        }
        
        const relY = sy - this.listY + this.scrollY;
        const idx = Math.floor(relY / 52);
        if (sx >= this.panelX + 10 && sx <= this.panelX + this.panelW - 10 &&
            sy >= this.listY && sy <= this.panelY + this.panelH - 10) {
            this.hoverIndex = idx >= 0 && idx < this.filteredEntries.length ? idx : -1;
        } else {
            this.hoverIndex = -1;
        }
    }

    public onMouseDown(sx: number, sy: number): void {
        if (!this.visible) return;

        // Check tab clicks
        if (sy >= this.tabY && sy <= this.tabY + this.TAB_H) {
            const tabW = (this.panelW - 20) / TAB_DEFS.length;
            for (let i = 0; i < TAB_DEFS.length; i++) {
                const tx = this.panelX + 10 + i * tabW;
                if (sx >= tx && sx <= tx + tabW) {
                    this.activeTab = TAB_DEFS[i].id;
                    this.applyFilter();
                    return;
                }
            }
        }

        // Start drag if clicking within the list area
        if (sx >= this.panelX + 10 && sx <= this.panelX + this.panelW - 10 &&
            sy >= this.listY && sy <= this.panelY + this.panelH - 10) {
            this.isDragging = true;
            this.dragStartY = sy;
            this.dragScrollStart = this.scrollY;
            this.dragDistance = 0;
        }
    }

    public onMouseUp(sx: number, sy: number): void {
        if (!this.visible) return;

        const wasDragging = this.isDragging;
        const totalDragDist = this.dragDistance;
        this.isDragging = false;
        this.dragDistance = 0;

        // Only buy if it was a click (not a drag > 5px)
        if (wasDragging && totalDragDist > 5) return;

        // Check if clicking on a shop entry to buy
        const relY = sy - this.listY + this.scrollY;
        const idx = Math.floor(relY / 52);
        if (idx >= 0 && idx < this.filteredEntries.length &&
            sx >= this.panelX + 10 && sx <= this.panelX + this.panelW - 10 &&
            sy >= this.listY && sy <= this.panelY + this.panelH - 10) {
            
            const entry = this.filteredEntries[idx];
            if (entry.remaining === 0) return;
            
            const price = entry.shopItem.buyPrice;
            if (this.onBuy) {
                const success = this.onBuy(entry.item, price);
                if (success && entry.remaining > 0) {
                    entry.remaining--;
                }
            }
        }
    }

    public onScroll(delta: number): void {
        if (!this.visible) return;
        this.scrollY = Math.max(0, this.scrollY + delta * 30);
        const listH = this.panelY + this.panelH - 10 - this.listY;
        const maxScroll = Math.max(0, this.filteredEntries.length * 52 - listH);
        this.scrollY = Math.min(this.scrollY, maxScroll);
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        this.panelW = Math.min(520, canvasW - 40);
        this.panelH = Math.min(500, canvasH - 100);
        this.panelX = Math.floor((canvasW - this.panelW) / 2);
        this.panelY = Math.floor((canvasH - this.panelH) / 2);




        // Panel background
        ctx.fillStyle = 'rgba(8, 10, 18, 0.97)';
        ctx.fillRect(this.panelX, this.panelY, this.panelW, this.panelH);

        // Ornate border
        ctx.strokeStyle = '#8a7030';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.panelX + 1, this.panelY + 1, this.panelW - 2, this.panelH - 2);

        ctx.strokeStyle = 'rgba(200, 170, 80, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.panelX + 4, this.panelY + 4, this.panelW - 8, this.panelH - 8);

        // Title
        ctx.fillStyle = '#c8a84e';
        ctx.font = 'bold 18px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('shop.title'), this.panelX + this.panelW / 2, this.panelY + 28);

        // Gold display
        const gold = this.getGold ? this.getGold() : 0;
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 14px DOSMyungjo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`💰 ${gold}G`, this.panelX + this.panelW - 16, this.panelY + 28);
        ctx.textAlign = 'start';

        // ─── CATEGORY TABS ───
        this.tabY = this.panelY + 42;
        const tabW = (this.panelW - 20) / TAB_DEFS.length;
        for (let i = 0; i < TAB_DEFS.length; i++) {
            const tx = this.panelX + 10 + i * tabW;
            const isActive = this.activeTab === TAB_DEFS[i].id;
            const count = this.getTabCount(TAB_DEFS[i].id);

            // Tab background
            if (isActive) {
                ctx.fillStyle = 'rgba(200, 170, 80, 0.18)';
                ctx.fillRect(tx, this.tabY, tabW, this.TAB_H);
                // Active indicator line
                ctx.fillStyle = '#c8a84e';
                ctx.fillRect(tx, this.tabY + this.TAB_H - 2, tabW, 2);
            } else {
                ctx.fillStyle = 'rgba(20, 24, 35, 0.6)';
                ctx.fillRect(tx, this.tabY, tabW, this.TAB_H);
            }

            // Tab border
            ctx.strokeStyle = 'rgba(130, 110, 50, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(tx, this.tabY, tabW, this.TAB_H);

            // Tab text
            ctx.fillStyle = isActive ? '#c8a84e' : '#888';
            ctx.font = `${isActive ? 'bold ' : ''}11px DOSMyungjo, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(
                `${TAB_DEFS[i].icon} ${TAB_DEFS[i].label} (${count})`,
                tx + tabW / 2,
                this.tabY + this.TAB_H / 2 + 4
            );
            ctx.textAlign = 'start';
        }

        // Column headers
        const headerY = this.tabY + this.TAB_H + 16;
        ctx.fillStyle = '#888';
        ctx.font = '11px DOSMyungjo, sans-serif';
        ctx.fillText(t('inv.title'), this.panelX + 60, headerY);
        ctx.textAlign = 'right';
        ctx.fillText(t('shop.gold'), this.panelX + this.panelW - 16, headerY);
        ctx.textAlign = 'start';

        // Clip region for scrollable list
        this.listY = headerY + 8;
        const listH = this.panelY + this.panelH - 10 - this.listY;

        ctx.save();
        ctx.beginPath();
        ctx.rect(this.panelX + 8, this.listY, this.panelW - 16, listH);
        ctx.clip();

        // Render shop items
        for (let i = 0; i < this.filteredEntries.length; i++) {
            const entry = this.filteredEntries[i];
            const itemY = this.listY + i * 52 - this.scrollY;

            if (itemY > this.listY + listH || itemY + 50 < this.listY) continue;

            const isHover = i === this.hoverIndex;
            const soldOut = entry.remaining === 0;
            const canAfford = gold >= entry.shopItem.buyPrice;

            // Row background
            ctx.fillStyle = isHover ? 'rgba(200, 170, 80, 0.12)' : 
                           (i % 2 === 0 ? 'rgba(20, 24, 35, 0.8)' : 'rgba(15, 18, 28, 0.8)');
            ctx.fillRect(this.panelX + 10, itemY, this.panelW - 20, 48);

            if (isHover && !soldOut) {
                ctx.strokeStyle = 'rgba(200, 170, 80, 0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(this.panelX + 10, itemY, this.panelW - 20, 48);
            }

            // Item icon
            ctx.globalAlpha = soldOut ? 0.3 : 1;
            ctx.fillStyle = entry.item.color + '88';
            ctx.fillRect(this.panelX + 14, itemY + 4, CELL - 4, CELL - 4);
            ctx.strokeStyle = SLOT_FRAME;
            ctx.lineWidth = 1;
            ctx.strokeRect(this.panelX + 14, itemY + 4, CELL - 4, CELL - 4);

            ctx.font = '18px serif';
            ctx.textAlign = 'center';
            ctx.fillText(entry.item.icon, this.panelX + 14 + (CELL - 4) / 2, itemY + 28);
            ctx.textAlign = 'start';

            // Item name
            ctx.fillStyle = soldOut ? '#555' : '#ddd';
            ctx.font = 'bold 13px DOSMyungjo, sans-serif';
            const name = i18n.lang === 'ko' ? entry.item.nameKr : entry.item.name;
            ctx.fillText(name, this.panelX + 60, itemY + 20);

            // Item stats summary
            ctx.fillStyle = '#777';
            ctx.font = '10px DOSMyungjo, sans-serif';
            const statStr: string[] = [];
            if (entry.item.stats?.atk) statStr.push(`공격+${entry.item.stats.atk}`);
            if (entry.item.stats?.def) statStr.push(`방어+${entry.item.stats.def}`);
            if (entry.item.stats?.magAtk) statStr.push(`마공+${entry.item.stats.magAtk}`);
            if (entry.item.stats?.hp) statStr.push(`HP+${entry.item.stats.hp}`);
            ctx.fillText(statStr.join(' · '), this.panelX + 60, itemY + 36);

            // Stock
            if (entry.remaining >= 0) {
                ctx.fillStyle = soldOut ? '#aa3333' : '#888';
                ctx.font = '10px DOSMyungjo, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(soldOut ? '품절' : `x${entry.remaining}`, this.panelX + this.panelW - 80, itemY + 36);
                ctx.textAlign = 'start';
            }

            // Price
            ctx.fillStyle = soldOut ? '#555' : (canAfford ? '#ffd700' : '#cc4444');
            ctx.font = 'bold 13px DOSMyungjo, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${entry.shopItem.buyPrice}G`, this.panelX + this.panelW - 16, itemY + 22);
            ctx.textAlign = 'start';

            // Buy indicator on hover
            if (isHover && !soldOut && canAfford) {
                ctx.fillStyle = 'rgba(80, 200, 80, 0.7)';
                ctx.font = 'bold 11px DOSMyungjo, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`▶ ${t('shop.buy')}`, this.panelX + this.panelW - 16, itemY + 42);
                ctx.textAlign = 'start';
            }

            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Scroll indicator
        if (this.filteredEntries.length * 52 > listH) {
            const totalH = this.filteredEntries.length * 52;
            const thumbH = Math.max(20, (listH / totalH) * listH);
            const thumbY = this.listY + (this.scrollY / totalH) * listH;
            ctx.fillStyle = 'rgba(160, 130, 60, 0.3)';
            ctx.fillRect(this.panelX + this.panelW - 8, thumbY, 4, thumbH);
        }

        // Empty tab message
        if (this.filteredEntries.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '13px DOSMyungjo, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('이 카테고리에 상품이 없습니다.', this.panelX + this.panelW / 2, this.listY + 40);
            ctx.textAlign = 'start';
        }
    }
}
