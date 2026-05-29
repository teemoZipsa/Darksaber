/**
 * InventoryUI — Tarkov-style inventory MODEL & action layer.
 *
 * The grid/equipment screen is now rendered by the React DOM overlay
 * (`ui/react/inventory/InventoryPanel`). This class keeps the backpack/external
 * grids, the active character's equipment, and the drag-and-drop *resolution*
 * logic (move between grids, equip/unequip, socketing, raid-loot securing). React
 * reads through the getters and drives changes through the semantic actions below
 * (moveToCell / moveToEquip / quickMove / takeAll / sortBag), so the placement
 * rules live in exactly one place.
 *
 * Layout: LEFT = external grid (Stash in town, Loot in raid), CENTER = equipment
 * slots around the character, RIGHT = backpack.
 */

import { GridInventory, PlacedItem } from './GridInventory';
import { ItemDef, ItemSlot } from '../data/ItemDB';
import { Character } from '../character/Character';

/** Which container a dragged item currently lives in. */
export type InvGridKind = 'bag' | 'ext';
export type InvDragSource =
    | { kind: 'grid'; grid: InvGridKind; gridX: number; gridY: number }
    | { kind: 'equip'; slot: ItemSlot };

/** Equipment slots, in display order (two accessory slots share the 'accessory' label). */
export const EQUIP_SLOT_LIST: Array<{ slot: ItemSlot; labelKey: string }> = [
    { slot: 'head', labelKey: 'inv.head' },
    { slot: 'accessory', labelKey: 'inv.accessory' },
    { slot: 'accessory2', labelKey: 'inv.accessory' },
    { slot: 'weapon', labelKey: 'inv.weapon' },
    { slot: 'body', labelKey: 'inv.body' },
    { slot: 'shield', labelKey: 'inv.shield' },
    { slot: 'boots', labelKey: 'inv.boots' },
];

/** Whether an equipment UI slot accepts an item of the given item-slot. */
export function slotAcceptsItem(uiSlot: ItemSlot, itemSlot: ItemSlot): boolean {
    if (uiSlot === itemSlot) return true;
    if (uiSlot === 'accessory2' && itemSlot === 'accessory') return true;
    return false;
}

/** Whether `itemDef` can be socketed into the already-placed `host`. */
function canSocket(itemDef: ItemDef, host: PlacedItem): boolean {
    if (!host.item.maxSockets) return false;
    const cat = itemDef.itemCategory ?? itemDef.slot;
    if (cat !== 'rune' && cat !== 'gem') return false;
    if (!host.item.socketTypes?.includes(cat)) return false;
    return (host.sockets?.length ?? 0) < host.item.maxSockets;
}

export class InventoryUI {
    private inventory: GridInventory;
    private externalGrid: GridInventory | null = null;
    private externalTitle: string = 'Loot';
    private externalGridIsRaidLoot: boolean = false;
    private visible: boolean = false;
    private hideCloseBtn: boolean = false;
    public onRaidLootSecured: ((placed: PlacedItem, source?: { gridX: number; gridY: number }) => void) | null = null;

    // The character whose equipment we are managing.
    private activeChar: Character | null = null;

    // Transient feedback surfaced to the DOM (id bumps so React shows it once).
    private feedbackText: string = '';
    private feedbackId: number = 0;

    constructor(inventory: GridInventory) {
        this.inventory = inventory;
    }

    public setActiveCharacter(char: Character): void {
        this.activeChar = char;
    }

    public setExternalGrid(grid: GridInventory | null, title: string = 'Loot', options?: { isRaidLoot?: boolean }): void {
        this.externalGrid = grid;
        this.externalTitle = title;
        this.externalGridIsRaidLoot = grid ? !!options?.isRaidLoot : false;
    }

    public toggle(): void {
        this.visible = !this.visible;
    }

    public isVisible(): boolean { return this.visible; }
    public setHideCloseBtn(hide: boolean): void { this.hideCloseBtn = hide; }
    public isCloseHidden(): boolean { return this.hideCloseBtn; }

    // ─── React (DOM overlay) read accessors ──────────────────────
    public getBag(): GridInventory { return this.inventory; }
    public getExternalGrid(): GridInventory | null { return this.externalGrid; }
    public getExternalTitle(): string { return this.externalTitle; }
    public isExternalRaidLoot(): boolean { return this.externalGridIsRaidLoot; }
    public getActiveCharacter(): Character | null { return this.activeChar; }
    public getEquipped(slot: ItemSlot): PlacedItem | undefined {
        return this.activeChar ? this.activeChar.equipment.get(slot) : undefined;
    }
    public getFeedback(): { text: string; id: number } { return { text: this.feedbackText, id: this.feedbackId }; }

    private gridOf(kind: InvGridKind): GridInventory | null {
        return kind === 'ext' ? this.externalGrid : this.inventory;
    }

    private setFeedback(text: string): void {
        this.feedbackText = text;
        this.feedbackId++;
    }

    // ─── Drag-and-drop resolution (instance state preserved) ─────
    /** Detach a dragged item from its current home (grid cell or equip slot). */
    private detach(placed: PlacedItem, source: InvDragSource): void {
        if (source.kind === 'equip') this.activeChar?.equipment.delete(source.slot);
        else this.gridOf(source.grid)?.remove(placed);
    }

