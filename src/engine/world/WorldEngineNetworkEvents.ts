import type {
    ActionRejectedMessage,
    AutoLootGrantMessage,
    CombatEventMessage,
    InventoryConsumedMessage,
    LootGrantMessage,
    WorldSnapshot,
} from '../../net/WorldProtocol';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';
import type { WorldRaidSession } from './WorldRaidSession';

export interface WorldEngineNetworkEventsContext {
    raidSession: WorldRaidSession;
    networkSyncController: WorldNetworkSyncController;
}

export class WorldEngineNetworkEvents {
    public constructor(private readonly context: WorldEngineNetworkEventsContext) {}

    public applySnapshot(snapshot: WorldSnapshot): void {
        this.context.raidSession.elapsedSeconds = snapshot.raidTimer.elapsedSeconds;
        this.context.raidSession.setRaidModifier(snapshot.raidTimer.modifier ?? null);
        this.context.networkSyncController.applySnapshot(snapshot);
    }

    public handleCombatEvent(event: CombatEventMessage): void {
        this.context.networkSyncController.handleCombatEvent(event);
    }

    public openLoot(grant: LootGrantMessage): void {
        this.context.networkSyncController.openLoot(grant);
    }

    public handleAutoLootGrant(grant: AutoLootGrantMessage): void {
        this.context.networkSyncController.handleAutoLootGrant(grant);
    }

    public handleInventoryConsumed(message: InventoryConsumedMessage): void {
        this.context.networkSyncController.handleInventoryConsumed(message);
    }

    public handleActionRejected(rejection: ActionRejectedMessage): void {
        this.context.networkSyncController.handleActionRejected(rejection);
    }
}
