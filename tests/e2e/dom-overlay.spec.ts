import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { FIRST_SURVIVAL_QUEST_ID } from '../../src/shared/FirstSurvivalReward';

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

async function getCombatUxDebug(page: Page) {
    return page.evaluate(() => {
        const tileSize = 48;
        const gm = (window as unknown as { __gm?: any }).__gm;
        const engine = gm?.worldEngine;
        const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
        const rect = canvas?.getBoundingClientRect();
        const camera = gm?.camera ?? engine?.getCoreState?.()?.camera;
        const uiState = engine?.getUiState?.();
        const runtimeState = engine?.getRuntimeState?.();
        const actionControllers = engine?.actionControllers ?? engine?.getControllerState?.()?.actionControllers;
        const turnState = engine?.turnStateController;
        const actor = engine?.partyActors?.[0] ?? null;
        const enemyEntry = engine?.fieldEnemies?.find((entry: any) => entry.enemy?.id === 'dev_combat_dummy')
            ?? engine?.fieldEnemies?.[0]
            ?? null;
        const enemy = enemyEntry?.enemy ?? null;
        const uiScale = Number.parseFloat(window.localStorage.getItem('setting_uiScale') ?? '1') || 1;
        const canvasW = canvas?.width ?? window.innerWidth;
        const canvasH = canvas?.height ?? window.innerHeight;
        const toScreen = (entity: any) => {
            if (!rect || !camera || !entity) return null;
            const cameraX = typeof camera.baseX === 'number' ? camera.baseX : camera.x;
            const cameraY = typeof camera.baseY === 'number' ? camera.baseY : camera.y;
            return {
                x: rect.left + ((entity.gridX * tileSize + tileSize / 2) - cameraX) * camera.zoom,
                y: rect.top + ((entity.gridY * tileSize + tileSize / 2) - cameraY) * camera.zoom,
            };
        };
        const toolOptionScreen = rect
            ? {
                x: rect.left + (((canvasW / uiScale) - 256) / 2 + 72) * uiScale,
                y: rect.top + (((canvasH / uiScale) - (34 + 38 + 12)) / 2 + 34 + 19) * uiScale,
            }
            : null;
        const summarizeItems = (items: any[] | undefined) => (items ?? []).reduce<Record<string, number>>((acc, placed) => {
            const id = placed?.item?.id ?? placed?.itemId;
            if (!id) return acc;
            acc[id] = (acc[id] ?? 0) + Math.max(1, placed?.quantity ?? 1);
            return acc;
        }, {});
        const logs = engine?.fieldFeedback?.combatLog ?? [];
        const actionStates = Array.from(uiState?.actionMenuUI?.slotStates ?? []).map(([type, state]: any) => ({
            type,
            enabled: Boolean(state?.enabled),
            disabledReason: state?.disabledReason ?? null,
            highlighted: Boolean(state?.highlighted),
        }));
        return {
            state: gm?.state,
            status: document.querySelector('.dev-scenario-status')?.textContent ?? '',
            partyCount: engine?.partyActors?.length ?? 0,
            partyCharacterIds: gm?.party?.getCharacters?.().map((character: any) => character.id) ?? [],
            partyActorCharacterIds: (engine?.partyActors ?? []).map((entry: any) => entry.character?.id ?? null),
            isNetworkRaid: engine?.isNetworkRaidActive?.() ?? engine?.isNetworkRaid ?? null,
            actionMenuOpen: uiState?.actionMenuUI?.getIsOpen?.() ?? false,
            playerActionMode: actionControllers?.playerActionController?.getMode?.() ?? null,
            magicMode: actionControllers?.magicController?.getState?.().mode ?? null,
            toolVisible: actionControllers?.toolController?.isVisible?.() ?? false,
            hoverTile: runtimeState?.hoverTile ?? null,
            remainingActionPoints: turnState?.getRemainingActionPoints?.() ?? null,
            fanfareLeaderId: runtimeState?.fanfareLeaderActorId ?? null,
            actor: actor ? {
                id: actor.id,
                hp: actor.character?.stats?.hp ?? null,
                maxHp: actor.character?.stats?.maxHp ?? null,
                mp: actor.character?.stats?.mp ?? null,
                statuses: (actor.character?.statuses ?? []).map((status: any) => status.kind),
                tile: { x: actor.entity?.gridX ?? null, y: actor.entity?.gridY ?? null },
                screen: toScreen(actor.entity),
            } : null,
            enemy: enemy ? {
                id: enemy.id,
                hp: enemy.stats?.hp ?? null,
                maxHp: enemy.stats?.maxHp ?? null,
                tile: { x: enemy.gridX, y: enemy.gridY },
                screen: toScreen(enemy),
            } : null,
            inventory: summarizeItems(gm?.inventory?.items),
            logs,
            actionStates,
            toolOptionScreen,
        };
    });
}

