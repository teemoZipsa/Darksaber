export const FIELD_MAX_ACTION_GAUGE = 100;
export const MOVE_ACTION_GAUGE_COST = 20;
export const ATTACK_ACTION_GAUGE_COST = 25;
export const INTERACT_ACTION_GAUGE_COST = 15;
export const DEFEND_ACTION_GAUGE_COST = 20;
export const REST_ACTION_GAUGE_COST = 20;
export const MAGIC_ACTION_GAUGE_COST = 30;
export const TOOL_ACTION_GAUGE_COST = 25;
export const MIN_FIELD_ACTION_GAUGE_COST = Math.min(
    MOVE_ACTION_GAUGE_COST,
    ATTACK_ACTION_GAUGE_COST,
    INTERACT_ACTION_GAUGE_COST,
    DEFEND_ACTION_GAUGE_COST,
    REST_ACTION_GAUGE_COST,
    MAGIC_ACTION_GAUGE_COST,
    TOOL_ACTION_GAUGE_COST
);

export const FIELD_ACTION_COST = MIN_FIELD_ACTION_GAUGE_COST;
export const MOVE_AP_PER_TILE = 1;
export const ATTACK_AP_COST = ATTACK_ACTION_GAUGE_COST;
export const INTERACT_AP_COST = INTERACT_ACTION_GAUGE_COST;
export const MAGIC_AP_COST = MAGIC_ACTION_GAUGE_COST;
const TOOL_AP_COST = TOOL_ACTION_GAUGE_COST;

export type FieldApAction = 'move' | 'attack' | 'interact' | 'magic' | 'tool' | 'rest' | 'defend';

export interface ExecutableActionState {
    remainingAp: number;
    hasReachableMove: boolean;
    hasAttackTarget: boolean;
    hasInteractTarget: boolean;
    hasMagicAvailable?: boolean;
    hasToolAvailable?: boolean;
}

export function getMoveApCost(pathTileCount: number): number {
    return pathTileCount > 0 ? MOVE_ACTION_GAUGE_COST : 0;
}

export function getActionApCost(action: FieldApAction): number {
    switch (action) {
        case 'move': return MOVE_ACTION_GAUGE_COST;
        case 'attack': return ATTACK_AP_COST;
        case 'interact': return INTERACT_AP_COST;
        case 'magic': return MAGIC_AP_COST;
        case 'tool': return TOOL_AP_COST;
        case 'defend': return DEFEND_ACTION_GAUGE_COST;
        case 'rest': return REST_ACTION_GAUGE_COST;
    }
}

export function enqueueReadyActor(queue: string[], actorId: string): boolean {
    if (queue.includes(actorId)) return false;
    queue.push(actorId);
    return true;
}

export function hasExecutableFieldAction(state: ExecutableActionState): boolean {
    const remaining = state.remainingAp;
    return (state.hasReachableMove && remaining >= MOVE_ACTION_GAUGE_COST)
        || (state.hasAttackTarget && remaining >= ATTACK_ACTION_GAUGE_COST)
        || (state.hasInteractTarget && remaining >= INTERACT_ACTION_GAUGE_COST)
        || (state.hasMagicAvailable === true && remaining >= MAGIC_ACTION_GAUGE_COST)
        || (state.hasToolAvailable === true && remaining >= TOOL_ACTION_GAUGE_COST)
        || remaining >= DEFEND_ACTION_GAUGE_COST
        || remaining >= REST_ACTION_GAUGE_COST;
}
