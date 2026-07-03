import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSkillEffect } from '../../src/combat/SkillEffectResolver';
import { createStatus, getEffectiveStats, getStatusEffectsForSkill } from '../../src/combat/StatusEffects';
import { ALL_SKILLS, getLearnedSkills, getSkill, getSkillGroup, type Skill } from '../../src/data/SkillDB';
import { getSkillVisualProfile } from '../../src/data/SkillVisualProfiles';
import { createBaseStats } from '../../src/data/Stats';
import type { FieldActor } from '../../src/field/FieldTypes';
import { getAlliedActorsInManhattanRange } from '../../src/engine/world/WorldMagicController';
import { MAGIC_ACTION_GAUGE_COST } from '../../src/field/FieldActionEconomy';
import { getMagicCastReadinessFailure, isTargetedMagicSkill } from '../../src/magic/MagicCastRules';

const AUXILIARY_SKILL_IDS = [
    'inf_guard_stance',
    'inf_iron_defense',
    'cav_mobile_stance',
    'cav_long_breakthrough',
    'lan_spear_wall',
    'lan_intercept_order',
    'cle_life_prayer',
    'cle_healing_bell',
    'pri_battle_chant',
    'pri_victory_prayer',
    'shr_guardian_aura',
    'shr_sanctuary_dance',
] as const;

function requireSkill(id: string): Skill {
    const skill = getSkill(id);
    assert.ok(skill, `missing skill ${id}`);
    return skill;
}

function resolveForCoverage(skill: Skill) {
    const casterStats = createBaseStats({
        hp: 30,
        maxHp: 100,
        mp: 20,
        maxMp: 90,
        atk: 40,
        def: 8,
        magAtk: 35,
        magDef: 8,
        hitRate: 100,
        magHit: 100,
    });
    const target = {
        id: 'e1',
        name: 'Enemy 1',
        gridX: 5,
        gridY: 5,
        stats: createBaseStats({
            hp: 120,
            maxHp: 120,
            mp: 50,
            maxMp: 50,
            def: 8,
            magDef: 6,
            spd: 1,
            evasion: 0,
            magEva: 0,
        }),
    };
    const nearby = {
        ...target,
        id: 'e2',
        name: 'Enemy 2',
        gridX: 6,
        gridY: 5,
    };

    return resolveSkillEffect({
        casterStats,
        skill,
        targetEnemy: skill.type === 'heal' || skill.type === 'buff' ? undefined : target,
        allEnemies: [target, nearby],
        targetsResolvedByPattern: skill.type !== 'heal' && skill.type !== 'buff',
        random: () => 0,
    });
}

function fakeActor(id: string, x: number, y: number, hp = 10, isDead = false): FieldActor {
    return {
        id,
        character: {
            id,
            isDead,
            stats: createBaseStats({ hp, maxHp: 10 }),
        },
        entity: { gridX: x, gridY: y },
        path: [],
        queuedIntent: null,
    } as unknown as FieldActor;
}

test('all defined skills produce at least one concrete combat effect', () => {
    const ineffective: string[] = [];

    for (const skill of ALL_SKILLS) {
        const result = resolveForCoverage(skill);
        const hasCasterEffect =
            result.casterHpDelta !== 0 ||
            result.casterMpDelta !== -skill.mpCost ||
            result.cleansesCasterStatuses === true ||
            (result.casterStatusEffects?.length ?? 0) > 0;
        const hasEnemyEffect = result.enemyResults.some((enemy) =>
            enemy.damage > 0 ||
            (enemy.mpDamage ?? 0) > 0 ||
            (enemy.statusEffects?.length ?? 0) > 0 ||
            (enemy.casterHpRestore ?? 0) > 0 ||
            (enemy.casterMpRestore ?? 0) > 0
        );

        if (!hasCasterEffect && !hasEnemyEffect) ineffective.push(skill.id);
    }

    assert.deepEqual(ineffective, []);
});

test('auxiliary T1-T7 skills are added without replacing existing skills', () => {
    assert.equal(ALL_SKILLS.length, 121);
    for (const id of AUXILIARY_SKILL_IDS) assert.ok(getSkill(id), `missing ${id}`);

    const infantryTier2 = getLearnedSkills('infantry', 2).map((skill) => skill.id);
    assert.ok(infantryTier2.includes('inf_t2'));
    assert.ok(infantryTier2.includes('inf_guard_stance'));

    const cavalryTier5 = getLearnedSkills('cavalry', 5).map((skill) => skill.id);
    assert.ok(cavalryTier5.includes('cav_t5'));
    assert.ok(cavalryTier5.includes('cav_long_breakthrough'));
});

test('skill groups resolve explicit auxiliary groups and legacy defaults', () => {
    assert.equal(getSkillGroup(requireSkill('inf_guard_stance')), 'classStance');
    assert.equal(getSkillGroup(requireSkill('lan_spear_wall')), 'classCommand');
    assert.equal(getSkillGroup(requireSkill('shr_guardian_aura')), 'classAura');
    assert.equal(getSkillGroup(requireSkill('cav_t1')), 'classSkill');
    assert.equal(getSkillGroup(requireSkill('og_fire')), 'commonMagic');
});

