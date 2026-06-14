import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AUDIO_CATALOG } from '../src/engine/AudioManager';
import { parseOriginalArcArchive } from '../src/data/original/originalArcArchive';
import { i18n } from '../src/i18n/LanguageManager';
import { getBurgosCastleHmapTileAt, BURGOS_CASTLE_HMAP_SIZE } from '../src/map/BurgosCastleHmap';
import { getStoryHmapTileAt, STORY_HMAP_EPISODES, STORY_HMAP_SIZE } from '../src/map/StoryHmaps';
import { TileType } from '../src/map/Tile';
import { WorldMap } from '../src/map/WorldMap';
import { getStoryInteriorLayout, STORY_INTERIOR_LAYOUTS } from '../src/data/StoryInteriorData';
import { getMonsterDefinitionSafe } from '../src/data/MonsterCatalog';
import {
    getStoryScenarioFieldEventPlacements,
    getStoryScenarioFieldEventTiles,
    projectStoryScenarioFieldTileToWorld,
} from '../src/data/StoryScenarioFieldEventPlacement';
import { STORY_QUESTS } from '../src/data/StoryQuestData';
import { getStoryScenarioMonsterLayout } from '../src/data/StoryScenarioMonsterData';
import {
    getStoryScenarioEventStepDurationMs,
    getStoryScenarioPresentationDurationMs,
    STORY_SCENARIO_EVENT_SEQUENCES,
    type StoryScenarioEventSequence,
    type StoryScenarioEventStep,
} from '../src/data/StoryScenarioEventData';
import { STORY_SCENARIOS, type StoryScenarioDefinition, type StoryScenarioMissionKind } from '../src/data/StoryScenarioData';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_START = 1;
const DEFAULT_END = 31;

interface Options {
    sourceRoot: string;
    start: number;
    end: number;
}

interface ScenarioImportDocRow {
    episode: number;
    dungeonId: string;
    sceneScript: string;
    globalScript: string;
    mapFiles: string[];
}

interface RoadmapDocRow {
    episode: number;
    questId: string;
    dungeonId: string;
    treatment: string;
    objective: string;
}

const ROADMAP_TREATMENT_BY_MISSION_KIND: Record<StoryScenarioMissionKind, string> = {
    field: '필드',
    soloInterior: '실내',
    vehicle: '비공정',
};

function scenarioSignature(scenario: StoryScenarioDefinition): StoryScenarioDefinition {
    return {
        episode: scenario.episode,
        questId: scenario.questId,
        dungeonId: scenario.dungeonId,
        dungeonNameKr: scenario.dungeonNameKr,
        dungeonNameEn: scenario.dungeonNameEn,
        chunkX: scenario.chunkX,
        chunkY: scenario.chunkY,
        sprite: scenario.sprite,
        bossName: scenario.bossName,
        bossLevel: scenario.bossLevel,
        bossColor: scenario.bossColor,
        guardLevel: scenario.guardLevel,
        guardCount: scenario.guardCount,
        missionKind: scenario.missionKind,
        reward: scenario.reward,
    };
}

function parseArgs(argv: string[]): Options {
    const options: Options = { sourceRoot: DEFAULT_ROOT, start: DEFAULT_START, end: DEFAULT_END };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--source-root') options.sourceRoot = argv[++index] ?? '';
        else if (arg === '--start') options.start = Number(argv[++index]);
        else if (arg === '--end') options.end = Number(argv[++index]);
        else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node --import tsx scripts/verify-story-source-files.ts [--source-root <Saver>] [--start <episode>] [--end <episode>]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isInteger(options.start) || !Number.isInteger(options.end) || options.start < 1 || options.end < options.start) {
        throw new Error(`Invalid episode range: ${options.start}-${options.end}`);
    }
    return options;
}

function requireSourceFile(sourceRoot: string, episode: number, sourceFile: string): void {
    const path = join(sourceRoot, sourceFile);
    if (!existsSync(path)) {
        throw new Error(`Missing episode ${episode} original source file ${sourceFile}: ${path}`);
    }
}

function requireAbsentSourceFile(sourceRoot: string, episode: number, sourceFile: string): void {
    const path = join(sourceRoot, sourceFile);
    if (existsSync(path)) {
        throw new Error(`Episode ${episode} declares missing original source file ${sourceFile}, but it exists: ${path}`);
    }
}

function getArcMembers(sourceRoot: string, setArcFile: string): Set<string> {
    const path = join(sourceRoot, setArcFile);
    const manifest = parseOriginalArcArchive(readFileSync(path));
    return new Set(manifest.entries.map((entry) => entry.name.toLowerCase()));
}

