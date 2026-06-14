import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseOriginalArcArchive } from '../src/data/original/originalArcArchive';
import { STORY_SCENARIO_EVENT_SEQUENCES, type StoryScenarioEventSequence } from '../src/data/StoryScenarioEventData';
import { STORY_SCENARIOS } from '../src/data/StoryScenarioData';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_START = 1;
const DEFAULT_END = 31;

interface Options {
    sourceRoot: string;
    start: number;
    end: number;
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

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const verified: string[] = [];

for (let episode = options.start; episode <= options.end; episode++) {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
    if (!scenario) throw new Error(`Missing story scenario ${episode}`);

    const sequence = STORY_SCENARIO_EVENT_SEQUENCES.find((entry) => entry.dungeonId === scenario.dungeonId);
    if (!sequence) throw new Error(`Missing story event sequence ${episode}: ${scenario.dungeonId}`);

    const declaredMapFiles = new Set(sequence.originalSources.mapFiles);
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

console.log(`verified story source files: ${verified.join(', ')}`);
