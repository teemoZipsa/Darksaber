import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_OUT_ROOT = 'outputs\\original_story_map_analysis';

function readAscii(bytes, offset, length) {
  let result = '';
  for (let index = 0; index < length; index++) {
    const value = bytes[offset + index];
    if (value === 0) break;
    result += String.fromCharCode(value);
  }
  return result;
}

function readInt32Words(bytes, limit) {
  const words = [];
  const count = Math.min(Math.floor(bytes.length / 4), limit);
  for (let index = 0; index < count; index++) words.push(bytes.readInt32LE(index * 4));
  return words;
}

function parseBmpInfo(path) {
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  return {
    byteLength: bytes.length,
    signature: readAscii(bytes, 0, 2),
    width: bytes.readInt32LE(18),
    height: bytes.readInt32LE(22),
    bitsPerPixel: bytes.readUInt16LE(28),
  };
}

function parseArcManifest(path) {
  const bytes = readFileSync(path);
  const entries = [];
  if (bytes.length < 5 || readAscii(bytes, 1, 4) !== '0901') return { byteLength: bytes.length, entries };

  for (let offset = 5; offset + 36 <= bytes.length; offset += 36) {
    const nameLength = bytes[offset];
    if (nameLength <= 0 || nameLength > 15) break;
    const name = readAscii(bytes, offset + 1, nameLength);
    if (name === 'HEADEND') break;
    entries.push({
      name,
      unpackedSize: bytes.readUInt32LE(offset + 20),
      packedSize: bytes.readUInt32LE(offset + 24),
      startOffset: bytes.readUInt32LE(offset + 28),
      endOffset: bytes.readUInt32LE(offset + 32),
    });
  }
  return { byteLength: bytes.length, entries };
}

function parseArgs(argv) {
  const options = {
    sourceRoot: DEFAULT_ROOT,
    outRoot: DEFAULT_OUT_ROOT,
    episode: null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--episode') options.episode = argv[++index];
    else if (arg === '--source-root') options.sourceRoot = argv[++index];
    else if (arg === '--out') options.outRoot = argv[++index];
    else if (!options.episode && /^\d+$/.test(arg)) options.episode = arg;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/analyze-original-story-map.mjs --episode 2 [--source-root <Saver>] [--out <dir>]');
      process.exit(0);
    }
  }

  if (!options.episode) throw new Error('Missing --episode <number>');
  const numeric = Number.parseInt(options.episode, 10);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 99) throw new Error(`Invalid episode: ${options.episode}`);
  return { ...options, episode: String(numeric).padStart(2, '0') };
}

function runExtractor(mapArc, tempDir) {
  const result = spawnSync(process.execPath, [
    'scripts/extract-original-arc.mjs',
    mapArc,
    tempDir,
    '--match=.DEO,.evt,.srf',
  ], { encoding: 'utf8' });

  if (result.status !== 0) throw new Error(result.stderr.trim() || `extract-original-arc failed for ${mapArc}`);
}

function readCp949(path) {
  return new TextDecoder('windows-949').decode(readFileSync(path));
}

function summarizeScript(path) {
  if (!existsSync(path)) return null;
  const text = readCp949(path);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const commands = new Map();
  const messages = [];
  const charPositions = [];
  const moves = [];
  const events = [];
  const triggers = [];

  for (const line of lines) {
    const command = line.split(/\s+/, 1)[0] ?? '';
    commands.set(command, (commands.get(command) ?? 0) + 1);

    if (line.startsWith('MESSAGE ')) messages.push(line.replace(/\|/g, ' ').slice(0, 120));
    else if (line.startsWith('CHARPOS ')) charPositions.push(line);
    else if (line.startsWith('CHARMOVE ')) moves.push(line);
    else if (line.startsWith('MOVEPOSITION ')) moves.push(line);
    else if (/^EVENT \d+/i.test(line)) events.push(line);
    else if (/DUTY_STEP|CHARDEAD|GETITEM|GOLD|SET_DUTY_STEP/i.test(line)) triggers.push(line);
  }

  return {
    file: basename(path),
    lineCount: lines.length,
    commandCounts: Object.fromEntries([...commands.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    messageCount: messages.length,
    firstMessages: messages.slice(0, 8),
    charPositions: charPositions.slice(0, 16),
    moves: moves.slice(0, 16),
    events: events.slice(0, 24),
    triggers: triggers.slice(0, 32),
  };
}

function summarizeMrc(path) {
  const bytes = readFileSync(path);
  return {
    byteLength: bytes.length,
    firstWords: readInt32Words(bytes, 16),
    inferredWidth: bytes.readInt32LE(16),
    inferredHeight: bytes.readInt32LE(20),
  };
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const outDir = resolve(options.outRoot, options.episode);
const mapDir = join(sourceRoot, 'MAP');
const mapArc = join(mapDir, `${options.episode}set.arc`);
const tempDir = join(outDir, '.extract');
const mrcPath = join(mapDir, `${options.episode}.mrc`);
const translatedMrcPath = join(mapDir, `${options.episode}t.mrc`);
const hmapPath = join(mapDir, `${options.episode}hmap.BMP`);

for (const required of [mrcPath, translatedMrcPath, mapArc]) {
  if (!existsSync(required)) throw new Error(`Required episode ${options.episode} source file not found: ${required}`);
}

mkdirSync(outDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
runExtractor(mapArc, tempDir);

const extractedDir = join(tempDir, `${options.episode}set`);
const summary = {
  episode: Number.parseInt(options.episode, 10),
  mapId: options.episode,
  sourceRoot,
  sourceFiles: {
    sceneScript: `Wlib/scene${Number.parseInt(options.episode, 10)}.lsc`,
    globalScript: `Glib/gscene${Number.parseInt(options.episode, 10)}.lsc`,
    mrc: `MAP/${options.episode}.mrc`,
    translatedMrc: `MAP/${options.episode}t.mrc`,
    hmap: existsSync(hmapPath) ? `MAP/${options.episode}hmap.BMP` : null,
    setArc: `MAP/${options.episode}set.arc`,
  },
  files: {
    mrc: summarizeMrc(mrcPath),
    translatedMrc: summarizeMrc(translatedMrcPath),
    hmap: parseBmpInfo(hmapPath),
    setArc: parseArcManifest(mapArc),
  },
  scripts: {
    deo: summarizeScript(join(extractedDir, `${options.episode}.DEO`)),
    evt: summarizeScript(join(extractedDir, `${options.episode}.evt`)),
    srf: summarizeScript(join(extractedDir, `${options.episode}.srf`)),
  },
};

const outputPath = join(outDir, `${options.episode}-map-summary.json`);
writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
rmSync(tempDir, { recursive: true, force: true });

console.log(`Wrote episode ${options.episode} map summary: ${outputPath}`);
