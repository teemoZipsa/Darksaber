import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { getStoryScenarioEventSequence } from '../../src/data/StoryScenarioEventData';
import { getStoryScenarioFieldEventTiles } from '../../src/data/StoryScenarioFieldEventPlacement';
import { WorldMap } from '../../src/map/WorldMap';
import type { ActorSnapshot, WorldJoinMessage } from '../../src/net/WorldProtocol';
import { WorldSession } from '../../server/WorldSession';
import { checkRaidLabInvariants } from '../../scripts/raid-lab/invariants';
import { getPlayerDebugState } from './world-session-harness';

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

function joinParty(originHubId: string, members: ActorSnapshot[], resumeToken?: string): WorldJoinMessage {
    return {
        type: 'WORLD_JOIN',
        originHubId,
        partyComposition: members,
        clientVersion: 'test',
        resumeToken,
    };
}

function ownedActors(session: WorldSession, playerId: string) {
    const player = getPlayerDebugState(session, playerId);
    return player.actorIds.map((actorId) => {
        const entry = session.getDebugState().actors.get(actorId);
        assert.ok(entry, `missing actor ${actorId}`);
        return entry;
    });
}

function countRaidResults(result: { replies: Array<{ type: string }>; broadcasts: Array<{ type: string }> }): number {
    return [...result.replies, ...result.broadcasts].filter((message) => message.type === 'RAID_RESULT').length;
}

test('world session join with 2-3 actor partyComposition wires ownership and unique ids', () => {
    for (const size of [2, 3] as const) {
        const session = new WorldSession();
        const members = Array.from({ length: size }, (_, index) => actor(`party-hero-${size}-${index}`, {
            classLineId: index === 0 ? 'infantry' : index === 1 ? 'cleric' : 'mage',
        }));
        const joined = session.join(joinParty('central_castle', members), 0);
        const player = getPlayerDebugState(session, joined.playerId);
        const actors = ownedActors(session, joined.playerId);

        assert.equal(player.actorIds.length, size);
        assert.equal(actors.length, size);
        assert.equal(new Set(player.actorIds).size, size);
        assert.equal(new Set(actors.map((entry) => entry.localActorId)).size, size);
        assert.equal(new Set(actors.map((entry) => entry.id)).size, size);

        for (const entry of actors) {
            assert.equal(entry.ownerPlayerId, joined.playerId);
            assert.equal(entry.id, `${joined.playerId}:${entry.localActorId}`);
        }
    }
});

test('world session accepts PLAYER_INTENT for ready companion while leader is also ready', () => {
    const session = new WorldSession();
    const joined = session.join(joinParty('central_castle', [
        actor('leader', { stats: createBaseStats({ spd: 200, mov: 50, actionLimit: 80, hitRate: 200 }) }),
        actor('companion', {
            classLineId: 'cleric',
            stats: createBaseStats({ spd: 200, mov: 50, actionLimit: 80, hitRate: 200 }),
        }),
    ]), 0);

    for (let tick = 0; tick < 80; tick++) {
        session.tick(tick * 100);
    }
    const actors = ownedActors(session, joined.playerId);
    for (const entry of actors) {
        entry.remainingAp = 80;
        entry.actionGauge = 100;
    }
    assert.ok(actors.every((entry) => entry.remainingAp > 0));

    const companion = actors.find((entry) => entry.localActorId === 'companion');
    const leader = actors.find((entry) => entry.localActorId === 'leader');
    assert.ok(companion);
    assert.ok(leader);
    assert.ok(leader.remainingAp > 0);

    const result = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'companion-defend',
        actorId: companion.id,
        kind: 'defend',
        payload: {},
    }, 8_000);

    const rejected = result.replies.find((message) => message.type === 'ACTION_REJECTED');
    assert.equal(rejected, undefined, rejected && rejected.type === 'ACTION_REJECTED' ? rejected.reason : '');
});

