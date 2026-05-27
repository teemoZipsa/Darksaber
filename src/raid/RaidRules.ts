export interface RaidTimerGate {
    raidActive: boolean;
    townVisible: boolean;
    resultVisible: boolean;
    turnCombatActive: boolean;
}

export type TownArrivalKind = 'none' | 'departureBlocked' | 'survived';

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
