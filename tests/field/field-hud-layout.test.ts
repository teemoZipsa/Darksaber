import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFieldHudLayout,
    getRectIntersectionArea,
    type FieldHudRect,
} from '../../src/engine/world/FieldHudLayout';
import { getRaidBannerLayout } from '../../src/engine/world/WorldFieldRenderer';

interface CompactViewportCase {
    name: string;
    width: number;
    height: number;
}

const compactViewports: CompactViewportCase[] = [
    { name: '390px mobile', width: 390, height: 844 },
    { name: '390px mobile at 120% UI scale', width: 325, height: Math.floor(844 / 1.2) },
    { name: '320px mobile at 120% UI scale', width: 266, height: Math.floor(640 / 1.2) },
];

function asHudRect(rect: { x: number; y: number; width: number; height: number }): FieldHudRect {
    return {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
    };
}

function assertInsideViewport(
    rect: FieldHudRect,
    width: number,
    height: number,
    label: string,
): void {
    assert.ok(rect.x >= 0, `${label} starts inside the viewport`);
    assert.ok(rect.y >= 0, `${label} starts inside the viewport`);
    assert.ok(rect.w >= 0, `${label} has a non-negative width`);
    assert.ok(rect.h >= 0, `${label} has a non-negative height`);
    assert.ok(rect.x + rect.w <= width, `${label} stays within the viewport width`);
    assert.ok(rect.y + rect.h <= height, `${label} stays within the viewport height`);
}

for (const viewport of compactViewports) {
    test(`compact field HUD keeps hard panels separated at ${viewport.name}`, () => {
        const banner = getRaidBannerLayout(viewport.width, {
            hasBounty: true,
            hasModifier: true,
        });
        const bannerRect = asHudRect(banner);
        const layout = getFieldHudLayout(viewport.width, bannerRect);

        assert.equal(layout.compact, true);
        assert.equal(layout.showTitle, false);

        const hardPanels: Array<[string, FieldHudRect]> = [
            ['raid banner', bannerRect],
            ['character panel', layout.character],
            ['entity info', layout.entityInfo],
            ['minimap', layout.minimap],
        ];
        for (const [label, rect] of hardPanels) {
            assertInsideViewport(rect, viewport.width, viewport.height, label);
        }

        const intersections: Array<[string, FieldHudRect, string, FieldHudRect]> = [
            ['raid banner', bannerRect, 'character panel', layout.character],
            ['raid banner', bannerRect, 'entity info', layout.entityInfo],
            ['raid banner', bannerRect, 'minimap', layout.minimap],
            ['character panel', layout.character, 'entity info', layout.entityInfo],
            ['character panel', layout.character, 'minimap', layout.minimap],
            ['entity info', layout.entityInfo, 'minimap', layout.minimap],
        ];
        for (const [aLabel, a, bLabel, b] of intersections) {
            assert.equal(
                getRectIntersectionArea(a, b),
                0,
                `${aLabel} does not intersect ${bLabel}`,
            );
        }

        assert.equal(layout.minimap.compact, true);
        assert.ok(layout.minimap.mapSize <= layout.minimap.w - 24);
        assert.equal(layout.character.w + layout.minimap.w + 24, viewport.width);
    });
}

test('desktop field HUD retains its established panel geometry', () => {
    const width = 1280;
    const banner = asHudRect(getRaidBannerLayout(width, {
        hasBounty: true,
        hasModifier: true,
    }));
    const layout = getFieldHudLayout(width, banner);

    assert.equal(layout.compact, false);
    assert.equal(layout.showTitle, true);
    assert.deepEqual(layout.character, { x: 16, y: 56, w: 232, h: 116 });
    assert.deepEqual(layout.entityInfo, { x: 16, y: 196, w: 210, h: 320 });
    assert.deepEqual(layout.minimap, {
        x: 1048,
        y: 16,
        w: 216,
        h: 274,
        mapSize: 168,
        compact: false,
    });
});
