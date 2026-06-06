import { FIELD_MAX_ACTION_GAUGE, enqueueReadyActor as enqueueFieldReadyActor } from '../../field/FieldActionEconomy';
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

    public endActiveTurn(): void {
        this.clearActiveTurn();
    }

    public setActiveTurn(actorId: string, remainingActionPoints: number, majorActionUsed = false): void {
        this.activeTurnActorId = actorId;
        this.remainingActionPoints = remainingActionPoints;
        this.majorActionUsedThisTurn = majorActionUsed;
        this.reservedAction = null;
    }

    public getActiveTurnActorId(): string | null {
        return this.activeTurnActorId;
    }

    public setActiveTurnActorId(actorId: string | null): void {
        this.activeTurnActorId = actorId;
    }

    public getRemainingActionPoints(): number {
        return this.remainingActionPoints;
    }

    public setRemainingActionPoints(points: number): void {
        this.remainingActionPoints = points;
    }

    public getMajorActionUsedThisTurn(): boolean {
        return this.majorActionUsedThisTurn;
    }

    public setMajorActionUsedThisTurn(used: boolean): void {
        this.majorActionUsedThisTurn = used;
    }

    public getReservedAction(): FieldIntent | null {
        return this.reservedAction;
    }

    public setReservedAction(intent: FieldIntent | null): void {
        this.reservedAction = intent;
    }

    public beginActorTurn(actorId: string): number {
        this.setActiveTurn(actorId, FIELD_MAX_ACTION_GAUGE);
        return this.remainingActionPoints;
    }

    public beginEnemyTurn(enemyId: string): void {
        this.setActiveTurn(enemyId, 0);
    }

    public clearInvalidActiveTurn(isActiveTurnValid: (actorId: string) => boolean): boolean {
        if (!this.activeTurnActorId) return false;
        if (isActiveTurnValid(this.activeTurnActorId)) return false;
        this.clearActiveTurn();
        return true;
    }

    public enqueueReadyActor(actorId: string): boolean {
        return enqueueFieldReadyActor(this.readyQueue, actorId);
    }

    public hasReadyActors(): boolean {
        return this.readyQueue.length > 0;
    }

    public shiftReadyActorId(): string | null {
        return this.readyQueue.shift() ?? null;
    }

    public isReadyTurnBlocked(): boolean {
        return this.activeTurnActorId !== null || this.reservedAction !== null;
    }

    public hasTurnActivity(): boolean {
        return this.activeTurnActorId !== null || this.readyQueue.length > 0 || this.reservedAction !== null;
    }

    public getDismissCarryover(): number {
        return this.remainingActionPoints >= FIELD_MAX_ACTION_GAUGE ? 0 : this.remainingActionPoints;
    }

    public markMajorActionUsed(): void {
        if (this.activeTurnActorId) this.majorActionUsedThisTurn = true;
    }

    public isMajorActionUsed(): boolean {
        return this.majorActionUsedThisTurn;
    }

    public spendAp(cost: number, fallbackGauge: number): boolean {
        if (this.remainingActionPoints <= 0) this.remainingActionPoints = fallbackGauge;
        if (cost < 0 || this.remainingActionPoints < cost) return false;
        this.remainingActionPoints -= cost;
        return true;
    }
}
