import { getItemDef, type ItemDef } from './ItemDB';

export type FacilityUpgradeId = 'infirmary' | 'workshop';

export interface FacilityUpgradeCostItem {
    itemId: string;
    quantity: number;
}

export interface FacilityUpgradeTier {
    level: number;
    gold: number;
    items: FacilityUpgradeCostItem[];
    effectValue: number;
}

export interface FacilityUpgradeDefinition {
    id: FacilityUpgradeId;
    nameKey: string;
    descKey: string;
    effectKey: string;
    maxLevel: number;
    tiers: FacilityUpgradeTier[];
}

export type FacilityUpgradeState = Partial<Record<FacilityUpgradeId, number>>;

export const FACILITY_UPGRADES: Record<FacilityUpgradeId, FacilityUpgradeDefinition> = {
    infirmary: {
        id: 'infirmary',
        nameKey: 'facility.infirmary.name',
        descKey: 'facility.infirmary.desc',
        effectKey: 'facility.infirmary.effect',
        maxLevel: 2,
        tiers: [
            {
                level: 1,
                gold: 450,
                items: [{ itemId: 'herb_common', quantity: 2 }],
                effectValue: 0.8,
            },
            {
                level: 2,
                gold: 900,
                items: [
                    { itemId: 'herb_rare', quantity: 1 },
                    { itemId: 'trade_mooncap_mushroom', quantity: 1 },
                ],
                effectValue: 0.65,
            },
        ],
    },
    workshop: {
        id: 'workshop',
        nameKey: 'facility.workshop.name',
        descKey: 'facility.workshop.desc',
        effectKey: 'facility.workshop.effect',
        maxLevel: 2,
        tiers: [
            {
                level: 1,
                gold: 500,
                items: [{ itemId: 'repair_kit', quantity: 1 }],
                effectValue: 0.85,
            },
            {
                level: 2,
                gold: 1000,
                items: [
                    { itemId: 'trade_sun_ore', quantity: 1 },
                    { itemId: 'trade_imported_silk', quantity: 1 },
                ],
                effectValue: 0.7,
            },
        ],
    },
};

export function getFacilityUpgradeDefinitions(): FacilityUpgradeDefinition[] {
    return Object.values(FACILITY_UPGRADES);
}

export function normalizeFacilityUpgradeState(value: unknown): FacilityUpgradeState {
    if (!value || typeof value !== 'object') return {};
    const source = value as Record<string, unknown>;
    const result: FacilityUpgradeState = {};
    for (const definition of getFacilityUpgradeDefinitions()) {
        const raw = source[definition.id];
        const level = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
        result[definition.id] = Math.max(0, Math.min(definition.maxLevel, level));
    }
    return result;
}

export function getFacilityUpgradeLevel(state: FacilityUpgradeState, id: FacilityUpgradeId): number {
    const definition = FACILITY_UPGRADES[id];
    const level = state[id] ?? 0;
    return Math.max(0, Math.min(definition.maxLevel, Math.floor(level)));
}

export function getNextFacilityUpgradeTier(
    state: FacilityUpgradeState,
    id: FacilityUpgradeId
): FacilityUpgradeTier | null {
    const definition = FACILITY_UPGRADES[id];
    const nextLevel = getFacilityUpgradeLevel(state, id) + 1;
    return definition.tiers.find((tier) => tier.level === nextLevel) ?? null;
}

export function getInjuryTreatmentCostMultiplier(state: FacilityUpgradeState): number {
    return getFacilityTierEffect(state, 'infirmary', 1);
}

export function getWorkshopCostMultiplier(state: FacilityUpgradeState): number {
    return getFacilityTierEffect(state, 'workshop', 1);
}

export function applyFacilityCostMultiplier(cost: number, multiplier: number): number {
    const value = Math.max(0, Math.floor(cost));
    if (value <= 0) return 0;
    return Math.max(1, Math.ceil(value * Math.max(0, multiplier)));
}

export function getFacilityCostItemName(itemId: string): string {
    const item = getItemDef(itemId);
    return item ? item.nameKr : itemId;
}

export function getFacilityCostItemDef(itemId: string): ItemDef | null {
    return getItemDef(itemId) ?? null;
}

function getFacilityTierEffect(state: FacilityUpgradeState, id: FacilityUpgradeId, fallback: number): number {
    const level = getFacilityUpgradeLevel(state, id);
    if (level <= 0) return fallback;
    return FACILITY_UPGRADES[id].tiers.find((tier) => tier.level === level)?.effectValue ?? fallback;
}
