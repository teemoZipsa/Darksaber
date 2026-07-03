import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { getLevelCap, getExpToNext, getOriginalStats } from '../../src/data/original/originalProgression';
import { i18n } from '../../src/i18n/LanguageManager';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('per-tier level caps follow the original level design (5..35)', () => {
    assert.equal(getLevelCap('infantry', 1), 5);
    assert.equal(getLevelCap('infantry', 7), 35);
    assert.equal(getLevelCap('naval', 2), 10);   // tier-2-start class
    assert.equal(getLevelCap('alchemist', 1), 5); // mirrors mage
    assert.equal(getLevelCap('shrine', 2), 10);   // mirrors priest
});

test('exp requirements are halved vs the original (2x gain rate)', () => {
    assert.equal(getExpToNext('infantry', 1, 1), 250);      // original 500 → 250
    assert.equal(getExpToNext('infantry', 7, 35), 377_000); // original 754000 → 377000
    const c = new Character('h', 'Hero', 'infantry');
    assert.equal(c.currentTier, 1);
    assert.equal(c.levelCap(), 5);
    assert.equal(c.expToNext, 250);
});

test('a character promotes at the original tier level cap', () => {
    const c = new Character('h', 'Hero', 'infantry');
    const startTier = c.currentTier;
    c.gainExp(100_000); // enough to climb several tiers
    assert.ok(c.currentTier > startTier, `expected promotion past tier ${startTier}, got ${c.currentTier}`);
    assert.ok(c.level >= 1);
});

test('classes without original data keep the formula fallback', () => {
    const c = new Character('m', 'Master', 'master_healer');
    assert.equal(c.levelCap(), 10);
    assert.ok(c.expToNext > 0);
});

test('character tier display name follows the active language', () => {
    const previousLang = i18n.lang;
    try {
        const c = new Character('h', 'Hero', 'infantry');
        i18n.lang = 'ko';
        assert.equal(c.getTierName(), '파이터');
        i18n.lang = 'en';
        assert.equal(c.getTierName(), 'Fighter');

        const unknown = new Character('u', 'Unknown', 'missing_class');
        assert.equal(unknown.getTierName(), 'Unknown');
    } finally {
        i18n.lang = previousLang;
    }
});

test('original base stats: paired stats interpolate 수→한 across the tier', () => {
    const t1lo = getOriginalStats('infantry', 1, 1)!;
    const t1hi = getOriginalStats('infantry', 1, 5)!; // tier cap
    assert.equal(t1lo.maxHp, 70);   // 200 × combat scale
    assert.equal(t1lo.atk, 23);     // 65 × combat scale
    assert.equal(t1hi.atk, 34);     // 98 × combat scale
    assert.equal(t1hi.maxHp, 70);
    const mage = getOriginalStats('mage', 1, 1)!;
    assert.equal(mage.maxHp, 63);
    assert.equal(mage.magAtk, 21);
    assert.equal(mage.maxMp, 23);
});

test('a fresh character adopts original tier-1 base stats; reference classes mirror their template', () => {
    const inf = new Character('i', 'Inf', 'infantry');
    assert.equal(inf.stats.maxHp, 70);
    assert.equal(inf.stats.atk, 23);
    assert.equal(inf.stats.hp, inf.stats.maxHp); // starts full

    const alchy = new Character('a', 'Alchy', 'alchemist');
    const mage = getOriginalStats('mage', 1, 1)!;
    assert.deepEqual(
        { maxHp: alchy.stats.maxHp, atk: alchy.stats.atk, magAtk: alchy.stats.magAtk },
        { maxHp: mage.maxHp, atk: mage.atk, magAtk: mage.magAtk },
    );

    const shrine = new Character('s', 'Shrine', 'shrine');
    const priest = getOriginalStats('priest', 2, 1)!;
    assert.deepEqual(
        { maxHp: shrine.stats.maxHp, atk: shrine.stats.atk, magAtk: shrine.stats.magAtk },
        { maxHp: priest.maxHp, atk: priest.atk, magAtk: priest.magAtk },
    );
});

test('promotion jumps base stats to the next tier (infantry T1→T2 HP 70→84)', () => {
    const c = new Character('i', 'Inf', 'infantry');
    assert.equal(c.stats.maxHp, 70);
    c.gainExp(100_000); // climb past T1
    assert.ok(c.currentTier >= 2);
    assert.ok(c.stats.maxHp >= 84, `expected >=84 HP after promotion, got ${c.stats.maxHp}`);
});
