import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerData } from '../../src/data/PlayerData';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    RAID_HISTORY_LIMIT,
    createRaidHistoryEntry,
    normalizeRaidHistory,
} from '../../src/raid/RaidHistory';
import { RaidHistoryEntries } from '../../src/ui/react/quest/RaidHistoryList';

function entry(index: number) {
    return createRaidHistoryEntry({
        id: `raid-${index}`,
        completedAt: index * 1_000,
        result: index % 2 === 0 ? 'SURVIVED' : 'DEAD',
        elapsedSeconds: 60 + index,
        kills: index,
        departureTownId: 'central_castle',
        extractionTownId: 'w_forest_village',
        securedItems: index + 1,
        lostItems: index % 3,
        equipmentLost: index % 2,
        goldReward: index * 10,
    });
}

test('raid history keeps the newest 20 valid unique entries', () => {
    const source = Array.from({ length: RAID_HISTORY_LIMIT + 5 }, (_, index) => entry(index));
    const normalized = normalizeRaidHistory([
        ...source,
        { ...entry(24), kills: 999 },
        { id: '', result: 'SURVIVED' },
        null,
    ]);

    assert.equal(normalized.length, RAID_HISTORY_LIMIT);
    assert.equal(normalized[0]?.id, 'raid-24');
    assert.equal(normalized[0]?.kills, 24);
    assert.equal(normalized[normalized.length - 1]?.id, 'raid-5');
    assert.equal(new Set(normalized.map((item) => item.id)).size, RAID_HISTORY_LIMIT);
});

test('PlayerData round-trips character-scoped raid history through CharacterSave', () => {
    const player = new PlayerData();
    player.addRaidHistoryEntry(entry(1));
    player.addRaidHistoryEntry(entry(2));

    const save = player.toCharacterSave('2026-08-28T00:00:00.000Z', 4);
    assert.deepEqual(
        (save.questState.raidHistory as Array<{ id: string }>).map((item) => item.id),
        ['raid-2', 'raid-1'],
    );

    const restored = new PlayerData();
    restored.applyCharacterSave(save);
    assert.deepEqual(restored.raidHistory, player.raidHistory);
});

test('raid history list renders localized result, route, and stats', () => {
    const previousLanguage = i18n.lang;
    try {
        i18n.setLanguage('ko');
        const ko = renderToStaticMarkup(createElement(RaidHistoryEntries, { entries: [entry(2)] }));
        assert.match(ko, /생환/);
        assert.match(ko, /카오시아/);
        assert.match(ko, /벨퓌어스/);
        assert.match(ko, /장비 손실/);

        i18n.setLanguage('en');
        const en = renderToStaticMarkup(createElement(RaidHistoryEntries, { entries: [entry(2)] }));
        assert.match(en, /Extracted/);
        assert.match(en, /Kaosia/);
        assert.match(en, /Belfuers/);
        assert.match(en, /Gear Lost/);
    } finally {
        i18n.setLanguage(previousLanguage);
    }
});
