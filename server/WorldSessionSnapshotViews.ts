import type { LootObject } from '../src/entity/LootObject';
import type { ActorSnapshot, LootSnapshot } from '../src/net/WorldProtocol';
import { cloneStats, cloneStatuses, getEquipmentAdjustedServerActorStats, gridToSnapshot } from './WorldSessionHelpers';
import type { ServerActor } from './WorldSessionTypes';

export function toActorSnapshot(actor: ServerActor, isGhost: boolean, includeEquipmentStats: boolean = false): ActorSnapshot {
    return {
        id: actor.id,
        ownerPlayerId: actor.ownerPlayerId,
        localActorId: actor.localActorId,
        name: actor.name,
        classLineId: actor.classLineId,
        currentTier: actor.currentTier,
        level: actor.level,
        tile: { ...actor.tile },
        stats: cloneStats(includeEquipmentStats ? getEquipmentAdjustedServerActorStats(actor) : actor.stats),
        statuses: cloneStatuses(actor.statuses),
        actionGauge: actor.actionGauge,
        remainingAp: actor.remainingAp,
        majorActionUsed: actor.majorActionUsed,
        facing: actor.facing,
        isDead: actor.isDead,
        isGhost,
        magicLoadout: [...actor.magicLoadout],
        skillUpgradeLevels: { ...actor.skillUpgradeLevels },
    };
}

export function toLootSnapshot(lootObject: LootObject, lockedByPlayerId: string | undefined): LootSnapshot {
    return {
        id: lootObject.id,
        tile: { x: lootObject.x, y: lootObject.y },
        sourceLabel: lootObject.sourceLabel,
        kind: lootObject.kind,
        containerType: lootObject.containerType,
        opened: lootObject.opened,
        unlocked: lootObject.unlocked || undefined,
        lockedByPlayerId,
        gridSnapshot: gridToSnapshot(lootObject.inventory),
    };
}
