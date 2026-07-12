import { getTownNameKey } from '../data/TownFacilityData';
import { t } from './LanguageManager';

export function formatTownName(townId: string): string {
    const key = getTownNameKey(townId);
    const label = t(key);
    return label === key ? townId : label;
}
