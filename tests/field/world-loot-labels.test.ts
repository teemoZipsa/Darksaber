import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getItemDef } from '../../src/data/ItemDB';
import { LOOT_CHEST_SPRITE_SRC, LootObject } from '../../src/entity/LootObject';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    getDefaultLootSourceLabel,
    getEnemyLootSourceLabel,
    getLootSourceLabelForDisplay,
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

test('field loot chest uses a shipped pixel-art sprite', () => {
    assert.equal(LOOT_CHEST_SPRITE_SRC, '/assets/images/decor/loot_chest.png');
    assert.equal(existsSync(`public${LOOT_CHEST_SPRITE_SRC}`), true);
});

test('network loot titles prefer the localized container name over internal ids', () => {
    const previousLang = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.equal(getLootSourceLabelForDisplay({
            sourceLabel: 'loot_supply_cache_8',
            containerType: 'supply_cache',
        }), '버려진 보급 상자');

        i18n.lang = 'en';
        assert.equal(getLootSourceLabelForDisplay({
            sourceLabel: 'loot_supply_cache_8',
            containerType: 'supply_cache',
        }), 'Abandoned supply cache');
        assert.equal(getLootSourceLabelForDisplay({
            sourceLabel: '스켈레톤 궁수 전리품',
        }), 'Skeleton Archer loot');
        assert.equal(getLootSourceLabelForDisplay({
            sourceLabel: '가노마스 전리품',
        }), 'Ganomas loot');
        assert.equal(getLootSourceLabelForDisplay({
            sourceLabel: '버려진 보급 상자',
        }), 'Abandoned supply cache');
        assert.equal(getLootSourceLabelForDisplay({
            sourceLabel: '봉인된 유물함',
        }), 'Sealed reliquary');
        assert.equal(getLootSourceLabelForDisplay({ sourceLabel: '전리품' }), 'Loot');
    } finally {
        i18n.lang = previousLang;
    }
});
