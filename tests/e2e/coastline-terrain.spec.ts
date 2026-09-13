import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('rocky shores reveal the adjoining land and keep narrow water connections', async ({ page }, testInfo) => {
    const urls = { assets: '', chunk: '', tile: '' };
    page.on('response', response => {
        const url = response.url();
        if (/\/src\/map\/TileAssetManager\.ts(?:\?|$)/.test(url)) urls.assets = url;
        if (/\/src\/map\/Chunk\.ts(?:\?|$)/.test(url)) urls.chunk = url;
        if (/\/src\/map\/Tile\.ts(?:\?|$)/.test(url)) urls.tile = url;
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).waitFor();
    const { preview, ...result } = await page.evaluate(async moduleUrls => {
        const [{ TileAssetManager }, { Chunk, CHUNK_SIZE, TILE_SIZE: size }, { TileType: T }] = await Promise.all([
            import(moduleUrls.assets), import(moduleUrls.chunk), import(moduleUrls.tile),
        ]);
        await TileAssetManager.init();
        const offsets = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
        // Straight banks, outside/inside corners, narrow channels, dead ends,
        // isolated pools and islands. One bank lies on the x=32 chunk seam.
        const masks = [31, 241, 124, 199, 127, 85, 17, 0];
        const grounds = [T.SAND, T.STONE, T.ROAD, T.GRASS];
        const tileAt = (x: number, y: number) => {
            const column = Math.floor((x - 26) / 5);
            const row = Math.floor((y - 4) / 5);
            if (column < 0 || column >= masks.length || row < 0 || row >= grounds.length) return T.SAND;
            const dx = x - (27 + column * 5), dy = y - (5 + row * 5);
            const water = row === 3 ? T.DEEP_WATER : T.WATER;
            if (dx === 0 && dy === 0) return water;
            const index = offsets.findIndex(([nx, ny]) => dx === nx && dy === ny);
            return index >= 0 && (masks[column] & (1 << index)) ? water : grounds[row];
        };
        const canvas = document.createElement('canvas');
        canvas.width = 42 * size;
        canvas.height = 22 * size;
        const ctx = canvas.getContext('2d')!;
        const chunks = [0, 1, 2].map(cx => new Chunk(cx, 0,
            Array.from({ length: CHUNK_SIZE }, (_, y) =>
                Array.from({ length: CHUNK_SIZE }, (_, x) => tileAt(cx * CHUNK_SIZE + x, y)))));
        const render = () => chunks.forEach((chunk, cx) => chunk.render(ctx, (cx * CHUNK_SIZE - 25) * size, -3 * size, tileAt));
        render();
        let exteriorWater = 0;
        const detachedConnections: string[] = [];
        for (let row = 0; row < grounds.length; row++) for (let column = 0; column < masks.length; column++) {
            const pixels = ctx.getImageData((2 + column * 5) * size, (2 + row * 5) * size, size, size).data;
            const isBlue = (x: number, y: number) => {
                const i = (y * size + x) * 4;
                // Deep-water foam is teal/gray, with equal green and blue.
                return pixels[i + 2] > pixels[i] * 1.1 && pixels[i + 2] >= pixels[i + 1] * 0.85;
            };
            for (const [direction, x, y, dx, dy] of [[0, 19, 0, 1, 0], [2, size - 1, 19, 0, 1], [4, 19, size - 1, 1, 0], [6, 0, 19, 0, 1]]) {
                const blue = Array.from({ length: 10 }, (_, i) => isBlue(x + i * dx, y + i * dy)).filter(Boolean).length;
                if (!(masks[column] & (1 << direction))) exteriorWater += blue;
                else {
                    // The original wide banks can move a channel off-center.
                    const reachesEdge = Array.from({ length: size }, (_, i) =>
                        isBlue(dx ? i : x, dy ? i : y)).some(Boolean);
                    if (!reachesEdge) detachedConnections.push(`${row}:${masks[column]}:${direction}`);
                }
            }
        }
        const beforeRebuild = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        chunks.forEach(chunk => chunk.markDirty());
        render();
        const rebuilt = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return {
            exteriorWater, detachedConnections,
            transparent: rebuilt.filter((alpha, i) => i % 4 === 3 && alpha !== 255).length,
            rebuildMatches: rebuilt.every((value, i) => value === beforeRebuild[i]),
            preview: canvas.toDataURL('image/png').split(',')[1],
        };
    }, urls);
    writeFileSync(testInfo.outputPath('coastline.png'), Buffer.from(preview, 'base64'));
    await testInfo.attach('coastline-metrics', { body: JSON.stringify(result), contentType: 'application/json' });
    expect(result.exteriorWater, 'water must not extend beyond the rocks into the land-facing edge').toBe(0);
    expect(result.detachedConnections, 'narrow channels must join the next water cell').toEqual([]);
    expect(result.transparent).toBe(0);
    expect(result.rebuildMatches).toBe(true);
});

test('Burgos southwest river keeps the actual mixed banks continuous', async ({ page }, testInfo) => {
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
        const [{ TileAssetManager }, { Chunk, CHUNK_SIZE, TILE_SIZE: size }, { TileType: T }] = await Promise.all([
            import(moduleUrls.assets), import(moduleUrls.chunk), import(moduleUrls.tile),
        ]);
        await TileAssetManager.init();
        const map = (window as unknown as { __gm: any }).__gm.worldEngine.worldMap;
        const dungeon = map.getDungeons().find((entry: { id: string }) => entry.id === 'burgos_castle');
        const center = map.getDungeonEntranceTile(dungeon);
        // The reported screenshot matches original 01hmap at (9, 98).
        const originX = center.x - 69 + 9, originY = center.y - 69 + 98;
        const tileAt = (x: number, y: number) => map.getTileAt(x, y);
        const canvas = document.createElement('canvas');
        canvas.width = 28 * size; canvas.height = 22 * size;
        const ctx = canvas.getContext('2d')!;
        for (let cy = Math.floor(originY / CHUNK_SIZE); cy <= Math.floor((originY + 21) / CHUNK_SIZE); cy++) {
            for (let cx = Math.floor(originX / CHUNK_SIZE); cx <= Math.floor((originX + 27) / CHUNK_SIZE); cx++) {
                const chunk = new Chunk(cx, cy, Array.from({ length: CHUNK_SIZE }, (_, y) =>
                    Array.from({ length: CHUNK_SIZE }, (_, x) => tileAt(cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y))));
                chunk.render(ctx, (cx * CHUNK_SIZE - originX) * size, (cy * CHUNK_SIZE - originY) * size, tileAt);
            }
        }
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let inventedGrass = 0;
        const waterAt = (x: number, y: number) => [T.WATER, T.DEEP_WATER].includes(tileAt(originX + x, originY + y));
        const blueAt = (x: number, y: number) => {
            const i = (y * canvas.width + x) * 4;
            return pixels[i + 2] > pixels[i] * 1.1 && pixels[i + 2] >= pixels[i + 1] * 0.85;
        };
        let maxBankMismatch = 0;
        for (let y = 1; y < 21; y++) for (let x = 1; x < 27; x++) {
            if (!waterAt(x, y)) continue;
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                if (!waterAt(x + dx, y + dy)) continue;
                let mismatch = 0;
                for (let k = 0; k < size; k++) {
                    const px = dx ? (x + 1) * size - 1 : x * size + k;
                    const py = dy ? (y + 1) * size - 1 : y * size + k;
                    if (blueAt(px, py) !== blueAt(px + dx, py + dy)) mismatch++;
                }
                maxBankMismatch = Math.max(maxBankMismatch, mismatch);
            }
        }
        for (let y = 1; y < 21; y++) for (let x = 1; x < 27; x++) {
            if (tileAt(originX + x, originY + y) !== T.WALL) continue;
            if ([-1, 0, 1].some(dy => [-1, 0, 1].some(dx =>
                [T.GRASS, T.FOREST].includes(tileAt(originX + x + dx, originY + y + dy))))) continue;
            for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
                const i = ((y * size + py) * canvas.width + x * size + px) * 4;
                if (pixels[i + 1] > pixels[i] * 1.15 && pixels[i + 1] > pixels[i + 2] * 1.2) inventedGrass++;
            }
        }
        return {
            preview: canvas.toDataURL('image/png').split(',')[1],
            originX, originY, inventedGrass, maxBankMismatch,
            transparent: pixels.filter((alpha, i) => i % 4 === 3 && alpha !== 255).length,
            tiles: Array.from({ length: 22 }, (_, y) => Array.from({ length: 28 }, (_, x) => tileAt(originX + x, originY + y))),
        };
    }, urls);
    writeFileSync(testInfo.outputPath('burgos-coast.png'), Buffer.from(result.preview, 'base64'));
    await testInfo.attach('burgos-terrain', { body: JSON.stringify({ ...result, preview: undefined }), contentType: 'application/json' });
    expect(result.transparent).toBe(0);
    expect(result.inventedGrass, 'sand and castle walls must not reveal an invented grass underlay').toBe(0);
    expect(result.maxBankMismatch, 'shared water edges must agree, allowing a few pixels of rock texture variation').toBeLessThanOrEqual(6);
});
