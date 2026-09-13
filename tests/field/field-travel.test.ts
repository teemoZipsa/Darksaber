import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldTravel, type TravelActor } from '../../src/field/FieldTravel';
import type { TilePoint } from '../../src/field/FieldPathing';

function harness() {
    const actor: TravelActor = { id: 'hero', tile: { x: 0, y: 0 }, ap: 40, movementBudget: 4 };
    const moves: TilePoint[] = [];
    const state = { threat: false, busy: false, waits: 0, cost: 1, blockedX: -1 };
    const travel = new FieldTravel({
        canTravel: () => true, hasThreat: () => state.threat, getActor: () => actor,
        isBusy: () => state.busy,
        isPassable: ({ x, y }) => x >= 0 && y >= 0 && x !== state.blockedX,
        stepCost: () => state.cost,
        move: (tile) => { moves.push({ ...tile }); state.busy = true; return true; },
        wait: () => { state.waits++; }, onStatus: () => {},
    });
    const arrive = () => { actor.tile = { ...moves[moves.length - 1] }; actor.ap -= 20; state.busy = false; };
    return { actor, moves, state, travel, arrive };
}

test('one distant destination issues bounded moves and waits for ordinary AP recovery', () => {
    const h = harness();
    assert.equal(h.travel.start({ x: 12, y: 0 }), true);
    h.travel.update(.1);
    assert.deepEqual(h.moves, [{ x: 4, y: 0 }]);
    h.travel.update(.1);
    assert.equal(h.moves.length, 1, 'no duplicate intent before acknowledgment');
    h.arrive(); h.travel.update(.1); h.arrive(); h.travel.update(.1);
    assert.equal(h.travel.status, 'waiting');
    assert.equal(h.state.waits, 1);
    assert.equal(h.actor.ap, 0, 'travel cannot grant AP');
    h.actor.ap = 40;
    h.travel.update(.1); h.arrive(); h.travel.update(.1);
    assert.equal(h.travel.status, 'arrived');
    assert.equal(h.travel.active, false);
    assert.deepEqual(h.moves, [{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 12, y: 0 }]);
});

test('terrain costs constrain each leg and impassable destinations fail visibly', () => {
    const h = harness(); h.state.cost = 2;
    h.travel.start({ x: 8, y: 0 }); h.travel.update(.1);
    assert.deepEqual(h.moves, [{ x: 2, y: 0 }]);
    h.arrive(); h.travel.stop(); h.state.blockedX = 3;
    h.travel.start({ x: 4, y: 0 });
    assert.equal(h.travel.status, 'blocked');
    assert.equal(h.travel.active, false);
});

test('danger and explicit cancellation stop future legs without teleporting an accepted move', () => {
    for (const cause of ['danger', 'cancel'] as const) {
        const h = harness();
        h.travel.start({ x: 12, y: 0 }); h.travel.update(.1);
        if (cause === 'danger') h.state.threat = true;
        else h.travel.stop();
        h.travel.update(.1);
        assert.equal(h.travel.active, false);
        assert.equal(h.travel.status, cause === 'danger' ? 'danger' : 'cancelled');
        h.arrive(); h.travel.update(.1);
        assert.equal(h.moves.length, 1);
        assert.deepEqual(h.actor.tile, { x: 4, y: 0 });
    }
});

test('missing server acknowledgment times out without issuing another move', () => {
    const h = harness();
    h.travel.start({ x: 12, y: 0 }); h.travel.update(.1);
    h.state.busy = false;
    h.travel.update(9);
    assert.equal(h.travel.status, 'blocked');
    assert.equal(h.moves.length, 1);
    assert.deepEqual(h.actor.tile, { x: 0, y: 0 });
});

test('combat cannot start travel and oversized requests do not search the whole world', () => {
    const h = harness(); h.state.threat = true;
    assert.equal(h.travel.start({ x: 4, y: 0 }), false);
    h.state.threat = false;
    assert.equal(h.travel.start({ x: 1000, y: 0 }), true);
    assert.equal(h.travel.status, 'blocked');
    assert.equal(h.moves.length, 0);
});
