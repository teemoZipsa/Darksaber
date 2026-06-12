import type { ActorSnapshot, WorldSnapshot } from '../../net/WorldProtocol';

export interface NetworkActorSnapshotOwnershipInput {
    snapshot: Pick<WorldSnapshot, 'players' | 'partyActors'>;
    playerId: string | null;
    localCharacterIds: ReadonlySet<string>;
}

export interface NetworkActorSnapshotOwnership {
    localPlayerActorIds: Set<string>;
    ownSnapshots: ActorSnapshot[];
    remoteSnapshots: ActorSnapshot[];
    isOwnActorSnapshot: (actor: ActorSnapshot) => boolean;
}

export function classifyNetworkActorSnapshots(input: NetworkActorSnapshotOwnershipInput): NetworkActorSnapshotOwnership {
    const localPlayerActorIds = new Set(
        input.snapshot.players.find((player) => player.playerId === input.playerId)?.actorIds ?? []
    );
    const isOwnActorSnapshot = (actor: ActorSnapshot): boolean =>
        actor.ownerPlayerId === input.playerId
        || localPlayerActorIds.has(actor.id)
        || (actor.localActorId ? input.localCharacterIds.has(actor.localActorId) : false);
    const liveActorSnapshots = input.snapshot.partyActors.filter((actor) => !actor.isGhost);
    return {
        localPlayerActorIds,
        ownSnapshots: liveActorSnapshots.filter(isOwnActorSnapshot),
        remoteSnapshots: liveActorSnapshots.filter((actor) => !isOwnActorSnapshot(actor)),
        isOwnActorSnapshot,
    };
}