function getSourcedEvents(sequence: StoryScenarioEventSequence) {
    return [
        ...sequence.fieldEvents,
        ...(sequence.enemyDefeatEvents ?? []),
        ...(sequence.bossDefeatEvent ? [sequence.bossDefeatEvent] : []),
    ];
}

function extractBacktickValues(value: string): string[] {
    return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function readScenarioImportDocRows(): Map<number, ScenarioImportDocRow> {
    const path = 'docs/original-scenario-import.md';
    const rows = new Map<number, ScenarioImportDocRow>();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        if (!line.startsWith('|')) continue;
        const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((cell) => cell.trim());
        const episode = Number(cells[0]);
        if (!Number.isInteger(episode)) continue;
        const dungeonId = extractBacktickValues(cells[1] ?? '')[0];
        const sceneScript = extractBacktickValues(cells[3] ?? '')[0];
        const globalValues = extractBacktickValues(cells[4] ?? '');
        const globalScript = globalValues[0] ?? cells[4];
        const mapFiles = extractBacktickValues(cells[5] ?? '');
        if (rows.has(episode)) throw new Error(`Duplicate docs/original-scenario-import.md row for episode ${episode}`);
        rows.set(episode, { episode, dungeonId, sceneScript, globalScript, mapFiles });
    }
    return rows;
}

function readRoadmapDocRows(): Map<number, RoadmapDocRow> {
    const path = 'docs/main-quest-roadmap.md';
    const rows = new Map<number, RoadmapDocRow>();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        if (!line.startsWith('|')) continue;
        const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((cell) => cell.trim());
        const episode = Number(cells[0]);
        if (!Number.isInteger(episode)) continue;
        if (rows.has(episode)) throw new Error(`Duplicate docs/main-quest-roadmap.md row for episode ${episode}`);
        rows.set(episode, {
            episode,
            questId: extractBacktickValues(cells[1] ?? '')[0],
            dungeonId: extractBacktickValues(cells[2] ?? '')[0],
            treatment: cells[3] ?? '',
            objective: cells[4] ?? '',
        });
    }
    return rows;
}

function readStoryScenarioContentRows(): Map<number, StoryScenarioDefinition> {
    const path = 'src/data/content/story-scenarios.json';
    const rows = new Map<number, StoryScenarioDefinition>();
    const contentScenarios = JSON.parse(readFileSync(path, 'utf8')) as StoryScenarioDefinition[];
    for (const scenario of contentScenarios) {
        if (!Number.isInteger(scenario.episode)) throw new Error(`${path} has a scenario without an integer episode`);
        if (rows.has(scenario.episode)) throw new Error(`${path} has a duplicate episode ${scenario.episode}`);
        rows.set(scenario.episode, scenario);
    }
    return rows;
}

function requireArrayEqual(episode: number, label: string, actual: string[], expected: string[]): void {
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
        throw new Error(`Episode ${episode} ${label} mismatch.\n  docs: ${actual.join(', ')}\n  data: ${expected.join(', ')}`);
    }
}

function requireUniqueValues(label: string, values: string[]): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
        seen.add(value);
    }
}

function requireNumberArrayEqual(label: string, actual: number[], expected: number[]): void {
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
        throw new Error(`${label} mismatch.\n  actual: ${actual.join(', ')}\n  expected: ${expected.join(', ')}`);
    }
}

function requireStringArrayEqual(label: string, actual: string[], expected: string[]): void {
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
        throw new Error(`${label} mismatch.\n  actual: ${actual.join(', ')}\n  expected: ${expected.join(', ')}`);
    }
}

