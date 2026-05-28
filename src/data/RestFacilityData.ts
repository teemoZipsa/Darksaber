import type { StatusActivation, StatusKind } from '../combat/StatusEffects';

export type RestFacilityType = 'inn' | 'tavern' | 'tea_house' | 'shrine' | 'barracks';

export interface RestMenuBuff {
    kind: StatusKind;
    magnitude: number;
    activation: StatusActivation;
    durationSeconds?: number;
    icon: string;
}

export interface RestMenu {
    id: string;
    nameKey: string;
    descKey: string;
    price: number;
    buffs: RestMenuBuff[];
}

export interface RestFacility {
    type: RestFacilityType;
    nameKey: string;
    menu: RestMenu[];
}

export const INJURY_TREATMENT_PRICE = 50;

export const REST_FACILITIES: Record<string, RestFacility | null> = {
    central_castle: {
        type: 'barracks',
        nameKey: 'rest.facility.central_barracks',
        menu: [
            {
                id: 'meat_plate',
                nameKey: 'rest.menu.meat_plate',
                descKey: 'rest.desc.meat_plate',
                price: 30,
                buffs: [{ kind: 'attackUp', magnitude: 1.1, activation: 'on_raid_start', durationSeconds: 300, icon: '🍖' }],
            },
            {
                id: 'shield_stew',
                nameKey: 'rest.menu.shield_stew',
                descKey: 'rest.desc.shield_stew',
                price: 80,
                buffs: [{ kind: 'damageTakenDown', magnitude: 0.9, activation: 'on_raid_start', durationSeconds: 300, icon: '🍲' }],
            },
        ],
    },
    w_forest_village: {
        type: 'inn',
        nameKey: 'rest.facility.forest_inn',
        menu: [
            {
                id: 'smoked_venison',
                nameKey: 'rest.menu.smoked_venison',
                descKey: 'rest.desc.smoked_venison',
                price: 40,
                buffs: [{ kind: 'critUp', magnitude: 10, activation: 'on_raid_start', durationSeconds: 300, icon: '🥩' }],
            },
            {
                id: 'hearty_breakfast',
                nameKey: 'rest.menu.hearty_breakfast',
                descKey: 'rest.desc.hearty_breakfast',
                price: 25,
                buffs: [{ kind: 'maxHpUp', magnitude: 1.1, activation: 'immediate', icon: '🍳' }],
            },
        ],
    },
    nw_desert_city: {
        type: 'tea_house',
        nameKey: 'rest.facility.desert_tea_house',
        menu: [
            {
                id: 'spiced_tea',
                nameKey: 'rest.menu.spiced_tea',
                descKey: 'rest.desc.spiced_tea',
                price: 35,
                buffs: [{ kind: 'maxMpUp', magnitude: 1.1, activation: 'immediate', icon: '🍵' }],
            },
        ],
    },
    sw_hideout: {
        type: 'tavern',
        nameKey: 'rest.facility.hideout_tavern',
        menu: [
            {
                id: 'hard_liquor',
                nameKey: 'rest.menu.hard_liquor',
                descKey: 'rest.desc.hard_liquor',
                price: 35,
                buffs: [
                    { kind: 'evasionUp', magnitude: 10, activation: 'on_raid_start', durationSeconds: 300, icon: '🍺' },
                    { kind: 'hitDown', magnitude: 5, activation: 'on_raid_start', durationSeconds: 300, icon: '🍺' },
                ],
            },
        ],
    },
    s_coast_town: {
        type: 'inn',
        nameKey: 'rest.facility.coast_inn',
        menu: [
            {
                id: 'seafood_stew',
                nameKey: 'rest.menu.seafood_stew',
                descKey: 'rest.desc.seafood_stew',
                price: 80,
                buffs: [{ kind: 'damageTakenDown', magnitude: 0.9, activation: 'on_raid_start', durationSeconds: 300, icon: '🦐' }],
            },
        ],
    },
    e_outpost: null,
    e_stronghold: {
        type: 'barracks',
        nameKey: 'rest.facility.stronghold_barracks',
        menu: [
            {
                id: 'barracks_meal',
                nameKey: 'rest.menu.barracks_meal',
                descKey: 'rest.desc.barracks_meal',
                price: 45,
                buffs: [{ kind: 'defenseUp', magnitude: 1.1, activation: 'on_raid_start', durationSeconds: 300, icon: '🍛' }],
            },
        ],
    },
    se_port: {
        type: 'tavern',
        nameKey: 'rest.facility.port_tavern',
        menu: [
            {
                id: 'sailor_soup',
                nameKey: 'rest.menu.sailor_soup',
                descKey: 'rest.desc.sailor_soup',
                price: 35,
                buffs: [{ kind: 'speedUp', magnitude: 1.1, activation: 'on_raid_start', durationSeconds: 600, icon: '🍜' }],
            },
        ],
    },
};

export function getRestFacility(townId: string): RestFacility | null {
    return REST_FACILITIES[townId] ?? null;
}

export function getRestMenu(menuId: string): RestMenu | null {
    for (const facility of Object.values(REST_FACILITIES)) {
        const found = facility?.menu.find((menu) => menu.id === menuId);
        if (found) return found;
    }
    return null;
}

export function getRestMenuFacility(menuId: string): RestFacility | null {
    for (const facility of Object.values(REST_FACILITIES)) {
        if (facility?.menu.some((menu) => menu.id === menuId)) return facility;
    }
    return null;
}
