import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatFormulas } from '../../src/combat/CombatFormulas';
import {
    applyGuardToDamage,
    applyStatusToCarrier,
    applyStatus,
    advanceTimedStatuses,
    cleanseNegativeStatuses,
    consumeStatus,
    createStatus,
    getEffectiveStats,
    hasStatus,
    removeRestStatusesFromCarrier,
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

test('raid-start timed statuses only expire through second-based advancement', () => {
    const statuses = [
        createStatus('attackUp', { durationTurns: 2 }),
        createStatus('speedUp', {
            activation: 'on_raid_start',
            durationSeconds: 300,
            remainingSeconds: 300,
            sourceType: 'rest',
        }),
        createStatus('maxHpUp', { sourceType: 'rest' }),
    ];

    const turnResult = resolveTurnStartStatuses(createBaseStats(), statuses);
    assert.deepEqual(turnResult.statuses.map((status) => [status.kind, status.durationTurns, status.remainingSeconds]), [
        ['attackUp', 1, undefined],
        ['speedUp', undefined, 300],
        ['maxHpUp', undefined, undefined],
    ]);

    const ticking = advanceTimedStatuses(turnResult.statuses, 120);
    assert.equal(ticking.find((status) => status.kind === 'speedUp')?.remainingSeconds, 180);

    const expired = advanceTimedStatuses(ticking, 200);
    assert.equal(hasStatus(expired, 'speedUp'), false);
    assert.equal(hasStatus(expired, 'maxHpUp'), true);
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

test('maxHpUp and maxMpUp adjust current resources on apply and clamp on removal', () => {
    const carrier = { stats: createBaseStats({ hp: 50, maxHp: 100, mp: 20, maxMp: 50 }) };

    applyStatusToCarrier(carrier, createStatus('maxHpUp', { sourceType: 'rest', magnitude: 1.1 }));
    applyStatusToCarrier(carrier, createStatus('maxMpUp', { sourceType: 'rest', magnitude: 1.2 }));

    assert.equal(getEffectiveStats(carrier.stats, carrier.statuses).maxHp, 110);
    assert.equal(carrier.stats.hp, 55);
    assert.equal(getEffectiveStats(carrier.stats, carrier.statuses).maxMp, 60);
    assert.equal(carrier.stats.mp, 24);

    carrier.stats.hp = 110;
    carrier.stats.mp = 60;
    removeRestStatusesFromCarrier(carrier);

    assert.equal(getEffectiveStats(carrier.stats, carrier.statuses).maxHp, 100);
    assert.equal(carrier.stats.hp, 100);
    assert.equal(getEffectiveStats(carrier.stats, carrier.statuses).maxMp, 50);
    assert.equal(carrier.stats.mp, 50);
});

test('replacing a rest menu removes an existing immediate rest effect', () => {
    const carrier = { stats: createBaseStats({ hp: 100, maxHp: 100, critRate: 0 }) };

    applyStatusToCarrier(carrier, createStatus('maxHpUp', {
        sourceType: 'rest',
        sourceRestMenuId: 'hearty_breakfast',
        magnitude: 1.1,
    }));
    assert.equal(getEffectiveStats(carrier.stats, carrier.statuses).maxHp, 110);

    removeRestStatusesFromCarrier(carrier);
    applyStatusToCarrier(carrier, createStatus('critUp', {
        sourceType: 'rest',
        sourceRestMenuId: 'smoked_venison',
        magnitude: 10,
    }));

    const effective = getEffectiveStats(carrier.stats, carrier.statuses);
    assert.equal(hasStatus(carrier.statuses, 'maxHpUp'), false);
    assert.equal(effective.maxHp, 100);
    assert.equal(effective.critRate, 10);
});

test('injury applies once and lowers max HP by ten percent', () => {
    const carrier = { stats: createBaseStats({ hp: 100, maxHp: 100 }) };

    applyStatusToCarrier(carrier, createStatus('injury', { magnitude: 0.9, sourceType: 'injury' }));
    applyStatusToCarrier(carrier, createStatus('injury', { magnitude: 0.9, sourceType: 'injury' }));

    assert.equal(carrier.statuses?.filter((status) => status.kind === 'injury').length, 1);
    assert.equal(getEffectiveStats(carrier.stats, carrier.statuses).maxHp, 90);
    assert.equal(carrier.stats.hp, 90);
});

test('rest combat modifiers affect effective stats and incoming damage', () => {
    const stats = createBaseStats({ critRate: 5, evasion: 10, hitRate: 80 });
    const effective = getEffectiveStats(stats, [
        createStatus('critUp', { magnitude: 10, sourceType: 'rest' }),
        createStatus('evasionUp', { magnitude: 10, sourceType: 'rest' }),
        createStatus('hitDown', { magnitude: 5, sourceType: 'rest' }),
    ]);

    assert.equal(effective.critRate, 15);
    assert.equal(effective.evasion, 20);
    assert.equal(effective.hitRate, 75);

    const reduced = applyGuardToDamage([createStatus('damageTakenDown', { magnitude: 0.9, sourceType: 'rest' })], 100);
    assert.equal(reduced.guarded, false);
    assert.equal(reduced.damage, 90);
});

test('guard consumes once and halves incoming damage', () => {
    const result = applyGuardToDamage([createStatus('guard')], 21);

    assert.equal(result.guarded, true);
    assert.equal(result.damage, 10);
    assert.equal(hasStatus(result.statuses, 'guard'), false);

    const second = applyGuardToDamage(result.statuses, 21);
    assert.equal(second.guarded, false);
    assert.equal(second.damage, 21);

    const zero = applyGuardToDamage([createStatus('damageTakenDown')], 0);
    assert.equal(zero.damage, 0);
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
