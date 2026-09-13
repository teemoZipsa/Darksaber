import { getClassLine } from '../data/ClassTree';
import type { ItemDef } from '../data/ItemDB';

export interface EquipmentWearer {
    level: number;
    currentTier: number;
    classLineId: string;
}

export function getEquipmentRequirementFailure(item: ItemDef, wearer: EquipmentWearer): 'level' | 'tier' | 'branch' | null {
    if (item.requiredLevel !== undefined && wearer.level < item.requiredLevel) return 'level';
    if (item.requiredTier !== undefined && wearer.currentTier < item.requiredTier) return 'tier';
    if (item.branch !== undefined && getClassLine(wearer.classLineId)?.branch !== item.branch) return 'branch';
    return null;
}
