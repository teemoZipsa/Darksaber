/**
 * Character — full character model with stats, class, level, and exp.
 */

import { CharacterStats, createBaseStats, GrowthRates } from '../data/Stats';
import { ClassLine, getClassLine } from '../data/ClassTree';
import { ItemSlot } from '../data/ItemDB';
import { PlacedItem } from '../inventory/GridInventory';

export class Character {
    public id: string;
    public name: string;
    public classLineId: string;
    public currentTier: number;
    public level: number;          // level within current tier
    public exp: number;
    public expToNext: number;
    public stats: CharacterStats;
    public hasEmblem: boolean;     // needed for fusion

    // Current active buffs/debuffs could go here
    
    // Equipment specific to this character
    public equipment: Map<ItemSlot, PlacedItem> = new Map();

    private classLine: ClassLine | undefined;

    constructor(id: string, name: string, classLineId: string) {
        this.id = id;
        this.name = name;
        this.classLineId = classLineId;
        this.currentTier = 1;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.hasEmblem = false;
        this.classLine = getClassLine(classLineId);

        // Initialize base stats with class-specific overrides
        const cl = this.classLine;
        this.stats = createBaseStats(cl ? {
            mov: cl.baseMovRange,
        } : undefined);
    }

    /** Get current tier display name */
    public getTierName(): string {
        if (!this.classLine) return 'Unknown';
        const tier = this.classLine.tiers[this.currentTier - 1];
        return tier ? tier.nameKr : 'Unknown';
    }

    public getTierNameEn(): string {
        if (!this.classLine) return 'Unknown';
        const tier = this.classLine.tiers[this.currentTier - 1];
        return tier ? tier.nameEn : 'Unknown';
    }

    /** Equip an item. Returns the previously equipped item (if any), or null. */
    public equip(placed: PlacedItem): PlacedItem | null {
        const old = this.equipment.get(placed.item.slot);
        this.equipment.set(placed.item.slot, placed);
        // TODO: Recalculate stats based on new equipment
        // this.recalculateStats();
        return old || null;
    }

    /** Unequip an item from a slot. Returns the item, or null if empty. */
    public unequip(slot: ItemSlot): PlacedItem | null {
        const old = this.equipment.get(slot);
        if (old) {
            this.equipment.delete(slot);
            // TODO: Recalculate stats based on removed equipment
            // this.recalculateStats();
            return old;
        }
        return null;
    }

    /** Add experience and handle level-ups */
    public addExp(amount: number): boolean {
        this.exp += amount;
        let leveledUp = false;

        while (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.level++;
            this.applyLevelUpGrowth();
            this.expToNext = Math.floor(this.expToNext * 1.15);
            leveledUp = true;
        }

        return leveledUp;
    }

    /** Apply stat growth on level up */
    private applyLevelUpGrowth(): void {
        if (!this.classLine) return;
        const g: GrowthRates = this.classLine.growth;

        this.stats.maxHp += Math.floor(g.hp);
        this.stats.hp = this.stats.maxHp;
        this.stats.maxMp += Math.floor(g.mp);
        this.stats.mp = this.stats.maxMp;
        this.stats.atk += Math.floor(g.atk * 10) / 10;
        this.stats.def += Math.floor(g.def * 10) / 10;
        this.stats.magAtk += Math.floor(g.magAtk * 10) / 10;
        this.stats.magDef += Math.floor(g.magDef * 10) / 10;
        this.stats.spd += Math.floor(g.spd * 10) / 10;
    }

    /** Promote to next tier (if eligible) */
    public canPromote(): boolean {
        if (!this.classLine) return false;
        return this.currentTier < 7 && this.level >= 10; // level 10+ to promote
    }

    public promote(): boolean {
        if (!this.canPromote()) return false;
        this.currentTier++;
        this.level = 1;
        this.exp = 0;
        this.expToNext = Math.floor(100 * Math.pow(1.3, this.currentTier - 1));
        return true;
    }

    /** Check if this character is ready for fusion (tier 7, max level, has emblem) */
    public isFusionReady(): boolean {
        return this.currentTier === 7 && this.level >= 10 && this.hasEmblem;
    }
}
