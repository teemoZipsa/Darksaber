import type { EnemyRole } from './EnemyAI';
import type { TacticalMarker } from './TacticalMarkers';
import { t } from '../i18n/LanguageManager';

export function formatRaidTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function getEnemyRoleLabel(role: EnemyRole): string {
    switch (role) {
        case 'tank': return t('field.enemyRole.tank');
        case 'archer': return t('field.enemyRole.archer');
        case 'healer': return t('field.enemyRole.healer');
        case 'coward': return t('field.enemyRole.coward');
        case 'support': return t('field.enemyRole.support');
        case 'boss': return t('field.enemyRole.boss');
        case 'bruiser':
        default:
            return t('field.enemyRole.bruiser');
    }
}

export function getCombatLogColor(line: string): string {
    if (matchesAnyLocalizedKeyword(line, 'field.logColor.gold')) return '#ffd15f';
    if (matchesAnyLocalizedKeyword(line, 'field.logColor.danger')) return '#ff8a8a';
    if (matchesAnyLocalizedKeyword(line, 'field.logColor.support')) return '#9dffb0';
    if (matchesAnyLocalizedKeyword(line, 'field.logColor.miss')) return '#d9d9e8';
    if (matchesAnyLocalizedKeyword(line, 'field.logColor.ready')) return '#88ddff';
    return 'rgba(255,255,255,0.78)';
}

function matchesAnyLocalizedKeyword(line: string, key: string): boolean {
    return t(key).split('|').some((keyword) => keyword.length > 0 && line.includes(keyword));
}

export function getTacticalMarkerColor(marker: TacticalMarker): string {
    if (marker.kind === 'rally') return 'rgba(80, 255, 160, 0.95)';
    if (marker.targetKind === 'enemy') return 'rgba(255, 78, 78, 0.95)';
    if (marker.targetKind === 'loot') return 'rgba(255, 220, 74, 0.95)';
    if (marker.targetKind === 'party') return 'rgba(82, 246, 255, 0.95)';
    if (marker.targetKind === 'blocked') return 'rgba(255, 115, 90, 0.88)';
    return 'rgba(240, 192, 80, 0.95)';
}
