import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyCharacterExp,
    getCharacterExpToNext,
    getCharacterLevelCap,
    type CharacterProgressionState,
} from '../../src/character/CharacterProgression';
import { getClassLine } from '../../src/data/ClassTree';
import { createBaseStats, getBaseStatsForClass, type CharacterStats } from '../../src/data/Stats';
import { getOriginalStats } from '../../src/data/original/originalProgression';

function makeStats(classLineId: string, tier: number, level: number): CharacterStats {
    const classLine = getClassLine(classLineId);
    return createBaseStats({
        ...getBaseStatsForClass(classLineId, classLine?.baseMovRange ?? 3),
        ...getOriginalStats(classLineId, tier, level),
    });
}

function makeState(
    classLineId: string,
    tier: number,
    level: number,
    overrides: Partial<CharacterProgressionState> = {},
): CharacterProgressionState {
    return {
        classLineId,
        currentTier: tier,
        level,
        exp: 0,
        expToNext: getCharacterExpToNext(classLineId, tier, level),
        stats: makeStats(classLineId, tier, level),
        hasEmblem: false,
        ...overrides,
    };
}

test('shared progression exposes original and fallback level requirements', () => {
    assert.equal(getCharacterLevelCap('infantry', 1), 5);
    assert.equal(getCharacterExpToNext('infantry', 1, 1), 250);
    assert.equal(getCharacterLevelCap('master_battle', 8), 10);
    assert.equal(getCharacterExpToNext('master_battle', 8, 1), 50);
    assert.equal(getCharacterExpToNext('master_battle', 9, 1), 57);
});

test('shared progression applies original stats without mutating its input', () => {
    const input = makeState('infantry', 1, 1);
    const before = structuredClone(input);

    const result = applyCharacterExp(input, input.expToNext);
    const originalLevelTwo = getOriginalStats('infantry', 1, 2)!;

    assert.deepEqual(input, before);
    assert.notEqual(result.state, input);
    assert.notEqual(result.state.stats, input.stats);
    assert.equal(result.leveledUp, true);
    assert.equal(result.promoted, false);
    assert.equal(result.state.level, 2);
    assert.equal(result.state.exp, 0);
    assert.equal(result.state.stats.maxHp, originalLevelTwo.maxHp);
    assert.equal(result.state.stats.atk, originalLevelTwo.atk);
    assert.equal(result.state.stats.hp, result.state.stats.maxHp);
    assert.equal(result.state.stats.mp, result.state.stats.maxMp);
});

test('shared progression promotes at the original tier cap and resets to tier level one stats', () => {
    const cap = getCharacterLevelCap('infantry', 1);
    const input = makeState('infantry', 1, cap);

    const result = applyCharacterExp(input, input.expToNext);
    const promotedStats = getOriginalStats('infantry', 2, 1)!;

    assert.equal(result.leveledUp, true);
    assert.equal(result.promoted, true);
    assert.equal(result.promotedTier, 2);
    assert.equal(result.state.currentTier, 2);
    assert.equal(result.state.level, 1);
    assert.equal(result.state.exp, 0);
    assert.equal(result.state.stats.maxHp, promotedStats.maxHp);
    assert.equal(result.state.stats.atk, promotedStats.atk);
});

test('shared progression preserves legacy normal and promotion growth for master classes', () => {
    const classLine = getClassLine('master_battle')!;
    const input = makeState('master_battle', 8, 9, {
        stats: createBaseStats({
            maxHp: 101,
            hp: 17,
            maxMp: 31,
            mp: 4,
            atk: 20.2,
            def: 19.4,
            magAtk: 11.1,
            magDef: 12.7,
            spd: 9.3,
        }),
    });

    const levelUp = applyCharacterExp(input, input.expToNext);
    const growth = classLine.growth;
    assert.equal(levelUp.state.level, 10);
    assert.equal(levelUp.state.stats.maxHp, 101 + Math.floor(growth.hp));
    assert.equal(levelUp.state.stats.hp, levelUp.state.stats.maxHp);
    assert.equal(levelUp.state.stats.atk, 20.2 + Math.floor(growth.atk * 10) / 10);

    const promotion = applyCharacterExp(levelUp.state, levelUp.state.expToNext);
    assert.equal(promotion.promoted, true);
    assert.equal(promotion.state.currentTier, 9);
    assert.equal(promotion.state.level, 1);
    assert.equal(
        promotion.state.stats.maxHp,
        levelUp.state.stats.maxHp + Math.floor(growth.hp * 2),
    );
    assert.equal(
        promotion.state.stats.atk,
        levelUp.state.stats.atk + Math.floor(growth.atk * 2 * 10) / 10,
    );
});

test('shared progression caps final-tier EXP and unlocks the fusion emblem', () => {
    const cap = getCharacterLevelCap('infantry', 7);
    const input = makeState('infantry', 7, cap);

    const result = applyCharacterExp(input, input.expToNext + 999_999);

    assert.equal(result.leveledUp, false);
    assert.equal(result.promoted, false);
    assert.equal(result.emblemUnlocked, true);
    assert.equal(result.state.exp, input.expToNext);
    assert.equal(result.state.hasEmblem, true);
});
