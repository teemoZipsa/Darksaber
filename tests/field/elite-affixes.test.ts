import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import {
    applyEliteAffixStats,
    applyExecutionerDamage,
    getVampiricHealing,
    normalizeEliteAffixes,
    rollEliteAffixes,
} from '../../src/field/EliteAffixes';

test('elite affix rolls are deterministic, unique, and avoid stacked speed affixes', () => {
    const first = rollEliteAffixes('contract:alpha');
    const repeat = rollEliteAffixes('contract:alpha');
    assert.deepEqual(repeat, first);
    assert.equal(first.length, 2);
    assert.equal(new Set(first).size, 2);
    assert.equal(first.includes('berserker') && first.includes('swift'), false);
});

test('elite affix normalization rejects unknown, duplicate, and incompatible values', () => {
    assert.deepEqual(
        normalizeEliteAffixes(['ironclad', 'ironclad', 'unknown', 'vampiric']),
        ['ironclad', 'vampiric'],
    );
    assert.deepEqual(normalizeEliteAffixes(['swift', 'berserker']), ['swift']);
    assert.deepEqual(normalizeEliteAffixes(null), []);
});

test('elite stat affixes and berserker threshold use exact boundaries', () => {
    const healthy = createBaseStats({
        hp: 51,
        maxHp: 100,
        atk: 20,
        magAtk: 10,
        def: 10,
        magDef: 20,
        spd: 10,
        mov: 3,
    });
    const ironSwift = applyEliteAffixStats(healthy, ['ironclad', 'swift']);
    assert.equal(ironSwift.def, 13);
    assert.equal(ironSwift.magDef, 26);
    assert.equal(ironSwift.spd, 12);
    assert.equal(ironSwift.mov, 4);

    assert.equal(applyEliteAffixStats(healthy, ['berserker']).atk, 20);
    assert.equal(applyEliteAffixStats({ ...healthy, hp: 50 }, ['berserker']).atk, 26);
});

test('executioner and vampiric calculations use guarded damage and cap healing', () => {
    assert.equal(applyExecutionerDamage(100, ['executioner'], 36, 100), 100);
    assert.equal(applyExecutionerDamage(100, ['executioner'], 35, 100), 135);
    assert.equal(getVampiricHealing(40, ['vampiric'], 50, 100), 10);
    assert.equal(getVampiricHealing(40, ['vampiric'], 98, 100), 2);
    assert.equal(getVampiricHealing(40, ['ironclad'], 50, 100), 0);
    assert.equal(getVampiricHealing(0, ['vampiric'], 50, 100), 0);
});
