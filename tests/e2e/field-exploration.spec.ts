import { expect, test, type Page } from '@playwright/test';

async function debug(page: Page) {
    return page.evaluate(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        const engine = gm.worldEngine;
        const actor = engine.getControlledActor();
        return { tile: { x: actor.entity.gridX, y: actor.entity.gridY }, travel: { status: engine.getFieldTravel().status, destination: engine.getFieldTravel().destination }, logs: engine.fieldFeedback.combatLog.slice(-8), hud: engine.getFieldHudView(), active: engine.getRaidSession().active };
    });
}

test('safe field travel crosses multiple movement budgets from one pointer order and can return home', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?devStart=raid&devLocal=1');
    await expect(page.getByTestId('field-hud')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => !(window as unknown as { __gm: any }).__gm.transitions.isInputLocked());
    const fixture = await page.evaluate(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        const engine = gm.worldEngine;
        // Isolate navigation from random encounters; real movement and AP stay active.
        engine.fieldEnemies.length = 0;
        const actor = engine.getControlledActor();
        gm.camera.setZoom(.5);
        gm.camera.followTile(actor.entity.gridX, actor.entity.gridY);
        gm.camera.snapToTarget();
        const start = { x: actor.entity.gridX, y: actor.entity.gridY };
        const destination = { x: start.x, y: start.y + 9 };
        const rect = document.querySelector('#gameCanvas')!.getBoundingClientRect();
        return {
            start, destination,
            pointer: {
                x: rect.left + ((destination.x * 48 + 24) - gm.camera.baseX) * gm.camera.zoom,
                y: rect.top + ((destination.y * 48 + 24) - gm.camera.baseY) * gm.camera.zoom,
            },
        };
    });
    await page.mouse.click(fixture.pointer.x, fixture.pointer.y);
    await expect.poll(async () => (await debug(page)).hud?.travelling).toBe(true);
    await expect.poll(async () => (await debug(page)), { timeout: 30_000 }).toMatchObject({ tile: fixture.destination });
    await expect.poll(async () => (await debug(page)).hud?.travel).toBe('arrived');
    await expect(page.getByRole('button', { name: /마을로 귀환|Return to town/ })).toBeEnabled();
    await page.getByRole('button', { name: /마을로 귀환|Return to town/ }).click();
    await expect.poll(async () => (await debug(page)).active).toBe(false);
    await page.keyboard.press('Enter');
    await expect(page.locator('.ds-town')).toBeVisible();
    expect(errors).toEqual([]);
});

test('exploration HUD fits the viewport and manual stop cancels subsequent movement', async ({ page }) => {
    await page.goto('/?devStart=raid&devLocal=1');
    await expect(page.getByTestId('field-hud')).toBeVisible({ timeout: 20_000 });
    for (const selector of ['.ds-field-hero', '.ds-field-expedition', '.ds-field-guide']) {
        const box = await page.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    await page.evaluate(() => {
        const engine = (window as unknown as { __gm: any }).__gm.worldEngine;
        engine.fieldEnemies.length = 0;
        const actor = engine.getControlledActor();
        engine.tryFieldTravel({ x: actor.entity.gridX, y: actor.entity.gridY + 12 });
    });
    await page.getByRole('button', { name: /이동 중지|Stop travel/ }).click();
    await expect.poll(async () => (await debug(page)).hud?.travel).toBe('cancelled');
    await expect.poll(async () => (await debug(page)).hud?.travelling).toBe(false);
});

test('online travel uses server moves and return preserves the save before redeployment', async ({ page, request }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?devStart=raid&devAccount=explore_${testInfo.project.name}_${Date.now()}`);
    await expect(page.getByTestId('field-hud')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => (window as unknown as { __gm: any }).__gm.worldEngine.isNetworkRaidActive());
    const auth = await page.evaluate(() => (window as unknown as { __gm: any }).__gm.getNetworkAuthContext());
    const readSave = async () => {
        const response = await request.get(`http://127.0.0.1:8765/characters/${auth.characterId}/save`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        expect(response.ok()).toBe(true);
        return (await response.json()).save;
    };
    const before = await readSave();
    const destination = await page.evaluate(() => {
        const engine = (window as unknown as { __gm: any }).__gm.worldEngine;
        const actor = engine.getControlledActor();
        const tile = { x: actor.entity.gridX, y: actor.entity.gridY + 9 };
        if (!engine.tryFieldTravel(tile)) throw new Error('could not start safe travel');
        return tile;
    });
    await expect.poll(async () => (await debug(page)).tile, { timeout: 30_000 }).toEqual(destination);
    await expect.poll(async () => (await debug(page)).hud?.travel).toBe('arrived');
    await page.screenshot({ path: testInfo.outputPath('field-exploration.png') });
    await page.getByRole('button', { name: /마을로 귀환|Return to town/ }).click();
    await expect.poll(async () => (await debug(page)).active).toBe(false);
    await page.keyboard.press('Enter');
    await expect(page.locator('.ds-town')).toBeVisible();
    const after = await readSave();
    expect(after.inventory).toEqual(before.inventory);
    expect(after.equipment).toEqual(before.equipment);
    expect(after.questState.gold).toBe(before.questState.gold);
    expect(after.questState.raidHistory[0]).toMatchObject({ result: 'LEFT', lostItems: 0, equipmentLost: 0 });
    await page.getByRole('button', { name: /필드로 나가기|Enter the field/ }).click();
    await expect(page.getByTestId('field-hud')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm: any }).__gm.worldEngine.isNetworkRaidActive());
    expect(errors).toEqual([]);
});
