import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import {
    BOUNTY_PROOF_ITEM_ID,
    getBountyOffers,
} from '../../src/data/BountyContractData';
import type {
    ActorSnapshot,
    AutoLootGrantMessage,
    WorldJoinMessage,
} from '../../src/net/WorldProtocol';
import { WorldMap } from '../../src/map/WorldMap';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { WorldSession } from '../../server/WorldSession';

function actor(id: string): ActorSnapshot {
    return {
        id,
        localActorId: id,
        name: id,
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ atk: 999, spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
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
        accountId: `account-${id}`,
        slotNo: 1,
        name: id,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}

function killJoinedBountyTarget(session: WorldSession, playerId: string, intentId: string) {
    const debug = session.getDebugState();
    const player = debug.players.get(playerId);
    const serverActor = [...debug.actors.values()].find((entry) => entry.ownerPlayerId === playerId);
    revealJoinedBountyTarget(session, playerId, `${intentId}-reveal`);
    const target = [...debug.enemies.values()].find((entry) => entry.bountyPlayerId === playerId);
    assert.ok(player);
    assert.ok(serverActor);
    assert.ok(target);
    target.enemy.stats.hp = 1;
    target.enemy.stats.def = 0;
    serverActor.tile = { x: target.enemy.gridX - 1, y: target.enemy.gridY };
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    const attack = session.handleMessage(playerId, {
        type: 'PLAYER_INTENT',
        intentId,
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: target.enemy.id },
    }, 1_000);
    const grant = attack.replies.find(
        (message): message is AutoLootGrantMessage => message.type === 'AUTO_LOOT_GRANT',
    );
    assert.ok(grant);
    assert.equal(attack.replies.some((message) => message.type === 'COMBAT_EVENT'), true);
    assert.equal(attack.broadcasts.length, 0);
    return { player, serverActor, grant };
}

function inspectJoinedBountyClue(
    session: WorldSession,
    playerId: string,
    clueIndex: number,
    intentId: string,
) {
    const debug = session.getDebugState();
    const player = debug.players.get(playerId);
    const serverActor = [...debug.actors.values()].find((entry) => entry.ownerPlayerId === playerId);
    const clue = player?.bounty?.clueSites?.[clueIndex];
    assert.ok(player);
    assert.ok(serverActor);
    assert.ok(clue);
    serverActor.tile = { ...clue.tile };
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 100;
    return session.handleMessage(playerId, {
        type: 'BOUNTY_CLUE_INTERACT',
        intentId,
        actorId: serverActor.id,
        clueId: clue.id,
    }, 500 + clueIndex);
}

function revealJoinedBountyTarget(session: WorldSession, playerId: string, intentPrefix: string): void {
    const bounty = session.getDebugState().players.get(playerId)?.bounty;
    assert.ok(bounty);
    while ((bounty.cluesFound ?? 0) < 2) {
        const clueIndex = bounty.cluesFound ?? 0;
        const result = inspectJoinedBountyClue(
            session,
            playerId,
            clueIndex,
            `${intentPrefix}-${clueIndex}`,
        );
        assert.equal(result.replies[0]?.type, 'BOUNTY_CLUE_RESULT');
    }
}

