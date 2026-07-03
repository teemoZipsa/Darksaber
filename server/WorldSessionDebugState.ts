import type { FieldNestState } from '../src/field/SpawnResolver';
import type { LootObject } from '../src/entity/LootObject';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    ServerScenarioState,
} from './WorldSessionTypes';

export interface WorldSessionDebugState {
    readonly players: ReadonlyMap<string, ServerPlayer>;
    readonly actors: ReadonlyMap<string, ServerActor>;
    readonly enemies: ReadonlyMap<string, ServerEnemy>;
    readonly nestStates: ReadonlyMap<string, FieldNestState>;
    readonly scenarioStates: ReadonlyMap<string, ServerScenarioState>;
    readonly loot: ReadonlyMap<string, LootObject>;
}

export function createWorldSessionDebugState(input: {
    players: ReadonlyMap<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    enemies: ReadonlyMap<string, ServerEnemy>;
    nestStates: ReadonlyMap<string, FieldNestState>;
    scenarioStates: ReadonlyMap<string, ServerScenarioState>;
    loot: ReadonlyMap<string, LootObject>;
}): WorldSessionDebugState {
    return input;
}
