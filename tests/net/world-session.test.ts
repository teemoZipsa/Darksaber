import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { getNormalizedMonsterBalance } from '../../src/data/original/originalMonsterBalance';
import { Enemy } from '../../src/entity/Enemy';
import type { ActorSnapshot, AutoLootGrantMessage, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { WorldMap } from '../../src/map/WorldMap';
import { CHUNK_SIZE } from '../../src/map/Chunk';
import { WorldResumeFailedError, WorldSession } from '../../server/WorldSession';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { getStoryScenarioMonsterLayout } from '../../src/data/StoryScenarioMonsterData';
import { getStoryScenarioEventSequence } from '../../src/data/StoryScenarioEventData';
import { getStoryScenarioFieldEventTiles } from '../../src/data/StoryScenarioFieldEventPlacement';
import { getStoryInteriorLayout } from '../../src/data/StoryInteriorData';
import {
    getOriginalLateStoryBossTile,
    getOriginalLateStoryGuardTiles,
} from '../../src/data/OriginalLateStoryFacts';
import { getOriginalLateStoryItemsForSourceEvent } from '../../src/data/OriginalLateStoryItems';
import { ENEMY_AGGRO_RANGE, ENEMY_SIMULATION_ACTIVE_RANGE } from '../../src/field/FieldConfig';

function actor(id: string, overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
    return {
        id,
        localActorId: id,
        name: id,
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
        ...overrides,
    };
}

function joinMessage(originHubId: string, id: string, resumeToken?: string): WorldJoinMessage {
    return {
        type: 'WORLD_JOIN',
        originHubId,
        partyComposition: [actor(id)],
        clientVersion: 'test',
        resumeToken,
    };
}

function withFixedRandom<T>(value: number, callback: () => T): T {
    const previousRandom = Math.random;
    Math.random = () => value;
    try {
        return callback();
    } finally {
        Math.random = previousRandom;
    }
}

function authCharacter(id: string): AuthCharacter {
    return {
        id,
        accountId: 'account-test',
        slotNo: 1,
        name: id,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}

test('join spawns each player at their origin hub external exit tile', () => {
    const session = new WorldSession();
    const world = new WorldMap();

    const central = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const forest = session.join(joinMessage('w_forest_village', 'hero-b'), 0);

    const centralActor = session.createSnapshot(central.playerId, 0).partyActors.find((entry) => entry.ownerPlayerId === central.playerId);
    const forestActor = session.createSnapshot(forest.playerId, 0).partyActors.find((entry) => entry.ownerPlayerId === forest.playerId);
    const centralExit = world.getTownExitTile(world.getTowns().find((town) => town.id === 'central_castle')!);
    const forestExit = world.getTownExitTile(world.getTowns().find((town) => town.id === 'w_forest_village')!);

    assert.deepEqual(centralActor?.tile, centralExit);
    assert.deepEqual(forestActor?.tile, forestExit);
});

test('default character saves start with the shared no-shield basic kit', () => {
    const save = createDefaultCharacterSave(authCharacter('starter'));
    const equipment = save.equipment as Record<string, { itemId?: string }>;

    assert.equal(equipment.weapon?.itemId, 'short_sword');
    assert.equal(equipment.body?.itemId, 'battle_t1_body');
    assert.equal(Object.prototype.hasOwnProperty.call(equipment, 'shield'), false);
    assert.deepEqual(save.inventory.items.map((item) => item.itemId), ['herb_cheap', 'herb_cheap', 'mp_potion']);
});

test('default character saves use class-branch body armor', () => {
    const mage = { ...authCharacter('starter-mage'), classKey: 'mage' as const };
    const save = createDefaultCharacterSave(mage);
    const equipment = save.equipment as Record<string, { itemId?: string }>;

    assert.equal(equipment.weapon?.itemId, 'short_sword');
    assert.equal(equipment.body?.itemId, 'magic_t1_body');
    assert.equal(Object.prototype.hasOwnProperty.call(equipment, 'shield'), false);
});

test('server tick keeps passive enemy ATB idle for every client snapshot', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);

    session.tick(0);
    session.tick(250);

    const snapshotA = session.createSnapshot(a.playerId, 250);
    const snapshotB = session.createSnapshot(b.playerId, 250);
    assert.ok(snapshotA.enemies.length > 0);
    assert.equal(snapshotA.enemies.every((enemy) => enemy.actionGauge === 0 && !enemy.isAggro), true);
    assert.deepEqual(
        snapshotA.enemies.map((enemy) => ({ id: enemy.id, hp: enemy.stats.hp, tile: enemy.tile, gauge: enemy.actionGauge })),
        snapshotB.enemies.map((enemy) => ({ id: enemy.id, hp: enemy.stats.hp, tile: enemy.tile, gauge: enemy.actionGauge }))
    );
});

test('server tick charges only enemies with an active aggro target', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const internals = session as unknown as {
        actors: Map<string, { tile: { x: number; y: number } }>;
        enemies: Map<string, { enemy: { gridX: number; gridY: number; id: string } }>;
    };
    const serverActor = [...internals.actors.values()][0];
    const enemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(enemyEntry);
    serverActor.tile = { x: enemyEntry.enemy.gridX + 3, y: enemyEntry.enemy.gridY };

    session.tick(0);
    session.tick(250);

    const snapshot = session.createSnapshot(a.playerId, 250);
    const aggroEnemy = snapshot.enemies.find((enemy) => enemy.id === enemyEntry.enemy.id);
    assert.ok(aggroEnemy);
    assert.equal(aggroEnemy.isAggro, true);
    assert.ok(aggroEnemy.actionGauge > 0);
});

