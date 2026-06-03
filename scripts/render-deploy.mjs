#!/usr/bin/env node
import 'dotenv/config';

const DEFAULT_SERVICE_ID = 'srv-d8ffsauq1p3s73ducdo0';
const API_BASE_URL = 'https://api.render.com/v1';
const SUCCESS_STATUSES = new Set(['live']);
const FAILURE_STATUSES = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated']);
const ACTIVE_STATUSES = new Set(['created', 'queued', 'pre_deploy_in_progress', 'build_in_progress', 'update_in_progress']);

const args = process.argv.slice(2);
const command = args[0] ?? 'status';
const serviceId = readOption('--service') ?? process.env.RENDER_SERVICE_ID ?? DEFAULT_SERVICE_ID;
const apiKey = process.env.RENDER_API_KEY;

if (!apiKey) {
    fail('RENDER_API_KEY is required. Set it in your shell or an ignored .env file.');
}

switch (command) {
    case 'status':
        await printLatestDeploy();
        break;
    case 'deploy':
        await triggerDeploy();
        break;
    case 'wait':
        await waitForDeploy(args[1] && !args[1].startsWith('--') ? args[1] : undefined);
        break;
    default:
        fail(`Unknown command "${command}". Use status, deploy, or wait.`);
}

async function triggerDeploy() {
    const commitId = readOption('--commit');
    const clearCache = readFlag('--clear-cache') ? 'clear' : 'do_not_clear';
    const body = {
        clearCache,
        deployMode: 'build_and_deploy',
        ...(commitId ? { commitId } : {}),
    };
    const deploy = await renderFetch(`/services/${serviceId}/deploys`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    printDeploy('triggered', deploy);
    if (readFlag('--wait')) await waitForDeploy(deploy.id);
}

async function printLatestDeploy() {
    const deploy = await latestDeploy();
    printDeploy('latest', deploy);
}

async function waitForDeploy(deployId) {
    let deploy = deployId ? await getDeploy(deployId) : await latestDeploy();
    while (!SUCCESS_STATUSES.has(deploy.status) && !FAILURE_STATUSES.has(deploy.status)) {
        printDeploy('waiting', deploy);
        await sleep(10_000);
        deploy = await getDeploy(deploy.id);
    }
    printDeploy('final', deploy);
    if (!SUCCESS_STATUSES.has(deploy.status)) process.exitCode = 1;
}

async function latestDeploy() {
    const entries = await renderFetch(`/services/${serviceId}/deploys?limit=1`, { method: 'GET' });
    const deploy = Array.isArray(entries) ? entries[0]?.deploy : null;
    if (!deploy) fail(`No deploys found for service ${serviceId}.`);
    return deploy;
}

async function getDeploy(deployId) {
    return renderFetch(`/services/${serviceId}/deploys/${deployId}`, { method: 'GET' });
}

async function renderFetch(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
            ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const message = parsed.message ?? parsed.error ?? response.statusText;
        fail(`Render API ${response.status}: ${message}`);
    }
    return parsed;
}

function printDeploy(label, deploy) {
    const commit = deploy.commit?.id ? ` commit=${deploy.commit.id.slice(0, 8)}` : '';
    const active = ACTIVE_STATUSES.has(deploy.status) ? ' active=true' : '';
    console.log(`${label}: id=${deploy.id} status=${deploy.status} trigger=${deploy.trigger ?? 'unknown'}${commit}${active}`);
}

function readOption(name) {
    const index = args.indexOf(name);
    if (index === -1) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`${name} requires a value.`);
    return value;
}

function readFlag(name) {
    return args.includes(name);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
