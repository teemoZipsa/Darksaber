export const MOVE_AP_PER_TILE = 2;
export const ATTACK_AP_COST = 6;
export const INTERACT_AP_COST = 0;
export const MAGIC_AP_COST = 8;
const TOOL_AP_COST = 4;

export type FieldApAction = 'attack' | 'interact' | 'magic' | 'tool' | 'rest' | 'defend';

export interface ExecutableActionState {
    remainingAp: number;
    hasReachableMove: boolean;
    hasAttackTarget: boolean;
    hasInteractTarget: boolean;
    hasMagicAvailable?: boolean;
    hasToolAvailable?: boolean;
}

export function getMoveApCost(pathTileCount: number): number {
    return Math.max(0, pathTileCount) * MOVE_AP_PER_TILE;
}

export function getActionApCost(action: FieldApAction): number {
    switch (action) {
        case 'attack': return ATTACK_AP_COST;
        case 'interact': return INTERACT_AP_COST;
        case 'magic': return MAGIC_AP_COST;
        case 'tool': return TOOL_AP_COST;
        case 'defend':
        case 'rest':
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
        (state.remainingAp >= MAGIC_AP_COST && Boolean(state.hasMagicAvailable)) ||
        (state.remainingAp >= getActionApCost('tool') && Boolean(state.hasToolAvailable))
    );
}
