import type { LootObject } from '../src/entity/LootObject';
import type {
    WorldPlayerSnapshot,
    WorldSnapshot,
} from '../src/net/WorldProtocol';
import { MIN_FIELD_ACTION_GAUGE_COST } from '../src/field/FieldActionEconomy';
import { WorldSessionLootState } from './WorldSessionLootState';
import {
    isActorVisibleToViewer,
    isEnemyVisibleToViewer,
} from './WorldSessionVisibility';
import {
    cloneStats,
    cloneStatuses,
    scenarioFlagSnapshot,
} from './WorldSessionHelpers';
import {
    toActorSnapshot,
    toLootSnapshot,
} from './WorldSessionSnapshotViews';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
} from './WorldSessionTypes';

export function buildWorldSessionSnapshot(input: {
    seq: number;
    now: number;
    viewerPlayerId: string | null;
    raidLimitSeconds: number;
    players: ReadonlyMap<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    enemies: Iterable<ServerEnemy>;
    loot: Iterable<LootObject>;
    lootState: WorldSessionLootState;
    sharedScenarioFieldEventFlags: ReadonlyMap<string, Set<string>>;
}): WorldSnapshot {
    const viewer = input.viewerPlayerId ? input.players.get(input.viewerPlayerId) : undefined;
    const players: WorldPlayerSnapshot[] = [...input.players.values()]
        .filter((player) => player.active)
        .map((player) => ({
            playerId: player.id,
            originHubId: player.originHubId,
            isGhost: player.ghost,
            actorIds: [...player.actorIds],
        }));
    const partyActors = [...input.actors.values()]
        .filter((actor) => {
            const owner = input.players.get(actor.ownerPlayerId);
            return owner?.active && !owner.ghost;
        })
        .filter((actor) => isActorVisibleToViewer(input.players, actor, input.viewerPlayerId))
        .map((actor) => toActorSnapshot(actor, input.players.get(actor.ownerPlayerId)?.ghost ?? false));
    const enemies = [...input.enemies]
        .filter((entry) => entry.enemy.stats.hp > 0)
        .filter((entry) => isEnemyVisibleToViewer(input.players, entry, input.viewerPlayerId))
        .map((entry) => ({
            id: entry.enemy.id,
            monsterId: entry.monsterId,
            name: entry.enemy.name,
            role: entry.enemy.role,
            level: entry.enemy.level,
            color: entry.enemy.color,
            tile: { x: entry.enemy.gridX, y: entry.enemy.gridY },
            home: { ...entry.home },
            stats: cloneStats(entry.enemy.stats),
            statuses: cloneStatuses(entry.enemy.statuses),
            actionGauge: entry.enemy.actionGauge,
            facing: entry.enemy.facing,
            isAggro: entry.enemy.isAggro,
            isBoss: entry.enemy.isBoss,
        }));
    const loot = [...input.loot]
        .filter((lootObject) => !input.lootState.isAutoLootPending(lootObject.id))
        .filter(() => !viewer?.activeDungeonId)
        .map((lootObject) => toLootSnapshot(lootObject, input.lootState.getLockPlayerId(lootObject.id)));
    const readyActors = partyActors
        .filter((actor) => !actor.isDead && !actor.isGhost && actor.remainingAp >= MIN_FIELD_ACTION_GAUGE_COST)
        .map((actor) => actor.id);
    const remainingApByActor: Record<string, number> = {};
    for (const actor of partyActors) remainingApByActor[actor.id] = actor.remainingAp;

    const fallbackPlayer = viewer ?? [...input.players.values()].find((player) => player.active);
    return {
        seq: input.seq,
        serverTime: input.now,
        players,
        partyActors,
        enemies,
        loot,
        readyActors,
        remainingApByActor,
        raidTimer: {
            active: Boolean(fallbackPlayer?.active),
            elapsedSeconds: fallbackPlayer?.elapsedSeconds ?? 0,
            limitSeconds: input.raidLimitSeconds,
            departureTownId: fallbackPlayer?.departureTownId ?? 'central_castle',
            modifier: fallbackPlayer?.raidModifier ?? null,
        },
        scenario: {
            enteredDungeonIds: fallbackPlayer ? [...fallbackPlayer.enteredDungeonIds] : [],
            activeDungeonId: fallbackPlayer?.activeDungeonId ?? null,
            completedDungeonIds: fallbackPlayer ? [...fallbackPlayer.completedDungeonIds] : [],
            playerFieldEventFlagsByDungeonId: fallbackPlayer
                ? scenarioFlagSnapshot(fallbackPlayer.fieldEventFlagsByDungeonId)
                : {},
            sharedFieldEventFlagsByDungeonId: scenarioFlagSnapshot(input.sharedScenarioFieldEventFlags),
        },
    };
}
