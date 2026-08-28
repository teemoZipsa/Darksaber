import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerData } from '../../src/data/PlayerData';
import { MONSTER_IDS } from '../../src/data/MonsterCatalog';
import type { GameManager } from '../../src/engine/GameManager';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    getMonsterCodexProgress,
    normalizeMonsterCodex,
    recordMonsterDefeat,
    recordMonsterEncounter,
} from '../../src/raid/MonsterCodex';
import { MonsterCodex } from '../../src/ui/react/quest/MonsterCodexPanel';
import { UiStore } from '../../src/ui/react/UiStore';

test('monster codex normalizes known unique entries without trusting malformed counters', () => {
    const normalized = normalizeMonsterCodex([
        {
            monsterId: '302R',
            encounters: 2,
            kills: 1,
            highestDefeatedLevel: 3,
            firstEncounteredAt: 100,
            lastEncounteredAt: 200,
            lastDefeatedAt: 180,
        },
        {
            monsterId: '302R',
            encounters: 1,
            kills: 999_999_999,
            highestDefeatedLevel: 999_999_999,
            firstEncounteredAt: 150,
            lastEncounteredAt: Number.MAX_VALUE,
        },
        { monsterId: 'not-a-monster', encounters: 4, kills: 4 },
        { monsterId: '303R', encounters: 0, kills: 0 },
        null,
    ]);

    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]?.monsterId, '302R');
    assert.equal(normalized[0]?.encounters, 999_999);
    assert.equal(normalized[0]?.kills, 999_999);
    assert.equal(normalized[0]?.highestDefeatedLevel, 99);
    assert.equal(normalized[0]?.firstEncounteredAt, 100);
    assert.equal(normalized[0]?.lastEncounteredAt, 8_639_999_999_999_999);
});

test('monster codex records encounter and defeat progression in catalog order', () => {
    let entries = recordMonsterEncounter([], { monsterId: '304R', level: 2, timestamp: 100 });
    entries = recordMonsterEncounter(entries, { monsterId: '302R', level: 3, timestamp: 200 });
    entries = recordMonsterDefeat(entries, { monsterId: '304R', level: 5, timestamp: 300 });

    assert.deepEqual(entries.map((entry) => entry.monsterId), ['302R', '304R']);
    const ratman = entries.find((entry) => entry.monsterId === '304R');
    assert.equal(ratman?.encounters, 1);
    assert.equal(ratman?.kills, 1);
    assert.equal(ratman?.highestDefeatedLevel, 5);
    assert.equal(ratman?.lastDefeatedAt, 300);
    assert.deepEqual(getMonsterCodexProgress(entries), {
        encountered: 2,
        defeated: 1,
        total: MONSTER_IDS.length,
    });
});

test('PlayerData deduplicates enemy instances and round-trips character-scoped codex progress', () => {
    const player = new PlayerData();
    player.beginMonsterCodexRaid();
    assert.equal(player.recordMonsterEncounter('302R', 2, 'enemy-a', 100), true);
    assert.equal(player.recordMonsterEncounter('302R', 2, 'enemy-a', 110), false);
    assert.equal(player.recordMonsterDefeat('302R', 4, 'enemy-a', 120), true);
    assert.equal(player.recordMonsterDefeat('302R', 4, 'enemy-a', 130), false);

    const save = player.toCharacterSave('2026-08-28T00:00:00.000Z', 5);
    const restored = new PlayerData();
    restored.applyCharacterSave(save);

    assert.deepEqual(restored.monsterCodex, player.monsterCodex);
    assert.equal(restored.monsterCodex[0]?.encounters, 1);
    assert.equal(restored.monsterCodex[0]?.kills, 1);
});

test('UiStore quest signature changes when live codex progress changes', () => {
    const playerData = new PlayerData();
    const raidSession = new WorldRaidSession('central_castle');
    const store = new UiStore({
        playerData,
        getRaidSession: () => raidSession,
    } as unknown as GameManager);
    const questSignature = () => (
        store as unknown as { questSignature(): string }
    ).questSignature();
    const before = questSignature();

    playerData.recordMonsterEncounter('302R', 2, 'enemy-live', 100);

    assert.notEqual(questSignature(), before);
});

test('monster codex renders locked, encountered, and defeated states in both languages', () => {
    const previousLanguage = i18n.lang;
    const encountered = recordMonsterEncounter([], { monsterId: '302R', level: 2, timestamp: 100 });
    const defeated = recordMonsterDefeat(encountered, { monsterId: '302R', level: 3, timestamp: 200 });
    try {
        i18n.setLanguage('ko');
        const encounteredKo = renderToStaticMarkup(createElement(MonsterCodex, { entries: encountered }));
        assert.match(encounteredKo, /스켈레톤 궁수/);
        assert.match(encounteredKo, /조우 완료/);
        assert.match(encounteredKo, /전투 분석 미해금/);
        assert.match(encounteredKo, /미발견/);

        const defeatedKo = renderToStaticMarkup(createElement(MonsterCodex, { entries: defeated }));
        assert.match(defeatedKo, /토벌 완료/);
        assert.match(defeatedKo, /최고 토벌 레벨 3/);
        assert.match(defeatedKo, /ATK/);

        i18n.setLanguage('en');
        const defeatedEn = renderToStaticMarkup(createElement(MonsterCodex, { entries: defeated }));
        assert.match(defeatedEn, /Skeleton Archer/);
        assert.match(defeatedEn, /Defeated/);
        assert.match(defeatedEn, /Highest defeated level 3/);
    } finally {
        i18n.setLanguage(previousLanguage);
    }
});