function verifyStoryCollectionContracts(
    start: number,
    end: number,
    docRows: Map<number, ScenarioImportDocRow>,
    roadmapRows: Map<number, RoadmapDocRow>,
    contentRows: Map<number, StoryScenarioDefinition>
): void {
    const expectedEpisodes = Array.from({ length: DEFAULT_END - DEFAULT_START + 1 }, (_, index) => DEFAULT_START + index);
    const requestedEpisodes = Array.from({ length: end - start + 1 }, (_, index) => start + index);

    requireNumberArrayEqual('story scenario episode chain', STORY_SCENARIOS.map((scenario) => scenario.episode), expectedEpisodes);
    requireNumberArrayEqual('story quest episode chain', STORY_QUESTS.map((quest) => quest.episode), expectedEpisodes);
    requireNumberArrayEqual('story content ledger episode chain', [...contentRows.keys()].sort((left, right) => left - right), expectedEpisodes);
    requireNumberArrayEqual('story import doc requested episodes', requestedEpisodes.filter((episode) => docRows.has(episode)), requestedEpisodes);
    requireNumberArrayEqual('story roadmap doc requested episodes', requestedEpisodes.filter((episode) => roadmapRows.has(episode)), requestedEpisodes);

    requireUniqueValues('story quest id', STORY_SCENARIOS.map((scenario) => scenario.questId));
    requireUniqueValues('story scenario dungeon id', STORY_SCENARIOS.map((scenario) => scenario.dungeonId));
    requireUniqueValues('story quest dungeon id', STORY_QUESTS.map((quest) => quest.dungeonId));
    requireUniqueValues('story event sequence dungeon id', STORY_SCENARIO_EVENT_SEQUENCES.map((sequence) => sequence.dungeonId));

    requireStringArrayEqual(
        'story event sequence dungeon coverage',
        STORY_SCENARIO_EVENT_SEQUENCES.map((sequence) => sequence.dungeonId).sort(),
        STORY_SCENARIOS.map((scenario) => scenario.dungeonId).sort()
    );
    requireStringArrayEqual(
        'story interior layout dungeon coverage',
        STORY_INTERIOR_LAYOUTS.map((layout) => layout.dungeonId).sort(),
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'soloInterior').map((scenario) => scenario.dungeonId).sort()
    );
    requireNumberArrayEqual(
        'story solo interior episode set',
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'soloInterior').map((scenario) => scenario.episode),
        [1, 2, 3, 7, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
    );
    requireNumberArrayEqual(
        'story vehicle episode set',
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'vehicle').map((scenario) => scenario.episode),
        [17]
    );

    for (const [index, quest] of STORY_QUESTS.entries()) {
        const expectedPrerequisiteQuestId = index === 0 ? undefined : STORY_QUESTS[index - 1].id;
        if (quest.prerequisiteQuestId !== expectedPrerequisiteQuestId) {
            throw new Error(`Episode ${quest.episode} quest chain mismatch: ${quest.prerequisiteQuestId} !== ${expectedPrerequisiteQuestId}`);
        }
        if (!quest.bgmKey) throw new Error(`Episode ${quest.episode} missing story BGM key`);
        const bgm = AUDIO_CATALOG[quest.bgmKey];
        if (bgm?.channel !== 'bgm') throw new Error(`Episode ${quest.episode} missing playable story BGM catalog entry ${quest.bgmKey}`);
        const bgmPath = join(process.cwd(), 'public', bgm.src.replace(/^\//, ''));
        if (!existsSync(bgmPath)) throw new Error(`Episode ${quest.episode} missing playable story BGM asset ${bgm.src}: ${bgmPath}`);
    }
}

function verifyScenarioImportDocRow(episode: number, sequence: StoryScenarioEventSequence, docRows: Map<number, ScenarioImportDocRow>): void {
    const row = docRows.get(episode);
    if (!row) throw new Error(`Missing docs/original-scenario-import.md row for episode ${episode}`);
    if (row.dungeonId !== sequence.dungeonId) {
        throw new Error(`Episode ${episode} docs dungeon mismatch: ${row.dungeonId} !== ${sequence.dungeonId}`);
    }
    if (row.sceneScript !== sequence.originalSources.sceneScript) {
        throw new Error(`Episode ${episode} docs scene mismatch: ${row.sceneScript} !== ${sequence.originalSources.sceneScript}`);
    }
    if (row.globalScript !== sequence.originalSources.globalScript) {
        throw new Error(`Episode ${episode} docs global mismatch: ${row.globalScript} !== ${sequence.originalSources.globalScript}`);
    }
    requireArrayEqual(episode, 'docs map candidates', row.mapFiles, sequence.originalSources.mapFiles);
}

function verifyRoadmapDocRow(episode: number, scenario: StoryScenarioDefinition, docRows: Map<number, RoadmapDocRow>): void {
    const row = docRows.get(episode);
    if (!row) throw new Error(`Missing docs/main-quest-roadmap.md row for episode ${episode}`);
    if (row.questId !== scenario.questId) {
        throw new Error(`Episode ${episode} roadmap quest mismatch: ${row.questId} !== ${scenario.questId}`);
    }
    if (row.dungeonId !== scenario.dungeonId) {
        throw new Error(`Episode ${episode} roadmap dungeon mismatch: ${row.dungeonId} !== ${scenario.dungeonId}`);
    }
    const expectedTreatment = ROADMAP_TREATMENT_BY_MISSION_KIND[scenario.missionKind];
    if (row.treatment !== expectedTreatment) {
        throw new Error(`Episode ${episode} roadmap treatment mismatch: ${row.treatment} !== ${expectedTreatment}`);
    }
    const expectedObjective = scenario.missionKind === 'vehicle' ? '탑승/진입형 특수 목표' : `${scenario.bossName} 처치`;
    if (row.objective !== expectedObjective) {
        throw new Error(`Episode ${episode} roadmap objective mismatch: ${row.objective} !== ${expectedObjective}`);
    }
}

function verifyStoryQuestDefinition(episode: number, scenario: StoryScenarioDefinition): void {
    const quest = STORY_QUESTS.find((entry) => entry.episode === episode);
    if (!quest) throw new Error(`Missing story quest for episode ${episode}`);
    if (quest.id !== scenario.questId) {
        throw new Error(`Episode ${episode} quest id mismatch: ${quest.id} !== ${scenario.questId}`);
    }
    if (quest.dungeonId !== scenario.dungeonId) {
        throw new Error(`Episode ${episode} quest dungeon mismatch: ${quest.dungeonId} !== ${scenario.dungeonId}`);
    }
    const expectedPrerequisiteQuestId = episode === 1 ? undefined : STORY_SCENARIOS.find((entry) => entry.episode === episode - 1)?.questId;
    if (quest.prerequisiteQuestId !== expectedPrerequisiteQuestId) {
        throw new Error(`Episode ${episode} quest prerequisite mismatch: ${quest.prerequisiteQuestId} !== ${expectedPrerequisiteQuestId}`);
    }
    if (JSON.stringify(quest.reward) !== JSON.stringify(scenario.reward)) {
        throw new Error(`Episode ${episode} quest reward mismatch with runtime scenario reward`);
    }
    const paddedEpisode = String(episode).padStart(2, '0');
    const expectedKeys = {
        titleKey: `story.ep${paddedEpisode}.title`,
        summaryKey: `story.ep${paddedEpisode}.summary`,
        objectiveKey: `story.ep${paddedEpisode}.objective`,
        recommendedLevelKey: `story.ep${paddedEpisode}.recommendedLevel`,
        enterLogKey: `story.ep${paddedEpisode}.enterDungeonLog`,
        objectiveCompleteLogKey: `story.ep${paddedEpisode}.objectiveCompleteLog`,
        bgmKey: `bgm.story.episode${paddedEpisode}`,
    };
    for (const [key, expectedValue] of Object.entries(expectedKeys)) {
        if (quest[key as keyof typeof expectedKeys] !== expectedValue) {
            throw new Error(`Episode ${episode} quest ${key} mismatch: ${quest[key as keyof typeof expectedKeys]} !== ${expectedValue}`);
        }
    }
}

function verifyStoryScenarioContentLedger(episode: number, scenario: StoryScenarioDefinition, contentRows: Map<number, StoryScenarioDefinition>): void {
    const row = contentRows.get(episode);
    if (!row) throw new Error(`Missing src/data/content/story-scenarios.json row for episode ${episode}`);
    if (JSON.stringify(scenarioSignature(row)) !== JSON.stringify(scenarioSignature(scenario))) {
        throw new Error(`Episode ${episode} story scenario content ledger mismatch with runtime scenario definition`);
    }
}

function verifyStoryWorldEntrance(episode: number, scenario: StoryScenarioDefinition, worldMap: WorldMap): void {
    const dungeon = worldMap.getDungeons().find((entry) => entry.id === scenario.dungeonId);
    if (!dungeon) throw new Error(`Episode ${episode} ${scenario.dungeonId} missing world dungeon landmark`);
    if (dungeon.nameKr !== scenario.dungeonNameKr) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} Korean dungeon name mismatch: ${dungeon.nameKr} !== ${scenario.dungeonNameKr}`);
    }
    if (dungeon.chunkX !== scenario.chunkX || dungeon.chunkY !== scenario.chunkY) {
        throw new Error(
            `Episode ${episode} ${scenario.dungeonId} world chunk mismatch: ` +
            `${dungeon.chunkX},${dungeon.chunkY} !== ${scenario.chunkX},${scenario.chunkY}`
        );
    }
    if (dungeon.sprite !== scenario.sprite) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} sprite mismatch: ${dungeon.sprite} !== ${scenario.sprite}`);
    }

    const entrance = worldMap.getDungeonEntranceTile(dungeon);
    const resolvedDungeon = worldMap.getDungeonAtTile(entrance.x, entrance.y);
    if (resolvedDungeon?.id !== scenario.dungeonId) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} entrance resolves to ${resolvedDungeon?.id ?? 'none'}`);
    }
    const entranceTile = worldMap.getTileAt(entrance.x, entrance.y);
    if (entranceTile !== TileType.DUNGEON_ENTRANCE) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} entrance tile mismatch: ${TileType[entranceTile]} !== DUNGEON_ENTRANCE`);
    }
}

