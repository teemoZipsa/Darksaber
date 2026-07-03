import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectFitsViewport(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test('dev town renders the React town overlay with embedded inventory', async ({ page }) => {
    await page.goto('/?devStart=town');

    await expect(page.locator('#ui-overlay .ds-town')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#ui-overlay .ds-town__tabs[role="tablist"]')).toBeVisible();
    await expect(page.locator('#ui-overlay .ds-inv.is-embedded')).toBeVisible();
    await expect(page.locator('#ui-overlay [data-inv-grid="bag"]')).toBeVisible();

    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).click();
    await expect(page.locator('#ui-overlay .ds-shop')).toBeVisible();
});

test('dev tutorial can open and close the standalone inventory overlay', async ({ page }) => {
    await page.goto('/?devStart=tutorial');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');

    await page.keyboard.press('KeyI');

    await expect(page.locator('#ui-overlay .ds-scrim .ds-inv:not(.is-embedded)')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#ui-overlay .ds-scrim [data-inv-grid="bag"]')).toBeVisible();

    await page.getByRole('button', { name: /닫기|Close/ }).click();
    await expect(page.locator('#ui-overlay .ds-scrim .ds-inv:not(.is-embedded)')).toBeHidden();
});

test('pause menu hands off to the React settings panel', async ({ page }) => {
    await page.goto('/?devStart=tutorial');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');

    await page.evaluate(() => (window as unknown as { __gm?: { openPauseMenu: () => void } }).__gm?.openPauseMenu());
    await expect(page.locator('#ui-overlay .ds-pause')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /설정|Settings/ }).click();
    await expect(page.locator('#ui-overlay .ds-settings')).toBeVisible();

    await page.getByRole('button', { name: /닫기|Close/ }).click();
    await expect(page.locator('#ui-overlay .ds-settings')).toBeHidden();
});

test('dev tutorial opens the magic loadout overlay from the world hotkey', async ({ page }) => {
    await page.goto('/?devStart=tutorial');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');

    await page.keyboard.press('KeyK');

    await expect(page.locator('#ui-overlay .ds-scrim .ds-panel').filter({ hasText: /마법 장착|Magic Loadout/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#ui-overlay .ds-scrim').getByText(/장착 슬롯|Equipped Slots/)).toBeVisible();

    await page.getByRole('button', { name: /Close/ }).click();
    await expect(page.locator('#ui-overlay .ds-scrim .ds-panel').filter({ hasText: /마법 장착|Magic Loadout/ })).toBeHidden();
});

test('mobile viewport keeps town and standalone inventory overlays within the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?devStart=town');

    const town = page.locator('#ui-overlay .ds-town');
    await expect(town).toBeVisible({ timeout: 20_000 });
    await expectFitsViewport(page, town);

    await page.goto('/?devStart=tutorial');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');
    await page.evaluate(() => {
        const gm = (window as unknown as { __gm?: { inventoryUI?: { toggle: () => void } } }).__gm;
        gm?.inventoryUI?.toggle();
    });

    const inventory = page.locator('#ui-overlay .ds-scrim .ds-inv:not(.is-embedded)');
    await expect(inventory).toBeVisible({ timeout: 10_000 });
    await expectFitsViewport(page, inventory);
});
