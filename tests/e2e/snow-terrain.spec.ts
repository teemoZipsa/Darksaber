import { expect, test } from '@playwright/test';

test('snow loads on demand and replaces cached white ground and edge masks', async ({ page }, testInfo) => {
    const urls = { assets: '', chunk: '', tile: '' };
    let releaseTexture!: () => void;
    const textureGate = new Promise<void>(resolve => { releaseTexture = resolve; });
    await page.route('**/tilesets/darksaber/snow.png', async route => {
        await textureGate;
        await route.continue();
    });
    page.on('response', response => {
        const url = response.url();
        if (/\/src\/map\/TileAssetManager\.ts(?:\?|$)/.test(url)) urls.assets = url;
        if (/\/src\/map\/Chunk\.ts(?:\?|$)/.test(url)) urls.chunk = url;
        if (/\/src\/map\/Tile\.ts(?:\?|$)/.test(url)) urls.tile = url;
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).waitFor();
    try {
        await page.evaluate(async moduleUrls => {
            const [{ TileAssetManager }, { Chunk, TILE_SIZE }, { TileType }] = await Promise.all([
                import(moduleUrls.assets), import(moduleUrls.chunk), import(moduleUrls.tile),
            ]);
            const tileAt = (x: number) => x < 16 ? TileType.STONE : TileType.SNOW;
            const tiles = Array.from({ length: 32 }, () => Array.from({ length: 32 }, (_, x) => tileAt(x)));
            const chunk = new Chunk(0, 0, tiles);
            const canvas = document.createElement('canvas');
            canvas.id = 'snow-regression';
            canvas.width = canvas.height = 32 * TILE_SIZE;
            canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:384px;height:384px;image-rendering:pixelated';
            document.body.append(canvas);
            const ctx = canvas.getContext('2d')!;
            const render = () => {
                chunk.render(ctx, 0, 0, tileAt);
                const region = (x: number) => ctx.getImageData(x * TILE_SIZE, 4 * TILE_SIZE, TILE_SIZE, 8 * TILE_SIZE).data;
                const whiteRatio = (data: Uint8ClampedArray) => {
                    let white = 0;
                    for (let i = 0; i < data.length; i += 4) if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) white++;
                    return white / (data.length / 4);
                };
                return { interior: whiteRatio(region(20)), edge: whiteRatio(region(16)) };
            };
            (window as any).__snowFixture = { render, manager: TileAssetManager, revision: TileAssetManager.getTerrainRevision() };
        }, urls);
        const cold = await page.evaluate(() => (window as any).__snowFixture.render());
        expect(cold.interior).toBeGreaterThan(0.95);
        expect(cold.edge).toBeGreaterThan(0.1);
        releaseTexture();
        await expect.poll(() => page.evaluate(() => {
            const fixture = (window as any).__snowFixture;
            return fixture.manager.getTerrainRevision() > fixture.revision;
        })).toBe(true);
        // No markDirty or reload: asset readiness must invalidate both caches.
        const ready = await page.evaluate(() => (window as any).__snowFixture.render());
        expect(ready.interior).toBeLessThan(0.05);
        expect(ready.edge).toBeLessThan(0.05);
        await page.locator('#snow-regression').screenshot({ path: testInfo.outputPath('snow.png') });
    } finally {
        releaseTexture();
    }
});