function verifyStoryHmapContract(episode: number, scenario: StoryScenarioDefinition, worldMap: WorldMap): void {
    const dungeon = worldMap.getDungeons().find((entry) => entry.id === scenario.dungeonId);
    if (!dungeon) return;
    const entrance = worldMap.getDungeonEntranceTile(dungeon);
    const sampleOffsets = [
        { x: -12, y: -12 },
        { x: 12, y: 12 },
        { x: 0, y: episode === 1 ? Math.floor(BURGOS_CASTLE_HMAP_SIZE / 4) : Math.floor(STORY_HMAP_SIZE / 4) },
    ];

    const samples = episode === 1
        ? [
            getBurgosCastleHmapTileAt(entrance.x, entrance.y, entrance),
            ...sampleOffsets.map((offset) => getBurgosCastleHmapTileAt(entrance.x + offset.x, entrance.y + offset.y, entrance)),
        ]
        : STORY_HMAP_EPISODES.includes(episode)
            ? [
                getStoryHmapTileAt(episode, entrance.x, entrance.y, entrance),
                ...sampleOffsets.map((offset) => getStoryHmapTileAt(episode, entrance.x + offset.x, entrance.y + offset.y, entrance)),
            ]
            : [];

    if (samples.length === 0) return;
    if (samples[0]?.tile !== TileType.DUNGEON_ENTRANCE) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} hmap center is not a dungeon entrance`);
    }
    if (!samples.slice(1).some((sample) => sample !== null && sample.tile !== TileType.DUNGEON_ENTRANCE)) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} hmap has no terrain sample around the entrance`);
    }
}

