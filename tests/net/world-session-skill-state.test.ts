import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import type { ServerActor } from '../../server/WorldSessionTypes';
import {
    applyActorResourceDelta,
    updateRestingActorResources,
} from '../../server/WorldSessionSkillState';

function createActor(overrides: Partial<ServerActor> = {}): ServerActor {
    return {
        id: 'actor-1',
        ownerPlayerId: 'player-1',
        localActorId: 'local-1',
        name: 'Test Actor',
        classLineId: 'knight',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ hp: 10, maxHp: 100, mp: 5, maxMp: 40 }),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        majorActionUsed: false,
        facing: 'down',
        isDead: false,
        magicLoadout: [],
        skillUpgradeLevels: {},
        ...overrides,
    };
}

test('actor resource deltas clamp to effective HP and MP bounds', () => {
    const actor = createActor();

    applyActorResourceDelta(actor, 999, 999);
    assert.equal(actor.stats.hp, 100);
    assert.equal(actor.stats.mp, 40);
    assert.equal(actor.isDead, false);

    applyActorResourceDelta(actor, -999, -999);
    assert.equal(actor.stats.hp, 0);
    assert.equal(actor.stats.mp, 0);
    assert.equal(actor.isDead, true);
});

test('resting actor recovery reports timer updates and heals on whole ticks', () => {
    const actor = createActor({
        statuses: [{ kind: 'resting', icon: 'Zz', magnitude: 1, sourceType: 'action' }],
    });

    const partial = updateRestingActorResources(actor, undefined, 0.5);
    assert.deepEqual(partial, { type: 'set', timer: 0.5 });
    assert.equal(actor.stats.hp, 10);
    assert.equal(actor.stats.mp, 5);

    const wholeTick = updateRestingActorResources(actor, 0.5, 0.6);
    assert.equal(wholeTick.type, 'set');
    assert.ok(Math.abs(wholeTick.timer - 0.1) < Number.EPSILON);
    assert.equal(actor.stats.hp, 13);
    assert.equal(actor.stats.mp, 6);

    actor.statuses = [];
    assert.deepEqual(updateRestingActorResources(actor, 0.25, 0.5), { type: 'delete' });
});
