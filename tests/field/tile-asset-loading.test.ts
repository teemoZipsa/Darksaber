import assert from 'node:assert/strict';
import test from 'node:test';
import { TileAssetManager } from '../../src/map/TileAssetManager';

test('tile asset startup loads only compact autotile sheets and lazily queues decorations', async () => {
    const originalImage = globalThis.Image;
    const requestedSources: string[] = [];

    class FakeImage {
        public complete = false;
        public naturalWidth = 0;
        public naturalHeight = 0;
        public onload: (() => void) | null = null;
        public onerror: (() => void) | null = null;
        private value = '';

        public get src(): string { return this.value; }

        public set src(value: string) {
            this.value = value;
            requestedSources.push(value);
            queueMicrotask(() => this.onload?.());
        }
    }

    Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
    try {
        await TileAssetManager.init();
        assert.deepEqual(requestedSources, [
            '/assets/images/tilesets/darksaber/mdsr0_alpha.png',
            '/assets/images/tilesets/darksaber/mdsr15_alpha.png',
            '/assets/images/tilesets/darksaber/mdsr15_lava_alpha.png',
        ]);

        const context = { imageSmoothingEnabled: false, drawImage: () => undefined };
        assert.equal(TileAssetManager.drawLandmarkSprite(
            context as unknown as CanvasRenderingContext2D,
            'castle',
            0,
            0,
            48,
            48
        ), false);
        assert.equal(requestedSources[requestedSources.length - 1], '/assets/images/landmarks/darksaber/castle.png');

        TileAssetManager.drawLandmarkSprite(
            context as unknown as CanvasRenderingContext2D,
            'castle',
            0,
            0,
            48,
            48
        );
        assert.equal(requestedSources.filter((src) => src.endsWith('/castle.png')).length, 1);

        const props = [
            ['fallenLog', '/assets/images/decor/props/fallen_log.png'],
            ['boulder', '/assets/images/decor/props/boulder.png'],
            ['ruinedWall', '/assets/images/decor/props/ruined_wall.png'],
        ] as const;
        for (const [sprite, source] of props) {
            assert.equal(TileAssetManager.drawPropSprite(
                context as unknown as CanvasRenderingContext2D,
                sprite,
                0,
                0,
                96,
                64
            ), false);
            assert.equal(requestedSources[requestedSources.length - 1], source);

            TileAssetManager.drawPropSprite(
                context as unknown as CanvasRenderingContext2D,
                sprite,
                0,
                0,
                96,
                64
            );
            assert.equal(requestedSources.filter((src) => src === source).length, 1);
        }
    } finally {
        Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage });
    }
});
