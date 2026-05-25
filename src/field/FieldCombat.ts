export function advanceAtb(current: number, speed: number, dt: number, scale: number = 10): number {
    if (current >= 100) return 100;
    return Math.min(100, current + Math.max(0, speed) * dt * scale);
}

export function resolveAggroState(
    wasAggro: boolean,
    distanceToTarget: number,
    enterRange: number,
    exitRange: number,
    leashExceeded: boolean = false
): boolean {
    if (leashExceeded) return false;
    if (wasAggro) return distanceToTarget <= exitRange;
    return distanceToTarget <= enterRange;
}

export interface AssistDecisionInput {
    isControlledTarget: boolean;
    targetIsAggro: boolean;
    targetDistanceToControlled: number;
    actorDistanceToControlled: number;
    assistLeash: number;
}

export function shouldAssistTarget(input: AssistDecisionInput): boolean {
    if (!input.isControlledTarget && !input.targetIsAggro) return false;
    if (input.targetDistanceToControlled > input.assistLeash) return false;
    return input.actorDistanceToControlled <= input.assistLeash + 2;
}
