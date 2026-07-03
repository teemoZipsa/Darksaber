import type { FieldNestState } from '../src/field/SpawnResolver';
import type { LootObject } from '../src/entity/LootObject';
import type { WorldRealm } from '../src/map/BiomeMask';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    ServerScenarioState,
    WorldSessionPersistentSnapshot,
} from './WorldSessionTypes';
import {
    clonePersistentActor,
    clonePersistentNestState,
    clonePersistentScenarioState,
    toPersistentEnemy,
    toPersistentLoot,
    toPersistentPlayer,
} from './WorldSessionPersistence';

export function buildWorldSessionPersistentSnapshot(input: {
    realm: WorldRealm;
    shardId: string;
    sessionEpoch: number;
    seq: number;
    nextPlayerId: number;
    nextEnemyId: number;
    nextLootId: number;
    lastTickAt: number | null;
    lastNestRefreshAt: number;
    players: Iterable<ServerPlayer>;
    actors: Iterable<ServerActor>;
    enemies: Iterable<ServerEnemy>;
    nestStates: Iterable<FieldNestState>;
    scenarioStates: Iterable<ServerScenarioState>;
    sharedScenarioFieldEventFlags: Iterable<[string, Set<string>]>;
    loot: Iterable<LootObject>;
    generatedLootChunks: Iterable<string>;
    dirtyPlayerIds: Iterable<string>;
}): WorldSessionPersistentSnapshot {
    return {
        version: 1,
        realm: input.realm,
        shardId: input.shardId,
        sessionEpoch: input.sessionEpoch,
        seq: input.seq,
        nextPlayerId: input.nextPlayerId,
        nextEnemyId: input.nextEnemyId,
        nextLootId: input.nextLootId,
        lastTickAt: input.lastTickAt,
        lastNestRefreshAt: input.lastNestRefreshAt,
        players: [...input.players].map(toPersistentPlayer),
        actors: [...input.actors].map(clonePersistentActor),
        enemies: [...input.enemies].map(toPersistentEnemy),
        nestStates: [...input.nestStates].map(clonePersistentNestState),
        scenarioStates: [...input.scenarioStates].map(clonePersistentScenarioState),
        sharedScenarioFieldEventFlags: [...input.sharedScenarioFieldEventFlags].map(([dungeonId, flags]) => [dungeonId, [...flags]]),
        loot: [...input.loot].map(toPersistentLoot),
        generatedLootChunks: [...input.generatedLootChunks],
        dirtyPlayerIds: [...input.dirtyPlayerIds],
    };
}