test('server tick freezes enemies outside the active simulation range', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const internals = session as unknown as {
        actors: Map<string, { tile: { x: number; y: number } }>;
        enemies: Map<string, { enemy: { gridX: number; gridY: number; id: string; actionGauge: number; isAggro: boolean } }>;
    };
    const serverActor = [...internals.actors.values()][0];
    const enemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(enemyEntry);
    serverActor.tile = { x: enemyEntry.enemy.gridX + ENEMY_SIMULATION_ACTIVE_RANGE + 1, y: enemyEntry.enemy.gridY };
    enemyEntry.enemy.isAggro = true;
    enemyEntry.enemy.actionGauge = 75;

    session.tick(0);
    session.tick(250);

    const snapshot = session.createSnapshot(a.playerId, 250);
    const inactiveEnemy = snapshot.enemies.find((enemy) => enemy.id === enemyEntry.enemy.id);
    assert.ok(inactiveEnemy);
    assert.equal(inactiveEnemy.isAggro, false);
    assert.equal(inactiveEnemy.actionGauge, 0);
});

test('intent ownership rejects another player actor', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);
    const bActorId = session.createSnapshot(b.playerId, 0).partyActors.find((entry) => entry.ownerPlayerId === b.playerId)!.id;

    const result = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'steal-turn',
        actorId: bActorId,
        kind: 'endTurn',
        payload: {},
    }, 0);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
});

test('useItem intent consumes server-owned carried inventory and heals actor', () => {
    const session = new WorldSession();
    const a = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        carriedItems: [{ itemId: 'herb_common', quantity: 1 }],
        partyComposition: [actor('hero-a', {
            stats: createBaseStats({ hp: 10, maxHp: 100, mp: 0, maxMp: 20, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === a.playerId);
    assert.ok(serverActor);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;

    const result = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'use-item',
        actorId: serverActor.id,
        kind: 'useItem',
        payload: { itemId: 'herb_common' },
    }, 1_000);

    assert.equal(result.replies[0]?.type, 'INVENTORY_CONSUMED');
    assert.equal(result.broadcasts[0]?.type, 'COMBAT_EVENT');
    assert.equal(result.broadcasts[0]?.type === 'COMBAT_EVENT' ? result.broadcasts[0].kind : '', 'heal');
    assert.ok(session.createSnapshot(a.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id)!.stats.hp > 10);

    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    const rejected = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'use-item-again',
        actorId: serverActor.id,
        kind: 'useItem',
        payload: { itemId: 'herb_common' },
    }, 1_010);
    assert.equal(rejected.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(rejected.replies[0]?.type === 'ACTION_REJECTED' ? rejected.replies[0].reason : '', /not available/);
});

test('character save dirty state is event-driven and not created by world ticks', () => {
    const session = new WorldSession();
    const character = authCharacter('hero-save');
    const save = createDefaultCharacterSave(character);
    save.inventory = {
        width: 10,
        height: 6,
        items: [{
            itemId: 'herb_common',
            gridX: 0,
            gridY: 0,
            quantity: 1,
            durability: 1,
        }],
    };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        carriedItems: [{ itemId: 'herb_common', quantity: 1 }],
        partyComposition: [actor(character.id, {
            stats: createBaseStats({ hp: 10, maxHp: 100, mp: 0, maxMp: 20, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });

    session.tick(0);
    session.tick(1_000);
    assert.deepEqual(session.consumeSaveDirtyPlayerIds(), []);

    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    assert.ok(serverActor);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;

    const result = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'use-save-item',
        actorId: serverActor.id,
        kind: 'useItem',
        payload: { itemId: 'herb_common' },
    }, 1_100);

    assert.equal(result.replies[0]?.type, 'INVENTORY_CONSUMED');
    assert.deepEqual(session.consumeSaveDirtyPlayerIds(), [joined.playerId]);
    const patch = session.createCharacterSavePatch(joined.playerId);
    assert.ok(patch?.inventory);
    assert.deepEqual(patch.inventory.items.filter((item) => item.itemId === 'herb_common'), []);
});

test('session logs lifecycle events and exposes debug counts', () => {
    const logs: string[] = [];
    const session = new WorldSession({ ghostGraceMs: 1_000, logger: (message) => logs.push(message) });
    const first = session.join(joinMessage('central_castle', 'hero-a'), 0);

    const initialCounts = session.getDebugCounts();
    assert.equal(initialCounts.activePlayers, 1);
    assert.equal(initialCounts.ghostPlayers, 0);
    assert.ok(initialCounts.enemies > 0);
    assert.equal(initialCounts.lootLocks, 0);

    session.disconnect(first.playerId, 100);
    assert.equal(session.getDebugCounts().ghostPlayers, 1);

    const resumed = session.reconnect(first.welcome.resumeToken, 500);
    assert.equal(resumed?.playerId, first.playerId);

    const leave = session.handleMessage(first.playerId, { type: 'WORLD_LEAVE', reason: 'manual' }, 600);
    assert.equal(leave.replies[0]?.type, 'RAID_RESULT');
    assert.equal(session.getDebugCounts().activePlayers, 0);
    assert.ok(logs.some((entry) => entry.startsWith('join player=')));
    assert.ok(logs.some((entry) => entry.startsWith('ghost start player=')));
    assert.ok(logs.some((entry) => entry.startsWith('reconnect player=')));
    assert.ok(logs.some((entry) => entry.startsWith('leave player=')));
    assert.ok(logs.some((entry) => entry.startsWith('raid result player=')));
});

test('disconnect grace resumes same actor before expiry and starts fresh after expiry', () => {
    const session = new WorldSession({ ghostGraceMs: 1_000 });
    const first = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const firstActorId = session.createSnapshot(first.playerId, 0).partyActors[0].id;

    session.disconnect(first.playerId, 100);
    const resumed = session.join(joinMessage('central_castle', 'hero-a', first.welcome.resumeToken), 500);
    const resumedActorId = session.createSnapshot(resumed.playerId, 500).partyActors[0].id;

    assert.equal(resumed.playerId, first.playerId);
    assert.equal(resumedActorId, firstActorId);
    assert.deepEqual(resumed.welcome.spawnTile, session.createSnapshot(resumed.playerId, 500).partyActors[0].tile);

    session.disconnect(resumed.playerId, 600);
    session.tick(1_700);
    assert.throws(
        () => session.join(joinMessage('central_castle', 'hero-a', first.welcome.resumeToken), 1_800),
        WorldResumeFailedError,
    );
});

test('loot contention grants one occupant and rejects the other', () => {
    const session = new WorldSession();
    const a = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', { stats: createBaseStats({ spd: 100, mov: 500, actionLimit: 80, hitRate: 200 }) })],
    }, 0);
    const b = session.join({
        ...joinMessage('central_castle', 'hero-b'),
        partyComposition: [actor('hero-b', { stats: createBaseStats({ spd: 100, mov: 500, actionLimit: 80, hitRate: 200 }) })],
    }, 0);
    session.tick(0);
    session.tick(1_000);

    const snapshot = session.createSnapshot(a.playerId, 1_000);
    const loot = snapshot.loot[0];
    assert.ok(loot);
    const world = new WorldMap();
    const adjacentTile = [
        { x: loot.tile.x - 1, y: loot.tile.y },
        { x: loot.tile.x + 1, y: loot.tile.y },
        { x: loot.tile.x, y: loot.tile.y - 1 },
        { x: loot.tile.x, y: loot.tile.y + 1 },
    ].find((tile) => world.isWalkable(tile.x, tile.y));
    assert.ok(adjacentTile);

    const internals = session as any;
    for (const playerId of [a.playerId, b.playerId]) {
        const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === playerId);
        assert.ok(serverActor);
        serverActor.tile = { ...adjacentTile };
        serverActor.remainingAp = 80;
        serverActor.actionGauge = 80;
    }

    const actorA = session.createSnapshot(a.playerId, 1_000).partyActors.find((entry) => entry.ownerPlayerId === a.playerId)!.id;
    const actorB = session.createSnapshot(b.playerId, 1_000).partyActors.find((entry) => entry.ownerPlayerId === b.playerId)!.id;
    const grant = session.handleMessage(a.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-a',
        actorId: actorA,
        kind: 'interact',
        payload: { lootId: loot.id },
    }, 1_100);
    const reject = session.handleMessage(b.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-b',
        actorId: actorB,
        kind: 'interact',
        payload: { lootId: loot.id },
    }, 1_100);

    assert.equal(grant.replies[0]?.type, 'LOOT_GRANT');
    assert.equal(reject.replies[0]?.type, 'ACTION_REJECTED');
});

