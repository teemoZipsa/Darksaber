/**
 * TurnManager — AP-based turn queue system.
 * Each entity has Action Points that charge over time.
 * When AP reaches max, the entity can take actions (move, attack, skill, wait).
 */

import { Entity } from '../entity/Entity';

export interface TurnEntity {
    entity: Entity;
    currentAP: number;
    maxAP: number;
    apChargeRate: number;  // AP gained per tick (based on SPD stat)
    isPlayerControlled: boolean;
}

export type TurnPhase = 'charging' | 'acting' | 'animating';

export class TurnManager {
    private entities: TurnEntity[] = [];
    private activeEntity: TurnEntity | null = null;
    private phase: TurnPhase = 'charging';
    private turnCount: number = 0;

    /** Register an entity in the turn queue */
    public addEntity(entity: Entity, maxAP: number, chargeRate: number, isPlayer: boolean): void {
        this.entities.push({
            entity, currentAP: 0, maxAP, apChargeRate: chargeRate,
            isPlayerControlled: isPlayer
        });
    }

    /** Remove an entity from the turn queue (on death) */
    public removeEntity(entityId: string): void {
        this.entities = this.entities.filter(e => e.entity.id !== entityId);
        if (this.activeEntity?.entity.id === entityId) {
            this.activeEntity = null;
            this.phase = 'charging';
        }
    }

    /** Get the currently active entity (null if still charging) */
    public getActiveEntity(): TurnEntity | null {
        return this.activeEntity;
    }

    public getPhase(): TurnPhase {
        return this.phase;
    }

    public getTurnCount(): number {
        return this.turnCount;
    }

    /**
     * Advance the turn system by one tick.
     * During 'charging', all entities accumulate AP.
     * The first entity to reach max AP becomes the active entity.
     */
    public tick(): void {
        if (this.phase !== 'charging') return;

        // Charge all entities
        for (const te of this.entities) {
            te.currentAP = Math.min(te.currentAP + te.apChargeRate, te.maxAP);

            if (te.currentAP >= te.maxAP && !this.activeEntity) {
                this.activeEntity = te;
                this.phase = 'acting';
                this.turnCount++;
            }
        }
    }

    /**
     * End the current entity's turn. Resets their AP and returns to charging.
     */
    public endTurn(): void {
        if (this.activeEntity) {
            this.activeEntity.currentAP = 0;
            this.activeEntity = null;
        }
        this.phase = 'charging';
    }

    /** Get all entities sorted by AP (highest first) */
    public getQueue(): TurnEntity[] {
        return [...this.entities].sort((a, b) => b.currentAP - a.currentAP);
    }
}
