import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { ALL_CLASS_LINES } from '../../src/data/ClassTree';
import { getSkill } from '../../src/data/SkillDB';
import { resolveSkillEffect, type SkillEffectEnemyInput } from '../../src/combat/SkillEffectResolver';
import {
    MAGIC_LOADOUT_SIZE,
    checkUpgrade,
    getDefaultLoadout,
    getEffectiveSkill,
    getOrderedLearnedSkills,
    getUpgradeCost,
    normalizeLoadout,
    normalizeUpgradeLevels,
} from '../../src/magic/MagicLoadout';

const INFANTRY_T1 = { classLineId: 'infantry', currentTier: 1 };
const INFANTRY_T5 = { classLineId: 'infantry', currentTier: 5 };

function requireSkill(id: string) {
    const skill = getSkill(id);
    assert.ok(skill, `missing skill ${id}`);
    return skill;
}

function withFixedRandom<T>(value: number, fn: () => T): T {
    const prev = Math.random;
    Math.random = () => value;
    try { return fn(); } finally { Math.random = prev; }
}

test('a fresh loadout auto-equips the first learned skills in order', () => {
    const ordered = getOrderedLearnedSkills(INFANTRY_T1).map((s) => s.id);
    assert.deepEqual(normalizeLoadout([], INFANTRY_T1), ordered.slice(0, MAGIC_LOADOUT_SIZE));
    assert.deepEqual(normalizeLoadout(undefined, INFANTRY_T1), getDefaultLoadout(INFANTRY_T1));
});

test('with more than 8 learned, only 8 are equipped (the rest are benched)', () => {
    const learned = getOrderedLearnedSkills(INFANTRY_T5);
    assert.ok(learned.length > MAGIC_LOADOUT_SIZE, 'infantry T5 should learn >8 skills');
    const loadout = normalizeLoadout([], INFANTRY_T5);
    assert.equal(loadout.length, MAGIC_LOADOUT_SIZE);
    assert.deepEqual(loadout, learned.slice(0, MAGIC_LOADOUT_SIZE).map((s) => s.id));
});

test('skills no longer learnable are dropped and empty slots backfill in order', () => {
    // inf_t3 (tier 3) is not learnable at tier 1.
    const normalized = normalizeLoadout(['inf_t3', 'inf_t1'], INFANTRY_T1);
    assert.ok(!normalized.includes('inf_t3'), 'unlearnable skill removed');
    assert.ok(normalized.includes('inf_t1'), 'still-valid skill kept');
    // backfilled up to the learnable count, preserving order
    assert.deepEqual(normalized, ['inf_t1', ...getOrderedLearnedSkills(INFANTRY_T1)
        .map((s) => s.id)
        .filter((id) => id !== 'inf_t1')]);
});

test('original spells supersede redundant class and lower-rank spell variants', () => {
    const cases = [
        { owner: { classLineId: 'mage', currentTier: 1 }, winner: 'og_fireball', loser: 'mag_t1' },
        { owner: { classLineId: 'mage', currentTier: 2 }, winner: 'og_fire', loser: 'og_fireball' },
        { owner: { classLineId: 'mage', currentTier: 3 }, winner: 'og_blizzard', loser: 'mag_t2' },
        { owner: { classLineId: 'mage', currentTier: 3 }, winner: 'og_thunder', loser: 'mag_t3' },
        { owner: { classLineId: 'mage', currentTier: 7 }, winner: 'og_meteor', loser: 'mag_t7' },
        { owner: { classLineId: 'flying', currentTier: 3 }, winner: 'og_windcutter', loser: 'fly_t3' },
        { owner: { classLineId: 'flying', currentTier: 5 }, winner: 'og_tornado', loser: 'fly_t4' },
        { owner: { classLineId: 'naval', currentTier: 2 }, winner: 'og_freeze', loser: 'nav_t1' },
        { owner: { classLineId: 'naval', currentTier: 3 }, winner: 'og_blizzard', loser: 'nav_t3' },
        { owner: { classLineId: 'cleric', currentTier: 1 }, winner: 'og_heal', loser: 'cle_t1' },
        { owner: { classLineId: 'cleric', currentTier: 4 }, winner: 'og_cure', loser: 'cle_t3' },
        { owner: { classLineId: 'cleric', currentTier: 4 }, winner: 'og_forceheal', loser: 'cle_t4' },
        { owner: { classLineId: 'priest', currentTier: 4 }, winner: 'og_quick', loser: 'pri_t3' },
        { owner: { classLineId: 'cultist', currentTier: 6 }, winner: 'og_hpdrain', loser: 'cul_t3' },
    ];

    for (const { owner, winner, loser } of cases) {
        const ids = getOrderedLearnedSkills(owner).map((skill) => skill.id);
        assert.ok(ids.includes(winner), `${owner.classLineId} T${owner.currentTier} keeps ${winner}`);
        assert.ok(!ids.includes(loser), `${owner.classLineId} T${owner.currentTier} removes ${loser}`);
    }
});

