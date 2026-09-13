import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ITEMS } from '../../src/data/ItemDB';
import { ITEM_ICON_SHEETS } from '../../src/data/ItemArtwork';
import { ORIGINAL_SHOP_ITEMS } from '../../src/data/OriginalShopItems';
import { ORIGINAL_LATE_STORY_REWARD_ITEMS } from '../../src/data/OriginalLateStoryItems';
import { ItemGlyph } from '../../src/ui/react/town/itemView';

test('every item resolves to a visible, in-bounds sprite instead of an emoji', async () => {
    const sheets = new Map(await Promise.all(Object.entries(ITEM_ICON_SHEETS).map(async ([name, path]) => {
        const raw = await sharp(resolve('public', path.slice(1))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        return [name, raw] as const;
    })));
    for (const item of ITEMS) {
        const sprite = item.iconSprite;
        assert.ok(sprite, `Missing artwork: ${item.id}`);
        const sheet = sheets.get(sprite.sheet ?? 'items');
        assert.ok(sheet);
        assert.ok(Number.isInteger(sprite.col) && Number.isInteger(sprite.row));
        assert.ok(sprite.col >= 0 && (sprite.col + 1) * 32 <= sheet.info.width, item.id);
        assert.ok(sprite.row >= 0 && (sprite.row + 1) * 32 <= sheet.info.height, item.id);
        let opaque = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
            const p = ((sprite.row * 32 + y) * sheet.info.width + sprite.col * 32 + x) * 4;
            if (sheet.data[p + 3]) opaque++;
            if (sprite.sheet === 'supplementalItems') {
                const alpha: number = sheet.data[p + 3];
                assert.ok(alpha === 0 || alpha === 255, `${item.id}: soft alpha`);
                assert.ok(!(alpha && sheet.data[p] > 150 && sheet.data[p + 2] > 150 && sheet.data[p + 1] < 80), `${item.id}: magenta export key leaked`);
                if (x < 3 || x >= 29 || y < 3 || y >= 29) assert.equal(alpha, 0, `${item.id}: missing clear margin`);
            }
        }
        assert.ok(opaque > 12 && opaque < 1000, `${item.id}: empty or opaque background (${opaque})`);
        const html = renderToStaticMarkup(createElement(ItemGlyph, { item }));
        assert.match(html, /is-sprite/);
        assert.doesNotMatch(html, /is-emoji/);
        assert.ok(html.includes(ITEM_ICON_SHEETS[sprite.sheet ?? 'items']), item.id);
    }
});

test('existing original shop and scenario sprite coordinates stay authoritative', () => {
    for (const original of [...ORIGINAL_SHOP_ITEMS, ...ORIGINAL_LATE_STORY_REWARD_ITEMS]) {
        const item = ITEMS.find((entry) => entry.id === original.id);
        assert.ok(item);
        assert.deepEqual(item.iconSprite, original.iconSprite, original.id);
    }
});

test('all thirteen supplemental cells contain distinct object artwork', async () => {
    const atlas = resolve('public/assets/images/items/supplemental_items.png');
    const hashes = new Set<string>();
    for (let col = 0; col < 13; col++) {
        const pixels = await sharp(atlas).extract({ left: col * 32, top: 0, width: 32, height: 32 }).raw().toBuffer();
        hashes.add(createHash('sha256').update(pixels).digest('hex'));
    }
    assert.equal(hashes.size, 13);
});
