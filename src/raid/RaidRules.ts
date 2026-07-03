export interface RaidTimerGate {
    raidActive: boolean;
    townVisible: boolean;
    resultVisible: boolean;
    turnCombatActive: boolean;
}

export type TownArrivalKind = 'none' | 'departureBlocked' | 'survived';
export type RaidLeaveReason = 'town' | 'wipe' | 'manual';
export type RaidCompletionResult = 'SURVIVED' | 'DEAD' | 'MIA' | 'LEFT';

export interface TownArrivalResult {
    kind: TownArrivalKind;
    townId?: string;
}

export function shouldAdvanceRaidTimer(gate: RaidTimerGate): boolean {
    return gate.raidActive && !gate.townVisible && !gate.resultVisible && !gate.turnCombatActive;
}

export function resolveTownArrival(
    townId: string | null | undefined,
    departureTownId: string | null | undefined,
    raidActive: boolean
): TownArrivalResult {
    if (!raidActive || !townId) return { kind: 'none' };
    if (townId === departureTownId) return { kind: 'departureBlocked', townId };
    return { kind: 'survived', townId };
}

export function coerceRaidResultForTownArrival(
    requestedResult: RaidCompletionResult,
    townId: string | null | undefined,
    departureTownId: string | null | undefined,
    raidActive: boolean
): RaidCompletionResult {
    if (requestedResult !== 'SURVIVED') return requestedResult;
    return resolveTownArrival(townId, departureTownId, raidActive).kind === 'survived'
        ? 'SURVIVED'
        : 'LEFT';
}

export function resolveRaidLeaveResult(
    reason: RaidLeaveReason,
    townId: string | null | undefined,
    departureTownId: string | null | undefined,
    raidActive: boolean
): RaidCompletionResult {
    if (reason === 'wipe') return 'DEAD';
    if (reason !== 'town') return 'LEFT';
    return coerceRaidResultForTownArrival('SURVIVED', townId, departureTownId, raidActive);
}
