import { expect, test } from '@playwright/test';

test('terrain boundaries blend with their actual neighbors without grass seams', async ({ page }, testInfo) => {
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
        const [{ TileAssetManager }, { Chunk, CHUNK_SIZE, TILE_SIZE }, { TileType }] = await Promise.all([
            import(moduleUrls.assets), import(moduleUrls.chunk), import(moduleUrls.tile),
        ]);
        await TileAssetManager.init();
        const preload = new OffscreenCanvas(32, 32).getContext('2d')!;
        TileAssetManager.drawTile(preload, TileType.SNOW, 0, 0, 32);
        await TileAssetManager.init();
        const pairs = [
            [TileType.GRASS, TileType.ROAD], [TileType.SAND, TileType.ROAD],
            [TileType.SAND, TileType.STONE], [TileType.STONE, TileType.SNOW],
        ];
        const canvas = document.createElement('canvas');
        canvas.id = 'terrain-regression';
        canvas.width = 16 * TILE_SIZE;
        canvas.height = 32 * TILE_SIZE;
        const ctx = canvas.getContext('2d')!;
        let grassLeaks = 0;
        let snowEdgeVariation = 0;
        for (let band = 0; band < pairs.length; band++) {
            const [left, right] = pairs[band];
            const tileAt = (x: number) => x < 32 ? left : right;
            const scene = new OffscreenCanvas(64 * TILE_SIZE, 32 * TILE_SIZE);
            const sceneCtx = scene.getContext('2d')!;
            for (let cx = 0; cx < 2; cx++) {
                const tiles = Array.from({ length: CHUNK_SIZE }, () =>
                    Array.from({ length: CHUNK_SIZE }, (_, x) => tileAt(cx * CHUNK_SIZE + x)));
                new Chunk(cx, 0, tiles).render(sceneCtx, cx * CHUNK_SIZE * TILE_SIZE, 0, tileAt);
            }
            ctx.drawImage(scene, 24 * TILE_SIZE, 8 * TILE_SIZE, 16 * TILE_SIZE, 8 * TILE_SIZE,
                0, band * 8 * TILE_SIZE, 16 * TILE_SIZE, 8 * TILE_SIZE);
            const data = sceneCtx.getImageData(30 * TILE_SIZE, 8 * TILE_SIZE, 4 * TILE_SIZE, 8 * TILE_SIZE).data;
            if (band > 0) for (let i = 0; i < data.length; i += 4) {
                if (data[i + 1] > data[i] * 1.15 && data[i + 1] > data[i + 2] * 1.2) grassLeaks++;
            }
            if (band === 3) {
                const starts = new Set<number>();
                for (let y = 0; y < 8 * TILE_SIZE; y++) {
                    for (let x = 0; x < 4 * TILE_SIZE; x++) {
                        const i = (y * 4 * TILE_SIZE + x) * 4;
                        if (data[i] > 210 && data[i + 1] > 210 && data[i + 2] > 210) { starts.add(x); break; }
                    }
                }
                snowEdgeVariation = starts.size;
            }
        }
        canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:384px;height:768px;image-rendering:pixelated';
        document.body.append(canvas);
        const connectionFailures: string[] = [];
        const tile = new OffscreenCanvas(32, 32);
        const tileCtx = tile.getContext('2d')!;
        for (const type of [TileType.GRASS, TileType.ROAD, TileType.SAND, TileType.STONE, TileType.SNOW]) {
            for (let mask = 0; mask < 256; mask++) {
                const connections = Array.from({ length: 8 }, (_, i) => (mask & (1 << i)) !== 0);
                tileCtx.clearRect(0, 0, 32, 32);
                TileAssetManager.drawGroundAutotile(tileCtx, type, 0, 0, 32, connections, 12, 15);
                const pixels = tileCtx.getImageData(0, 0, 32, 32).data;
                const alpha = (x: number, y: number) => pixels[(y * 32 + x) * 4 + 3];
                // A connected side must reach the next tile even for one-cell
                // roads, T-junctions and crosses (missing from the old masks).
                for (const [direction, x, y, dx, dy] of [[0, 13, 0, 1, 0], [2, 31, 13, 0, 1], [4, 13, 31, 1, 0], [6, 0, 13, 0, 1]]) {
                    if (connections[direction] && !Array.from({ length: 6 }, (_, i) => alpha(x + dx * i, y + dy * i)).some(a => a > 0)) {
                        connectionFailures.push(`${type}:${mask}:${direction}`);
                    }
                }
            }
        }
        return { grassLeaks, snowEdgeVariation, connectionFailures };
    }, urls);
    await page.locator('#terrain-regression').screenshot({ path: testInfo.outputPath('terrain.png') });
    expect(result.grassLeaks, 'sand/road/stone/snow boundaries must not reveal grass').toBe(0);
    expect(result.snowEdgeVariation, 'snow should have a textured edge instead of a straight rectangle').toBeGreaterThan(3);
    expect(result.connectionFailures, 'connected ground edges must not break at narrow paths or corners').toEqual([]);
});