async function getCharacterSaveSnapshot(
    request: APIRequestContext,
    accessToken: string,
    characterId: string
) {
    const response = await request.get(`http://127.0.0.1:8765/characters/${encodeURIComponent(characterId)}/save`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok()) {
        return { ok: false, status: response.status(), save: null };
    }
    const parsed = await response.json() as { save: any };
    return { ok: true, status: response.status(), save: parsed.save };
}

async function openCombatActionMenu(page: Page): Promise<void> {
    const current = await getCombatUxDebug(page);
    if (!current.actionMenuOpen) {
        const actorScreen = current.actor?.screen;
        expect(actorScreen).toBeTruthy();
        await page.mouse.click(actorScreen!.x, actorScreen!.y);
    }
    await expect.poll(() => getCombatUxDebug(page), { timeout: 10_000 }).toMatchObject({
        actionMenuOpen: true,
    });
}

async function clickCombatEnemy(page: Page): Promise<void> {
    const current = await getCombatUxDebug(page);
    const enemyScreen = current.enemy?.screen;
    const enemyTile = current.enemy?.tile;
    if (!enemyScreen || !enemyTile) throw new Error('dev combat enemy screen position is unavailable');
    await page.mouse.move(enemyScreen.x, enemyScreen.y);
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return debug.hoverTile;
    }, { timeout: 5000 }).toMatchObject(enemyTile);
    await page.mouse.click(enemyScreen.x, enemyScreen.y);
}

