import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

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
    const { frames, ...result } = await page.evaluate(async (moduleUrls) => {
        const [{ TileAssetManager, WATER_ANIMATION_FRAMES, WATER_ANIMATION_FRAME_MS }, { Chunk, CHUNK_SIZE, TILE_SIZE }, { TileType }] = await Promise.all([
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
        const chunks = [0, 1].map(cy => {
            const tiles = Array.from({ length: CHUNK_SIZE }, (_, y) =>
                Array.from({ length: CHUNK_SIZE }, (_, x) => tileAt(x, y + cy * CHUNK_SIZE)));
            return new Chunk(0, cy, tiles);
        });
        let neighborReads = 0;
        const getGlobalTile = (x: number, y: number) => { neighborReads++; return tileAt(x, y); };
        const render = (time: number) => chunks.forEach((chunk, cy) =>
            chunk.render(ctx, 0, cy * CHUNK_SIZE * TILE_SIZE, getGlobalTile, 1, time));
        render(0);
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
        const initialNeighborReads = neighborReads;
        const changes = { water: 0, deep: 0, transition: 0, seam: 0, coastOrLand: 0 };
        const preview = document.createElement('canvas');
        preview.width = 384;
        preview.height = 768;
        const previewCtx = preview.getContext('2d')!;
        previewCtx.imageSmoothingEnabled = false;
        const frames: string[] = [];
        const frameTimes: number[] = [];
        for (let frame = 0; frame < WATER_ANIMATION_FRAMES; frame++) {
            const start = performance.now();
            render(frame * WATER_ANIMATION_FRAME_MS);
            frameTimes.push(performance.now() - start);
            const current = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let ty = 0; ty < CHUNK_SIZE * 2; ty++) {
                for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                    const type = tileAt(tx, ty);
                    const openWater = isWater(type) && ![-1, 0, 1].some(dy =>
                        [-1, 0, 1].some(dx => !isWater(tileAt(tx + dx, ty + dy))));
                    const transition = openWater && [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => tileAt(tx + dx, ty + dy) !== type);
                    for (let py = 0; py < TILE_SIZE; py++) {
                        for (let px = 0; px < TILE_SIZE; px++) {
                            const i = ((ty * TILE_SIZE + py) * canvas.width + tx * TILE_SIZE + px) * 4;
                            if (openWater) {
                                if (current[i + 3] !== 255) transparent++;
                                if (current[i] > current[i + 2]) rockColored++;
                            }
                            if (current[i] === pixels[i] && current[i + 1] === pixels[i + 1] && current[i + 2] === pixels[i + 2] && current[i + 3] === pixels[i + 3]) continue;
                            if (!openWater) changes.coastOrLand++;
                            else {
                                changes[type === TileType.WATER ? 'water' : 'deep']++;
                                if (transition) changes.transition++;
                                if (ty === CHUNK_SIZE - 1 || ty === CHUNK_SIZE) changes.seam++;
                            }
                        }
                    }
                }
            }
            previewCtx.drawImage(canvas, 0, 0, preview.width, preview.height);
            frames.push(preview.toDataURL('image/png').split(',')[1]);
        }
        render(WATER_ANIMATION_FRAMES * WATER_ANIMATION_FRAME_MS);
        const loop = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const loopMatches = loop.every((value, i) => value === pixels[i]);
        const animationNeighborReads = neighborReads - initialNeighborReads;
        // Rebuilding terrain at a running animation phase must produce the same
        // image as an already loaded chunk, without carrying stale coast pixels.
        render(3 * WATER_ANIMATION_FRAME_MS);
        const warm = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        chunks.forEach(chunk => chunk.markDirty());
        render(3 * WATER_ANIMATION_FRAME_MS);
        const rebuilt = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const rebuildMatches = rebuilt.every((value, i) => value === warm[i]);
        // A compact, inspectable view of the same rendered pixels.
        canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:384px;height:768px;image-rendering:pixelated;background:#000';
        document.body.append(canvas);
        return { samples, transparent, rockColored, changes, loopMatches, rebuildMatches, animationNeighborReads, frameTimes, frames };
    }, urls);
    await testInfo.attach('river-render', {
        body: await page.locator('#water-regression').screenshot({ path: testInfo.outputPath('river.png') }),
        contentType: 'image/png',
    });
    await testInfo.attach('water-pixels', { body: JSON.stringify(result), contentType: 'application/json' });
    frames.forEach((frame, i) => writeFileSync(testInfo.outputPath(`water-frame-${i}.png`), Buffer.from(frame, 'base64')));
    for (const count of Object.values(result.samples)) expect(count).toBeGreaterThan(0);
    expect(result.transparent, 'water pixels with transparent holes').toBe(0);
    expect(result.rockColored, 'rock or sand pixels inside open water').toBe(0);
    expect(result.changes.coastOrLand, 'land and coastal rocks must remain fixed').toBe(0);
    for (const kind of ['water', 'deep', 'transition', 'seam'] as const) expect(result.changes[kind], `${kind} must animate`).toBeGreaterThan(0);
    expect(result.loopMatches, 'the animation must return seamlessly to its initial frame').toBe(true);
    expect(result.rebuildMatches, 'terrain rebuilds must preserve the current animation phase').toBe(true);
    expect(result.animationNeighborReads, 'animation must reuse cached terrain adjacency').toBe(0);
    expect(errors).toEqual([]);
});