test('network world loot snapshots are shared and include container types', () => {
    const session = new WorldSession();
    const a = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const b = session.join(joinMessage('central_castle', 'hero-b'), 0);
    session.tick(1_000);

    const lootA = session.createSnapshot(a.playerId, 1_000).loot.map((loot) => ({
        id: loot.id,
        tile: loot.tile,
        sourceLabel: loot.sourceLabel,
        kind: loot.kind,
        containerType: loot.containerType,
    }));
    const lootB = session.createSnapshot(b.playerId, 1_000).loot.map((loot) => ({
        id: loot.id,
        tile: loot.tile,
        sourceLabel: loot.sourceLabel,
        kind: loot.kind,
        containerType: loot.containerType,
    }));

    assert.ok(lootA.length > 0);
    assert.ok(lootA.every((loot) => loot.kind === 'chest' && loot.containerType));
    assert.deepEqual(lootB, lootA);
});

test('network kills auto-grant normal enemy loot and include display names in combat events', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(serverEnemyEntry);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverEnemyEntry.enemy.stats.hp = 1;
    serverEnemyEntry.enemy.stats.def = 0;
    serverEnemyEntry.enemy.stats.spd = 0;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-auto-loot',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: serverEnemyEntry.enemy.id },
    }, 1_000));

    const event = result.broadcasts.find((message) => message.type === 'COMBAT_EVENT');
    const grant = result.replies.find((message): message is AutoLootGrantMessage => message.type === 'AUTO_LOOT_GRANT');
    assert.equal(event?.type, 'COMBAT_EVENT');
    assert.equal(event?.kind, 'kill');
    assert.equal(event?.sourceName, 'Hero Alpha');
    assert.equal(event?.targetName, serverEnemyEntry.enemy.name);
    assert.ok(grant);
    assert.equal(grant.sourceName, serverEnemyEntry.enemy.name);
    assert.equal(session.createSnapshot(joined.playerId, 1_000).loot.some((loot) => loot.id === grant.lootId), false);

    session.handleMessage(joined.playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: grant.gridSnapshot.items.map((item) => ({ gridX: item.gridX, gridY: item.gridY })),
    }, 1_050);

    assert.equal(session.createSnapshot(joined.playerId, 1_050).loot.some((loot) => loot.id === grant.lootId), false);
});

test('castSkill intent is resolved by server skill rules', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            currentTier: 3,
            stats: createBaseStats({ atk: 999, mp: 50, maxMp: 50, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(serverEnemyEntry);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverEnemyEntry.enemy.stats.hp = 1;
    serverEnemyEntry.enemy.stats.def = 0;
    serverEnemyEntry.enemy.stats.spd = 0;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'cast-inf-t3',
        actorId: serverActor.id,
        kind: 'castSkill',
        payload: { skillId: 'inf_t3', targetId: serverEnemyEntry.enemy.id },
    }, 1_000));

    const event = result.broadcasts.find((message) => message.type === 'COMBAT_EVENT' && message.kind === 'kill');
    assert.equal(event?.type, 'COMBAT_EVENT');
    assert.equal(event?.sourceName, 'Hero Alpha');
    assert.equal(event?.targetName, serverEnemyEntry.enemy.name);
    assert.equal(session.createSnapshot(joined.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id)?.stats.mp, 40);
});

test('castSkill rejects a learned-but-unequipped skill', () => {
    const session = new WorldSession();
    // Infantry T5 learns >8 skills, so the default loadout benches inf_t3.
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            currentTier: 5,
            stats: createBaseStats({ atk: 999, mp: 50, maxMp: 50, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(!serverActor.magicLoadout.includes('inf_t3'), 'inf_t3 should be benched at T5 default loadout');
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'cast-benched',
        actorId: serverActor.id,
        kind: 'castSkill',
        payload: { skillId: 'inf_t3', targetId: serverEnemyEntry.enemy.id },
    }, 1_000);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(result.replies[0]?.type === 'ACTION_REJECTED' ? result.replies[0].reason : '', /not equipped/);
});

