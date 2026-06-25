export interface InventorySaveItem {
    uid?: string;
    itemId: string;
    gridX: number;
    gridY: number;
    quantity: number;
    durability: number;
    acquiredInRaid?: boolean;
    sockets?: string[];
}

export interface InventorySaveSnapshot {
    width: number;
    height: number;
    items: InventorySaveItem[];
}

export interface CharacterSave {
    characterId: string;
    saveVersion: number;
    revision: number;
    hubLocation: Record<string, unknown>;
    questState: Record<string, unknown>;
    inventory: InventorySaveSnapshot;
    /** Town stash grid (15×10); persisted separately from raid backpack inventory. */
    stashSnapshot: InventorySaveSnapshot;
    equipment: Record<string, unknown>;
    partySnapshot: Record<string, unknown>;
    rosterSnapshot: Record<string, unknown>;
    updatedAt: string;
}

export type CharacterSavePatch = Partial<Omit<CharacterSave, 'characterId' | 'revision' | 'updatedAt'>>;
