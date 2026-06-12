import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRaidTime, getCombatLogColor, getEnemyRoleLabel, getTacticalMarkerColor } from '../../src/field/FieldDisplay';
import { describeTerrainForHover } from '../../src/field/TerrainRules';
import { i18n, type Language } from '../../src/i18n/LanguageManager';
import { TileType } from '../../src/map/Tile';
import type { TacticalMarker } from '../../src/field/TacticalMarkers';

test('field display formats raid time as floored mm:ss', () => {
    assert.equal(formatRaidTime(0), '00:00');
    assert.equal(formatRaidTime(65.9), '01:05');
    assert.equal(formatRaidTime(-12), '00:00');
});

test('field display maps enemy roles and log colors', () => {
    const previousLang: Language = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.equal(getEnemyRoleLabel('boss'), '보스 몬스터');
        assert.equal(getEnemyRoleLabel('bruiser'), '근접형 몬스터');
        assert.equal(getCombatLogColor('고블린 처치!'), '#ffd15f');
        assert.equal(getCombatLogColor('명중 실패'), '#d9d9e8');
        assert.equal(getCombatLogColor('대기'), 'rgba(255,255,255,0.78)');

        i18n.lang = 'en';
        assert.equal(getEnemyRoleLabel('boss'), 'Boss monster');
        assert.equal(getEnemyRoleLabel('bruiser'), 'Melee monster');
        assert.equal(getCombatLogColor('Goblin defeated'), '#ffd15f');
        assert.equal(getCombatLogColor('Goblin missed'), '#d9d9e8');
        assert.equal(getCombatLogColor('waiting'), 'rgba(255,255,255,0.78)');
    } finally {
        i18n.lang = previousLang;
    }
});

test('field display colors tactical markers by target priority', () => {
    const marker: TacticalMarker = {
        id: 'm1',
        kind: 'watch',
        tile: { x: 1, y: 2 },
        ttl: 10,
        targetKind: 'enemy',
        targetKey: 'enemy:e1',
    };

    assert.equal(getTacticalMarkerColor(marker), 'rgba(255, 78, 78, 0.95)');
    assert.equal(getTacticalMarkerColor({ ...marker, kind: 'rally', targetKind: 'ground' }), 'rgba(80, 255, 160, 0.95)');
});

test('terrain hover labels follow the active language', () => {
    const previousLang: Language = i18n.lang;
    try {
        i18n.lang = 'ko';
        const grassKo = describeTerrainForHover(TileType.GRASS).join(' ');
        assert.match(grassKo, /초원/);
        assert.doesNotMatch(grassKo, /Grass/);

        const forestKo = describeTerrainForHover(TileType.FOREST).join(' ');
        assert.match(forestKo, /마법 불꽃 \+20% 바람 \+10% 땅 \+10%/);
        assert.doesNotMatch(forestKo, /fire|wind|earth/);

        i18n.lang = 'en';
        const forestEn = describeTerrainForHover(TileType.FOREST).join(' ');
        assert.match(forestEn, /Forest/);
        assert.match(forestEn, /Magic Fir \+20% Wnd \+10% Ear \+10%/);
    } finally {
        i18n.lang = previousLang;
    }
});
