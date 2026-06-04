import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CHAR_CLASSES } from '../../src/data/characterClasses';
import { MASTER_CLASSES } from '../../src/data/ClassTree';
import { REST_FACILITIES } from '../../src/data/RestFacilityData';
import { STORY_QUESTS, getStoryCompanionRewards } from '../../src/data/StoryQuestData';
import { TOWN_FACILITY_META } from '../../src/data/TownFacilityData';
import { EQUIP_SLOT_LIST } from '../../src/inventory/InventoryUI';
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
        for (const re of [/\bt\(\s*['"]([^'"]+)['"]\s*\)/g, /\bformatT\(\s*['"]([^'"]+)['"]/g]) {
            for (const match of text.matchAll(re)) keys.add(match[1]);
        }
    }
    return keys;
}

function collectDataDrivenUiKeys(): Set<string> {
    const keys = new Set<string>();
    const add = (key: string | undefined | null) => {
        if (key) keys.add(key);
    };

    for (const cfg of CHAR_CLASSES) add(cfg.labelKey);
    for (const entry of EQUIP_SLOT_LIST) add(entry.labelKey);
    for (const tab of SHOP_KIND_TABS) add(tab.labelKey);
    for (const meta of Object.values(TOWN_FACILITY_META)) add(meta.labelKey);

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
    for (const reward of getStoryCompanionRewards()) add(reward.nameKey);

    for (const type of ['damage', 'heal', 'buff', 'debuff', 'aoe']) add(`magic.type.${type}`);
    for (const element of ['fire', 'ice', 'lightning', 'holy', 'dark', 'earth', 'wind', 'physical', 'none']) add(`magic.element.${element}`);
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legend', 'unique']) add(`rarity.${rarity}`);
    for (const slot of ['weapon', 'shield', 'head', 'body', 'boots', 'accessory', 'accessory2']) add(`inv.${slot}`);
    for (const branch of MASTER_CLASSES.map((master) => master.branch)) add(`tierChart.branch.${branch}`);
    for (const status of ['active', 'objectiveComplete', 'completed']) add(`quest.status.${status}`);

    return keys;
}

function collectLanguageKeys(lang: 'ko' | 'en'): Set<string> {
    const text = readFileSync(join(process.cwd(), 'src/i18n/LanguageManager.ts'), 'utf8');
    const stringsBlock = objectBlockAfter(text, 'strings:');
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

test('data-driven UI translation keys exist in both languages', () => {
    const used = collectDataDrivenUiKeys();
    const ko = collectLanguageKeys('ko');
    const en = collectLanguageKeys('en');

    assert.deepEqual([...used].filter((key) => !ko.has(key)).sort(), []);
    assert.deepEqual([...used].filter((key) => !en.has(key)).sort(), []);
});
