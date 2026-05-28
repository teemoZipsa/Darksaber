import type { EnemyRole } from './EnemyAI';
import type { TacticalMarker } from './TacticalMarkers';

export function formatRaidTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function getEnemyRoleLabel(role: EnemyRole): string {
    switch (role) {
        case 'tank': return '탱커형 몬스터';
        case 'archer': return '궁수형 몬스터';
        case 'healer': return '힐러형 몬스터';
        case 'coward': return '도망형 몬스터';
        case 'support': return '지원형 몬스터';
        case 'boss': return '보스 몬스터';
        case 'bruiser':
        default:
            return '근접형 몬스터';
    }
}

export function getCombatLogColor(line: string): string {
    if (line.includes('처치') || line.includes('치명')) return '#ffd15f';
    if (line.includes('피해') || line.includes('약화') || line.includes('독')) return '#ff8a8a';
    if (line.includes('회복') || line.includes('강화') || line.includes('방어')) return '#9dffb0';
    if (line.includes('명중 실패') || line.includes('빗나감')) return '#d9d9e8';
    if (line.includes('턴 시작') || line.includes('READY')) return '#88ddff';
    return 'rgba(255,255,255,0.78)';
}

export function getTacticalMarkerColor(marker: TacticalMarker): string {
    if (marker.kind === 'rally') return 'rgba(80, 255, 160, 0.95)';
    if (marker.targetKind === 'enemy') return 'rgba(255, 78, 78, 0.95)';
    if (marker.targetKind === 'loot') return 'rgba(255, 220, 74, 0.95)';
    if (marker.targetKind === 'party') return 'rgba(82, 246, 255, 0.95)';
    if (marker.targetKind === 'blocked') return 'rgba(255, 115, 90, 0.88)';
    return 'rgba(240, 192, 80, 0.95)';
}
