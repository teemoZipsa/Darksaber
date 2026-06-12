import test from 'node:test';
import assert from 'node:assert/strict';
import { BURGOS_CASTLE_DUNGEON_ID } from '../../src/data/MonsterCatalog';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';

test('world raid session advances, expires, and records raid events without combat dependencies', () => {
    const raid = new WorldRaidSession('central_castle', 10);

    raid.beginRaidFromTown('central_castle');
    assert.equal(raid.active, true);
    assert.equal(raid.departureTownId, 'central_castle');

    const paused = raid.advanceTimer(5, { townVisible: false, resultVisible: false, turnCombatActive: true });
    assert.deepEqual(paused, { advanced: false, expired: false });
    assert.equal(raid.elapsedSeconds, 0);

    const running = raid.advanceTimer(4, { townVisible: false, resultVisible: false, turnCombatActive: false });
    assert.deepEqual(running, { advanced: true, expired: false });
    assert.equal(raid.elapsedSeconds, 4);

    raid.recordKill();
    raid.recordCharacterDown('hero-1');
    assert.equal(raid.kills, 1);
    assert.equal(raid.downedCharacterIds.has('hero-1'), true);

    const expired = raid.advanceTimer(10, { townVisible: false, resultVisible: false, turnCombatActive: false });
    assert.deepEqual(expired, { advanced: true, expired: true });
    assert.equal(raid.elapsedSeconds, 10);
});

test('world raid session tracks town transition and pending result town', () => {
    const raid = new WorldRaidSession('central_castle');

    raid.beginRaidFromTown('central_castle');
    assert.equal(raid.shouldReportDepartureBlock('central_castle'), true);
    assert.equal(raid.shouldReportDepartureBlock('central_castle'), false);
    raid.clearDepartureBlock();
    assert.equal(raid.shouldReportDepartureBlock('central_castle'), true);

    raid.startDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
    raid.completeDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
    assert.equal(raid.isDungeonCleared(BURGOS_CASTLE_DUNGEON_ID), true);

    raid.completeAtTown('w_forest_village');
    assert.equal(raid.active, false);
    assert.equal(raid.currentHubTownId, 'w_forest_village');
    assert.equal(raid.isDungeonCleared(BURGOS_CASTLE_DUNGEON_ID), false);

    raid.setPendingTownAfterResult('w_forest_village');
    assert.equal(raid.consumePendingTownAfterResultId(), 'w_forest_village');
    assert.equal(raid.consumePendingTownAfterResultId(), null);
});

test('world raid session keeps scenario runtime flags until the raid lifecycle resets', () => {
    const raid = new WorldRaidSession('central_castle');

    raid.beginRaidFromTown('central_castle');
    raid.startDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
    raid.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key');
    raid.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key');
    raid.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'cain_necklace');

    assert.equal(raid.hasScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key'), true);
    assert.deepEqual(raid.getScenarioFlags(BURGOS_CASTLE_DUNGEON_ID), ['burgos_key', 'cain_necklace']);

    raid.completeDungeonEncounter(BURGOS_CASTLE_DUNGEON_ID);
    assert.equal(raid.hasScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key'), true);

    raid.completeAtTown('w_forest_village');
    assert.deepEqual(raid.getScenarioFlags(BURGOS_CASTLE_DUNGEON_ID), []);

    raid.beginRaidFromTown('w_forest_village');
    raid.setScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key');
    raid.failBackToTown('w_forest_village');
    assert.equal(raid.hasScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'burgos_key'), false);
});
