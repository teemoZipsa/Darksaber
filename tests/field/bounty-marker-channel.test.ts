import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WorldMap,
    type WorldBountyMarker,
} from '../../src/map/WorldMap';

test('bounty markers survive story inspect marker replacement and are defensively copied', () => {
    const worldMap = new WorldMap('mortal', { validateTownSpawns: false });
    const bountyMarkers: WorldBountyMarker[] = [
        { id: 'trail-a', tile: { x: 10, y: 11 }, kind: 'tracks', labelKey: 'bounty.clue.tracks' },
        { id: 'trail-b', tile: { x: 12, y: 13 }, kind: 'corpse', labelKey: 'bounty.clue.remains' },
        { id: 'trail-c', tile: { x: 14, y: 15 }, kind: 'witness', labelKey: 'bounty.clue.witness' },
        { id: 'target-lair', tile: { x: 16, y: 17 }, kind: 'lair', labelKey: 'bounty.clue.lair' },
    ];

    worldMap.setInspectMarkers([
        { id: 'story-marker', tile: { x: 2, y: 3 }, kind: 'chest' },
    ]);
    worldMap.setBountyMarkers(bountyMarkers);
    worldMap.setInspectMarkers([]);

    assert.deepEqual(worldMap.getInspectMarkers(), []);
    assert.deepEqual(worldMap.getBountyMarkers(), bountyMarkers);

    const externalCopy = worldMap.getBountyMarkers();
    externalCopy[0].tile.x = 999;
    externalCopy.push({ id: 'forged', tile: { x: 0, y: 0 }, kind: 'tracks' });

    assert.deepEqual(worldMap.getBountyMarkers(), bountyMarkers);
});
