import type { RestFacilityType } from '../../../data/RestFacilityData';

/** Emoji glyph for a rest facility type (mirrors the former canvas mapping). */
export function restIcon(type: RestFacilityType): string {
    switch (type) {
        case 'tavern': return '🍺';
        case 'tea_house': return '🍵';
        case 'shrine': return '⛩️';
        case 'barracks': return '🍛';
        case 'inn':
        default: return '🛏️';
    }
}
