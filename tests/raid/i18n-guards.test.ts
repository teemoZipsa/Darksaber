import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { CHAR_CLASSES } from '../../src/data/characterClasses';
import { CHANGELOG } from '../../src/data/changelog';
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
import { MAGIC_UPGRADE_REASON_KEYS } from '../../src/magic/MagicLoadout';
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

function readSourceFile(file: string): ts.SourceFile {
    const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, scriptKind);
}

function visitSourceFile(file: string, visitor: (node: ts.Node, sourceFile: ts.SourceFile) => void): void {
    const sourceFile = readSourceFile(file);
    const visit = (node: ts.Node) => {
        visitor(node, sourceFile);
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}

function getPropertyNameText(name: ts.PropertyName): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return null;
}

function getStaticString(node: ts.Expression | undefined): string | null {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    return null;
}

function getTemplatePattern(node: ts.Expression | undefined): string | null {
    if (!node || !ts.isTemplateExpression(node)) return null;
    return [
        node.head.text,
        ...node.templateSpans.flatMap((span) => ['${}', span.literal.text]),
    ].join('');
}

function getCallIdentifier(node: ts.CallExpression): string | null {
    return ts.isIdentifier(node.expression) ? node.expression.text : null;
}

function collectLiteralUiKeys(): Set<string> {
    const keys = new Set<string>();
    for (const file of walkFiles(join(process.cwd(), 'src'))) {
        visitSourceFile(file, (node) => {
            if (!ts.isCallExpression(node)) return;
            const name = getCallIdentifier(node);
            if (name === 't' || name === 'formatT' || name === 'formatSkillLog' || name === 'logEnemy') {
                const key = getStaticString(node.arguments[0]);
                if (key) keys.add(key);
                return;
            }
            if (name === 'matchesAnyLocalizedKeyword') {
                const key = getStaticString(node.arguments[1]);
                if (key) keys.add(key);
            }
        });
    }
    return keys;
}

function collectTemplateUiKeyPatterns(): Set<string> {
    const patterns = new Set<string>();
    for (const file of walkFiles(join(process.cwd(), 'src'))) {
        visitSourceFile(file, (node) => {
            if (!ts.isCallExpression(node)) return;
            const name = getCallIdentifier(node);
            if (name !== 't' && name !== 'formatT') return;
            const pattern = getTemplatePattern(node.arguments[0]);
            if (pattern) patterns.add(pattern);
        });
    }
    return patterns;
}

function collectDynamicUiKeyCalls(): string[] {
    const calls: string[] = [];
    for (const file of walkFiles(join(process.cwd(), 'src'))) {
        visitSourceFile(file, (node, sourceFile) => {
            if (!ts.isCallExpression(node)) return;
            const name = getCallIdentifier(node);
            if (name !== 't' && name !== 'formatT' && name !== 'formatSkillLog' && name !== 'logEnemy') return;
            const keyArg = node.arguments[0];
            if (!keyArg) return;
            if (getStaticString(keyArg) || getTemplatePattern(keyArg)) return;
            const relativeFile = relative(process.cwd(), file).replace(/\\/g, '/');
            calls.push(`${relativeFile}: ${name}(${keyArg.getText(sourceFile)})`);
        });
    }
    return calls.sort();
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
    for (const entry of CHANGELOG) {
        for (const key of entry.itemKeys) add(key);
    }
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
    for (const key of MAGIC_UPGRADE_REASON_KEYS) add(key);

    return keys;
}

function collectLanguageKeys(lang: 'ko' | 'en'): Set<string> {
    const sourceFile = readSourceFile(join(process.cwd(), 'src/i18n/translations.ts'));
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'I18N_STRINGS') continue;
            const table = declaration.initializer;
            if (!table || !ts.isObjectLiteralExpression(table)) continue;
            const langEntry = table.properties.find((property): property is ts.PropertyAssignment =>
                ts.isPropertyAssignment(property)
                && getPropertyNameText(property.name) === lang
                && ts.isObjectLiteralExpression(property.initializer)
            );
            assert.ok(langEntry, `missing ${lang} translation block`);
            return new Set((langEntry.initializer as ts.ObjectLiteralExpression).properties.flatMap((property) => {
                if (!ts.isPropertyAssignment(property)) return [];
                const key = getPropertyNameText(property.name);
                return key ? [key] : [];
            }));
        }
    }
    assert.fail('missing I18N_STRINGS declaration');
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

