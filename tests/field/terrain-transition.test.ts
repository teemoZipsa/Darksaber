import assert from 'node:assert/strict';
import test from 'node:test';
import { planGroundLayers } from '../../src/map/TerrainTransition';
import { TileType as T } from '../../src/map/Tile';

test('sand and stone meet without an invented grass underlay on either side', () => {
    const sand = planGroundLayers(T.SAND, [T.SAND, T.STONE, T.STONE, T.STONE, T.SAND, T.SAND, T.SAND, T.SAND])!;
    const stone = planGroundLayers(T.STONE, [T.STONE, T.STONE, T.STONE, T.STONE, T.STONE, T.SAND, T.SAND, T.SAND])!;
    assert.deepEqual(sand.map(layer => layer.type), [T.SAND]);
    assert.deepEqual(stone.map(layer => layer.type), [T.SAND, T.STONE]);
    assert.ok(sand[0].connections.every(Boolean));
    assert.equal(stone[1].connections[6], false);
});

test('three-way terrain junctions retain each actual lower terrain', () => {
    const layers = planGroundLayers(T.STONE, [T.SAND, T.SAND, T.STONE, T.STONE, T.ROAD, T.ROAD, T.SAND, T.SAND])!;
    assert.deepEqual(layers.map(layer => layer.type), [T.SAND, T.ROAD, T.STONE]);
    assert.equal(layers[1].connections[4], true);
    assert.equal(layers[1].connections[0], false);
    assert.equal(layers[2].connections[4], false);
});

test('roads continue into town paving without a false border', () => {
    for (const center of [T.ROAD, T.TOWN]) {
        const layers = planGroundLayers(center, [T.ROAD, T.ROAD, T.TOWN, T.TOWN, T.TOWN, T.ROAD, T.ROAD, T.ROAD])!;
        assert.equal(layers.length, 1);
        assert.equal(layers[0].type, T.ROAD);
        assert.ok(layers[0].connections.every(Boolean));
    }
});

test('water, hazards and walls keep their dedicated renderer and silhouette', () => {
    for (const center of [T.WATER, T.DEEP_WATER, T.LAVA, T.POISON_SWAMP, T.WALL, T.DUNGEON_ENTRANCE]) {
        assert.equal(planGroundLayers(center, Array(8).fill(T.GRASS)), undefined);
    }
    const coast = planGroundLayers(T.SAND, Array(8).fill(T.WATER))!;
    assert.deepEqual(coast.map(layer => layer.type), [T.SAND]);
    assert.ok(coast[0].connections.every(Boolean));
});

test('a diagonal terrain contact opens only its own corner', () => {
    const layers = planGroundLayers(T.ROAD, [T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.SAND])!;
    assert.deepEqual(layers[1].connections, [true, true, true, true, true, true, true, false]);
});
