import { expect, test } from '@playwright/test';

test('original and supplemental item art loads in inventory, tooltips, shop and canvas', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    const urls: Record<string, string> = {};
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        for (const name of ['ItemDB', 'ItemIconRenderer', 'DarksaberSpriteAtlas']) {
            if (new RegExp(`/${name}\\.ts(?:\\?|$)`).test(response.url())) urls[name] = response.url();
        }
        if (response.url().includes('/assets/images/items/') && !response.ok()) errors.push(response.url());
    });
    await page.goto('/?devStart=town&devLocal=1');
    await expect(page.locator('.ds-inv.is-embedded')).toBeVisible();
    // Fresh local-only inventory fixture. Repair kits are not starter supplies.
    await page.evaluate(async (url) => {
        const { getItemDef } = await import(url);
        const gm = (window as any).__gm;
        for (const id of [
            'repair_kit', 'trade_forest_resin', 'trade_mooncap_mushroom', 'trade_sea_salt',
            'trade_desert_spice', 'trade_imported_silk', 'trade_eastern_incense',
            'cursed_blood_reliquary', 'trade_shadow_amber', 'orig_story_ep16_oil_can',
            'orig_story_ep17_lamp', 'sword_manual', 'rune_el',
        ]) {
            if (!gm.inventory.autoPlace(getItemDef(id))) throw new Error(`Fixture inventory full: ${id}`);
        }
        gm.uiStore.tick();
    }, urls.ItemDB);
    for (const id of ['short_sword', 'battle_t1_body', 'repair_kit']) {
        const icon = page.locator(`[data-inv-item-id="${id}"] .ds-item-glyph`).first();
        await expect(icon).toBeVisible();
        await expect(icon).toHaveClass(/is-sprite/);
        const style = await icon.evaluate((node) => {
            const css = getComputedStyle(node);
            return { image: css.backgroundImage, position: css.backgroundPosition, width: css.width, height: css.height };
        });
        expect(style.width).toBe('32px');
        expect(style.height).toBe('32px');
        expect(style.image).toContain(id === 'repair_kit' ? 'supplemental_items.png' : 'darksaber_items.png');
        expect(style.position).toBe(id === 'short_sword' ? '-288px -32px' : id === 'battle_t1_body' ? '-1536px 0px' : '0px 0px');
    }
    await expect(page.locator('.ds-item-glyph.is-emoji')).toHaveCount(0);
    await page.locator('[data-inv-grid="bag"]').screenshot({ path: testInfo.outputPath('inventory.png') });
    await expect(page.locator('[data-inv-item-id="repair_kit"] .ds-item-glyph')).toBeInViewport();

    await page.locator('[data-inv-item-id="repair_kit"]').first().focus();
    await expect(page.locator('.ds-tooltip-host')).toBeVisible();
    await expect(page.locator('.ds-tooltip-host .ds-item-glyph')).toHaveCSS('background-image', /supplemental_items/);

    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).click();
    await expect(page.locator('.ds-shop .ds-item-glyph.is-sprite').first()).toBeVisible();
    await expect(page.locator('.ds-shop .ds-item-glyph.is-emoji')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('shop.png') });

    expect(Object.keys(urls).sort()).toEqual(['DarksaberSpriteAtlas', 'ItemDB', 'ItemIconRenderer']);
    const canvasResult = await page.evaluate(async (moduleUrls) => {
        const { ITEMS: items } = await import(moduleUrls.ItemDB);
        const { drawItemIcon } = await import(moduleUrls.ItemIconRenderer);
        const { DarksaberSpriteAtlas: atlas } = await import(moduleUrls.DarksaberSpriteAtlas);
        await atlas.init();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        const reference = document.createElement('canvas');
        reference.width = reference.height = 32;
        const expected = reference.getContext('2d')!;
        const failures: string[] = [];
        for (const item of items) {
            ctx.clearRect(0, 0, 32, 32);
            expected.clearRect(0, 0, 32, 32);
            if (!drawItemIcon(ctx, item, 0, 0, 32, 32)) { failures.push(`${item.id}: fallback`); continue; }
            const sprite = item.iconSprite;
            expected.drawImage(atlas.getImage(sprite.sheet ?? 'items'), sprite.col * 32, sprite.row * 32, 32, 32, 0, 0, 32, 32);
            const a = ctx.getImageData(0, 0, 32, 32).data;
            const b = expected.getImageData(0, 0, 32, 32).data;
            if (a.some((value, index) => value !== b[index])) failures.push(`${item.id}: wrong cell or alignment`);
        }
        return { count: items.length, failures };
    }, urls);
    expect(canvasResult.count).toBe(375);
    expect(canvasResult.failures).toEqual([]);
    expect(errors).toEqual([]);
});
