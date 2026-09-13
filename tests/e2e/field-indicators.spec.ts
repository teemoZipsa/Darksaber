import { expect, test } from '@playwright/test';

test('party indicators show one focus frame and keep intent drawing isolated', async ({ page }, testInfo) => {
    let rendererUrl = '';
    page.on('response', response => {
        if (/\/src\/engine\/world\/WorldFieldRenderer\.ts(?:\?|$)/.test(response.url())) rendererUrl = response.url();
    });
    await page.goto('/?devStart=raid&devLocal=1&devScenario=combat');
    await expect(page.getByTestId('field-hud')).toBeVisible();
    await page.waitForFunction(() => {
        const engine = (window as unknown as { __gm: any }).__gm?.worldEngine;
        return engine?.partyActors.length === 2 && engine.getControlledActor()?.entity.walkSprite?.image.complete;
    });
    const result = await page.evaluate(async url => {
        const { WorldFieldRenderer } = await import(url);
        const engine = (window as unknown as { __gm: any }).__gm.worldEngine;
        const originalModel = engine.presentationControllers.renderController.buildRenderModel();
        const actor = originalModel.controlledActor;
        actor.entity.actionGauge = 100;
        actor.queuedIntent = { kind: 'attack' };
        const canvas = document.createElement('canvas');
        canvas.id = 'indicator-regression';
        canvas.width = 288;
        canvas.height = 104;
        const composite = canvas.getContext('2d')!;
        const states = ['controlled', 'selected', 'incoming'];
        const results = states.map((state, index) => {
            const tile = new OffscreenCanvas(96, 104);
            const ctx = tile.getContext('2d')!;
            let frames = 0;
            let rings = 0;
            const strokeRect = ctx.strokeRect.bind(ctx);
            ctx.strokeRect = (...args) => { frames++; strokeRect(...args); };
            const arc = ctx.arc.bind(ctx);
            ctx.arc = (...args) => { rings++; arc(...args); };
            // A previous renderer may leave any current path. save/restore
            // does not clear it; an intent badge must start its own path.
            ctx.beginPath();
            ctx.rect(2, 90, 8, 8);
            const model = { ...originalModel, worldTime: 0,
                partyActors: [actor], selectedActorId: state === 'controlled' ? null : actor.id,
                fieldEnemies: state === 'incoming' ? [{ ...originalModel.fieldEnemies[0],
                    previewIntent: { kind: 'attack', targetId: actor.id } }] : [],
            };
            WorldFieldRenderer.renderPartyActors(ctx, model,
                actor.entity.pixelX * 48 - 24, actor.entity.pixelY * 48 - 24);
            const strayAlpha = ctx.getImageData(4, 92, 1, 1).data[3];
            const gauge = [...ctx.getImageData(30, 18, 1, 1).data];
            composite.drawImage(tile, index * 96, 0);
            return { state, frames, rings, strayAlpha, gauge };
        });
        canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:576px;height:208px;background:#31442b;image-rendering:pixelated';
        document.body.append(canvas);
        return results;
    }, rendererUrl);
    await page.locator('#indicator-regression').screenshot({ path: testInfo.outputPath('indicators.png') });
    for (const state of result) {
        expect(state.frames, `${state.state}: duplicate selection frames`).toBe(state.state === 'incoming' ? 0 : 1);
        expect(state.rings, `${state.state}: readiness already has a gauge`).toBe(0);
        expect(state.strayAlpha, `${state.state}: a badge must not fill a previous canvas path`).toBe(0);
        expect(state.gauge, `${state.state}: readiness remains visible`).toEqual([57, 255, 136, 255]);
    }
});
