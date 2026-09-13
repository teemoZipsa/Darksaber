import { expect, test } from '@playwright/test';

test('forest crowns keep both edges and recessed corners across chunks', async ({ page }, testInfo) => {
    const urls = { assets: '', chunk: '', tile: '' };
    page.on('response', response => {
        const url = response.url();
        if (/\/src\/map\/TileAssetManager\.ts(?:\?|$)/.test(url)) urls.assets = url;
        if (/\/src\/map\/Chunk\.ts(?:\?|$)/.test(url)) urls.chunk = url;
        if (/\/src\/map\/Tile\.ts(?:\?|$)/.test(url)) urls.tile = url;
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).waitFor();
    const result = await page.evaluate(async moduleUrls => {
        const [{ TileAssetManager }, { Chunk, CHUNK_SIZE, TILE_SIZE }, { TileType: T }] = await Promise.all([
            import(moduleUrls.assets), import(moduleUrls.chunk), import(moduleUrls.tile),
        ]);
        await TileAssetManager.init();
        const tile = new OffscreenCanvas(32, 32);
        const tileCtx = tile.getContext('2d')!;
        const edgeFailures: string[] = [];
        const cornerFailures: string[] = [];
        for (let variant = 0; variant < 32; variant++) {
            for (const side of ['left', 'right']) {
                const connections = side === 'left'
                    ? [true, true, true, true, true, false, false, false]
                    : [true, false, false, false, true, true, true, true];
                tileCtx.clearRect(0, 0, 32, 32);
                TileAssetManager.drawGroundAutotile(tileCtx, T.FOREST, 0, 0, 32, connections, variant, 9);
                const pixels = tileCtx.getImageData(0, 0, 32, 32).data;
                const edgeX = side === 'left' ? 0 : 31;
                const cut = Array.from({ length: 32 }, (_, y) => pixels[(y * 32 + edgeX) * 4 + 3]).filter(a => a < 255).length;
                if (cut < 4) edgeFailures.push(`${side}:${variant}`);
            }
            for (const diagonal of [1, 3, 5, 7]) {
                const connections = Array(8).fill(true);
                connections[diagonal] = false;
                tileCtx.clearRect(0, 0, 32, 32);
                TileAssetManager.drawGroundAutotile(tileCtx, T.FOREST, 0, 0, 32, connections, variant, 9);
                const cornerX = diagonal === 1 || diagonal === 3 ? 24 : 0;
                const cornerY = diagonal === 3 || diagonal === 5 ? 24 : 0;
                const pixels = tileCtx.getImageData(cornerX, cornerY, 8, 8).data;
                if (!pixels.some((alpha, index) => index % 4 === 3 && alpha < 255)) cornerFailures.push(`${diagonal}:${variant}`);
            }
        }

        // A clearing and one-tile trail turn through the forest on the actual
        // chunk boundary; all other edges meet grass, road or sand.
        const tileAt = (x: number, y: number) => {
            if (x >= 24 && x <= 39 && y >= 7 && y <= 24) {
                if (x >= 30 && x <= 34 && y >= 13 && y <= 17) return T.GRASS;
                if ((x === 32 && y >= 18) || (y === 20 && x >= 32)) return T.ROAD;
                return T.FOREST;
            }
            return y >= 21 ? T.SAND : T.GRASS;
        };
        const canvas = document.createElement('canvas');
        canvas.id = 'forest-regression';
        canvas.width = 24 * TILE_SIZE;
        canvas.height = 24 * TILE_SIZE;
        const ctx = canvas.getContext('2d')!;
        for (let cx = 0; cx < 2; cx++) {
            const tiles = Array.from({ length: CHUNK_SIZE }, (_, y) =>
                Array.from({ length: CHUNK_SIZE }, (_, x) => tileAt(cx * CHUNK_SIZE + x, y)));
            new Chunk(cx, 0, tiles).render(ctx, (cx * CHUNK_SIZE - 20) * TILE_SIZE, -4 * TILE_SIZE, tileAt);
        }
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const holes = pixels.filter((alpha, index) => index % 4 === 3 && alpha !== 255).length;
        canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:576px;height:576px;image-rendering:pixelated';
        document.body.append(canvas);
        return { edgeFailures, cornerFailures, holes };
    }, urls);
    await page.locator('#forest-regression').screenshot({ path: testInfo.outputPath('forest.png') });
    expect(result.holes, 'forest transitions must not expose transparent holes').toBe(0);
    expect(result.edgeFailures, 'left and right crowns must retain their original edge silhouettes').toEqual([]);
    expect(result.cornerFailures, 'a recessed clearing needs an inner corner, not a square canopy').toEqual([]);

    // Also inspect the authored forest village's real curved roads and patches,
    // including decoration overlays, rather than only the rectangular fixture.
    const villageHoles = await page.evaluate(async assetsUrl => {
        const { TileAssetManager } = await import(assetsUrl);
        const map = (window as unknown as { __gm: any }).__gm.worldEngine.worldMap;
        const town = map.getTowns().find((entry: { id: string }) => entry.id === 'w_forest_village');
        const canvas = document.querySelector<HTMLCanvasElement>('#forest-regression')!;
        canvas.width = 24 * 48;
        canvas.height = 18 * 48;
        canvas.style.height = '432px';
        const ctx = canvas.getContext('2d')!;
        const camX = (town.chunkX * 32 + 4) * 48;
        const camY = (town.chunkY * 32 + 25) * 48;
        const draw = () => {
            map.updateLoadedChunks(camX + canvas.width / 2, camY + canvas.height / 2, canvas.width, canvas.height);
            map.render(ctx, camX, camY, canvas.width, canvas.height);
            map.renderDecorationOverlays(ctx, camX, camY, canvas.width, canvas.height);
        };
        draw();
        await TileAssetManager.init();
        draw();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.filter((alpha, index) => index % 4 === 3 && alpha !== 255).length;
    }, urls.assets);
    await page.locator('#forest-regression').screenshot({ path: testInfo.outputPath('forest-village.png') });
    expect(villageHoles, 'the real forest village must render fully loaded ground').toBe(0);
});
