export const MOVE_AP_PER_TILE = 2;
export const ATTACK_AP_COST = 6;
export const INTERACT_AP_COST = 4;
export const MAGIC_AP_COST = 8;
export const MAX_WAIT_ATB_CARRYOVER = 50;

export type FieldApAction = 'attack' | 'interact' | 'magic' | 'rest' | 'wait' | 'defend' | 'counter';

export interface ExecutableActionState {
    remainingAp: number;
    hasReachableMove: boolean;
    hasAttackTarget: boolean;
    hasInteractTarget: boolean;
    hasMagicAvailable?: boolean;
}

export function getMoveApCost(pathTileCount: number): number {
    return Math.max(0, pathTileCount) * MOVE_AP_PER_TILE;
}

export function getActionApCost(action: FieldApAction): number {
    switch (action) {
        case 'attack': return ATTACK_AP_COST;
        case 'interact': return INTERACT_AP_COST;
        case 'magic': return MAGIC_AP_COST;
        case 'defend':
        case 'counter':
        case 'rest':
        case 'wait':
            return 0;
    }
}

export function getWaitAtbCarryover(remainingAp: number, actionLimit: number): number {
    if (remainingAp <= 0 || actionLimit <= 0) return 0;
    return Math.min(MAX_WAIT_ATB_CARRYOVER, Math.floor(MAX_WAIT_ATB_CARRYOVER * remainingAp / actionLimit));
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
        (state.remainingAp >= INTERACT_AP_COST && state.hasInteractTarget) ||
        (state.remainingAp >= MAGIC_AP_COST && Boolean(state.hasMagicAvailable))
    );
}
