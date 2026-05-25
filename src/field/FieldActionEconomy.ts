export const MOVE_AP_PER_TILE = 2;
export const ATTACK_AP_COST = 6;
export const INTERACT_AP_COST = 4;

export type FieldApAction = 'attack' | 'interact' | 'rest' | 'wait';

export interface ExecutableActionState {
    remainingAp: number;
    hasReachableMove: boolean;
    hasAttackTarget: boolean;
    hasInteractTarget: boolean;
}

export function getMoveApCost(pathTileCount: number): number {
    return Math.max(0, pathTileCount) * MOVE_AP_PER_TILE;
}

export function getActionApCost(action: FieldApAction): number {
    switch (action) {
        case 'attack': return ATTACK_AP_COST;
        case 'interact': return INTERACT_AP_COST;
        case 'rest':
        case 'wait':
            return 0;
    }
}

export function enqueueReadyActor(queue: string[], actorId: string): boolean {
    if (queue.includes(actorId)) return false;
    queue.push(actorId);
    return true;
}

export function hasExecutableFieldAction(state: ExecutableActionState): boolean {
    return (
        (state.remainingAp >= MOVE_AP_PER_TILE && state.hasReachableMove) ||
        (state.remainingAp >= ATTACK_AP_COST && state.hasAttackTarget) ||
        (state.remainingAp >= INTERACT_AP_COST && state.hasInteractTarget)
    );
}
