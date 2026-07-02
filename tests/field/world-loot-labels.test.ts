import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemDef } from '../../src/data/ItemDB';
import { LootObject } from '../../src/entity/LootObject';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    getDefaultLootSourceLabel,
    getEnemyLootSourceLabel,
    getWorldLootSourceLabel,
} from '../../src/loot/LootLabels';

test('loot source labels are localized at creation time', () => {
    const previousLang = i18n.lang;
    try {
        i18n.lang = 'en';
        assert.equal(getDefaultLootSourceLabel(), 'Loot');
        assert.equal(getWorldLootSourceLabel('supply_cache'), 'Abandoned supply cache');
        assert.equal(getWorldLootSourceLabel('traveler_pack'), 'Fallen traveler pack');
        assert.equal(getWorldLootSourceLabel('regional_goods_crate'), 'Regional goods crate');
        assert.equal(getWorldLootSourceLabel('sealed_reliquary'), 'Sealed reliquary');
        assert.equal(getWorldLootSourceLabel('marked_cache'), 'Marked cache');
        assert.equal(getEnemyLootSourceLabel('Ash Guard'), 'Ash Guard loot');

        const loot = new LootObject('loot-test', 0, 0, [getItemDef('herb_cheap')!]);
        assert.equal(loot.sourceLabel, 'Loot');
    } finally {
        i18n.lang = previousLang;
    }
});
