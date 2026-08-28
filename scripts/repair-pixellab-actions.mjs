import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config({ path: '.env.pixellab.local', quiet: true });

const API_BASE = 'https://api.pixellab.ai/v2';
const FRAME_SIZE = 32;
const SHEET_WIDTH = 96;
const SHEET_HEIGHT = 192;
const ANIMATION_DIRECTORY = path.resolve('public', 'assets', 'images', 'characters', 'animations');
const DIRECTIONS = [
    { id: 'south', sourceRow: 1, actionRow: 4 },
    { id: 'north', sourceRow: 0, actionRow: 5 },
];
const CLASS_PRIORITY = [
    'infantry',
    'cavalry',
    'lancer',
    'archer',
    'cleric',
    'priest',
    'mage',
    'cultist',
    'flying',
    'naval',
];

const args = process.argv.slice(2);
const flags = new Set(args.filter((argument) => argument.startsWith('--')));
let submittedJobs = 0;

function valueAfter(flag, fallback = undefined) {
    const index = args.indexOf(flag);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

function integerAfter(flag, fallback) {
    const raw = valueAfter(flag);
    if (raw === undefined) return fallback;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} must be a non-negative integer`);
    return value;
}

function printHelp() {
    console.log(`PixelLab missing-action repair pipeline

Usage:
  npm run assets:pixellab:actions -- --list-missing
  npm run assets:pixellab:actions -- --balance
  npm run assets:pixellab:actions -- --target naval_t2 --generate --yes --max-generations 2
  npm run assets:pixellab:actions -- --target naval_t2 --publish
  npm run assets:pixellab:actions -- --generate --yes --limit 11 --max-generations 22

Generation stages repaired sheets under .pixellab/action-repair/. Publishing
refuses to overwrite a source sheet if it changed after generation.`);
}

function dataUrl(buffer) {
    return `data:image/png;base64,${buffer.toString('base64')}`;
}

function decodeBase64Image(image) {
    const candidate = typeof image === 'string'
        ? image
        : image?.base64 ?? image?.image?.base64 ?? image?.data;
    if (typeof candidate !== 'string') throw new Error('PixelLab returned an image without base64 data');
    const encoded = candidate.includes(',') ? candidate.slice(candidate.indexOf(',') + 1) : candidate;
    return Buffer.from(encoded, 'base64');
}

function stableSeed(targetId, suffix) {
    const requestedSeed = integerAfter('--seed', 20260828);
    const digest = createHash('sha256').update(`${requestedSeed}:${targetId}:${suffix}`).digest();
    return digest.readUInt32BE(0);
}

function hashBuffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

async function hashFile(file) {
    return hashBuffer(await readFile(file));
}

async function apiRequest(endpoint, options = {}) {
    const token = process.env.PIXELLAB_API_TOKEN?.trim();
    if (!token) throw new Error('PIXELLAB_API_TOKEN is missing from .env.pixellab.local');
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
    });
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { detail: text };
    }
    if (!response.ok) throw new Error(`PixelLab ${response.status}: ${JSON.stringify(body)}`);
    return body;
}

async function getBalance() {
    return apiRequest('/balance');
}

function remainingGenerations(balance) {
    const remaining = balance?.subscription?.generations;
    return Number.isFinite(remaining) ? remaining : null;
}

function printBalance(balance) {
    console.log(`Subscription generations: ${balance?.subscription?.generations ?? '?'} / ${balance?.subscription?.total ?? '?'}`);
    console.log(`USD credits: $${balance?.credits?.usd ?? 0}`);
}

async function assertFreeGenerationAvailable() {
    if (submittedJobs >= integerAfter('--max-generations', 2)) {
        throw new Error('This invocation reached --max-generations; completed jobs remain resumable in .pixellab.');
    }
    const balance = await getBalance();
    const remaining = remainingGenerations(balance);
    if (remaining === null) throw new Error('PixelLab did not report subscription generations; refusing USD usage.');
    if (remaining < 1) throw new Error('No subscription generation remains; refusing USD usage.');
    console.log(`Free/subscription generations before submit: ${remaining}`);
}

async function pollJob(jobId) {
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
        const result = await apiRequest(`/background-jobs/${jobId}`);
        if (result.status === 'completed') return result;
        if (result.status === 'failed' || result.status === 'error') {
            throw new Error(`PixelLab job ${jobId} failed: ${JSON.stringify(result.last_response)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error(`PixelLab job ${jobId} did not finish within 12 minutes`);
}

async function readState(file) {
    if (!existsSync(file)) return { jobs: {} };
    return JSON.parse(await readFile(file, 'utf8'));
}

async function saveState(file, state) {
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function runJob({ key, payload, state, stateFile }) {
    let jobId = state.jobs[key]?.id;
    if (!jobId) {
        await assertFreeGenerationAvailable();
        const submitted = await apiRequest('/animate-with-text-v3', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        jobId = submitted.background_job_id;
        if (!jobId) throw new Error(`PixelLab did not return a job id for ${key}`);
        submittedJobs += 1;
        state.jobs[key] = { id: jobId, status: submitted.status ?? 'processing' };
        await saveState(stateFile, state);
        console.log(`Submitted ${key}: ${jobId}`);
    } else {
        console.log(`Resuming ${key}: ${jobId}`);
    }

    const result = await pollJob(jobId);
    state.jobs[key] = {
        id: jobId,
        status: result.status,
        usage: result.usage ?? null,
    };
    await saveState(stateFile, state);
    return result;
}

function targetParts(targetId) {
    const match = /^(.*)_t(\d+)$/.exec(targetId);
    if (!match) throw new Error(`Invalid target id: ${targetId}`);
    return { classLine: match[1], tier: Number.parseInt(match[2], 10) };
}

function targetPaths(targetId) {
    const workDir = path.resolve('.pixellab', 'action-repair', targetId);
    return {
        source: path.join(ANIMATION_DIRECTORY, `${targetId}_walk.png`),
        workDir,
        state: path.join(workDir, 'state.json'),
        frames: path.join(workDir, 'frames'),
        staged: path.join(workDir, `${targetId}_walk.png`),
        preview: path.join(workDir, `${targetId}_walk_preview.png`),
    };
}

function visiblePixelsInCell(raw, width, row, column) {
    let visible = 0;
    for (let y = row * FRAME_SIZE; y < (row + 1) * FRAME_SIZE; y += 1) {
        for (let x = column * FRAME_SIZE; x < (column + 1) * FRAME_SIZE; x += 1) {
            if (raw[(y * width + x) * 4 + 3] > 16) visible += 1;
        }
    }
    return visible;
}

async function hasMissingActions(file) {
    const metadata = await sharp(file).metadata();
    if (metadata.width !== SHEET_WIDTH || metadata.height !== SHEET_HEIGHT) return false;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return DIRECTIONS.some(({ actionRow }) => (
        visiblePixelsInCell(data, info.width, actionRow, 0) === 0
        || visiblePixelsInCell(data, info.width, actionRow, 1) === 0
    ));
}

async function discoverMissingTargets() {
    const entries = await readdir(ANIMATION_DIRECTORY, { withFileTypes: true });
    const missing = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('_walk.png')) continue;
        const targetId = entry.name.slice(0, -'_walk.png'.length);
        if (!/^(.*)_t\d+$/.test(targetId)) continue;
        const file = path.join(ANIMATION_DIRECTORY, entry.name);
        if (await hasMissingActions(file)) missing.push(targetId);
    }
    return missing.sort((left, right) => {
        const leftParts = targetParts(left);
        const rightParts = targetParts(right);
        if (leftParts.tier !== rightParts.tier) return leftParts.tier - rightParts.tier;
        const leftClass = CLASS_PRIORITY.indexOf(leftParts.classLine);
        const rightClass = CLASS_PRIORITY.indexOf(rightParts.classLine);
        return (leftClass < 0 ? 999 : leftClass) - (rightClass < 0 ? 999 : rightClass);
    });
}

async function selectTargets() {
    const missing = await discoverMissingTargets();
    const requested = valueAfter('--target');
    const limit = integerAfter('--limit', Number.POSITIVE_INFINITY);
    if (requested) {
        if (!missing.includes(requested) && !flags.has('--force')) {
            throw new Error(`${requested} is not a standard sheet with missing action rows.`);
        }
        return [requested];
    }
    return missing.slice(0, limit);
}

async function extractSourceFrame(file, row) {
    return sharp(file)
        .extract({ left: FRAME_SIZE, top: row * FRAME_SIZE, width: FRAME_SIZE, height: FRAME_SIZE })
        .ensureAlpha()
        .png()
        .toBuffer();
}

function actionPrompt(targetId, direction) {
    const { classLine } = targetParts(targetId);
    const actions = {
        infantry: 'a quick one-handed melee slash with the visible weapon',
        cavalry: 'a short mounted melee strike with the visible weapon',
        lancer: 'a compact forward thrust with the visible spear or polearm',
        archer: 'draw and release the visible bow in place',
        cleric: 'a compact basic strike with the visible cleric weapon or focus',
        priest: 'a compact basic strike with the visible priest weapon or focus',
        mage: 'a compact basic staff or magic-focus attack without a large spell effect',
        cultist: 'a compact basic strike using the visible weapon or ritual focus',
        flying: 'a quick basic aerial strike in place',
        naval: 'a quick basic saber or visible-weapon strike',
    };
    return `One seamless basic-attack animation facing ${direction}: ${actions[classLine] ?? 'a compact basic weapon strike'}. Start from the supplied idle pose, reach one clear attack pose, and return toward idle. Preserve the exact character identity, clothing, equipment, palette, silhouette, pixel clusters, canvas position, scale, and facing direction. One character only. Transparent background. No camera motion, rotation, extra limbs, new equipment, aura, projectile, text, or large effects.`;
}

function resultImages(result) {
    const images = result?.last_response?.images;
    if (!images) throw new Error(`PixelLab job ${result?.id ?? ''} returned no images`);
    return Array.isArray(images) ? images : Object.values(images);
}

async function saveAnimationFrames(images, directory) {
    if (images.length < 4) throw new Error(`Expected at least 4 animation frames, received ${images.length}`);
    await mkdir(directory, { recursive: true });
    for (let index = 0; index < images.length; index += 1) {
        await sharp(decodeBase64Image(images[index])).ensureAlpha().png().toFile(path.join(directory, `${index}.png`));
    }
}

async function normalizedFrame(file) {
    return sharp(file)
        .ensureAlpha()
        .resize({
            width: FRAME_SIZE,
            height: FRAME_SIZE,
            fit: 'contain',
            position: 'center',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            kernel: sharp.kernel.nearest,
        })
        .png()
        .toBuffer();
}

async function assembleTarget(targetId, paths) {
    const composites = [];
    const { classLine } = targetParts(targetId);
    const attackFrame = classLine === 'cavalry' ? 1 : 2;
    for (const { id, sourceRow, actionRow } of DIRECTIONS) {
        composites.push({
            input: await extractSourceFrame(paths.source, sourceRow),
            left: 0,
            top: actionRow * FRAME_SIZE,
        });
        composites.push({
            input: await normalizedFrame(path.join(paths.frames, id, `${attackFrame}.png`)),
            left: FRAME_SIZE,
            top: actionRow * FRAME_SIZE,
        });
    }
    await sharp(paths.source).ensureAlpha().composite(composites).png().toFile(paths.staged);
    await sharp(paths.staged)
        .resize({ width: SHEET_WIDTH * 4, height: SHEET_HEIGHT * 4, kernel: sharp.kernel.nearest })
        .png()
        .toFile(paths.preview);
    console.log(`Staged ${targetId}: ${path.relative(process.cwd(), paths.staged)}`);
    console.log(`Review preview: ${path.relative(process.cwd(), paths.preview)}`);
}

async function rawRegion(file, left, top, width, height) {
    return sharp(file).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer();
}

async function validateStagedRepair(targetId, paths) {
    const sourceWalkRows = await rawRegion(paths.source, 0, 0, SHEET_WIDTH, FRAME_SIZE * 4);
    const stagedWalkRows = await rawRegion(paths.staged, 0, 0, SHEET_WIDTH, FRAME_SIZE * 4);
    if (!sourceWalkRows.equals(stagedWalkRows)) {
        throw new Error(`${targetId} staged repair changed existing walk rows.`);
    }

    for (const { sourceRow, actionRow } of DIRECTIONS) {
        const sourceIdle = await rawRegion(paths.source, FRAME_SIZE, sourceRow * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        const stagedIdle = await rawRegion(paths.staged, 0, actionRow * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        const stagedAttack = await rawRegion(paths.staged, FRAME_SIZE, actionRow * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        const sourceTail = await rawRegion(paths.source, FRAME_SIZE * 2, actionRow * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        const stagedTail = await rawRegion(paths.staged, FRAME_SIZE * 2, actionRow * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        if (!sourceIdle.equals(stagedIdle)) throw new Error(`${targetId} staged action does not start from the exact source idle frame.`);
        if (sourceIdle.equals(stagedAttack)) throw new Error(`${targetId} staged attack frame is identical to idle.`);
        if (!sourceTail.equals(stagedTail)) throw new Error(`${targetId} staged repair changed the unused action cell.`);
    }
}

async function generateTarget(targetId) {
    const paths = targetPaths(targetId);
    if (!existsSync(paths.source)) throw new Error(`Missing source sheet: ${paths.source}`);
    await mkdir(paths.workDir, { recursive: true });
    const state = await readState(paths.state);
    const currentSourceHash = await hashFile(paths.source);
    if (state.sourceHash && state.sourceHash !== currentSourceHash) {
        throw new Error(`${targetId} source changed after staging began; remove its repair workspace only after review.`);
    }
    state.sourceHash = currentSourceHash;
    await saveState(paths.state, state);

    for (const { id, sourceRow } of DIRECTIONS) {
        const directory = path.join(paths.frames, id);
        if ([0, 1, 2, 3].every((frame) => existsSync(path.join(directory, `${frame}.png`)))) continue;
        const firstFrame = await extractSourceFrame(paths.source, sourceRow);
        const result = await runJob({
            key: `action_${id}`,
            payload: {
                first_frame: { base64: dataUrl(firstFrame), format: 'png' },
                action: actionPrompt(targetId, id),
                frame_count: 4,
                no_background: true,
                seed: stableSeed(targetId, `action_${id}`),
                enhance_prompt: false,
            },
            state,
            stateFile: paths.state,
        });
        await saveAnimationFrames(resultImages(result), directory);
    }
    await assembleTarget(targetId, paths);
}

async function publishTarget(targetId) {
    const paths = targetPaths(targetId);
    if (!existsSync(paths.staged) || !existsSync(paths.state)) {
        throw new Error(`No staged action repair exists for ${targetId}`);
    }
    const state = await readState(paths.state);
    const currentSourceHash = await hashFile(paths.source);
    if (!state.sourceHash || state.sourceHash !== currentSourceHash) {
        throw new Error(`${targetId} source changed after generation; refusing to overwrite it.`);
    }
    if (await hasMissingActions(paths.staged)) throw new Error(`${targetId} staged sheet still has missing action cells.`);
    await validateStagedRepair(targetId, paths);
    await copyFile(paths.staged, paths.source);
    console.log(`Published repaired actions: ${path.relative(process.cwd(), paths.source)}`);
}

async function main() {
    if (args.length === 0 || flags.has('--help')) {
        printHelp();
        return;
    }
    if (flags.has('--balance')) {
        printBalance(await getBalance());
        return;
    }
    if (flags.has('--list-missing')) {
        const targets = await discoverMissingTargets();
        console.log(`Missing action sheets: ${targets.length}`);
        for (const target of targets) console.log(target);
        return;
    }
    if (flags.has('--generate') && !flags.has('--yes')) {
        throw new Error('Live generation consumes PixelLab generations. Re-run with --yes.');
    }

    const targets = await selectTargets();
    if (targets.length === 0) throw new Error('No missing action sheets matched.');
    for (const target of targets) {
        if (flags.has('--generate')) await generateTarget(target);
        if (flags.has('--publish')) await publishTarget(target);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
