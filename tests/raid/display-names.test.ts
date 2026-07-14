import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSkillEffect } from '../../src/combat/SkillEffectResolver';
import { getItemDef, ITEMS } from '../../src/data/ItemDB';
import { MONSTER_DEFINITIONS } from '../../src/data/MonsterCatalog';
import { ALL_SKILLS, getSkill } from '../../src/data/SkillDB';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { createBaseStats } from '../../src/data/Stats';
import {
    formatItemName,
    formatMonsterName,
    formatSkillDescription,
    formatSkillName,
    formatStoredEnemyName,
    formatStoryBossName,
} from '../../src/i18n/DisplayNames';
import { i18n, type Language } from '../../src/i18n/LanguageManager';

test('data-backed item and skill text follows the active language with safe fallbacks', () => {
    const previousLanguage: Language = i18n.lang;
    const item = getItemDef('herb_cheap');
    const skill = getSkill('og_fireball');
    assert.ok(item);
    assert.ok(skill);

    try {
        i18n.lang = 'ko';
        assert.equal(formatItemName(item), item.nameKr);
        assert.equal(formatSkillName(skill), skill.nameKr);
        assert.equal(formatSkillDescription(skill), skill.descKr);

        i18n.lang = 'en';
        assert.equal(formatItemName(item), item.name);
        assert.equal(formatSkillName(skill), skill.nameEn);
        assert.equal(formatSkillDescription(skill), skill.descEn);
        assert.equal(formatItemName({ name: '', nameKr: '대체 이름' }), '대체 이름');
        assert.equal(formatSkillName({ nameEn: '', nameKr: '대체 마법' }), '대체 마법');
        assert.equal(formatSkillDescription({ descEn: '', descKr: '대체 설명' }), '대체 설명');
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('skill effect logs use the localized skill name', () => {
    const previousLanguage: Language = i18n.lang;
    const skill = getSkill('alc_t4');
    assert.ok(skill);

    try {
        i18n.lang = 'en';
        const result = resolveSkillEffect({
            casterStats: createBaseStats({ hp: 80, maxHp: 100, mp: 0, maxMp: 100, magAtk: 20 }),
            skill,
        });
        assert.ok(result.logs.some((line) => line.includes(skill.nameEn)));
        assert.equal(result.logs.some((line) => line.includes(skill.nameKr)), false);
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('every runtime item, monster, and story boss has an English display name', () => {
    for (const item of ITEMS) {
        assert.doesNotMatch(item.name, /[\uac00-\ud7a3]/, `${item.id} English name`);
        assert.doesNotMatch(item.description, /[\uac00-\ud7a3]/, `${item.id} English description`);
    }
    for (const monster of Object.values(MONSTER_DEFINITIONS)) {
        assert.ok(monster.nameEn, `${monster.id} English name`);
        assert.doesNotMatch(monster.nameEn, /[\uac00-\ud7a3]/, `${monster.id} English name`);
    }
    for (const skill of ALL_SKILLS) {
        assert.doesNotMatch(skill.nameEn, /[\uac00-\ud7a3]/, `${skill.id} English name`);
        assert.doesNotMatch(skill.descEn, /[\uac00-\ud7a3]/, `${skill.id} English description`);
    }
    for (const scenario of STORY_SCENARIOS) {
        assert.doesNotMatch(scenario.dungeonNameEn, /[\uac00-\ud7a3]/, `episode ${scenario.episode} English dungeon`);
        assert.equal(Boolean(scenario.bossNameEn), Boolean(scenario.bossName), `episode ${scenario.episode} boss parity`);
        if (scenario.bossNameEn) {
            assert.doesNotMatch(scenario.bossNameEn, /[\uac00-\ud7a3]/, `episode ${scenario.episode} English boss`);
        }
    }
    for (const [key, value] of Object.entries(i18n.strings.en)) {
        assert.doesNotMatch(value, /[\uac00-\ud7a3]/, `${key} English translation`);
    }
});

test('catalog, story, and persisted server enemy names follow the active language', () => {
    const previousLanguage: Language = i18n.lang;
    const skeleton = MONSTER_DEFINITIONS['302R'];
    const ganomas = STORY_SCENARIOS.find((scenario) => scenario.episode === 3);
    assert.ok(ganomas);

    try {
        i18n.lang = 'ko';
        assert.equal(formatMonsterName(skeleton), '스켈레톤 궁수');
        assert.equal(formatStoryBossName(ganomas), '가노마스');

        i18n.lang = 'en';
        assert.equal(formatMonsterName(skeleton), 'Skeleton Archer');
        assert.equal(formatStoryBossName(ganomas), 'Ganomas');
        assert.equal(formatStoredEnemyName('스켈레톤 궁수'), 'Skeleton Archer');
        assert.equal(formatStoredEnemyName('가노마스'), 'Ganomas');
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('town, combat magic, and tool display paths do not read Korean-only fields directly', () => {
    const paths = [
        'src/combat/SkillEffectResolver.ts',
        'src/engine/world/WorldMagicController.ts',
        'src/engine/world/WorldToolController.ts',
        'src/engine/world/WorldTownSession.ts',
        'src/ui/FieldMagicMenu.ts',
        'src/ui/react/magic/MagicLoadoutPanel.tsx',
    ];

    for (const path of paths) {
        const source = readFileSync(join(process.cwd(), path), 'utf8');
        assert.doesNotMatch(source, /\.(?:nameKr|descKr)\b/, path);
    }
});
