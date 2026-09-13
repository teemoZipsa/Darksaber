import { expect, test } from '@playwright/test';
import { walkToTown } from './helpers/walk-to-town';

test('town tabs and field navigation stay quiet, with no instant return control', async ({ page }) => {
    test.setTimeout(60_000);
    let audioUrl = '';
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        if (/\/src\/engine\/AudioManager\.ts(?:\?|$)/.test(response.url())) audioUrl = response.url();
    });
    await page.goto('/?devStart=town&devLocal=1');
    await expect(page.locator('.ds-town')).toBeVisible();
    expect(audioUrl).not.toBe('');
    await page.evaluate(async (url) => {
        const { AudioManager: manager, AUDIO_CATALOG: catalog } = await import(url);
        const sounds: { channel: string; key: string; src: string }[] = [];
        (window as any).__navigationSounds = sounds;
        for (const method of ['playUi', 'playSfx']) {
            const original = manager[method].bind(manager);
            manager[method] = (key: string, options: unknown) => {
                sounds.push({ channel: method, key, src: catalog[key]?.src });
                original(key, options);
            };
        }
    }, audioUrl);
    const sounds = () => page.evaluate(() => (window as any).__navigationSounds as { channel: string; key: string; src: string }[]);
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).click();
    const afterTab = await sounds();
    expect(afterTab.map((sound) => sound.key)).toEqual(['ui.hover']);
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).click();
    expect(await sounds()).toEqual(afterTab);
    await page.getByRole('button', { name: /필드로 나가기|Leave for the field/ }).click();
    await expect(page.getByTestId('field-hud')).toBeVisible();
    expect(await sounds()).toEqual(afterTab);
    await expect(page.getByText(/가까운 곳부터 탐험해 보세요|Explore your surroundings/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /마을로 귀환|Return to town/ })).toHaveCount(0);
    await walkToTown(page);
    await page.getByRole('button', { name: /마을에서 계속하기|Continue in town/ }).click();
    await expect(page.locator('.ds-town')).toBeVisible();
    const played = await sounds();
    expect(played.some((sound) => sound.key === 'sfx.complete')).toBe(true);
    for (const sound of played) {
        expect(sound.key).not.toMatch(/^sfx\.(swing|hit_|door|deploy)/);
        expect(sound.src).not.toContain('/original/04.wav');
    }
    expect(errors).toEqual([]);
});
