import test from 'node:test';
import assert from 'node:assert/strict';
import { rollBossRune, rollChestGem } from '../../src/data/SocketLoot';
import { getSkill } from '../../src/data/SkillDB';
import { getSkillVisualProfile } from '../../src/data/SkillVisualProfiles';
import type { Skill } from '../../src/data/SkillDB';
import {
    TOWN_FACILITIES,
    getTownFacilities,
    isTownFacilityId,
    isTownId,
} from '../../src/data/TownFacilityData';

test('town facility guards reject prototype keys and return copies', () => {
    assert.equal(isTownId('toString'), false);
    assert.equal(isTownFacilityId('toString'), false);

    const centralFacilities = getTownFacilities('central_castle');
    centralFacilities.push('shrine');
    assert.equal(TOWN_FACILITIES.central_castle.includes('shrine'), false);

    const fallbackFacilities = getTownFacilities('__missing__');
    fallbackFacilities.push('shrine');
    assert.deepEqual(getTownFacilities('__missing__'), ['storage', 'general_store', 'rumors']);
});

test('socket loot handles injected random values outside Math.random range', () => {
    assert.equal(rollChestGem(() => Number.NaN), null);
    assert.equal(rollBossRune(1, () => Number.NaN), null);
    assert.equal(rollBossRune(Number.NaN, () => Number.NaN), null);

    assert.equal(rollBossRune(1, () => -1)?.id, 'rune_el');
    assert.equal(rollBossRune(1, () => 2)?.slot, 'rune');
});

test('skill visual profiles keep final visual values in cache keys', () => {
    const skill = getSkill('og_fire');
    assert.ok(skill);

    const baseProfile = getSkillVisualProfile(skill);
    const higherTierProfile = getSkillVisualProfile({ ...skill, tier: skill.tier + 1 });
    assert.notEqual(baseProfile.visualKey, higherTierProfile.visualKey);
});

test('skill visual profiles fall back for malformed runtime data', () => {
    const skill = getSkill('og_fire');
    assert.ok(skill);
    const malformed = {
        ...skill,
        type: 'not-a-type',
        element: 'not-an-element',
        tier: Number.NaN,
        power: Number.NaN,
        range: Number.NaN,
        aoeRadius: Number.NaN,
    } as unknown as Skill;

    const profile = getSkillVisualProfile(malformed);
    assert.equal(profile.skillId, skill.id);
    assert.deepEqual(profile.palette, ['#f0c050', '#ffffff', '#8cffb8', '#7dd8ff']);
    assert.equal(profile.motion, 'burst');
    assert.equal(profile.spriteEffect, 'hit');
    assert.ok(profile.particleCount > 0);
    assert.ok(profile.spriteSize > 0);
    assert.ok(profile.duration > 0);
});
