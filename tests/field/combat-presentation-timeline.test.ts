import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatPresentationTimeline } from '../../src/engine/world/CombatPresentationTimeline';

test('combat presentation timeline preserves anticipation, impact, and recovery order', () => {
    const timeline = new CombatPresentationTimeline();
    const events: string[] = [];

    timeline.schedule(0, () => events.push('anticipation'));
    timeline.schedule(0.1, () => events.push('impact'));
    timeline.schedule(0.34, () => events.push('recovery'));

    assert.deepEqual(events, ['anticipation']);
    assert.equal(timeline.pendingCount, 2);

    timeline.update(0.099);
    timeline.update(0);
    assert.deepEqual(events, ['anticipation']);

    timeline.update(0.002);
    assert.deepEqual(events, ['anticipation', 'impact']);
    assert.equal(timeline.pendingCount, 1);

    timeline.update(1);
    assert.deepEqual(events, ['anticipation', 'impact', 'recovery']);
    assert.equal(timeline.pendingCount, 0);
});

test('combat presentation timeline fires same-time events once in insertion order across a large frame', () => {
    const timeline = new CombatPresentationTimeline();
    const events: string[] = [];

    timeline.schedule(0.1, () => events.push('damage'));
    timeline.schedule(0.1, () => events.push('effect'));
    timeline.schedule(0.101, () => events.push('hitstop'));
    timeline.update(10);
    timeline.update(10);

    assert.deepEqual(events, ['damage', 'effect', 'hitstop']);
});
