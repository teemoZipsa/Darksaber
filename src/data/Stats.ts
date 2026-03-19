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
        ...overrides
    };
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