test('server-owned scenario entry spawns objective enemies and records completion for raid result', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'burgos_castle');
    const interior = getStoryInteriorLayout('burgos_castle');
    assert.ok(serverActor);
    assert.ok(dungeon);
    assert.ok(interior);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);
    const entrance = { ...serverActor.tile };

    const enter = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-burgos',
        actorId: serverActor.id,
        dungeonId: 'burgos_castle',
    }, 1_000);

    assert.equal(enter.replies.length, 0);
    const enteredSnapshot = session.createSnapshot(joined.playerId, 1_000);
    assert.equal(enteredSnapshot.scenario.activeDungeonId, 'burgos_castle');
    assert.ok(enteredSnapshot.scenario.enteredDungeonIds.includes('burgos_castle'));
    assert.ok(enteredSnapshot.enemies.some((enemy) => enemy.isBoss && enemy.name === '키스라'));
    const guard = enteredSnapshot.enemies.find((enemy) => enemy.monsterId === '303R');
    assert.ok(guard);
    const guardBalance = getNormalizedMonsterBalance('303R', guard.level);
    assert.equal(guardBalance.source, 'original');
    assert.equal(guard.stats.maxHp, guardBalance.stats.maxHp);
    assert.equal(guard.stats.atk, guardBalance.stats.atk);
    assert.deepEqual(enteredSnapshot.partyActors.find((entry) => entry.id === serverActor.id)?.tile, interior.playerStart);

    const bossEntry = [...internals.enemies.values()].find((entry: any) => entry.scenarioObjective);
    assert.ok(bossEntry);
    assert.deepEqual({ x: bossEntry.enemy.gridX, y: bossEntry.enemy.gridY }, interior.bossTile);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: bossEntry.enemy.gridX - 1, y: bossEntry.enemy.gridY };
    bossEntry.enemy.stats.hp = 1;
    bossEntry.enemy.stats.def = 0;
    bossEntry.enemy.stats.spd = 0;

    const attack = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'kill-burgos',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: bossEntry.enemy.id },
    }, 1_100));
    const event = attack.broadcasts.find((message) => message.type === 'COMBAT_EVENT');
    assert.equal(event?.type, 'COMBAT_EVENT');
    assert.equal(event?.kind, 'kill');

    const completedSnapshot = session.createSnapshot(joined.playerId, 1_100);
    assert.equal(completedSnapshot.scenario.activeDungeonId, null);
    assert.ok(completedSnapshot.scenario.completedDungeonIds.includes('burgos_castle'));
    assert.deepEqual(completedSnapshot.partyActors.find((entry) => entry.id === serverActor.id)?.tile, entrance);
    assert.equal(completedSnapshot.enemies.some((enemy) => enemy.id !== bossEntry.enemy.id && enemy.id.startsWith('scenario_')), false);

    const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 1_200);
    const result = leave.replies.find((message) => message.type === 'RAID_RESULT');
    assert.equal(result?.type, 'RAID_RESULT');
    assert.deepEqual(result?.completedDungeonIds, ['burgos_castle']);
});

test('solo interior scenario enemies stay private to the entering player', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const joinedA = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const joinedB = session.join({
        ...joinMessage('central_castle', 'hero-b'),
        partyComposition: [actor('hero-b', {
            name: 'Hero Beta',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const actorA = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedA.playerId);
    const actorB = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedB.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'burgos_castle');
    const interior = getStoryInteriorLayout('burgos_castle');
    assert.ok(actorA);
    assert.ok(actorB);
    assert.ok(dungeon);
    assert.ok(interior);
    actorA.tile = world.getDungeonEntranceTile(dungeon);

    const enter = session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-private-burgos',
        actorId: actorA.id,
        dungeonId: 'burgos_castle',
    }, 1_000);

    assert.equal(enter.replies.length, 0);
    assert.equal(internals.scenarioStates.get(joinedA.playerId)?.missionKind, 'soloInterior');
    const bossEntry = [...internals.enemies.values()].find((entry: any) => entry.scenarioObjective);
    assert.ok(bossEntry);

    const snapshotA = session.createSnapshot(joinedA.playerId, 1_000);
    const snapshotB = session.createSnapshot(joinedB.playerId, 1_000);
    assert.ok(snapshotA.enemies.some((enemy) => enemy.id === bossEntry.enemy.id));
    assert.equal(snapshotB.enemies.some((enemy) => enemy.id === bossEntry.enemy.id), false);
    assert.deepEqual(snapshotA.partyActors.find((actorSnapshot) => actorSnapshot.id === actorA.id)?.tile, interior.playerStart);
    assert.equal(snapshotA.partyActors.some((actorSnapshot) => actorSnapshot.ownerPlayerId === joinedB.playerId), false);
    assert.equal(snapshotB.partyActors.some((actorSnapshot) => actorSnapshot.ownerPlayerId === joinedA.playerId), false);

    actorB.actionGauge = 100;
    actorB.remainingAp = 80;
    actorB.tile = { x: bossEntry.enemy.gridX - 1, y: bossEntry.enemy.gridY };
    const attack = session.handleMessage(joinedB.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-hidden-burgos',
        actorId: actorB.id,
        kind: 'attack',
        payload: { targetId: bossEntry.enemy.id },
    }, 1_100);

    assert.equal(attack.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(attack.replies[0]?.type === 'ACTION_REJECTED' ? attack.replies[0].reason : '', /not visible/);
});

