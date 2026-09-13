import { expect, test } from '@playwright/test';

test('forged field HUD keeps the map, status and hunting controls separate at narrow and wide sizes', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(60_000);
    const sizes = isMobile ? [{ width: 320, height: 568 }, { width: 390, height: 844 }]
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
        // The compact map still owns its pointer region after its visual relocation.
        await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
        await expect(page.getByTestId('field-hud')).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('field-hud')).toBeVisible();
        if (size.width === 320) {
            await page.getByRole('button', { name: /사냥터 길 안내|Guide to hunt/ }).click();
            await expect(page.locator('.ds-field-hud.is-menu-open')).toBeVisible({ timeout: 30_000 });
            const hero = await page.locator('.ds-field-hero').boundingBox();
            const slots = await page.evaluate(() => {
                const menu = (window as unknown as { __gm: any }).__gm.worldEngine.getUiState().actionMenuUI;
                return ['move', 'tool', 'attack', 'magic', 'defend', 'rest', 'fanfare', 'open'].map((type) => menu.getCompactChipBounds(type));
            });
            for (const slot of slots) {
                expect(slot).not.toBeNull();
                expect(slot.y * 1.2).toBeGreaterThanOrEqual(hero!.y + hero!.height);
            }
            await page.screenshot({ path: testInfo.outputPath('field-skin-combat-320.png') });
        }
    }
    expect(errors).toEqual([]);
});
