import { manhattan } from '../src/field/FieldPathing';
import type { LootObject } from '../src/entity/LootObject';
import {
    addCarriedItemQuantity,
    addCarriedWeight,
} from './WorldSessionCarryState';
import { getPlacedItemWeight } from '../src/inventory/CarryWeight';
import { gridToSnapshot, reject } from './WorldSessionHelpers';
import type { WorldSessionLootLock, WorldSessionLootState } from './WorldSessionLootState';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type {
    ServerActor,
    ServerPlayer,
    WorldSessionMessageResult,
} from './WorldSessionTypes';

export interface WorldSessionLootResolverContext {
    players: ReadonlyMap<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    loot: Map<string, LootObject>;
    lootState: WorldSessionLootState;
    saveState: WorldSessionSaveState;
}

export class WorldSessionLootResolver {
    public constructor(private readonly context: WorldSessionLootResolverContext) {}

    public handleLootPickup(
        playerId: string,
        intentId: string,
        lootId: string,
        gridX: number,
        gridY: number,
        now: number
    ): WorldSessionMessageResult {
        const lootObject = this.context.loot.get(lootId);
        if (!lootObject || this.context.lootState.isAutoLootPending(lootId)) return reject(intentId, 'Loot does not exist.');
        if (!this.context.lootState.isOccupiedBy(lootId, playerId)) return reject(intentId, 'Loot is not occupied by this player.');

        const placed = lootObject.inventory.getAt(gridX, gridY);
        if (!placed) return reject(intentId, 'No item at requested loot cell.');
        const player = this.context.players.get(playerId);
        lootObject.inventory.remove(placed);
        addCarriedWeight(player, getPlacedItemWeight(placed));
        addCarriedItemQuantity(player, placed.item.id, placed.quantity);
        if (player) {
            this.context.saveState.addPlacedItem(player, placed);
            this.context.saveState.markDirty(playerId);
        }
        this.context.lootState.touch(lootId, now);
        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) this.context.lootState.releaseLoot(lootId);

        return {
            replies: [{
                type: 'LOOT_GRANT',
                lootId,
                gridSnapshot: gridToSnapshot(lootObject.inventory),
            }],
            broadcasts: [],
        };
    }

    public handleAutoLootResolve(
        playerId: string,
        lootId: string,
        acceptedCells: Array<{ gridX: number; gridY: number }>
    ): WorldSessionMessageResult {
        const lootObject = this.context.loot.get(lootId);
        if (!this.context.lootState.consumeAutoLootPending(lootId, playerId) || !lootObject) return { replies: [], broadcasts: [] };

        const removed = new Set<object>();
        let acceptedWeight = 0;
        const player = this.context.players.get(playerId);
        for (const cell of acceptedCells) {
            const placed = lootObject.inventory.getAt(cell.gridX, cell.gridY);
            if (!placed || removed.has(placed)) continue;
            lootObject.inventory.remove(placed);
            removed.add(placed);
            acceptedWeight += getPlacedItemWeight(placed);
            addCarriedItemQuantity(player, placed.item.id, placed.quantity);
            if (player) this.context.saveState.addPlacedItem(player, placed);
        }
        addCarriedWeight(player, acceptedWeight);
        if (acceptedWeight > 0 || removed.size > 0) this.context.saveState.markDirty(playerId);

        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) {
            this.context.loot.delete(lootId);
            this.context.lootState.releaseLoot(lootId);
        }
        return { replies: [], broadcasts: [] };
    }

    public releaseLocksForPlayer(playerId: string): void {
        this.context.lootState.releaseLocksForPlayer(playerId);
    }

    public releaseExpiredAutoLoot(now: number): void {
        this.context.lootState.releaseExpiredAutoLoot(now, (lootId) => {
            const lootObject = this.context.loot.get(lootId);
            if (lootObject && lootObject.inventory.items.length === 0) {
                lootObject.opened = true;
                this.context.loot.delete(lootId);
            }
        });
    }

    public releaseExpiredLootLocks(now: number): void {
        this.context.lootState.releaseExpiredLocks(now, (lock) => this.shouldReleaseLootLock(lock));
    }

    private shouldReleaseLootLock(lock: WorldSessionLootLock): boolean {
        const actor = this.context.players.get(lock.playerId)?.actorIds
            .map((actorId) => this.context.actors.get(actorId))
            .find(Boolean);
        const lootObject = this.context.loot.get(lock.lootId);
        const tooFar = actor && lootObject && manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 2;
        return Boolean(tooFar || !actor || !lootObject);
    }
}
