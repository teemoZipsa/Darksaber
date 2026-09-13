import assert from 'node:assert/strict';
import test from 'node:test';

import { getFieldIdleYOffset } from '../../src/engine/world/FieldIdleMotion';

const STEP_SECONDS = 0.2;
const CYCLE_STEPS = 12;

function sampleCycle(entityId: string): number[] {
    return Array.from(
        { length: CYCLE_STEPS },
        (_, index) => getFieldIdleYOffset(index * STEP_SECONDS + 0.001, entityId)
    );
}

test('field idle motion is a subtle periodic whole-pixel breath', () => {
    const samples = sampleCycle('party-grand-sword');

    assert.deepEqual(new Set(samples), new Set([-1, 0, 1]));
    assert.ok(samples.every(Number.isInteger));
    assert.ok(samples.every((offset) => Math.abs(offset) <= 1));
    assert.equal(
        getFieldIdleYOffset(0.001, 'party-grand-sword'),
        getFieldIdleYOffset(CYCLE_STEPS * STEP_SECONDS + 0.001, 'party-grand-sword')
    );
});

test('field idle motion uses a stable per-character phase', () => {
    const first = sampleCycle('party-grand-sword');
    const repeated = sampleCycle('party-grand-sword');
    const second = sampleCycle('party-grand-archer');

    assert.deepEqual(repeated, first);
    assert.notDeepEqual(second, first);
});

test('field idle motion stops for reduced motion and invalid time', () => {
    for (let index = 0; index < CYCLE_STEPS; index += 1) {
        assert.equal(getFieldIdleYOffset(index * STEP_SECONDS, 'party-sage', true), 0);
    }
    assert.equal(getFieldIdleYOffset(Number.NaN, 'party-sage'), 0);
    assert.equal(getFieldIdleYOffset(Number.POSITIVE_INFINITY, 'party-sage'), 0);
});
