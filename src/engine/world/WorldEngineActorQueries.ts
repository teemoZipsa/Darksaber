import type { Character } from '../../character/Character';
import type { Enemy } from '../../entity/Enemy';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';

export function getWorldLocalPartyActors(
    partyActors: FieldActor[],
    characters: Character[]
): FieldActor[] {
    // Network raids also include remote actors, so resolve local actors by
    // Character identity instead of by raw partyActors index.
    return partyActors.filter((actor) => characters.includes(actor.character));
}

export function getWorldControlledActor(input: {
    partyActors: FieldActor[];
    characters: Character[];
    activeIndex: number;
}): FieldActor | null {
    const activeChar = input.characters[input.activeIndex];
    const localActors = getWorldLocalPartyActors(input.partyActors, input.characters);
    return localActors.find((actor) => actor.character === activeChar)
        ?? localActors.find((actor) => !actor.character.isDead)
        ?? localActors[0]
        ?? null;
}

export function getWorldFanfareFollowerCount(input: {
    partyActors: FieldActor[];
    characters: Character[];
    actor: FieldActor;
    isNetworkRaid: boolean;
}): number {
    if (input.isNetworkRaid) return 0;
    return getWorldLocalPartyActors(input.partyActors, input.characters)
        .filter((candidate) => candidate !== input.actor && !candidate.character.isDead)
        .length;
}

export function getWorldFanfareLeaderActor(input: {
    partyActors: FieldActor[];
    characters: Character[];
    leaderActorId: string | null;
    isNetworkRaid: boolean;
}): FieldActor | null {
    if (!input.leaderActorId || input.isNetworkRaid) return null;
    return getWorldLocalPartyActors(input.partyActors, input.characters)
        .find((actor) => actor.id === input.leaderActorId && !actor.character.isDead)
        ?? null;
}

export function getWorldActivePartyTurnActor(
    partyActors: FieldActor[],
    activeTurnActorId: string | null
): FieldActor | null {
    if (!activeTurnActorId) return null;
    return partyActors.find((actor) => actor.id === activeTurnActorId && !actor.character.isDead) ?? null;
}

export function getWorldActorById(partyActors: FieldActor[], actorId: string): FieldActor | null {
    return partyActors.find((actor) => actor.id === actorId && !actor.character.isDead) ?? null;
}

export function getWorldEnemyById(fieldEnemies: FieldEnemy[], enemyId: string): Enemy | null {
    return fieldEnemies.find((entry) => entry.enemy.id === enemyId)?.enemy ?? null;
}
