import test from 'node:test';
import assert from 'node:assert/strict';
import { getFieldFootstepSurface } from '../../src/field/FieldFootsteps';
import { TileType } from '../../src/map/Tile';

test('field terrain maps to stable procedural footstep surfaces', () => {
    assert.equal(getFieldFootstepSurface(TileType.GRASS), 'soft');
    assert.equal(getFieldFootstepSurface(TileType.SNOW), 'soft');
    assert.equal(getFieldFootstepSurface(TileType.ROAD), 'hard');
    assert.equal(getFieldFootstepSurface(TileType.STONE), 'hard');
    assert.equal(getFieldFootstepSurface(TileType.POISON_SWAMP), 'wet');
});
