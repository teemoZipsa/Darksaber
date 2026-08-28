import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { createStatus } from '../../src/combat/StatusEffects';
import { getNormalizedMonsterBalance } from '../../src/data/original/originalMonsterBalance';
import { Enemy } from '../../src/entity/Enemy';
import type { ActorSnapshot, AutoLootGrantMessage, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { WorldMap } from '../../src/map/WorldMap';
import { CHUNK_SIZE } from '../../src/map/Chunk';
import { WorldResumeFailedError, WorldSession } from '../../server/WorldSession';
import {
    FIELD_NEST_ACTOR_SAFE_DISTANCE,
    FIELD_NEST_CENTER_SAFE_DISTANCE,
} from '../../server/WorldSessionFieldNests';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { getItemDef } from '../../src/data/ItemDB';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { FIRST_SURVIVAL_QUEST_ID } from '../../src/shared/FirstSurvivalReward';
import { getStoryScenarioMonsterLayout } from '../../src/data/StoryScenarioMonsterData';
import { getStoryScenarioEventSequence, getStoryScenarioPresentationDurationMs } from '../../src/data/StoryScenarioEventData';
import { getStoryScenarioFieldEventFlag, getStoryScenarioFieldEventTiles } from '../../src/data/StoryScenarioFieldEventPlacement';
import { getStoryInteriorLayout } from '../../src/data/StoryInteriorData';
import {
    getOriginalLateStoryBossTile,
    getOriginalLateStoryGuardTiles,
} from '../../src/data/OriginalLateStoryFacts';
import { getOriginalLateStoryItemsForSourceEvent } from '../../src/data/OriginalLateStoryItems';
import { MASTER_KEY_ITEM_ID } from '../../src/raid/MarkedCache';
import { ENEMY_SIMULATION_ACTIVE_RANGE } from '../../src/field/FieldConfig';
import { getOrderedLearnedSkills } from '../../src/magic/MagicLoadout';
import type { InventorySaveSnapshot } from '../../src/shared/CharacterSave';
import {
    clearEnemiesForTest,
    getActorForPlayer,
    getEnemyById,
    getFirstActor,
    getFirstEnemy,
    getPlayerDebugState,
    getScenarioEnemies,
    getScenarioObjectiveEnemy,
    getScenarioState,
    getWorldSessionDebugState,
    readyActorAt,
} from './world-session-harness';

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

function joinWithCarriedItem(originHubId: string, id: string, itemId: string): WorldJoinMessage {
    return {
        ...joinMessage(originHubId, id),
        carriedItems: [{ itemId, quantity: 1 }],
    };
}

test('world session expires server-authoritative timed meal statuses', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'meal-hero'),
        partyComposition: [actor('meal-hero', {
            statuses: [createStatus('attackUp', {
                activation: 'on_raid_start',
                durationSeconds: 0.1,
                remainingSeconds: 0.1,
                sourceType: 'rest',
                sourceRestMenuId: 'meat_plate',
            })],
        })],
    }, 0);

    session.tick(0);
    session.tick(500);

    assert.deepEqual(session.createSnapshot(joined.playerId, 500).partyActors[0]?.statuses, []);
});

test('world session exposes equipment-adjusted base stats only for remote actors', () => {
    const session = new WorldSession();
    const first = session.join(joinMessage('central_castle', 'equipped-hero'), 0, {
        equipmentStatBonuses: { 'equipped-hero': { maxHp: 20, atk: 5 } },
    });
    const second = session.join(joinMessage('central_castle', 'viewer-hero'), 0);

    const ownView = session.createSnapshot(first.playerId, 100).partyActors
        .find((entry) => entry.ownerPlayerId === first.playerId);
    const remoteView = session.createSnapshot(second.playerId, 100).partyActors
        .find((entry) => entry.ownerPlayerId === first.playerId);

    assert.ok(ownView);
    assert.ok(remoteView);
    assert.equal(remoteView.stats.maxHp, ownView.stats.maxHp + 20);
    assert.equal(remoteView.stats.atk, ownView.stats.atk + 5);
});

test('server rejects a mage basic attack beyond the equipped weapon range', () => {
    const session = new WorldSession();
    const localActorId = 'mage-range-hero';
    const joined = session.join({
        ...joinMessage('central_castle', localActorId),
        partyComposition: [actor(localActorId, { classLineId: 'mage' })],
    }, 0, {
        equipmentAttackRanges: { [localActorId]: 1 },
    });
    const serverActor = getActorForPlayer(session, joined.playerId);
    const serverEnemy = getFirstEnemy(session);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: serverEnemy.enemy.gridX - 2, y: serverEnemy.enemy.gridY };

    const result = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'mage-basic-too-far',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: serverEnemy.enemy.id },
    }, 1_000);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(
        result.replies[0]?.type === 'ACTION_REJECTED' ? result.replies[0].reason : '',
        /out of range/i,
    );
});

function withFixedRandom<T>(value: number, callback: () => T): T {
    const previousRandom = Math.random;
    Math.random = () => value;
    try {
        return callback();
    } finally {
        Math.random = previousRandom;
    }
}