test('accepted bounty spawns a private elite and pays only after proof is carried to survival', () => {
    const session = new WorldSession({ random: () => 0 });
    const character = authCharacter('bounty-hero');
    const save = createDefaultCharacterSave(character);
    const contract = getBountyOffers('central_castle', 0, 0)[0];
    save.questState.activeBountyContractId = contract.id;

    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const debug = session.getDebugState();
    const player = debug.players.get(joined.playerId);
    const serverActor = [...debug.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    assert.ok(player);
    assert.ok(serverActor);
    assert.equal(
        [...debug.enemies.values()].some((entry) => entry.bountyPlayerId === joined.playerId),
        false,
    );
    const initialSnapshot = session.createSnapshot(joined.playerId, 10);
    assert.equal(initialSnapshot.bountyHunt?.contractId, contract.id);
    assert.equal(initialSnapshot.bountyHunt?.cluesFound, 0);
    assert.ok(initialSnapshot.bountyHunt?.searchArea);
    const firstClue = player.bounty?.clueSites?.[0];
    assert.ok(firstClue);
    serverActor.tile = { ...firstClue.tile };
    assert.equal(
        session.createSnapshot(joined.playerId, 10).bountyHunt?.nearbyClue?.clueId,
        firstClue.id,
    );

    const viewer = session.join(joinMessage('other-hero'), 0);
    assert.equal(session.createSnapshot(viewer.playerId, 10).bountyHunt, undefined);
    revealJoinedBountyTarget(session, joined.playerId, 'reveal-private-target');
    const target = [...debug.enemies.values()].find((entry) => entry.bountyPlayerId === joined.playerId);
    assert.ok(target);
    assert.equal(target.bountyContractId, contract.id);
    assert.deepEqual(target.enemy.eliteAffixes, contract.affixIds);

    assert.equal(
        session.createSnapshot(viewer.playerId, 10).enemies.some((enemy) => enemy.id === target.enemy.id),
        false,
    );
    assert.equal(
        session.createSnapshot(null, 10).enemies.some((enemy) => enemy.id === target.enemy.id),
        false,
    );
    assert.equal(session.createSnapshot(null, 10).bountyHunt, undefined);
    const ownerSnapshot = session.createSnapshot(joined.playerId, 10).enemies.find((enemy) => enemy.id === target.enemy.id);
    assert.ok(ownerSnapshot);
    assert.deepEqual(ownerSnapshot.eliteAffixes, contract.affixIds);
    assert.equal(ownerSnapshot.bountyContractId, contract.id);

    target.enemy.stats.hp = 1;
    target.enemy.stats.def = 0;
    serverActor.tile = { x: target.enemy.gridX - 1, y: target.enemy.gridY };
    serverActor.actionGauge = 100;
    serverActor.remainingAp = 80;
    const attack = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'kill-bounty-target',
        actorId: serverActor.id,
        kind: 'attack',
        payload: { targetId: target.enemy.id },
    }, 1_000);
    const grant = attack.replies.find(
        (message): message is AutoLootGrantMessage => message.type === 'AUTO_LOOT_GRANT',
    );
    assert.ok(grant);
    assert.equal(grant.gridSnapshot.items[0]?.itemId, BOUNTY_PROOF_ITEM_ID);
    session.handleMessage(joined.playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: [{ gridX: 0, gridY: 0 }],
    }, 1_100);
    assert.equal(player.carriedItems.get(BOUNTY_PROOF_ITEM_ID), 1);

    const world = new WorldMap();
    const extractionTown = world.getTowns().find((town) => town.id === 'w_forest_village');
    assert.ok(extractionTown);
    serverActor.tile = world.getTownSpawnTile(extractionTown);
    const leave = session.handleMessage(joined.playerId, {
        type: 'WORLD_LEAVE',
        reason: 'town',
    }, 1_200);
    const result = leave.replies.find((message) => message.type === 'RAID_RESULT');
    assert.equal(result?.type, 'RAID_RESULT');
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.bounty?.contractId, contract.id);
    assert.equal(result.bounty?.baseReward, contract.rewardGold);
    assert.equal(result.bounty?.riskCompleted, true);

    const finalPatch = session.createCharacterSavePatch(joined.playerId);
    assert.ok(finalPatch?.questState);
    assert.equal(finalPatch.questState.activeBountyContractId, null);
    assert.equal(
        finalPatch.inventory?.items.some((item) => item.itemId === BOUNTY_PROOF_ITEM_ID),
        false,
    );
    assert.equal(
        finalPatch.questState.gold,
        500 + contract.rewardGold + contract.bonusGold + 200,
    );
});

