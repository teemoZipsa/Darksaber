#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const skipChecks = args.has('--skip-checks');
const skipRender = args.has('--skip-render');
const skipVercel = args.has('--skip-vercel');

if (!skipChecks) {
    await run('git', ['status', '--porcelain'], { capture: true, expectEmpty: true });
    await run('git', ['fetch', '--quiet']);
    const localHead = await run('git', ['rev-parse', 'HEAD'], { capture: true });
    const upstreamHead = await run('git', ['rev-parse', '@{u}'], { capture: true });
    if (localHead !== upstreamHead) {
        fail(`Local HEAD ${localHead.slice(0, 8)} does not match upstream ${upstreamHead.slice(0, 8)}. Push or pull before production deploy.`);
    }
    await run('npx', ['tsc', '--noEmit']);
    await run('npm', ['test']);
    await run('npm', ['run', 'build']);
}

if (!skipRender) {
    if (!process.env.RENDER_API_KEY) fail('RENDER_API_KEY is required for Render deploys.');
    await run('node', ['scripts/render-deploy.mjs', 'deploy', '--wait']);
}

if (!skipVercel) {
    if (!process.env.VERCEL_TOKEN) fail('VERCEL_TOKEN is required for Vercel production deploys.');
    const hasLinkedProject = existsSync('.vercel/project.json');
    const hasEnvProject = process.env.VERCEL_ORG_ID && process.env.VERCEL_PROJECT_ID;
    if (!hasLinkedProject && !hasEnvProject) {
        fail('Vercel project is not linked. Run `npx vercel link` once, or set VERCEL_ORG_ID and VERCEL_PROJECT_ID.');
    }
    await run('npx', ['vercel', 'deploy', '--prod', '--yes', '--token', process.env.VERCEL_TOKEN]);
}

console.log('production deploy complete');

function run(command, commandArgs, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(commandForPlatform(command), commandArgs, {
            cwd: process.cwd(),
            shell: false,
            stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        let stdout = '';
        let stderr = '';
        if (options.capture) {
            child.stdout.on('data', (chunk) => { stdout += String(chunk); });
            child.stderr.on('data', (chunk) => { stderr += String(chunk); });
        }
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}${stderr ? `\n${stderr.trim()}` : ''}`));
                return;
            }
            if (options.expectEmpty && stdout.trim()) {
                reject(new Error(`Working tree is not clean:\n${stdout.trim()}`));
                return;
            }
            resolve(stdout.trim());
        });
    }).catch((error) => fail(error.message));
}

function commandForPlatform(command) {
    if (process.platform !== 'win32') return command;
    if (command === 'npm' || command === 'npx') return `${command}.cmd`;
    return command;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