test('server late story interiors spawn original objective and guard layouts through episode 31', () => {
    const world = new WorldMap();

    for (let episode = 23; episode <= 31; episode++) {
        const session = new WorldSession();
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `episode ${episode} scenario`);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        const interior = getStoryInteriorLayout(scenario.dungeonId);
        const monsterLayout = getStoryScenarioMonsterLayout(scenario);
        assert.ok(dungeon, `episode ${episode} dungeon`);
        assert.ok(interior, `episode ${episode} interior`);
        assert.ok(monsterLayout.bossMonsterId, `episode ${episode} boss monster`);

        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < episode)
            .map((entry) => entry.questId);
        const joined = session.join({
            ...joinMessage('central_castle', `hero-ep${episode}`),
            completedQuestIds,
        }, episode);
        const internals = session as any;
        const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);
        const returnTile = { ...serverActor.tile };

        const result = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);

        assert.equal(result.replies.length, 0, `episode ${episode} enter`);
        const state = internals.scenarioStates.get(joined.playerId);
        assert.ok(state, `episode ${episode} scenario state`);
        assert.equal(state.dungeonId, scenario.dungeonId, `episode ${episode} dungeon id`);
        assert.equal(state.missionKind, 'soloInterior', `episode ${episode} mission kind`);
        assert.deepEqual(state.returnTile, returnTile, `episode ${episode} return tile`);
        assert.equal(state.enemyIds.length, scenario.guardCount + 1, `episode ${episode} enemy count`);

        const serverEnemies = state.enemyIds.map((id: string) => internals.enemies.get(id));
        assert.equal(serverEnemies.every(Boolean), true, `episode ${episode} server enemies`);
        const guards = serverEnemies.filter((entry: any) => !entry.scenarioObjective);
        const boss = serverEnemies.find((entry: any) => entry.scenarioObjective);
        assert.equal(guards.length, scenario.guardCount, `episode ${episode} guard count`);
        assert.ok(boss, `episode ${episode} objective boss`);
        assert.equal(boss.monsterId, monsterLayout.bossMonsterId, `episode ${episode} boss monster id`);
        assert.deepEqual({ x: boss.enemy.gridX, y: boss.enemy.gridY }, getOriginalLateStoryBossTile(episode), `episode ${episode} boss tile`);

        const expectedGuardTiles = getOriginalLateStoryGuardTiles(episode);
        guards.forEach((entry: any, index: number) => {
            assert.equal(entry.monsterId, monsterLayout.guardMonsterIds[index % monsterLayout.guardMonsterIds.length], `episode ${episode} guard ${index} monster`);
            assert.deepEqual({ x: entry.enemy.gridX, y: entry.enemy.gridY }, expectedGuardTiles[index], `episode ${episode} guard ${index} tile`);
            const guardBalance = getNormalizedMonsterBalance(entry.monsterId, entry.enemy.level);
            assert.equal(guardBalance.source, 'original', `episode ${episode} guard ${index} balance source`);
            const expectedGuard = new Enemy('expected', 0, 0, entry.enemy.name, entry.enemy.level, entry.enemy.color, entry.enemy.role, entry.monsterId);
            assert.equal(entry.enemy.stats.maxHp, expectedGuard.stats.maxHp, `episode ${episode} guard ${index} hp`);
            assert.equal(entry.enemy.stats.atk, expectedGuard.stats.atk, `episode ${episode} guard ${index} atk`);
        });

        const snapshot = session.createSnapshot(joined.playerId, 2_000 + episode);
        assert.equal(snapshot.scenario.activeDungeonId, scenario.dungeonId, `episode ${episode} active dungeon`);
        assert.ok(snapshot.scenario.enteredDungeonIds.includes(scenario.dungeonId), `episode ${episode} entered`);
        assert.deepEqual(snapshot.partyActors.find((entry) => entry.id === serverActor.id)?.tile, interior.playerStart, `episode ${episode} player start`);
        for (const enemyId of state.enemyIds) {
            assert.ok(snapshot.enemies.some((enemy) => enemy.id === enemyId), `episode ${episode} visible enemy ${enemyId}`);
        }
    }
});

test('server late story boss clears secure original EVENT 99 rewards only after survival through episode 31', () => {
    const world = new WorldMap();

    for (let episode = 23; episode <= 31; episode++) {
        const session = new WorldSession();
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `episode ${episode} scenario`);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        assert.ok(dungeon, `episode ${episode} dungeon`);
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < episode)
            .map((entry) => entry.questId);
        const character = authCharacter(`clear-ep${episode}`);
        const save = createDefaultCharacterSave(character);
        save.questState = { ...save.questState, completedQuestIds };
        const joined = session.join({
            ...joinMessage('central_castle', character.id),
            completedQuestIds,
            partyComposition: [actor(character.id, {
                stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
            })],
        }, episode, {
            accountId: character.accountId,
            characterId: character.id,
            completedQuestIds,
            saveSnapshot: save,
        });
        const internals = session as any;
        const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        const enter = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-clear-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);
        assert.equal(enter.replies.length, 0, `episode ${episode} enter`);

        const bossEntry = [...internals.enemies.values()].find((entry: any) => entry.scenarioObjective);
        assert.ok(bossEntry, `episode ${episode} boss`);
        serverActor.actionGauge = 100;
        serverActor.remainingAp = 80;
        serverActor.tile = { x: bossEntry.enemy.gridX - 1, y: bossEntry.enemy.gridY };
        bossEntry.enemy.stats.hp = 1;
        bossEntry.enemy.stats.def = 0;
        bossEntry.enemy.stats.spd = 0;

        const attack = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
            type: 'PLAYER_INTENT',
            intentId: `kill-clear-ep${episode}`,
            actorId: serverActor.id,
            kind: 'attack',
            payload: { targetId: bossEntry.enemy.id },
        }, 2_000 + episode));
        const kill = attack.broadcasts.find((message) => message.type === 'COMBAT_EVENT');
        assert.equal(kill?.type, 'COMBAT_EVENT', `episode ${episode} kill event type`);
        assert.equal(kill?.kind, 'kill', `episode ${episode} kill event`);

        const serverPlayer = internals.players.get(joined.playerId);
        assert.ok(serverPlayer, `episode ${episode} server player`);
        const expectedRewards = getOriginalLateStoryItemsForSourceEvent(episode, 99)
            .map((item) => item.currentItemId)
            .sort((left, right) => left.localeCompare(right));
        assert.equal(serverPlayer.completedDungeonIds.has(scenario.dungeonId), true, `episode ${episode} completed dungeon`);
        assert.deepEqual(
            [...serverPlayer.carriedItems.entries()]
                .filter(([itemId]: [string, number]) => itemId.startsWith('orig_late_'))
                .sort(([left]: [string, number], [right]: [string, number]) => left.localeCompare(right)),
            expectedRewards.map((itemId) => [itemId, 1] as [string, number]),
            `episode ${episode} EVENT 99 carried rewards`
        );

        const dirtyPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(dirtyPatch?.inventory, `episode ${episode} dirty patch`);
        const dirtyQuestState = dirtyPatch.questState;
        assert.ok(dirtyQuestState, `episode ${episode} dirty quest state`);
        assert.deepEqual(
            dirtyPatch.inventory.items
                .filter((item) => expectedRewards.includes(item.itemId))
                .map((item) => item.itemId),
            [],
            `episode ${episode} dirty patch excludes EVENT 99 rewards`
        );
        assert.deepEqual(
            dirtyQuestState.completedQuestIds,
            completedQuestIds,
            `episode ${episode} dirty patch excludes raid quest completion`
        );

        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 3_000 + episode);
        assert.equal(leave.replies[0]?.type, 'RAID_RESULT', `episode ${episode} raid result`);
        const finalPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(finalPatch?.inventory, `episode ${episode} final patch`);
        const finalQuestState = finalPatch.questState;
        assert.ok(finalQuestState, `episode ${episode} final quest state`);
        assert.deepEqual(
            finalPatch.inventory.items
                .filter((item) => expectedRewards.includes(item.itemId))
                .map((item) => [item.itemId, item.acquiredInRaid] as [string, boolean | undefined])
                .sort(([left], [right]) => left.localeCompare(right)),
            expectedRewards.map((itemId) => [itemId, undefined] as [string, boolean | undefined]),
            `episode ${episode} survived final patch secures EVENT 99 rewards`
        );
        assert.deepEqual(
            finalQuestState.completedQuestIds,
            [...completedQuestIds, scenario.questId],
            `episode ${episode} survived final patch includes raid quest completion`
        );
    }
});

