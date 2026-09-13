import { findPath, manhattan, sameTile, type FieldPassable, type TilePoint } from './FieldPathing';
import { MOVE_ACTION_GAUGE_COST } from './FieldActionEconomy';

export const MAX_TRAVEL_DISTANCE = 128;
export const FIELD_TRAVEL_STATUSES = ['idle', 'moving', 'waiting', 'arrived', 'danger', 'blocked', 'cancelled'] as const;
export type TravelStatus = typeof FIELD_TRAVEL_STATUSES[number];

export interface TravelActor {
    id: string;
    tile: TilePoint;
    movementBudget: number;
    ap: number;
}

export interface FieldTravelContext {
    canTravel(): boolean;
    hasThreat(): boolean;
    getActor(): TravelActor | null;
    isBusy(): boolean;
    isPassable: FieldPassable;
    stepCost(tile: TilePoint): number;
    move(tile: TilePoint): boolean;
    wait(): void;
    onStatus(status: TravelStatus): void;
}

/** A travel order submits ordinary, bounded AP moves. It never changes actor
 * positions, grants AP, or bypasses the server's movement/path validation. */
export class FieldTravel {
    public status: TravelStatus = 'idle';
    public destination: TilePoint | null = null;
    private route: TilePoint[] = [];
    private pending: TilePoint | null = null;
    private pendingSeconds = 0;

    public constructor(private readonly context: FieldTravelContext) {}

    public get active(): boolean { return this.destination !== null; }
    public getPath(): TilePoint[] { return this.route; }

    public start(destination: TilePoint): boolean {
        const actor = this.context.getActor();
        if (!actor || !this.context.canTravel() || this.context.hasThreat()) return false;
        if (this.context.isBusy()) return false;
        if (manhattan(actor.tile, destination) > MAX_TRAVEL_DISTANCE) {
            this.stop('blocked');
            return true;
        }
        this.destination = { ...destination };
        this.pending = null;
        this.pendingSeconds = 0;
        this.route = findPath(actor.tile, destination, this.context.isPassable, {
            actorId: actor.id, maxNodes: 8000, maxDistance: MAX_TRAVEL_DISTANCE + 16,
        });
        if (!this.route.length) this.stop(sameTile(actor.tile, destination) ? 'arrived' : 'blocked');
        else this.setStatus('moving');
        return true;
    }

    public stop(status: TravelStatus = 'cancelled'): void {
        this.destination = null;
        this.route = [];
        this.pending = null;
        this.pendingSeconds = 0;
        this.setStatus(status);
    }

    public update(dt: number): void {
        if (!this.destination) return;
        if (!this.context.canTravel()) { this.stop(); return; }
        // Check before every leg, including while waiting for AP or a snapshot.
        if (this.context.hasThreat()) { this.stop('danger'); return; }
        const actor = this.context.getActor();
        if (!actor) { this.stop(); return; }
        if (this.pending) {
            this.pendingSeconds += dt;
            if (this.pendingSeconds > 8) { this.stop('blocked'); return; }
            if (this.context.isBusy() || !sameTile(actor.tile, this.pending)) return;
            this.pending = null;
        }
        if (this.context.isBusy()) return;
        if (sameTile(actor.tile, this.destination)) { this.stop('arrived'); return; }
        if (actor.ap < MOVE_ACTION_GAUGE_COST) {
            this.setStatus('waiting');
            this.context.wait();
            return;
        }
        const reached = this.route.findIndex((tile) => sameTile(tile, actor.tile));
        if (reached >= 0) this.route = this.route.slice(reached + 1);
        if (!this.route.length || manhattan(actor.tile, this.route[0]) !== 1) {
            this.stop('blocked');
            return;
        }
        let cost = 0;
        let target: TilePoint | null = null;
        for (const tile of this.route) {
            if (!this.context.isPassable({ ...tile, actorId: actor.id, intent: 'move', goal: this.destination })) break;
            const step = this.context.stepCost(tile);
            if (!Number.isFinite(step) || step <= 0 || cost + step > actor.movementBudget + 1e-9) break;
            cost += step;
            target = tile;
        }
        if (!target || !this.context.move(target)) { this.stop('blocked'); return; }
        this.pending = { ...target };
        this.pendingSeconds = 0;
        this.setStatus('moving');
    }

    private setStatus(status: TravelStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.context.onStatus(status);
    }
}
