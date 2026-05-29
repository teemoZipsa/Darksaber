import test from 'node:test';
import assert from 'node:assert/strict';
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

    assert.deepEqual(getEntityInfoHeaderLines(info), {
        title: '스켈레톤 궁수',
        subtitle: '원거리형 몬스터 · 레벨 2',
    });
});