test('disconnect mid-raid zeroes all party AP, rejects ghost intents, and reconnects party intact', () => {
    const session = new WorldSession({ ghostGraceMs: 5_000 });
    const joined = session.join(joinParty('central_castle', [
        actor('lead'),
        actor('comp-a', { classLineId: 'cleric' }),
        actor('comp-b', { classLineId: 'mage' }),
    ]), 0, {
        accountId: 'account-party',
        characterId: 'lead',
    });

    for (const entry of ownedActors(session, joined.playerId)) {
        entry.remainingAp = 80;
        entry.actionGauge = 100;
    }
    assert.ok(ownedActors(session, joined.playerId).some((entry) => entry.remainingAp > 0));

    session.disconnect(joined.playerId, 1_000);
    const afterDisconnect = ownedActors(session, joined.playerId);
    assert.equal(afterDisconnect.length, 3);
    assert.ok(afterDisconnect.every((entry) => entry.remainingAp === 0));

    const ghostIntent = session.handleMessage(joined.playerId, {
        type: 'PLAYER_INTENT',
        intentId: 'ghost-intent',
        actorId: afterDisconnect[0]!.id,
        kind: 'defend',
        payload: {},
    }, 1_100);
    assert.equal(ghostIntent.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(
        ghostIntent.replies[0]?.type === 'ACTION_REJECTED' ? ghostIntent.replies[0].reason : '',
        /Ghost/i,
    );

    const resumed = session.reconnect(joined.welcome.resumeToken, 1_500);
    assert.ok(resumed);
    assert.equal(resumed.playerId, joined.playerId);
    assert.equal(ownedActors(session, resumed.playerId).length, 3);
});

test('duplicate local snapshot ids are exposed to raid-lab invariants', () => {
    const session = new WorldSession();
    const joined = session.join(joinParty('central_castle', [
        actor('dup-hero'),
        actor('dup-hero', { classLineId: 'cleric', name: 'dup-hero-copy' }),
    ]), 0);
    const player = getPlayerDebugState(session, joined.playerId);
    const uniqueActorIds = new Set(player.actorIds);
    const mapActors = [...session.getDebugState().actors.values()]
        .filter((entry) => entry.ownerPlayerId === joined.playerId);

    // JoinBuilder pushes one actorId per composition entry without dedupe.
    // Identical snapshot.id collide on `${playerId}:${id}`, so the actor map keeps one entry.
    assert.equal(player.actorIds.length, 2);
    assert.equal(uniqueActorIds.size, 1);
    assert.equal(mapActors.length, 1);
    assert.equal(player.actorIds[0], `${joined.playerId}:dup-hero`);
    assert.equal(player.actorIds[1], `${joined.playerId}:dup-hero`);

    const violationCodes = checkRaidLabInvariants({
        session,
        playerId: joined.playerId,
        simMs: 0,
        actionIndex: 0,
        raidFinished: false,
        expectedPartySize: 2,
    }).map((entry) => entry.code);
    assert.ok(violationCodes.includes('duplicate_actor_id'));
    assert.ok(violationCodes.includes('duplicate_local_actor_id'));
});

test('2-actor party leave emits exactly one RAID_RESULT', () => {
    const session = new WorldSession();
    const joined = session.join(joinParty('central_castle', [
        actor('leave-a'),
        actor('leave-b', { classLineId: 'cavalry' }),
    ]), 0);

    const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason: 'manual' }, 500);
    assert.equal(countRaidResults(leave), 1);
    assert.equal(leave.replies[0]?.type, 'RAID_RESULT');
});

test('party companions cannot claim the same scenario reward twice', () => {
    const session = new WorldSession();
    const world = new WorldMap();
    const completedQuestIds = STORY_SCENARIOS
        .filter((scenario) => scenario.episode < 4)
        .map((scenario) => scenario.questId);
    const joined = session.join({
        ...joinParty('central_castle', [actor('reward-leader'), actor('reward-companion')]),
        completedQuestIds,
    }, 0, { completedQuestIds });
    const [leader, companion] = ownedActors(session, joined.playerId);
    const dungeon = world.getDungeons().find((entry) => entry.id === 'arcadia_plain');
    const sequence = getStoryScenarioEventSequence('arcadia_plain');
    const event = sequence?.fieldEvents.find((entry) => entry.id === 'arcadia_gold_chest_01');
    assert.ok(leader);
    assert.ok(companion);
    assert.ok(dungeon);
    assert.ok(event);

    leader.tile = world.getDungeonEntranceTile(dungeon);
    const enter = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_ENTER',
        intentId: 'party-enter-arcadia',
        actorId: leader.id,
        dungeonId: 'arcadia_plain',
    }, 1_000);
    assert.equal(enter.replies.some((message) => message.type === 'ACTION_REJECTED'), false);

    const [eventTile] = getStoryScenarioFieldEventTiles('arcadia_plain', event, world);
    leader.tile = { x: eventTile.x, y: eventTile.y + 1 };
    companion.tile = { ...leader.tile };
    const first = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'party-reward-leader',
        actorId: leader.id,
        dungeonId: 'arcadia_plain',
        eventId: event.id,
    }, 1_100);
    const firstReward = first.replies.find((message) => message.type === 'SCENARIO_FIELD_EVENT_RESULT');
    assert.equal(firstReward?.type, 'SCENARIO_FIELD_EVENT_RESULT');
    assert.deepEqual(firstReward.rewards, [{ type: 'gold', amount: 100 }]);
    assert.equal(getPlayerDebugState(session, joined.playerId).raidGoldReward, 100);

    const duplicate = session.handleMessage(joined.playerId, {
        type: 'SCENARIO_FIELD_EVENT_INTERACT',
        intentId: 'party-reward-companion',
        actorId: companion.id,
        dungeonId: 'arcadia_plain',
        eventId: event.id,
    }, 1_200);
    assert.equal(duplicate.replies[0]?.type, 'ACTION_REJECTED');
    assert.match(
        duplicate.replies[0]?.type === 'ACTION_REJECTED' ? duplicate.replies[0].reason : '',
        /already complete/,
    );
    assert.equal(getPlayerDebugState(session, joined.playerId).raidGoldReward, 100);
});