test('server late story boss rewards are not persisted on failed raid results', () => {
    const world = new WorldMap();

    for (let episode = 23; episode <= 31; episode++) {
        const session = new WorldSession();
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `episode ${episode} scenario`);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        assert.ok(dungeon, `episode ${episode} dungeon`);
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < episode)
            .map((entry) => entry.questId);
        const character = authCharacter(`failed-ep${episode}`);
        const save = createDefaultCharacterSave(character);
        save.questState = { ...save.questState, completedQuestIds };
        const joined = session.join({
            ...joinMessage('central_castle', character.id),
            completedQuestIds,
            partyComposition: [actor(character.id, {
                stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
            })],
        }, episode, {
            accountId: character.accountId,
            characterId: character.id,
            completedQuestIds,
            saveSnapshot: save,
        });
        const internals = session as any;
        const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-failed-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);

        const bossEntry = [...internals.enemies.values()].find((entry: any) => entry.scenarioObjective);
        assert.ok(bossEntry, `episode ${episode} boss`);
        serverActor.actionGauge = 100;
        serverActor.remainingAp = 80;
        serverActor.tile = { x: bossEntry.enemy.gridX - 1, y: bossEntry.enemy.gridY };
        bossEntry.enemy.stats.hp = 1;
        bossEntry.enemy.stats.def = 0;
        bossEntry.enemy.stats.spd = 0;

        withFixedRandom(0, () => session.handleMessage(joined.playerId, {
            type: 'PLAYER_INTENT',
            intentId: `kill-failed-ep${episode}`,
            actorId: serverActor.id,
            kind: 'attack',
            payload: { targetId: bossEntry.enemy.id },
        }, 2_000 + episode));

        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'wipe' }, 3_000 + episode);
        assert.equal(leave.replies[0]?.type, 'RAID_RESULT', `episode ${episode} raid result`);
        const finalPatch = session.createCharacterSavePatch(joined.playerId);
        const expectedRewards = getOriginalLateStoryItemsForSourceEvent(episode, 99).map((item) => item.currentItemId);
        assert.ok(finalPatch?.inventory, `episode ${episode} final patch`);
        const finalQuestState = finalPatch.questState;
        assert.ok(finalQuestState, `episode ${episode} final quest state`);
        assert.deepEqual(
            finalPatch.inventory.items
                .filter((item) => expectedRewards.includes(item.itemId))
                .map((item) => item.itemId),
            [],
            `episode ${episode} failed final patch excludes EVENT 99 rewards`
        );
        assert.deepEqual(
            finalQuestState.completedQuestIds,
            completedQuestIds,
            `episode ${episode} failed final patch excludes raid quest completion`
        );
    }
});

test('scenario entry validates quest prerequisites on the server', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const joined = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'zamora_fortress');
    assert.ok(serverActor);
    assert.ok(dungeon);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    const result = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-zamora',
        actorId: serverActor.id,
        dungeonId: 'zamora_fortress',
    }, 1_000);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(result.replies[0]?.type === 'ACTION_REJECTED' ? result.replies[0].reason : '', /prerequisite/);
});

test('bossless server scenarios complete immediately while keeping optional enemies online', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 17)
        .map((scenario) => scenario.questId);
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        completedQuestIds,
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'airship');
    assert.ok(serverActor);
    assert.ok(dungeon);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    const result = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-airship',
        actorId: serverActor.id,
        dungeonId: 'airship',
    }, 1_000);

    assert.equal(result.replies.length, 0);
    const snapshot = session.createSnapshot(joined.playerId, 1_000);
    assert.equal(snapshot.scenario.activeDungeonId, null);
    assert.ok(snapshot.scenario.enteredDungeonIds.includes('airship'));
    assert.ok(snapshot.scenario.completedDungeonIds.includes('airship'));
    assert.ok(snapshot.enemies.filter((enemy) => enemy.id.startsWith('scenario_')).length >= 2);
});

