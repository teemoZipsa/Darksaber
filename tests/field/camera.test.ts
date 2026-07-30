import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../../src/engine/Camera';
import { TILE_SIZE } from '../../src/map/Chunk';

test('camera follows fractional tile positions instead of snapping to the next grid tile', () => {
    const camera = new Camera(800, 600);
    camera.followTile(4, 3);
    camera.snapToTarget();

    camera.followTilePosition(4.25, 3);
    camera.snapToTarget();

    assert.equal(camera.getWorldCenter().x, (4.25 * TILE_SIZE) + (TILE_SIZE / 2));
    assert.equal(camera.getWorldCenter().y, (3 * TILE_SIZE) + (TILE_SIZE / 2));
});

test('camera follow dead-zone ignores tiny drift and applies bounded look-ahead', () => {
    const camera = new Camera(800, 600);
    camera.followTile(4, 3);
    camera.snapToTarget();
    const initialCenter = camera.getWorldCenter();

    camera.followTilePosition(4.05, 3, { deadZoneTiles: 0.12 });
    camera.snapToTarget();
    assert.deepEqual(camera.getWorldCenter(), initialCenter);

    camera.followTilePosition(4.25, 3, {
        lookAheadX: 0.28,
        deadZoneTiles: 0.12,
    });
    camera.snapToTarget();

    assert.equal(
        camera.getWorldCenter().x,
        initialCenter.x + ((0.25 + 0.28 - 0.12) * TILE_SIZE),
    );
    assert.equal(camera.getWorldCenter().y, initialCenter.y);
});
