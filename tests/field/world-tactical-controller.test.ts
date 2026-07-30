import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldTacticalController } from '../../src/engine/world/WorldTacticalController';

test('tactical menu receives already-scaled UI viewport dimensions', () => {
    const controller = new WorldTacticalController({
        resolveFieldHitAt: (tile) => ({ kind: 'ground', tile }),
        getEnemyById: () => null,
        getPartyActors: () => [],
        getLoot: () => [],
        log: () => undefined,
    });
    let openArgs: unknown[] = [];
    (controller as unknown as {
        menuUI: { open: (...args: unknown[]) => void };
    }).menuUI = {
        open: (...args: unknown[]) => {
            openArgs = args;
        },
    };

    controller.open({ x: 4, y: 6 }, 120, 180, 325, 703);

    assert.equal(openArgs[0], 120);
    assert.equal(openArgs[1], 180);
    assert.deepEqual(openArgs.slice(-2), [325, 703]);
});
