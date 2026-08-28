import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config({ path: '.env.pixellab.local', quiet: true });

const API_BASE = 'https://api.pixellab.ai/v2';
const FRAME_SIZE = 32;
const SHEET_COLUMNS = 3;
const SHEET_ROWS = 6;
const PORTRAIT_DIRECTORY = path.resolve('public', 'assets', 'images', 'characters', 'darksaber');
const PALETTE_SWAP_REVIEW_THRESHOLD = 0.67;
const ROTATION_ORDER = [
    'south',
    'south-west',
    'west',
    'north-west',
    'north',
    'north-east',
    'east',
    'south-east',
];
const GAME_DIRECTIONS = [
    { direction: 'north', row: 0 },
    { direction: 'south', row: 1 },
    { direction: 'east', row: 2 },
    { direction: 'west', row: 3 },
];
const ACTION_DIRECTIONS = [
    { direction: 'south', row: 4 },
    { direction: 'north', row: 5 },
];

const TARGETS = [
    { id: 'alchemist_t1', group: 'urgent', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'shrine_t2', group: 'urgent', subject: 'a shrine maiden carrying ritual implements' },
    { id: 'alchemist_t2', group: 'urgent', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'shrine_t3', group: 'urgent', subject: 'a shrine maiden carrying ritual implements' },
    { id: 'alchemist_t3', group: 'urgent', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'shrine_t4', group: 'core', subject: 'a shrine maiden carrying ritual implements' },
    { id: 'alchemist_t4', group: 'core', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'shrine_t6', group: 'core', subject: 'a shrine maiden carrying ritual implements' },
    { id: 'alchemist_t5', group: 'core', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'shrine_t7', group: 'core', subject: 'a shrine maiden carrying ritual implements' },
    { id: 'alchemist_t6', group: 'core', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'alchemist_t7', group: 'core', subject: 'an alchemist carrying bottles and alchemical tools' },
    { id: 'master_battle_t8', group: 'late', subject: 'an elite battle master in heavy combat equipment' },
    { id: 'master_battle_t9', group: 'late', subject: 'an elite battle master in heavy combat equipment' },
    { id: 'master_battle_t10', group: 'late', subject: 'an elite battle master in heavy combat equipment' },
    { id: 'master_tactics_t8', group: 'late', subject: 'an elite tactics master carrying ranged combat equipment' },
    { id: 'master_tactics_t9', group: 'late', subject: 'an elite tactics master carrying ranged combat equipment' },
    { id: 'master_tactics_t10', group: 'late', subject: 'an elite tactics master carrying ranged combat equipment' },
    { id: 'master_magic_t8', group: 'late', subject: 'an elite magic master carrying arcane equipment' },
    { id: 'master_magic_t9', group: 'late', subject: 'an elite magic master carrying arcane equipment' },
    { id: 'master_magic_t10', group: 'late', subject: 'an elite magic master carrying arcane equipment' },
];

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
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
    console.log(`PixelLab sprite pipeline

Usage:
  npm run assets:pixellab -- --list
  npm run assets:pixellab -- --balance
  npm run assets:pixellab -- --audit-sources
  npm run assets:pixellab -- --target alchemist_t1 --concept --yes
  npm run assets:pixellab -- --target alchemist_t1 --prepare
  npm run assets:pixellab -- --target alchemist_t1 --generate --yes
  npm run assets:pixellab -- --group urgent --generate --yes --max-generations 40
  npm run assets:pixellab -- --target alchemist_t1 --publish

Live generation always stages files under .pixellab/. Publishing copies an
approved 96x192 sheet into public/assets/images/characters/animations/.
Concept generation creates one original 32x32 base sprite for review before
rotations or animations can consume more generations. Palette-swap-like source
portraits are blocked from reference-based generation.
The default generation cap is 40 newly submitted jobs per invocation.`);
}

function selectTargets() {
    const targetId = valueAfter('--target');
    const group = valueAfter('--group');
    const limit = integerAfter('--limit', Number.POSITIVE_INFINITY);
    let selected = TARGETS;
    if (targetId) selected = TARGETS.filter((target) => target.id === targetId);
    if (group) selected = selected.filter((target) => target.group === group);
    if ((targetId || group) && selected.length === 0) {
        throw new Error(`No target matched ${targetId ?? group}`);
    }
    return selected.slice(0, limit);
}

