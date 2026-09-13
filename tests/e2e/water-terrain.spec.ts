import { expect, test } from '@playwright/test';

test('river interiors stay opaque through coasts, deep water and chunk boundaries', async ({ page }, testInfo) => {
    const urls = { assets: '', chunk: '', tile: '' };
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        const url = response.url();
        if (/\/src\/map\/TileAssetManager\.ts(?:\?|$)/.test(url)) urls.assets = url;
        if (/\/src\/map\/Chunk\.ts(?:\?|$)/.test(url)) urls.chunk = url;
        if (/\/src\/map\/Tile\.ts(?:\?|$)/.test(url)) urls.tile = url;
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).waitFor();
    for (const url of Object.values(urls)) expect(url).not.toBe('');

    // Exercise the actual renderer and original PNGs, including the app's HMR
    // module versions. Transparent shore cells must never become a water base.
    const result = await page.evaluate(async (moduleUrls) => {
        const [{ TileAssetManager }, { Chunk, CHUNK_SIZE, TILE_SIZE }, { TileType }] = await Promise.all([
            import(moduleUrls.assets), import(moduleUrls.chunk), import(moduleUrls.tile),
        ]);
        await TileAssetManager.init();
        const tileAt = (x: number, y: number) => {
            if (x < 8 || x > 23) return TileType.GRASS;
            if (x >= 16 && x <= 18 && y >= 12 && y <= 14) return TileType.GRASS;
            if (x >= 19 && x <= 21 && y >= 20 && y <= 40) return TileType.DEEP_WATER;
            return TileType.WATER;
        };
        const canvas = document.createElement('canvas');
        canvas.id = 'water-regression';
        canvas.width = CHUNK_SIZE * TILE_SIZE;
        canvas.height = CHUNK_SIZE * TILE_SIZE * 2;
        const ctx = canvas.getContext('2d')!;
        for (let cy = 0; cy < 2; cy++) {
            const tiles = Array.from({ length: CHUNK_SIZE }, (_, y) =>
                Array.from({ length: CHUNK_SIZE }, (_, x) => tileAt(x, y + cy * CHUNK_SIZE)));
            const chunk = new Chunk(0, cy, tiles);
            chunk.render(ctx, 0, cy * CHUNK_SIZE * TILE_SIZE, tileAt);
        }
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const samples = { water: 0, deep: 0, transition: 0, seam: 0 };
        let transparent = 0;
        let rockColored = 0;
        const isWater = (type: number) => type === TileType.WATER || type === TileType.DEEP_WATER;
        for (let ty = 0; ty < CHUNK_SIZE * 2; ty++) {
            for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                const type = tileAt(tx, ty);
                if (!isWater(type)) continue;
                // Coastal rocks belong next to land; check only water surrounded
                // by water in all eight directions, including across chunks.
                if ([-1, 0, 1].some(dy => [-1, 0, 1].some(dx => !isWater(tileAt(tx + dx, ty + dy))))) continue;
                samples[type === TileType.WATER ? 'water' : 'deep']++;
                if ([[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => tileAt(tx + dx, ty + dy) !== type)) samples.transition++;
                if (ty === CHUNK_SIZE - 1 || ty === CHUNK_SIZE) samples.seam++;
                for (let py = 0; py < TILE_SIZE; py++) {
                    for (let px = 0; px < TILE_SIZE; px++) {
                        const i = ((ty * TILE_SIZE + py) * canvas.width + tx * TILE_SIZE + px) * 4;
                        if (pixels[i + 3] !== 255) transparent++;
                        // Both original water palettes are blue; brown rock and
                        // sand fragments have more red than blue.
                        if (pixels[i] > pixels[i + 2]) rockColored++;
                    }
                }
            }
        }
        // A compact, inspectable view of the same rendered pixels.
        canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:384px;height:768px;image-rendering:pixelated;background:#000';
        document.body.append(canvas);
        return { samples, transparent, rockColored };
    }, urls);
    await testInfo.attach('river-render', {
        body: await page.locator('#water-regression').screenshot({ path: testInfo.outputPath('river.png') }),
        contentType: 'image/png',
    });
    await testInfo.attach('water-pixels', { body: JSON.stringify(result), contentType: 'application/json' });
    for (const count of Object.values(result.samples)) expect(count).toBeGreaterThan(0);
    expect(result.transparent, 'water pixels with transparent holes').toBe(0);
    expect(result.rockColored, 'rock or sand pixels inside open water').toBe(0);
    expect(errors).toEqual([]);
});