test('bounty clues reject forged, distant, unordered, duplicate, spent, and interior interactions', () => {
    const session = new WorldSession({ random: () => 0 });
    const character = authCharacter('bounty-tracker');
    const save = createDefaultCharacterSave(character);
    const contract = getBountyOffers('central_castle', 0, 0)[1];
    save.questState.activeBountyContractId = contract.id;
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const debug = session.getDebugState();
    const player = debug.players.get(joined.playerId);
    const serverActor = [...debug.actors.values()].find((entry) => entry.ownerPlayerId === joined.playerId);
    const firstClue = player?.bounty?.clueSites?.[0];
    const secondClue = player?.bounty?.clueSites?.[1];
    assert.ok(player);
    assert.ok(serverActor);
    assert.ok(firstClue);
    assert.ok(secondClue);

    serverActor.tile = { x: firstClue.tile.x + 10, y: firstClue.tile.y };
    serverActor.remainingAp = 100;
    const far = session.handleMessage(joined.playerId, {
        type: 'BOUNTY_CLUE_INTERACT',
        intentId: 'bounty-clue-far',
        actorId: serverActor.id,
        clueId: firstClue.id,
    });
    assert.equal(far.replies[0]?.type, 'ACTION_REJECTED');
    assert.equal(player.bounty?.cluesFound, 0);
    assert.equal(serverActor.remainingAp, 100);

    serverActor.tile = { ...firstClue.tile };
    serverActor.remainingAp = 0;
    const spent = session.handleMessage(joined.playerId, {
        type: 'BOUNTY_CLUE_INTERACT',
        intentId: 'bounty-clue-spent',
        actorId: serverActor.id,
        clueId: firstClue.id,
    });
    assert.equal(spent.replies[0]?.type, 'ACTION_REJECTED');
    assert.equal(player.bounty?.cluesFound, 0);

    serverActor.remainingAp = 100;
    for (const [intentId, clueId] of [
        ['bounty-clue-forged', `${contract.id}:clue:forged`],
        ['bounty-clue-out-of-order', secondClue.id],
    ]) {
        const rejected = session.handleMessage(joined.playerId, {
            type: 'BOUNTY_CLUE_INTERACT',
            intentId,
            actorId: serverActor.id,
            clueId,
        });
        assert.equal(rejected.replies[0]?.type, 'ACTION_REJECTED');
        assert.equal(player.bounty?.cluesFound, 0);
        assert.equal(serverActor.remainingAp, 100);
    }

    player.activeDungeonId = 'test-interior';
    const interior = session.handleMessage(joined.playerId, {
        type: 'BOUNTY_CLUE_INTERACT',
        intentId: 'bounty-clue-interior',
        actorId: serverActor.id,
        clueId: firstClue.id,
    });
    assert.equal(interior.replies[0]?.type, 'ACTION_REJECTED');
    assert.equal(player.bounty?.cluesFound, 0);
    player.activeDungeonId = null;

    const other = session.join(joinMessage('bounty-clue-thief'), 0);
    const wrongOwner = session.handleMessage(other.playerId, {
        type: 'BOUNTY_CLUE_INTERACT',
        intentId: 'bounty-clue-wrong-owner',
        actorId: serverActor.id,
        clueId: firstClue.id,
    });
    assert.equal(wrongOwner.replies[0]?.type, 'ACTION_REJECTED');
    assert.equal(player.bounty?.cluesFound, 0);

    const first = inspectJoinedBountyClue(session, joined.playerId, 0, 'bounty-clue-first');
    assert.equal(first.replies[0]?.type, 'BOUNTY_CLUE_RESULT');
    assert.equal(player.bounty?.cluesFound, 1);
    assert.equal(
        [...debug.enemies.values()].some((entry) => entry.bountyPlayerId === joined.playerId),
        false,
    );

    serverActor.tile = { ...firstClue.tile };
    serverActor.remainingAp = 100;
    const duplicate = session.handleMessage(joined.playerId, {
        type: 'BOUNTY_CLUE_INTERACT',
        intentId: 'bounty-clue-duplicate',
        actorId: serverActor.id,
        clueId: firstClue.id,
    });
    assert.equal(duplicate.replies[0]?.type, 'ACTION_REJECTED');
    assert.equal(player.bounty?.cluesFound, 1);
    assert.equal(serverActor.remainingAp, 100);

    const second = inspectJoinedBountyClue(session, joined.playerId, 1, 'bounty-clue-second');
    assert.equal(second.replies[0]?.type, 'BOUNTY_CLUE_RESULT');
    assert.equal(
        second.replies[0]?.type === 'BOUNTY_CLUE_RESULT' && second.replies[0].targetRevealed,
        true,
    );
    assert.equal(player.bounty?.cluesFound, 2);
    assert.equal(
        [...debug.enemies.values()].filter((entry) => entry.bountyPlayerId === joined.playerId).length,
        1,
    );
});

