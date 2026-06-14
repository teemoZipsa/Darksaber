import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseOriginalArcArchive } from '../src/data/original/originalArcArchive';
import { STORY_SCENARIO_EVENT_SEQUENCES, type StoryScenarioEventSequence } from '../src/data/StoryScenarioEventData';
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

function requireArrayEqual(episode: number, label: string, actual: string[], expected: string[]): void {
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
        throw new Error(`Episode ${episode} ${label} mismatch.\n  docs: ${actual.join(', ')}\n  data: ${expected.join(', ')}`);
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

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const docRows = readScenarioImportDocRows();
const roadmapRows = readRoadmapDocRows();
const verified: string[] = [];

for (let episode = options.start; episode <= options.end; episode++) {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
    if (!scenario) throw new Error(`Missing story scenario ${episode}`);

    const sequence = STORY_SCENARIO_EVENT_SEQUENCES.find((entry) => entry.dungeonId === scenario.dungeonId);
    if (!sequence) throw new Error(`Missing story event sequence ${episode}: ${scenario.dungeonId}`);

    const declaredMapFiles = new Set(sequence.originalSources.mapFiles);
    verifyScenarioImportDocRow(episode, sequence, docRows);
    verifyRoadmapDocRow(episode, scenario, roadmapRows);
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

console.log(`verified story source files, import docs, and roadmap docs: ${verified.join(', ')}`);
