import test from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../../src/i18n/LanguageManager';
import { getEntityInfoHeaderLines, type EntityDisplayInfo } from '../../src/ui/EntityInfoUI';

test('entity info header uses monster name instead of role label', () => {
    const info: EntityDisplayInfo = {
        name: '스켈레톤 궁수',
        className: '원거리형 몬스터',
        level: 2,
        hp: 30,
        maxHp: 30,
        mp: 0,
        maxMp: 0,
        actionGauge: 50,
        atk: 5,
        def: 2,
        magAtk: 1,
        magDef: 1,
        spriteColor: '#d4c4cc',
    };

    const previousLang = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.deepEqual(getEntityInfoHeaderLines(info), {
            title: '스켈레톤 궁수',
            subtitle: '원거리형 몬스터 · 레벨 2',
        });

        i18n.lang = 'en';
        assert.deepEqual(getEntityInfoHeaderLines({ ...info, className: 'Ranged monster' }), {
            title: '스켈레톤 궁수',
            subtitle: 'Ranged monster · Level 2',
        });
    } finally {
        i18n.lang = previousLang;
    }
});
