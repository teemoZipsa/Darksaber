import test from 'node:test';
import assert from 'node:assert/strict';
import { runRaidLabExpedition } from '../../scripts/raid-lab/runner';
import type { RaidLabPolicyId } from '../../scripts/raid-lab/types';

const POLICIES: RaidLabPolicyId[] = ['balanced', 'cautious', 'random-legal'];

test('raid lab same seed produces identical digests for each policy', () => {
    for (const policy of POLICIES) {
        const first = runRaidLabExpedition({ seed: 42, policy, maxActions: 80 });
        const second = runRaidLabExpedition({ seed: 42, policy, maxActions: 80 });
        assert.equal(first.digest, second.digest, `${policy} digest mismatch`);
        assert.equal(first.result, second.result, `${policy} result mismatch`);
        assert.equal(first.kills, second.kills, `${policy} kills mismatch`);
        assert.deepEqual(first.actions, second.actions, `${policy} actions mismatch`);
        assert.deepEqual(first.invariantViolations, second.invariantViolations, `${policy} invariants mismatch`);
    }
});

test('raid lab different seeds diverge or remain independently stable', () => {
    const a = runRaidLabExpedition({ seed: 7, policy: 'balanced', maxActions: 60 });
    const b = runRaidLabExpedition({ seed: 8, policy: 'balanced', maxActions: 60 });
    const aAgain = runRaidLabExpedition({ seed: 7, policy: 'balanced', maxActions: 60 });
    assert.equal(a.digest, aAgain.digest);
    // Different seeds usually diverge; if they collide, both must still be self-stable.
    if (a.digest === b.digest) {
        const bAgain = runRaidLabExpedition({ seed: 8, policy: 'balanced', maxActions: 60 });
        assert.equal(b.digest, bAgain.digest);
    }
});

test('raid lab starter expedition finishes with a legal raid result', () => {
    const result = runRaidLabExpedition({ seed: 1, policy: 'balanced', maxActions: 120 });
    assert.ok(['SURVIVED', 'DEAD', 'MIA', 'LEFT'].includes(result.result));
    assert.ok(result.actions.length > 0);
    assert.equal(result.departureTownId, 'central_castle');
    assert.ok(result.digest.length >= 16);
});

test('raid lab cautious extract can survive at a non-departure town', () => {
    const result = runRaidLabExpedition({ seed: 3, policy: 'cautious', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
    assert.notEqual(result.extractionTownId, result.departureTownId);
    assert.ok(result.actions.some((action) => action.kind === 'leave_town'));
});

test('raid lab balanced extract detours water chokepoint on regression seed 6', () => {
    // Previously stuck at (1662,1584) where east is water; must route around and SURVIVE.
    const result = runRaidLabExpedition({ seed: 6, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
    assert.ok((result.actorFinal?.tileX ?? 0) > 1900);
});

test('raid lab balanced extract does not stall in wall pocket on seed 9', () => {
    // Burned A* credits on chase, then coast-failed at ~(1474,1486) until max_actions.
    const result = runRaidLabExpedition({ seed: 9, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});

test('raid lab balanced extract does not bypass-stall near town on seed 77', () => {
    // Oscillated extract/bypass at ~(1970,1526) with enemies between actor and town.
    const result = runRaidLabExpedition({ seed: 77, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});