test('server-authoritative field scenario events complete per player without trusting reward payloads', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const joinedA = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        completedQuestIds,
    }, 0);
    const joinedB = session.join({
        ...joinMessage('central_castle', 'hero-b'),
        completedQuestIds,
    }, 0);
    const internals = session as any;
    const actorA = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedA.playerId);
    const actorB = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedB.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'arcadia_plain');
    const sequence = getStoryScenarioEventSequence('arcadia_plain');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'arcadia_gold_chest_01');
    assert.ok(actorA);
    assert.ok(actorB);
    assert.ok(dungeon);
    assert.ok(event);
    actorA.tile = world.getDungeonEntranceTile(dungeon);
    actorB.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-arcadia-a',
        actorId: actorA.id,
        dungeonId: 'arcadia_plain',
    }, 1_000);
    session.handleMessage(joinedB.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-arcadia-b',
        actorId: actorB.id,
        dungeonId: 'arcadia_plain',
    }, 1_000);

    const [eventTile] = getStoryScenarioFieldEventTiles('arcadia_plain', event, world);
    actorA.tile = { x: eventTile.x, y: eventTile.y + 1 };
    const result = session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-arcadia-gold-a',
        actorId: actorA.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_gold_chest_01',
    }, 1_100);

    const fieldResult = result.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult.scope, 'player');
    assert.equal(fieldResult.flag, 'arcadia_gold_chest_01');
    assert.deepEqual(fieldResult.rewards, [{ type: 'gold', amount: 100 }]);
    assert.equal('amount' in (result.replies[0] as any) && (result.replies[0] as any).amount === 9999, false);

    const snapshotA = session.createSnapshot(joinedA.playerId, 1_100);
    const snapshotB = session.createSnapshot(joinedB.playerId, 1_100);
    assert.deepEqual(snapshotA.scenario.playerFieldEventFlagsByDungeonId?.arcadia_plain, ['arcadia_gold_chest_01']);
    assert.equal(snapshotB.scenario.playerFieldEventFlagsByDungeonId?.arcadia_plain, undefined);

    const duplicate = session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-arcadia-gold-a-again',
        actorId: actorA.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_gold_chest_01',
    }, 1_200);
    assert.equal(duplicate.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(duplicate.replies[0]?.type === 'ACTION_REJECTED' ? duplicate.replies[0].reason : '', /already complete/);
});

test('server-authoritative field scenario events reject invalid actors and distant requests', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const joinedA = session.join({ ...joinMessage('central_castle', 'hero-a'), completedQuestIds }, 0);
    const joinedB = session.join({ ...joinMessage('central_castle', 'hero-b'), completedQuestIds }, 0);
    const internals = session as any;
    const actorA = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedA.playerId);
    const actorB = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedB.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'arcadia_plain');
    assert.ok(actorA);
    assert.ok(actorB);
    assert.ok(dungeon);
    actorA.tile = world.getDungeonEntranceTile(dungeon);
    session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-arcadia-invalid',
        actorId: actorA.id,
        dungeonId: 'arcadia_plain',
    }, 1_000);

    const wrongOwner = session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'wrong-owner-field-event',
        actorId: actorB.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_gold_chest_01',
    }, 1_100);
    assert.equal(wrongOwner.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(wrongOwner.replies[0]?.type === 'ACTION_REJECTED' ? wrongOwner.replies[0].reason : '', /not owned/);

    actorA.tile = { x: actorA.tile.x + 20, y: actorA.tile.y + 20 };
    const distant = session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'distant-field-event',
        actorId: actorA.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_gold_chest_01',
    }, 1_200);
    assert.equal(distant.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(distant.replies[0]?.type === 'ACTION_REJECTED' ? distant.replies[0].reason : '', /too far/);
});

test('server field scenario enemy deaths return original CHARDEAD presentation steps', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 12)
        .map((scenario) => scenario.questId);
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        completedQuestIds,
        partyComposition: [actor('hero-a', {
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'pyramid_front');
    assert.ok(serverActor);
    assert.ok(dungeon);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-pyramid-front',
        actorId: serverActor.id,
        dungeonId: 'pyramid_front',
    }, 1_000);

    const state = internals.scenarioStates.get(joined.playerId);
    assert.ok(state);
    assert.equal(state.enemyIds.length, 18);
    const guard = internals.enemies.get(state.enemyIds[16]);
    assert.ok(guard);
    guard.enemy.stats.hp = 1;
    guard.enemy.stats.def = 0;
    guard.enemy.stats.spd = 0;
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: guard.enemy.gridX - 1, y: guard.enemy.gridY };

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'kill-pyramid-front-late-guard',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: guard.enemy.id },
    }, 1_100));

    const deathEvent = result.replies.find((message) => message.type === 'SCENARIO_ENEMY_DEFEAT_EVENT');
    assert.equal(deathEvent?.type, 'SCENARIO_ENEMY_DEFEAT_EVENT');
    assert.equal(deathEvent.dungeonId, 'pyramid_front');
    assert.equal(deathEvent.enemyId, guard.enemy.id);
    assert.equal(deathEvent.eventId, 'pyramid_front_enemy_defeat_730');
    assert.deepEqual(deathEvent.presentationSteps.map((step) => step.kind === 'dialogue' ? step.textKey : ''), [
        'story.event.ep12.enemyDefeat.730',
    ]);
    assert.deepEqual(deathEvent.presentationSteps[0]?.kind === 'dialogue' ? deathEvent.presentationSteps[0].focus : null, {
        x: guard.enemy.gridX,
        y: guard.enemy.gridY,
    });
});

