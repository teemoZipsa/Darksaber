import assert from 'node:assert/strict';
import test from 'node:test';

import { Character } from '../../src/character/Character';
import { WorldFieldSpawnController } from '../../src/engine/world/WorldFieldSpawnController';
import type { WorldMovementController } from '../../src/engine/world/WorldMovementController';

class ImageStub {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public src = '';
}

const testGlobal = globalThis as typeof globalThis & { Image: typeof Image };

test('tier-1 alchemist uses its original three-frame field sprite', () => {
    const originalImage = testGlobal.Image;
    testGlobal.Image = ImageStub as unknown as typeof Image;
    try {
        const movement = {
            findNearbyWalkableTile: (tile: { x: number; y: number }) => tile,
        } as unknown as WorldMovementController;
        const controller = new WorldFieldSpawnController(movement);
        const character = new Character('alchemist-1', 'Alchemist', 'alchemist');

        const [actor] = controller.createPartyActors({ x: 4, y: 6 }, [character]);
        const sprite = actor.entity.walkSprite;

        assert.equal(sprite?.image.src, '/assets/images/characters/animations/alchemist_t1_walk.png');
        assert.equal(sprite?.frameWidth, 32);
        assert.equal(sprite?.frameHeight, 32);
        assert.equal(sprite?.frameCount, 3);
        assert.deepEqual(sprite?.rowByFacing, { up: 0, down: 1, left: 3, right: 2 });
        assert.deepEqual(sprite?.actionRowByFacing, { down: 4, up: 5 });
        assert.equal(sprite?.actionFrameCount, 2);
    } finally {
        testGlobal.Image = originalImage;
    }
});
