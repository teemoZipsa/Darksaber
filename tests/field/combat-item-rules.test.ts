import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatus } from '../../src/combat/StatusEffects';
import { getItemDef } from '../../src/data/ItemDB';
import { createBaseStats } from '../../src/data/Stats';
import { getActionApCost } from '../../src/field/FieldActionEconomy';
import {
    previewCombatItemRecovery,
    previewCombatItemUse,
} from '../../src/field/FieldCombatItemRules';

test('combat item preview clamps recovery to effective resource caps', () => {
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);

    const preview = previewCombatItemUse({
        item: herb,
        carrier: {
            stats: createBaseStats({ hp: 80, maxHp: 100, mp: 10, maxMp: 30 }),
            statuses: [],
        },
        remainingAp: getActionApCost('tool'),
    });

    assert.equal(preview.ok, true);
    assert.equal(preview.effectiveHp, 20);
    assert.equal(preview.effectiveMp, 0);
    assert.equal(preview.nextHp, 100);
    assert.equal(preview.nextMp, 10);
});

test('combat item preview uses status-adjusted resource caps', () => {
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);

    const preview = previewCombatItemRecovery(herb, {
        stats: createBaseStats({ hp: 100, maxHp: 100, mp: 10, maxMp: 30 }),
        statuses: [createStatus('maxHpUp', { magnitude: 1.5 })],
    });

    assert.equal(preview.ok, true);
    assert.equal(preview.effectiveMaxHp, 150);
    assert.equal(preview.effectiveHp, 50);
    assert.equal(preview.nextHp, 150);
});

test('combat item use rejects invalid, unaffordable, and no-effect items', () => {
    const herb = getItemDef('herb_cheap');
    const repairKit = getItemDef('repair_kit');
    assert.ok(herb);
    assert.ok(repairKit);

    const wounded = {
        stats: createBaseStats({ hp: 20, maxHp: 100, mp: 10, maxMp: 30 }),
        statuses: [],
    };
    const full = {
        stats: createBaseStats({ hp: 100, maxHp: 100, mp: 30, maxMp: 30 }),
        statuses: [],
    };

    const invalid = previewCombatItemUse({ item: repairKit, carrier: wounded, remainingAp: getActionApCost('tool') });
    const noAction = previewCombatItemUse({ item: herb, carrier: wounded, remainingAp: getActionApCost('tool') - 1 });
    const noEffect = previewCombatItemUse({ item: herb, carrier: full, remainingAp: getActionApCost('tool') });

    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, 'notCombatRecovery');
    assert.equal(noAction.ok, false);
    assert.equal(noAction.reason, 'noAction');
    assert.equal(noEffect.ok, false);
    assert.equal(noEffect.reason, 'noEffect');
});
