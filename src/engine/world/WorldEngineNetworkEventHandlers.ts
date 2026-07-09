import type {
    ActionRejectedMessage,
    AutoLootGrantMessage,
    CombatEventMessage,
    InventoryConsumedMessage,
    LootGrantMessage,
    WorldSnapshot,
} from '../../net/WorldProtocol';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldRaidSession } from './WorldRaidSession';

export function applyWorldEngineNetworkSnapshot(
    controllers: WorldEngineScenarioNetworkControllers,
    raidSession: WorldRaidSession,
    snapshot: WorldSnapshot
): void {
    if (controllers.networkEvents) {
        controllers.networkEvents.applySnapshot(snapshot);
        return;
    }
    raidSession.elapsedSeconds = snapshot.raidTimer.elapsedSeconds;
    raidSession.setRaidModifier(snapshot.raidTimer.modifier ?? null);
    controllers.networkSyncController.applySnapshot(snapshot);
}

export function openWorldEngineNetworkLoot(
    controllers: WorldEngineScenarioNetworkControllers,
    grant: LootGrantMessage
): void {
    if (controllers.networkEvents) controllers.networkEvents.openLoot(grant);
    else controllers.networkSyncController.openLoot(grant);
}

export function handleWorldEngineNetworkAutoLootGrant(
    controllers: WorldEngineScenarioNetworkControllers,
    grant: AutoLootGrantMessage
): void {
    if (controllers.networkEvents) controllers.networkEvents.handleAutoLootGrant(grant);
    else controllers.networkSyncController.handleAutoLootGrant(grant);
}

export function handleWorldEngineNetworkInventoryConsumed(
    controllers: WorldEngineScenarioNetworkControllers,
    message: InventoryConsumedMessage
): void {
    if (controllers.networkEvents) controllers.networkEvents.handleInventoryConsumed(message);
    else controllers.networkSyncController.handleInventoryConsumed(message);
}

export function handleWorldEngineNetworkActionRejected(
    controllers: WorldEngineScenarioNetworkControllers,
    rejection: ActionRejectedMessage
): void {
    if (controllers.networkEvents) controllers.networkEvents.handleActionRejected(rejection);
    else controllers.networkSyncController.handleActionRejected(rejection);
}

export function handleWorldEngineNetworkCombatEvent(
    controllers: WorldEngineScenarioNetworkControllers,
    event: CombatEventMessage
): void {
    if (controllers.networkEvents) controllers.networkEvents.handleCombatEvent(event);
    else controllers.networkSyncController.handleCombatEvent(event);
}
