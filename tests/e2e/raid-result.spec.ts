import { expect, test, type Page } from '@playwright/test';

async function returnFromField(page: Page) {
    await page.goto('/?devStart=raid&devLocal=1');
    await expect(page.getByTestId('field-hud')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /마을로 귀환|Return to town/ }).click();
    await expect(page.getByTestId('raid-result')).toBeVisible();
}

test('real collected loot is readable in the result and touch confirmation opens town without duplicate rewards', async ({ page, isMobile }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?devStart=raid&devScenario=loot&devLocal=1');
    await page.getByRole('button', { name: /전부 가져가기|Take all/i }).click();
    await page.getByRole('button', { name: /닫기|Close/, exact: true }).click();
    await page.getByRole('button', { name: /마을로 귀환|Return to town/ }).click();
    const result = page.getByTestId('raid-result');
    await expect(result).toBeVisible();
    await expect(result.locator('.ds-result__items li')).toHaveCount(2);
    await expect(result).toContainText(/흔한 약초|Common Herb/);
    await expect(result).not.toHaveClass(/is-danger/);
    for (const key of ['KeyC', 'KeyP', 'KeyI', 'KeyJ', 'KeyK']) await page.keyboard.press(key);
    expect(await page.evaluate(() => (window as unknown as { __gm: any }).__gm.getOverlayOpenState())).toMatchObject({ result: true, char: false, party: false, inventory: false, journal: false, magic: false });
    const before = await page.evaluate(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        return { gold: gm.playerData.gold, bag: JSON.stringify(gm.inventory.items), history: gm.playerData.raidHistory.length };
    });
    const confirm = result.getByRole('button', { name: /마을에서 계속하기|Continue in town/ });
    await confirm.focus();
    await page.keyboard.press('Tab');
    await expect(result.locator('.ds-result__body')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('loot-return-result.png') });
    if (isMobile) await confirm.tap(); else await confirm.click();
    await expect(result).toBeHidden();
    await expect(page.locator('.ds-town')).toBeVisible();
    expect(await page.evaluate(() => {
        const gm = (window as unknown as { __gm: any }).__gm;
        gm.worldEngine.confirmRaidOutcome(); // A late duplicate UI event must do nothing.
        return { gold: gm.playerData.gold, bag: JSON.stringify(gm.inventory.items), history: gm.playerData.raidHistory.length };
    })).toEqual(before);
    expect(errors).toEqual([]);
});

for (const language of ['ko', 'en']) {
    test(`long ${language} results keep all text inside the frame and scroll at 120 percent UI scale`, async ({ page, isMobile }, testInfo) => {
        test.setTimeout(60_000);
        await page.addInitScript((lang) => {
            localStorage.setItem('setting_language', lang);
            localStorage.setItem('setting_uiScale', '1.2');
        }, language);
        const sizes = isMobile ? [{ width: 320, height: 568 }, { width: 390, height: 844 }]
            : [{ width: 960, height: 640 }, { width: 1280, height: 720 }];
        for (const size of sizes) {
            await page.setViewportSize(size);
            await returnFromField(page);
            // Stress presentation only: these rows must never grant items or currency.
            await page.evaluate(() => {
                const result = (window as unknown as { __gm: any }).__gm.worldEngine.getRaidOutcome();
                result.goldReward = 1234567890;
                result.kills = 123456;
                result.heroStatuses = Array.from({ length: 3 }, (_, index) => ({
                    characterId: `hero-${index}`, characterName: '카오시아의방랑기사 Wandering Knight', hp: 12345, maxHp: 23456, isDead: index === 2,
                }));
                result.secured = Array.from({ length: 32 }, (_, index) => ({ id: `item-${index}`, name: `Very long exploration reward item ${index + 1}`, nameKr: `유난히 이름이 긴 탐험 보상 아이템 ${index + 1}`, quantity: 12345, rarity: 'common', weight: 1, baseValue: 1 }));
                result.missionReport = { title: 'Mission report / 탐험 목표', lines: Array.from({ length: 10 }, (_, index) => ({ kind: index % 2 ? 'next' : 'success', text: `목표 ${index + 1} — 긴 문장도 빠짐없이 확인할 수 있어야 합니다. Read every objective without truncation.` })) };
                result.notes = ['마지막 안내 문장까지 읽을 수 있습니다. Final report note.'];
            });
            const dialog = page.getByTestId('raid-result');
            const body = dialog.locator('.ds-result__body');
            await expect(dialog.locator('.ds-result__items li')).toHaveCount(32);
            const geometry = await dialog.evaluate((panel) => {
                const bounds = panel.getBoundingClientRect();
                const scroll = panel.querySelector('.ds-result__body')!;
                const footer = panel.querySelector('.ds-result__footer')!.getBoundingClientRect();
                const violations: string[] = [];
                const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
                let node: Node | null;
                while ((node = walker.nextNode())) {
                    if (!node.textContent?.trim()) continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    for (const rect of range.getClientRects()) {
                        if (rect.width && (rect.left < bounds.left + 24 || rect.right > bounds.right - 24)) violations.push(node.textContent);
                    }
                }
                return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, footerBottom: footer.bottom, violations,
                    horizontalOverflow: scroll.scrollWidth > scroll.clientWidth, scrollable: scroll.scrollHeight > scroll.clientHeight };
            });
            expect(geometry.left).toBeGreaterThanOrEqual(0);
            expect(geometry.right).toBeLessThanOrEqual(size.width + 1);
            expect(geometry.top).toBeGreaterThanOrEqual(0);
            expect(geometry.bottom).toBeLessThanOrEqual(size.height + 1);
            expect(geometry.footerBottom).toBeLessThan(geometry.bottom);
            expect(geometry.horizontalOverflow).toBe(false);
            expect(geometry.scrollable).toBe(true);
            expect(geometry.violations).toEqual([]);
            const statLines = await dialog.locator('.ds-result__stats dd').evaluateAll((values) => values.map((value) => {
                const range = document.createRange();
                range.selectNodeContents(value);
                return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
            }));
            expect(statLines).toEqual([1, 1, 1]);
            await page.screenshot({ path: testInfo.outputPath(`result-${language}-${size.width}-top.png`) });
            await body.focus();
            await page.keyboard.press('Control+End');
            await expect.poll(() => body.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 2)).toBe(true);
            await expect(dialog.locator('.ds-result__notes')).toBeInViewport();
            await expect(dialog.getByRole('button', { name: /마을에서 계속하기|Continue in town/ })).toBeInViewport();
            await page.screenshot({ path: testInfo.outputPath(`result-${language}-${size.width}-bottom.png`) });
            await page.keyboard.press('Escape');
            await expect(page.locator('.ds-town')).toBeVisible();
        }
    });
}

test('Enter, Space, and scrim dismissal each return to town', async ({ page }) => {
    for (const method of ['Enter', 'Space', 'scrim']) {
        await returnFromField(page);
        if (method === 'scrim') await page.locator('.ds-result-scrim').click({ position: { x: 2, y: 2 } });
        else await page.keyboard.press(method);
        await expect(page.locator('.ds-town')).toBeVisible();
        await expect(page.getByTestId('raid-result')).toBeHidden();
    }
});
