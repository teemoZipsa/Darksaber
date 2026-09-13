import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const children = [];
const storyScenarioDataUrl = new URL('../src/data/content/story-scenarios.json', import.meta.url);
const devStoryEpisodes = new Set(
    JSON.parse(readFileSync(storyScenarioDataUrl, 'utf8'))
        .map((scenario) => scenario.episode)
        .filter((episode) => Number.isInteger(episode) && episode > 0)
);

function run(label, args) {
    // Run JavaScript entrypoints directly: spawning npm.cmd without a shell fails on Windows.
    const child = spawn(process.execPath, args, {
        cwd: projectRoot,
        shell: false,
        windowsHide: true,
        stdio: ['inherit', 'pipe', 'pipe'],
    });
    children.push(child);

    child.stdout.on('data', (chunk) => process.stdout.write(prefix(label, chunk)));
    child.stderr.on('data', (chunk) => process.stderr.write(prefix(label, chunk)));
    child.on('error', (error) => {
        console.error(`[${label}] ${error.message}`);
        shutdown();
        process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        if (code === 0 || signal) return;
        console.error(`[${label}] exited with code ${code}`);
        process.exitCode = code ?? 1;
    });
    return child;
}

function prefix(label, chunk) {
    return String(chunk)
        .split(/\r?\n/)
        .map((line, index, lines) => {
            if (line.length === 0 && index === lines.length - 1) return '';
            return `[${label}] ${line}`;
        })
        .join('\n');
}

let shuttingDown = false;

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
        if (!child.killed) child.kill();
    }
}

process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
});
process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
});
process.on('exit', shutdown);

export function normalizeDevScenarioArg(scenarioArg) {
    if (scenarioArg === 'aggro' || scenarioArg === 'loot' || scenarioArg === 'combat') return scenarioArg;
    const match = /^story(\d+)$/.exec(scenarioArg ?? '');
    if (!match) return null;
    const episode = Number(match[1]);
    return devStoryEpisodes.has(episode) ? `story${episode}` : null;
}

export function normalizeDevModeArg(modeArg) {
    if (modeArg === 'raid' || modeArg === 'tutorial') return modeArg;
    return 'town';
}

export function buildDevOpenPath(modeArg, scenarioArg = null) {
    const mode = normalizeDevModeArg(modeArg);
    if (mode === 'tutorial') return '/?devStart=tutorial';
    const scenario = normalizeDevScenarioArg(scenarioArg);
    return scenario
        ? `/?devStart=${mode}&devScenario=${scenario}&devLocal=1`
        : `/?devStart=${mode}&devLocal=1`;
}

export function getDevLaunchCommands(modeArg, scenarioArg = null) {
    const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    return [{ label: 'vite', args: [viteCli, '--open', buildDevOpenPath(modeArg, scenarioArg)] }];
}

function main() {
    for (const { label, args } of getDevLaunchCommands(process.argv[2], process.argv[3] ?? null)) {
        run(label, args);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
