import assert from 'node:assert/strict';
import test from 'node:test';
import {
    HubSaveQueue,
    type HubSaveQueueAttempt,
    type HubSaveQueueResult,
} from '../../src/engine/HubSaveQueue';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
    });
    return { promise, resolve };
}

test('hub save queue drains mutations marked while a request is in flight', async () => {
    const first = deferred<HubSaveQueueResult>();
    const attempts: HubSaveQueueAttempt[] = [];
    const queue = new HubSaveQueue({
        send: async (attempt) => {
            attempts.push(attempt);
            if (attempts.length === 1) return first.promise;
            return { ok: true };
        },
    });

    queue.markDirty();
    const flush = queue.flush();
    await Promise.resolve();
    queue.markDirty();
    first.resolve({ ok: true });

    assert.deepEqual(await flush, { ok: true });
    assert.deepEqual(attempts.map(({ epoch, generation }) => ({ epoch, generation })), [
        { epoch: 0, generation: 1 },
        { epoch: 0, generation: 2 },
    ]);
    assert.equal(queue.hasPending(), false);
});

test('hub save queue keeps a failed generation dirty and retries it after backoff', async () => {
    const timers: Array<() => void> = [];
    const results: Array<HubSaveQueueResult | null> = [];
    let calls = 0;
    const queue = new HubSaveQueue({
        send: async () => {
            calls += 1;
            return calls === 1
                ? { ok: false, code: 'offline', retryable: true }
                : { ok: true };
        },
        onResult: (result) => results.push(result),
        retryDelaysMs: [10],
        setTimer: (callback) => {
            timers.push(callback);
            return timers.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => undefined,
    });

    queue.markDirty();
    assert.deepEqual(await queue.flush(), { ok: false, code: 'offline', retryable: true });
    assert.equal(queue.hasPending(), true);
    assert.equal(timers.length, 1);

    timers[0]?.();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls, 2);
    assert.equal(queue.hasPending(), false);
    assert.deepEqual(results, [
        { ok: false, code: 'offline', retryable: true },
        null,
    ]);
});

test('reset isolates an old in-flight completion from the next character epoch', async () => {
    const oldRequest = deferred<HubSaveQueueResult>();
    const attempts: HubSaveQueueAttempt[] = [];
    const queue = new HubSaveQueue({
        send: async (attempt) => {
            attempts.push(attempt);
            return attempt.epoch === 0 ? oldRequest.promise : { ok: true };
        },
    });

    queue.markDirty();
    const oldFlush = queue.flush();
    await Promise.resolve();
    queue.reset();
    queue.markDirty();

    assert.deepEqual(await queue.flush({ keepalive: true }), { ok: true });
    oldRequest.resolve({ ok: true });
    assert.deepEqual(await oldFlush, { ok: true });
    assert.deepEqual(attempts, [
        { epoch: 0, generation: 1, keepalive: false },
        { epoch: 1, generation: 1, keepalive: true },
    ]);
    assert.equal(queue.hasPending(), false);
});

test('pause cancels retry work without acknowledging the dirty generation', async () => {
    let timerCancelled = false;
    const queue = new HubSaveQueue({
        send: async () => ({ ok: false, retryable: true }),
        retryDelaysMs: [10],
        setTimer: (() => 1) as unknown as (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>,
        clearTimer: () => { timerCancelled = true; },
    });

    queue.markDirty();
    await queue.flush();
    queue.setPaused(true);

    assert.equal(timerCancelled, true);
    assert.equal(queue.hasPending(), true);
    assert.equal((await queue.flush()).code, 'hub_flush_paused');
});