test('shared magic cast readiness covers loadout, silence, resources, and targets', () => {
    const fire = requireSkill('og_fire');
    const base = {
        skill: fire,
        learnedSkillIds: new Set([fire.id]),
        equippedSkillIds: [fire.id],
        statuses: [],
        mp: fire.mpCost,
        remainingAp: MAGIC_ACTION_GAUGE_COST,
    };

    assert.equal(isTargetedMagicSkill(fire), true);
    assert.equal(getMagicCastReadinessFailure({ ...base, requireTarget: true, targetId: 'enemy-1' }), null);
    assert.equal(getMagicCastReadinessFailure({ ...base, learnedSkillIds: new Set() }), 'notLearned');
    assert.equal(getMagicCastReadinessFailure({ ...base, equippedSkillIds: [] }), 'notEquipped');
    assert.equal(getMagicCastReadinessFailure({ ...base, statuses: [createStatus('silence')] }), 'silenced');
    assert.equal(getMagicCastReadinessFailure({ ...base, remainingAp: MAGIC_ACTION_GAUGE_COST - 1 }), 'noAp');
    assert.equal(getMagicCastReadinessFailure({ ...base, mp: fire.mpCost - 1 }), 'noMp');
    assert.equal(getMagicCastReadinessFailure({ ...base, requireTarget: true }), 'targetRequired');
    assert.equal(isTargetedMagicSkill(requireSkill('og_heal')), false);
});

test('selfAndNearbyAllies uses caster-inclusive Manhattan ally range', () => {
    const caster = fakeActor('caster', 5, 5);
    const edge = fakeActor('edge', 7, 5);
    const diagonalOutsideRadiusOne = fakeActor('diagonal', 6, 6);
    const dead = fakeActor('dead', 6, 5, 0, true);
    const far = fakeActor('far', 8, 5);

    assert.deepEqual(
        getAlliedActorsInManhattanRange(caster, [caster, edge, diagonalOutsideRadiusOne, dead, far], 1).map((actor) => actor.id),
        ['caster']
    );
    assert.deepEqual(
        getAlliedActorsInManhattanRange(caster, [caster, edge, diagonalOutsideRadiusOne, dead, far], 2).map((actor) => actor.id),
        ['caster', 'edge', 'diagonal']
    );
});

test('all defined skills have concrete animation profiles', () => {
    const invalid: string[] = [];
    const visualKeys = new Set<string>();

    for (const skill of ALL_SKILLS) {
        const profile = getSkillVisualProfile(skill);
        visualKeys.add(profile.visualKey);
        if (
            profile.skillId !== skill.id ||
            profile.glyph.length === 0 ||
            profile.palette.length === 0 ||
            profile.particleCount <= 0 ||
            profile.ringCount <= 0 ||
            profile.spriteSize <= 0 ||
            profile.duration <= 0
        ) {
            invalid.push(skill.id);
        }
    }

    assert.deepEqual(invalid, []);
    assert.equal(visualKeys.size, ALL_SKILLS.length);
});

test('description-critical special effects are represented in resolver output', () => {
    const casterStats = createBaseStats({
        hp: 40,
        maxHp: 100,
        mp: 10,
        maxMp: 80,
        atk: 30,
        magAtk: 30,
        hitRate: 100,
        magHit: 100,
    });
    const highDefenseTarget = {
        id: 'e1',
        name: 'Armored',
        gridX: 5,
        gridY: 5,
        stats: createBaseStats({
            hp: 200,
            maxHp: 200,
            mp: 40,
            maxMp: 40,
            def: 90,
            magDef: 5,
            spd: 1,
            evasion: 0,
            magEva: 0,
        }),
    };

    const thrust = resolveSkillEffect({ casterStats, skill: requireSkill('lan_t1'), targetEnemy: highDefenseTarget, random: () => 0 });
    const pierce = resolveSkillEffect({ casterStats, skill: requireSkill('lan_t2'), targetEnemy: highDefenseTarget, random: () => 0 });
    assert.ok(pierce.enemyResults[0].damage > thrust.enemyResults[0].damage);

    const freeze = resolveSkillEffect({ casterStats, skill: requireSkill('og_freeze'), targetEnemy: highDefenseTarget, random: () => 0 });
    assert.deepEqual(freeze.enemyResults[0].statusEffects?.map((status) => status.kind), ['slow']);

    const curseKinds = getStatusEffectsForSkill(requireSkill('cul_t2')).map((status) => status.kind);
    assert.deepEqual(curseKinds, ['attackDown', 'defenseDown']);

    const poisonFogKinds = getStatusEffectsForSkill(requireSkill('alc_t2')).map((status) => status.kind);
    assert.deepEqual(poisonFogKinds, ['poison']);

    const mutedStats = getEffectiveStats(createBaseStats({ magAtk: 25 }), getStatusEffectsForSkill(requireSkill('og_mute')));
    assert.equal(mutedStats.magAtk, 0);

    const barrierKinds = getStatusEffectsForSkill(requireSkill('shr_t5')).map((status) => status.kind);
    assert.deepEqual(barrierKinds, ['defenseUp', 'resistUp', 'damageTakenDown']);

    const maidenPrayer = resolveSkillEffect({ casterStats, skill: requireSkill('shr_t7') });
    assert.equal(maidenPrayer.cleansesCasterStatuses, true);
    assert.deepEqual(maidenPrayer.casterStatusEffects?.map((status) => status.kind), ['allUp', 'regen', 'damageTakenDown']);

    const cure = resolveSkillEffect({ casterStats, skill: requireSkill('og_cure') });
    assert.equal(cure.cleansesCasterStatuses, true);

    const hpDrain = resolveSkillEffect({ casterStats, skill: requireSkill('og_hpdrain'), targetEnemy: highDefenseTarget, random: () => 0 });
    assert.ok((hpDrain.enemyResults[0].casterHpRestore ?? 0) > 0);

    const mpDrain = resolveSkillEffect({ casterStats, skill: requireSkill('og_mpdrain'), targetEnemy: highDefenseTarget, random: () => 0 });
    assert.equal(mpDrain.enemyResults[0].damage, 0);
    assert.ok((mpDrain.enemyResults[0].mpDamage ?? 0) > 0);
    assert.equal(mpDrain.enemyResults[0].casterMpRestore, mpDrain.enemyResults[0].mpDamage);
});