function getPresentationStepTiles(step: StoryScenarioEventStep): Array<{ label: string; tile: { x: number; y: number } }> {
    if (step.kind === 'focus') return [{ label: 'target', tile: step.target }];
    if (step.kind === 'moveActor') {
        return [
            { label: 'target', tile: step.target },
            ...(step.focus ? [{ label: 'focus', tile: step.focus }] : []),
        ];
    }
    return step.focus ? [{ label: 'focus', tile: step.focus }] : [];
}

function verifyFieldScenarioWorldProjection(episode: number, scenario: StoryScenarioDefinition, sequence: StoryScenarioEventSequence, worldMap: WorldMap): void {
    if (scenario.missionKind === 'soloInterior') return;
    const dungeon = worldMap.getDungeons().find((entry) => entry.id === scenario.dungeonId);
    if (!dungeon) throw new Error(`Episode ${episode} ${scenario.dungeonId} missing world dungeon for field projection`);
    const entrance = worldMap.getDungeonEntranceTile(dungeon);

    const placements = getStoryScenarioFieldEventPlacements(scenario.dungeonId, worldMap);
    const expectedPlacementCount = sequence.fieldEvents.reduce((sum, event) => sum + event.triggerTiles.length, 0);
    if (placements.length !== expectedPlacementCount) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} field placement count mismatch: ${placements.length} !== ${expectedPlacementCount}`);
    }
    const uniqueTiles = new Set(placements.map((placement) => `${placement.tile.x},${placement.tile.y}`));
    if (uniqueTiles.size !== placements.length) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} field event placements overlap`);
    }
    for (const placement of placements) {
        if (!worldMap.isWalkable(placement.tile.x, placement.tile.y)) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} field placement is not walkable: ${placement.eventId}@${placement.tile.x},${placement.tile.y}`);
        }
    }
    for (const event of sequence.fieldEvents) {
        const eventTiles = getStoryScenarioFieldEventTiles(scenario.dungeonId, event, worldMap);
        const placementTiles = placements
            .filter((placement) => placement.eventId === event.id)
            .sort((left, right) => left.triggerIndex - right.triggerIndex)
            .map((placement) => placement.tile);
        if (JSON.stringify(eventTiles) !== JSON.stringify(placementTiles)) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} field event ${event.id} shared placement mismatch`);
        }
    }

    for (const [group, steps] of [
        ['entry', sequence.entry],
        ['bossDefeat', sequence.bossDefeat],
    ] as const) {
        for (const [index, step] of steps.entries()) {
            for (const point of getPresentationStepTiles(step)) {
                const projected = projectStoryScenarioFieldTileToWorld(scenario.dungeonId, worldMap, point.tile);
                if (!worldMap.isWalkable(projected.x, projected.y)) {
                    throw new Error(`Episode ${episode} ${scenario.dungeonId} ${group} step ${index} ${point.label} projects to blocked tile`);
                }
                if (Math.abs(projected.x - entrance.x) > 12 || Math.abs(projected.y - entrance.y) > 12) {
                    throw new Error(`Episode ${episode} ${scenario.dungeonId} ${group} step ${index} ${point.label} projects too far from entrance`);
                }
            }
        }
    }
}

