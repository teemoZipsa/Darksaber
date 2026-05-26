import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TacticalMarkerStore,
    buildTacticalMenuItems,
    makeTacticalTargetKey,
    type TacticalTargetRef,
} from '../../src/field/TacticalMarkers';
import { getRightClickDisposition } from '../../src/field/WorldInteractionMode';

const ground: TacticalTargetRef = { kind: 'ground', tile: { x: 1, y: 1 } };
const blocked: TacticalTargetRef = { kind: 'blocked', tile: { x: 2, y: 2 } };
const enemy: TacticalTargetRef = {
    kind: 'enemy',
    tile: { x: 3, y: 3 },
    targetKey: makeTacticalTargetKey('enemy', 'e1'),
};

test('tactical menu items are built by target kind', () => {
    assert.deepEqual(buildTacticalMenuItems(ground).map((item) => item.command), ['ping', 'rally', 'clear']);
    assert.deepEqual(buildTacticalMenuItems(blocked).map((item) => item.command), ['ping', 'clear']);
    assert.deepEqual(buildTacticalMenuItems(enemy).map((item) => item.command), ['ping', 'watch', 'clear']);
});

test('marker cardinality matches ping multi, rally singleton, and watch per target key', () => {
    const store = new TacticalMarkerStore();
    store.addPing(ground);
    store.addPing(ground);
    store.setRally({ x: 1, y: 1 });
    store.setRally({ x: 4, y: 4 });
    store.setWatch(enemy);
    store.setWatch({ ...enemy, tile: { x: 5, y: 5 } });

    const markers = store.getMarkers();
    assert.equal(markers.filter((marker) => marker.kind === 'ping').length, 2);
    assert.deepEqual(markers.find((marker) => marker.kind === 'rally')?.tile, { x: 4, y: 4 });
    assert.equal(markers.filter((marker) => marker.kind === 'watch').length, 1);
    assert.deepEqual(markers.find((marker) => marker.kind === 'watch')?.tile, { x: 5, y: 5 });
});

test('marker clear removes only target-scoped markers', () => {
    const store = new TacticalMarkerStore();
    store.addPing(enemy);
    store.setWatch(enemy);
    store.setRally(enemy.tile);

    assert.equal(store.clear(enemy), 2);
    assert.deepEqual(store.getMarkers().map((marker) => marker.kind), ['rally']);

    store.addPing(ground);
    store.setRally(ground.tile);
    assert.equal(store.clear(ground), 2);
    assert.equal(store.getMarkers().length, 0);
});

test('markers expire and watched targets follow or disappear', () => {
    const store = new TacticalMarkerStore();
    store.addPing(ground);
    store.update(3.1);
    assert.equal(store.getMarkers().length, 0);

    store.setWatch(enemy);
    store.update(1, () => ({ x: 8, y: 9 }));
    assert.deepEqual(store.getMarkers()[0]?.tile, { x: 8, y: 9 });

    store.update(1, () => null);
    assert.equal(store.getMarkers().length, 0);
});

test('right click disposition is driven by one interaction mode', () => {
    assert.equal(getRightClickDisposition({ kind: 'idle' }), 'openTacticalMenu');
    assert.equal(getRightClickDisposition({ kind: 'actionMenu' }), 'openTacticalMenu');
    assert.equal(getRightClickDisposition({ kind: 'tacticalMenu' }), 'reopenTacticalMenu');
    assert.equal(getRightClickDisposition({ kind: 'actionTargeting', action: 'move' }), 'cancelTargeting');
    assert.equal(getRightClickDisposition({ kind: 'magicTargeting' }), 'cancelTargeting');
    assert.equal(getRightClickDisposition({ kind: 'reservedAction' }), 'ignore');
});
