import assert from 'node:assert/strict';
import type { TilePoint } from '../../src/field/FieldPathing';
import type { FieldNestState } from '../../src/field/SpawnResolver';
import type { WorldSession, WorldSessionDebugState } from '../../server/WorldSession';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    ServerScenarioState,
} from '../../server/WorldSessionTypes';

export function getWorldSessionDebugState(session: WorldSession): WorldSessionDebugState {
    return session.getDebugState();
}

export function getPlayerDebugState(session: WorldSession, playerId: string): ServerPlayer {
    const player = session.getDebugState().players.get(playerId);
    assert.ok(player, `missing debug player ${playerId}`);
    return player;
}

export function getActorForPlayer(session: WorldSession, playerId: string): ServerActor {
    const actor = [...session.getDebugState().actors.values()].find((entry) => entry.ownerPlayerId === playerId);
    assert.ok(actor, `missing debug actor for player ${playerId}`);
    return actor;
}

export function getFirstActor(session: WorldSession): ServerActor {
    const actor = [...session.getDebugState().actors.values()][0];
    assert.ok(actor, 'missing first debug actor');
    return actor;
}

export function getFirstEnemy(session: WorldSession): ServerEnemy {
    const enemy = [...session.getDebugState().enemies.values()][0];
    assert.ok(enemy, 'missing first debug enemy');
    return enemy;
}

export function getEnemyById(session: WorldSession, enemyId: string): ServerEnemy {
    const enemy = session.getDebugState().enemies.get(enemyId);
    assert.ok(enemy, `missing debug enemy ${enemyId}`);
    return enemy;
}

export function getScenarioObjectiveEnemy(session: WorldSession): ServerEnemy {
    const enemy = [...session.getDebugState().enemies.values()].find((entry) => entry.scenarioObjective);
    assert.ok(enemy, 'missing scenario objective enemy');
    return enemy;
}

export function getScenarioState(session: WorldSession, playerId: string): ServerScenarioState {
    const state = session.getDebugState().scenarioStates.get(playerId);
    assert.ok(state, `missing scenario state for player ${playerId}`);
    return state;
}

export function getScenarioEnemies(session: WorldSession, state: ServerScenarioState): ServerEnemy[] {
    return state.enemyIds.map((id) => getEnemyById(session, id));
}

export function getNestWithMonsters(session: WorldSession): FieldNestState {
    const state = [...session.getDebugState().nestStates.values()].find((entry) => entry.monsterIds.length > 0);
    assert.ok(state, 'missing nest state with monsters');
    return state;
}

export function readyActorAt(session: WorldSession, playerId: string, tile: TilePoint, ap = 80): ServerActor {
    const actor = getActorForPlayer(session, playerId);
    actor.tile = { ...tile };
    actor.remainingAp = ap;
    actor.actionGauge = ap;
    return actor;
}

export function clearEnemiesForTest(session: WorldSession): void {
    const enemies = session.getDebugState().enemies as Map<string, ServerEnemy>;
    enemies.clear();
}
