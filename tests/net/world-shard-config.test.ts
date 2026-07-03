import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createWorldShardConfig,
    parseWorldShardCount,
} from '../../server/WorldShardConfig';

test('world shard config defaults to a single supported shard', () => {
    assert.equal(parseWorldShardCount(undefined), 1);
    assert.deepEqual(createWorldShardConfig(undefined), {
        count: 1,
        maxSupported: 1,
    });
});

test('world shard config normalizes invalid and fractional values to at least one shard', () => {
    assert.equal(parseWorldShardCount('0'), 1);
    assert.equal(parseWorldShardCount('2.9'), 2);
});

test('world shard config rejects multi-shard startup until session routing is sharded', () => {
    assert.throws(
        () => createWorldShardConfig('2'),
        /WORLD_SHARD_COUNT > 1 is intentionally unsupported/
    );
});