function readyActorNextToLoot(session: WorldSession, playerId: string, lootId: string): string {
    const snapshot = session.createSnapshot(playerId, 1_000);
    const loot = snapshot.loot.find((entry) => entry.id === lootId);
    assert.ok(loot);
    return readyActorAt(session, playerId, loot.tile).id;
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

function fullInventory(width: number, height: number): InventorySaveSnapshot {
    const filler = getItemDef('herb_cheap');
    assert.ok(filler);
    const items: InventorySaveSnapshot['items'] = [];
    for (let y = 0; y < height; y += filler.gridH) {
        for (let x = 0; x < width; x += filler.gridW) {
            items.push({
                itemId: filler.id,
                gridX: x,
                gridY: y,
                quantity: 1,
                durability: filler.maxDurability,
            });
        }
    }
    return { width, height, items };
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

test('server town leave only survives at a non-departure town', () => {
    const world = new WorldMap();
    const central = world.getTowns().find((town) => town.id === 'central_castle');
    const forest = world.getTowns().find((town) => town.id === 'w_forest_village');
    assert.ok(central);
    assert.ok(forest);
    const cases = [
        {
            id: 'same-town',
            tile: world.getTownSpawnTile(central),
            expectedResult: 'LEFT',
            expectedExtraction: 'central_castle',
        },
        {
            id: 'outside-town',
            tile: world.getTownExitTile(central),
            expectedResult: 'LEFT',
            expectedExtraction: 'central_castle',
        },
        {
            id: 'other-town',
            tile: world.getTownSpawnTile(forest),
            expectedResult: 'SURVIVED',
            expectedExtraction: 'w_forest_village',
        },
    ] as const;

    for (const entry of cases) {
        const session = new WorldSession();
        const joined = session.join(joinMessage('central_castle', `hero-${entry.id}`), 0);
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((actorEntry) => actorEntry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `${entry.id} actor`);
        serverActor.tile = { ...entry.tile };

        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 1_000);
        const result = leave.replies[0];
        assert.equal(result?.type, 'RAID_RESULT', `${entry.id} result type`);
        if (result?.type !== 'RAID_RESULT') continue;
        assert.equal(result.result, entry.expectedResult, `${entry.id} result`);
        assert.equal(result.extractionTownId, entry.expectedExtraction, `${entry.id} extraction`);
    }
});

test('server shutdown preserves active raids for resume without granting survival', () => {
    const session = new WorldSession();
    const character = authCharacter('hero-shutdown');
    const joined = session.join(joinMessage('central_castle', character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: createDefaultCharacterSave(character),
    });
    const raidItem = getItemDef('herb_common');
    assert.ok(raidItem);
    const serverPlayer = getPlayerDebugState(session, joined.playerId);
    assert.ok(serverPlayer.saveSnapshot);
    serverPlayer.saveSnapshot.inventory.items.push({
        itemId: raidItem.id,
        gridX: 4,
        gridY: 0,
        quantity: 1,
        durability: raidItem.maxDurability,
        acquiredInRaid: true,
    });

    assert.equal(session.prepareActivePlayersForShutdown(1_000), 1);
    assert.equal(session.getDebugCounts().ghostPlayers, 1);
    assert.equal(session.hasFinalCharacterSavePatch(joined.playerId), false);

    const snapshot = session.createPersistentSnapshot();
    const savedPlayer = snapshot.players.find((player) => player.id === joined.playerId);
    assert.ok(savedPlayer);
    assert.ok(savedPlayer.saveSnapshot);
    assert.equal(savedPlayer.ghost, true);
    assert.equal(savedPlayer.disconnectedAt, 1_000);
    assert.ok(savedPlayer.saveSnapshot.inventory.items.some((item) => (
        item.itemId === raidItem.id && item.acquiredInRaid === true
    )));

    const restored = WorldSession.restorePersistentSnapshot(snapshot);
    const resumed = restored.reconnect(joined.welcome.resumeToken, 2_000);
    assert.ok(resumed);
    assert.equal(restored.hasFinalCharacterSavePatch(joined.playerId), false);
});

test('persistent world session snapshots restore active raid reconnect state', () => {
    const session = new WorldSession({ sessionEpoch: 123_456 });
    const character = authCharacter('hero-persisted');
    const joined = session.join(joinMessage('central_castle', character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: createDefaultCharacterSave(character),
    });
    const raidItem = getItemDef('herb_common');
    assert.ok(raidItem);

    const serverPlayer = getPlayerDebugState(session, joined.playerId);
    assert.ok(serverPlayer.saveSnapshot);
    serverPlayer.saveSnapshot.inventory.items.push({
        itemId: raidItem.id,
        gridX: 4,
        gridY: 0,
        quantity: 1,
        durability: raidItem.maxDurability,
        acquiredInRaid: true,
    });
    session.markCharacterSaveDirty(joined.playerId);

    const before = session.createSnapshot(joined.playerId, 1_000);
    session.disconnect(joined.playerId, 1_500);
    const serialized = JSON.parse(JSON.stringify(session.createPersistentSnapshot()));
    const restored = WorldSession.restorePersistentSnapshot(serialized);
    const reconnect = restored.reconnect(joined.welcome.resumeToken, 2_000);
    assert.ok(reconnect);
    assert.equal(reconnect.playerId, joined.playerId);
    assert.equal(reconnect.welcome.sessionEpoch, 123_456);

    const after = restored.createSnapshot(joined.playerId, 2_000);
    assert.equal(after.partyActors.length, before.partyActors.length);
    assert.equal(after.enemies.length, before.enemies.length);
    assert.equal(after.loot.length, before.loot.length);
    assert.deepEqual(after.players, before.players);
    assert.deepEqual(restored.consumeSaveDirtyPlayerIds(), [joined.playerId]);
    const recoveryPatch = restored.createRecoveryCharacterSavePatch(joined.playerId);
    assert.ok(recoveryPatch);
    assert.ok(recoveryPatch.inventory?.items.some((item) => item.itemId === raidItem.id));
});

test('roadside ambient sites are validated, rewarded, and completed by the server', () => {
    const world = new WorldMap();
    let site = null as ReturnType<WorldMap['getAmbientSitesForChunk']>[number] | null;
    for (let chunkY = 8; chunkY <= 85 && !site; chunkY++) {
        for (let chunkX = 8; chunkX <= 45 && !site; chunkX++) {
            site = world.getAmbientSitesForChunk(chunkX, chunkY)[0] ?? null;
        }
    }
    assert.ok(site);

    const character = authCharacter('ambient-site');
    const session = new WorldSession({ sessionEpoch: 44 });
    const joined = session.join(joinMessage('central_castle', character.id), 0, {
        characterId: character.id,
        saveSnapshot: createDefaultCharacterSave(character),
    });
    const serverActor = getActorForPlayer(session, joined.playerId);
    serverActor.remainingAp = 80;
    const distant = session.handleMessage(joined.playerId, {
        type: 'AMBIENT_SITE_INTERACT',
        intentId: 'ambient-far',
        actorId: serverActor.id,
        siteId: site.id,
    }, 998);
    assert.equal(distant.replies[0]?.type, 'ACTION_REJECTED');

    readyActorAt(session, joined.playerId, site.anchorTile, 14);
    const undercharged = session.handleMessage(joined.playerId, {
        type: 'AMBIENT_SITE_INTERACT',
        intentId: 'ambient-low-ap',
        actorId: serverActor.id,
        siteId: site.id,
    }, 999);
    assert.equal(undercharged.replies[0]?.type, 'ACTION_REJECTED');

    readyActorAt(session, joined.playerId, site.anchorTile);
    const first = session.handleMessage(joined.playerId, {
        type: 'AMBIENT_SITE_INTERACT',
        intentId: 'ambient-1',
        actorId: serverActor.id,
        siteId: site.id,
    }, 1_000);

    const result = first.replies[0];
    assert.equal(result?.type, 'AMBIENT_SITE_RESULT');
    assert.ok(result && result.type === 'AMBIENT_SITE_RESULT');
    assert.equal(result.siteId, site.id);
    assert.equal(serverActor.remainingAp, 65);
    assert.deepEqual(session.createSnapshot(joined.playerId, 1_001).scenario.inspectedAmbientSiteIds, [site.id]);

    const duplicate = session.handleMessage(joined.playerId, {
        type: 'AMBIENT_SITE_INTERACT',
        intentId: 'ambient-2',
        actorId: serverActor.id,
        siteId: site.id,
    }, 1_002);
    assert.equal(duplicate.replies[0]?.type, 'ACTION_REJECTED');
});

test('default character saves start with the shared no-shield basic kit', () => {
    const save = createDefaultCharacterSave(authCharacter('starter'));
    const equipment = save.equipment as Record<string, { itemId?: string }>;

    assert.equal(equipment.weapon?.itemId, 'short_sword');
    assert.equal(equipment.body?.itemId, 'battle_t1_body');
    assert.equal(Object.prototype.hasOwnProperty.call(equipment, 'shield'), false);
    assert.deepEqual(
        save.inventory.items.map((item) => [item.itemId, item.quantity]),
        [['herb_cheap', 2], ['mp_potion', 1]]
    );
});

test('default character saves use class-branch body armor', () => {
    const mage = { ...authCharacter('starter-mage'), classKey: 'mage' as const };
    const save = createDefaultCharacterSave(mage);
    const equipment = save.equipment as Record<string, { itemId?: string }>;

    assert.equal(equipment.weapon?.itemId, 'short_sword');
    assert.equal(equipment.body?.itemId, 'magic_t1_body');
    assert.equal(Object.prototype.hasOwnProperty.call(equipment, 'shield'), false);
});

test('server raid modifiers are announced in welcome, snapshot, and supply drops', () => {
    const session = new WorldSession({ sessionEpoch: 1 });
    const joined = session.join(joinMessage('central_castle', 'supply'), 0);

    assert.equal(joined.welcome.raidModifier?.id, 'supply_drop');
    const snapshot = session.createSnapshot(joined.playerId, 0);
    assert.equal(snapshot.raidTimer.modifier?.id, 'supply_drop');
    const supplyDrop = snapshot.loot.find((loot) => loot.id.startsWith('loot_supply_drop_'));
    assert.ok(supplyDrop);
    assert.deepEqual(
        supplyDrop.gridSnapshot.items.map((item) => item.itemId).sort(),
        ['herb_rare', 'mp_potion', 'repair_kit'].sort()
    );
});

test('server raid modifier changes party ATB recovery', () => {
    const supplySession = new WorldSession({ sessionEpoch: 1 });
    const supply = supplySession.join({
        ...joinMessage('central_castle', 'supply-speed'),
        partyComposition: [actor('supply-speed', {
            stats: createBaseStats({ spd: 10, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);

    const fogSession = new WorldSession({ sessionEpoch: 2 });
    const fog = fogSession.join({
        ...joinMessage('central_castle', 'fog-speed'),
        partyComposition: [actor('fog-speed', {
            stats: createBaseStats({ spd: 10, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);

    assert.equal(supply.welcome.raidModifier?.id, 'supply_drop');
    assert.equal(fog.welcome.raidModifier?.id, 'dense_fog');

    supplySession.tick(0);
    fogSession.tick(0);
    supplySession.tick(250);
    fogSession.tick(250);

    const supplyActor = supplySession.createSnapshot(supply.playerId, 250).partyActors
        .find((entry) => entry.ownerPlayerId === supply.playerId);
    const fogActor = fogSession.createSnapshot(fog.playerId, 250).partyActors
        .find((entry) => entry.ownerPlayerId === fog.playerId);

    assert.ok(supplyActor);
    assert.ok(fogActor);
    assert.ok(fogActor.actionGauge < supplyActor.actionGauge);
});

test('marked cache requires a master key before it grants raid loot', () => {
    const session = new WorldSession();
    const joined = session.join(joinMessage('central_castle', 'marked-no-key'), 0);
    const marked = session.createSnapshot(joined.playerId, 0).loot
        .find((loot) => loot.containerType === 'marked_cache');
    assert.ok(marked);

    const actorId = readyActorNextToLoot(session, joined.playerId, marked.id);
    const result = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-marked-no-key',
        actorId,
        kind: 'interact',
        payload: { lootId: marked.id },
    }, 1_100);

    assert.equal(result.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(result.replies[0]?.reason ?? '', /Master key/);
    assert.equal(session.createSnapshot(joined.playerId, 1_100).loot
        .find((loot) => loot.id === marked.id)?.unlocked, undefined);
});

test('marked cache consumes one master key and stays unlocked after persistence restore', () => {
    const session = new WorldSession({ sessionEpoch: 11 });
    const joined = session.join(joinWithCarriedItem('central_castle', 'marked-key', MASTER_KEY_ITEM_ID), 0);
    const marked = session.createSnapshot(joined.playerId, 0).loot
        .find((loot) => loot.containerType === 'marked_cache');
    assert.ok(marked);

    const actorId = readyActorNextToLoot(session, joined.playerId, marked.id);
    const opened = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-marked-with-key',
        actorId,
        kind: 'interact',
        payload: { lootId: marked.id },
    }, 1_100);

    assert.deepEqual(opened.replies.map((reply) => reply.type), ['INVENTORY_CONSUMED', 'LOOT_GRANT']);
    const player = getPlayerDebugState(session, joined.playerId);
    assert.equal(player.carriedItems.has(MASTER_KEY_ITEM_ID), false);
    const unlocked = session.createSnapshot(joined.playerId, 1_100).loot.find((loot) => loot.id === marked.id);
    assert.equal(unlocked?.unlocked, true);
    assert.ok(unlocked?.gridSnapshot.items.some((item) => item.itemId.startsWith('orig_late_')));

    const restored = WorldSession.restorePersistentSnapshot(session.createPersistentSnapshot());
    const restoredMarked = restored.createSnapshot(joined.playerId, 1_200).loot.find((loot) => loot.id === marked.id);
    assert.equal(restoredMarked?.unlocked, true);

    const restoredActorId = readyActorNextToLoot(restored, joined.playerId, marked.id);
    const reopened = restored.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'open-marked-restored',
        actorId: restoredActorId,
        kind: 'interact',
        payload: { lootId: marked.id },
    }, 1_300);
    assert.equal(reopened.replies[0]?.type, 'LOOT_GRANT');
});

test('server cursed artifact slows actor ATB and damages on ready turn', () => {
    const normalSession = new WorldSession();
    const normal = normalSession.join({
        ...joinMessage('central_castle', 'normal'),
        partyComposition: [actor('normal', {
            stats: createBaseStats({ spd: 10, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    normalSession.tick(0);
    normalSession.tick(250);
    const normalActor = normalSession.createSnapshot(normal.playerId, 250).partyActors
        .find((entry) => entry.ownerPlayerId === normal.playerId);

    const cursedSession = new WorldSession();
    const cursed = cursedSession.join({
        ...joinWithCarriedItem('central_castle', 'cursed', 'cursed_blood_reliquary'),
        partyComposition: [actor('cursed', {
            stats: createBaseStats({ spd: 10, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    cursedSession.tick(0);
    cursedSession.tick(250);
    const cursedActor = cursedSession.createSnapshot(cursed.playerId, 250).partyActors
        .find((entry) => entry.ownerPlayerId === cursed.playerId);

    assert.ok(normalActor);
    assert.ok(cursedActor);
    assert.ok(cursedActor.actionGauge < normalActor.actionGauge);

    const readySession = new WorldSession();
    const ready = readySession.join({
        ...joinWithCarriedItem('central_castle', 'ready-cursed', 'cursed_blood_reliquary'),
        partyComposition: [actor('ready-cursed', {
            stats: createBaseStats({ hp: 100, maxHp: 100, spd: 1000, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0, {
        equipmentStatBonuses: { 'ready-cursed': { maxHp: 100 } },
    });
    const firstReadyTick = readySession.tick(0);
    const secondReadyTick = readySession.tick(1_000);
    const readyActor = readySession.createSnapshot(ready.playerId, 1_000).partyActors
        .find((entry) => entry.ownerPlayerId === ready.playerId);

    assert.ok(readyActor);
    assert.equal(readyActor.stats.hp, 88);
    const curseEvent = [...firstReadyTick.events, ...secondReadyTick.events].find((event) => event.kind === 'curse');
    assert.ok(curseEvent);
    assert.equal(curseEvent.value, 12);
});

test('server-authoritative down resets accumulated EXP in the final save patch', () => {
    const character = authCharacter('downed-exp');
    const save = createDefaultCharacterSave(character);
    const roster = save.rosterSnapshot.characters;
    assert.ok(Array.isArray(roster));
    const savedCharacter = roster.find((entry) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === character.id);
    assert.ok(savedCharacter && typeof savedCharacter === 'object');
    Object.assign(savedCharacter, { exp: 25 });

    const session = new WorldSession();
    const joined = session.join({
        ...joinWithCarriedItem('central_castle', character.id, 'cursed_blood_reliquary'),
        partyComposition: [actor(character.id, {
            exp: 25,
            stats: createBaseStats({ hp: 1, maxHp: 100, spd: 1_000, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });

    const firstTick = session.tick(0);
    const secondTick = session.tick(1);
    assert.ok([...firstTick.events, ...secondTick.events].some((event) => event.kind === 'down'));
    assert.ok([...firstTick.perPlayerMessages, ...secondTick.perPlayerMessages]
        .some((entry) => entry.message.type === 'RAID_RESULT'));

    const patch = session.createCharacterSavePatch(joined.playerId);
    const patchedRoster = patch?.rosterSnapshot?.characters;
    assert.ok(Array.isArray(patchedRoster));
    const patchedCharacter = patchedRoster.find((entry) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === character.id);
    assert.ok(patchedCharacter && typeof patchedCharacter === 'object');
    assert.equal('exp' in patchedCharacter ? patchedCharacter.exp : undefined, 0);
    assert.equal('injured' in patchedCharacter ? patchedCharacter.injured : undefined, true);
    const history = patch?.questState?.raidHistory;
    assert.ok(Array.isArray(history));
    assert.equal(history[0]?.result, 'DEAD');
    assert.equal(history[0]?.departureTownId, 'central_castle');
});

test('enemy-caused down persists a server-authoritative injury', () => {
    const character = authCharacter('enemy-downed');
    const save = createDefaultCharacterSave(character);
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        partyComposition: [actor(character.id, {
            stats: createBaseStats({ hp: 1, maxHp: 100, def: 0, spd: 1, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const serverActor = getActorForPlayer(session, joined.playerId);
    const enemyEntry = getFirstEnemy(session);
    enemyEntry.enemy.setRole('bruiser');
    enemyEntry.enemy.stats.atk = 999;
    enemyEntry.enemy.stats.hitRate = 999;
    enemyEntry.enemy.isAggro = true;
    enemyEntry.enemy.actionGauge = 100;
    serverActor.stats.hp = 1;
    serverActor.stats.def = 0;
    serverActor.tile = { x: enemyEntry.enemy.gridX + 1, y: enemyEntry.enemy.gridY };

    const result = withFixedRandom(0, () => session.tick(0));

    assert.ok(result.events.some((event) => event.kind === 'down'));
    const patch = session.createCharacterSavePatch(joined.playerId);
    const patchedRoster = patch?.rosterSnapshot?.characters;
    assert.ok(Array.isArray(patchedRoster));
    const patchedCharacter = patchedRoster.find((entry) => (
        typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === character.id
    ));
    assert.ok(patchedCharacter && typeof patchedCharacter === 'object');
    assert.equal('injured' in patchedCharacter ? patchedCharacter.injured : undefined, true);
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
    const serverActor = getFirstActor(session);
    const enemyEntry = getFirstEnemy(session);
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
    const serverActor = getFirstActor(session);
    const enemyEntry = getFirstEnemy(session);
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
    const serverActor = getActorForPlayer(session, a.playerId);
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

    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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

test('disconnect grace expiry records a server-authoritative MIA raid', () => {
    const character = authCharacter('ghost-mia');
    const save = createDefaultCharacterSave(character);
    const session = new WorldSession({ ghostGraceMs: 1_000 });
    const joined = session.join(joinMessage('central_castle', character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });

    session.disconnect(joined.playerId, 100);
    session.tick(1_700);

    const patch = session.createCharacterSavePatch(joined.playerId);
    const history = patch?.questState?.raidHistory;
    assert.ok(Array.isArray(history));
    assert.equal(history[0]?.result, 'MIA');
    assert.equal(history[0]?.departureTownId, 'central_castle');
});

test('disconnect grace rejects resume token for a different account or character', () => {
    const session = new WorldSession({ ghostGraceMs: 1_000 });
    const first = session.join(joinMessage('central_castle', 'hero-a'), 0, {
        accountId: 'account-a',
        characterId: 'hero-a',
    });

    session.disconnect(first.playerId, 100);

    assert.throws(
        () => session.join(joinMessage('central_castle', 'hero-b', first.welcome.resumeToken), 500, {
            accountId: 'account-b',
            characterId: 'hero-b',
        }),
        WorldResumeFailedError,
    );

    const resumed = session.join(joinMessage('central_castle', 'hero-a', first.welcome.resumeToken), 600, {
        accountId: 'account-a',
        characterId: 'hero-a',
    });
    assert.equal(resumed.playerId, first.playerId);
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
    const loot = snapshot.loot.find((entry) => entry.containerType !== 'marked_cache');
    assert.ok(loot);
    const world = new WorldMap();
    const adjacentTile = [
        { x: loot.tile.x - 1, y: loot.tile.y },
        { x: loot.tile.x + 1, y: loot.tile.y },
        { x: loot.tile.x, y: loot.tile.y - 1 },
        { x: loot.tile.x, y: loot.tile.y + 1 },
    ].find((tile) => world.isWalkable(tile.x, tile.y));
    assert.ok(adjacentTile);

    const internals = getWorldSessionDebugState(session);
    for (const playerId of [a.playerId, b.playerId]) {
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === playerId);
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
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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
    assert.equal(event?.type === 'COMBAT_EVENT' ? event.expAward : undefined, serverEnemyEntry.enemy.calcExpFor(1));
    const progressedActor = session.createSnapshot(joined.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id);
    assert.ok((progressedActor?.level ?? 1) > 1 || (progressedActor?.exp ?? 0) > 0);
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
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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
    assert.equal(event?.type === 'COMBAT_EVENT' ? event.expAward : undefined, serverEnemyEntry.enemy.calcExpFor(1));
    const progressedActor = session.createSnapshot(joined.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id);
    assert.ok((progressedActor?.level ?? 1) > 1 || (progressedActor?.exp ?? 0) > 0);
    assert.equal(session.createSnapshot(joined.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id)?.stats.mp, 40);
});

test('network kill progression is server-authoritative, dirty, persistent, and included in save patches', () => {
    const character = authCharacter('hero-progression');
    const save = createDefaultCharacterSave(character);
    const savedRoster = save.rosterSnapshot.characters;
    assert.ok(Array.isArray(savedRoster));
    const savedCharacter = savedRoster.find((entry) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === character.id);
    assert.ok(savedCharacter && typeof savedCharacter === 'object');
    Object.assign(savedCharacter, { exp: 7, hasEmblem: false });

    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        partyComposition: [actor(character.id, {
            exp: 7,
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const serverActor = getActorForPlayer(session, joined.playerId);
    const enemyEntry = getFirstEnemy(session);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: enemyEntry.enemy.gridX - 1, y: enemyEntry.enemy.gridY };
    enemyEntry.enemy.stats.hp = 1;
    enemyEntry.enemy.stats.def = 0;
    enemyEntry.enemy.stats.spd = 0;
    const expectedAward = enemyEntry.enemy.calcExpFor(serverActor.level);

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-authoritative-exp',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: enemyEntry.enemy.id },
    }, 1_000));

    const event = result.broadcasts.find((message) => message.type === 'COMBAT_EVENT' && message.kind === 'kill');
    assert.equal(event?.type === 'COMBAT_EVENT' ? event.expAward : undefined, expectedAward);
    const actorSnapshot = session.createSnapshot(joined.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id);
    assert.ok(actorSnapshot);
    assert.ok(actorSnapshot.level > 1 || (actorSnapshot.exp ?? 0) > 7);
    assert.deepEqual(session.consumeSaveDirtyPlayerIds(), [joined.playerId]);

    const patch = session.createCharacterSavePatch(joined.playerId);
    const patchedRoster = patch?.rosterSnapshot?.characters;
    assert.ok(Array.isArray(patchedRoster));
    const patchedCharacter = patchedRoster.find((entry) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === character.id);
    assert.ok(patchedCharacter && typeof patchedCharacter === 'object');
    assert.equal('tier' in patchedCharacter ? patchedCharacter.tier : undefined, actorSnapshot.currentTier);
    assert.equal('level' in patchedCharacter ? patchedCharacter.level : undefined, actorSnapshot.level);
    assert.equal('exp' in patchedCharacter ? patchedCharacter.exp : undefined, actorSnapshot.exp);

    const restored = WorldSession.restorePersistentSnapshot(session.createPersistentSnapshot());
    const restoredActor = restored.createSnapshot(joined.playerId, 1_100).partyActors.find((entry) => entry.localActorId === character.id);
    assert.equal(restoredActor?.currentTier, actorSnapshot.currentTier);
    assert.equal(restoredActor?.level, actorSnapshot.level);
    assert.equal(restoredActor?.exp, actorSnapshot.exp);
});

test('network kill progression obeys the local mortal/master realm gate', () => {
    const session = new WorldSession({ realm: 'master' });
    const joined = session.join({
        ...joinMessage('central_castle', 'mortal-hero'),
        partyComposition: [actor('mortal-hero', {
            exp: 11,
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const serverActor = getActorForPlayer(session, joined.playerId);
    const enemyEntry = getFirstEnemy(session);
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: enemyEntry.enemy.gridX - 1, y: enemyEntry.enemy.gridY };
    enemyEntry.enemy.stats.hp = 1;
    enemyEntry.enemy.stats.def = 0;
    enemyEntry.enemy.stats.spd = 0;

    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'attack-wrong-realm-exp',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: enemyEntry.enemy.id },
    }, 1_000));

    const event = result.broadcasts.find((message) => message.type === 'COMBAT_EVENT' && message.kind === 'kill');
    assert.equal(event?.type === 'COMBAT_EVENT' ? event.expAward : undefined, 0);
    const actorSnapshot = session.createSnapshot(joined.playerId, 1_000).partyActors.find((entry) => entry.id === serverActor.id);
    assert.equal(actorSnapshot?.level, 1);
    assert.equal(actorSnapshot?.exp, 11);
    assert.deepEqual(session.consumeSaveDirtyPlayerIds(), []);
});

test('castSkill rejects a learned-but-unequipped skill', () => {
    const session = new WorldSession();
    // Infantry T5 learns more than eight skills, so at least one is benched.
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            name: 'Hero Alpha',
            currentTier: 5,
            stats: createBaseStats({ atk: 999, mp: 50, maxMp: 50, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const serverEnemyEntry = [...internals.enemies.values()][0];
    assert.ok(serverActor);
    const benchedSkill = getOrderedLearnedSkills({ classLineId: 'infantry', currentTier: 5 })
        .find((skill) => !serverActor.magicLoadout.includes(skill.id));
    assert.ok(benchedSkill, 'T5 default loadout should leave a learned skill unequipped');
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    serverActor.tile = { x: serverEnemyEntry.enemy.gridX - 1, y: serverEnemyEntry.enemy.gridY };

    const result = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'cast-benched',
        actorId: serverActor.id,
        kind: 'castSkill',
        payload: { skillId: benchedSkill.id, targetId: serverEnemyEntry.enemy.id },
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
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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

    const bossEntry = getScenarioObjectiveEnemy(session);
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
    assert.equal(result?.telemetry?.engagementCount, 1);
    assert.equal(result?.telemetry?.killsByDangerBand.scenario, 1);
    assert.equal(result?.telemetry?.deathCause, 'manual');
});

test('server burgos cain side event records raid flag and gold without persisting before survival', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'burgos_castle');
    const sequence = getStoryScenarioEventSequence('burgos_castle');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'cain_son_relic');
    assert.ok(serverActor);
    assert.ok(dungeon);
    assert.ok(event);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-burgos-cain',
        actorId: serverActor.id,
        dungeonId: 'burgos_castle',
    }, 1_000);

    serverActor.tile = { x: 9, y: 11 };
    const result = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'burgos-cain-relic',
        actorId: serverActor.id,
        dungeonId: 'burgos_castle',
        eventId: 'cain_son_relic',
    }, 1_100);

    const fieldResult = result.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult.flag, 'cain_necklace');
    assert.deepEqual(fieldResult.rewards, [{ type: 'gold', amount: 50 }]);

    const snapshot = session.createSnapshot(joined.playerId, 1_100);
    assert.deepEqual(snapshot.scenario.playerFieldEventFlagsByDungeonId?.burgos_castle, ['cain_necklace']);

    const serverPlayer = internals.players.get(joined.playerId);
    assert.ok(serverPlayer);
    assert.equal(serverPlayer.raidGoldReward, 50);

    const dirtyPatch = session.createCharacterSavePatch(joined.playerId);
    if (dirtyPatch?.questState?.gold !== undefined) {
        assert.equal(dirtyPatch.questState.gold, 500);
    }
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
    const internals = getWorldSessionDebugState(session);
    const actorA = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedA.playerId);
    const actorB = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedB.playerId);
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
    const bossEntry = getScenarioObjectiveEnemy(session);

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
        const serverActor = getActorForPlayer(session, joined.playerId);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);
        const returnTile = { ...serverActor.tile };

        const result = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);

        assert.equal(result.replies.length, 0, `episode ${episode} enter`);
        const state = getScenarioState(session, joined.playerId);
        assert.equal(state.dungeonId, scenario.dungeonId, `episode ${episode} dungeon id`);
        assert.equal(state.missionKind, 'soloInterior', `episode ${episode} mission kind`);
        assert.deepEqual(state.returnTile, returnTile, `episode ${episode} return tile`);
        assert.equal(state.enemyIds.length, scenario.guardCount + 1, `episode ${episode} enemy count`);

        const serverEnemies = getScenarioEnemies(session, state);
        const guards = serverEnemies.filter((entry) => !entry.scenarioObjective);
        const boss = serverEnemies.find((entry) => entry.scenarioObjective);
        assert.equal(guards.length, scenario.guardCount, `episode ${episode} guard count`);
        assert.ok(boss, `episode ${episode} objective boss`);
        assert.equal(boss.monsterId, monsterLayout.bossMonsterId, `episode ${episode} boss monster id`);
        assert.deepEqual({ x: boss.enemy.gridX, y: boss.enemy.gridY }, getOriginalLateStoryBossTile(episode), `episode ${episode} boss tile`);
        const bossBalance = getNormalizedMonsterBalance(boss.monsterId, boss.enemy.level);
        assert.equal(bossBalance.source, 'original', `episode ${episode} boss balance source`);
        const expectedBoss = new Enemy('expected_boss', 0, 0, boss.enemy.name, boss.enemy.level, boss.enemy.color, boss.enemy.role, boss.monsterId);
        assert.equal(boss.enemy.stats.maxHp, expectedBoss.stats.maxHp, `episode ${episode} boss hp`);
        assert.equal(boss.enemy.stats.atk, expectedBoss.stats.atk, `episode ${episode} boss atk`);

        const expectedGuardTiles = getOriginalLateStoryGuardTiles(episode);
        guards.forEach((entry, index) => {
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
            const serverEnemy = getEnemyById(session, enemyId);
            const snapshotEnemy = snapshot.enemies.find((enemy) => enemy.id === enemyId);
            assert.ok(snapshotEnemy, `episode ${episode} visible enemy ${enemyId}`);
            assert.equal(snapshotEnemy.monsterId, serverEnemy.monsterId, `episode ${episode} snapshot monster ${enemyId}`);
            assert.deepEqual(snapshotEnemy.tile, { x: serverEnemy.enemy.gridX, y: serverEnemy.enemy.gridY }, `episode ${episode} snapshot tile ${enemyId}`);
            assert.equal(snapshotEnemy.isBoss, serverEnemy.enemy.isBoss, `episode ${episode} snapshot boss flag ${enemyId}`);
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
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        const entranceTile = world.getDungeonEntranceTile(dungeon);
        serverActor.tile = entranceTile;

        const enter = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-clear-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);
        assert.equal(enter.replies.length, 0, `episode ${episode} enter`);

        const bossEntry = [...internals.enemies.values()].find((entry) => entry.scenarioObjective);
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
        const bossLoot = session.createSnapshot(joined.playerId, 2_500 + episode).loot.find((loot) =>
            loot.kind === 'corpse' && loot.sourceLabel.includes(bossEntry.enemy.name)
        );
        assert.ok(bossLoot, `episode ${episode} boss corpse loot`);
        assert.deepEqual(bossLoot.tile, entranceTile, `episode ${episode} boss corpse returns to entrance`);
        assert.notDeepEqual(bossLoot.tile, getOriginalLateStoryBossTile(episode), `episode ${episode} boss corpse avoids interior boss tile`);

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

        const extractionTown = world.getTowns().find((town) => town.id === 'w_forest_village');
        assert.ok(extractionTown, `episode ${episode} extraction town`);
        serverActor.tile = world.getTownSpawnTile(extractionTown);
        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 3_000 + episode);
        assert.equal(leave.replies[0]?.type, 'RAID_RESULT', `episode ${episode} raid result`);
        assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].result : '', 'SURVIVED', `episode ${episode} survived result`);
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
            [...completedQuestIds, scenario.questId, FIRST_SURVIVAL_QUEST_ID],
            `episode ${episode} survived final patch includes raid quest completion`
        );
    }
});

test('server late story interior cache rewards persist only after survival through episode 31', () => {
    const world = new WorldMap();

    for (let episode = 23; episode <= 31; episode++) {
        const session = new WorldSession();
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `episode ${episode} scenario`);
        const sequence = getStoryScenarioEventSequence(scenario.dungeonId);
        assert.ok(sequence, `episode ${episode} sequence`);
        assert.ok(sequence.fieldEvents.length > 0, `episode ${episode} cache events`);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        assert.ok(dungeon, `episode ${episode} dungeon`);
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < episode)
            .map((entry) => entry.questId);
        const character = authCharacter(`cache-ep${episode}`);
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
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        const enter = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-cache-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);
        assert.equal(enter.replies.length, 0, `episode ${episode} enter`);

        const expectedRewardIds: string[] = [];
        for (const event of sequence.fieldEvents) {
            const [tile] = event.triggerTiles;
            assert.ok(tile, `episode ${episode} ${event.id} trigger tile`);
            serverActor.tile = { x: tile.x, y: tile.y + 1 };

            const result = session.handleMessage(joined.playerId, {
                type: 'SCENARIO_FIELD_EVENT_INTERACT',
                intentId: `cache-${episode}-${event.id}`,
                actorId: serverActor.id,
                dungeonId: scenario.dungeonId,
                eventId: event.id,
            }, 2_000 + episode);
            const fieldResult = result.replies[0];
            assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT', `episode ${episode} ${event.id} result`);
            if (fieldResult?.type !== 'SCENARIO_FIELD_EVENT_RESULT') continue;
            assert.equal(fieldResult.flag, getStoryScenarioFieldEventFlag(event), `episode ${episode} ${event.id} flag`);
            assert.deepEqual(fieldResult.presentationSteps, event.steps, `episode ${episode} ${event.id} presentation steps`);
            assert.ok(
                getStoryScenarioPresentationDurationMs(fieldResult.presentationSteps) > 0,
                `episode ${episode} ${event.id} presentation duration`
            );
            const eventNumber = Number(event.originalEventId.match(/\d+/)?.[0]);
            assert.equal(Number.isInteger(eventNumber), true, `episode ${episode} ${event.id} original event number`);
            const expectedRewardPayloads = getOriginalLateStoryItemsForSourceEvent(episode, eventNumber)
                .map((item) => ({ itemId: item.currentItemId, originalItemId: item.originalItemId }));
            assert.deepEqual(
                fieldResult.rewards
                    .filter((reward) => reward.type === 'item')
                    .map((reward) => ({ itemId: reward.itemId, originalItemId: reward.originalItemId })),
                expectedRewardPayloads,
                `episode ${episode} ${event.id} reward payloads`
            );
            const eventRewardIds = expectedRewardPayloads
                .map((reward) => reward.itemId)
                .sort((left, right) => left.localeCompare(right));
            expectedRewardIds.push(...eventRewardIds);
            assert.deepEqual(
                fieldResult.rewards
                    .filter((reward) => reward.type === 'item')
                    .map((reward) => reward.itemId)
                    .sort((left, right) => left.localeCompare(right)),
                eventRewardIds,
                `episode ${episode} ${event.id} rewards`
            );
        }
        expectedRewardIds.sort((left, right) => left.localeCompare(right));

        const serverPlayer = internals.players.get(joined.playerId);
        assert.ok(serverPlayer, `episode ${episode} server player`);
        assert.deepEqual(
            [...serverPlayer.carriedItems.entries()]
                .filter(([itemId]: [string, number]) => expectedRewardIds.includes(itemId))
                .map(([itemId, quantity]: [string, number]) => [itemId, quantity] as [string, number])
                .sort(([left], [right]) => left.localeCompare(right)),
            expectedRewardIds.map((itemId) => [itemId, 1] as [string, number]),
            `episode ${episode} carried cache rewards`
        );

        const completedFlags = sequence.fieldEvents
            .map((event) => getStoryScenarioFieldEventFlag(event))
            .sort((left, right) => left.localeCompare(right));
        const cacheSnapshot = session.createSnapshot(joined.playerId, 2_500 + episode);
        assert.deepEqual(
            cacheSnapshot.scenario.playerFieldEventFlagsByDungeonId?.[scenario.dungeonId],
            completedFlags,
            `episode ${episode} snapshot cache flags`
        );

        const dirtyPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(dirtyPatch?.inventory, `episode ${episode} dirty patch`);
        assert.deepEqual(
            dirtyPatch.inventory.items
                .filter((item) => expectedRewardIds.includes(item.itemId))
                .map((item) => item.itemId),
            [],
            `episode ${episode} dirty patch excludes cache rewards`
        );

        const extractionTown = world.getTowns().find((town) => town.id === 'w_forest_village');
        assert.ok(extractionTown, `episode ${episode} extraction town`);
        serverActor.tile = world.getTownSpawnTile(extractionTown);
        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 3_000 + episode);
        assert.equal(leave.replies[0]?.type, 'RAID_RESULT', `episode ${episode} raid result`);
        assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].result : '', 'SURVIVED', `episode ${episode} survived result`);
        const finalPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(finalPatch?.inventory, `episode ${episode} final patch`);
        assert.deepEqual(
            finalPatch.inventory.items
                .filter((item) => expectedRewardIds.includes(item.itemId))
                .map((item) => [item.itemId, item.acquiredInRaid] as [string, boolean | undefined])
                .sort(([left], [right]) => left.localeCompare(right)),
            expectedRewardIds.map((itemId) => [itemId, undefined] as [string, boolean | undefined]),
            `episode ${episode} survived final patch secures cache rewards`
        );
    }
});

test('server late story interior cache rewards are not persisted on failed raid results', () => {
    const world = new WorldMap();

    for (let episode = 23; episode <= 31; episode++) {
        const session = new WorldSession();
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `episode ${episode} scenario`);
        const sequence = getStoryScenarioEventSequence(scenario.dungeonId);
        assert.ok(sequence, `episode ${episode} sequence`);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        assert.ok(dungeon, `episode ${episode} dungeon`);
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < episode)
            .map((entry) => entry.questId);
        const character = authCharacter(`failed-cache-ep${episode}`);
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
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-failed-cache-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);

        const expectedRewardIds: string[] = [];
        for (const event of sequence.fieldEvents) {
            const [tile] = event.triggerTiles;
            assert.ok(tile, `episode ${episode} ${event.id} trigger tile`);
            serverActor.tile = { x: tile.x, y: tile.y + 1 };

            const result = session.handleMessage(joined.playerId, {
                type: 'SCENARIO_FIELD_EVENT_INTERACT',
                intentId: `failed-cache-${episode}-${event.id}`,
                actorId: serverActor.id,
                dungeonId: scenario.dungeonId,
                eventId: event.id,
            }, 2_000 + episode);
            assert.equal(result.replies[0]?.type, 'SCENARIO_FIELD_EVENT_RESULT', `episode ${episode} ${event.id} result`);
            expectedRewardIds.push(
                ...(event.rewards ?? [])
                    .filter((reward) => reward.type === 'item')
                    .map((reward) => reward.itemId)
            );
        }
        assert.ok(expectedRewardIds.length > 0, `episode ${episode} cache item rewards`);

        const serverPlayer = internals.players.get(joined.playerId);
        assert.ok(serverPlayer, `episode ${episode} server player`);
        for (const itemId of expectedRewardIds) {
            assert.equal(serverPlayer.carriedItems.has(itemId), true, `episode ${episode} carried cache reward ${itemId}`);
        }

        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'wipe' }, 3_000 + episode);
        assert.equal(leave.replies[0]?.type, 'RAID_RESULT', `episode ${episode} raid result`);
        const finalPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(finalPatch?.inventory, `episode ${episode} final patch`);
        const finalQuestState = finalPatch.questState;
        assert.ok(finalQuestState, `episode ${episode} final quest state`);
        assert.deepEqual(
            finalPatch.inventory.items
                .filter((item) => expectedRewardIds.includes(item.itemId))
                .map((item) => item.itemId),
            [],
            `episode ${episode} failed final patch excludes cache rewards`
        );
        assert.deepEqual(
            finalQuestState.completedQuestIds,
            completedQuestIds,
            `episode ${episode} failed final patch excludes raid quest completion`
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
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-failed-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);

        const bossEntry = [...internals.enemies.values()].find((entry) => entry.scenarioObjective);
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

test('server late story objectives do not persist when extracting back to the departure town through episode 31', () => {
    const world = new WorldMap();

    for (let episode = 23; episode <= 31; episode++) {
        const session = new WorldSession();
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `episode ${episode} scenario`);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        const departureTown = world.getTowns().find((town) => town.id === 'central_castle');
        assert.ok(dungeon, `episode ${episode} dungeon`);
        assert.ok(departureTown, `episode ${episode} departure town`);
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < episode)
            .map((entry) => entry.questId);
        const character = authCharacter(`departure-ep${episode}`);
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
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        assert.ok(serverActor, `episode ${episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        const enter = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-departure-ep${episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + episode);
        assert.equal(enter.replies.length, 0, `episode ${episode} enter`);

        const bossEntry = [...internals.enemies.values()].find((entry) => entry.scenarioObjective);
        assert.ok(bossEntry, `episode ${episode} boss`);
        serverActor.actionGauge = 100;
        serverActor.remainingAp = 80;
        serverActor.tile = { x: bossEntry.enemy.gridX - 1, y: bossEntry.enemy.gridY };
        bossEntry.enemy.stats.hp = 1;
        bossEntry.enemy.stats.def = 0;
        bossEntry.enemy.stats.spd = 0;

        withFixedRandom(0, () => session.handleMessage(joined.playerId, {
            type: 'PLAYER_INTENT',
            intentId: `kill-departure-ep${episode}`,
            actorId: serverActor.id,
            kind: 'attack',
            payload: { targetId: bossEntry.enemy.id },
        }, 2_000 + episode));

        serverActor.tile = world.getTownSpawnTile(departureTown);
        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 3_000 + episode);
        const result = leave.replies[0];
        assert.equal(result?.type, 'RAID_RESULT', `episode ${episode} raid result`);
        if (result?.type === 'RAID_RESULT') {
            assert.equal(result.result, 'LEFT', `episode ${episode} departure town result`);
            assert.equal(result.extractionTownId, 'central_castle', `episode ${episode} extraction town`);
        }

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
            `episode ${episode} departure town final patch excludes EVENT 99 rewards`
        );
        assert.deepEqual(
            finalQuestState.completedQuestIds,
            completedQuestIds,
            `episode ${episode} departure town final patch excludes raid quest completion`
        );
    }
});

test('scenario entry validates quest prerequisites on the server', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const joined = session.join(joinMessage('central_castle', 'hero-a'), 0);
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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

test('server scenario entry starts every implemented episode through 31', () => {
    const world = new WorldMap();

    for (const scenario of STORY_SCENARIOS) {
        const session = new WorldSession();
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < scenario.episode)
            .map((entry) => entry.questId);
        const joined = session.join({
            ...joinMessage('central_castle', `hero-episode-${scenario.episode}`),
            completedQuestIds,
        }, scenario.episode);
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        const monsterLayout = getStoryScenarioMonsterLayout(scenario);
        assert.ok(serverActor, `episode ${scenario.episode} actor`);
        assert.ok(dungeon, `episode ${scenario.episode} dungeon`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);
        const entrance = { ...serverActor.tile };

        const result = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-episode-${scenario.episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 10_000 + scenario.episode);

        assert.equal(result.replies.length, 0, `episode ${scenario.episode} enter`);
        const state = getScenarioState(session, joined.playerId);
        assert.equal(state.dungeonId, scenario.dungeonId, `episode ${scenario.episode} state dungeon`);
        assert.equal(state.missionKind, scenario.missionKind, `episode ${scenario.episode} mission kind`);
        assert.equal(state.enemyIds.length, scenario.guardCount + (scenario.bossName ? 1 : 0), `episode ${scenario.episode} enemy count`);

        const serverEnemies = getScenarioEnemies(session, state);
        const guards = serverEnemies.filter((entry) => !entry.scenarioObjective);
        const boss = serverEnemies.find((entry) => entry.scenarioObjective);
        assert.equal(guards.length, scenario.guardCount, `episode ${scenario.episode} guard count`);
        guards.forEach((entry, index) => {
            assert.equal(
                entry.monsterId,
                monsterLayout.guardMonsterIds[index % monsterLayout.guardMonsterIds.length],
                `episode ${scenario.episode} guard ${index} monster`
            );
        });

        const snapshot = session.createSnapshot(joined.playerId, 20_000 + scenario.episode);
        assert.ok(snapshot.scenario.enteredDungeonIds.includes(scenario.dungeonId), `episode ${scenario.episode} entered snapshot`);
        for (const enemyId of state.enemyIds) {
            assert.ok(snapshot.enemies.some((enemy) => enemy.id === enemyId), `episode ${scenario.episode} visible enemy ${enemyId}`);
        }

        const interior = getStoryInteriorLayout(scenario.dungeonId);
        if (interior) {
            assert.deepEqual(state.returnTile, entrance, `episode ${scenario.episode} return tile`);
            assert.deepEqual(snapshot.partyActors.find((entry) => entry.id === serverActor.id)?.tile, interior.playerStart, `episode ${scenario.episode} interior start`);
        } else {
            assert.equal(state.returnTile, null, `episode ${scenario.episode} has no return tile`);
            assert.deepEqual(snapshot.partyActors.find((entry) => entry.id === serverActor.id)?.tile, entrance, `episode ${scenario.episode} field start`);
        }

        if (scenario.bossName) {
            assert.ok(boss, `episode ${scenario.episode} objective boss`);
            assert.equal(state.objectiveEnemyId, boss.enemy.id, `episode ${scenario.episode} objective id`);
            assert.equal(boss.enemy.name, scenario.bossName, `episode ${scenario.episode} boss name`);
            assert.equal(boss.monsterId, monsterLayout.bossMonsterId, `episode ${scenario.episode} boss monster`);
            assert.equal(snapshot.scenario.activeDungeonId, scenario.dungeonId, `episode ${scenario.episode} active snapshot`);
            assert.equal(snapshot.scenario.completedDungeonIds.includes(scenario.dungeonId), false, `episode ${scenario.episode} not completed on entry`);
        } else {
            assert.equal(boss, undefined, `episode ${scenario.episode} no objective boss`);
            assert.equal(state.objectiveEnemyId, null, `episode ${scenario.episode} no objective id`);
            assert.equal(state.completed, true, `episode ${scenario.episode} completed immediately`);
            assert.equal(snapshot.scenario.activeDungeonId, null, `episode ${scenario.episode} inactive snapshot`);
            assert.ok(snapshot.scenario.completedDungeonIds.includes(scenario.dungeonId), `episode ${scenario.episode} completed snapshot`);
        }
    }
});

test('server story objectives through episode 31 persist only after valid survival', () => {
    const world = new WorldMap();
    const extractionTown = world.getTowns().find((town) => town.id === 'w_forest_village');
    assert.ok(extractionTown);

    for (const scenario of STORY_SCENARIOS) {
        const session = new WorldSession();
        const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
        const completedQuestIds = STORY_SCENARIOS
            .filter((entry) => entry.episode < scenario.episode)
            .map((entry) => entry.questId);
        const character = authCharacter(`survive-episode-${scenario.episode}`);
        const save = createDefaultCharacterSave(character);
        save.questState = { ...save.questState, completedQuestIds };
        const joined = session.join({
            ...joinMessage('central_castle', character.id),
            completedQuestIds,
            partyComposition: [actor(character.id, {
                stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
            })],
        }, scenario.episode, {
            accountId: character.accountId,
            characterId: character.id,
            completedQuestIds,
            saveSnapshot: save,
        });
        const internals = getWorldSessionDebugState(session);
        const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
        assert.ok(dungeon, `episode ${scenario.episode} dungeon`);
        assert.ok(serverActor, `episode ${scenario.episode} actor`);
        serverActor.tile = world.getDungeonEntranceTile(dungeon);

        const enter = session.handleMessage(joined.playerId, {
            type: 'SCENARIO_ENTER',
            intentId: `enter-survive-episode-${scenario.episode}`,
            actorId: serverActor.id,
            dungeonId: scenario.dungeonId,
        }, 1_000 + scenario.episode);
        assert.equal(enter.replies.length, 0, `episode ${scenario.episode} enter`);

        if (scenario.bossName) {
            const bossEntry = [...internals.enemies.values()].find((entry) => entry.scenarioObjective);
            assert.ok(bossEntry, `episode ${scenario.episode} boss`);
            serverActor.actionGauge = 100;
            serverActor.remainingAp = 80;
            serverActor.tile = { x: bossEntry.enemy.gridX - 1, y: bossEntry.enemy.gridY };
            bossEntry.enemy.stats.hp = 1;
            bossEntry.enemy.stats.def = 0;
            bossEntry.enemy.stats.spd = 0;

            const attack = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId: `kill-survive-episode-${scenario.episode}`,
                actorId: serverActor.id,
                kind: 'attack',
                payload: { targetId: bossEntry.enemy.id },
            }, 2_000 + scenario.episode));
            const kill = attack.broadcasts.find((message) => message.type === 'COMBAT_EVENT');
            assert.equal(kill?.type, 'COMBAT_EVENT', `episode ${scenario.episode} kill event type`);
            assert.equal(kill?.kind, 'kill', `episode ${scenario.episode} kill event`);
        }

        const serverPlayer = internals.players.get(joined.playerId);
        assert.ok(serverPlayer, `episode ${scenario.episode} server player`);
        assert.equal(serverPlayer.completedDungeonIds.has(scenario.dungeonId), true, `episode ${scenario.episode} completed dungeon`);
        assert.equal(serverPlayer.completedQuestIds.has(scenario.questId), true, `episode ${scenario.episode} in-raid quest complete`);

        const dirtyPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(dirtyPatch?.questState, `episode ${scenario.episode} dirty quest patch`);
        assert.deepEqual(
            dirtyPatch.questState.completedQuestIds,
            completedQuestIds,
            `episode ${scenario.episode} dirty patch excludes raid quest completion`
        );

        serverActor.tile = world.getTownSpawnTile(extractionTown);
        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 3_000 + scenario.episode);
        assert.equal(leave.replies[0]?.type, 'RAID_RESULT', `episode ${scenario.episode} raid result`);
        assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].result : '', 'SURVIVED', `episode ${scenario.episode} survived result`);

        const finalPatch = session.createCharacterSavePatch(joined.playerId);
        assert.ok(finalPatch?.questState, `episode ${scenario.episode} final quest patch`);
        assert.deepEqual(
            finalPatch.questState.completedQuestIds,
            [...completedQuestIds, scenario.questId, FIRST_SURVIVAL_QUEST_ID],
            `episode ${scenario.episode} survived final patch includes raid quest completion`
        );
    }
});

test('server-authoritative field scenario events complete per player without trusting reward payloads', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const characterA = authCharacter('hero-a');
    const saveA = createDefaultCharacterSave(characterA);
    saveA.questState = { ...saveA.questState, completedQuestIds, gold: 500 };
    const joinedA = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        completedQuestIds,
    }, 0, {
        accountId: characterA.accountId,
        characterId: characterA.id,
        completedQuestIds,
        saveSnapshot: saveA,
    });
    const joinedB = session.join({
        ...joinMessage('central_castle', 'hero-b'),
        completedQuestIds,
    }, 0);
    const internals = getWorldSessionDebugState(session);
    const actorA = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedA.playerId);
    const actorB = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedB.playerId);
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
    const firstReply = result.replies[0];
    assert.ok(firstReply);
    assert.equal('amount' in firstReply && firstReply.amount === 9999, false);

    const snapshotA = session.createSnapshot(joinedA.playerId, 1_100);
    const snapshotB = session.createSnapshot(joinedB.playerId, 1_100);
    assert.deepEqual(snapshotA.scenario.playerFieldEventFlagsByDungeonId?.arcadia_plain, ['arcadia_gold_chest_01']);
    assert.equal(snapshotB.scenario.playerFieldEventFlagsByDungeonId?.arcadia_plain, undefined);
    const dirtyPatch = session.createCharacterSavePatch(joinedA.playerId);
    assert.ok(dirtyPatch?.questState);
    assert.equal(dirtyPatch.questState.gold, 500);

    const duplicate = session.handleMessage(joinedA.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-arcadia-gold-a-again',
        actorId: actorA.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_gold_chest_01',
    }, 1_200);
    assert.equal(duplicate.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(duplicate.replies[0]?.type === 'ACTION_REJECTED' ? duplicate.replies[0].reason : '', /already complete/);

    const extractionTown = world.getTowns().find((town) => town.id === 'w_forest_village');
    assert.ok(extractionTown);
    actorA.tile = world.getTownSpawnTile(extractionTown);
    const leave = session.handleMessage(joinedA.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 1_300);
    assert.equal(leave.replies[0]?.type, 'RAID_RESULT');
    assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].result : '', 'SURVIVED');
    const finalPatch = session.createCharacterSavePatch(joinedA.playerId);
    assert.ok(finalPatch?.questState);
    // 500 base + 100 scenario gold + 200 first-survival bonus.
    assert.equal(finalPatch.questState.gold, 800);
});

test('server-authoritative original MAGIC field traps damage the actor once', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 12);
    assert.ok(scenario);
    const sequence = getStoryScenarioEventSequence(scenario.dungeonId);
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'pyramid_front_trap_50');
    assert.ok(event);
    const completedQuestIds = STORY_SCENARIOS
        .filter((entry) => entry.episode < scenario.episode)
        .map((entry) => entry.questId);
    const character = authCharacter('server-trap');
    const save = createDefaultCharacterSave(character);
    save.questState = { ...save.questState, completedQuestIds };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
        equipmentStatBonuses: { [character.id]: { maxHp: 100 } },
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
    assert.ok(serverActor);
    assert.ok(dungeon);
    serverActor.stats.maxHp = 100;
    serverActor.stats.hp = 100;
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-pyramid-front',
        actorId: serverActor.id,
        dungeonId: scenario.dungeonId,
    }, 1_000);

    const [eventTile] = getStoryScenarioFieldEventTiles(scenario.dungeonId, event, world);
    serverActor.tile = { x: eventTile.x, y: eventTile.y + 1 };
    const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'spring-pyramid-trap',
        actorId: serverActor.id,
        dungeonId: scenario.dungeonId,
        eventId: event.id,
    }, 1_100));

    const fieldResult = result.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(fieldResult?.type === 'SCENARIO_FIELD_EVENT_RESULT' ? fieldResult.trapDamage : undefined, {
        actorId: serverActor.id,
        damage: 24,
    });
    assert.equal(serverActor.stats.hp, 76);
    const snapshot = session.createSnapshot(joined.playerId, 1_100);
    const actorSnapshot = snapshot.partyActors.find((entry) => entry.id === serverActor.id);
    assert.equal(actorSnapshot?.stats.hp, 76);

    const duplicate = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'spring-pyramid-trap-again',
        actorId: serverActor.id,
        dungeonId: scenario.dungeonId,
        eventId: event.id,
    }, 1_200);
    assert.equal(duplicate.replies[0]?.type, 'ACTION_REJECTED');
    assert.equal(serverActor.stats.hp, 76);
});

test('server-authoritative RANDOM field events reject without completing until the roll succeeds', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 11)
        .map((scenario) => scenario.questId);
    const character = authCharacter('server-random-field');
    const save = createDefaultCharacterSave(character);
    save.questState = { ...save.questState, completedQuestIds };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'oasis');
    const sequence = getStoryScenarioEventSequence('oasis');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'oasis_gold_chest_01');
    assert.ok(serverActor);
    assert.ok(dungeon);
    assert.ok(event);
    assert.match(event.trigger, /RANDOM 50/);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-oasis-random',
        actorId: serverActor.id,
        dungeonId: 'oasis',
    }, 1_000);

    const [eventTile] = getStoryScenarioFieldEventTiles('oasis', event, world);
    serverActor.tile = { x: eventTile.x, y: eventTile.y + 1 };
    const failed = withFixedRandom(0.99, () => session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-oasis-random-fail',
        actorId: serverActor.id,
        dungeonId: 'oasis',
        eventId: event.id,
    }, 1_100));
    assert.equal(failed.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(failed.replies[0]?.type === 'ACTION_REJECTED' ? failed.replies[0].reason : '', /random condition failed/);
    assert.equal(session.createSnapshot(joined.playerId, 1_100).scenario.playerFieldEventFlagsByDungeonId?.oasis, undefined);
    assert.equal((internals.players.get(joined.playerId)?.raidGoldReward ?? 0), 0);

    const succeeded = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-oasis-random-success',
        actorId: serverActor.id,
        dungeonId: 'oasis',
        eventId: event.id,
    }, 1_200));
    const fieldResult = succeeded.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(fieldResult?.type === 'SCENARIO_FIELD_EVENT_RESULT' ? fieldResult.rewards : [], [{ type: 'gold', amount: 500 }]);
    assert.deepEqual(session.createSnapshot(joined.playerId, 1_200).scenario.playerFieldEventFlagsByDungeonId?.oasis, ['oasis_gold_chest_01']);
    assert.equal((internals.players.get(joined.playerId)?.raidGoldReward ?? 0), 500);
});

test('server-authoritative SCENECLEAR field events complete scenario objectives', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === 18);
    assert.ok(scenario);
    const sequence = getStoryScenarioEventSequence(scenario.dungeonId);
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'ament_gate_true_door');
    assert.ok(sequence);
    assert.ok(event);
    assert.equal(event.completesObjective, true);
    assert.match(event.trigger, /SCENECLEAR/);
    const completedQuestIds = STORY_SCENARIOS
        .filter((entry) => entry.episode < scenario.episode)
        .map((entry) => entry.questId);
    const character = authCharacter('scenario-clear-field');
    const save = createDefaultCharacterSave(character);
    save.questState = { ...save.questState, completedQuestIds };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
    assert.ok(serverActor);
    assert.ok(dungeon);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-ament-gate',
        actorId: serverActor.id,
        dungeonId: scenario.dungeonId,
    }, 1_000);

    const [tile] = event.triggerTiles;
    assert.ok(tile);
    serverActor.tile = { x: tile.x, y: tile.y + 1 };
    const result = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'ament-gate-clear',
        actorId: serverActor.id,
        dungeonId: scenario.dungeonId,
        eventId: event.id,
    }, 1_100);

    const fieldResult = result.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult.flag, getStoryScenarioFieldEventFlag(event));
    const serverPlayer = internals.players.get(joined.playerId);
    assert.ok(serverPlayer);
    assert.equal(serverPlayer.activeDungeonId, null);
    assert.equal(serverPlayer.completedDungeonIds.has(scenario.dungeonId), true);
    assert.equal(serverPlayer.completedQuestIds.has(scenario.questId), true);
    const snapshot = session.createSnapshot(joined.playerId, 1_200);
    assert.equal(snapshot.scenario.activeDungeonId, null);
    assert.ok(snapshot.scenario.completedDungeonIds.includes(scenario.dungeonId));

    const extractionTown = world.getTowns().find((town) => town.id === 'w_forest_village');
    assert.ok(extractionTown);
    serverActor.tile = world.getTownSpawnTile(extractionTown);
    const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'town' }, 1_300);
    assert.equal(leave.replies[0]?.type, 'RAID_RESULT');
    assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].result : '', 'SURVIVED');
    assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].firstSurvivalBonusGranted : undefined, true);
    const finalPatch = session.createCharacterSavePatch(joined.playerId);
    assert.ok(finalPatch?.questState);
    assert.deepEqual(finalPatch.questState.completedQuestIds, [...completedQuestIds, scenario.questId, FIRST_SURVIVAL_QUEST_ID]);
    const history = finalPatch.questState.raidHistory;
    assert.ok(Array.isArray(history));
    assert.equal(history[0]?.result, 'SURVIVED');
    assert.equal(history[0]?.extractionTownId, 'w_forest_village');
});

test('server-authoritative field scenario gold rewards are lost on failed raids', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const character = authCharacter('failed-gold');
    const save = createDefaultCharacterSave(character);
    save.questState = { ...save.questState, completedQuestIds, gold: 500 };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'arcadia_plain');
    const sequence = getStoryScenarioEventSequence('arcadia_plain');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'arcadia_gold_chest_01');
    assert.ok(serverActor);
    assert.ok(dungeon);
    assert.ok(event);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-arcadia-failed-gold',
        actorId: serverActor.id,
        dungeonId: 'arcadia_plain',
    }, 1_000);

    const [eventTile] = getStoryScenarioFieldEventTiles('arcadia_plain', event, world);
    serverActor.tile = { x: eventTile.x, y: eventTile.y + 1 };
    const result = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-arcadia-gold-failed',
        actorId: serverActor.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_gold_chest_01',
    }, 1_100);
    assert.equal(result.replies[0]?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    const dirtyPatch = session.createCharacterSavePatch(joined.playerId);
    assert.ok(dirtyPatch?.questState);
    assert.equal(dirtyPatch.questState.gold, 500);

    const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'wipe' }, 1_200);
    assert.equal(leave.replies[0]?.type, 'RAID_RESULT');
    assert.equal(leave.replies[0]?.type === 'RAID_RESULT' ? leave.replies[0].result : '', 'DEAD');
    assert.ok(leave.replies[0]?.type === 'RAID_RESULT' && leave.replies[0].failure);
    assert.equal(leave.replies[0]?.type === 'RAID_RESULT'
        ? leave.replies[0].failure?.recoveryBackpack
        : undefined, 3);
    const finalPatch = session.createCharacterSavePatch(joined.playerId);
    assert.ok(finalPatch?.questState);
    assert.equal(finalPatch.questState.gold, 500);
});

test('server-authoritative field scenario item rewards reject full save storage without completing the event', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const character = authCharacter('full-item-reward');
    const save = createDefaultCharacterSave(character);
    save.inventory = fullInventory(save.inventory.width, save.inventory.height);
    save.questState = { ...save.questState, completedQuestIds };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const player = internals.players.get(joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'arcadia_plain');
    const sequence = getStoryScenarioEventSequence('arcadia_plain');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'arcadia_item_chest_05');
    assert.ok(serverActor);
    assert.ok(player);
    assert.ok(player.saveSnapshot);
    assert.ok(dungeon);
    assert.ok(event);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-arcadia-full-item',
        actorId: serverActor.id,
        dungeonId: 'arcadia_plain',
    }, 1_000);

    const [eventTile] = getStoryScenarioFieldEventTiles('arcadia_plain', event, world);
    serverActor.tile = { x: eventTile.x, y: eventTile.y + 1 };
    const fullStorage = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-arcadia-item-full',
        actorId: serverActor.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_item_chest_05',
    }, 1_100);

    assert.equal(fullStorage.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(fullStorage.replies[0]?.type === 'ACTION_REJECTED' ? fullStorage.replies[0].reason : '', /reward storage is full/);
    const rejectedSnapshot = session.createSnapshot(joined.playerId, 1_100);
    assert.equal(rejectedSnapshot.scenario.playerFieldEventFlagsByDungeonId?.arcadia_plain, undefined);
    assert.equal(player.saveSnapshot.inventory.items.some((item: any) => item.itemId === 'orig_story_0300_heal_potion'), false);

    player.saveSnapshot.inventory.items.pop();
    const retried = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-arcadia-item-retry',
        actorId: serverActor.id,
        dungeonId: 'arcadia_plain',
        eventId: 'arcadia_item_chest_05',
    }, 1_200);

    const fieldResult = retried.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(fieldResult.rewards, [{ type: 'item', itemId: 'orig_story_0300_heal_potion', originalItemId: 300 }]);
    const completedSnapshot = session.createSnapshot(joined.playerId, 1_200);
    assert.deepEqual(completedSnapshot.scenario.playerFieldEventFlagsByDungeonId?.arcadia_plain, ['arcadia_item_chest_05']);
    assert.equal(player.saveSnapshot.inventory.items.some((item: any) => item.itemId === 'orig_story_0300_heal_potion'), true);
});

test('server omits zero original item ids from scenario field reward payloads', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 16)
        .map((scenario) => scenario.questId);
    const character = authCharacter('oil-can-reward');
    const save = createDefaultCharacterSave(character);
    save.questState = { ...save.questState, completedQuestIds };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'valhalla_plain');
    const sequence = getStoryScenarioEventSequence('valhalla_plain');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'valhalla_oil_can_cache');
    assert.ok(serverActor);
    assert.ok(dungeon);
    assert.ok(event);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-valhalla-oil-can',
        actorId: serverActor.id,
        dungeonId: 'valhalla_plain',
    }, 1_000);

    const [eventTile] = getStoryScenarioFieldEventTiles('valhalla_plain', event, world);
    serverActor.tile = { x: eventTile.x, y: eventTile.y + 1 };
    const result = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'open-valhalla-oil-can',
        actorId: serverActor.id,
        dungeonId: 'valhalla_plain',
        eventId: 'valhalla_oil_can_cache',
    }, 1_100);

    const fieldResult = result.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(fieldResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(fieldResult.rewards, [{ type: 'item', itemId: 'orig_story_ep16_oil_can' }]);
});

test('server-authoritative USEITEM scenario field events require and consume the original item', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 15)
        .map((scenario) => scenario.questId);
    const character = authCharacter('server-useitem');
    const save = createDefaultCharacterSave(character);
    save.questState = { ...save.questState, completedQuestIds };
    const joined = session.join({
        ...joinMessage('central_castle', character.id),
        completedQuestIds,
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        completedQuestIds,
        saveSnapshot: save,
    });
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const serverPlayer = internals.players.get(joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'skeria_2');
    const sequence = getStoryScenarioEventSequence('skeria_2');
    const shamanEvent = sequence?.fieldEvents.find((event) => event.id === 'skeria_2_shaman_exchange');
    const flowerEvent = sequence?.fieldEvents.find((event) => event.id === 'skeria_2_yellow_flower_10');
    assert.ok(serverActor);
    assert.ok(serverPlayer);
    assert.ok(serverPlayer.saveSnapshot);
    assert.ok(dungeon);
    assert.ok(shamanEvent);
    assert.ok(flowerEvent);
    serverActor.tile = world.getDungeonEntranceTile(dungeon);

    session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'enter-skeria-useitem',
        actorId: serverActor.id,
        dungeonId: 'skeria_2',
    }, 1_000);

    const [shamanTile] = getStoryScenarioFieldEventTiles('skeria_2', shamanEvent, world);
    serverActor.tile = { x: shamanTile.x, y: shamanTile.y + 1 };
    const missing = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'skeria-shaman-without-flower',
        actorId: serverActor.id,
        dungeonId: 'skeria_2',
        eventId: shamanEvent.id,
    }, 1_100);
    assert.equal(missing.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(missing.replies[0]?.type === 'ACTION_REJECTED' ? missing.replies[0].reason : '', /requires a missing item/);
    assert.equal(serverPlayer.saveSnapshot.inventory.items.some((item: any) => item.itemId === 'orig_story_0315_stone_snake'), false);
    assert.equal(session.createSnapshot(joined.playerId, 1_100).scenario.playerFieldEventFlagsByDungeonId?.skeria_2, undefined);

    const [flowerTile] = getStoryScenarioFieldEventTiles('skeria_2', flowerEvent, world);
    serverActor.tile = { x: flowerTile.x, y: flowerTile.y + 1 };
    const flower = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'skeria-yellow-flower',
        actorId: serverActor.id,
        dungeonId: 'skeria_2',
        eventId: flowerEvent.id,
    }, 1_200));
    const flowerResult = flower.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(flowerResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(flowerResult?.type === 'SCENARIO_FIELD_EVENT_RESULT' ? flowerResult.rewards : [], [{
        type: 'item',
        itemId: 'orig_story_0397_yellow_flower',
        originalItemId: 397,
    }]);
    assert.equal(serverPlayer.carriedItems.get('orig_story_0397_yellow_flower'), 1);
    assert.equal(serverPlayer.saveSnapshot.inventory.items.some((item: any) => item.itemId === 'orig_story_0397_yellow_flower'), true);

    serverActor.tile = { x: shamanTile.x, y: shamanTile.y + 1 };
    const exchange = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'skeria-shaman-with-flower',
        actorId: serverActor.id,
        dungeonId: 'skeria_2',
        eventId: shamanEvent.id,
    }, 1_300);
    const exchangeResult = exchange.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(exchangeResult?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(exchangeResult?.type === 'SCENARIO_FIELD_EVENT_RESULT' ? exchangeResult.rewards : [], [{
        type: 'item',
        itemId: 'orig_story_0315_stone_snake',
        originalItemId: 315,
    }]);
    assert.equal(serverPlayer.carriedItems.has('orig_story_0397_yellow_flower'), false);
    assert.equal(serverPlayer.saveSnapshot.inventory.items.some((item: any) => item.itemId === 'orig_story_0397_yellow_flower'), false);
    assert.equal(serverPlayer.carriedItems.get('orig_story_0315_stone_snake'), 1);
    assert.equal(serverPlayer.saveSnapshot.inventory.items.some((item: any) => item.itemId === 'orig_story_0315_stone_snake'), true);
    assert.deepEqual(
        [...(session.createSnapshot(joined.playerId, 1_300).scenario.playerFieldEventFlagsByDungeonId?.skeria_2 ?? [])].sort(),
        ['skeria_2_shaman_exchange', 'skeria_2_yellow_flower_10']
    );
});

test('server-authoritative field scenario events reject invalid actors and distant requests', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const joinedA = session.join({ ...joinMessage('central_castle', 'hero-a'), completedQuestIds }, 0);
    const joinedB = session.join({ ...joinMessage('central_castle', 'hero-b'), completedQuestIds }, 0);
    const internals = getWorldSessionDebugState(session);
    const actorA = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedA.playerId);
    const actorB = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedB.playerId);
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

test('server scenario enemy deaths return all original CHARDEAD presentation steps through episode 31', () => {
    const world = new WorldMap();
    const scenariosWithEnemyDefeatEvents = STORY_SCENARIOS
        .map((scenario) => ({
            scenario,
            sequence: getStoryScenarioEventSequence(scenario.dungeonId),
        }))
        .filter((entry) => (entry.sequence?.enemyDefeatEvents?.length ?? 0) > 0);
    assert.deepEqual(
        scenariosWithEnemyDefeatEvents.map((entry) => entry.scenario.episode),
        [3, 12, 20],
        'all server CHARDEAD story events are covered by this test'
    );

    for (const { scenario, sequence } of scenariosWithEnemyDefeatEvents) {
        assert.ok(sequence?.enemyDefeatEvents, `episode ${scenario.episode} enemy defeat events`);
        for (const enemyDefeatEvent of sequence.enemyDefeatEvents) {
            assert.equal(
                Number.isInteger(enemyDefeatEvent.scenarioEnemyIndex),
                true,
                `episode ${scenario.episode} ${enemyDefeatEvent.id} declares server scenario enemy index`
            );

            const session = new WorldSession();
            const completedQuestIds = STORY_SCENARIOS
                .filter((entry) => entry.episode < scenario.episode)
                .map((entry) => entry.questId);
            const joined = session.join({
                ...joinMessage('central_castle', `hero-${scenario.episode}-${enemyDefeatEvent.id}`),
                completedQuestIds,
                partyComposition: [actor(`hero-${scenario.episode}-${enemyDefeatEvent.id}`, {
                    stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
                })],
            }, scenario.episode);
            const internals = getWorldSessionDebugState(session);
            const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
            const dungeon = world.getDungeons().find((entry) => entry.id === scenario.dungeonId);
            assert.ok(serverActor, `episode ${scenario.episode} actor`);
            assert.ok(dungeon, `episode ${scenario.episode} dungeon`);
            serverActor.tile = world.getDungeonEntranceTile(dungeon);

            const enter = session.handleMessage(joined.playerId, {
                type: 'SCENARIO_ENTER',
                intentId: `enter-${scenario.episode}-${enemyDefeatEvent.id}`,
                actorId: serverActor.id,
                dungeonId: scenario.dungeonId,
            }, 1_000 + scenario.episode);
            assert.equal(enter.replies.length, 0, `episode ${scenario.episode} enter`);

            const state = internals.scenarioStates.get(joined.playerId);
            assert.ok(state, `episode ${scenario.episode} state`);
            const targetEnemyId = state.enemyIds[enemyDefeatEvent.scenarioEnemyIndex as number];
            const target = internals.enemies.get(targetEnemyId);
            assert.ok(target, `episode ${scenario.episode} ${enemyDefeatEvent.id} target`);
            assert.equal(target.scenarioObjective, false, `episode ${scenario.episode} ${enemyDefeatEvent.id} target is not objective`);

            target.enemy.stats.hp = 1;
            target.enemy.stats.def = 0;
            target.enemy.stats.spd = 0;
            serverActor.actionGauge = 100;
            serverActor.remainingAp = 80;
            serverActor.tile = { x: target.enemy.gridX - 1, y: target.enemy.gridY };

            const result = withFixedRandom(0, () => session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId: `kill-${scenario.episode}-${enemyDefeatEvent.id}`,
                actorId: serverActor.id,
                kind: 'attack',
                payload: { targetId: target.enemy.id },
            }, 2_000 + scenario.episode));

            const deathEvent = result.replies.find((message) => message.type === 'SCENARIO_ENEMY_DEFEAT_EVENT');
            assert.equal(deathEvent?.type, 'SCENARIO_ENEMY_DEFEAT_EVENT', `episode ${scenario.episode} ${enemyDefeatEvent.id} event type`);
            assert.equal(deathEvent.dungeonId, scenario.dungeonId, `episode ${scenario.episode} ${enemyDefeatEvent.id} dungeon`);
            assert.equal(deathEvent.enemyId, target.enemy.id, `episode ${scenario.episode} ${enemyDefeatEvent.id} enemy id`);
            assert.equal(deathEvent.eventId, enemyDefeatEvent.id, `episode ${scenario.episode} ${enemyDefeatEvent.id} event id`);
            assert.equal(
                getStoryScenarioPresentationDurationMs(deathEvent.presentationSteps),
                getStoryScenarioPresentationDurationMs(enemyDefeatEvent.steps),
                `episode ${scenario.episode} ${enemyDefeatEvent.id} presentation duration`
            );
            assert.deepEqual(
                deathEvent.presentationSteps.map((step) => step.kind),
                enemyDefeatEvent.steps.map((step) => step.kind),
                `episode ${scenario.episode} ${enemyDefeatEvent.id} presentation kinds`
            );
            for (const step of deathEvent.presentationSteps) {
                const focus = step.kind === 'focus' ? step.target : step.focus;
                assert.deepEqual(
                    focus,
                    { x: target.enemy.gridX, y: target.enemy.gridY },
                    `episode ${scenario.episode} ${enemyDefeatEvent.id} step focus`
                );
            }
        }
    }
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
        const internals = getWorldSessionDebugState(session);
        const actorA = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joinedA.playerId);
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
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
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
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    assert.ok(serverActor);

    const beforeIds = new Set(session.createSnapshot(joined.playerId, 0).enemies.map((enemy) => enemy.id));
    serverActor.tile = { x: 67 * 32 + 16, y: 34 * 32 + 16 };
    session.tick(1_000);

    const spawned = session.createSnapshot(joined.playerId, 1_000).enemies
        .filter((enemy) => !beforeIds.has(enemy.id));
    assert.ok(spawned.length > 0, 'roaming into a distant chunk should create online nest enemies');
    assert.ok(spawned.some((enemy) =>
        Math.abs(Math.floor(enemy.tile.x / 32) - 67) <= 2
        && Math.abs(Math.floor(enemy.tile.y / 32) - 34) <= 2
    ));
    assert.ok(spawned.every((enemy) =>
        Math.abs(enemy.tile.x - serverActor.tile.x) + Math.abs(enemy.tile.y - serverActor.tile.y)
            >= FIELD_NEST_ACTOR_SAFE_DISTANCE
    ), 'new nests should materialize beyond the player viewport');

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

test('server never forces field nests into protected town or ocean chunks', () => {
    const session = new WorldSession();
    session.join(joinMessage('central_castle', 'hero-a'), 0);
    session.tick(1_000);

    const worldMap = new WorldMap();
    const activeNests = [...getWorldSessionDebugState(session).nestStates.values()]
        .filter((state) => state.monsterIds.length > 0);
    assert.ok(activeNests.length > 0, 'departure seeding should still create distant field nests');
    for (const state of activeNests) {
        const biome = worldMap.getBiomeAtChunk(
            Math.floor(state.centerTile.x / CHUNK_SIZE),
            Math.floor(state.centerTile.y / CHUNK_SIZE),
        );
        assert.notEqual(biome, 'town');
        assert.notEqual(biome, 'ocean');
    }
});

test('cleared field nests respawn after five minutes away from active actors', () => {
    const session = new WorldSession();
    const joined = session.join({
        ...joinMessage('central_castle', 'hero-a'),
        partyComposition: [actor('hero-a', {
            stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        })],
    }, 0);
    const internals = getWorldSessionDebugState(session);
    const serverActor = [...internals.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const state = [...internals.nestStates.values()].find((entry) => entry.monsterIds.length > 0);
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
    clearEnemiesForTest(session);
    const stateChunkX = Math.floor(state.centerTile.x / CHUNK_SIZE);
    const stateChunkY = Math.floor(state.centerTile.y / CHUNK_SIZE);

    serverActor.tile = { ...state.centerTile };
    session.tick(respawnAt + 1);
    assert.equal(state.monsterIds.length, 0, 'nest should not respawn inside the viewport safety radius');

    const worldMap = new WorldMap();
    let outsideSafeTile: { x: number; y: number } | null = null;
    const safeChunkOffsetX = state.centerTile.x - stateChunkX * CHUNK_SIZE < CHUNK_SIZE / 2 ? 1 : -1;
    const safeChunkOffsetY = state.centerTile.y - stateChunkY * CHUNK_SIZE < CHUNK_SIZE / 2 ? 1 : -1;
    const chunkMinX = (stateChunkX + safeChunkOffsetX) * CHUNK_SIZE;
    const chunkMinY = (stateChunkY + safeChunkOffsetY) * CHUNK_SIZE;
    for (let y = chunkMinY; y < chunkMinY + CHUNK_SIZE && !outsideSafeTile; y++) {
        for (let x = chunkMinX; x < chunkMinX + CHUNK_SIZE; x++) {
            const distance = Math.abs(x - state.centerTile.x) + Math.abs(y - state.centerTile.y);
            if (distance <= FIELD_NEST_CENTER_SAFE_DISTANCE) continue;
            if (!worldMap.isWalkable(x, y)) continue;
            outsideSafeTile = { x, y };
            break;
        }
    }
    assert.ok(outsideSafeTile, 'test fixture should find an adjacent-chunk tile outside the nest spawn safety radius');
    serverActor.tile = outsideSafeTile;
    session.tick(respawnAt + 1_001);
    assert.ok(state.monsterIds.length > 0, 'nest should respawn once the timer passed and actors are outside the spawn safety radius');
});
