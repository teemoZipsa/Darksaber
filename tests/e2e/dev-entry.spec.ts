import { expect, test, type Page } from '@playwright/test';

async function localState(page: Page) {
    return page.evaluate(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        const engine = gm.worldEngine;
        const actor = engine.getControlledActor();
        return {
            local: gm.isLocalDevSession(),
            auth: gm.getNetworkAuthContext(),
            network: engine.isNetworkRaidActive(),
            active: engine.getRaidSession().active,
            tile: { x: actor.entity.gridX, y: actor.entity.gridY },
        };
    });
}

async function moveAndReturn(page: Page) {
    await expect(page.getByTestId('field-hud')).toBeVisible();
    await page.waitForFunction(() => !(window as unknown as { __gm: any }).__gm.transitions.isInputLocked());
    const target = await page.evaluate(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        const engine = gm.worldEngine;
        // Isolate movement from encounters while exercising the real pointer and travel path.
        engine.fieldEnemies.length = 0;
        const actor = engine.getControlledActor();
        const tile = { x: actor.entity.gridX, y: actor.entity.gridY + 5 };
        gm.camera.setZoom(.5);
        gm.camera.followTile(actor.entity.gridX, actor.entity.gridY);
        gm.camera.snapToTarget();
        const rect = document.querySelector('#gameCanvas')!.getBoundingClientRect();
        return {
            tile,
            x: rect.left + (tile.x * 48 + 24 - gm.camera.baseX) * gm.camera.zoom,
            y: rect.top + (tile.y * 48 + 24 - gm.camera.baseY) * gm.camera.zoom,
        };
    });
    await page.mouse.click(target.x, target.y);
    await expect.poll(async () => (await localState(page)).tile).toEqual(target.tile);
    await page.getByRole('button', { name: /마을로 귀환|Return to town/ }).click();
    await expect.poll(async () => (await localState(page)).active).toBe(false);
    await page.keyboard.press('Enter');
    await expect(page.locator('.ds-town')).toBeVisible();
}

for (const entry of ['town&devLocal=1', 'raid&devLocal=1', 'town']) {
    test(`offline developer entry ${entry} can move, return, and deploy again without touching the saved game`, async ({ page }) => {
        test.setTimeout(60_000);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let authRequests = 0;
        await page.route((url) => url.pathname.startsWith('/auth/'), (route) => { authRequests++; return route.abort(); });
        await page.goto(`/?devStart=${entry}`);
        await expect(page.locator('.dev-session')).toHaveAttribute('data-mode', entry === 'town' ? 'fallback' : 'local');
        if (entry === 'town') {
            await expect(page.locator('.dev-session p')).toContainText(/서버 접속에 실패|Server connection failed/);
            await page.locator('.dev-session summary').click();
        }
        if (!entry.startsWith('raid')) {
            await expect(page.locator('.ds-town')).toBeVisible({ timeout: 20_000 });
            await page.getByRole('button', { name: /필드로 나가기|Enter field/ }).click();
        }
        await expect(page.getByTestId('field-hud')).toBeVisible({ timeout: 20_000 });
        expect(await localState(page)).toMatchObject({ local: true, auth: null, network: false, active: true });
        await page.evaluate(() => localStorage.setItem('sin_eater_save', 'retained-original-save'));
        await moveAndReturn(page);
        await page.getByRole('button', { name: /필드로 나가기|Enter field/ }).click();
        await expect(page.getByTestId('field-hud')).toBeVisible();
        expect(await localState(page)).toMatchObject({ local: true, auth: null, network: false, active: true });
        expect(await page.evaluate(() => localStorage.getItem('sin_eater_save'))).toBe('retained-original-save');
        expect(authRequests).toBe(entry === 'town' ? 1 : 0);
        expect(errors).toEqual([]);
    });
}

test('loot fixture transfers every item then allows walking, return, and a fresh field', async ({ page }) => {
    test.setTimeout(60_000);
    let authRequests = 0;
    await page.route((url) => url.pathname.startsWith('/auth/'), (route) => { authRequests++; return route.abort(); });
    // Legacy scenario URLs must also stay local, even without devLocal=1.
    await page.goto('/?devStart=raid&devScenario=loot');
    const items = page.locator('#ui-overlay [data-inv-grid="ext"] .inv-item');
    await expect(items.first()).toBeVisible({ timeout: 20_000 });
    const before = await page.evaluate(() => (window as unknown as { __gm: any }).__gm.inventory.items.length);
    const count = await items.count();
    expect(count).toBe(2);
    for (let index = 0; index < count; index++) await items.first().click();
    await expect(items).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __gm: any }).__gm.inventory.items.length)).toBe(before + count);
    await page.getByRole('button', { name: /닫기|Close/, exact: true }).click();
    await moveAndReturn(page);
    await page.getByRole('button', { name: /필드로 나가기|Enter field/ }).click();
    await expect(page.getByTestId('field-hud')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __gm: any }).__gm.worldEngine.worldMap.loot.length)).toBe(0);
    expect(authRequests).toBe(0);
});

test('developer tutorial can be skipped into town and continue to the local field', async ({ page }) => {
    await page.goto('/?devStart=tutorial');
    await page.waitForFunction(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        return gm?.state === 'WORLD' && !gm.transitions.isInputLocked();
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('.ds-town')).toBeVisible();
    await page.getByRole('button', { name: /필드로 나가기|Enter field/ }).click();
    await expect(page.getByTestId('field-hud')).toBeVisible();
    expect(await localState(page)).toMatchObject({ local: true, auth: null, network: false, active: true });
});

for (const scenario of ['aggro', 'story1', 'story4', 'story31']) {
    test(`developer scenario ${scenario} initializes offline without runtime errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let authRequests = 0;
        await page.route((url) => url.pathname.startsWith('/auth/'), (route) => { authRequests++; return route.abort(); });
        await page.goto(`/?devStart=raid&devScenario=${scenario}`);
        const status = page.locator('.dev-scenario-status');
        await expect(status).toHaveAttribute('data-scenario', scenario, { timeout: 20_000 });
        await expect(status).toHaveAttribute('data-state', scenario === 'aggro' ? 'attack-ready' : scenario === 'story4' ? 'scenario-ready' : 'interior-ready');
        expect(await localState(page)).toMatchObject({ local: true, auth: null, network: false, active: true });
        expect(authRequests).toBe(0);
        expect(errors).toEqual([]);
    });
}
