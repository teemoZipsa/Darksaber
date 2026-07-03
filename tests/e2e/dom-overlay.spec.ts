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

async function expectOverlayState(page: Page, expected: Partial<Record<string, boolean>>) {
    await expect.poll(async () => page.evaluate(() => {
        const gm = (window as unknown as {
            __gm?: {
                getOverlayOpenState: () => Record<string, boolean>;
                isDomModalOpen: () => boolean;
                state?: string;
            };
        }).__gm;
        return {
            state: gm?.state,
            modal: gm?.isDomModalOpen() ?? false,
            overlays: gm?.getOverlayOpenState() ?? {},
        };
    })).toMatchObject({
        state: 'WORLD',
        modal: Object.values(expected).some(Boolean),
        overlays: expected,
    });
}

async function getNetworkRaidDebug(page: Page) {
    return page.evaluate(() => {
        const gm = (window as unknown as { __gm?: any }).__gm;
        const engine = gm?.worldEngine;
        return {
            state: gm?.state,
            raidActive: gm?.getRaidSession?.()?.active ?? false,
            networkRaidActive: engine?.isNetworkRaidActive?.() ?? false,
            networkStatus: engine?.networkRaidClient?.getStatus?.() ?? null,
            logs: engine?.fieldFeedback?.combatLog ?? [],
        };
    });
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

test('dev raid loot can be dragged into the backpack with real pointer input', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Pointer drag coverage is exercised on the desktop browser project.');

    await page.goto('/?devStart=raid&devScenario=loot');

    const externalItem = page.locator('#ui-overlay [data-inv-grid="ext"] .inv-item').first();
    const backpack = page.locator('#ui-overlay [data-inv-grid="bag"]');
    await expect(externalItem).toBeVisible({ timeout: 20_000 });
    await expect(backpack).toBeVisible();

    const itemBox = await externalItem.boundingBox();
    const bagBox = await backpack.boundingBox();
    expect(itemBox).not.toBeNull();
    expect(bagBox).not.toBeNull();

    await page.mouse.move(itemBox!.x + itemBox!.width / 2, itemBox!.y + itemBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bagBox!.x + bagBox!.width - 20, bagBox!.y + bagBox!.height - 20, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('.dev-scenario-status')).toContainText(/picked:dev_raid_loot:\d+,\d+/);
    await expect(page.locator('#ui-overlay [data-inv-grid="ext"] .inv-item')).toHaveCount(0);
});

test('network raid logs reconnect UX after a transport drop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Network reconnect UX is covered on the desktop browser project.');
    test.setTimeout(45_000);

    const clientErrors: string[] = [];
    page.on('pageerror', (error) => clientErrors.push(error.message));
    page.on('console', (message) => {
        if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(message.text())) return;
        if (message.type() === 'error') clientErrors.push(message.text());
    });

    await page.goto('/?devStart=raid');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await expect.poll(() => getNetworkRaidDebug(page), { timeout: 30_000 }).toMatchObject({
        state: 'WORLD',
        raidActive: true,
        networkRaidActive: true,
        networkStatus: 'connected',
    });

    await page.evaluate(() => {
        const engine = (window as unknown as { __gm?: any }).__gm?.worldEngine;
        engine?.networkRaidClient?.socket?.close();
    });

    await expect.poll(() => getNetworkRaidDebug(page), { timeout: 10_000 }).toMatchObject({
        state: 'WORLD',
        raidActive: true,
        networkRaidActive: true,
    });
    await expect.poll(async () => (await getNetworkRaidDebug(page)).logs.join('\n'), { timeout: 10_000 })
        .toMatch(/네트워크 상태: 재접속 중|Network status: Reconnecting/);
    await expect.poll(async () => (await getNetworkRaidDebug(page)).networkStatus, { timeout: 15_000 })
        .toBe('connected');

    expect(clientErrors).toEqual([]);
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

test('dev tutorial remains stable through repeated overlay toggles', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Sustained overlay churn is covered on the desktop browser project.');
    test.setTimeout(45_000);

    const clientErrors: string[] = [];
    page.on('pageerror', (error) => clientErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') clientErrors.push(message.text());
    });

    await page.goto('/?devStart=tutorial');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');

    for (let cycle = 0; cycle < 4; cycle++) {
        await page.keyboard.press('KeyI');
        const inventory = page.locator('#ui-overlay .ds-scrim .ds-inv:not(.is-embedded)');
        await expect(inventory).toBeVisible({ timeout: 10_000 });
        await expectFitsViewport(page, inventory);
        await expectOverlayState(page, { inventory: true });
        await page.waitForTimeout(250);
        await page.getByRole('button', { name: /닫기|Close/ }).click();
        await expect(inventory).toBeHidden();
        await expectOverlayState(page, { inventory: false });

        await page.keyboard.press('KeyK');
        const magic = page.locator('#ui-overlay .ds-scrim .ds-panel').filter({ hasText: /마법 장착|Magic Loadout/ });
        await expect(magic).toBeVisible({ timeout: 10_000 });
        await expectFitsViewport(page, magic);
        await expectOverlayState(page, { magic: true });
        await page.waitForTimeout(250);
        await page.getByRole('button', { name: /Close/ }).click();
        await expect(magic).toBeHidden();
        await expectOverlayState(page, { magic: false });

        await page.evaluate(() => (window as unknown as { __gm?: { openPauseMenu: () => void } }).__gm?.openPauseMenu());
        const pause = page.locator('#ui-overlay .ds-pause');
        await expect(pause).toBeVisible({ timeout: 10_000 });
        await expectFitsViewport(page, pause);
        await expectOverlayState(page, { pause: true });
        await page.waitForTimeout(250);
        await page.getByRole('button', { name: /이어하기|Resume/ }).click();
        await expect(pause).toBeHidden();
        await expectOverlayState(page, { pause: false });
    }

    await page.waitForTimeout(1000);
    await expectOverlayState(page, {});
    expect(clientErrors).toEqual([]);
});
