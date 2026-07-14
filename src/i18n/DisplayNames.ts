import type { ItemDef } from '../data/ItemDB';
import { MONSTER_DEFINITIONS, type MonsterDefinition } from '../data/MonsterCatalog';
import type { Skill } from '../data/SkillDB';
import { STORY_SCENARIOS, type StoryScenarioDefinition } from '../data/StoryScenarioData';
import { getStoryCompanionRewards } from '../data/StoryQuestData';
import { i18n, t } from './LanguageManager';

type LocalizedItemName = Pick<ItemDef, 'name' | 'nameKr'>;
type LocalizedSkillText = Pick<Skill, 'nameEn' | 'nameKr' | 'descEn' | 'descKr'>;

export function formatItemName(item: LocalizedItemName): string {
    return i18n.lang === 'ko'
        ? item.nameKr || item.name
        : item.name || item.nameKr;
}

export function formatSkillName(skill: Pick<LocalizedSkillText, 'nameEn' | 'nameKr'>): string {
    return i18n.lang === 'ko'
        ? skill.nameKr || skill.nameEn
        : skill.nameEn || skill.nameKr;
}

export function formatSkillDescription(skill: Pick<LocalizedSkillText, 'descEn' | 'descKr'>): string {
    return i18n.lang === 'ko'
        ? skill.descKr || skill.descEn
        : skill.descEn || skill.descKr;
}

export function formatMonsterName(
    monster: Pick<MonsterDefinition, 'name' | 'nameEn'>,
): string {
    return i18n.lang === 'ko'
        ? monster.name || monster.nameEn
        : monster.nameEn || monster.name;
}

export function formatStoryBossName(
    scenario: Pick<StoryScenarioDefinition, 'bossName' | 'bossNameEn'>,
): string {
    return i18n.lang === 'ko'
        ? scenario.bossName || scenario.bossNameEn || ''
        : scenario.bossNameEn || scenario.bossName || '';
}

/** Localize a server-persisted enemy name from its stable catalog/story pair. */
export function formatStoredEnemyName(name: string): string {
    const scenario = STORY_SCENARIOS.find((candidate) => (
        candidate.bossName === name || candidate.bossNameEn === name
    ));
    if (scenario) return formatStoryBossName(scenario);

    const monster = Object.values(MONSTER_DEFINITIONS).find((candidate) => (
        candidate.name === name || candidate.nameEn === name
    ));
    return monster ? formatMonsterName(monster) : name;
}

/** Translate authored system companions while preserving player-created names verbatim. */
export function formatStoryCompanionName(characterId: string, fallbackName: string): string {
    const companion = getStoryCompanionRewards().find((reward) => reward.companionId === characterId);
    return companion ? t(companion.nameKey) : fallbackName;
}
