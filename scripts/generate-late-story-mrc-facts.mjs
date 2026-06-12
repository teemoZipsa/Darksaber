import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_OUT = 'src\\data\\content\\original-late-story-mrc-facts.json';
const DEFAULT_EPISODES = [23, 24, 25, 26, 27, 28, 29, 30, 31];

function parseArgs(argv) {
  const options = {
    sourceRoot: DEFAULT_ROOT,
    outPath: DEFAULT_OUT,
    episodes: DEFAULT_EPISODES,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--source-root') options.sourceRoot = argv[++index];
    else if (arg === '--out') options.outPath = argv[++index];
    else if (arg === '--episodes') options.episodes = argv[++index].split(',').map((value) => Number.parseInt(value, 10));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/generate-late-story-mrc-facts.mjs [--source-root <Saver>] [--out <json>] [--episodes 23,24]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.episodes.some((episode) => !Number.isInteger(episode) || episode < 1 || episode > 99)) {
    throw new Error(`Invalid episodes: ${options.episodes.join(',')}`);
  }

  return options;
}

function encodeRleRow(row) {
  let encoded = '';
  for (let index = 0; index < row.length;) {
    const char = row[index];
    let end = index + 1;
    while (end < row.length && row[end] === char) end++;
    const count = end - index;
    encoded += count === 1 ? char : `${count}${char}`;
    index = end;
  }
  return encoded;
}

function readLayerValue(bytes, dataOffset, cellCount, layer, index) {
  return bytes[dataOffset + layer * cellCount + index];
}

function readMrc(path) {
  const bytes = readFileSync(path);
  const headerWordCount = bytes.readInt32LE(0);
  const width = bytes.readInt32LE((headerWordCount + 1) * 4);
  const height = bytes.readInt32LE((headerWordCount + 2) * 4);
  const dataOffset = (headerWordCount + 4) * 4;
  const cellCount = width * height;
  const layerCount = Math.floor((bytes.length - dataOffset) / cellCount);
  const tailBytes = bytes.length - dataOffset - layerCount * cellCount;

  if (width <= 0 || height <= 0 || cellCount <= 0) throw new Error(`Invalid MRC dimensions ${width}x${height}: ${path}`);
  if (dataOffset < 16 || dataOffset >= bytes.length) throw new Error(`Invalid MRC data offset ${dataOffset}: ${path}`);

  const layerSummaries = [];
  const visualRows = [];
  for (let layer = 0; layer < layerCount; layer++) {
    const counts = new Map();
    let nonZeroCells = 0;
    let nonEmptyCells = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let index = 0; index < cellCount; index++) {
      const value = readLayerValue(bytes, dataOffset, cellCount, layer, index);
      counts.set(value, (counts.get(value) ?? 0) + 1);
      if (value !== 0) nonZeroCells++;
      if (value !== 0 && value !== 255) {
        nonEmptyCells++;
        const x = index % width;
        const y = Math.floor(index / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const dominantValues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count }));

    layerSummaries.push({
      index: layer,
      uniqueValues: counts.size,
      nonZeroCells,
      nonEmptyCells,
      nonEmptyBounds: nonEmptyCells > 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
      dominantValues,
    });
  }

  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      let hasDetail = false;
      let hasShadow = false;
      for (let layer = 2; layer < layerCount; layer++) {
        const value = readLayerValue(bytes, dataOffset, cellCount, layer, index);
        if (value === 255) hasShadow = true;
        else if (value !== 0) hasDetail = true;
      }
      row += hasDetail ? 'd' : hasShadow ? 's' : '.';
    }
    visualRows.push(encodeRleRow(row));
  }

  return {
    byteLength: bytes.length,
    headerWordCount,
    width,
    height,
    dataOffset,
    layerCount,
    tailBytes,
    visualRows,
    layerSummaries,
  };
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const outPath = resolve(options.outPath);
const output = {};

for (const episode of options.episodes) {
  const mapId = String(episode).padStart(2, '0');
  const mrcPath = join(sourceRoot, 'MAP', `${mapId}.mrc`);
  const translatedMrcPath = join(sourceRoot, 'MAP', `${mapId}t.mrc`);
  if (!existsSync(mrcPath)) throw new Error(`Missing MRC for episode ${episode}: ${mrcPath}`);
  if (!existsSync(translatedMrcPath)) throw new Error(`Missing translated MRC for episode ${episode}: ${translatedMrcPath}`);

  const mrc = readMrc(mrcPath);
  const translatedMrc = readMrc(translatedMrcPath);
  if (mrc.width !== translatedMrc.width || mrc.height !== translatedMrc.height) {
    throw new Error(`MRC/tMRC dimension mismatch for episode ${episode}`);
  }

  output[String(episode)] = {
    source: `MAP/${mapId}.mrc`,
    translatedSource: `MAP/${mapId}t.mrc`,
    ...mrc,
  };
}

writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(Object.fromEntries(Object.entries(output).map(([episode, fact]) => [episode, { width: fact.width, height: fact.height, layerCount: fact.layerCount }]))));
