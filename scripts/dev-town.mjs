import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const children = [];

function run(label, args) {
    const child = spawn(npmCmd, args, {
        cwd: process.cwd(),
        shell: false,
        stdio: ['inherit', 'pipe', 'pipe'],
    });
    children.push(child);

    child.stdout.on('data', (chunk) => process.stdout.write(prefix(label, chunk)));
    child.stderr.on('data', (chunk) => process.stderr.write(prefix(label, chunk)));
    child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        if (code === 0 || signal) return;
        console.error(`[${label}] exited with code ${code}`);
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

const mode = process.argv[2] === 'raid' ? 'raid' : 'town';
const scenario = process.argv[3] === 'aggro' || process.argv[3] === 'loot'
    ? process.argv[3]
    : null;
const openPath = scenario
    ? `/?devStart=${mode}&devScenario=${scenario}`
    : `/?devStart=${mode}`;

run('world', ['run', 'server']);
run('vite', ['run', 'dev', '--', '--open', openPath]);
