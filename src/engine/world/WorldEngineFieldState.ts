import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';

export interface WorldEngineFieldState {
    partyActors: FieldActor[];
    fieldEnemies: FieldEnemy[];
    remotePartyActors: Map<string, FieldActor>;
}

export function createWorldEngineFieldState(): WorldEngineFieldState {
    return {
        partyActors: [],
        fieldEnemies: [],
        remotePartyActors: new Map(),
    };
}
