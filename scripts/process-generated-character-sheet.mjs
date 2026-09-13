import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SOURCE_COLUMNS = 3;
const SOURCE_ROWS = 6;
const FRAME_SIZE = 32;
const PORTRAIT_SCALE = 4;
const FRAME_INSET = 1;

const args = process.argv.slice(2);

function valueAfter(flag) {
    const index = args.indexOf(flag);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function usage() {
    console.log(`Normalize an ImageGen 3x6 character sheet for Darksaber.

Usage:
  node scripts/process-generated-character-sheet.mjs --input <png> --id <class_tier> [--force]

Outputs:
  public/assets/images/characters/darksaber/<class_tier>.png
  public/assets/images/characters/animations/<class_tier>_walk.png`);
}

function isConnectedBackgroundPixel(data, offset) {
    const alpha = data[offset + 3];
    if (alpha <= 16) return true;

    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;

    // ImageGen commonly returns either a white studio field or a baked neutral
    // checkerboard when transparency is requested. Restrict removal to bright,
    // nearly neutral pixels connected to the canvas edge so enclosed white hair,
    // clothing, steel and eye highlights remain intact.
    return high - low <= 30 && luminance >= 145;
}

function removeConnectedBackground(data, width, height) {
    const pixelCount = width * height;
    const background = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let head = 0;
    let tail = 0;

    const enqueue = (index) => {
        if (background[index]) return;
        const offset = index * 4;
        if (!isConnectedBackgroundPixel(data, offset)) return;
        background[index] = 1;
        queue[tail++] = index;
    };

    for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
    }

    while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) enqueue(index - 1);
        if (x + 1 < width) enqueue(index + 1);
        if (y > 0) enqueue(index - width);
        if (y + 1 < height) enqueue(index + width);
    }

    for (let index = 0; index < pixelCount; index += 1) {
        if (background[index]) data[index * 4 + 3] = 0;
    }

    return tail;
}

function visibleBounds(data, width, height) {
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] <= 16) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }

    if (right < left || bottom < top) return null;
    return { left, top, width: right - left + 1, height: bottom - top + 1, right, bottom };
}

function collectForegroundComponents(data, width, height) {
    const pixelCount = width * height;
    const labels = new Int32Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    const components = [];

    for (let start = 0; start < pixelCount; start += 1) {
        if (labels[start] || data[start * 4 + 3] <= 16) continue;

        const label = components.length + 1;
        let head = 0;
        let tail = 0;
        let size = 0;
        let sumX = 0;
        let sumY = 0;
        let left = width;
        let right = -1;
        let top = height;
        let bottom = -1;
        labels[start] = label;
        queue[tail++] = start;

        while (head < tail) {
            const index = queue[head++];
            const x = index % width;
            const y = Math.floor(index / width);
            size += 1;
            sumX += x;
            sumY += y;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);

            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                    if (offsetX === 0 && offsetY === 0) continue;
                    const nextX = x + offsetX;
                    const nextY = y + offsetY;
                    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
                    const next = nextY * width + nextX;
                    if (labels[next] || data[next * 4 + 3] <= 16) continue;
                    labels[next] = label;
                    queue[tail++] = next;
                }
            }
        }

        components.push({
            label,
            size,
            centerX: sumX / size,
            centerY: sumY / size,
            left,
            right,
            top,
            bottom,
        });
    }

    return { labels, components };
}

function nearestFrameIndex(component, width, height) {
    const cellWidth = width / SOURCE_COLUMNS;
    const cellHeight = height / SOURCE_ROWS;
    const column = Math.max(0, Math.min(
        SOURCE_COLUMNS - 1,
        Math.round(component.centerX / cellWidth - 0.5),
    ));
    const row = Math.max(0, Math.min(
        SOURCE_ROWS - 1,
        Math.round(component.centerY / cellHeight - 0.5),
    ));
    return row * SOURCE_COLUMNS + column;
}

function buildComponentFrames(data, width, height) {
    const { labels, components } = collectForegroundComponents(data, width, height);
    const meaningful = components.filter((component) => component.size >= 12);
    const frameComponents = Array.from({ length: SOURCE_COLUMNS * SOURCE_ROWS }, () => []);
    const frameByLabel = new Int32Array(components.length + 1);
    frameByLabel.fill(-1);

    for (const component of meaningful) {
        const frameIndex = nearestFrameIndex(component, width, height);
        frameComponents[frameIndex].push(component);
        frameByLabel[component.label] = frameIndex;
    }

    const frames = frameComponents.map((assigned, frameIndex) => {
        if (assigned.length === 0) {
            const row = Math.floor(frameIndex / SOURCE_COLUMNS);
            const column = frameIndex % SOURCE_COLUMNS;
            throw new Error(`Frame row ${row + 1}, column ${column + 1} has no foreground component.`);
        }

        const left = Math.min(...assigned.map((component) => component.left));
        const right = Math.max(...assigned.map((component) => component.right));
        const top = Math.min(...assigned.map((component) => component.top));
        const bottom = Math.max(...assigned.map((component) => component.bottom));
        const frameWidth = right - left + 1;
        const frameHeight = bottom - top + 1;
        const frameData = Buffer.alloc(frameWidth * frameHeight * 4);

        for (let y = top; y <= bottom; y += 1) {
            for (let x = left; x <= right; x += 1) {
                const sourceIndex = y * width + x;
                if (frameByLabel[labels[sourceIndex]] !== frameIndex) continue;
                const sourceOffset = sourceIndex * 4;
                const targetOffset = ((y - top) * frameWidth + x - left) * 4;
                data.copy(frameData, targetOffset, sourceOffset, sourceOffset + 4);
            }
        }

        const bounds = visibleBounds(frameData, frameWidth, frameHeight);
        if (!bounds) throw new Error(`Frame ${frameIndex + 1} became blank while grouping components.`);
        return {
            row: Math.floor(frameIndex / SOURCE_COLUMNS),
            column: frameIndex % SOURCE_COLUMNS,
            data: frameData,
            width: frameWidth,
            height: frameHeight,
            bounds,
            anchorX: footAnchorX(frameData, frameWidth, bounds),
        };
    });

    return {
        frames,
        foregroundComponentCount: components.length,
        meaningfulComponentCount: meaningful.length,
    };
}

