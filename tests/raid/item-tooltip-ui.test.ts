import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getItemDef } from '../../src/data/ItemDB';
import type { PlacedItem } from '../../src/inventory/GridInventory';
import { t } from '../../src/i18n/LanguageManager';
import { ItemTooltip } from '../../src/ui/react/town/itemView';

test('item tooltip renders visual header and structured metadata', () => {
    const item = getItemDef('short_sword');
    assert.ok(item);

    const placed: PlacedItem = {
        item,
        gridX: 0,
        gridY: 0,
        durability: item.maxDurability,
        quantity: 1,
        sockets: [],
    };
    const html = renderToStaticMarkup(createElement(ItemTooltip, { item, placed }));

    assert.match(html, /ds-tooltip__head/);
    assert.match(html, /ds-tooltip__glyph/);
    assert.match(html, /ds-tooltip__rarity/);
    assert.match(html, /ds-tooltip__metaitem/);
    assert.ok(html.includes(`${t('tooltip.size')} ${item.gridW}x${item.gridH}`));
    assert.ok(html.includes(`${t('tooltip.weight')} ${item.weight}`));
    assert.ok(html.includes(`${t('tooltip.value')} ${item.baseValue} G`));
    assert.ok(html.includes(t(`rarity.${item.rarity}`)));
});
