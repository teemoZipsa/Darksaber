import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialTrainingMap } from '../../src/map/TutorialTrainingMap';
import { TileType } from '../../src/map/Tile';

test('tutorial training map is a bounded indoor arena', () => {
    const map = new TutorialTrainingMap();
    const bounds = map.getBoundsTiles();

    assert.deepEqual(bounds, { width: 18, height: 14 });
    assert.equal(map.getTileAt(0, 0), TileType.WALL);
    assert.equal(map.getTileAt(bounds.width - 1, bounds.height - 1), TileType.WALL);
    assert.equal(map.isWalkable(-1, 3), false);
    assert.equal(map.isWalkable(bounds.width, 3), false);
});

test('tutorial training map exposes fixed drill positions without world landmarks', () => {
    const map = new TutorialTrainingMap();
    const player = map.getPlayerStartTile();
    const instructor = map.getInstructorTile();
    const enemy = map.getPracticeEnemyTile();

    assert.equal(map.isWalkable(player.x, player.y), true);
    assert.equal(map.isWalkable(instructor.x, instructor.y), true);
    assert.equal(map.isWalkable(enemy.x, enemy.y), true);
    assert.equal(map.getMapLandmarks().length, 0);
});
