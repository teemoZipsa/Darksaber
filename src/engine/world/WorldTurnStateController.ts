import { enqueueReadyActor as enqueueFieldReadyActor } from '../../field/FieldActionEconomy';
import type { FieldIntent } from '../../field/FieldTypes';

export class WorldTurnStateController {
    public activeTurnActorId: string | null = null;
    public readyQueue: string[] = [];
    public remainingActionPoints = 0;
    public majorActionUsedThisTurn = false;
    public reservedAction: FieldIntent | null = null;

    public clear(): void {
        this.activeTurnActorId = null;
        this.readyQueue = [];
        this.remainingActionPoints = 0;
        this.majorActionUsedThisTurn = false;
        this.reservedAction = null;
    }

    public clearActiveTurn(): void {
        this.activeTurnActorId = null;
        this.remainingActionPoints = 0;
        this.majorActionUsedThisTurn = false;
        this.reservedAction = null;
    }

    public setActiveTurn(actorId: string, remainingActionPoints: number, majorActionUsed = false): void {
        this.activeTurnActorId = actorId;
        this.remainingActionPoints = remainingActionPoints;
        this.majorActionUsedThisTurn = majorActionUsed;
        this.reservedAction = null;
    }

    public enqueueReadyActor(actorId: string): boolean {
        return enqueueFieldReadyActor(this.readyQueue, actorId);
    }

    public shiftReadyActorId(): string | null {
        return this.readyQueue.shift() ?? null;
    }

    public hasTurnActivity(): boolean {
        return this.activeTurnActorId !== null || this.readyQueue.length > 0 || this.reservedAction !== null;
    }

    public markMajorActionUsed(): void {
        if (this.activeTurnActorId) this.majorActionUsedThisTurn = true;
    }

    public spendAp(cost: number, fallbackGauge: number): boolean {
        if (this.remainingActionPoints <= 0) this.remainingActionPoints = fallbackGauge;
        if (cost < 0 || this.remainingActionPoints < cost) return false;
        this.remainingActionPoints -= cost;
        return true;
    }
}
