/**
 * Stats — character stat type definitions.
 */

export interface CharacterStats {
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spd: number;     // affects turn order / AP charge speed
    mov: number;     // movement range in tiles (Manhattan distance)
    hitRate: number;  // base hit% (0-100)
    critRate: number; // base crit% (0-100)
    
    // Extended Stats for Classic UI
    actionLimit: number; // 행동제한
    evasion: number;     // 회피율
    magHit: number;      // 마법명중
    magEva: number;      // 마법회피
    cmdRange: number;    // 지휘범위
    atkMod: number;      // 공격수정
    defMod: number;      // 방어수정
}

/** Default starting stats for a level 1 character */
export function createBaseStats(overrides?: Partial<CharacterStats>): CharacterStats {
    return {
        hp: 100, maxHp: 100,
        mp: 30,  maxMp: 30,
        atk: 10, def: 5,
        magAtk: 5, magDef: 3,
        spd: 5, mov: 3,
        hitRate: 80, critRate: 5,
        actionLimit: 15, evasion: 10,
        magHit: 80, magEva: 5,
        cmdRange: 6, atkMod: 0, defMod: 0,
        ...overrides
    };
}

/** Get specific baseline stats for a class 1st tier */
export function getBaseStatsForClass(classId: string, baseMov: number): Partial<CharacterStats> {
    const map: Record<string, Partial<CharacterStats>> = {
        'infantry':  { hp: 110, maxHp: 110, mp: 10, maxMp: 10, atk: 12, def: 6, magAtk: 0 },
        'cavalry':   { hp: 100, maxHp: 100, mp: 10, maxMp: 10, atk: 14, def: 4, magAtk: 0 }, // mov: 5 from ClassTree
        'flying':    { hp: 80,  maxHp: 80,  mp: 10, maxMp: 10, atk: 13, def: 3, magAtk: 0 },
        'naval':     { hp: 120, maxHp: 120, mp: 15, maxMp: 15, atk: 11, def: 7, magAtk: 2 },
        'lancer':    { hp: 130, maxHp: 130, mp: 10, maxMp: 10, atk: 9,  def: 9, magAtk: 0 },
        'archer':    { hp: 70,  maxHp: 70,  mp: 20, maxMp: 20, atk: 10, def: 4, magAtk: 0, hitRate: 90 },
        'cleric':    { hp: 75,  maxHp: 75,  mp: 40, maxMp: 40, atk: 4,  def: 4, magAtk: 6, magDef: 7 },
        'priest':    { hp: 90,  maxHp: 90,  mp: 30, maxMp: 30, atk: 8,  def: 6, magAtk: 4, magDef: 5 },
        'mage':      { hp: 60,  maxHp: 60,  mp: 50, maxMp: 50, atk: 3,  def: 3, magAtk: 10, magDef: 6, cmdRange: 7 },
        'cultist':   { hp: 65,  maxHp: 65,  mp: 45, maxMp: 45, atk: 4,  def: 3, magAtk: 9, magDef: 5 },
        'shrine':    { hp: 85,  maxHp: 85,  mp: 35, maxMp: 35, atk: 6,  def: 6, magAtk: 7, magDef: 7 },
        'alchemist': { hp: 70,  maxHp: 70,  mp: 35, maxMp: 35, atk: 5,  def: 5, magAtk: 8, magDef: 5 }
    };
    const overrides = map[classId] || {};
    overrides.mov = baseMov; // Ensure MOV is set from ClassTree
    return overrides;
}

/** Per-level stat growth rates per class archetype */
export interface GrowthRates {
    hp: number;
    mp: number;
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spd: number;
}

export const GROWTH_MELEE: GrowthRates   = { hp: 12, mp: 2,  atk: 3, def: 2.5, magAtk: 0.5, magDef: 1, spd: 1.5 };
export const GROWTH_CAVALRY: GrowthRates = { hp: 11, mp: 2,  atk: 2.5, def: 2, magAtk: 0.5, magDef: 1, spd: 2 };
export const GROWTH_FLYING: GrowthRates  = { hp: 9,  mp: 3,  atk: 2, def: 1.5, magAtk: 1, magDef: 1.5, spd: 2.5 };
export const GROWTH_NAVAL: GrowthRates   = { hp: 11, mp: 3,  atk: 2.5, def: 2, magAtk: 1, magDef: 1.5, spd: 1.5 };
export const GROWTH_LANCE: GrowthRates   = { hp: 10, mp: 2,  atk: 2.5, def: 2, magAtk: 0.5, magDef: 1, spd: 1.5 };
export const GROWTH_ARCHER: GrowthRates  = { hp: 9,  mp: 2,  atk: 2, def: 1.5, magAtk: 0.5, magDef: 1, spd: 2 };
export const GROWTH_CLERIC: GrowthRates  = { hp: 8,  mp: 6,  atk: 1, def: 1, magAtk: 2.5, magDef: 2.5, spd: 1 };
export const GROWTH_PRIEST: GrowthRates  = { hp: 8,  mp: 5,  atk: 1.5, def: 1.5, magAtk: 2, magDef: 2, spd: 1.5 };
export const GROWTH_MAGE: GrowthRates    = { hp: 7,  mp: 7,  atk: 0.5, def: 0.5, magAtk: 3.5, magDef: 2, spd: 1 };
export const GROWTH_CULTIST: GrowthRates = { hp: 7.5, mp: 6.5, atk: 1, def: 1, magAtk: 3, magDef: 2.5, spd: 1.5 };
export const GROWTH_SHRINE: GrowthRates   = { hp: 8.5, mp: 5.5, atk: 1.5, def: 1.5, magAtk: 2, magDef: 2.5, spd: 1.5 };
export const GROWTH_ALCHEMIST: GrowthRates = { hp: 8, mp: 6, atk: 1, def: 1.5, magAtk: 2.5, magDef: 2, spd: 1.5 };
