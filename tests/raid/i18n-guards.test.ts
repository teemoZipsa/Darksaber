import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CHAR_CLASSES } from '../../src/data/characterClasses';
import { MASTER_CLASSES } from '../../src/data/ClassTree';
import { getFacilityUpgradeDefinitions } from '../../src/data/FacilityUpgradeData';
import { REST_FACILITIES } from '../../src/data/RestFacilityData';
import { STORY_INTERIOR_BRIEFING_LINE_KEYS } from '../../src/data/StoryInteriorBriefingData';
import { STORY_INTERIOR_LAYOUTS } from '../../src/data/StoryInteriorData';
import { STORY_QUESTS, getStoryCompanionRewards } from '../../src/data/StoryQuestData';
import { STORY_SCENARIO_EVENT_SEQUENCES, type StoryScenarioEventStep } from '../../src/data/StoryScenarioEventData';
import { TOWN_FACILITY_META } from '../../src/data/TownFacilityData';
import { STATUS_KINDS } from '../../src/combat/StatusEffects';
import { FIELD_TURN_END_REASONS } from '../../src/field/FieldTypes';
import { getTerrainEntryHazards } from '../../src/field/TerrainRules';
import { EQUIP_SLOT_LIST } from '../../src/inventory/InventoryUI';
import { WORLD_LOOT_CONTAINER_TYPES } from '../../src/loot/WorldLootTypes';
import { TileType, TILE_PROPERTIES } from '../../src/map/Tile';
import { RAID_MODIFIERS } from '../../src/raid/RaidModifiers';
import { SHOP_KIND_TABS } from '../../src/ui/ShopUI';

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const stat = statSync(path);
        if (stat.isDirectory()) out.push(...walkFiles(path));
        else if (/\.(ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
}

function objectBlockAfter(text: string, marker: string): string {
    const markerIndex = text.indexOf(marker);
    assert.notEqual(markerIndex, -1, `missing marker ${marker}`);
    const start = text.indexOf('{', markerIndex);
    assert.notEqual(start, -1, `missing object after ${marker}`);

    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start + 1, i);
        }
    }
    assert.fail(`unterminated object after ${marker}`);
}

