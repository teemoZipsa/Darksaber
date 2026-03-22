/**
 * Character — full character model with stats, class, level, and exp.
 * Each tier has levels 1-10. At level 10 with full EXP, auto-promote to next tier.
 */

import { CharacterStats, createBaseStats, GrowthRates, getBaseStatsForClass } from '../data/Stats';
import { ClassLine, getClassLine } from '../data/ClassTree';
import { ItemSlot } from '../data/ItemDB';
import { PlacedItem } from '../inventory/GridInventory';
import { Skill } from '../data/SkillDB';

export interface ActiveBuff {
    id: string;
    icon: string;
    stat: 'atk' | 'def' | 'spd' | 'mdef' | 'regen' | 'all';
    power: number;
    duration: number;
}

/** Result of gaining EXP — tells the engine what happened */
export interface ExpGainResult {
    leveledUp: boolean;
    promoted: boolean;       // true = tier promotion happened (trigger flash effect)
    newTierName?: string;    // Korean name of the new tier (for combat log)
}

export class Character {
    public id: string;
    public name: string;
    public classLineId: string;
    public currentTier: number;    // actual tier number (1 for T1-starters, 2 for T2-starters)
    public level: number;          // level within current tier (1-10)
    public exp: number;
    public expToNext: number;
    public stats: CharacterStats;
    public hasEmblem: boolean;     // needed for fusion
    
    // Cosmetic Info
    public age: number = 20;
    public gender: string = 'M';

    // Current active buffs/debuffs
    public buffs: ActiveBuff[] = [];
    
    // Rogue-like raid state
    public isDead: boolean = false;

    // Equipment specific to this character
    public equipment: Map<ItemSlot, PlacedItem> = new Map();

    // Portrait image for UI rendering
    public portraitImage?: HTMLImageElement;
    public portraitLoaded: boolean = false;

    private classLine: ClassLine | undefined;

    /** Max level per tier */
    public static readonly MAX_LEVEL = 10;

    constructor(id: string, name: string, classLineId: string) {
        this.id = id;
        this.name = name;
        this.classLineId = classLineId;
        this.classLine = getClassLine(classLineId);

        // Start at the first tier defined for this class (T1 or T2)
        this.currentTier = this.classLine ? this.classLine.tiers[0].tier : 1;
        this.level = 1;
        this.exp = 0;
        this.expToNext = this.calcExpToNext();
        this.hasEmblem = false;

        // Initialize base stats with class-specific overrides
        const cl = this.classLine;
        const mov = cl ? cl.baseMovRange : 3;
        const overrides = getBaseStatsForClass(this.classLineId, mov);
        this.stats = createBaseStats(overrides);

        // Load portrait for starting tier
        this.updatePortrait();
    }

    /**
     * Tier-based portrait images.
     * Key = classLineId, Value = { tierNumber: imagePath }
     * Missing tiers fall back to the first available image.
     */
    private static readonly TIER_PORTRAITS: Record<string, Record<number, string>> = {
        'infantry': {
            1: '/Image/Character/fighter.png',
            2: '/Image/Character/Gladiator.png',
            4: '/Image/Character/King.png',
            7: '/Image/Character/Great Emperor.png',
        },
        'cavalry': {
            1: '/Image/Character/knight.png',
            2: '/Image/Character/Ark Knight.png',      // Ark Knight = T2
        },
        'flying': {
            2: '/Image/Character/Hawk Knight.png',
        },
        'naval': {
            2: '/Image/Character/Captain.png',
        },
        'lancer': {
            2: '/Image/Character/High Lord.png',        // Lord=T2, but High Lord image
            3: '/Image/Character/High Lord.png',
        },
        'archer': {
            2: '/Image/Character/Ranger.png',           // Sniper=T2, but Ranger image
            3: '/Image/Character/Ranger.png',
            5: '/Image/Character/Bow Lord.png',
        },
        'cleric': {
            1: '/Image/Character/cleric.png',
            2: '/Image/Character/Priest.png',
        },
        'priest': {
            2: '/Image/Character/monk.png',
            4: '/Image/Character/Sage.png',
        },
        'mage': {
            1: '/Image/Character/magician.png',
            2: '/Image/Character/Wizard.png',
        },
        'cultist': {
            2: '/Image/Character/Shaman.png',
            3: '/Image/Character/Summoner.png',
        },
        'shrine': {
            2: '/Image/Character/Shrine Maiden.png',
        },
        'alchemist': {
            1: '/Image/Character/Alchemist.png',
        },
    };

    /** Update portrait image based on current tier */
    public updatePortrait(): void {
        const tierMap = Character.TIER_PORTRAITS[this.classLineId];
        if (!tierMap) {
            this.loadPortraitSrc('/Image/Character/fighter.png');
            return;
        }

        // Find best matching image: current tier, or closest lower tier
        let bestSrc: string | undefined;
        for (let t = this.currentTier; t >= 1; t--) {
            if (tierMap[t]) { bestSrc = tierMap[t]; break; }
        }
        // Fallback: use any available image for this class
        if (!bestSrc) {
            const keys = Object.keys(tierMap).map(Number).sort((a, b) => a - b);
            bestSrc = keys.length > 0 ? tierMap[keys[0]] : '/Image/Character/fighter.png';
        }

        this.loadPortraitSrc(bestSrc);
    }

    private loadPortraitSrc(src: string): void {
        this.portraitLoaded = false;
        this.portraitImage = new Image();
        this.portraitImage.onload = () => { this.portraitLoaded = true; };
        this.portraitImage.src = src;
    }

    /** Get the index into tiers[] for the current tier number */
    private get tierIndex(): number {
        if (!this.classLine) return 0;
        const idx = this.classLine.tiers.findIndex(t => t.tier === this.currentTier);
        return idx >= 0 ? idx : 0;
    }