async function clickCombatToolOption(page: Page): Promise<void> {
    const current = await getCombatUxDebug(page);
    const option = current.toolOptionScreen;
    expect(option).toBeTruthy();
    await page.mouse.move(option!.x, option!.y);
    await page.mouse.click(option!.x, option!.y);
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

test('dev launcher buttons are readable and enter dev modes', async ({ page, isMobile }) => {
    await page.goto('/');
    const launcher = page.locator('.dev-launcher');
    await expect(launcher).toBeVisible({ timeout: 20_000 });

    const metrics = await page.locator('.dev-launcher a').evaluateAll((links) => links.slice(0, 8).map((link) => {
        const rect = link.getBoundingClientRect();
        const style = window.getComputedStyle(link);
        return {
            height: rect.height,
            width: rect.width,
            flexShrink: style.flexShrink,
            whiteSpace: style.whiteSpace,
        };
    }));
    expect(metrics.length).toBeGreaterThanOrEqual(8);
    for (const metric of metrics) {
        expect(metric.flexShrink).toBe('0');
        expect(metric.whiteSpace).toBe('nowrap');
        expect(metric.height).toBeGreaterThanOrEqual(32);
        expect(metric.width).toBeGreaterThan(metric.height);
    }

    await page.locator('.dev-launcher a[href="/?devStart=town"]').click();
    await expect(page.locator('#ui-overlay .ds-town')).toBeVisible({ timeout: 20_000 });

    if (!isMobile) {
        await page.goto('/');
        await page.locator('.dev-launcher a[href="/?devStart=raid&devScenario=loot"]').click();
        await expect(page.locator('#ui-overlay [data-inv-grid="ext"] .inv-item').first()).toBeVisible({ timeout: 25_000 });
    }

    await page.goto('/');
    await page.locator('.dev-launcher a[href="/?devStart=tutorial"]').click();
    await page.waitForFunction(() => (window as unknown as { __gm?: { state?: string } }).__gm?.state === 'WORLD');
});

test('auth character select deletes the last character after exact-name confirmation', async ({ page, request }) => {
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

test('authenticated network raid survival returns to town and persists the server save', async ({ page, request }) => {
    test.setTimeout(60_000);

    const clientErrors: string[] = [];
    page.on('pageerror', (error) => clientErrors.push(error.message));
    page.on('console', (message) => {
        if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(message.text())) return;
        if (message.type() === 'error') clientErrors.push(message.text());
    });

    const loginName = `survive_${Date.now().toString(36)}`;
    const password = 'password-1234';
    const characterName = 'Survivor';
    const extractionTownId = 'w_forest_village';

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
    const createdBody = await created.json() as { character: { id: string }; save: any };
    const characterId = createdBody.character.id;
    const initialGold = Number(createdBody.save.questState.gold);

    await page.goto('/');
    await expect(page.locator('#auth-overlay .auth-panel')).toBeVisible({ timeout: 20_000 });
    await page.getByLabel(/계정 이름|Login Name/).fill(loginName);
    await page.getByLabel(/비밀번호|Password/).fill(password);
    await page.locator('#auth-overlay .auth-primary').click();

    await expect(page.locator('#auth-overlay .auth-panel__title')).toHaveText(/캐릭터 선택|Select Character/, { timeout: 20_000 });
    const characterCard = page.locator('#auth-overlay .auth-character-card').filter({ hasText: characterName });
    await expect(characterCard).toBeVisible();
    await characterCard.locator('.auth-character-card__select').click();

    await expect(page.locator('#ui-overlay .ds-town')).toBeVisible({ timeout: 20_000 });
    const deployButton = page.getByRole('button', { name: /출격|Deploy/ });
    await page.waitForTimeout(500);
    await expect(deployButton).toBeEnabled();
    await deployButton.click();
    await expect.poll(() => getNetworkRaidDebug(page), { timeout: 30_000 }).toMatchObject({
        state: 'WORLD',
        raidActive: true,
        networkRaidActive: true,
        networkStatus: 'connected',
    });

    const placed = await request.post('http://127.0.0.1:8765/__playwright/world/place-player-at-town', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        data: { characterId, townId: extractionTownId },
    });
    expect(placed.ok()).toBe(true);

    await page.evaluate(() => {
        const client = (window as unknown as { __gm?: any }).__gm?.worldEngine?.networkRaidClient;
        if (!client) throw new Error('missing network raid client');
        client.leave('town');
    });

    await expect.poll(() => getNetworkRaidDebug(page), { timeout: 20_000 }).toMatchObject({
        state: 'WORLD',
        raidActive: false,
        networkRaidActive: false,
    });

    await expect.poll(async () => {
        const snapshot = await getCharacterSaveSnapshot(request, session.accessToken, characterId);
        if (!snapshot.ok || !snapshot.save) {
            return {
                ok: false,
                townId: null,
                goldIncreased: false,
                firstSurvival: false,
            };
        }
        const save = snapshot.save;
        const completed = Array.isArray(save.questState?.completedQuestIds)
            ? save.questState.completedQuestIds
            : [];
        return {
            ok: true,
            townId: save.hubLocation?.townId ?? null,
            goldIncreased: Number(save.questState?.gold) > initialGold,
            firstSurvival: completed.includes(FIRST_SURVIVAL_QUEST_ID),
        };
    }, { timeout: 20_000 }).toMatchObject({
        ok: true,
        townId: extractionTownId,
        goldIncreased: true,
        firstSurvival: true,
    });

    await page.keyboard.press('Enter');
    await expect(page.locator('#ui-overlay .ds-town')).toBeVisible({ timeout: 10_000 });

    expect(clientErrors).toEqual([]);
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

test('dev raid loot can be transferred into the backpack with pointer input', async ({ page, isMobile }) => {
    await page.goto(isMobile ? '/?devStart=raid&devScenario=loot&devLocal=1' : '/?devStart=raid&devScenario=loot');

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

    if (isMobile) {
        await externalItem.click();
    } else {
        await page.mouse.move(itemBox!.x + itemBox!.width / 2, itemBox!.y + itemBox!.height / 2);
        await page.mouse.down();
        await page.mouse.move(bagBox!.x + bagBox!.width - 20, bagBox!.y + bagBox!.height - 20, { steps: 12 });
        await page.mouse.up();
    }

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

test('dev raid combat UX supports attack, magic, tool, defend, rest, and fanfare inputs', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop canvas combat UX coverage; mobile network raid is tracked separately');
    test.setTimeout(60_000);

    const clientErrors: string[] = [];
    page.on('pageerror', (error) => clientErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') clientErrors.push(message.text());
    });

    await page.goto('/?devStart=raid&devScenario=combat&devLocal=1');
    await expect(page.locator('.dev-scenario-status')).toContainText(/combat \/ combat-ready/, { timeout: 25_000 });
    await expect.poll(() => getCombatUxDebug(page), { timeout: 20_000 }).toMatchObject({
        state: 'WORLD',
        partyCount: 2,
        remainingActionPoints: 160,
        enemy: { id: 'dev_combat_dummy', hp: 999 },
        inventory: { herb_common: 1 },
    });
    const fixture = await getCombatUxDebug(page);
    expect(fixture.partyCharacterIds).toContain('dev_combat_follower');
    expect(fixture.partyActorCharacterIds).toContain('dev_combat_follower');
    expect(fixture.isNetworkRaid).toBe(false);

    await openCombatActionMenu(page);

    await page.keyboard.press('KeyD');
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return debug.actionMenuOpen
            && debug.fanfareLeaderId === debug.actor?.id
            && /집결|rally/i.test(debug.logs.join('\n'));
    }, { timeout: 10_000 }).toBe(true);
    const afterFanfare = await getCombatUxDebug(page);
    expect(afterFanfare.fanfareLeaderId).toBe(afterFanfare.actor?.id);
    expect(afterFanfare.logs.join('\n')).toMatch(/집결|rally/i);

    const enemyHpBeforeAttack = afterFanfare.enemy!.hp;
    await page.keyboard.press('KeyE');
    await expect.poll(() => getCombatUxDebug(page)).toMatchObject({ playerActionMode: 'attack' });
    await clickCombatEnemy(page);
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return {
            hpDropped: Number(debug.enemy?.hp) < Number(enemyHpBeforeAttack),
            actionMenuOpen: debug.actionMenuOpen,
        };
    }, { timeout: 10_000 }).toMatchObject({
        hpDropped: true,
        actionMenuOpen: true,
    });

    const beforeMagic = await getCombatUxDebug(page);
    await page.keyboard.press('KeyR');
    await expect.poll(() => getCombatUxDebug(page)).toMatchObject({ magicMode: 'menu' });
    await page.keyboard.press('Digit1');
    await expect.poll(() => getCombatUxDebug(page)).toMatchObject({ magicMode: 'targeting' });
    await clickCombatEnemy(page);
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return {
            hpDropped: Number(debug.enemy?.hp) < Number(beforeMagic.enemy?.hp),
            mpSpent: Number(debug.actor?.mp) < Number(beforeMagic.actor?.mp),
            actionMenuOpen: debug.actionMenuOpen,
            magicMode: debug.magicMode,
        };
    }, { timeout: 10_000 }).toMatchObject({
        hpDropped: true,
        mpSpent: true,
        actionMenuOpen: true,
        magicMode: 'idle',
    });

    const beforeTool = await getCombatUxDebug(page);
    await page.keyboard.press('KeyW');
    await expect.poll(() => getCombatUxDebug(page)).toMatchObject({ toolVisible: true });
    await clickCombatToolOption(page);
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return {
            healed: Number(debug.actor?.hp) > Number(beforeTool.actor?.hp),
            herbCount: debug.inventory.herb_common ?? 0,
            actionMenuOpen: debug.actionMenuOpen,
            toolVisible: debug.toolVisible,
        };
    }, { timeout: 10_000 }).toMatchObject({
        healed: true,
        herbCount: 0,
        actionMenuOpen: true,
        toolVisible: false,
    });

    await page.keyboard.press('KeyA');
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return {
            guarded: debug.actor?.statuses.includes('guard') ?? false,
            counterReady: debug.actor?.statuses.includes('counterReady') ?? false,
            actionMenuOpen: debug.actionMenuOpen,
        };
    }).toMatchObject({
        guarded: true,
        counterReady: true,
        actionMenuOpen: true,
    });

    await page.keyboard.press('KeyS');
    await expect.poll(async () => {
        const debug = await getCombatUxDebug(page);
        return {
            resting: debug.actor?.statuses.includes('resting') ?? false,
            actionMenuOpen: debug.actionMenuOpen,
            remainingActionPoints: debug.remainingActionPoints,
            logs: debug.logs.join('\n'),
        };
    }, { timeout: 10_000 }).toMatchObject({
        resting: true,
        actionMenuOpen: true,
        remainingActionPoints: 40,
    });

    const finalDebug = await getCombatUxDebug(page);
    expect(finalDebug.logs.join('\n')).toMatch(/방어|guard|휴식|rest/i);
    expect(clientErrors).toEqual([]);
});

test('network raid logs reconnect UX after a transport drop', async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    const clientErrors: string[] = [];
    page.on('pageerror', (error) => clientErrors.push(error.message));
    page.on('console', (message) => {
        if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(message.text())) return;
        if (message.type() === 'error') clientErrors.push(message.text());
    });

    const devAccount = `reconnect-${testInfo.project.name.replace(/[^a-z0-9]/gi, '').slice(0, 10)}-${Date.now().toString(36)}`;
    await page.goto(`/?devStart=raid&devAccount=${devAccount}`);
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

test('dev tutorial remains stable through repeated overlay toggles', async ({ page }) => {
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
