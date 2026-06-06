import { getClassLine } from './ClassTree';

export const STARTER_WEAPON_ITEM_ID = 'short_sword';
export const STARTER_CONSUMABLE_ITEM_IDS = ['herb_cheap', 'herb_cheap', 'mp_potion'] as const;

export function getStarterBodyArmorId(classLineId: string): string {
    const branch = getClassLine(classLineId)?.branch ?? 'battle';
    return `${branch}_t1_body`;
}
