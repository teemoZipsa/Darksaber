import { getItemDef } from '../src/data/ItemDB';
import type { CharacterSave, CharacterSavePatch, InventorySaveItem, InventorySaveSnapshot } from './AuthStore';

export type WorldCharacterSavePatch = CharacterSavePatch;

export interface WorldSessionSavePlayer {
    id: string;
    completedQuestIds: Set<string>;
    saveSnapshot?: CharacterSave;
}

export interface WorldSessionPlacedSaveItem {
    item: { id: string; maxDurability: number };
    durability: number;
    quantity: number;
    sockets?: Array<{ id: string }>;
}

export class WorldSessionSaveState {
    private readonly dirtyPlayerIds = new Set<string>();
    private readonly finalPatches = new Map<string, WorldCharacterSavePatch>();

    public markDirty(playerId: string): void {
        this.dirtyPlayerIds.add(playerId);
    }

    public consumeDirtyPlayerIds(): string[] {
        const playerIds = [...this.dirtyPlayerIds];
        this.dirtyPlayerIds.clear();
        return playerIds;
    }

    public createPatch(player: WorldSessionSavePlayer | undefined, playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        return player ? this.buildPatch(player, hubTownId) : this.finalPatches.get(playerId) ?? null;
    }

    public captureFinalPatch(player: WorldSessionSavePlayer, hubTownId?: string): void {
        const patch = this.buildPatch(player, hubTownId);
        if (patch) this.finalPatches.set(player.id, patch);
    }

    public hasFinalPatch(playerId: string): boolean {
        return this.finalPatches.has(playerId);
    }

    public consumeFinalPatch(playerId: string): WorldCharacterSavePatch | null {
        const patch = this.finalPatches.get(playerId) ?? null;
        this.finalPatches.delete(playerId);
        return patch;
    }

    public removeItemQuantity(player: WorldSessionSavePlayer, itemId: string, quantity: number): void {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory || quantity <= 0) return;
        let remaining = Math.floor(quantity);
        for (const item of [...inventory.items]) {
            if (item.itemId !== itemId || remaining <= 0) continue;
            const consumed = Math.min(Math.max(1, item.quantity), remaining);
            item.quantity -= consumed;
            remaining -= consumed;
            if (item.quantity <= 0) {
                inventory.items = inventory.items.filter((entry) => entry !== item);
            }
        }
    }

    public addPlacedItem(player: WorldSessionSavePlayer, placed: WorldSessionPlacedSaveItem): void {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory || placed.quantity <= 0) return;
        const slot = findFreeInventorySlot(inventory, placed.item.id);
        if (!slot) return;
        const item: InventorySaveItem = {
            itemId: placed.item.id,
            gridX: slot.x,
            gridY: slot.y,
            durability: Number.isFinite(placed.durability) ? placed.durability : placed.item.maxDurability,
            quantity: Math.max(1, Math.floor(placed.quantity)),
            acquiredInRaid: true,
        };
        if (placed.sockets) item.sockets = placed.sockets.map((socket) => socket.id);
        inventory.items.push(item);
    }

    private buildPatch(player: WorldSessionSavePlayer, hubTownId?: string): WorldCharacterSavePatch | null {
        const save = player.saveSnapshot;
        if (!save) return null;
        save.questState = {
            ...save.questState,
            completedQuestIds: [...player.completedQuestIds],
        };
        if (hubTownId) {
            save.hubLocation = {
                ...save.hubLocation,
                townId: hubTownId,
            };
        }
        return {
            saveVersion: save.saveVersion,
            hubLocation: cloneRecord(save.hubLocation),
            questState: cloneRecord(save.questState),
            inventory: cloneInventorySnapshot(save.inventory),
            equipment: cloneRecord(save.equipment),
            partySnapshot: cloneRecord(save.partySnapshot),
            rosterSnapshot: cloneRecord(save.rosterSnapshot),
        };
    }
}

export function cloneCharacterSave(save: CharacterSave | undefined): CharacterSave | undefined {
    if (!save) return undefined;
    return {
        ...save,
        hubLocation: cloneRecord(save.hubLocation),
        questState: cloneRecord(save.questState),
        inventory: cloneInventorySnapshot(save.inventory),
        equipment: cloneRecord(save.equipment),
        partySnapshot: cloneRecord(save.partySnapshot),
        rosterSnapshot: cloneRecord(save.rosterSnapshot),
    };
}

function cloneInventorySnapshot(inventory: InventorySaveSnapshot): InventorySaveSnapshot {
    return {
        width: inventory.width,
        height: inventory.height,
        items: inventory.items.map((item) => ({ ...item })),
    };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function findFreeInventorySlot(inventory: InventorySaveSnapshot, itemId: string): { x: number; y: number } | null {
    const item = getItemDef(itemId);
    if (!item) return null;
    for (let y = 0; y <= inventory.height - item.gridH; y++) {
        for (let x = 0; x <= inventory.width - item.gridW; x++) {
            if (canPlaceSavedItem(inventory, x, y, item.gridW, item.gridH)) return { x, y };
        }
    }
    return null;
}

function canPlaceSavedItem(inventory: InventorySaveSnapshot, x: number, y: number, width: number, height: number): boolean {
    for (const placed of inventory.items) {
        const item = getItemDef(placed.itemId);
        const itemWidth = item?.gridW ?? 1;
        const itemHeight = item?.gridH ?? 1;
        const overlaps = x < placed.gridX + itemWidth
            && x + width > placed.gridX
            && y < placed.gridY + itemHeight
            && y + height > placed.gridY;
        if (overlaps) return false;
    }
    return true;
}
