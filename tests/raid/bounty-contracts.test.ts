import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getBountyOffers,
    isBountyRiskCompleted,
    isCurrentBountyOffer,
    resolveBountyContract,
} from '../../src/data/BountyContractData';

test('bounty boards deterministically offer three unique elite contracts', () => {
    const first = getBountyOffers('central_castle', 7, 0);
    const repeat = getBountyOffers('central_castle', 7, 0);
    const nextCycle = getBountyOffers('central_castle', 8, 0);
    assert.deepEqual(repeat, first);
    assert.equal(first.length, 3);
    assert.equal(new Set(first.map((contract) => contract.monsterId)).size, 3);
    assert.equal(first.every((contract) => contract.affixIds.length === 2), true);
    assert.notDeepEqual(nextCycle.map((contract) => contract.id), first.map((contract) => contract.id));
});

test('bounty contract ids resolve without trusting client reward or affix fields', () => {
    const offered = getBountyOffers('central_castle', 3, 6)[1];
    assert.deepEqual(resolveBountyContract(offered.id), offered);
    assert.equal(isCurrentBountyOffer(offered.id, 'central_castle', 3, 6), true);
    assert.equal(isCurrentBountyOffer(offered.id, 'central_castle', 4, 6), false);
    assert.equal(resolveBountyContract(`${offered.id}~forged`), null);
});

test('bounty risk objectives evaluate their authoritative raid progress', () => {
    const contracts = getBountyOffers('central_castle', 0, 0);
    for (const contract of contracts) {
        const success = contract.riskId === 'swift_hunt'
            ? { elapsedSeconds: 600, hadActorDown: true, killsIncludingTarget: 1 }
            : contract.riskId === 'unbroken'
                ? { elapsedSeconds: 999, hadActorDown: false, killsIncludingTarget: 1 }
                : { elapsedSeconds: 999, hadActorDown: true, killsIncludingTarget: 4 };
        assert.equal(isBountyRiskCompleted(contract, success), true);
    }
});
