import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatFormulas } from '../../src/combat/CombatFormulas';
import {
    applyGuardToDamage,
    applyStatus,
    cleanseNegativeStatuses,
    consumeStatus,
    createStatus,
    getEffectiveStats,
    hasStatus,
    resolveTurnStartStatuses,
} from '../../src/combat/StatusEffects';
import { advanceAtb } from '../../src/field/FieldCombat';
import { createBaseStats } from '../../src/data/Stats';
import { TileType } from '../../src/map/Tile';

test('status application refreshes duration and keeps the stronger magnitude', () => {
    let statuses = [createStatus('attackDown', { durationTurns: 2, magnitude: 0.8 })];
    statuses = applyStatus(statuses, createStatus('attackDown', { durationTurns: 4, magnitude: 0.7 }));

    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].durationTurns, 4);
    assert.equal(statuses[0].magnitude, 0.7);
});

test('turn start resolves poison, regen, duration, and reaction stance expiry', () => {
    const stats = createBaseStats({ hp: 50, maxHp: 100 });
    const result = resolveTurnStartStatuses(stats, [
        createStatus('guard'),
        createStatus('counterReady'),
        createStatus('poison', { durationTurns: 2 }),
        createStatus('regen', { durationTurns: 2 }),
    ]);

    assert.equal(result.poisonDamage, 8);
    assert.equal(result.regenHealing, 10);
    assert.equal(result.hpDelta, 2);
    assert.equal(result.expiredReaction, true);
    assert.deepEqual(result.statuses.map((status) => [status.kind, status.durationTurns]), [
        ['poison', 1],
        ['regen', 1],
    ]);
});

test('cleanse removes negative statuses and keeps positive statuses', () => {
    const statuses = cleanseNegativeStatuses([
        createStatus('poison'),
        createStatus('slow'),
        createStatus('regen'),
        createStatus('defenseUp'),
    ]);

    assert.deepEqual(statuses.map((status) => status.kind), ['regen', 'defenseUp']);
});

test('effective stats apply status modifiers through one helper', () => {
    const stats = createBaseStats({ atk: 20, def: 10, magDef: 8, spd: 10, mov: 4, hitRate: 90 });
    const effective = getEffectiveStats(stats, [
        createStatus('slow'),
        createStatus('blind'),
        createStatus('attackDown'),
        createStatus('defenseDown'),
        createStatus('resistDown'),
        createStatus('immobilize'),
    ]);

    assert.equal(effective.atk, 14);
    assert.equal(effective.def, 7);
    assert.equal(effective.magDef, 4);
    assert.equal(effective.spd, 6);
    assert.equal(effective.mov, 0);
    assert.equal(effective.hitRate, 62);
});

test('guard consumes once and halves incoming damage', () => {
    const result = applyGuardToDamage([createStatus('guard')], 21);

    assert.equal(result.guarded, true);
    assert.equal(result.damage, 10);
    assert.equal(hasStatus(result.statuses, 'guard'), false);

    const second = applyGuardToDamage(result.statuses, 21);
    assert.equal(second.guarded, false);
    assert.equal(second.damage, 21);
});

test('counter readiness is explicit and consumed without automatic wait interaction', () => {
    const waitOnly = [createStatus('regen')];
    assert.equal(consumeStatus(waitOnly, 'counterReady').consumed, undefined);

    const ready = consumeStatus([createStatus('counterReady')], 'counterReady');
    assert.equal(ready.consumed?.magnitude, 0.75);
    assert.equal(hasStatus(ready.statuses, 'counterReady'), false);
});

test('slow changes ATB charge speed through effective stats', () => {
    const stats = createBaseStats({ spd: 10 });
    const normal = advanceAtb(0, getEffectiveStats(stats).spd, 1, 10);
    const slowed = advanceAtb(0, getEffectiveStats(stats, [createStatus('slow')]).spd, 1, 10);

    assert.equal(normal, 100);
    assert.equal(slowed, 60);
});

test('blind and defenseDown feed combat formulas through effective stats', () => {
    const attacker = createBaseStats({ atk: 30, hitRate: 100, critRate: 0, spd: 1 });
    const defender = createBaseStats({ def: 10, spd: 0 });
    const originalRandom = Math.random;
    try {
        Math.random = () => 0.9;
        const blindMiss = CombatFormulas.calcPhysicalDamage(
            getEffectiveStats(attacker, [createStatus('blind')]),
            defender,
            TileType.GRASS
        );
        assert.equal(blindMiss.isMiss, true);

        Math.random = () => 0;
        const normal = CombatFormulas.calcPhysicalDamage(attacker, defender, TileType.GRASS);
        const weakened = CombatFormulas.calcPhysicalDamage(
            attacker,
            getEffectiveStats(defender, [createStatus('defenseDown')]),
            TileType.GRASS
        );
        assert.ok(weakened.damage > normal.damage);
    } finally {
        Math.random = originalRandom;
    }
});
