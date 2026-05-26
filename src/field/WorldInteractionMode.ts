export type WorldInteractionMode =
    | { kind: 'idle' }
    | { kind: 'actionMenu' }
    | { kind: 'tacticalMenu' }
    | { kind: 'actionTargeting'; action: 'move' | 'attack' | 'interact' }
    | { kind: 'magicTargeting' }
    | { kind: 'reservedAction' };

export type RightClickDisposition =
    | 'openTacticalMenu'
    | 'reopenTacticalMenu'
    | 'cancelTargeting'
    | 'ignore';

export function getRightClickDisposition(mode: WorldInteractionMode): RightClickDisposition {
    switch (mode.kind) {
        case 'actionTargeting':
        case 'magicTargeting':
            return 'cancelTargeting';
        case 'tacticalMenu':
            return 'reopenTacticalMenu';
        case 'reservedAction':
            return 'ignore';
        case 'idle':
        case 'actionMenu':
            return 'openTacticalMenu';
    }
}
