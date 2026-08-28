import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import type { ActorSnapshot, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { normalizeMonsterCodex } from '../../src/raid/MonsterCodex';
import { WorldSession } from '../../server/WorldSession';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import {
    getActorForPlayer,
    getFirstEnemy,
} from './world-session-harness';

function actor(id: string): ActorSnapshot {
    return {
        id,
        localActorId: id,
        name: id,
        classLineId: 'infantry',
        currentTier: 1,
        level: 10,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ atk: 9_999, spd: 100, mov: 50, actionLimit: 80, hitRate: 500 }),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
    };
}

function joinMessage(id: string): WorldJoinMessage {
    return {
        type: 'WORLD_JOIN',
        originHubId: 'central_castle',
        partyComposition: [actor(id)],
        clientVersion: 'test',
    };
}

function authCharacter(id: string): AuthCharacter {
    return {
        id,
        accountId: 'codex-account',
        slotNo: 1,
        name: id,
        classKey: 'infantry',
        tier: 1,
        level: 10,
        exp: 0,
        baseStats: createBaseStats(),
        createdAt: '2026-08-28T00:00:00.000Z',
        updatedAt: '2026-08-28T00:00:00.000Z',
        deletedAt: null,
    };
}

test('server deduplicates nearby encounters, persists their tokens, and confirms the defeat', () => {
    const character = authCharacter('codex-hero');
    const save = createDefaultCharacterSave(character);
    const session = new WorldSession({ random: () => 0 });
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const serverActor = getActorForPlayer(session, joined.playerId);
    const target = getFirstEnemy(session);
    assert.ok(target.monsterId);
    [...session.getDebugState().enemies.values()].forEach((entry, index) => {
        entry.enemy.gridX = serverActor.tile.x + 100 + index;
        entry.enemy.gridY = serverActor.tile.y + 100;
        entry.home = { x: entry.enemy.gridX, y: entry.enemy.gridY };
    });
    target.enemy.gridX = serverActor.tile.x + 1;
    target.enemy.gridY = serverActor.tile.y;
    target.home = { x: target.enemy.gridX, y: target.enemy.gridY };

    session.createSnapshot(joined.playerId, 100);
    let patch = session.createCharacterSavePatch(joined.playerId);
    let entries = normalizeMonsterCodex(patch?.questState?.monsterCodex);
    let targetEntry = entries.find((entry) => entry.monsterId === target.monsterId);
    assert.ok(targetEntry);
    const targetEncounterCount = targetEntry.encounters;
    assert.equal(entries.length, 1);
    assert.equal(targetEncounterCount, 1);
    assert.equal(targetEntry.kills, 0);

    session.createSnapshot(joined.playerId, 200);
    patch = session.createCharacterSavePatch(joined.playerId);
    entries = normalizeMonsterCodex(patch?.questState?.monsterCodex);
    targetEntry = entries.find((entry) => entry.monsterId === target.monsterId);
    assert.ok(targetEntry);
    assert.equal(targetEntry.encounters, targetEncounterCount);

    const restored = WorldSession.restorePersistentSnapshot(
        JSON.parse(JSON.stringify(session.createPersistentSnapshot())),
    );
    restored.createSnapshot(joined.playerId, 300);
    patch = restored.createCharacterSavePatch(joined.playerId);
    entries = normalizeMonsterCodex(patch?.questState?.monsterCodex);
    targetEntry = entries.find((entry) => entry.monsterId === target.monsterId);
    assert.ok(targetEntry);
    assert.equal(targetEntry.encounters, targetEncounterCount);

    const restoredActor = getActorForPlayer(restored, joined.playerId);
    const restoredTarget = getFirstEnemy(restored);
    restoredActor.tile = { x: restoredTarget.enemy.gridX - 1, y: restoredTarget.enemy.gridY };
    restoredActor.actionGauge = 80;
    restoredActor.remainingAp = 80;
    restoredActor.stats.atk = 9_999;
    restoredActor.stats.hitRate = 500;
    restoredTarget.enemy.stats.hp = 1;
    restoredTarget.enemy.stats.def = 0;

    const result = restored.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'codex-kill',
        actorId: restoredActor.id,
        kind: 'attack',
        payload: { targetId: restoredTarget.enemy.id },
    }, 400);
    assert.equal(result.broadcasts.some((message) => message.type === 'COMBAT_EVENT' && message.kind === 'kill'), true);

    patch = restored.createCharacterSavePatch(joined.playerId);
    entries = normalizeMonsterCodex(patch?.questState?.monsterCodex);
    targetEntry = entries.find((entry) => entry.monsterId === restoredTarget.monsterId);
    assert.ok(targetEntry);
    assert.equal(targetEntry.encounters, targetEncounterCount);
    assert.equal(targetEntry.kills, 1);
    assert.equal(targetEntry.highestDefeatedLevel, restoredTarget.enemy.level);
    assert.equal(targetEntry.lastDefeatedAt, 400);
});
