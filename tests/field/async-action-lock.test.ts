import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncActionLock } from '../../src/ui/react/auth/AsyncActionLock';

test('AsyncActionLock rejects duplicate actions until the first action settles', async () => {
    const lock = new AsyncActionLock();
    let actionCalls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });

    const first = lock.run(async () => {
        actionCalls++;
        await pending;
    });
    const duplicate = await lock.run(async () => { actionCalls++; });

    assert.equal(lock.isPending(), true);
    assert.equal(duplicate, false);
    assert.equal(actionCalls, 1);

    release();
    assert.equal(await first, true);
    assert.equal(lock.isPending(), false);
});
