import { shouldAdvanceRaidTimer } from '../../raid/RaidRules';

export type WorldPhase = 'town' | 'raid' | 'lobby';

export interface RaidTimerGates {
    townVisible: boolean;
    resultVisible: boolean;
    turnCombatActive: boolean;
}

export interface RaidTimerAdvanceResult {
    advanced: boolean;
    expired: boolean;
}

export class WorldRaidSession {
    public currentHubTownId: string;
    public departureTownId: string;
    public elapsedSeconds = 0;
    public readonly limitSeconds: number;
    public active = false;
    public kills = 0;
    public readonly downedCharacterIds: Set<string> = new Set();
    private pendingTownAfterResultId: string | null = null;
    private lastDepartureBlockTownId: string | null = null;

    constructor(initialHubTownId: string, limitSeconds: number = 30 * 60) {
        this.currentHubTownId = initialHubTownId;
        this.departureTownId = initialHubTownId;
        this.limitSeconds = limitSeconds;
    }

    public enterTown(townId: string): void {
        this.active = false;
        this.currentHubTownId = townId;
    }

    public beginRaidFromTown(townId: string): void {
        this.departureTownId = townId;
        this.elapsedSeconds = 0;
        this.active = true;
        this.kills = 0;
        this.downedCharacterIds.clear();
        this.lastDepartureBlockTownId = null;
        this.pendingTownAfterResultId = null;
    }

    public shouldAdvanceTimer(gates: RaidTimerGates): boolean {
        return shouldAdvanceRaidTimer({
            raidActive: this.active,
            townVisible: gates.townVisible,
            resultVisible: gates.resultVisible,
            turnCombatActive: gates.turnCombatActive,
        });
    }

    public advanceTimer(dt: number, gates: RaidTimerGates): RaidTimerAdvanceResult {
        if (!this.shouldAdvanceTimer(gates)) return { advanced: false, expired: false };
        this.elapsedSeconds += dt;
        if (this.elapsedSeconds >= this.limitSeconds) {
            this.elapsedSeconds = this.limitSeconds;
            return { advanced: true, expired: true };
        }
        return { advanced: true, expired: false };
    }

    public completeAtTown(townId: string): void {
        this.active = false;
        this.currentHubTownId = townId;
    }

    public failBackToTown(townId: string): void {
        this.active = false;
        this.currentHubTownId = townId;
    }

    public recordKill(): void {
        if (this.active) this.kills += 1;
    }

    public recordCharacterDown(characterId: string): void {
        this.downedCharacterIds.add(characterId);
    }

    public clearDepartureBlock(): void {
        this.lastDepartureBlockTownId = null;
    }

    public shouldReportDepartureBlock(townId: string | null | undefined): boolean {
        const normalized = townId ?? null;
        if (this.lastDepartureBlockTownId === normalized) return false;
        this.lastDepartureBlockTownId = normalized;
        return true;
    }

    public setPendingTownAfterResult(townId: string): void {
        this.pendingTownAfterResultId = townId;
    }

    public consumePendingTownAfterResultId(): string | null {
        const townId = this.pendingTownAfterResultId;
        this.pendingTownAfterResultId = null;
        return townId;
    }
}