function collectLiteralUiKeys(): Set<string> {
    const keys = new Set<string>();
    for (const file of walkFiles(join(process.cwd(), 'src'))) {
        const text = readFileSync(file, 'utf8');
        for (const re of [
            /\bt\(\s*['"]([^'"]+)['"]\s*\)/g,
            /\bformatT\(\s*['"]([^'"]+)['"]/g,
            /\bformatSkillLog\(\s*['"]([^'"]+)['"]/g,
            /\blogEnemy\(\s*['"]([^'"]+)['"]/g,
            /\bmatchesAnyLocalizedKeyword\(\s*line\s*,\s*['"]([^'"]+)['"]/g,
        ]) {
            for (const match of text.matchAll(re)) keys.add(match[1]);
        }
    }
    return keys;
}

function collectTemplateUiKeyPatterns(): Set<string> {
    const patterns = new Set<string>();
    for (const file of walkFiles(join(process.cwd(), 'src'))) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(/\b(?:t|formatT)\(\s*`([^`]*\$\{[^`]*?)`/g)) {
            patterns.add(match[1].replace(/\$\{[^}]+\}/g, '${}'));
        }
    }
    return patterns;
}

function collectDataDrivenUiKeys(): Set<string> {
    const keys = new Set<string>();
    const add = (key: string | undefined | null) => {
        if (key) keys.add(key);
    };
    const addScenarioStep = (step: StoryScenarioEventStep) => {
        if (step.kind === 'dialogue') {
            add(step.speakerNameKey);
            add(step.textKey);
        } else if (step.kind === 'focus' || step.kind === 'combatStart' || step.kind === 'objective') {
            add(step.labelKey);
        }
    };

    for (const cfg of CHAR_CLASSES) add(cfg.labelKey);
    for (const entry of EQUIP_SLOT_LIST) add(entry.labelKey);
    for (const tab of SHOP_KIND_TABS) add(tab.labelKey);
    for (const meta of Object.values(TOWN_FACILITY_META)) add(meta.labelKey);
    for (const facility of getFacilityUpgradeDefinitions()) {
        add(facility.nameKey);
        add(facility.descKey);
        add(facility.effectKey);
    }

    for (const facility of Object.values(REST_FACILITIES)) {
        add(facility?.nameKey);
        for (const menu of facility?.menu ?? []) {
            add(menu.nameKey);
            add(menu.descKey);
        }
    }

    for (const quest of STORY_QUESTS) {
        add(quest.titleKey);
        add(quest.summaryKey);
        add(quest.objectiveKey);
        add(quest.recommendedLevelKey);
        add(quest.enterLogKey);
        add(quest.objectiveCompleteLogKey);
    }
    for (const layout of STORY_INTERIOR_LAYOUTS) {
        add(layout.displayNameKey);
        add(layout.objectiveKey);
        for (const room of layout.rooms) add(room.nameKey);
        for (const prop of layout.props) add(prop.labelKey);
        for (const door of layout.doors ?? []) add(door.lockedLogKey);
    }
    for (const lines of Object.values(STORY_INTERIOR_BRIEFING_LINE_KEYS)) {
        for (const lineKey of lines) add(lineKey);
    }
    for (const reward of getStoryCompanionRewards()) add(reward.nameKey);
    for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
        for (const marker of sequence.markers ?? []) add(marker.markerLabelKey);
        for (const step of sequence.entry) addScenarioStep(step);
        for (const step of sequence.bossDefeat) addScenarioStep(step);
        for (const event of sequence.fieldEvents) {
            add(event.markerLabelKey);
            for (const step of event.steps) addScenarioStep(step);
        }
        for (const event of sequence.enemyDefeatEvents ?? []) {
            for (const step of event.steps) addScenarioStep(step);
        }
    }

    for (const type of ['damage', 'heal', 'buff', 'debuff', 'aoe']) add(`magic.type.${type}`);
    for (const element of ['fire', 'ice', 'lightning', 'holy', 'dark', 'earth', 'wind', 'physical', 'none']) add(`magic.element.${element}`);
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legend', 'unique']) add(`rarity.${rarity}`);
    for (const slot of ['weapon', 'shield', 'head', 'body', 'boots', 'accessory', 'accessory2']) add(`inv.${slot}`);
    for (const branch of MASTER_CLASSES.map((master) => master.branch)) add(`tierChart.branch.${branch}`);
    for (const status of ['active', 'objectiveComplete', 'completed']) add(`quest.status.${status}`);
    for (const containerType of WORLD_LOOT_CONTAINER_TYPES) add(`worldLoot.source.${containerType}`);
    for (const kind of STATUS_KINDS) {
        add(`status.${kind}.name`);
        add(`status.${kind}.desc`);
    }
    for (const reason of FIELD_TURN_END_REASONS) add(`field.log.reason.${reason}`);
    for (const modifier of RAID_MODIFIERS) {
        add(`raid.modifier.${modifier}.name`);
        add(`raid.modifier.${modifier}.desc`);
    }
    for (const props of Object.values(TILE_PROPERTIES)) add(props.labelKey);
    for (const tile of Object.values(TileType).filter((value): value is TileType => typeof value === 'number')) {
        for (const hazard of getTerrainEntryHazards(tile)) {
            add(hazard.hoverKey);
            add(hazard.logKey);
            add(hazard.statusTextKey);
        }
    }
    for (const step of ['move', 'attack', 'rest', 'magic', 'defeat']) {
        add(`tutorial.world.dialogue.${step}`);
        add(`tutorial.world.press.${step}`);
        add(`tutorial.world.target.${step}`);
        add(`tutorial.world.step.${step}`);
        add(`tutorial.world.step.${step}.log`);
    }
    for (const action of ['move', 'attack', 'rest', 'magic']) add(`tutorial.world.action.${action}`);

    return keys;
}

function collectLanguageKeys(lang: 'ko' | 'en'): Set<string> {
    const text = readFileSync(join(process.cwd(), 'src/i18n/translations.ts'), 'utf8');
    const stringsBlock = objectBlockAfter(text, 'I18N_STRINGS');
    const langBlock = objectBlockAfter(stringsBlock, `${lang}:`);
    return new Set([...langBlock.matchAll(/['"]([^'"]+)['"]\s*:/g)].map((match) => match[1]));
}

test('literal UI translation keys exist in both languages', () => {
    const used = collectLiteralUiKeys();
    const ko = collectLanguageKeys('ko');
    const en = collectLanguageKeys('en');

    assert.deepEqual([...used].filter((key) => !ko.has(key)).sort(), []);
    assert.deepEqual([...used].filter((key) => !en.has(key)).sort(), []);
});

test('template-composed UI translation key families are covered by the data-driven guard', () => {
    assert.deepEqual([...collectTemplateUiKeyPatterns()].sort(), [
        'field.log.reason.${}',
        'inv.${}',
        'magic.element.${}',
        'magic.type.${}',
        'quest.status.${}',
        'raid.modifier.${}.desc',
        'raid.modifier.${}.name',
        'rarity.${}',
        'status.${}.desc',
        'status.${}.name',
        'tierChart.branch.${}',
        'tutorial.world.action.${}',
        'tutorial.world.dialogue.${}',
        'tutorial.world.press.${}',
        'tutorial.world.step.${}.log',
        'tutorial.world.target.${}',
        'worldLoot.source.${}',
    ]);
});

test('data-driven UI translation keys exist in both languages', () => {
    const used = collectDataDrivenUiKeys();
    const ko = collectLanguageKeys('ko');
    const en = collectLanguageKeys('en');

    assert.deepEqual([...used].filter((key) => !ko.has(key)).sort(), []);
    assert.deepEqual([...used].filter((key) => !en.has(key)).sort(), []);
});
