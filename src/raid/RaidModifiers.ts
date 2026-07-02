import { getItemDef, type ItemDef } from '../data/ItemDB';

export type RaidModifierId = 'night_raid' | 'dense_fog' | 'supply_drop';

export interface RaidModifier {
    id: RaidModifierId;
}

export interface RaidModifierEffects {
    partyAtbMultiplier: number;
    supplyDrop: boolean;
}

const RAID_MODIFIERS: RaidModifierId[] = ['night_raid', 'dense_fog', 'supply_drop'];

const EFFECTS: Record<RaidModifierId, RaidModifierEffects> = {
    night_raid: {
        partyAtbMultiplier: 0.94,
        supplyDrop: false,
    },
    dense_fog: {
        partyAtbMultiplier: 0.88,
        supplyDrop: false,
    },
    supply_drop: {
        partyAtbMultiplier: 1,
        supplyDrop: true,
    },
};

const SUPPLY_DROP_ITEM_IDS = ['herb_rare', 'mp_potion', 'repair_kit'] as const;

export function rollRaidModifier(seed: string | number): RaidModifier {
    const index = hashString(String(seed)) % RAID_MODIFIERS.length;
    return { id: RAID_MODIFIERS[index] };
}

export function sanitizeRaidModifier(value: unknown): RaidModifier | null {
    if (!value || typeof value !== 'object') return null;
    const id = (value as { id?: unknown }).id;
    if (id === 'night_raid' || id === 'dense_fog' || id === 'supply_drop') return { id };
    return null;
}

export function getRaidModifierEffects(modifier: RaidModifier | null | undefined): RaidModifierEffects {
    return modifier ? EFFECTS[modifier.id] : { partyAtbMultiplier: 1, supplyDrop: false };
}

export function getRaidModifierSupplyItems(): ItemDef[] {
    return SUPPLY_DROP_ITEM_IDS
        .map((itemId) => getItemDef(itemId))
        .filter((item): item is ItemDef => Boolean(item));
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0;
}
