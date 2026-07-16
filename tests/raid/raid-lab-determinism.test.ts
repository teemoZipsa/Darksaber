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

test('raid lab balanced extract survives enemy pack on regression seed 59', () => {
    // Previously stuck clear-attacking at ~(1873,1459) then wasted AP on mp_potion.
    const result = runRaidLabExpedition({ seed: 59, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});

test('raid lab balanced extract does not bypass-stall mid-route on seed 10', () => {
    // max_actions LEFT at ~(1945,1492) alternating extract/bypass outside the old 96 cutoff.
    const result = runRaidLabExpedition({ seed: 10, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});

test('raid lab balanced extract does not west-stall on bypass seed 53', () => {
    // 1400+ bypass moves drifting west to ~(1100,1481) until max_actions.
    const result = runRaidLabExpedition({ seed: 53, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});

test('raid lab balanced extract disengages instead of clear-stalling on seed 168', () => {
    // 181 clear attacks / 0 kills at ~(1813,1457) then enemy death while resting.
    const result = runRaidLabExpedition({ seed: 168, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});

test('raid lab balanced policy skips cursed reliquary loot on seed 852', () => {
    // Picked sealed_reliquary then curse-ticked to death before extract.
    const result = runRaidLabExpedition({ seed: 852, policy: 'balanced', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
    assert.ok(!result.actions.some((a) => (a.detail ?? '').includes('reliquary')));
});

test('raid lab cautious extract disengages instead of cornered-stalling on seed 2', () => {
    // 49 cornered attacks on extract path then rested to enemy death at ~(1815,1458).
    const result = runRaidLabExpedition({ seed: 2, policy: 'cautious', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.equal(result.extractionTownId, 'e_stronghold');
});

test('raid lab random-legal does not early-abandon on seed 0', () => {
    // Previously leave_manual was a legal option before extract → LEFT in a few actions.
    const result = runRaidLabExpedition({ seed: 0, policy: 'random-legal', maxActions: 200 });
    assert.ok(!result.actions.some((a) => a.detail === 'random-leave'));
    assert.ok(result.actions.length >= 50);
    if (result.result === 'LEFT') {
        assert.equal(result.stopReason, 'max_actions');
    }
});

test('raid lab cautious clears wall-chokepoint stuck pocket on seed 125', () => {
    // Blind Bresenham move candidates clipped through WALL @ ~(1428,1444) → max_actions LEFT.
    const result = runRaidLabExpedition({ seed: 125, policy: 'cautious', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
    assert.notEqual(result.stopReason, 'max_actions');
});

test('raid lab random-legal survives low-HP rest trap on seed 973', () => {
    // random-rest beside aggro at ~HP 34 → enemy death at ~(1809,1458).
    const result = runRaidLabExpedition({ seed: 973, policy: 'random-legal', maxActions: 1_500 });
    assert.equal(result.result, 'SURVIVED');
});

test('raid lab low-hp stress stays deterministic and diverges from unstressed', () => {
    const plain = runRaidLabExpedition({ seed: 1, policy: 'balanced', maxActions: 120 });
    const first = runRaidLabExpedition({ seed: 1, policy: 'balanced', stress: 'low-hp', maxActions: 120 });
    const second = runRaidLabExpedition({ seed: 1, policy: 'balanced', stress: 'low-hp', maxActions: 120 });
    assert.equal(plain.stress, 'none');
    assert.equal(first.stress, 'low-hp');
    assert.equal(first.digest, second.digest);
    assert.notEqual(first.digest, plain.digest);
    assert.ok(['SURVIVED', 'DEAD', 'MIA', 'LEFT'].includes(first.result));
});

test('raid lab dense-nests stress stays deterministic and diverges from unstressed', () => {
    const plain = runRaidLabExpedition({ seed: 5, policy: 'balanced', maxActions: 100 });
    const first = runRaidLabExpedition({ seed: 5, policy: 'balanced', stress: 'dense-nests', maxActions: 100 });
    const second = runRaidLabExpedition({ seed: 5, policy: 'balanced', stress: 'dense-nests', maxActions: 100 });
    assert.equal(first.stress, 'dense-nests');
    assert.equal(first.digest, second.digest);
    assert.notEqual(first.digest, plain.digest);
    assert.ok(['SURVIVED', 'DEAD', 'MIA', 'LEFT'].includes(first.result));
});