function verifyStoryScenarioMonsterContract(episode: number, scenario: StoryScenarioDefinition): void {
    if (scenario.guardCount < 0 || !Number.isInteger(scenario.guardCount)) {
        throw new Error(`Episode ${episode} invalid guard count ${scenario.guardCount}`);
    }
    if (scenario.guardLevel < 1 || !Number.isInteger(scenario.guardLevel)) {
        throw new Error(`Episode ${episode} invalid guard level ${scenario.guardLevel}`);
    }
    if (scenario.bossLevel < scenario.guardLevel) {
        throw new Error(`Episode ${episode} boss level ${scenario.bossLevel} is below guard level ${scenario.guardLevel}`);
    }
    if (scenario.missionKind === 'vehicle') {
        if (scenario.bossName !== null) throw new Error(`Episode ${episode} vehicle mission should not declare a boss name`);
    } else if (!scenario.bossName) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} needs an objective boss name`);
    }

    const monsterLayout = getStoryScenarioMonsterLayout(scenario);
    if (scenario.guardCount > 0 && monsterLayout.guardMonsterIds.length === 0) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} has guards but no guard monster ids`);
    }
    for (const guardMonsterId of monsterLayout.guardMonsterIds) {
        if (!getMonsterDefinitionSafe(guardMonsterId)) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} unknown guard monster id ${guardMonsterId}`);
        }
    }
    if (monsterLayout.guardOffsets && monsterLayout.guardOffsets.length !== scenario.guardCount) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} guard offset count mismatch: ${monsterLayout.guardOffsets.length} !== ${scenario.guardCount}`);
    }

    if (scenario.missionKind !== 'vehicle') {
        if (!monsterLayout.bossMonsterId) throw new Error(`Episode ${episode} ${scenario.dungeonId} missing boss monster id`);
        if (!getMonsterDefinitionSafe(monsterLayout.bossMonsterId)) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} unknown boss monster id ${monsterLayout.bossMonsterId}`);
        }
    }

    if (scenario.missionKind === 'soloInterior') {
        const layout = getStoryInteriorLayout(scenario.dungeonId);
        if (!layout) throw new Error(`Episode ${episode} ${scenario.dungeonId} missing story interior layout`);
        if (layout.guardTiles.length < scenario.guardCount) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} guard tile count is too low: ${layout.guardTiles.length} < ${scenario.guardCount}`);
        }
        const usedGuardTiles = layout.guardTiles.slice(0, scenario.guardCount);
        const occupied = new Set([layout.playerStart, layout.bossTile, ...usedGuardTiles].map((tile) => `${tile.x},${tile.y}`));
        if (occupied.size !== usedGuardTiles.length + 2) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} combat spawn tiles overlap`);
        }
    }
}

function addStoryStepKeys(keys: Map<string, string>, context: string, step: StoryScenarioEventStep): void {
    if (step.kind === 'dialogue') {
        keys.set(step.speakerNameKey, `${context} speaker`);
        keys.set(step.textKey, `${context} text`);
    } else if (step.kind === 'focus' || step.kind === 'combatStart' || step.kind === 'objective') {
        keys.set(step.labelKey, `${context} label`);
    }
}

function collectStoryI18nKeys(episode: number, scenario: StoryScenarioDefinition, sequence: StoryScenarioEventSequence): Map<string, string> {
    const keys = new Map<string, string>();
    const quest = STORY_QUESTS.find((entry) => entry.episode === episode);
    const layout = STORY_INTERIOR_LAYOUTS.find((entry) => entry.dungeonId === scenario.dungeonId);
    const add = (key: string | undefined | null, context: string) => {
        if (key) keys.set(key, context);
    };

    if (quest) {
        add(quest.titleKey, `episode ${episode} quest title`);
        add(quest.summaryKey, `episode ${episode} quest summary`);
        add(quest.objectiveKey, `episode ${episode} quest objective`);
        add(quest.recommendedLevelKey, `episode ${episode} quest recommended level`);
        add(quest.enterLogKey, `episode ${episode} quest enter log`);
        add(quest.objectiveCompleteLogKey, `episode ${episode} quest completion log`);
    }
    if (layout) {
        add(layout.displayNameKey, `episode ${episode} interior display name`);
        add(layout.objectiveKey, `episode ${episode} interior objective`);
        for (const room of layout.rooms) add(room.nameKey, `episode ${episode} interior room ${room.id}`);
        for (const prop of layout.props) add(prop.labelKey, `episode ${episode} interior prop`);
        for (const door of layout.doors ?? []) add(door.lockedLogKey, `episode ${episode} interior door ${door.id}`);
    }
    for (const marker of sequence.markers ?? []) add(marker.markerLabelKey, `episode ${episode} marker ${marker.id}`);
    for (const [index, step] of sequence.entry.entries()) addStoryStepKeys(keys, `episode ${episode} entry step ${index}`, step);
    for (const [index, step] of sequence.bossDefeat.entries()) addStoryStepKeys(keys, `episode ${episode} boss step ${index}`, step);
    for (const event of sequence.fieldEvents) {
        add(event.markerLabelKey, `episode ${episode} field event ${event.id} marker`);
        for (const [index, step] of event.steps.entries()) addStoryStepKeys(keys, `episode ${episode} field event ${event.id} step ${index}`, step);
    }
    for (const event of sequence.enemyDefeatEvents ?? []) {
        for (const [index, step] of event.steps.entries()) addStoryStepKeys(keys, `episode ${episode} enemy event ${event.id} step ${index}`, step);
    }
    return keys;
}

function verifyStoryI18nKeys(episode: number, scenario: StoryScenarioDefinition, sequence: StoryScenarioEventSequence): void {
    const ko = i18n.strings.ko as Record<string, string>;
    const en = i18n.strings.en as Record<string, string>;
    for (const [key, context] of collectStoryI18nKeys(episode, scenario, sequence)) {
        if (!ko[key]) throw new Error(`Missing ko i18n key ${key}: ${context}`);
        if (!en[key]) throw new Error(`Missing en i18n key ${key}: ${context}`);
    }
}

function requireUniqueCompletionFlag(flags: Map<string, string>, flag: string, context: string): void {
    const existing = flags.get(flag);
    if (existing && existing !== context) {
        throw new Error(`Duplicate story completion flag ${flag}: ${existing} and ${context}`);
    }
    flags.set(flag, context);
}

function verifyPositivePresentation(episode: number, dungeonId: string, label: string, steps: readonly StoryScenarioEventStep[]): void {
    if (steps.length === 0) throw new Error(`Episode ${episode} ${dungeonId} ${label} presentation is empty`);
    for (const [index, step] of steps.entries()) {
        const durationMs = getStoryScenarioEventStepDurationMs(step);
        if (durationMs <= 0) {
            throw new Error(`Episode ${episode} ${dungeonId} ${label} step ${index} has non-positive duration ${durationMs}`);
        }
    }
    const totalDurationMs = getStoryScenarioPresentationDurationMs(steps);
    if (totalDurationMs <= 0) {
        throw new Error(`Episode ${episode} ${dungeonId} ${label} presentation has non-positive total duration ${totalDurationMs}`);
    }
}

function verifyStoryCompletionContract(
    episode: number,
    scenario: StoryScenarioDefinition,
    sequence: StoryScenarioEventSequence,
    completionFlags: Map<string, string>
): void {
    const context = `episode ${episode} ${scenario.dungeonId}`;
    verifyPositivePresentation(episode, scenario.dungeonId, 'entry', sequence.entry);
    verifyPositivePresentation(episode, scenario.dungeonId, 'boss defeat', sequence.bossDefeat);

    if (sequence.objectiveRuntimeFlag) {
        requireUniqueCompletionFlag(completionFlags, sequence.objectiveRuntimeFlag, context);
    }

    if (sequence.bossDefeatEvent) {
        requireUniqueCompletionFlag(completionFlags, sequence.bossDefeatEvent.runtimeFlag, context);
        if (!sequence.bossDefeatEvent.trigger.includes('SCENECLEAR')) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} boss defeat event does not declare SCENECLEAR`);
        }
        if (sequence.objectiveRuntimeFlag && sequence.bossDefeatEvent.runtimeFlag !== sequence.objectiveRuntimeFlag) {
            throw new Error(
                `Episode ${episode} ${scenario.dungeonId} boss defeat flag mismatch: ` +
                `${sequence.bossDefeatEvent.runtimeFlag} !== ${sequence.objectiveRuntimeFlag}`
            );
        }
    }

    if (episode >= 23 && episode <= 31) {
        const expectedFlag = `${scenario.dungeonId}_objective_complete`;
        if (sequence.objectiveRuntimeFlag !== expectedFlag) {
            throw new Error(`Episode ${episode} late story objective flag mismatch: ${sequence.objectiveRuntimeFlag} !== ${expectedFlag}`);
        }
        if (!sequence.bossDefeatEvent) throw new Error(`Episode ${episode} late story boss defeat event is missing`);
        if (sequence.bossDefeatEvent.originalEventId !== 'EVENT 99') {
            throw new Error(`Episode ${episode} late story boss event mismatch: ${sequence.bossDefeatEvent.originalEventId} !== EVENT 99`);
        }
        if (sequence.bossDefeatEvent.runtimeFlag !== expectedFlag) {
            throw new Error(`Episode ${episode} late story boss flag mismatch: ${sequence.bossDefeatEvent.runtimeFlag} !== ${expectedFlag}`);
        }
        if (!/\bCHARDEAD 700\b/.test(sequence.bossDefeatEvent.trigger)) {
            throw new Error(`Episode ${episode} late story boss trigger does not declare CHARDEAD 700`);
        }
        if (!/\bSCENECLEAR\b/.test(sequence.bossDefeatEvent.trigger)) {
            throw new Error(`Episode ${episode} late story boss trigger does not declare SCENECLEAR`);
        }
    }
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const docRows = readScenarioImportDocRows();
const roadmapRows = readRoadmapDocRows();
const contentRows = readStoryScenarioContentRows();
const completionFlags = new Map<string, string>();
const worldMap = new WorldMap();
const verified: string[] = [];

