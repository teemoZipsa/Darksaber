import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STORY_SCENARIO_EVENT_SEQUENCES } from '../src/data/StoryScenarioEventData';
import { STORY_SCENARIOS } from '../src/data/StoryScenarioData';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const LATE_STORY_START = 23;
const LATE_STORY_END = 31;

interface Options {
    sourceRoot: string;
}

function parseArgs(argv: string[]): Options {
    const options: Options = { sourceRoot: DEFAULT_ROOT };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--source-root') options.sourceRoot = argv[++index] ?? '';
        else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node --import tsx scripts/verify-late-story-source-files.ts [--source-root <Saver>]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
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

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const verified: string[] = [];

for (let episode = LATE_STORY_START; episode <= LATE_STORY_END; episode++) {
    const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
    if (!scenario) throw new Error(`Missing late story scenario ${episode}`);

    const sequence = STORY_SCENARIO_EVENT_SEQUENCES.find((entry) => entry.dungeonId === scenario.dungeonId);
    if (!sequence) throw new Error(`Missing late story event sequence ${episode}: ${scenario.dungeonId}`);

    requireSourceFile(sourceRoot, episode, sequence.originalSources.sceneScript);
    if (sequence.originalSources.globalScript !== 'missing') {
        requireSourceFile(sourceRoot, episode, sequence.originalSources.globalScript);
    } else {
        requireAbsentSourceFile(sourceRoot, episode, `Glib/gscene${episode}.lsc`);
    }
    for (const sourceFile of sequence.originalSources.mapFiles) {
        requireSourceFile(sourceRoot, episode, sourceFile);
    }
    verified.push(`${episode}:${scenario.dungeonId}`);
}

console.log(`verified late-story declared source files: ${verified.join(', ')}`);
