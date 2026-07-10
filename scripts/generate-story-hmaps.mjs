import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_ROOT = process.env.DARKSABER_ORIGINAL_SOURCE_ROOT?.trim() ?? '';
const DEFAULT_OUT = 'src\\data\\content\\story-hmaps.json';
const DEFAULT_EPISODES = [23, 24, 25, 26, 27, 28, 29, 30, 31];
const DEFAULT_CLASSIFIER_EPISODES = Array.from({ length: 19 }, (_, index) => index + 2);
const EXPECTED_LATE_STORY_APPROXIMATED = new Map([
  [23, 6305],
  [24, 6872],
  [25, 4661],
  [26, 8239],
  [27, 13004],
  [28, 9877],
  [29, 6312],
  [30, 19044],
  [31, 9075],
]);

function parseArgs(argv) {
  const options = {
    sourceRoot: DEFAULT_ROOT,
    outPath: DEFAULT_OUT,
    episodes: DEFAULT_EPISODES,
    classifierEpisodes: DEFAULT_CLASSIFIER_EPISODES,
    check: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--source-root') options.sourceRoot = argv[++index];
    else if (arg === '--out') options.outPath = argv[++index];
    else if (arg === '--check') options.check = true;
    else if (arg === '--episodes') {
      options.episodes = argv[++index].split(',').map((value) => Number.parseInt(value, 10));
    } else if (arg === '--classifier-episodes') {
      options.classifierEpisodes = argv[++index].split(',').map((value) => Number.parseInt(value, 10));
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/generate-story-hmaps.mjs [--check] [--source-root <Saver>] [--out <json>] [--episodes 23,24] [--classifier-episodes 2,3]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.episodes.some((episode) => !Number.isInteger(episode) || episode < 1 || episode > 99)) {
    throw new Error(`Invalid episodes: ${options.episodes.join(',')}`);
  }
  if (options.classifierEpisodes.some((episode) => !Number.isInteger(episode) || episode < 1 || episode > 99)) {
    throw new Error(`Invalid classifier episodes: ${options.classifierEpisodes.join(',')}`);
  }
  if (!options.sourceRoot) throw new Error('Original source root is required. Set DARKSABER_ORIGINAL_SOURCE_ROOT or pass --source-root <Saver>.');
  return options;
}

function decodeRleRow(row, expectedSize) {
  let decoded = '';
  let countText = '';
  for (const char of row) {
    if (char >= '0' && char <= '9') {
      countText += char;
      continue;
    }
    const count = countText ? Number(countText) : 1;
    decoded += char.repeat(count);
    countText = '';
  }
  if (decoded.length !== expectedSize) {
    throw new Error(`Invalid hmap row width: ${decoded.length}`);
  }
  return decoded;
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

function readBmpColors(path) {
  const bytes = readFileSync(path);
  const pixelOffset = bytes.readUInt32LE(10);
  const width = bytes.readInt32LE(18);
  const rawHeight = bytes.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const bitsPerPixel = bytes.readUInt16LE(28);
  const palette = [];

  if (bitsPerPixel <= 8) {
    const paletteSize = Math.floor((pixelOffset - 54) / 4);
    for (let index = 0; index < paletteSize; index++) {
      const offset = 54 + index * 4;
      palette.push([bytes[offset + 2], bytes[offset + 1], bytes[offset]]);
    }
  }

  const stride = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - 1 - y;
    const row = [];
    for (let x = 0; x < width; x++) {
      if (bitsPerPixel === 8) {
        const paletteIndex = bytes[pixelOffset + sourceY * stride + x];
        const color = palette[paletteIndex];
        if (!color) throw new Error(`Missing palette color ${paletteIndex} in ${path}`);
        row.push(color);
      } else if (bitsPerPixel === 24) {
        const offset = pixelOffset + sourceY * stride + x * 3;
        row.push([bytes[offset + 2], bytes[offset + 1], bytes[offset]]);
      } else {
        throw new Error(`Unsupported hmap BMP bit depth ${bitsPerPixel}: ${path}`);
      }
    }
    rows.push(row);
  }
  return { width, height, bitsPerPixel, rows };
}

function colorKey(color) {
  return color.join(',');
}

function distanceSquared(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function buildColorClassifier(content, sourceRoot, classifierEpisodes) {
  const exact = new Map();
  const colors = [];
  const mapRoot = join(sourceRoot, 'MAP');
  const classifierEpisodeSet = new Set(classifierEpisodes);

  for (const [episodeText, encodedRows] of Object.entries(content.rle)) {
    const episode = Number(episodeText);
    if (!classifierEpisodeSet.has(episode)) continue;
    const bmpPath = join(mapRoot, `${String(episode).padStart(2, '0')}hmap.bmp`);
    if (!existsSync(bmpPath)) continue;

    const bmp = readBmpColors(bmpPath);
    const decodedRows = encodedRows.map((row) => decodeRleRow(row, content.size));
    if (bmp.width !== content.size || bmp.height !== content.size) {
      throw new Error(`Unexpected hmap BMP size ${bmp.width}x${bmp.height}: ${bmpPath}`);
    }

    for (let y = 0; y < bmp.height; y++) {
      for (let x = 0; x < bmp.width; x++) {
        const color = bmp.rows[y][x];
        const key = colorKey(color);
        const symbol = decodedRows[y][x];
        const old = exact.get(key);
        if (old && old.symbol !== symbol) {
          throw new Error(`Ambiguous hmap color ${key}: ${old.symbol}/${symbol}`);
        }
        if (!old) {
          const entry = { color, symbol };
          exact.set(key, entry);
          colors.push(entry);
        }
      }
    }
  }

  if (colors.length === 0) throw new Error('No source hmap colors learned');

  return (color) => {
    const key = colorKey(color);
    const exactMatch = exact.get(key);
    if (exactMatch) return { symbol: exactMatch.symbol, exact: true };

    let best = colors[0];
    let bestDistance = distanceSquared(color, best.color);
    for (let index = 1; index < colors.length; index++) {
      const candidate = colors[index];
      const distance = distanceSquared(color, candidate.color);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return { symbol: best.symbol, exact: false };
  };
}

function convertEpisode(episode, content, sourceRoot, classify) {
  const bmpPath = join(sourceRoot, 'MAP', `${String(episode).padStart(2, '0')}hmap.bmp`);
  if (!existsSync(bmpPath)) throw new Error(`Missing hmap BMP for episode ${episode}: ${bmpPath}`);
  const bmp = readBmpColors(bmpPath);
  if (bmp.width !== content.size || bmp.height !== content.size) {
    throw new Error(`Unexpected hmap BMP size ${bmp.width}x${bmp.height}: ${bmpPath}`);
  }

  let approximated = 0;
  const symbolCounts = new Map();
  const rows = bmp.rows.map((row) => {
    let decoded = '';
    for (const color of row) {
      const result = classify(color);
      if (!result.exact) approximated++;
      decoded += result.symbol;
      symbolCounts.set(result.symbol, (symbolCounts.get(result.symbol) ?? 0) + 1);
    }
    return encodeRleRow(decoded);
  });

  return {
    rows,
    stats: {
      bitsPerPixel: bmp.bitsPerPixel,
      approximated,
      symbolCounts: Object.fromEntries([...symbolCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    },
  };
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const outPath = resolve(options.outPath);
const content = JSON.parse(readFileSync(outPath, 'utf8'));
const classify = buildColorClassifier(content, sourceRoot, options.classifierEpisodes);

const stats = [];
const expectedRows = new Map(options.episodes.map((episode) => [episode, content.rle[String(episode)]]));
for (const episode of options.episodes) {
  const result = convertEpisode(episode, content, sourceRoot, classify);
  content.rle[String(episode)] = result.rows;
  stats.push({ episode, ...result.stats });
}

const sortedRle = {};
for (const key of Object.keys(content.rle).sort((a, b) => Number(a) - Number(b))) {
  sortedRle[key] = content.rle[key];
}
content.rle = sortedRle;

if (options.check) {
  const mismatches = [];
  for (const { episode, approximated } of stats) {
    const expected = expectedRows.get(episode);
    const actual = content.rle[String(episode)];
    if (!expected) {
      mismatches.push(`episode ${episode} missing from ${outPath}`);
      continue;
    }
    const firstDifferentRow = actual.findIndex((row, index) => row !== expected[index]);
    if (firstDifferentRow !== -1 || actual.length !== expected.length) {
      mismatches.push(`episode ${episode} differs at row ${firstDifferentRow === -1 ? actual.length : firstDifferentRow}`);
    }
    const expectedApproximated = EXPECTED_LATE_STORY_APPROXIMATED.get(episode);
    if (expectedApproximated !== undefined && approximated !== expectedApproximated) {
      mismatches.push(`episode ${episode} approximated pixels ${approximated} !== ${expectedApproximated}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Story hmap check failed:\n${mismatches.join('\n')}`);
  }
  console.log(`verified story hmaps from original BMPs: ${stats.map(({ episode, approximated }) => `${episode}:${approximated}`).join(', ')}`);
  process.exit(0);
}

writeFileSync(outPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(stats));