test('shared field scenario event flags are included for late join snapshots', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const sequence = getStoryScenarioEventSequence('arcadia_plain');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'arcadia_child_rescue');
    assert.ok(event);
    const previousScope = event.scope;
    event.scope = 'shared';
    try {
        const completedQuestIds = STORY_SCENARIOS
            .filter((scenario) => scenario.episode < 4)
            .map((scenario) => scenario.questId);
        const joinedA = session.join({ ...joinMessage('central_castle', 'hero-a'), completedQuestIds }, 0);
        const internals = session as any;
        const actorA = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joinedA.playerId);
        const dungeon = world.getDungeons().find((entry) => entry.id === 'arcadia_plain');
        assert.ok(actorA);
        assert.ok(dungeon);
        actorA.tile = world.getDungeonEntranceTile(dungeon);
        session.handleMessage(joinedA.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: 'enter-arcadia-shared',
            actorId: actorA.id,
            dungeonId: 'arcadia_plain',
        }, 1_000);
        const [eventTile] = getStoryScenarioFieldEventTiles('arcadia_plain', event, world);
        actorA.tile = { x: eventTile.x, y: eventTile.y + 1 };

        const result = session.handleMessage(joinedA.playerId, {
            type: 'SCENARIO_FIELD_EVENT_INTERACT',
            intentId: 'shared-arcadia-child',
            actorId: actorA.id,
            dungeonId: 'arcadia_plain',
            eventId: event.id,
        }, 1_100);
        assert.equal(result.replies[0]?.type, 'SCENARIO_FIELD_EVENT_RESULT');
        assert.equal(result.replies[0]?.type === 'SCENARIO_FIELD_EVENT_RESULT' ? result.replies[0].scope : '', 'shared');

        const joinedB = session.join({ ...joinMessage('central_castle', 'hero-b'), completedQuestIds }, 1_200);
        const snapshotB = session.createSnapshot(joinedB.playerId, 1_200);
        assert.deepEqual(snapshotB.scenario.sharedFieldEventFlagsByDungeonId?.arcadia_plain, ['arcadia_child_rescued']);
    } finally {
        event.scope = previousScope;
    }
});

test('network auto-loot exposes unaccepted leftovers on the field', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    assert.ok(serverEnemyEntry);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverEnemyEntry.enemy.stats.hp = 1;
    serverEnemyEntry.enemy.stats.def = 0;
    serverEnemyEntry.enemy.stats.spd = 0;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-leftover-loot',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: serverEnemyEntry.enemy.id },
    }, 1_000));
    const grant = result.replies.find((message): message is AutoLootGrantMessage => message.type === 'AUTO_LOOT_GRANT');
    assert.ok(grant);

    session.handleMessage(joined.playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: [],
    }, 1_050);

    const exposed = session.createSnapshot(joined.playerId, 1_050).loot.find((loot) => loot.id === grant.lootId);
    assert.ok(exposed);
    assert.equal(exposed.gridSnapshot.items.length, grant.gridSnapshot.items.length);
});

test('server generates nest content around roaming players', () => {
    const session = new WorldSession();
    const joined = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    assert.ok(serverActor);

    const beforeIds = new Set(session.createSnapshot(joined.playerId, 0).enemies.map((enemy) => enemy.id));
    serverActor.tile = { x: 67 * 32 + 16, y: 34 * 32 + 16 };
    session.tick(1_000);

    const spawned = session.createSnapshot(joined.playerId, 1_000).enemies
        .filter((enemy) => !beforeIds.has(enemy.id));
    assert.ok(spawned.length > 0, 'roaming into a distant chunk should create online nest enemies');
    assert.ok(spawned.some((enemy) =>
        Math.abs(Math.floor(enemy.tile.x / 32) - 67) <= 1
        && Math.abs(Math.floor(enemy.tile.y / 32) - 34) <= 1
    ));

    const firstSpawned = spawned.find((enemy) => enemy.monsterId);
    assert.ok(firstSpawned);
    const expected = new Enemy(
        'expected',
        0,
        0,
        firstSpawned.name,
        firstSpawned.level,
        firstSpawned.color,
        firstSpawned.role as Enemy['role'],
        firstSpawned.monsterId
    );
    assert.equal(firstSpawned.stats.maxHp, expected.stats.maxHp);
    assert.equal(firstSpawned.stats.atk, expected.stats.atk);
});

test('cleared field nests respawn after five minutes away from active actors', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = session as any;
    const serverActor = [...internals.actors.values()].find((entry: any) => entry.ownerPlayerId === joined.playerId);
    const state = [...internals.nestStates.values()].find((entry: any) => entry.monsterIds.length > 0);
    assert.ok(serverActor);
    assert.ok(state);

    for (const enemyId of [...state.monsterIds]) {
        const entry = internals.enemies.get(enemyId);
        assert.ok(entry);
        serverActor.tile = { x: entry.enemy.gridX - 1, y: entry.enemy.gridY };
        serverActor.actionGauge = 100;
        serverActor.remainingAp = 80;
        entry.enemy.stats.hp = 1;
        entry.enemy.stats.def = 0;
        withFixedRandom(0, () => session.handleMessage(joined.playerId, {
            type: 'PLAYER_INTENT',
            intentId: `clear-${enemyId}`,
            actorId: serverActor.id,
            kind: 'attack',
            payload: { targetId: enemyId },
        }, 10_000));
    }

    assert.equal(state.cleared, true);
    assert.equal(state.monsterIds.length, 0);
    const respawnAt = state.respawnAt;
    assert.ok(respawnAt >= 310_000);

    serverActor.tile = { ...state.centerTile };
    session.tick(respawnAt + 1);
    assert.equal(state.monsterIds.length, 0, 'nest should not respawn inside the 18-tile safety radius');

    const stateChunkX = Math.floor(state.centerTile.x / CHUNK_SIZE);
    const stateChunkY = Math.floor(state.centerTile.y / CHUNK_SIZE);
    let outsideSafeTile: { x: number; y: number } | null = null;
    const chunkMinX = stateChunkX * CHUNK_SIZE;
    const chunkMinY = stateChunkY * CHUNK_SIZE;
    for (let y = chunkMinY; y < chunkMinY + CHUNK_SIZE && !outsideSafeTile; y++) {
        for (let x = chunkMinX; x < chunkMinX + CHUNK_SIZE; x++) {
            const distance = Math.abs(x - state.centerTile.x) + Math.abs(y - state.centerTile.y);
            if (distance <= ENEMY_AGGRO_RANGE) continue;
            if (!internals.worldMap.isWalkable(x, y)) continue;
            outsideSafeTile = { x, y };
            break;
        }
    }
    assert.ok(outsideSafeTile, 'test fixture should find a same-chunk tile outside the nest spawn safety radius');
    serverActor.tile = outsideSafeTile;
    session.tick(respawnAt + 1_001);
    assert.ok(state.monsterIds.length > 0, 'nest should respawn once the timer passed and actors are outside the spawn safety radius');
});
