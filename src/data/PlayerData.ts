/**
 * PlayerData — Global player save data (gold, inventory, progress).
 * Provides a SaveManager interface for localStorage (later Firebase).
 */

export interface InventoryItem {
    uid: string;         // Unique ID for this specific instance
    itemId: string;      // Reference to ItemDB
    gridX: number;       // Grid position X
    gridY: number;       // Grid position Y
    sockets: string[];   // Array of itemId string that are slotted inside
}

export interface SaveData {
    gold: number;
    clearedStages: string[];
    currentHubTownId: string;
    pendingRestMenuId: string | null;
    inventory: InventoryItem[];
    equipped: { [slot: string]: InventoryItem | null };
    /** ISO date string of last save */
    lastSaved: string;
}
const SAVE_KEY = 'sin_eater_save';

export class PlayerData {
    public gold: number = 500;  // Starting gold
    public clearedStages: Set<string> = new Set();
    public currentHubTownId: string = 'central_castle';
    public pendingRestMenuId: string | null = null;
    public inventory: InventoryItem[] = [];
    public equipped: Record<string, InventoryItem | null> = {
        weapon: null, shield: null, head: null, body: null, boots: null, accessory: null, accessory2: null
    };

    /** Add gold */
    public addGold(amount: number): void {
        this.gold += amount;
    }

    /** Spend gold. Returns false if insufficient. */
    public spendGold(amount: number): boolean {
        if (this.gold < amount) return false;
        this.gold -= amount;
        return true;
    }

    /** Mark a stage as cleared */
    public markCleared(stageId: string): void {
        this.clearedStages.add(stageId);
    }

    /** Check if a stage has been cleared */
    public isCleared(stageId: string): boolean {
        return this.clearedStages.has(stageId);
    }

    // ═══════════════════════════════════════════════════════════
    //  Save / Load (localStorage for now, Firebase later)
    // ═══════════════════════════════════════════════════════════

    public save(): void {
        const data: SaveData = {
            gold: this.gold,
            clearedStages: Array.from(this.clearedStages),
            currentHubTownId: this.currentHubTownId,
            pendingRestMenuId: this.pendingRestMenuId,
            inventory: this.inventory,
            equipped: this.equipped,
            lastSaved: new Date().toISOString(),
        };
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch { /* silent */ }
    }

    public load(): void {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return;
            const data: SaveData = JSON.parse(raw);
            this.gold = data.gold ?? 500;
            this.clearedStages = new Set(data.clearedStages ?? []);
            this.currentHubTownId = data.currentHubTownId ?? 'central_castle';
            this.pendingRestMenuId = data.pendingRestMenuId ?? null;
            this.inventory = data.inventory ?? [];
            this.equipped = data.equipped ?? {
                weapon: null, shield: null, head: null, body: null, boots: null, accessory: null, accessory2: null
            };
        } catch { /* silent — start fresh */ }
    }
}
