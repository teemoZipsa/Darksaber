import test from 'node:test';
import assert from 'node:assert/strict';
import type { InputManager } from '../../src/engine/InputManager';
import { CombatLogUI, getCombatLogRegion } from '../../src/ui/CombatLogUI';

const compactViewports = [
    { name: '390px mobile', width: 390, height: 844 },
    { name: '390px mobile at 120% UI scale', width: 325, height: Math.floor(844 / 1.2) },
    { name: '320px mobile at 120% UI scale', width: 266, height: Math.floor(640 / 1.2) },
];

for (const viewport of compactViewports) {
    test(`compact combat log stays in bounds and ignores input at ${viewport.name}`, () => {
        const region = getCombatLogRegion(viewport.width, viewport.height, true);

        assert.ok(region.x >= 0);
        assert.ok(region.y >= 0);
        assert.ok(region.w >= 0);
        assert.ok(region.h >= 0);
        assert.ok(region.x + region.w <= viewport.width);
        assert.ok(region.y + region.h <= viewport.height);
        assert.equal(region.h, 38);

        const input = {
            uiMouseX: region.x + region.w / 2,
            uiMouseY: region.y + region.h / 2,
            mouseWheelDelta: -1,
            mouseJustDown: true,
            mouseIsDown: true,
        } as InputManager;

        assert.equal(CombatLogUI.update(input, 20, viewport.width, viewport.height), false);
    });
}
