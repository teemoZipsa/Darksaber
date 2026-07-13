/**
 * Character — full character model with stats, class, level, and exp.
 * Each tier has levels 1-10. At level 10 with full EXP, auto-promote to next tier.
 */

import { CharacterStats, createBaseStats, getBaseStatsForClass } from '../data/Stats';
import { ClassLine, MasterBranch, getClassLine, getMasterClassLineId } from '../data/ClassTree';
import { ItemSlot } from '../data/ItemDB';
import { PlacedItem } from '../inventory/GridInventory';
import { Skill } from '../data/SkillDB';
import { getOriginalStats } from '../data/original/originalProgression';
import {
    applyCharacterExp,
    getCharacterExpToNext,
    getCharacterLevelCap,
} from './CharacterProgression';
import {
    StatusEffect,
    applyStatuses,
    getEffectiveStatsForCharacter,
    getStatusEffectsForSkill,
    resolveTurnStartStatuses,
} from '../combat/StatusEffects';
import { i18n, t } from '../i18n/LanguageManager';

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
    emblemUnlocked?: boolean;
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

    // Current active status effects from skills, rests, and injuries.
    public statuses: StatusEffect[] = [];
    
    // Rogue-like raid state
    public isDead: boolean = false;

    // Equipment specific to this character
    public equipment: Map<ItemSlot, PlacedItem> = new Map();

    // Equipped magic skill ids (ordered, max 8). Drives the in-combat radial menu.
    // Empty means "auto-equip the first learned skills" — resolved via normalizeLoadout.
    public magicLoadout: string[] = [];
    // Per-skill gold upgrade level (1..5). Absent/1 = base skill.
    public skillUpgradeLevels: Record<string, number> = {};

    // Portrait image for UI rendering
    public portraitImage?: HTMLImageElement;
    public portraitLoaded: boolean = false;

    private classLine: ClassLine | undefined;

    /** Default max level per tier when a tier has no original data. */
    public static readonly MAX_LEVEL = 10;

    /** Max level within the current tier (original level design; falls back to 10). */
    public levelCap(): number {
        return getCharacterLevelCap(this.classLineId, this.currentTier);
    }

    /**
     * Recompute base stats from the original level design for the current
     * tier/level. Idempotent; a no-op for classes/tiers with no original data
     * (they keep their saved/derived stats). Call after loading tier/level from
     * a save so original-aligned classes don't keep stale, off-scale stats.
     */
    public syncOriginalBaseStats(): void {
        this.applyOriginalClassStats();
    }

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
        // Overlay original-game base stats for this class/tier/level when available.
        this.applyOriginalClassStats();

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
            1: '/assets/images/characters/darksaber/infantry_t1.png',
            2: '/assets/images/characters/darksaber/infantry_t2.png',
            3: '/assets/images/characters/darksaber/infantry_t3.png',
            4: '/assets/images/characters/darksaber/infantry_t4.png',
            5: '/assets/images/characters/darksaber/infantry_t5.png',
            6: '/assets/images/characters/darksaber/infantry_t6.png',
            7: '/assets/images/characters/darksaber/infantry_t7.png',
        },
        'cavalry': {
            1: '/assets/images/characters/darksaber/cavalry_t1.png',
            2: '/assets/images/characters/darksaber/cavalry_t2.png',
            3: '/assets/images/characters/darksaber/cavalry_t3.png',
            4: '/assets/images/characters/darksaber/cavalry_t4.png',
            5: '/assets/images/characters/darksaber/cavalry_t5.png',
            6: '/assets/images/characters/darksaber/cavalry_t6.png',
            7: '/assets/images/characters/darksaber/cavalry_t7.png',
        },
        'flying': {
            2: '/assets/images/characters/darksaber/flying_t2.png',
            3: '/assets/images/characters/darksaber/flying_t3.png',
            4: '/assets/images/characters/darksaber/flying_t4.png',
            5: '/assets/images/characters/darksaber/flying_t5.png',
            6: '/assets/images/characters/darksaber/flying_t6.png',
            7: '/assets/images/characters/darksaber/flying_t7.png',
        },
        'naval': {
            2: '/assets/images/characters/darksaber/naval_t2.png',
            3: '/assets/images/characters/darksaber/naval_t3.png',
            4: '/assets/images/characters/darksaber/naval_t4.png',
            5: '/assets/images/characters/darksaber/naval_t5.png',
            6: '/assets/images/characters/darksaber/naval_t6.png',
            7: '/assets/images/characters/darksaber/naval_t7.png',
        },
        'lancer': {
            2: '/assets/images/characters/darksaber/lancer_t2.png',
            3: '/assets/images/characters/darksaber/lancer_t3.png',
            4: '/assets/images/characters/darksaber/lancer_t4.png',
            5: '/assets/images/characters/darksaber/lancer_t5.png',
            6: '/assets/images/characters/darksaber/lancer_t6.png',
            7: '/assets/images/characters/darksaber/lancer_t7.png',
        },
        'archer': {
            2: '/assets/images/characters/darksaber/archer_t2.png',
            3: '/assets/images/characters/darksaber/archer_t3.png',
            4: '/assets/images/characters/darksaber/archer_t4.png',
            5: '/assets/images/characters/darksaber/archer_t5.png',
            6: '/assets/images/characters/darksaber/archer_t6.png',
            7: '/assets/images/characters/darksaber/archer_t7.png',
        },
        'cleric': {
            1: '/assets/images/characters/darksaber/cleric_t1.png',
            2: '/assets/images/characters/darksaber/cleric_t2.png',
            3: '/assets/images/characters/darksaber/cleric_t3.png',
            4: '/assets/images/characters/darksaber/cleric_t4.png',
            5: '/assets/images/characters/darksaber/cleric_t5.png',
            6: '/assets/images/characters/darksaber/cleric_t6.png',
            7: '/assets/images/characters/darksaber/cleric_t7.png',
        },
        'priest': {
            2: '/assets/images/characters/darksaber/priest_t2.png',
            3: '/assets/images/characters/darksaber/priest_t3.png',
            4: '/assets/images/characters/darksaber/priest_t4.png',
            5: '/assets/images/characters/darksaber/priest_t5.png',
            6: '/assets/images/characters/darksaber/priest_t6.png',
            7: '/assets/images/characters/darksaber/priest_t7.png',
        },
        'mage': {
            1: '/assets/images/characters/darksaber/mage_t1.png',
            2: '/assets/images/characters/darksaber/mage_t2.png',
            3: '/assets/images/characters/darksaber/mage_t3.png',
            4: '/assets/images/characters/darksaber/mage_t4.png',
            5: '/assets/images/characters/darksaber/mage_t5.png',
            6: '/assets/images/characters/darksaber/mage_t6.png',
            7: '/assets/images/characters/darksaber/mage_t7.png',
        },
        'cultist': {
            2: '/assets/images/characters/darksaber/cultist_t2.png',
            3: '/assets/images/characters/darksaber/cultist_t3.png',
            4: '/assets/images/characters/darksaber/cultist_t4.png',
            5: '/assets/images/characters/darksaber/cultist_t5.png',
            6: '/assets/images/characters/darksaber/cultist_t6.png',
            7: '/assets/images/characters/darksaber/cultist_t7.png',
        },
        'shrine': {
            1: '/assets/images/characters/darksaber/shrine_t1.png',
            2: '/assets/images/characters/darksaber/shrine_t2.png',
            3: '/assets/images/characters/darksaber/shrine_t3.png',
            4: '/assets/images/characters/darksaber/shrine_t4.png',
            5: '/assets/images/characters/darksaber/shrine_t5.png',
            6: '/assets/images/characters/darksaber/shrine_t6.png',
            7: '/assets/images/characters/darksaber/shrine_t7.png',
        },
        'alchemist': {
            1: '/assets/images/characters/darksaber/alchemist_t1.png',
            2: '/assets/images/characters/darksaber/alchemist_t2.png',
            3: '/assets/images/characters/darksaber/alchemist_t3.png',
            4: '/assets/images/characters/darksaber/alchemist_t4.png',
            5: '/assets/images/characters/darksaber/alchemist_t5.png',
            6: '/assets/images/characters/darksaber/alchemist_t6.png',
            7: '/assets/images/characters/darksaber/alchemist_t7.png',
        },
        'master_battle': {
            8: '/assets/images/characters/darksaber/master_battle_t8.png',
            9: '/assets/images/characters/darksaber/master_battle_t9.png',
            10: '/assets/images/characters/darksaber/master_battle_t10.png',
        },
        'master_tactics': {
            8: '/assets/images/characters/darksaber/master_tactics_t8.png',
            9: '/assets/images/characters/darksaber/master_tactics_t9.png',
            10: '/assets/images/characters/darksaber/master_tactics_t10.png',
        },
        'master_healer': {
            8: '/assets/images/characters/darksaber/cleric_t7.png',
            9: '/assets/images/characters/darksaber/priest_t7.png',
            10: '/assets/images/characters/darksaber/cleric_t7.png',
        },
        'master_magic': {
            8: '/assets/images/characters/darksaber/master_magic_t8.png',
            9: '/assets/images/characters/darksaber/master_magic_t9.png',
            10: '/assets/images/characters/darksaber/master_magic_t10.png',
        },
    };

    /** Update portrait image based on current tier */
    public updatePortrait(): void {
        this.loadPortraitSrc(this.getPortraitSrc());
    }

    public getPortraitSrc(): string {
        const tierMap = Character.TIER_PORTRAITS[this.classLineId];
        if (!tierMap) {
            return '/assets/images/characters/darksaber/infantry_t1.png';
        }

        // Find best matching image: current tier, or closest lower tier
        let bestSrc: string | undefined;
        for (let t = this.currentTier; t >= 1; t--) {
            if (tierMap[t]) { bestSrc = tierMap[t]; break; }
        }
        // Fallback: use any available image for this class
        if (!bestSrc) {
            const keys = Object.keys(tierMap).map(Number).sort((a, b) => a - b);
            bestSrc = keys.length > 0 ? tierMap[keys[0]] : '/assets/images/characters/darksaber/infantry_t1.png';
        }

        return bestSrc;
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

    /** Calculate EXP needed for next level. Uses the original level design when
     *  available (2x gain rate), else falls back to the legacy formula. */
    private calcExpToNext(): number {
        return getCharacterExpToNext(this.classLineId, this.currentTier, this.level);
    }

    public applyBuff(skill: Skill): void {
        if (skill.type !== 'buff' && skill.type !== 'debuff') return;
        this.statuses = applyStatuses(this.statuses, getStatusEffectsForSkill(skill));
    }

    public tickBuffs(): void {
        const effective = getEffectiveStatsForCharacter(this);
        const result = resolveTurnStartStatuses(effective, this.statuses);
        this.stats.hp = Math.max(0, Math.min(effective.maxHp, this.stats.hp + result.hpDelta));
        this.statuses = result.statuses;
    }

    public getCombatStats(): CharacterStats {
        return getEffectiveStatsForCharacter(this);
    }

    public get buffs(): ActiveBuff[] {
        return this.statuses.map((status) => ({
            id: status.sourceSkillId ?? status.kind,
            icon: status.icon,
            stat: 'all',
            power: status.magnitude,
            duration: status.durationTurns ?? Math.ceil(status.remainingSeconds ?? 0),
        }));
    }

    /**
     * Add experience and handle level-ups + auto-promotion.
     * Returns result with leveledUp and promoted flags.
     */
    public gainExp(amount: number): ExpGainResult {
        const previousTier = this.currentTier;
        const progression = applyCharacterExp({
            classLineId: this.classLineId,
            currentTier: this.currentTier,
            level: this.level,
            exp: this.exp,
            expToNext: this.expToNext,
            stats: this.stats,
            hasEmblem: this.hasEmblem,
        }, amount);

        this.currentTier = progression.state.currentTier;
        this.level = progression.state.level;
        this.exp = progression.state.exp;
        this.expToNext = progression.state.expToNext;
        this.stats = progression.state.stats;
        this.hasEmblem = progression.state.hasEmblem;

        if (this.currentTier !== previousTier) this.updatePortrait();

        const result: ExpGainResult = {
            leveledUp: progression.leveledUp,
            promoted: progression.promoted,
        };
        if (progression.promoted) result.newTierName = this.getTierName();
        if (progression.emblemUnlocked) result.emblemUnlocked = true;
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

        // Prefer original base stats for the new tier; else legacy 2x growth bump.
        if (!this.applyOriginalClassStats()) {
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
        }

        // Update portrait for new tier
        this.updatePortrait();
    }

    private tryUnlockFusionEmblem(): boolean {
        if (this.hasEmblem || this.hasNextTier || this.currentTier < 7 || this.level < this.levelCap()) {
            return false;
        }
        this.hasEmblem = true;
        return true;
    }

    /**
     * Overlay original-game base stats for the current tier/level (HP/MP full).
     * Returns true when applied; false for classes/tiers with no original data.
     */
    private applyOriginalClassStats(): boolean {
        const original = getOriginalStats(this.classLineId, this.currentTier, this.level);
        if (!original) return false;
        this.stats = { ...this.stats, ...original };
        this.stats.hp = this.stats.maxHp;
        this.stats.mp = this.stats.maxMp;
        return true;
    }

    /** Get current tier display name */
    public getTierName(): string {
        if (!this.classLine) return t('character.tier.unknown');
        const tier = this.classLine.tiers[this.tierIndex];
        if (!tier) return t('character.tier.unknown');
        return i18n.lang === 'en' ? tier.nameEn : tier.nameKr;
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
        return this.level >= this.levelCap() && this.hasNextTier;
    }

    /** Manual promote (for UI button if needed) */
    public promote(): boolean {
        if (!this.canPromote()) return false;
        this.doPromote();
        this.tryUnlockFusionEmblem();
        return true;
    }

    /** Check if this character is ready for fusion (max tier, max level, has emblem) */
    public isFusionReady(): boolean {
        return !this.hasNextTier && this.level >= this.levelCap() && this.hasEmblem;
    }

    public fuseToMaster(branch: MasterBranch, absorbed: Character[]): boolean {
        if (!this.isFusionReady() || absorbed.some((character) => !character.isFusionReady())) return false;

        const nextClassLineId = getMasterClassLineId(branch);
        const nextClassLine = getClassLine(nextClassLineId);
        if (!nextClassLine) return false;

        const sourceStats = [this.stats, ...absorbed.map((character) => character.stats)];

        this.classLineId = nextClassLineId;
        this.classLine = nextClassLine;
        this.currentTier = nextClassLine.tiers[0]?.tier ?? 8;
        this.level = 1;
        this.exp = 0;
        this.expToNext = this.calcExpToNext();
        this.hasEmblem = false;
        this.statuses = [];
        this.isDead = false;
        this.stats = this.createFusionStats(sourceStats, nextClassLine.baseMovRange);
        this.updatePortrait();
        return true;
    }

    private createFusionStats(sourceStats: CharacterStats[], baseMov: number): CharacterStats {
        const max = (key: keyof CharacterStats) => Math.max(...sourceStats.map((stats) => stats[key]));
        const avg = (key: keyof CharacterStats) =>
            sourceStats.reduce((sum, stats) => sum + stats[key], 0) / Math.max(1, sourceStats.length);
        const rounded = (value: number) => Math.floor(value * 10) / 10;

        const maxHp = Math.floor(max('maxHp') + avg('maxHp') * 0.22);
        const maxMp = Math.floor(max('maxMp') + avg('maxMp') * 0.22);
        return {
            hp: maxHp,
            maxHp,
            mp: maxMp,
            maxMp,
            atk: rounded(max('atk') + avg('atk') * 0.16),
            def: rounded(max('def') + avg('def') * 0.16),
            magAtk: rounded(max('magAtk') + avg('magAtk') * 0.16),
            magDef: rounded(max('magDef') + avg('magDef') * 0.16),
            spd: rounded(max('spd') + avg('spd') * 0.12),
            mov: baseMov,
            hitRate: Math.min(100, Math.floor(max('hitRate') + 5)),
            critRate: Math.min(50, Math.floor(max('critRate') + 3)),
            actionLimit: Math.floor(max('actionLimit') + 3),
            evasion: Math.min(60, Math.floor(max('evasion') + 3)),
            magHit: Math.min(100, Math.floor(max('magHit') + 5)),
            magEva: Math.min(60, Math.floor(max('magEva') + 3)),
            cmdRange: Math.floor(max('cmdRange') + 1),
            atkMod: rounded(max('atkMod')),
            defMod: rounded(max('defMod')),
        };
    }
}