    /** Restore a dragged item to where it came from (used when a drop fails). */
    private restore(placed: PlacedItem, source: InvDragSource): void {
        if (source.kind === 'equip') {
            this.activeChar?.equipment.set(source.slot, placed);
            return;
        }
        const grid = this.gridOf(source.grid);
        if (grid && !grid.placeExisting(placed, source.gridX, source.gridY)) grid.autoPlaceExisting(placed);
    }

    private markRaidLoot(placed: PlacedItem, source: InvDragSource, targetKind: InvGridKind): void {
        if (source.kind !== 'grid' || source.grid !== 'ext') return;
        if (!this.externalGridIsRaidLoot || targetKind !== 'bag') return;
        placed.acquiredInRaid = true;
        this.onRaidLootSecured?.(placed, { gridX: source.gridX, gridY: source.gridY });
    }

    /** Drop the dragged item onto a specific cell of a target grid. */
    public moveToCell(placed: PlacedItem, source: InvDragSource, targetKind: InvGridKind, gx: number, gy: number): boolean {
        const target = this.gridOf(targetKind);
        if (!target) return false;

        const occupant = target.getAt(gx, gy);
        if (occupant && occupant !== placed && canSocket(placed.item, occupant)) {
            this.detach(placed, source);
            (occupant.sockets ??= []).push(placed.item);
            return true;
        }

        this.detach(placed, source);
        if (target.placeExisting(placed, gx, gy)) {
            this.markRaidLoot(placed, source, targetKind);
            return true;
        }
        this.restore(placed, source);
        return false;
    }

    /** Drop the dragged item onto an equipment slot (socket, or equip with swap-out). */
    public moveToEquip(placed: PlacedItem, source: InvDragSource, slot: ItemSlot): boolean {
        if (!this.activeChar) return false;
        const targetEq = this.activeChar.equipment.get(slot);

        if (targetEq && canSocket(placed.item, targetEq)) {
            this.detach(placed, source);
            (targetEq.sockets ??= []).push(placed.item);
            return true;
        }

        if (!slotAcceptsItem(slot, placed.item.slot)) return false;

        this.detach(placed, source);
        if (targetEq) this.inventory.autoPlaceExisting(targetEq); // swapped-out gear → backpack
        if (source.kind === 'grid' && source.grid === 'ext' && this.externalGridIsRaidLoot) {
            placed.acquiredInRaid = true;
            this.onRaidLootSecured?.(placed, { gridX: source.gridX, gridY: source.gridY });
        }
        this.activeChar.equipment.set(slot, placed);
        return true;
    }

    /** Click-to-transfer: equip→bag, bag→ext, ext→bag (auto-placed). */
    public quickMove(placed: PlacedItem, source: InvDragSource): boolean {
        const targetKind: InvGridKind = source.kind === 'equip' ? 'bag' : source.grid === 'bag' ? 'ext' : 'bag';
        const target = this.gridOf(targetKind);
        if (!target) return false;

        this.detach(placed, source);
        if (target.autoPlaceExisting(placed)) {
            this.markRaidLoot(placed, source, targetKind);
            return true;
        }
        this.restore(placed, source);
        return false;
    }

    /** Move everything from the external grid into the backpack. Returns feedback text. */
    public takeAll(): string {
        if (!this.externalGrid) return '';
        let moved = 0;
        for (const placed of [...this.externalGrid.items]) {
            const source = placed.gridX;
            const sourceY = placed.gridY;
            this.externalGrid.remove(placed);
            if (!this.inventory.autoPlaceExisting(placed)) {
                this.externalGrid.placeExisting(placed, source, sourceY); // put it back
                const msg = moved > 0 ? `${moved}개 획득, 배낭이 가득 찼습니다.` : '배낭이 가득 찼습니다.';
                this.setFeedback(msg);
                return msg;
            }
            if (this.externalGridIsRaidLoot) {
                placed.acquiredInRaid = true;
                this.onRaidLootSecured?.(placed, { gridX: source, gridY: sourceY });
            }
            moved++;
        }
        const msg = moved > 0 ? `${moved}개 전리품 획득.` : '가져갈 전리품이 없습니다.';
        this.setFeedback(msg);
        return msg;
    }

    /** Repack the backpack by size/value. Returns feedback text. */
    public sortBag(): string {
        this.inventory.sort();
        const msg = '배낭을 정리했습니다.';
        this.setFeedback(msg);
        return msg;
    }

    /**
     * Roll back a raid-loot transfer the server rejected (lock lost, item gone, etc.).
     * Pulls the item back out of the player's bag/equipment and restores it into the
     * open loot grid so the client view matches the authoritative server state.
     */
    public revertRaidLoot(placed: PlacedItem, source: { gridX: number; gridY: number }): void {
        let removed = false;
        if (this.inventory.items.includes(placed)) {
            this.inventory.remove(placed);
            removed = true;
        } else if (this.activeChar) {
            for (const [slot, equipped] of this.activeChar.equipment) {
                if (equipped === placed) {
                    this.activeChar.equipment.delete(slot);
                    removed = true;
                    break;
                }
            }
        }
        if (!removed) return;
        placed.acquiredInRaid = false;
        if (this.externalGrid) {
            if (!this.externalGrid.placeExisting(placed, source.gridX, source.gridY)) {
                this.externalGrid.autoPlaceExisting(placed);
            }
        }
        this.setFeedback('전리품 획득이 취소되었습니다.');
    }
}
