import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AUDIO_CATALOG } from '../src/engine/AudioManager';
import { getFieldDanger } from '../src/field/SpawnResolver';
import { getClassLine } from '../src/data/ClassTree';
import { getItemDef } from '../src/data/ItemDB';
import { parseOriginalArcArchive } from '../src/data/original/originalArcArchive';
import { i18n } from '../src/i18n/LanguageManager';
import { getBurgosCastleHmapTileAt, BURGOS_CASTLE_HMAP_SIZE } from '../src/map/BurgosCastleHmap';
import { getStoryHmapTileAt, STORY_HMAP_EPISODES, STORY_HMAP_SIZE } from '../src/map/StoryHmaps';
import { StoryInteriorMap } from '../src/map/StoryInteriorMap';
import { TileType } from '../src/map/Tile';
import { WorldMap } from '../src/map/WorldMap';
import { getStoryInteriorLayout, STORY_INTERIOR_LAYOUTS } from '../src/data/StoryInteriorData';
import { getMonsterDefinitionSafe } from '../src/data/MonsterCatalog';
import { getOriginalLateStoryCacheEvents, getOriginalLateStoryFact } from '../src/data/OriginalLateStoryFacts';
import { getOriginalLateStoryItemsForSourceEvent } from '../src/data/OriginalLateStoryItems';
import { getOriginalLateStoryMrcFact, getOriginalLateStoryMrcVisualSymbol } from '../src/data/OriginalLateStoryMapFacts';
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
    type StoryScenarioFieldEventReward,
    type StoryScenarioEventSequence,
    type StoryScenarioEventStep,
} from '../src/data/StoryScenarioEventData';
import {
    STORY_SCENARIOS,
    type StoryQuestRewardData,
    type StoryScenarioDefinition,
    type StoryScenarioMissionKind,
} from '../src/data/StoryScenarioData';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_START = 1;
const DEFAULT_END = 31;
const RESOLVABLE_PRESENTATION_ACTOR_IDS = new Set(['hero', 'player', 'controlled', 'boss']);
const LATE_STORY_WORLD_BIOMES = new Map<number, string>([
    [23, 'stone'],
    [24, 'stone'],
    [25, 'snow'],
    [26, 'snow'],
    [27, 'snow'],
    [28, 'lava'],
    [29, 'lava'],
    [30, 'special'],
    [31, 'special'],
]);
const LATE_STORY_ENTRY_DIALOGUE_COUNTS = new Map<number, number>([
    [23, 4],
    [24, 1],
    [25, 6],
    [26, 0],
    [27, 0],
    [28, 21],
    [29, 17],
    [30, 14],
    [31, 14],
]);
const LATE_STORY_BOSS_DEFEAT_DIALOGUE_COUNTS = new Map<number, number>([
    [23, 1],
    [24, 1],
    [25, 4],
    [26, 0],
    [27, 0],
    [28, 2],
    [29, 3],
    [30, 10],
    [31, 8],
]);
const LATE_STORY_ENTRY_FOCUSES = new Map<number, string[]>([
    [23, ['18,15', '21,15', '18,15', '21,15']],
    [24, ['19,7']],
    [25, ['19,7', '19,23', '19,7', '19,23', '19,7', '19,23']],
    [26, []],
    [27, []],
    [28, ['19,7', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,7', '14,32', '19,7']],
    [29, ['19,7', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,7', '14,32', '19,7', '14,32', '19,7']],
    [30, ['19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,7', '14,32', '19,7', '14,32', '19,7']],
    [31, ['19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,13', '19,7', '19,7', '14,32', '19,7', '14,32', '19,7']],
]);
const LATE_STORY_BOSS_DEFEAT_FOCUSES = new Map<number, string[]>([
    [23, ['19,7']],
    [24, ['19,7']],
    [25, ['19,7', '19,9', '19,7', '19,9']],
    [26, []],
    [27, []],
    [28, ['19,7', '19,9']],
    [29, ['19,9', '19,7', '19,9']],
    [30, ['19,9', '19,7', '19,7', '19,7', '19,9', '19,7', '19,7', '19,9', '19,7', '19,9']],
    [31, ['19,7', '19,9', '19,7', '19,9', '19,7', '19,9', '19,7', '19,9']],
]);
const LATE_STORY_FOCUS_STEP_DURATION_MS = 650;
const LATE_STORY_MOVE_ACTOR_STEP_DURATION_MS = 700;
const LATE_STORY_DIALOGUE_STEP_DURATION_MS = 1600;
const LATE_STORY_COMBAT_START_STEP_DURATION_MS = 900;
const LATE_STORY_OBJECTIVE_STEP_DURATION_MS = 900;
const LATE_STORY_CACHE_STEP_DURATION_MS = 700;

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
    notes: string;
}

interface RoadmapDocRow {
    episode: number;
    questId: string;
    dungeonId: string;
    treatment: string;
    objective: string;
}

interface RewardContractState {
    companionIds: Map<string, string>;
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

function originalEventIdNumbers(originalEventId: string): number[] {
    return [...originalEventId.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function notesMentionOriginalEvent(notes: string, eventNumber: number): boolean {
    return [...notes.matchAll(/\bevents?\s+([\d\s,/-]+)/gi)].some((match) =>
        match[1].split(/[,/]/).some((part) => {
            const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
            if (range) {
                const start = Number(range[1]);
                const end = Number(range[2]);
                return eventNumber >= Math.min(start, end) && eventNumber <= Math.max(start, end);
            }
            return Number(part.trim()) === eventNumber;
        })
    );
}

function notesMentionTile(notes: string, x: number, y: number): boolean {
    return new RegExp(`\\{\\s*${x}\\s*,\\s*${y}\\s*\\}`).test(notes);
}

function notesMentionGuardCount(notes: string, guardCount: number): boolean {
    return new RegExp(`\\b${guardCount}\\s+guards?\\b|\\b${guardCount}\\s+guard AREA\\b`, 'i').test(notes);
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
        const notes = cells[6] ?? '';
        if (rows.has(episode)) throw new Error(`Duplicate docs/original-scenario-import.md row for episode ${episode}`);
        rows.set(episode, { episode, dungeonId, sceneScript, globalScript, mapFiles, notes });
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

function verifyPlanningDocCurrent(): void {
    const path = 'docs/darksaber_tarkov_plan.md';
    const content = readFileSync(path, 'utf8');
    const requiredPhrases = [
        '현재는 1~31화 시나리오 데이터',
        '`docs/main-quest-roadmap.md`의 1~31화 표',
        '23~31화는 같은 대륙 안의 후반 봉인 권역',
    ];
    for (const phrase of requiredPhrases) {
        if (!content.includes(phrase)) {
            throw new Error(`${path} is missing current 1~31 planning phrase: ${phrase}`);
        }
    }
    if (content.includes('현재는 1~22화 시나리오 데이터') || content.includes('`docs/main-quest-roadmap.md`의 1~22화 표')) {
        throw new Error(`${path} still contains stale 1~22 implementation status`);
    }
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

function requireJsonEqual(episode: number, label: string, actual: unknown, expected: unknown): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
        throw new Error(`Episode ${episode} ${label} mismatch.\n  actual: ${actualJson}\n  expected: ${expectedJson}`);
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
    if (sequence.bossDefeatEvent) {
        for (const eventNumber of originalEventIdNumbers(sequence.bossDefeatEvent.originalEventId)) {
            if (!notesMentionOriginalEvent(row.notes, eventNumber)) {
                throw new Error(`Episode ${episode} docs notes do not mention boss EVENT ${eventNumber}`);
            }
        }
        if (/\bCHARDEAD 700\b/.test(sequence.bossDefeatEvent.trigger) && !/\bCHARDEAD 700\b/.test(row.notes)) {
            throw new Error(`Episode ${episode} docs notes do not mention boss CHARDEAD 700`);
        }
        if (/\bSCENECLEAR\b/.test(sequence.bossDefeatEvent.trigger) && !/(scenario clear|SCENECLEAR)/i.test(row.notes)) {
            throw new Error(`Episode ${episode} docs notes do not mention boss scenario clear`);
        }
        for (const reward of sequence.bossDefeatEvent.rewards ?? []) {
            if (reward.type === 'item' && !new RegExp(`\\bGETITEM ${reward.originalItemId}\\b`).test(row.notes)) {
                throw new Error(`Episode ${episode} docs notes do not mention boss GETITEM ${reward.originalItemId}`);
            }
        }
    }
    for (const event of sequence.fieldEvents.filter((candidate) => candidate.completesObjective)) {
        for (const eventNumber of originalEventIdNumbers(event.originalEventId)) {
            if (!notesMentionOriginalEvent(row.notes, eventNumber)) {
                throw new Error(`Episode ${episode} docs notes do not mention objective field EVENT ${eventNumber}`);
            }
        }
        if (/\bSCENECLEAR\b/.test(event.trigger) && !/(scenario clear|SCENECLEAR)/i.test(row.notes)) {
            throw new Error(`Episode ${episode} docs notes do not mention objective field SCENECLEAR`);
        }
        for (const reward of event.rewards ?? []) {
            if (reward.type === 'item' && !new RegExp(`\\bGETITEM ${reward.originalItemId}\\b`).test(row.notes)) {
                throw new Error(`Episode ${episode} docs notes do not mention objective field GETITEM ${reward.originalItemId}`);
            }
        }
    }
    if (episode >= 23 && episode <= 31) {
        const fact = getOriginalLateStoryFact(episode);
        if (!row.notes.includes(fact.aiMember)) {
            throw new Error(`Episode ${episode} docs notes do not mention late AI member ${fact.aiMember}`);
        }
        if (!notesMentionTile(row.notes, fact.bossArea.x, fact.bossArea.y)) {
            throw new Error(`Episode ${episode} docs notes do not mention CHAR 700 boss AREA {${fact.bossArea.x},${fact.bossArea.y}}`);
        }
        if (!notesMentionGuardCount(row.notes, fact.guardAreas.length)) {
            throw new Error(`Episode ${episode} docs notes do not mention ${fact.guardAreas.length} original guard AREA coordinates`);
        }
        for (const position of fact.staging) {
            if (!notesMentionTile(row.notes, position.x, position.y)) {
                throw new Error(`Episode ${episode} docs notes do not mention DEO/DEE staging tile {${position.x},${position.y}}`);
            }
        }
        for (const event of sequence.fieldEvents) {
            for (const eventNumber of originalEventIdNumbers(event.originalEventId)) {
                if (!notesMentionOriginalEvent(row.notes, eventNumber)) {
                    throw new Error(`Episode ${episode} docs notes do not mention late cache EVENT ${eventNumber}`);
                }
            }
            for (const tile of event.triggerTiles) {
                if (!notesMentionTile(row.notes, tile.x, tile.y)) {
                    throw new Error(`Episode ${episode} docs notes do not mention late cache tile {${tile.x},${tile.y}}`);
                }
            }
            for (const reward of event.rewards ?? []) {
                if (reward.type === 'item' && !new RegExp(`\\bGETITEM ${reward.originalItemId}\\b`).test(row.notes)) {
                    throw new Error(`Episode ${episode} docs notes do not mention late cache GETITEM ${reward.originalItemId}`);
                }
            }
        }
        if (!/\bEVENT 99\b/.test(row.notes)) {
            throw new Error(`Episode ${episode} docs notes do not mention EVENT 99 boss clear`);
        }
        if (!/\bCHARDEAD 700\b/.test(row.notes)) {
            throw new Error(`Episode ${episode} docs notes do not mention CHARDEAD 700 boss clear`);
        }
        if (!/(scenario clear|SCENECLEAR)/i.test(row.notes)) {
            throw new Error(`Episode ${episode} docs notes do not mention scenario clear`);
        }
        for (const item of getOriginalLateStoryItemsForSourceEvent(episode, 99)) {
            if (!new RegExp(`\\bGETITEM ${item.originalItemId}\\b`).test(row.notes)) {
                throw new Error(`Episode ${episode} docs notes do not mention EVENT 99 GETITEM ${item.originalItemId}`);
            }
        }
    }
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

function requireStoryTextIncludes(episode: number, label: string, text: string | undefined, expected: string): void {
    if (!text) throw new Error(`Episode ${episode} missing ${label} text`);
    if (!text.includes(expected)) {
        throw new Error(`Episode ${episode} ${label} text does not include ${expected}: ${text}`);
    }
}

function verifyStoryQuestDisplayTextContract(episode: number, scenario: StoryScenarioDefinition): void {
    const quest = STORY_QUESTS.find((entry) => entry.episode === episode);
    if (!quest) throw new Error(`Missing story quest for episode ${episode}`);
    const ko = i18n.strings.ko as Record<string, string>;
    const en = i18n.strings.en as Record<string, string>;
    const episodeKo = `${episode}화`;
    const episodeEn = `Episode ${episode}`;

    requireStoryTextIncludes(episode, 'ko title', ko[quest.titleKey], episodeKo);
    requireStoryTextIncludes(episode, 'ko title', ko[quest.titleKey], scenario.dungeonNameKr);
    requireStoryTextIncludes(episode, 'en title', en[quest.titleKey], episodeEn);
    requireStoryTextIncludes(episode, 'en title', en[quest.titleKey], scenario.dungeonNameEn);

    requireStoryTextIncludes(episode, 'ko objective', ko[quest.objectiveKey], scenario.dungeonNameKr);
    requireStoryTextIncludes(episode, 'en objective', en[quest.objectiveKey], scenario.dungeonNameEn);
    requireStoryTextIncludes(episode, 'ko enter log', ko[quest.enterLogKey], scenario.dungeonNameKr);
    requireStoryTextIncludes(episode, 'en enter log', en[quest.enterLogKey], scenario.dungeonNameEn);
    requireStoryTextIncludes(episode, 'ko completion log', ko[quest.objectiveCompleteLogKey], scenario.dungeonNameKr);
    requireStoryTextIncludes(episode, 'ko completion log', ko[quest.objectiveCompleteLogKey], episodeKo);
    requireStoryTextIncludes(episode, 'en completion log', en[quest.objectiveCompleteLogKey], scenario.dungeonNameEn);
    requireStoryTextIncludes(episode, 'en completion log', en[quest.objectiveCompleteLogKey], episodeEn);

    if (quest.recommendedLevelKey) {
        requireStoryTextIncludes(episode, 'ko recommended level', ko[quest.recommendedLevelKey], '단');
        requireStoryTextIncludes(episode, 'en recommended level', en[quest.recommendedLevelKey], 'Tier');
    }
}

function verifyStoryRewardContract(
    episode: number,
    reward: StoryQuestRewardData,
    context: string,
    state: RewardContractState
): void {
    if (reward.type === 'none') return;

    if (reward.type === 'bundle') {
        if (reward.rewards.length === 0) {
            throw new Error(`Episode ${episode} ${context} reward bundle is empty`);
        }
        for (const [index, entry] of reward.rewards.entries()) {
            verifyStoryRewardContract(episode, entry, `${context} bundle ${index}`, state);
        }
        return;
    }

    if (reward.type === 'questItem' || reward.type === 'inventoryItem') {
        const itemDef = getItemDef(reward.itemId);
        if (!itemDef) throw new Error(`Episode ${episode} ${context} missing reward item ${reward.itemId}`);
        if (!itemDef.name || !itemDef.nameKr) {
            throw new Error(`Episode ${episode} ${context} reward item ${reward.itemId} has missing display name`);
        }
        return;
    }

    const existingCompanionContext = state.companionIds.get(reward.companionId);
    if (existingCompanionContext) {
        throw new Error(`Duplicate story companion reward ${reward.companionId}: ${existingCompanionContext} and ${context}`);
    }
    state.companionIds.set(reward.companionId, context);

    if (!getClassLine(reward.classId)) {
        throw new Error(`Episode ${episode} ${context} missing reward companion class ${reward.classId}`);
    }
    const ko = i18n.strings.ko as Record<string, string>;
    const en = i18n.strings.en as Record<string, string>;
    if (!ko[reward.nameKey]) throw new Error(`Episode ${episode} ${context} missing ko companion reward key ${reward.nameKey}`);
    if (!en[reward.nameKey]) throw new Error(`Episode ${episode} ${context} missing en companion reward key ${reward.nameKey}`);
}

function verifyStoryPresentationStepReference(
    episode: number,
    dungeonId: string,
    context: string,
    step: StoryScenarioEventStep
): void {
    if (step.kind === 'moveActor' && !RESOLVABLE_PRESENTATION_ACTOR_IDS.has(step.actorId)) {
        throw new Error(`Episode ${episode} ${dungeonId} ${context} uses unresolved move actor ${step.actorId}`);
    }
    if (step.kind === 'dialogue') {
        if (!step.speakerId.trim()) {
            throw new Error(`Episode ${episode} ${dungeonId} ${context} has an empty speaker id`);
        }
        if (!step.speakerNameKey.startsWith('story.event.speaker.')) {
            throw new Error(`Episode ${episode} ${dungeonId} ${context} speaker key is not a story speaker: ${step.speakerNameKey}`);
        }
    }
}

function verifyStoryEventRewardContract(
    episode: number,
    dungeonId: string,
    eventId: string,
    trigger: string,
    reward: StoryScenarioFieldEventReward
): void {
    if (reward.type === 'gold') {
        if (!Number.isInteger(reward.amount) || reward.amount <= 0) {
            throw new Error(`Episode ${episode} ${dungeonId} ${eventId} invalid gold reward ${reward.amount}`);
        }
        return;
    }

    const itemDef = getItemDef(reward.itemId);
    if (!itemDef) throw new Error(`Episode ${episode} ${dungeonId} ${eventId} missing event reward item ${reward.itemId}`);
    if (reward.originalItemId === undefined || reward.originalItemId <= 0) return;

    const originalItemPattern = new RegExp(`GETITEM 0*${reward.originalItemId}\\b`);
    if (!originalItemPattern.test(trigger)) {
        throw new Error(`Episode ${episode} ${dungeonId} ${eventId} reward item ${reward.originalItemId} is not present in trigger`);
    }
    if (!originalItemPattern.test(itemDef.description ?? '') || !originalItemPattern.test(itemDef.descriptionKr ?? '')) {
        throw new Error(`Episode ${episode} ${dungeonId} ${eventId} reward item ${reward.itemId} is missing original GETITEM description`);
    }
}

function verifyStoryEventReferenceContract(episode: number, sequence: StoryScenarioEventSequence): void {
    const runtimeFlags = new Set<string>();
    if (sequence.objectiveRuntimeFlag) runtimeFlags.add(sequence.objectiveRuntimeFlag);
    if (sequence.bossDefeatEvent?.runtimeFlag) runtimeFlags.add(sequence.bossDefeatEvent.runtimeFlag);

    for (const [index, step] of sequence.entry.entries()) {
        verifyStoryPresentationStepReference(episode, sequence.dungeonId, `entry step ${index}`, step);
    }
    for (const [index, step] of sequence.bossDefeat.entries()) {
        verifyStoryPresentationStepReference(episode, sequence.dungeonId, `boss defeat step ${index}`, step);
    }

    const fieldEventIds = new Set<string>();
    for (const event of sequence.fieldEvents) {
        if (fieldEventIds.has(event.id)) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} duplicate field event id ${event.id}`);
        }
        fieldEventIds.add(event.id);
        if (event.runtimeFlag) runtimeFlags.add(event.runtimeFlag);
        if (!/^EVENT \d+(?:\/\d+)*$/.test(event.originalEventId)) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} invalid original event id ${event.originalEventId}`);
        }
        if (event.triggerTiles.length === 0) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} has no trigger tiles`);
        }
        if (event.steps.length === 0) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} has no presentation steps`);
        }
        for (const [index, step] of event.steps.entries()) {
            verifyStoryPresentationStepReference(episode, sequence.dungeonId, `${event.id} step ${index}`, step);
        }

        const hasPersistentReward = Boolean(event.questItemId || event.rewards?.length);
        if (hasPersistentReward) {
            if (!event.runtimeFlag) throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} persistent reward has no runtime flag`);
            if (!event.markerLabelKey) throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} persistent reward has no marker label`);
        }
        for (const reward of event.rewards ?? []) {
            verifyStoryEventRewardContract(episode, sequence.dungeonId, event.id, event.trigger, reward);
        }
    }

    const enemyEventIds = new Set<string>();
    for (const event of sequence.enemyDefeatEvents ?? []) {
        if (enemyEventIds.has(event.id)) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} duplicate enemy defeat event id ${event.id}`);
        }
        enemyEventIds.add(event.id);
        if (!/^EVENT \d+(?:\/\d+)*$/.test(event.originalEventId)) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} invalid original event id ${event.originalEventId}`);
        }
        if (!event.enemyId.trim()) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} has an empty enemy id`);
        }
        if (event.steps.length === 0) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} ${event.id} has no presentation steps`);
        }
        for (const [index, step] of event.steps.entries()) {
            verifyStoryPresentationStepReference(episode, sequence.dungeonId, `${event.id} step ${index}`, step);
        }
    }

    if (sequence.bossDefeatEvent) {
        if (!/^EVENT \d+(?:\/\d+)*$/.test(sequence.bossDefeatEvent.originalEventId)) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} boss defeat invalid original event id ${sequence.bossDefeatEvent.originalEventId}`);
        }
        for (const reward of sequence.bossDefeatEvent.rewards ?? []) {
            verifyStoryEventRewardContract(
                episode,
                sequence.dungeonId,
                sequence.bossDefeatEvent.id,
                sequence.bossDefeatEvent.trigger,
                reward
            );
        }
    }

    const markerIds = new Set<string>();
    for (const marker of sequence.markers ?? []) {
        if (markerIds.has(marker.id)) throw new Error(`Episode ${episode} ${sequence.dungeonId} duplicate marker id ${marker.id}`);
        markerIds.add(marker.id);
        if (marker.hideWhenRuntimeFlag && !runtimeFlags.has(marker.hideWhenRuntimeFlag)) {
            throw new Error(`Episode ${episode} ${sequence.dungeonId} marker ${marker.id} hides on unknown flag ${marker.hideWhenRuntimeFlag}`);
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

function verifyLateStoryWorldBiomeContract(episode: number, scenario: StoryScenarioDefinition, worldMap: WorldMap): void {
    const expectedBiome = LATE_STORY_WORLD_BIOMES.get(episode);
    if (!expectedBiome) return;

    const biome = worldMap.getBiomeAtChunk(scenario.chunkX, scenario.chunkY);
    if (biome !== expectedBiome) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} biome mismatch: ${biome} !== ${expectedBiome}`);
    }

    const danger = getFieldDanger(scenario.chunkX, scenario.chunkY);
    if (danger !== 20) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} late story danger mismatch: ${danger} !== 20`);
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

function getPresentationStepFocusKey(step: StoryScenarioEventStep): string | null {
    const tile = step.kind === 'focus' ? step.target : step.focus;
    return tile ? `${tile.x},${tile.y}` : null;
}

function hasWalkableInteriorPath(map: StoryInteriorMap, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    const bounds = map.getBoundsTiles();
    const queue = [{ ...from }];
    const seen = new Set<string>([`${from.x},${from.y}`]);
    for (let index = 0; index < queue.length; index++) {
        const tile = queue[index];
        if (tile.x === to.x && tile.y === to.y) return true;
        for (const next of [
            { x: tile.x + 1, y: tile.y },
            { x: tile.x - 1, y: tile.y },
            { x: tile.x, y: tile.y + 1 },
            { x: tile.x, y: tile.y - 1 },
        ]) {
            const key = `${next.x},${next.y}`;
            if (seen.has(key)) continue;
            if (next.x < 0 || next.y < 0 || next.x >= bounds.width || next.y >= bounds.height) continue;
            if (!map.isWalkable(next.x, next.y)) continue;
            seen.add(key);
            queue.push(next);
        }
    }
    return false;
}

function verifyStoryInteriorTileAccessible(
    episode: number,
    dungeonId: string,
    map: StoryInteriorMap,
    label: string,
    tile: { x: number; y: number }
): void {
    const bounds = map.getBoundsTiles();
    if (tile.x < 0 || tile.y < 0 || tile.x >= bounds.width || tile.y >= bounds.height) {
        throw new Error(`Episode ${episode} ${dungeonId} ${label} is outside interior bounds: ${tile.x},${tile.y}`);
    }
    if (!map.isWalkable(tile.x, tile.y)) {
        throw new Error(`Episode ${episode} ${dungeonId} ${label} is not walkable: ${tile.x},${tile.y}`);
    }
    const playerStart = map.getPlayerStartTile();
    if (!hasWalkableInteriorPath(map, playerStart, tile)) {
        throw new Error(`Episode ${episode} ${dungeonId} ${label} is unreachable from player start: ${tile.x},${tile.y}`);
    }
}

function verifyStoryInteriorAccessibilityContract(
    episode: number,
    scenario: StoryScenarioDefinition,
    sequence: StoryScenarioEventSequence
): void {
    if (scenario.missionKind !== 'soloInterior') return;
    const layout = getStoryInteriorLayout(scenario.dungeonId);
    if (!layout) throw new Error(`Episode ${episode} ${scenario.dungeonId} missing story interior layout`);
    const map = new StoryInteriorMap(layout);

    verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, 'entry tile', layout.entryTile);
    verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, 'player start', layout.playerStart);
    verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, 'boss tile', layout.bossTile);

    for (const [index, tile] of layout.guardTiles.slice(0, scenario.guardCount).entries()) {
        verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `guard tile ${index}`, tile);
    }

    for (const [group, steps] of [
        ['entry', sequence.entry],
        ['bossDefeat', sequence.bossDefeat],
    ] as const) {
        for (const [index, step] of steps.entries()) {
            for (const point of getPresentationStepTiles(step)) {
                verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `${group} step ${index} ${point.label}`, point.tile);
            }
        }
    }

    for (const event of sequence.fieldEvents) {
        for (const [index, tile] of event.triggerTiles.entries()) {
            verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `${event.id} trigger ${index}`, tile);
        }
        for (const [index, step] of event.steps.entries()) {
            for (const point of getPresentationStepTiles(step)) {
                verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `${event.id} step ${index} ${point.label}`, point.tile);
            }
        }
    }

    for (const event of sequence.enemyDefeatEvents ?? []) {
        for (const [index, step] of event.steps.entries()) {
            for (const point of getPresentationStepTiles(step)) {
                verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `${event.id} step ${index} ${point.label}`, point.tile);
            }
        }
    }

    for (const marker of sequence.markers ?? []) {
        verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `marker ${marker.id}`, marker.tile);
    }
}

function verifyLateStoryOriginalMapContract(
    episode: number,
    scenario: StoryScenarioDefinition,
    sequence: StoryScenarioEventSequence
): void {
    if (episode < 23 || episode > 31) return;

    const fact = getOriginalLateStoryFact(episode);
    const mrcFact = getOriginalLateStoryMrcFact(episode);
    const layout = getStoryInteriorLayout(scenario.dungeonId);
    if (!layout) throw new Error(`Episode ${episode} ${scenario.dungeonId} missing late story interior layout`);

    const map = new StoryInteriorMap(layout);
    const paddedEpisode = String(episode).padStart(2, '0');
    const declaredMapFiles = new Set(sequence.originalSources.mapFiles);
    const expectedMrcSource = `MAP/${paddedEpisode}.mrc`;
    const expectedTranslatedMrcSource = `MAP/${paddedEpisode}t.mrc`;
    const expectedHmapSource = `MAP/${paddedEpisode}hmap.bmp`;

    if (scenario.dungeonId !== fact.dungeonId) {
        throw new Error(`Episode ${episode} late story dungeon mismatch: ${scenario.dungeonId} !== ${fact.dungeonId}`);
    }
    if (scenario.missionKind !== 'soloInterior') {
        throw new Error(`Episode ${episode} late story mission kind mismatch: ${scenario.missionKind} !== soloInterior`);
    }
    if (scenario.guardCount !== fact.guardAreas.length) {
        throw new Error(`Episode ${episode} late story guard count mismatch: ${scenario.guardCount} !== ${fact.guardAreas.length}`);
    }
    if (layout.width !== mrcFact.width || layout.height !== mrcFact.height) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} MRC size mismatch: ${layout.width}x${layout.height} !== ${mrcFact.width}x${mrcFact.height}`);
    }
    if (layout.originalMrc?.source !== expectedMrcSource) {
        throw new Error(`Episode ${episode} original MRC source mismatch: ${layout.originalMrc?.source} !== ${expectedMrcSource}`);
    }
    if (layout.originalMrc?.translatedSource !== expectedTranslatedMrcSource) {
        throw new Error(
            `Episode ${episode} translated MRC source mismatch: ${layout.originalMrc?.translatedSource} !== ${expectedTranslatedMrcSource}`
        );
    }
    if (layout.originalMrc?.layerCount !== mrcFact.layerCount) {
        throw new Error(`Episode ${episode} original MRC layer count mismatch: ${layout.originalMrc?.layerCount} !== ${mrcFact.layerCount}`);
    }
    if (mrcFact.source !== expectedMrcSource || mrcFact.translatedSource !== expectedTranslatedMrcSource) {
        throw new Error(`Episode ${episode} late story MRC fact source mismatch`);
    }
    if (layout.originalAi?.source !== `${fact.setArc}:${fact.aiMember}`) {
        throw new Error(`Episode ${episode} original AI source mismatch: ${layout.originalAi?.source} !== ${fact.setArc}:${fact.aiMember}`);
    }
    requireJsonEqual(episode, 'original boss AI area', layout.originalAi?.bossArea, fact.bossArea);
    requireJsonEqual(episode, 'original guard AI areas', layout.originalAi?.guardAreas, fact.guardAreas);
    requireJsonEqual(episode, 'original staging positions', layout.originalAi?.staging, fact.staging);

    if (sequence.originalSources.sceneScript !== `Wlib/scene${episode}.lsc`) {
        throw new Error(`Episode ${episode} scene script mismatch: ${sequence.originalSources.sceneScript}`);
    }
    requireJsonEqual(
        episode,
        'late story set.arc member declaration',
        sequence.originalSources.setArcMembers,
        [
            fact.aiMember,
            fact.eventMember,
            ...(fact.deoMember ? [fact.deoMember] : []),
            ...(fact.deeMember ? [fact.deeMember] : []),
        ]
    );
    for (const sourceFile of [mrcFact.source, mrcFact.translatedSource, expectedHmapSource, fact.setArc]) {
        if (!declaredMapFiles.has(sourceFile)) {
            throw new Error(`Episode ${episode} late story source file not declared: ${sourceFile}`);
        }
    }
    if (getOriginalLateStoryMrcVisualSymbol(mrcFact, layout.bossTile.x, layout.bossTile.y) === null) {
        throw new Error(`Episode ${episode} ${scenario.dungeonId} boss tile has no original MRC visual cell`);
    }

    for (const [index, position] of fact.staging.entries()) {
        verifyStoryInteriorTileAccessible(episode, scenario.dungeonId, map, `original staging ${index}`, { x: position.x, y: position.y });
    }

    const entryDialogues = sequence.entry.filter((step) => step.kind === 'dialogue');
    const bossDefeatDialogues = sequence.bossDefeat.filter((step) => step.kind === 'dialogue');
    if (entryDialogues.length !== LATE_STORY_ENTRY_DIALOGUE_COUNTS.get(episode)) {
        throw new Error(`Episode ${episode} entry dialogue count mismatch: ${entryDialogues.length}`);
    }
    if (bossDefeatDialogues.length !== LATE_STORY_BOSS_DEFEAT_DIALOGUE_COUNTS.get(episode)) {
        throw new Error(`Episode ${episode} boss defeat dialogue count mismatch: ${bossDefeatDialogues.length}`);
    }
    requireJsonEqual(
        episode,
        'late story entry dialogue focuses',
        entryDialogues.map((step) => getPresentationStepFocusKey(step) ?? 'none'),
        LATE_STORY_ENTRY_FOCUSES.get(episode)
    );
    requireJsonEqual(
        episode,
        'late story boss defeat dialogue focuses',
        bossDefeatDialogues.map((step) => getPresentationStepFocusKey(step) ?? 'none'),
        LATE_STORY_BOSS_DEFEAT_FOCUSES.get(episode)
    );
    if (fact.deoMember && entryDialogues.length === 0) {
        throw new Error(`Episode ${episode} declares ${fact.deoMember} but has no entry dialogue`);
    }
    if (!fact.deoMember && entryDialogues.length !== 0) {
        throw new Error(`Episode ${episode} has entry dialogue without a DEO member`);
    }
    if (fact.deeMember && bossDefeatDialogues.length === 0) {
        throw new Error(`Episode ${episode} declares ${fact.deeMember} but has no boss defeat dialogue`);
    }
    if (!fact.deeMember && bossDefeatDialogues.length !== 0) {
        throw new Error(`Episode ${episode} has boss defeat dialogue without a DEE member`);
    }
    if (sequence.entry.filter((step) => step.kind === 'combatStart').length !== 1) {
        throw new Error(`Episode ${episode} entry sequence must contain exactly one combatStart step`);
    }
    if (sequence.bossDefeat.filter((step) => step.kind === 'objective').length !== 1) {
        throw new Error(`Episode ${episode} boss defeat sequence must contain exactly one objective step`);
    }
    requireJsonEqual(
        episode,
        'late story entry focus step',
        sequence.entry[0],
        { kind: 'focus', target: layout.bossTile, labelKey: `story.event.ep${paddedEpisode}.focus.boss`, durationMs: LATE_STORY_FOCUS_STEP_DURATION_MS }
    );
    requireJsonEqual(
        episode,
        'late story entry dialogue durations',
        entryDialogues.map((step) => getStoryScenarioEventStepDurationMs(step)),
        entryDialogues.map(() => LATE_STORY_DIALOGUE_STEP_DURATION_MS)
    );
    requireJsonEqual(
        episode,
        'late story boss defeat dialogue durations',
        bossDefeatDialogues.map((step) => getStoryScenarioEventStepDurationMs(step)),
        bossDefeatDialogues.map(() => LATE_STORY_DIALOGUE_STEP_DURATION_MS)
    );
    const entryMove = sequence.entry.find(
        (step): step is Extract<StoryScenarioEventStep, { kind: 'moveActor' }> => step.kind === 'moveActor'
    );
    if (!entryMove) throw new Error(`Episode ${episode} entry sequence is missing hero moveActor step`);
    if (entryMove.actorId !== 'hero') {
        throw new Error(`Episode ${episode} entry move actor mismatch: ${entryMove.actorId} !== hero`);
    }
    requireJsonEqual(
        episode,
        'late story entry move target',
        entryMove.target,
        { x: layout.playerStart.x, y: layout.playerStart.y - 1 }
    );
    requireJsonEqual(
        episode,
        'late story entry move step',
        entryMove,
        {
            kind: 'moveActor',
            actorId: 'hero',
            target: { x: layout.playerStart.x, y: layout.playerStart.y - 1 },
            focus: { x: layout.playerStart.x, y: layout.playerStart.y - 1 },
            durationMs: LATE_STORY_MOVE_ACTOR_STEP_DURATION_MS,
        }
    );
    const entryCombatStart = sequence.entry.find(
        (step): step is Extract<StoryScenarioEventStep, { kind: 'combatStart' }> => step.kind === 'combatStart'
    );
    if (!entryCombatStart) throw new Error(`Episode ${episode} entry sequence is missing combatStart step`);
    requireJsonEqual(
        episode,
        'late story entry combatStart step',
        entryCombatStart,
        {
            kind: 'combatStart',
            labelKey: `story.event.ep${paddedEpisode}.combatStart`,
            focus: layout.bossTile,
            durationMs: LATE_STORY_COMBAT_START_STEP_DURATION_MS,
        }
    );
    const bossObjective = sequence.bossDefeat.find(
        (step): step is Extract<StoryScenarioEventStep, { kind: 'objective' }> => step.kind === 'objective'
    );
    if (!bossObjective) throw new Error(`Episode ${episode} boss defeat sequence is missing objective step`);
    requireJsonEqual(
        episode,
        'late story boss objective step',
        bossObjective,
        {
            kind: 'objective',
            labelKey: `story.event.ep${paddedEpisode}.objective`,
            focus: layout.bossTile,
            durationMs: LATE_STORY_OBJECTIVE_STEP_DURATION_MS,
        }
    );

    const expectedCaches = getOriginalLateStoryCacheEvents(episode);
    requireJsonEqual(
        episode,
        'late story cache runtime ids',
        sequence.fieldEvents.map((event) => event.id),
        expectedCaches.map((event) => `${fact.dungeonId}_cache_${event.eventNumber}`)
    );
    requireJsonEqual(
        episode,
        'late story cache runtime flags',
        sequence.fieldEvents.map((event) => event.runtimeFlag),
        expectedCaches.map((event) => `${fact.dungeonId}_cache_${event.eventNumber}`)
    );
    requireJsonEqual(
        episode,
        'late story cache marker labels',
        sequence.fieldEvents.map((event) => event.markerLabelKey),
        expectedCaches.map(() => `story.event.ep${paddedEpisode}.cache.marker`)
    );
    requireJsonEqual(
        episode,
        'late story cache marker kinds',
        sequence.fieldEvents.map((event) => event.markerKind),
        expectedCaches.map(() => 'chest')
    );
    requireJsonEqual(
        episode,
        'late story cache original sources',
        sequence.fieldEvents.map((event) => event.originalSource),
        expectedCaches.map(() => `${fact.setArc}:${fact.eventMember}`)
    );
    requireJsonEqual(
        episode,
        'late story cache event order',
        sequence.fieldEvents.map((event) => event.originalEventId),
        expectedCaches.map((event) => `EVENT ${event.eventNumber}`)
    );
    requireJsonEqual(
        episode,
        'late story cache trigger tiles',
        sequence.fieldEvents.map((event) => event.triggerTiles),
        expectedCaches.map((event) => [event.tile])
    );
    requireJsonEqual(
        episode,
        'late story cache GETITEM rewards',
        sequence.fieldEvents.map((event) => (event.rewards ?? []).map((reward) => reward.type === 'item' ? reward.originalItemId : null)),
        expectedCaches.map((event) => [event.originalItemId])
    );
    requireJsonEqual(
        episode,
        'late story cache trigger strings',
        sequence.fieldEvents.map((event) => event.trigger),
        expectedCaches.map((event) => `COMMANDER original CHARPOS ${event.tile.x} ${event.tile.y} GETITEM ${event.originalItemId}`)
    );
    requireJsonEqual(
        episode,
        'late story cache presentation steps',
        sequence.fieldEvents.map((event) => event.steps.map((step) => ({
            kind: step.kind,
            labelKey: step.kind === 'objective' ? step.labelKey : null,
            focus: step.kind === 'objective' ? step.focus ?? null : null,
            durationMs: getStoryScenarioEventStepDurationMs(step),
        }))),
        expectedCaches.map((event) => [{
            kind: 'objective',
            labelKey: `story.event.ep${paddedEpisode}.cache.recovered`,
            focus: event.tile,
            durationMs: LATE_STORY_CACHE_STEP_DURATION_MS,
        }])
    );

    if (!sequence.bossDefeatEvent) throw new Error(`Episode ${episode} late story boss defeat event is missing`);
    if (sequence.bossDefeatEvent.originalSource !== `${fact.setArc}:${fact.eventMember}`) {
        throw new Error(
            `Episode ${episode} late story boss source mismatch: ` +
            `${sequence.bossDefeatEvent.originalSource} !== ${fact.setArc}:${fact.eventMember}`
        );
    }
    if (sequence.bossDefeatEvent.originalEventId !== 'EVENT 99') {
        throw new Error(`Episode ${episode} late story boss event mismatch: ${sequence.bossDefeatEvent.originalEventId} !== EVENT 99`);
    }
    requireJsonEqual(
        episode,
        'late story boss EVENT 99 GETITEM rewards',
        (sequence.bossDefeatEvent.rewards ?? []).map((reward) => reward.type === 'item' ? reward.originalItemId : null),
        getOriginalLateStoryItemsForSourceEvent(episode, 99).map((item) => item.originalItemId)
    );
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

    for (const event of sequence.fieldEvents.filter((candidate) => candidate.completesObjective)) {
        if (!sequence.objectiveRuntimeFlag) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} field clear event ${event.id} has no objective runtime flag`);
        }
        if (event.runtimeFlag !== sequence.objectiveRuntimeFlag) {
            throw new Error(
                `Episode ${episode} ${scenario.dungeonId} field clear flag mismatch for ${event.id}: ` +
                `${event.runtimeFlag ?? 'missing'} !== ${sequence.objectiveRuntimeFlag}`
            );
        }
        if (!event.trigger.includes('SCENECLEAR')) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} field clear event ${event.id} does not declare SCENECLEAR`);
        }
    }

    for (const event of sequence.enemyDefeatEvents ?? []) {
        if (!Number.isInteger(event.scenarioEnemyIndex)) {
            throw new Error(`Episode ${episode} ${scenario.dungeonId} enemy defeat event ${event.id} is missing server scenarioEnemyIndex`);
        }
        if ((event.scenarioEnemyIndex as number) < 0 || (event.scenarioEnemyIndex as number) >= scenario.guardCount) {
            throw new Error(
                `Episode ${episode} ${scenario.dungeonId} enemy defeat event ${event.id} scenarioEnemyIndex ` +
                `${event.scenarioEnemyIndex} is outside guard count ${scenario.guardCount}`
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
const rewardContractState: RewardContractState = { companionIds: new Map() };
const worldMap = new WorldMap();
const verified: string[] = [];

verifyPlanningDocCurrent();
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
    verifyStoryQuestDisplayTextContract(episode, scenario);
    verifyStoryRewardContract(episode, scenario.reward, `episode ${episode} reward`, rewardContractState);
    verifyStoryEventReferenceContract(episode, sequence);
    verifyStoryScenarioContentLedger(episode, scenario, contentRows);
    verifyStoryWorldEntrance(episode, scenario, worldMap);
    verifyStoryHmapContract(episode, scenario, worldMap);
    verifyLateStoryWorldBiomeContract(episode, scenario, worldMap);
    verifyStoryInteriorAccessibilityContract(episode, scenario, sequence);
    verifyLateStoryOriginalMapContract(episode, scenario, sequence);
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

console.log(`verified story source files, import docs, roadmap docs, planning docs, collection chains, quests, quest display text, rewards, event references, scenario ledgers, world entrances, hmaps, late-story biomes, interior accessibility, late-story original AI/MRC/DEO/DEE presentations, field placements, monsters, i18n, bgm, and completion contracts: ${verified.join(', ')}`);
