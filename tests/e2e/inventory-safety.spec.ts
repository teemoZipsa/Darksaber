import { expect, test } from '@playwright/test';

test('stack drop hints agree with successful merges and reject a full stack', async ({ page }, testInfo) => {
    let itemUrl = '';
    page.on('response', response => {
        if (/\/src\/data\/ItemDB\.ts(?:\?|$)/.test(response.url())) itemUrl = response.url();
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).waitFor();
    await page.evaluate(async url => {
        const { getItemDef } = await import(url);
        const bag = (window as any).__gm.inventoryUI.getBag();
        bag.clear();
        bag.place(getItemDef('herb_cheap'), 0, 0).quantity = 2;
        bag.place(getItemDef('herb_cheap'), 2, 0).quantity = 2;
    }, itemUrl);
    await page.getByRole('tab', { name: /창고|Storage/ }).click();
    const items = page.locator('[data-inv-grid="bag"] [data-inv-item-id="herb_cheap"]');
    await expect(items).toHaveCount(2);
    await items.first().scrollIntoViewIfNeeded();
    const source = (await items.first().boundingBox())!;
    const target = (await items.nth(1).boundingBox())!;
    await page.mouse.move(source.x + 10, source.y + 10);
    await page.mouse.down();
    await page.mouse.move(target.x + 10, target.y + 10, { steps: 6 });
    await expect(page.locator('.inv-drop-cell')).toHaveClass(/is-valid/);
    await page.screenshot({ path: testInfo.outputPath('valid-stack-drop.png') });
    await page.mouse.up();
    await expect(items).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).__gm.inventoryUI.getBag().items[0].quantity)).toBe(4);

    await page.evaluate(() => {
        const bag = (window as any).__gm.inventoryUI.getBag();
        const stack = bag.items[0];
        stack.quantity = stack.item.maxStack;
        bag.place(stack.item, 0, 0);
    });
    await expect(items).toHaveCount(2);
    const moving = (await items.nth(1).boundingBox())!;
    const full = (await items.first().boundingBox())!;
    await page.mouse.move(moving.x + 10, moving.y + 10);
    await page.mouse.down();
    await page.mouse.move(full.x + 10, full.y + 10, { steps: 6 });
    await expect(page.locator('.inv-drop-cell')).toHaveClass(/is-invalid/);
    await page.mouse.up();
    await expect(items).toHaveCount(2);
});

test('keyboard equip preserves both items when the level requirement fails', async ({ page }) => {
    let itemUrl = '';
    page.on('response', response => {
        if (/\/src\/data\/ItemDB\.ts(?:\?|$)/.test(response.url())) itemUrl = response.url();
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).waitFor();
    const before = await page.evaluate(async url => {
        const { getItemDef } = await import(url);
        const ui = (window as any).__gm.inventoryUI;
        ui.getBag().clear();
        ui.getBag().autoPlace(getItemDef('orig_story_0620_dragon_killer7'));
        return ui.getActiveCharacter().equipment.get('weapon').item.id;
    }, itemUrl);
    await page.getByRole('tab', { name: /창고|Storage/ }).click();
    const sword = page.locator('[data-inv-grid="bag"] [data-inv-item-id="orig_story_0620_dragon_killer7"]');
    await sword.focus();
    await sword.press('Enter');
    await expect(page.getByText(/레벨 106부터|Requires level 106/)).toBeVisible();
    await expect(sword).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).__gm.inventoryUI.getActiveCharacter().equipment.get('weapon').item.id)).toBe(before);
});
