import type { ServerActor, ServerEnemy, ServerPlayer } from './WorldSessionTypes';

export function isEnemyVisibleToViewer(
    players: ReadonlyMap<string, ServerPlayer>,
    entry: ServerEnemy,
    viewerPlayerId: string | null
): boolean {
    const viewer = viewerPlayerId ? players.get(viewerPlayerId) : undefined;
    if (viewer?.activeDungeonId) return entry.scenarioPlayerId === viewer.id;
    const privateOwnerId = entry.scenarioPlayerId ?? entry.bountyPlayerId;
    if (!privateOwnerId) return true;
    if (!viewerPlayerId) return false;
    return privateOwnerId === viewerPlayerId;
}

export function isActorVisibleToViewer(
    players: ReadonlyMap<string, ServerPlayer>,
    actor: ServerActor,
    viewerPlayerId: string | null
): boolean {
    if (!viewerPlayerId) return true;
    if (actor.ownerPlayerId === viewerPlayerId) return true;
    const viewer = players.get(viewerPlayerId);
    const owner = players.get(actor.ownerPlayerId);
    if (viewer?.activeDungeonId) return false;
    if (owner?.activeDungeonId) return false;
    return true;
}

export function canActorTargetEnemy(actor: ServerActor, entry: ServerEnemy): boolean {
    const privateOwnerId = entry.scenarioPlayerId ?? entry.bountyPlayerId;
    return !privateOwnerId || privateOwnerId === actor.ownerPlayerId;
}

export function getTargetableActors(
    players: ReadonlyMap<string, ServerPlayer>,
    actors: Iterable<ServerActor>,
    entry?: ServerEnemy
): ServerActor[] {
    return [...actors]
        .filter((actor) => !actor.isDead && actor.stats.hp > 0)
        .filter((actor) => {
            const owner = players.get(actor.ownerPlayerId);
            if (!owner?.active) return false;
            if (entry?.bountyPlayerId && owner.activeDungeonId) return false;
            const privateOwnerId = entry?.scenarioPlayerId ?? entry?.bountyPlayerId;
            if (privateOwnerId) return actor.ownerPlayerId === privateOwnerId;
            return !owner.activeDungeonId;
        })
        .sort((a, b) => {
            const ghostA = players.get(a.ownerPlayerId)?.ghost ? 1 : 0;
            const ghostB = players.get(b.ownerPlayerId)?.ghost ? 1 : 0;
            return ghostA - ghostB;
        });
}

export function isPlayerWiped(player: ServerPlayer, actors: ReadonlyMap<string, ServerActor>): boolean {
    return player.actorIds.every((actorId) => {
        const actor = actors.get(actorId);
        return !actor || actor.isDead || actor.stats.hp <= 0;
    });
}