test('dynamic UI translation key calls are reviewed by the guard allowlist', () => {
    assert.deepEqual(collectDynamicUiKeyCalls(), [
        "src/combat/SkillEffectResolver.ts: formatT(key)",
        "src/data/HybridMarketService.ts: t(key)",
        "src/data/MarketService.ts: t(key)",
        "src/engine/GameManager.ts: t(companion.nameKey)",
        "src/engine/GameManager.ts: t(companionReward.nameKey)",
        "src/engine/world/WorldEnemyTurnController.ts: formatT(key)",
        "src/engine/world/WorldEngineCombatControllers.ts: formatT(hazard.logKey)",
        "src/engine/world/WorldEngineCombatControllers.ts: t(hazard.statusTextKey)",
        "src/engine/world/WorldRaidOutcomeController.ts: t(nextQuest.titleKey)",
        "src/engine/world/WorldRaidOutcomeController.ts: t(quest.titleKey)",
        "src/engine/world/WorldRaidOutcomeController.ts: t(quest.titleKey)",
        "src/engine/world/WorldRaidOutcomeController.ts: t(quest.titleKey)",
        "src/engine/world/WorldRaidOutcomeController.ts: t(reward.nameKey)",
        "src/engine/world/WorldRaidOutcomeController.ts: t(reward.nameKey)",
        "src/engine/world/WorldRenderController.ts: t(lineKey)",
        "src/engine/world/WorldRenderController.ts: t(model.storyInterior.objectiveKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(door.lockedLogKey ?? 'story.interior.lockedDoor')",
        "src/engine/world/WorldStoryScenarioController.ts: t(lockedLogKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(step.labelKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(step.labelKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(step.speakerNameKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(step.textKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(storyQuest.enterLogKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(storyQuest.enterLogKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(storyQuest.enterLogKey)",
        "src/engine/world/WorldStoryScenarioController.ts: t(storyQuest.objectiveCompleteLogKey)",
        "src/engine/world/WorldTownSession.ts: t(FACILITY_UPGRADES[id].nameKey)",
        "src/engine/world/WorldTownSession.ts: t(menu.nameKey)",
        "src/engine/world/WorldTownSession.ts: t(menu.nameKey)",
        "src/engine/world/WorldTutorialController.ts: t(skipped ? 'tutorial.world.skipLog' : 'tutorial.world.townLog')",
        "src/field/FieldDisplay.ts: t(key)",
        "src/field/TerrainRules.ts: t(hazard.hoverKey)",
        "src/field/TerrainRules.ts: t(props.labelKey)",
        "src/i18n/DisplayNames.ts: t(companion.nameKey)",
        "src/i18n/TownMessages.ts: t(key)",
        "src/map/StoryInteriorMap.ts: formatT(this.layout.displayNameKey)",
        "src/map/StoryInteriorMap.ts: t(marker.labelKey)",
        "src/map/StoryInteriorMap.ts: t(prop.labelKey)",
        "src/map/StoryInteriorMap.ts: t(room.nameKey)",
        "src/map/WorldMap.ts: t(marker.labelKey)",
        "src/ui/ActionMenuUI.ts: t(slot.labelKey)",
        "src/ui/TacticalContextMenuUI.ts: t(this.items[i].labelKey)",
        "src/ui/TownUI.ts: t(key)",
        "src/ui/react/auth/AuthGate.tsx: t(config.labelKey)",
        "src/ui/react/auth/AuthGate.tsx: t(entry.labelKey)",
        "src/ui/react/auth/AuthGate.tsx: t(key)",
        "src/ui/react/auth/AuthGate.tsx: t(selectedClass.labelKey)",
        "src/ui/react/character/EquipmentSlots.tsx: t(labelKey)",
        "src/ui/react/character/StatGrid.tsx: t(k)",
        "src/ui/react/character/StatGrid.tsx: t(k)",
        "src/ui/react/charcreate/CharacterCreation.tsx: t(cfg.labelKey)",
        "src/ui/react/charcreate/CharacterCreation.tsx: t(row.labelKey)",
        "src/ui/react/inventory/InventoryPanel.tsx: t(labelKey)",
        "src/ui/react/inventory/InventoryPanel.tsx: t(labelKey)",
        "src/ui/react/magic/MagicLoadoutPanel.tsx: t(result.reasonKey)",
        "src/ui/react/quest/QuestList.tsx: t(objective.labelKey)",
        "src/ui/react/quest/QuestList.tsx: t(quest.objectiveKey)",
        "src/ui/react/quest/QuestList.tsx: t(quest.recommendedLevelKey)",
        "src/ui/react/quest/QuestList.tsx: t(quest.summaryKey)",
        "src/ui/react/quest/QuestList.tsx: t(quest.titleKey)",
        "src/ui/react/quest/QuestList.tsx: t(reward.nameKey)",
        "src/ui/react/settings/ChangelogPanel.tsx: t(key)",
        "src/ui/react/settings/SettingsPanel.tsx: t(definition.labelKey)",
        "src/ui/react/town/BlacksmithPanel.tsx: t(entry.sourceLabel)",
        "src/ui/react/town/FacilityUpgradePanel.tsx: t(view.definition.descKey)",
        "src/ui/react/town/FacilityUpgradePanel.tsx: t(view.definition.effectKey)",
        "src/ui/react/town/FacilityUpgradePanel.tsx: t(view.definition.nameKey)",
        "src/ui/react/town/RestPanel.tsx: t(facility.nameKey)",
        "src/ui/react/town/RestPanel.tsx: t(getRestMenu(confirmId)?.nameKey ?? '')",
        "src/ui/react/town/RestPanel.tsx: t(getRestMenu(pendingId)?.nameKey ?? '')",
        "src/ui/react/town/RestPanel.tsx: t(menu.descKey)",
        "src/ui/react/town/RestPanel.tsx: t(menu.nameKey)",
        "src/ui/react/town/ShopPanel.tsx: t(tab.labelKey)",
        "src/ui/react/town/TownScreen.tsx: t(deployPending ? 'town.deploying' : 'town.deploy')",
        "src/ui/react/town/TownScreen.tsx: t(meta.labelKey)",
        "src/ui/react/town/TownScreen.tsx: t(restFacility.nameKey)",
        "src/ui/react/town/itemView.tsx: t(SLOT_LABEL_KEY[item.slot] ?? '')",
    ]);
});

test('data-driven UI translation keys exist in both languages', () => {
    const used = collectDataDrivenUiKeys();
    const ko = collectLanguageKeys('ko');
    const en = collectLanguageKeys('en');

    assert.deepEqual([...used].filter((key) => !ko.has(key)).sort(), []);
    assert.deepEqual([...used].filter((key) => !en.has(key)).sort(), []);
});