test('bounty elite and runtime identity survive a server session snapshot round trip', () => {
    const session = new WorldSession();
    const character = authCharacter('persistent-bounty');
    const save = createDefaultCharacterSave(character);
    const contract = getBountyOffers('central_castle', 0, 0)[2];
    save.questState.activeBountyContractId = contract.id;
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    revealJoinedBountyTarget(session, joined.playerId, 'persistent-reveal');
    const before = [...session.getDebugState().enemies.values()]
        .find((entry) => entry.bountyPlayerId === joined.playerId);
    assert.ok(before);

    const restored = WorldSession.restorePersistentSnapshot(
        JSON.parse(JSON.stringify(session.createPersistentSnapshot())),
    );
    const afterPlayer = restored.getDebugState().players.get(joined.playerId);
    const after = [...restored.getDebugState().enemies.values()]
        .find((entry) => entry.bountyPlayerId === joined.playerId);
    assert.ok(afterPlayer?.bounty);
    assert.ok(after);
    assert.equal(afterPlayer.bounty.targetEnemyId, after.enemy.id);
    assert.equal(after.bountyContractId, contract.id);
    assert.deepEqual(after.enemy.eliteAffixes, contract.affixIds);
});

test('bounty clue progress survives a session snapshot and resumes at the next clue', () => {
    const session = new WorldSession();
    const character = authCharacter('persistent-bounty-clues');
    const save = createDefaultCharacterSave(character);
    const contract = getBountyOffers('central_castle', 0, 0)[0];
    save.questState.activeBountyContractId = contract.id;
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const beforeBounty = session.getDebugState().players.get(joined.playerId)?.bounty;
    assert.ok(beforeBounty?.clueSites);
    const firstClueId = beforeBounty.clueSites[0].id;
    const secondClueId = beforeBounty.clueSites[1].id;
    const firstSearchArea = session.createSnapshot(joined.playerId).bountyHunt?.searchArea;
    inspectJoinedBountyClue(session, joined.playerId, 0, 'persist-first-clue');
    const secondSearchArea = session.createSnapshot(joined.playerId).bountyHunt?.searchArea;
    assert.notDeepEqual(secondSearchArea?.center, firstSearchArea?.center);
    assert.deepEqual(secondSearchArea?.center, beforeBounty.clueSites[1].tile);
    assert.equal(secondSearchArea?.radius, 10);

    const restored = WorldSession.restorePersistentSnapshot(
        JSON.parse(JSON.stringify(session.createPersistentSnapshot())),
    );
    const restoredBounty = restored.getDebugState().players.get(joined.playerId)?.bounty;
    assert.equal(restoredBounty?.cluesFound, 1);
    assert.equal(restoredBounty?.clueSites?.[0]?.id, firstClueId);
    assert.equal(restoredBounty?.clueSites?.[1]?.id, secondClueId);
    assert.equal(
        [...restored.getDebugState().enemies.values()]
            .some((entry) => entry.bountyPlayerId === joined.playerId),
        false,
    );

    inspectJoinedBountyClue(restored, joined.playerId, 1, 'persist-second-clue');
    assert.equal(
        [...restored.getDebugState().enemies.values()]
            .filter((entry) => entry.bountyPlayerId === joined.playerId).length,
        1,
    );
});

test('legacy bounty snapshot with an existing target normalizes to revealed progress', () => {
    const session = new WorldSession();
    const character = authCharacter('legacy-bounty-target');
    const save = createDefaultCharacterSave(character);
    save.questState.activeBountyContractId = getBountyOffers('central_castle', 0, 0)[2].id;
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    revealJoinedBountyTarget(session, joined.playerId, 'legacy-target-reveal');
    const snapshot = session.createPersistentSnapshot();
    const persistedPlayer = snapshot.players.find((player) => player.id === joined.playerId);
    assert.ok(persistedPlayer?.bounty);
    delete persistedPlayer.bounty.cluesFound;
    delete persistedPlayer.bounty.clueSites;
    delete persistedPlayer.bounty.searchAreas;
    delete persistedPlayer.bounty.targetAnchor;

    const restored = WorldSession.restorePersistentSnapshot(
        JSON.parse(JSON.stringify(snapshot)),
    );
    const restoredBounty = restored.getDebugState().players.get(joined.playerId)?.bounty;
    assert.equal(restoredBounty?.cluesFound, 2);
    assert.equal(restoredBounty?.clueSites?.length, 2);
    assert.equal(
        [...restored.getDebugState().enemies.values()]
            .filter((entry) => entry.bountyPlayerId === joined.playerId).length,
        1,
    );
});

