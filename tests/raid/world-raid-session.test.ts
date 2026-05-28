import test from 'node:test';
import assert from 'node:assert/strict';
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

    raid.completeAtTown('w_forest_village');
    assert.equal(raid.active, false);
    assert.equal(raid.currentHubTownId, 'w_forest_village');

    raid.setPendingTownAfterResult('w_forest_village');
    assert.equal(raid.consumePendingTownAfterResultId(), 'w_forest_village');
    assert.equal(raid.consumePendingTownAfterResultId(), null);
});
