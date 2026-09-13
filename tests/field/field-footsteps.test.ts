import test from 'node:test';
import assert from 'node:assert/strict';
import { getFieldFootstepSurface, getRecordedFootstepKey } from '../../src/field/FieldFootsteps';
import { TileType } from '../../src/map/Tile';

test('field terrain keeps distinct grass, stone, snow and wet footstep surfaces', () => {
    assert.equal(getFieldFootstepSurface(TileType.GRASS), 'soft');
    assert.equal(getFieldFootstepSurface(TileType.SNOW), 'snow');
    assert.equal(getFieldFootstepSurface(TileType.ROAD), 'hard');
    assert.equal(getFieldFootstepSurface(TileType.STONE), 'hard');
    assert.equal(getFieldFootstepSurface(TileType.POISON_SWAMP), 'wet');
});

test('recorded steps rotate variants while wet ground retains procedural audio', () => {
    for (const surface of ['soft', 'hard', 'snow'] as const) {
        const cycle = [0, 1, 2].map((step) => getRecordedFootstepKey(surface, step));
        assert.equal(new Set(cycle).size, 3);
        assert.equal(getRecordedFootstepKey(surface, 3), cycle[0]);
    }
    assert.equal(getRecordedFootstepKey('wet', 0), null);
});
