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

async function getRaidLootModelDebug(page: Page) {
    return page.evaluate(() => {
        const gm = (window as unknown as { __gm?: any }).__gm;
        const inventoryUi = gm?.inventoryUI;
        const externalGrid = inventoryUi?.getExternalGrid?.();
        const loot = gm?.worldEngine?.worldMap?.loot?.find((entry: any) => entry.id === 'dev_raid_loot');
        const summarize = (items: any[] | undefined) => ({
            count: items?.length ?? 0,
            quantity: (items ?? []).reduce((sum, item) => sum + Math.max(1, item.quantity ?? 1), 0),
            itemIds: (items ?? []).map((item) => item.item?.id ?? item.itemId ?? '').sort(),
        });
        return {
            inventoryVisible: inventoryUi?.isVisible?.() ?? false,
            externalRaidLoot: inventoryUi?.isExternalRaidLoot?.() ?? false,
            bag: summarize(gm?.inventory?.items),
            external: summarize(externalGrid?.items),
            worldLoot: summarize(loot?.inventory?.items),
            status: document.querySelector('.dev-scenario-status')?.textContent ?? '',
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

test('auth character select deletes the last character after exact-name confirmation', async ({ page, request, isMobile }) => {
    test.skip(isMobile, 'Auth account creation and deletion flow is covered on the desktop browser project.');

    const loginName = `delete_${Date.now().toString(36)}`;
    const password = 'password-1234';
    const characterName = 'DeleteMe';

    const registered = await request.post('http://127.0.0.1:8765/auth/register', {
        data: { loginName, password },
    });
    expect(registered.ok()).toBe(true);
    const session = await registered.json() as { accessToken: string };
    const created = await request.post('http://127.0.0.1:8765/characters', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        data: { name: characterName, classKey: 'infantry', gender: 'M' },
    });
    expect(created.ok()).toBe(true);

    await page.goto('/');
    await expect(page.locator('#auth-overlay .auth-panel')).toBeVisible({ timeout: 20_000 });
    await page.getByLabel(/계정 이름|Login Name/).fill(loginName);
    await page.getByLabel(/비밀번호|Password/).fill(password);
    await page.locator('#auth-overlay .auth-primary').click();

    await expect(page.locator('#auth-overlay .auth-panel__title')).toHaveText(/캐릭터 선택|Select Character/, { timeout: 20_000 });
    const characterCard = page.locator('#auth-overlay .auth-character-card').filter({ hasText: characterName });
    await expect(characterCard).toBeVisible();
    await characterCard.getByRole('button', { name: /^(삭제|Delete)$/ }).click();

    await expect(page.locator('#auth-overlay .auth-delete-confirm')).toBeVisible();
    const confirmAction = page.getByRole('button', { name: /영구 삭제|Delete Permanently/ });
    await page.getByPlaceholder(/캐릭터 이름|Character name/).fill('WrongName');
    await expect(confirmAction).toBeDisabled();

    await page.getByPlaceholder(/캐릭터 이름|Character name/).fill(characterName);
    await expect(confirmAction).toBeEnabled();
    await confirmAction.click();

    await expect(characterCard).toBeHidden();
    await expect(page.locator('#auth-overlay .auth-panel__title')).toHaveText(/캐릭터 생성|Create Character/);
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

test('dev tutorial can swap magic loadout slots from the world hotkey overlay', async ({ page }) => {
    await page.goto('/?devStart=tutorial');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');

    await page.keyboard.press('KeyK');

    const panel = page.locator('#ui-overlay .ds-scrim .ds-panel').filter({ hasText: /마법 장착|Magic Loadout/ });
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#ui-overlay .ds-scrim').getByText(/장착 슬롯|Equipped Slots/)).toBeVisible();

    const slot0 = panel.locator('[data-magic-slot="0"]');
    const slot1 = panel.locator('[data-magic-slot="1"]');
    const firstSkill = await slot0.getAttribute('data-magic-slot-skill');
    const secondSkill = await slot1.getAttribute('data-magic-slot-skill');
    expect(firstSkill).toBeTruthy();
    expect(secondSkill).toBeTruthy();
    expect(secondSkill).not.toBe(firstSkill);

    await slot0.click();
    await expect(slot0).toHaveAttribute('aria-selected', 'true');
    await panel.locator(`[data-magic-skill="${secondSkill}"]`).click();

    await expect(slot0).toHaveAttribute('data-magic-slot-skill', secondSkill!);
    await expect(slot1).toHaveAttribute('data-magic-slot-skill', firstSkill!);
    await expect(panel.locator('[data-magic-detail]')).toHaveAttribute('data-magic-detail', secondSkill!);

    await page.getByRole('button', { name: /Close/ }).click();
    await expect(panel).toBeHidden();

    await page.keyboard.press('KeyK');
    const reopened = page.locator('#ui-overlay .ds-scrim .ds-panel').filter({ hasText: /마법 장착|Magic Loadout/ });
    await expect(reopened.locator('[data-magic-slot="0"]')).toHaveAttribute('data-magic-slot-skill', secondSkill!);
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

    const before = await getRaidLootModelDebug(page);
    expect(before.inventoryVisible).toBe(true);
    expect(before.externalRaidLoot).toBe(true);
    expect(before.external.quantity).toBeGreaterThan(0);
    expect(before.worldLoot).toEqual(before.external);

    await page.mouse.move(itemBox!.x + itemBox!.width / 2, itemBox!.y + itemBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bagBox!.x + bagBox!.width - 20, bagBox!.y + bagBox!.height - 20, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('.dev-scenario-status')).toContainText(/picked:dev_raid_loot:\d+,\d+/);
    await expect(page.locator('#ui-overlay [data-inv-grid="ext"] .inv-item')).toHaveCount(0);
    await expect.poll(() => getRaidLootModelDebug(page)).toMatchObject({
        inventoryVisible: true,
        externalRaidLoot: true,
        external: { count: 0, quantity: 0, itemIds: [] },
        worldLoot: { count: 0, quantity: 0, itemIds: [] },
    });

    const after = await getRaidLootModelDebug(page);
    expect(after.bag.quantity).toBe(before.bag.quantity + before.external.quantity);
    expect(after.status).toMatch(/picked:dev_raid_loot:\d+,\d+/);
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
