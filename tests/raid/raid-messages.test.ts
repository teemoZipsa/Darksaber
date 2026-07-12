import test from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../../src/i18n/LanguageManager';
import { formatTownName } from '../../src/i18n/TownMessages';
import { formatRaidBannerSubtitle } from '../../src/raid/RaidModifierMessages';

test('raid route messages localize town IDs in Korean and English', () => {
    const previousLanguage = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.equal(formatTownName('central_castle'), '카오시아');
        assert.equal(
            formatRaidBannerSubtitle('central_castle', { id: 'night_raid' }),
            '야간 출격  |  카오시아  →  다른 마을 생환',
        );

        i18n.lang = 'en';
        assert.equal(formatTownName('central_castle'), 'Kaosia');
        assert.equal(
            formatRaidBannerSubtitle('central_castle'),
            'Kaosia  →  extract to another town',
        );
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('unknown town IDs remain visible for diagnostics', () => {
    assert.equal(formatTownName('unknown_town'), 'unknown_town');
});
