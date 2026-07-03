import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatFormulas } from '../../src/combat/CombatFormulas';
import { Enemy } from '../../src/entity/Enemy';
import { getExpToNext } from '../../src/data/original/originalProgression';

test('equal-level kills award enough exp for roughly five tier-1 level-ups', () => {
    const expPerKill = CombatFormulas.calcExpGain(1, 1);
    const tierOneRequirement = getExpToNext('infantry', 1, 1);

    assert.equal(expPerKill, 50);
    assert.ok(tierOneRequirement >= 200);
    assert.ok(Math.ceil(tierOneRequirement / expPerKill) <= 6);
});

test('enemy exp reward scales with the defeating character level', () => {
    const enemy = new Enemy('e1', 0, 0, 'Rat', 2);

    assert.equal(enemy.calcExpFor(1), 60);
    assert.equal(enemy.calcExpFor(2), 50);
    assert.equal(enemy.calcExpFor(4), 30);
});