function footAnchorX(data, width, bounds) {
    const bandTop = bounds.top + Math.floor(bounds.height * 0.76);
    let weightedX = 0;
    let weight = 0;

    for (let y = bandTop; y <= bounds.bottom; y += 1) {
        for (let x = bounds.left; x <= bounds.right; x += 1) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha <= 16) continue;
            weightedX += x * alpha;
            weight += alpha;
        }
    }

    return weight > 0 ? weightedX / weight : bounds.left + bounds.width / 2;
}

async function cropRawFrame(frame) {
    return sharp(frame.data, {
        raw: { width: frame.width, height: frame.height, channels: 4 },
    }).extract({
        left: frame.bounds.left,
        top: frame.bounds.top,
        width: frame.bounds.width,
        height: frame.bounds.height,
    }).png().toBuffer();
}

async function normalizeFrame(frame, scale) {
    const resizedWidth = Math.max(1, Math.round(frame.bounds.width * scale));
    const resizedHeight = Math.max(1, Math.round(frame.bounds.height * scale));
    const cropped = await cropRawFrame(frame);
    const resized = await sharp(cropped)
        .resize(resizedWidth, resizedHeight, { kernel: sharp.kernel.nearest })
        .ensureAlpha()
        .png()
        .toBuffer();

    const sourceAnchor = (frame.anchorX - frame.bounds.left) * scale;
    const preferredLeft = Math.round(FRAME_SIZE / 2 - sourceAnchor);
    const left = Math.max(
        FRAME_INSET,
        Math.min(preferredLeft, FRAME_SIZE - FRAME_INSET - resizedWidth),
    );
    const top = FRAME_SIZE - FRAME_INSET - resizedHeight;

    return sharp({
        create: {
            width: FRAME_SIZE,
            height: FRAME_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite([{ input: resized, left, top }]).png().toBuffer();
}

async function main() {
    if (args.includes('--help')) {
        usage();
        return;
    }

    const input = valueAfter('--input');
    const id = valueAfter('--id');
    if (!input || !id) {
        usage();
        throw new Error('--input and --id are required.');
    }
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id)) throw new Error(`Unsafe character id: ${id}`);
    if (!existsSync(input)) throw new Error(`Input does not exist: ${input}`);

    const portrait = path.resolve('public', 'assets', 'images', 'characters', 'darksaber', `${id}.png`);
    const sheet = path.resolve('public', 'assets', 'images', 'characters', 'animations', `${id}_walk.png`);
    if (!args.includes('--force') && (existsSync(portrait) || existsSync(sheet))) {
        throw new Error(`Output already exists for ${id}; pass --force only after reviewing the generated sheet.`);
    }

    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (Math.abs(info.height / info.width - 2) > 0.02) {
        throw new Error(`Expected a 1:2 sheet canvas, received ${info.width}x${info.height}.`);
    }

    const removedBackgroundPixels = removeConnectedBackground(data, info.width, info.height);
    const { frames, foregroundComponentCount, meaningfulComponentCount } = buildComponentFrames(
        data,
        info.width,
        info.height,
    );

    const maxWidth = Math.max(...frames.map((frame) => frame.bounds.width));
    const maxHeight = Math.max(...frames.map((frame) => frame.bounds.height));
    const available = FRAME_SIZE - FRAME_INSET * 2;
    const scale = Math.min(available / maxWidth, available / maxHeight);
    const normalizedFrames = await Promise.all(frames.map((frame) => normalizeFrame(frame, scale)));

    const composites = normalizedFrames.map((inputBuffer, index) => ({
        input: inputBuffer,
        left: (index % SOURCE_COLUMNS) * FRAME_SIZE,
        top: Math.floor(index / SOURCE_COLUMNS) * FRAME_SIZE,
    }));
    await mkdir(path.dirname(portrait), { recursive: true });
    await mkdir(path.dirname(sheet), { recursive: true });
    await sharp({
        create: {
            width: FRAME_SIZE * SOURCE_COLUMNS,
            height: FRAME_SIZE * SOURCE_ROWS,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(composites).png({ compressionLevel: 9, palette: true, colours: 128, dither: 0 }).toFile(sheet);

    const southNeutral = normalizedFrames[SOURCE_COLUMNS + 1];
    await sharp(southNeutral)
        .resize(FRAME_SIZE * PORTRAIT_SCALE, FRAME_SIZE * PORTRAIT_SCALE, { kernel: sharp.kernel.nearest })
        .png({ compressionLevel: 9, palette: true, colours: 128, dither: 0 })
        .toFile(portrait);

    console.log(JSON.stringify({
        id,
        input: path.resolve(input),
        portrait,
        sheet,
        sourceSize: `${info.width}x${info.height}`,
        removedBackgroundPixels,
        foregroundComponentCount,
        meaningfulComponentCount,
        frameScale: Number(scale.toFixed(5)),
        widestFrame: maxWidth,
        tallestFrame: maxHeight,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
