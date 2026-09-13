import assert from 'node:assert/strict';
import test from 'node:test';
import { planGroundLayers, planShoreLayers } from '../../src/map/TerrainTransition';
import { TileType as T, TILE_PROPERTIES } from '../../src/map/Tile';

test('forest crowns sit above adjoining ground without spilling into a road tile', () => {
    for (const ground of [T.GRASS, T.ROAD, T.SAND, T.STONE, T.SNOW]) {
        const forest = planGroundLayers(T.FOREST, [T.FOREST, T.FOREST, ground, ground, ground, ground, ground, T.FOREST])!;
        assert.deepEqual(forest.map(layer => layer.type), [ground, T.FOREST]);
        assert.deepEqual(forest[1].connections, [true, true, false, false, false, false, false, true]);
        const path = planGroundLayers(ground, Array(8).fill(T.FOREST))!;
        assert.deepEqual(path.map(layer => layer.type), [ground]);
    }
});

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

test('water and hazards keep their dedicated renderer and silhouette', () => {
    for (const center of [T.WATER, T.DEEP_WATER, T.LAVA, T.POISON_SWAMP]) {
        assert.equal(planGroundLayers(center, Array(8).fill(T.GRASS)), undefined);
    }
    const coast = planGroundLayers(T.SAND, Array(8).fill(T.WATER))!;
    assert.deepEqual(coast.map(layer => layer.type), [T.SAND]);
    assert.ok(coast[0].connections.every(Boolean));
});

test('castle walls join stone artwork over actual ground without changing collision', () => {
    for (const center of [T.STONE, T.WALL, T.DUNGEON_ENTRANCE]) {
        const layers = planGroundLayers(center, [T.SAND, T.SAND, T.WALL, T.STONE, T.STONE, T.WALL, T.WALL, T.SAND])!;
        assert.deepEqual(layers.map(layer => layer.type), [T.SAND, T.STONE]);
        assert.deepEqual(layers[1].connections, [false, false, true, true, true, true, true, false]);
    }
    assert.equal(TILE_PROPERTIES[T.WALL].walkable, false);
    assert.equal(TILE_PROPERTIES[T.STONE].walkable, true);
});

test('shore underlays continue each actual bank without adding grass or trees', () => {
    assert.deepEqual(planShoreLayers(Array(8).fill(T.WATER)), []);
    const layers = planShoreLayers([T.SAND, T.SAND, T.WATER, T.DEEP_WATER, T.ROAD, T.WALL, T.WALL, T.SAND]);
    assert.deepEqual(layers.map(layer => layer.type), [T.SAND, T.ROAD, T.STONE]);
    assert.deepEqual(layers[2].connections, [false, false, true, true, false, true, true, false]);
    assert.deepEqual(planShoreLayers([T.FOREST, ...Array(7).fill(T.WATER)]).map(layer => layer.type), [T.GRASS]);
});

test('a diagonal terrain contact opens only its own corner', () => {
    const layers = planGroundLayers(T.ROAD, [T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.ROAD, T.SAND])!;
    assert.deepEqual(layers[1].connections, [true, true, true, true, true, true, true, false]);
});