function targetPaths(target) {
    const workDir = path.resolve('.pixellab', target.id);
    return {
        source: path.resolve('public', 'assets', 'images', 'characters', 'darksaber', `${target.id}.png`),
        workDir,
        input: path.join(workDir, 'input.png'),
        concept: path.join(workDir, 'concept.png'),
        conceptPreview: path.join(workDir, 'concept_preview.png'),
        conceptMetadata: path.join(workDir, 'concept.json'),
        rotations: path.join(workDir, 'rotations'),
        animations: path.join(workDir, 'animations'),
        sheet: path.join(workDir, `${target.id}_walk.png`),
        preview: path.join(workDir, `${target.id}_walk_preview.png`),
        state: path.join(workDir, 'state.json'),
        published: path.resolve('public', 'assets', 'images', 'characters', 'animations', `${target.id}_walk.png`),
    };
}

function stableSeed(targetId, suffix) {
    const requestedSeed = integerAfter('--seed', 20260828);
    const digest = createHash('sha256').update(`${requestedSeed}:${targetId}:${suffix}`).digest();
    return digest.readUInt32BE(0);
}

async function readState(file) {
    if (!existsSync(file)) return { jobs: {} };
    return JSON.parse(await readFile(file, 'utf8'));
}

async function saveState(file, state) {
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
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

async function apiRequest(endpoint, options = {}) {
    const token = process.env.PIXELLAB_API_TOKEN?.trim();
    if (!token) {
        throw new Error('PIXELLAB_API_TOKEN is missing. Add it to .env.pixellab.local before live API calls.');
    }
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
    if (!response.ok) {
        throw new Error(`PixelLab ${response.status}: ${JSON.stringify(body)}`);
    }
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
    const subscription = balance?.subscription ?? {};
    const credits = balance?.credits?.usd ?? 0;
    console.log(`PixelLab plan: ${subscription.plan ?? 'unknown'}`);
    console.log(`Subscription generations: ${subscription.generations ?? '?'} / ${subscription.total ?? '?'}`);
    console.log(`USD credits: $${credits}`);
}

async function assertFreeGenerationAvailable() {
    if (submittedJobs >= integerAfter('--max-generations', 40)) {
        throw new Error('This invocation reached --max-generations; resume later without deleting .pixellab state.');
    }
    const balance = await getBalance();
    const remaining = remainingGenerations(balance);
    if (remaining === null) {
        throw new Error('PixelLab did not report subscription generations; refusing to risk USD credit usage.');
    }
    if (remaining < 1) {
        throw new Error('No subscription generation remains; refusing to spend USD credits.');
    }
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

async function runJob({ key, endpoint, payload, state, stateFile }) {
    let jobId = state.jobs[key]?.id;
    if (!jobId) {
        await assertFreeGenerationAvailable();
        const submitted = await apiRequest(endpoint, {
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
        createdAt: result.created_at,
        usage: result.usage ?? null,
    };
    await saveState(stateFile, state);
    return result;
}

async function writePreparedInput(source, destination) {
    const trimmed = sharp(source)
        .ensureAlpha()
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
        .resize({
            width: 28,
            height: 30,
            fit: 'inside',
            kernel: sharp.kernel.nearest,
        });
    const { data, info } = await trimmed.png().toBuffer({ resolveWithObject: true });
    await sharp({
        create: {
            width: FRAME_SIZE,
            height: FRAME_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite([{
        input: data,
        left: Math.floor((FRAME_SIZE - info.width) / 2),
        top: FRAME_SIZE - info.height - 1,
    }]).png().toFile(destination);
}

async function normalizedSimilarityData(input) {
    const { data, info } = await sharp(input)
        .ensureAlpha()
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
        .resize({
            width: 64,
            height: 64,
            fit: 'contain',
            position: 'bottom',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            kernel: sharp.kernel.nearest,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

function spriteSimilarity(left, right) {
    let intersection = 0;
    let union = 0;
    let count = 0;
    let sumLeft = 0;
    let sumRight = 0;
    let sumLeftSquared = 0;
    let sumRightSquared = 0;
    let sumProduct = 0;
    const pixels = Math.min(left.width * left.height, right.width * right.height);

    for (let index = 0; index < pixels; index += 1) {
        const offset = index * 4;
        const leftVisible = left.data[offset + 3] > 16;
        const rightVisible = right.data[offset + 3] > 16;
        if (leftVisible || rightVisible) union += 1;
        if (!leftVisible || !rightVisible) continue;

        intersection += 1;
        const leftGray = left.data[offset] * 0.299 + left.data[offset + 1] * 0.587 + left.data[offset + 2] * 0.114;
        const rightGray = right.data[offset] * 0.299 + right.data[offset + 1] * 0.587 + right.data[offset + 2] * 0.114;
        count += 1;
        sumLeft += leftGray;
        sumRight += rightGray;
        sumLeftSquared += leftGray * leftGray;
        sumRightSquared += rightGray * rightGray;
        sumProduct += leftGray * rightGray;
    }

    const maskIou = union === 0 ? 0 : intersection / union;
    const covariance = sumProduct - (sumLeft * sumRight) / Math.max(count, 1);
    const leftVariance = sumLeftSquared - (sumLeft * sumLeft) / Math.max(count, 1);
    const rightVariance = sumRightSquared - (sumRight * sumRight) / Math.max(count, 1);
    const denominator = Math.sqrt(Math.max(0, leftVariance) * Math.max(0, rightVariance));
    const grayscaleCorrelation = denominator === 0 ? 0 : covariance / denominator;
    const score = maskIou * 0.65 + Math.max(0, grayscaleCorrelation) * 0.35;
    return { score, maskIou, grayscaleCorrelation };
}

async function portraitFiles() {
    return (await readdir(PORTRAIT_DIRECTORY, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
        .map((entry) => ({
            id: path.basename(entry.name, '.png'),
            file: path.join(PORTRAIT_DIRECTORY, entry.name),
        }));
}

async function closestPortraits(input, excludedId = null, limit = 3) {
    const candidate = await normalizedSimilarityData(input);
    const portraits = await portraitFiles();
    const matches = [];
    for (const portrait of portraits) {
        if (portrait.id === excludedId) continue;
        matches.push({
            id: portrait.id,
            ...spriteSimilarity(candidate, await normalizedSimilarityData(portrait.file)),
        });
    }
    return matches.sort((left, right) => right.score - left.score).slice(0, limit);
}

function formatSimilarity(match) {
    return `${match.id} score=${match.score.toFixed(3)} mask=${match.maskIou.toFixed(3)} tone=${match.grayscaleCorrelation.toFixed(3)}`;
}

async function assertOriginalEnough(input, excludedId, label) {
    const [closest] = await closestPortraits(input, excludedId, 1);
    if (!closest) return null;
    console.log(`${label} closest existing portrait: ${formatSimilarity(closest)}`);
    if (closest.score >= PALETTE_SWAP_REVIEW_THRESHOLD) {
        throw new Error(
            `${label} is too similar to ${closest.id}; score ${closest.score.toFixed(3)} exceeds the ${PALETTE_SWAP_REVIEW_THRESHOLD.toFixed(2)} review gate.`,
        );
    }
    return closest;
}

async function assertSingleSubject(input, label) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const visited = new Uint8Array(info.width * info.height);
    const componentSizes = [];

    for (let start = 0; start < info.width * info.height; start += 1) {
        if (visited[start] || data[start * 4 + 3] <= 16) continue;
        const queue = [start];
        visited[start] = 1;
        let size = 0;
        while (queue.length > 0) {
            const pixel = queue.pop();
            size += 1;
            const x = pixel % info.width;
            const y = Math.floor(pixel / info.width);
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                    const nextX = x + offsetX;
                    const nextY = y + offsetY;
                    if (nextX < 0 || nextY < 0 || nextX >= info.width || nextY >= info.height) continue;
                    const next = nextY * info.width + nextX;
                    if (visited[next] || data[next * 4 + 3] <= 16) continue;
                    visited[next] = 1;
                    queue.push(next);
                }
            }
        }
        componentSizes.push(size);
    }

    componentSizes.sort((left, right) => right - left);
    const foregroundPixels = componentSizes.reduce((total, size) => total + size, 0);
    const secondComponentShare = (componentSizes[1] ?? 0) / Math.max(foregroundPixels, 1);
    console.log(`${label} foreground components: ${componentSizes.slice(0, 4).join(', ') || 'none'}`);
    if (foregroundPixels < 40) throw new Error(`${label} has too little visible foreground.`);
    if (secondComponentShare >= 0.18) {
        throw new Error(`${label} contains more than one large subject; second component is ${(secondComponentShare * 100).toFixed(1)}% of the foreground.`);
    }
}

async function auditSources() {
    const portraits = await portraitFiles();
    const normalized = new Map();
    for (const portrait of portraits) {
        normalized.set(portrait.id, await normalizedSimilarityData(portrait.file));
    }

    const flagged = [];
    for (let leftIndex = 0; leftIndex < portraits.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < portraits.length; rightIndex += 1) {
            const left = portraits[leftIndex];
            const right = portraits[rightIndex];
            const similarity = spriteSimilarity(normalized.get(left.id), normalized.get(right.id));
            if (similarity.score >= PALETTE_SWAP_REVIEW_THRESHOLD) {
                flagged.push({ left: left.id, right: right.id, ...similarity });
            }
        }
    }

    flagged.sort((left, right) => right.score - left.score);
    console.log(`Palette-swap review gate: ${PALETTE_SWAP_REVIEW_THRESHOLD.toFixed(2)}`);
    console.log(`Portraits scanned: ${portraits.length}; pairs requiring review: ${flagged.length}`);
    for (const match of flagged) {
        console.log(`${match.left.padEnd(20)} <-> ${formatSimilarity({ ...match, id: match.right })}`);
    }
}

async function prepareInput(target, paths) {
    await mkdir(paths.workDir, { recursive: true });

    if (existsSync(paths.concept)) {
        await assertSingleSubject(paths.concept, `${target.id} concept`);
        await assertOriginalEnough(paths.concept, null, `${target.id} concept`);
        if (existsSync(paths.input) && !flags.has('--force')) return;
        await writePreparedInput(paths.concept, paths.input);
        console.log(`Prepared original concept ${path.relative(process.cwd(), paths.input)}`);
        return;
    }

    if (!existsSync(paths.source)) throw new Error(`Missing source portrait: ${paths.source}`);
    await assertOriginalEnough(paths.source, target.id, `${target.id} source portrait`);
    if (existsSync(paths.input) && !flags.has('--force')) return;
    await writePreparedInput(paths.source, paths.input);
    console.log(`Prepared ${path.relative(process.cwd(), paths.input)}`);
}

function conceptPrompt(target) {
    if (target.id === 'alchemist_t1') {
        return 'One single original full-body battlefield alchemist sprite, facing south. Large round brass goggles are clearly visible on the forehead. The character wears a short brown leather apron-jacket ending above the knees, a muted cyan scarf, narrow trousers, and two separated boots. Three oversized amber and cyan potion bottles cross the chest. The raised left hand holds one large round glowing flask, while a square leather satchel hangs only at the right hip. Make the flask and one-sided satchel create a strong asymmetrical silhouette readable at 32x32. Crisp hand-pixeled dark fantasy RPG character, low top-down view, centered, complete body visible. This is not a wizard or soldier: no hat, robe, staff, sword, shield, heavy armor, cape, duplicate person, or background.';
    }
    return `One original full-body ${target.subject} character sprite, facing south toward the viewer. Create a distinct asymmetrical silhouette, unique clothing and readable equipment appropriate to the role. Crisp hand-pixeled dark fantasy RPG sprite, centered, complete body visible.`;
}

async function generateConcept(target, paths) {
    await mkdir(paths.workDir, { recursive: true });
    if (existsSync(paths.concept) && !flags.has('--force')) {
        await assertSingleSubject(paths.concept, `${target.id} concept`);
        await assertOriginalEnough(paths.concept, null, `${target.id} concept`);
        console.log(`Existing concept kept: ${path.relative(process.cwd(), paths.concept)}`);
        return;
    }

    await assertFreeGenerationAvailable();
    const seed = stableSeed(target.id, 'original-concept-v3-pixen');
    const result = await apiRequest('/create-image-pixen', {
        method: 'POST',
        body: JSON.stringify({
            description: conceptPrompt(target),
            image_size: { width: FRAME_SIZE, height: FRAME_SIZE },
            outline: 'selective outline',
            detail: 'medium detail',
            view: 'low top-down',
            direction: 'south',
            no_background: true,
            enhance_prompt: false,
            seed,
        }),
    });
    submittedJobs += 1;

    await sharp(decodeBase64Image(result.image)).ensureAlpha().png().toFile(paths.concept);
    await sharp(paths.concept)
        .resize({ width: FRAME_SIZE * 8, height: FRAME_SIZE * 8, kernel: sharp.kernel.nearest })
        .png()
        .toFile(paths.conceptPreview);

    await assertSingleSubject(paths.concept, `${target.id} concept`);
    const closest = await assertOriginalEnough(paths.concept, null, `${target.id} concept`);
    await writeFile(paths.conceptMetadata, `${JSON.stringify({
        target: target.id,
        seed,
        model: 'pixen',
        usage: result.usage ?? null,
        closestPortrait: closest,
        styleReferences: [],
    }, null, 2)}\n`, 'utf8');
    await writePreparedInput(paths.concept, paths.input);
    console.log(`Original concept staged: ${path.relative(process.cwd(), paths.concept)}`);
    console.log(`Review preview: ${path.relative(process.cwd(), paths.conceptPreview)}`);
}

function resultImages(result) {
    const images = result?.last_response?.images;
    if (!images) throw new Error(`PixelLab job ${result?.id ?? ''} returned no images`);
    return images;
}

async function saveRotationImages(images, directory) {
    await mkdir(directory, { recursive: true });
    const entries = Array.isArray(images)
        ? images.map((image, index) => [ROTATION_ORDER[index], image])
        : Object.entries(images);
    if (entries.length < 8) throw new Error(`Expected 8 rotations, received ${entries.length}`);
    for (const [direction, image] of entries) {
        await sharp(decodeBase64Image(image)).ensureAlpha().png().toFile(path.join(directory, `${direction}.png`));
    }
}

async function saveAnimationImages(images, directory) {
    await mkdir(directory, { recursive: true });
    const frames = Array.isArray(images) ? images : Object.values(images);
    if (frames.length < 4) throw new Error(`Expected at least 4 animation frames, received ${frames.length}`);
    for (let index = 0; index < frames.length; index += 1) {
        await sharp(decodeBase64Image(frames[index])).ensureAlpha().png().toFile(path.join(directory, `${index}.png`));
    }
}

function rotationsComplete(paths) {
    return ROTATION_ORDER.every((direction) => existsSync(path.join(paths.rotations, `${direction}.png`)));
}

function animationComplete(paths, key) {
    return [0, 1, 2, 3].every((index) => existsSync(path.join(paths.animations, key, `${index}.png`)));
}

function rotationPrompt(target) {
    return `${target.subject}, facing south. Preserve the exact clothing, equipment, palette, silhouette, proportions, and crisp pixel-art style from the reference. Transparent background.`;
}

function walkPrompt() {
    return 'A seamless walk-in-place cycle facing exactly the same direction. Keep the character centered and preserve the exact design, equipment, silhouette, palette, scale, and pixel-art rendering. No camera motion, rotation, added objects, background, glow, or particles.';
}

function actionPrompt(target) {
    if (target.id.startsWith('alchemist')) {
        return 'A short alchemical combat action in place: raise or use the visible bottle or tool, reaching one clear peak pose. Preserve the exact design, equipment, direction, silhouette, palette, scale, and pixel-art rendering. No camera motion, rotation, background, or added large effects.';
    }
    if (target.id.startsWith('shrine')) {
        return 'A short shrine magic combat action in place using the visible ritual implement, reaching one clear peak pose. Preserve the exact design, equipment, direction, silhouette, palette, scale, and pixel-art rendering. No camera motion, rotation, background, or added large effects.';
    }
    return 'A short combat action in place using the visible equipment, reaching one clear peak pose. Preserve the exact design, equipment, direction, silhouette, palette, scale, and pixel-art rendering. No camera motion, rotation, background, or added large effects.';
}

async function generateTarget(target, paths) {
    const state = await readState(paths.state);
    if (!rotationsComplete(paths)) {
        const input = await readFile(paths.input);
        const result = await runJob({
            key: 'rotations',
            endpoint: '/generate-8-rotations-v3',
            payload: {
                first_frame: { base64: dataUrl(input), format: 'png' },
                description: rotationPrompt(target),
                no_background: true,
                seed: stableSeed(target.id, 'rotations'),
            },
            state,
            stateFile: paths.state,
        });
        await saveRotationImages(resultImages(result), paths.rotations);
    }

    for (const { direction } of GAME_DIRECTIONS) {
        const key = `walk_${direction}`;
        if (animationComplete(paths, key)) continue;
        const input = await readFile(path.join(paths.rotations, `${direction}.png`));
        const result = await runJob({
            key,
            endpoint: '/animate-with-text-v3',
            payload: {
                first_frame: { base64: dataUrl(input), format: 'png' },
                action: walkPrompt(),
                frame_count: 4,
                no_background: true,
                seed: stableSeed(target.id, key),
                enhance_prompt: false,
            },
            state,
            stateFile: paths.state,
        });
        await saveAnimationImages(resultImages(result), path.join(paths.animations, key));
    }

    for (const { direction } of ACTION_DIRECTIONS) {
        const key = `action_${direction}`;
        if (animationComplete(paths, key)) continue;
        const input = await readFile(path.join(paths.rotations, `${direction}.png`));
        const result = await runJob({
            key,
            endpoint: '/animate-with-text-v3',
            payload: {
                first_frame: { base64: dataUrl(input), format: 'png' },
                action: actionPrompt(target),
                frame_count: 4,
                no_background: true,
                seed: stableSeed(target.id, key),
                enhance_prompt: false,
            },
            state,
            stateFile: paths.state,
        });
        await saveAnimationImages(resultImages(result), path.join(paths.animations, key));
    }

    await assembleSheet(paths);
}

async function normalizedFrame(file) {
    return sharp(file)
        .ensureAlpha()
        .resize({
            width: FRAME_SIZE,
            height: FRAME_SIZE,
            fit: 'contain',
            position: 'bottom',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            kernel: sharp.kernel.nearest,
        })
        .png()
        .toBuffer();
}

async function assembleSheet(paths) {
    const composites = [];
    for (const { direction, row } of GAME_DIRECTIONS) {
        const key = `walk_${direction}`;
        for (let column = 0; column < 3; column += 1) {
            composites.push({
                input: await normalizedFrame(path.join(paths.animations, key, `${column}.png`)),
                left: column * FRAME_SIZE,
                top: row * FRAME_SIZE,
            });
        }
    }
    for (const { direction, row } of ACTION_DIRECTIONS) {
        const key = `action_${direction}`;
        const selectedFrames = [0, 2];
        for (let column = 0; column < selectedFrames.length; column += 1) {
            composites.push({
                input: await normalizedFrame(path.join(paths.animations, key, `${selectedFrames[column]}.png`)),
                left: column * FRAME_SIZE,
                top: row * FRAME_SIZE,
            });
        }
    }

    await sharp({
        create: {
            width: FRAME_SIZE * SHEET_COLUMNS,
            height: FRAME_SIZE * SHEET_ROWS,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(composites).png().toFile(paths.sheet);

    await sharp(paths.sheet)
        .resize({
            width: FRAME_SIZE * SHEET_COLUMNS * 4,
            height: FRAME_SIZE * SHEET_ROWS * 4,
            kernel: sharp.kernel.nearest,
        })
        .png()
        .toFile(paths.preview);
    console.log(`Staged sheet: ${path.relative(process.cwd(), paths.sheet)}`);
    console.log(`Review preview: ${path.relative(process.cwd(), paths.preview)}`);
}

async function publishTarget(target, paths) {
    if (!existsSync(paths.sheet)) throw new Error(`No staged sheet exists for ${target.id}`);
    if (existsSync(paths.published) && !flags.has('--force')) {
        throw new Error(`Published asset already exists: ${paths.published}. Use --force only after review.`);
    }
    await copyFile(paths.sheet, paths.published);
    console.log(`Published ${path.relative(process.cwd(), paths.published)}`);
}

async function main() {
    if (args.length === 0 || flags.has('--help')) {
        printHelp();
        return;
    }
    if (flags.has('--list')) {
        for (const target of TARGETS) {
            const paths = targetPaths(target);
            const status = existsSync(paths.published) ? 'published' : existsSync(paths.sheet) ? 'staged' : 'missing';
            console.log(`${target.group.padEnd(6)} ${target.id.padEnd(22)} ${status}`);
        }
        return;
    }
    if (flags.has('--balance')) {
        printBalance(await getBalance());
        return;
    }
    if (flags.has('--audit-sources')) {
        await auditSources();
        return;
    }

    const selected = selectTargets();
    if ((flags.has('--generate') || flags.has('--concept')) && !flags.has('--yes')) {
        throw new Error('Live generation consumes PixelLab generations. Re-run with --yes after reviewing the target list.');
    }
    if (flags.has('--concept') && flags.has('--generate')) {
        throw new Error('Generate and review the one-image concept before running rotations and animations.');
    }
    for (const target of selected) {
        const paths = targetPaths(target);
        if (flags.has('--concept')) {
            await generateConcept(target, paths);
            continue;
        }
        await prepareInput(target, paths);
        if (flags.has('--generate')) await generateTarget(target, paths);
        if (flags.has('--publish')) await publishTarget(target, paths);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