    /** Whether this class can still promote (has more tiers) */
    private get hasNextTier(): boolean {
        if (!this.classLine) return false;
        return this.tierIndex < this.classLine.tiers.length - 1;
    }

    /** Calculate EXP needed for next level (scales with tier and level) */
    private calcExpToNext(): number {
        const tierMult = Math.pow(1.15, this.tierIndex);
        const levelMult = Math.pow(1.08, this.level - 1);
        return Math.floor(50 * tierMult * levelMult);
    }

    public applyBuff(skill: Skill): void {
        if (skill.type !== 'buff' && skill.type !== 'debuff') return;
        const stat = skill.buffStat || 'all';
        const duration = skill.buffDuration || 3;
        
        // Refresh duration if same buff exists
        this.buffs = this.buffs.filter(b => b.id !== skill.id);
        
        this.buffs.push({
            id: skill.id,
            icon: skill.icon,
            stat: stat as any,
            power: skill.power,
            duration: duration
        });
    }

    public tickBuffs(): void {
        for (const buff of this.buffs) {
            if (buff.stat === 'regen') {
                const healAmt = Math.floor(this.stats.maxHp * 0.1);
                this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + healAmt);
            }
            buff.duration -= 1;
        }
        this.buffs = this.buffs.filter(b => b.duration > 0);
    }

    public getCombatStats(): CharacterStats {
        const cbStats = { ...this.stats }; 
        for (const buff of this.buffs) {
            const mult = buff.power;
            if (buff.stat === 'atk' || buff.stat === 'all') cbStats.atk = Math.floor(cbStats.atk * mult);
            if (buff.stat === 'def' || buff.stat === 'all') cbStats.def = Math.floor(cbStats.def * mult);
            if (buff.stat === 'spd' || buff.stat === 'all') cbStats.spd = Math.floor(cbStats.spd * mult);
            if (buff.stat === 'mdef' || buff.stat === 'all') cbStats.magDef = Math.floor(cbStats.magDef * mult);
        }
        return cbStats;
    }

    /**
     * Add experience and handle level-ups + auto-promotion.
     * Returns result with leveledUp and promoted flags.
     */
    public gainExp(amount: number): ExpGainResult {
        const result: ExpGainResult = { leveledUp: false, promoted: false };
        this.exp += amount;

        while (this.exp >= this.expToNext) {
            if (this.level >= Character.MAX_LEVEL) {
                // At max level — attempt promotion
                if (this.hasNextTier) {
                    this.exp -= this.expToNext;
                    this.doPromote();
                    result.promoted = true;
                    result.leveledUp = true;
                    result.newTierName = this.getTierName();
                } else {
                    // Max tier, max level — cap EXP
                    this.exp = this.expToNext;
                    break;
                }
            } else {
                // Normal level up within tier
                this.exp -= this.expToNext;
                this.level++;
                this.applyLevelUpGrowth();
                this.expToNext = this.calcExpToNext();
                result.leveledUp = true;
            }
        }

        return result;
    }

    /** Auto-promote to next tier */
    private doPromote(): void {
        if (!this.classLine) return;
        const nextIdx = this.tierIndex + 1;
        if (nextIdx >= this.classLine.tiers.length) return;
        
        this.currentTier = this.classLine.tiers[nextIdx].tier;
        this.level = 1;
        this.expToNext = this.calcExpToNext();

        // Promotion stat bonus (2x growth for ALL stats)
        const g = this.classLine.growth;
        this.stats.maxHp += Math.floor(g.hp * 2);
        this.stats.hp = this.stats.maxHp;
        this.stats.maxMp += Math.floor(g.mp * 2);
        this.stats.mp = this.stats.maxMp;
        this.stats.atk += Math.floor(g.atk * 2 * 10) / 10;
        this.stats.def += Math.floor(g.def * 2 * 10) / 10;
        this.stats.magAtk += Math.floor(g.magAtk * 2 * 10) / 10;
        this.stats.magDef += Math.floor(g.magDef * 2 * 10) / 10;
        this.stats.spd += Math.floor(g.spd * 2 * 10) / 10;

        // Update portrait for new tier
        this.updatePortrait();
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

    /** Get current tier display name */
    public getTierName(): string {
        if (!this.classLine) return '미상';
        const tier = this.classLine.tiers[this.tierIndex];
        return tier ? tier.nameKr : '미상';
    }

    public getTierNameEn(): string {
        if (!this.classLine) return 'Unknown';
        const tier = this.classLine.tiers[this.tierIndex];
        return tier ? tier.nameEn : 'Unknown';
    }

    /** Equip an item. Returns the previously equipped item (if any), or null. */
    public equip(placed: PlacedItem): PlacedItem | null {
        const old = this.equipment.get(placed.item.slot);
        this.equipment.set(placed.item.slot, placed);
        return old || null;
    }

    /** Unequip an item from a slot. Returns the item, or null if empty. */
    public unequip(slot: ItemSlot): PlacedItem | null {
        const old = this.equipment.get(slot);
        if (old) {
            this.equipment.delete(slot);
            return old;
        }
        return null;
    }

    /** Whether this character can promote right now */
    public canPromote(): boolean {
        return this.level >= Character.MAX_LEVEL && this.hasNextTier;
    }

    /** Manual promote (for UI button if needed) */
    public promote(): boolean {
        if (!this.canPromote()) return false;
        this.doPromote();
        return true;
    }

    /** Check if this character is ready for fusion (max tier, max level, has emblem) */
    public isFusionReady(): boolean {
        return !this.hasNextTier && this.level >= Character.MAX_LEVEL && this.hasEmblem;
    }
}

