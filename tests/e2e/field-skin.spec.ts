import { expect, test } from '@playwright/test';

test('forged field HUD keeps the map, status and hunting controls separate at narrow and wide sizes', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(60_000);
    const sizes = isMobile ? [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 516, height: 960 }]
        : [{ width: 960, height: 640 }, { width: 1280, height: 720 }];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => window.localStorage.setItem('setting_uiScale', '1.2'));
    for (const size of sizes) {
        await page.setViewportSize(size);
        await page.goto('/?devStart=raid&devLocal=1');
        await expect(page.getByTestId('field-hunt')).toBeVisible();
        await expect.poll(() => page.locator('.ds-field-crest').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const boxes = await page.locator('.ds-field-hero, .ds-field-expedition, .ds-field-guide').evaluateAll((nodes) => nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
        }));
        await page.waitForFunction(() => (window as unknown as { __gm: any }).__gm.worldEngine.worldControllers.minimapUI.getLastPanelRect()?.width > 0);
        const map = await page.evaluate(() => {
            const gm = (window as unknown as { __gm: any }).__gm;
            const rect = gm.worldEngine.worldControllers.minimapUI.getLastPanelRect();
            const scale = 1.2; // Explicit setting installed above, also used by Canvas hit testing.
            return { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
        });
        boxes.push(map);
        for (const [index, box] of boxes.entries()) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
            expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
            for (const other of boxes.slice(index + 1)) {
                const intersects = box.x < other.x + other.width && box.x + box.width > other.x
                    && box.y < other.y + other.height && box.y + box.height > other.y;
                expect(intersects, `overlapping field panels at ${size.width}px: ${JSON.stringify({ box, other })}`).toBe(false);
            }
        }
        await page.screenshot({ path: testInfo.outputPath(`field-skin-${size.width}.png`) });
        await page.locator('.ds-field-expedition').screenshot({ path: testInfo.outputPath(`field-status-${size.width}.png`) });
        // The compact map still owns its pointer region after its visual relocation.
        await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
        await expect(page.getByTestId('field-hud')).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('field-hud')).toBeVisible();
        if (size.width <= 516) {
            await page.getByRole('button', { name: /사냥터 길 안내|Guide to hunt/ }).click();
            await expect(page.locator('.ds-field-hud.is-menu-open')).toBeVisible({ timeout: 30_000 });
            const hero = await page.locator('.ds-field-hero').boundingBox();
            const geometry = await page.evaluate(() => {
                const gm = (window as unknown as { __gm: any }).__gm;
                const engine = gm.worldEngine;
                const menu = engine.getUiState().actionMenuUI;
                const camera = gm.camera;
                const actor = engine.getControlledActor().entity;
                return {
                    slots: ['move', 'tool', 'attack', 'magic', 'defend', 'rest', 'fanfare', 'open'].map((type) => menu.getCompactChipBounds(type)),
                    actorX: ((actor.pixelX + 0.5) * 48 - camera.x) * camera.zoom,
                    actorY: ((actor.pixelY + 0.5) * 48 - camera.y) * camera.zoom,
                    tileSize: 48 * camera.zoom,
                };
            });
            const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
            for (const [index, slot] of geometry.slots.entries()) {
                expect(slot).not.toBeNull();
                expect(slot.width * 1.2).toBeCloseTo(geometry.tileSize, 5);
                expect(slot.height * 1.2).toBeCloseTo(geometry.tileSize, 5);
                expect((slot.x + slot.width / 2) * 1.2).toBeCloseTo(geometry.actorX + offsets[index][0] * geometry.tileSize, 1);
                expect((slot.y + slot.height / 2) * 1.2).toBeCloseTo(geometry.actorY + offsets[index][1] * geometry.tileSize, 1);
                expect(slot.y * 1.2).toBeGreaterThanOrEqual(hero!.y + hero!.height);
            }
            await page.screenshot({ path: testInfo.outputPath(`field-skin-combat-${size.width}.png`) });
        }
    }
    expect(errors).toEqual([]);
});

for (const language of ['ko', 'en']) {
    test(`field text respects ornament insets and column alignment in ${language}`, async ({ page, isMobile }, testInfo) => {
        await page.addInitScript((lang) => {
            localStorage.setItem('setting_language', lang);
            localStorage.setItem('setting_uiScale', '1.2');
        }, language);
        for (const width of isMobile ? [320, 516] : [960, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            await page.goto('/?devStart=raid&devLocal=1');
            await expect(page.getByTestId('field-hunt')).toBeVisible();
            // Exercise real rendering with a long name and multi-digit resources.
            await page.evaluate(() => {
                const engine = (window as unknown as { __gm: any }).__gm.worldEngine;
                const read = engine.getFieldHudView.bind(engine);
                engine.getFieldHudView = () => {
                    const value = read();
                    return value && { ...value, name: '카오시아의방랑기사 Wandering Knight', level: 99,
                        hp: 1234, maxHp: 5678, gold: 1234567890, elapsed: 44523, exp: 123456, expToNext: 789012 };
                };
            });
            await expect(page.locator('.ds-field-hero__level')).toContainText('99');
            const violations = await page.locator('.ds-field-hero, .ds-field-expedition, .ds-field-guide').evaluateAll((panels) => {
                const failures: string[] = [];
                for (const panel of panels) {
                    const bounds = panel.getBoundingClientRect();
                    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
                    let node: Node | null;
                    while ((node = walker.nextNode())) {
                        if (!node.textContent?.trim() || node.parentElement?.closest('.ds-field-hero__title')) continue;
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        for (const box of range.getClientRects()) {
                            if (!box.width || !box.height) continue;
                            if (box.left < bounds.left + 24 || box.right > bounds.right - 24
                                || box.top < bounds.top + 24 || box.bottom > bounds.bottom - 24) failures.push(`${panel.className}: ${node.textContent}`);
                        }
                    }
                }
                return failures;
            });
            expect(violations).toEqual([]);
            const heading = await page.locator('.ds-field-mode').boundingBox();
            const stats = await page.locator('.ds-field-expedition__stats > span').first().boundingBox();
            const world = await page.locator('.ds-field-expedition__heading > span').last().boundingBox();
            const clock = await page.locator('.ds-field-expedition time').boundingBox();
            expect(heading!.x).toBeCloseTo(stats!.x, 0);
            expect(world!.x + world!.width).toBeCloseTo(clock!.x + clock!.width, 0);
            await page.screenshot({ path: testInfo.outputPath(`field-text-${language}-${width}.png`) });
        }
    });
}