verifyStoryCollectionContracts(options.start, options.end, docRows, roadmapRows, contentRows);

for (let episode = options.start; episode <= options.end; episode++) {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
    if (!scenario) throw new Error(`Missing story scenario ${episode}`);

    const sequence = STORY_SCENARIO_EVENT_SEQUENCES.find((entry) => entry.dungeonId === scenario.dungeonId);
    if (!sequence) throw new Error(`Missing story event sequence ${episode}: ${scenario.dungeonId}`);

    const declaredMapFiles = new Set(sequence.originalSources.mapFiles);
    verifyScenarioImportDocRow(episode, sequence, docRows);
    verifyRoadmapDocRow(episode, scenario, roadmapRows);
    verifyStoryQuestDefinition(episode, scenario);
    verifyStoryScenarioContentLedger(episode, scenario, contentRows);
    verifyStoryWorldEntrance(episode, scenario, worldMap);
    verifyStoryHmapContract(episode, scenario, worldMap);
    verifyFieldScenarioWorldProjection(episode, scenario, sequence, worldMap);
    verifyStoryScenarioMonsterContract(episode, scenario);
    verifyStoryI18nKeys(episode, scenario, sequence);
    verifyStoryCompletionContract(episode, scenario, sequence, completionFlags);
    requireSourceFile(sourceRoot, episode, sequence.originalSources.sceneScript);
    if (sequence.originalSources.globalScript !== 'missing') {
        requireSourceFile(sourceRoot, episode, sequence.originalSources.globalScript);
    } else {
        requireAbsentSourceFile(sourceRoot, episode, `Glib/gscene${episode}.lsc`);
    }
    for (const sourceFile of declaredMapFiles) {
        requireSourceFile(sourceRoot, episode, sourceFile);
    }

    const setArcFile = [...declaredMapFiles].find((sourceFile) => sourceFile.toLowerCase().endsWith('set.arc'));
    if (!setArcFile) throw new Error(`Missing episode ${episode} declared set.arc source`);
    const setArcMembers = getArcMembers(sourceRoot, setArcFile);

    for (const declaredMember of sequence.originalSources.setArcMembers ?? []) {
        if (!setArcMembers.has(declaredMember.toLowerCase())) {
            throw new Error(`Episode ${episode} declares missing ${setArcFile} member ${declaredMember}`);
        }
    }
    for (const event of getSourcedEvents(sequence)) {
        const [sourceFile, sourceMember] = event.originalSource.split(':');
        if (!declaredMapFiles.has(sourceFile)) {
            throw new Error(`Episode ${episode} event ${event.id} uses undeclared source file ${sourceFile}`);
        }
        if (sourceFile.toLowerCase() === setArcFile.toLowerCase() && !setArcMembers.has(sourceMember.toLowerCase())) {
            throw new Error(`Episode ${episode} event ${event.id} uses missing ${setArcFile} member ${sourceMember}`);
        }
    }
    verified.push(`${episode}:${scenario.dungeonId}`);
}

console.log(`verified story source files, import docs, roadmap docs, collection chains, quests, scenario ledgers, world entrances, hmaps, field placements, monsters, i18n, bgm, and completion contracts: ${verified.join(', ')}`);