test('full inventory cannot forge proof carry or bounty settlement', () => {
    const session = new WorldSession({ random: () => 0 });
    const character = authCharacter('full-bounty-bag');
    const save = createDefaultCharacterSave(character);
    const contract = getBountyOffers('central_castle', 0, 0)[0];
    save.questState.activeBountyContractId = contract.id;
    save.inventory = {
        width: 1,
        height: 1,
        items: [{
            uid: 'occupied-slot',
            itemId: 'herb_common',
            gridX: 0,
            gridY: 0,
            quantity: 1,
            durability: 100,
        }],
    };
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const { player, serverActor, grant } = killJoinedBountyTarget(
        session,
        joined.playerId,
        'kill-full-bag-bounty',
    );

    session.handleMessage(joined.playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: [{ gridX: 0, gridY: 0 }],
    }, 1_100);
    assert.equal(player.carriedItems.get(BOUNTY_PROOF_ITEM_ID) ?? 0, 0);
    assert.ok(session.getDebugState().loot.get(grant.lootId));

    player.carriedItems.set(BOUNTY_PROOF_ITEM_ID, 1);
    const extractionTown = new WorldMap().getTowns().find((town) => town.id === 'w_forest_village');
    assert.ok(extractionTown);
    serverActor.tile = new WorldMap().getTownSpawnTile(extractionTown);
    const leave = session.handleMessage(joined.playerId, {
        type: 'WORLD_LEAVE',
        reason: 'town',
    }, 1_200);
    const result = leave.replies.find((message) => message.type === 'RAID_RESULT');
    assert.equal(result?.type, 'RAID_RESULT');
    assert.equal(result.bounty, undefined);
    assert.equal(
        session.createCharacterSavePatch(joined.playerId)?.questState?.activeBountyContractId,
        contract.id,
    );
});

test('curse downs invalidate the unbroken bounty risk objective', () => {
    const session = new WorldSession();
    const character = authCharacter('cursed-bounty');
    const save = createDefaultCharacterSave(character);
    const contract = Array.from({ length: 20 }, (_, cycle) => (
        getBountyOffers('central_castle', cycle, 0)
    )).flat().find((offer) => offer.riskId === 'unbroken');
    assert.ok(contract);
    save.questState.activeBountyContractId = contract.id;
    const cursedActor = actor(character.id);
    cursedActor.stats = createBaseStats({
        hp: 1,
        maxHp: 100,
        atk: 999,
        spd: 1_000,
        mov: 50,
        actionLimit: 80,
        hitRate: 200,
    });
    const backupActor = actor('cursed-bounty-backup');
    backupActor.stats = createBaseStats({
        hp: 100,
        maxHp: 100,
        spd: 1,
        mov: 50,
        actionLimit: 80,
        hitRate: 200,
    });
    const joined = session.join({
        ...joinMessage(character.id),
        partyComposition: [cursedActor, backupActor],
        carriedItems: [{ itemId: 'cursed_blood_reliquary', quantity: 1 }],
    }, 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
        equipmentStatBonuses: { [character.id]: { maxHp: 100 } },
    });

    session.tick(0);
    session.tick(1_000);
    assert.equal(session.getDebugState().players.get(joined.playerId)?.bounty?.hadActorDown, true);
});

test('private proof loot is removed when its owner expires from the session', () => {
    const session = new WorldSession({ random: () => 0, ghostGraceMs: 1 });
    const character = authCharacter('orphan-proof-owner');
    const save = createDefaultCharacterSave(character);
    save.questState.activeBountyContractId = getBountyOffers('central_castle', 0, 0)[0].id;
    const joined = session.join(joinMessage(character.id), 0, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });
    const { grant } = killJoinedBountyTarget(session, joined.playerId, 'kill-before-disconnect');
    assert.equal(
        session.getDebugState().loot.get(grant.lootId)?.ownerPlayerId,
        joined.playerId,
    );

    session.disconnect(joined.playerId, 0);
    session.tick(2);
    assert.equal(
        [...session.getDebugState().loot.values()]
            .some((lootObject) => lootObject.ownerPlayerId === joined.playerId),
        false,
    );
});