test('playable class learned lists never show duplicate spell names', () => {
    for (const classLine of ALL_CLASS_LINES) {
        for (const { tier } of classLine.tiers) {
            const learned = getOrderedLearnedSkills({ classLineId: classLine.id, currentTier: tier });
            for (const languageKey of ['nameKr', 'nameEn'] as const) {
                const names = learned.map((skill) => skill[languageKey].trim().toLocaleLowerCase());
                assert.equal(
                    new Set(names).size,
                    names.length,
                    `${classLine.id} T${tier} has duplicate ${languageKey} names`,
                );
            }
        }
    }
});

test('upgrade is blocked when unlearned, maxed, or low on gold', () => {
    const skill = requireSkill('inf_t3'); // tier 3
    assert.equal(checkUpgrade(skill, 1, 999_999, false).reasonKey, 'magic.upgrade.unlearned');
    assert.equal(checkUpgrade(skill, 5, 999_999, true).reasonKey, 'magic.upgrade.maxed');

    const nextCost = getUpgradeCost(skill, 2); // 100 * 3 * 2 = 600
    assert.equal(nextCost, 600);
    assert.equal(checkUpgrade(skill, 1, nextCost - 1, true).reasonKey, 'magic.upgrade.gold');
    const ok = checkUpgrade(skill, 1, nextCost, true);
    assert.equal(ok.ok, true);
    assert.equal(ok.cost, nextCost);
});

test('getEffectiveSkill scales power and duration but not MP cost', () => {
    const dmg = requireSkill('inf_t3');
    assert.equal(getEffectiveSkill(dmg, 1).power, dmg.power); // unchanged at level 1
    assert.ok(Math.abs(getEffectiveSkill(dmg, 5).power - dmg.power * 1.4) < 1e-6);
    assert.equal(getEffectiveSkill(dmg, 5).mpCost, dmg.mpCost); // MP unchanged

    const buff = requireSkill('inf_t1'); // buff, buffDuration 3
    assert.equal(getEffectiveSkill(buff, 2).buffDuration, buff.buffDuration); // no bonus before L3
    assert.equal(getEffectiveSkill(buff, 3).buffDuration, (buff.buffDuration ?? 3) + 1);
    assert.equal(getEffectiveSkill(buff, 5).buffDuration, (buff.buffDuration ?? 3) + 2);
});

test('an upgraded damage skill deals more than its base form', () => {
    const skill = requireSkill('inf_t3');
    const casterStats = createBaseStats({ atk: 100, hitRate: 999, spd: 50 });
    const enemy: SkillEffectEnemyInput = {
        id: 'e1', name: 'Dummy', gridX: 1, gridY: 0,
        stats: createBaseStats({ hp: 9999, maxHp: 9999, def: 0, spd: 0, evasion: 0 }),
    };
    const base = withFixedRandom(0, () => resolveSkillEffect({ casterStats, skill, targetEnemy: enemy }));
    const upgraded = withFixedRandom(0, () =>
        resolveSkillEffect({ casterStats, skill: getEffectiveSkill(skill, 5), targetEnemy: enemy }));
    assert.ok(base.enemyResults[0].damage > 0);
    assert.ok(upgraded.enemyResults[0].damage > base.enemyResults[0].damage,
        `upgraded ${upgraded.enemyResults[0].damage} should exceed base ${base.enemyResults[0].damage}`);
});

test('an upgraded heal restores more than its base form', () => {
    const skill = requireSkill('cle_t1'); // heal
    const casterStats = createBaseStats({ magAtk: 80, hp: 1, maxHp: 9999, mp: 99, maxMp: 99 });
    const base = resolveSkillEffect({ casterStats, skill });
    const upgraded = resolveSkillEffect({ casterStats, skill: getEffectiveSkill(skill, 3) });
    assert.ok(upgraded.casterHpDelta > base.casterHpDelta);
});

test('normalizeUpgradeLevels drops unknown ids and clamps to [1,5]', () => {
    const cleaned = normalizeUpgradeLevels({ inf_t3: 9, not_a_skill: 3, inf_t1: 1 });
    assert.equal(cleaned.inf_t3, 5);     // clamped to max
    assert.equal(cleaned.not_a_skill, undefined); // unknown skill dropped
    assert.equal(cleaned.inf_t1, undefined);      // level 1 is the default → omitted
});
