import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_OUT = 'outputs\\original_burgos_map_analysis';

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

function runExtractor(mapArc, tempDir) {
  const result = spawnSync(process.execPath, [
    'scripts/extract-original-arc.mjs',
    mapArc,
    tempDir,
    '--match=.DEO,.evt,.srf',
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `extract-original-arc failed for ${mapArc}`);
  }
}

function readCp949(path) {
  return new TextDecoder('windows-949').decode(readFileSync(path));
}

function summarizeScript(text) {
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

const sourceRoot = resolve(process.argv[2] ?? DEFAULT_ROOT);
const outDir = resolve(process.argv[3] ?? DEFAULT_OUT);
const mapDir = join(sourceRoot, 'MAP');
const mapArc = join(mapDir, '01set.arc');
const tempDir = join(outDir, '.extract');

for (const required of [join(mapDir, '01.mrc'), join(mapDir, '01t.mrc'), join(mapDir, '01hmap.BMP'), mapArc]) {
  if (!existsSync(required)) throw new Error(`Required Burgos source file not found: ${required}`);
}

mkdirSync(outDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
runExtractor(mapArc, tempDir);

const mrcBytes = readFileSync(join(mapDir, '01.mrc'));
const translatedMrcBytes = readFileSync(join(mapDir, '01t.mrc'));
const extractedDir = join(tempDir, '01set');
const summary = {
  sourceRoot,
  files: {
    mrc: {
      byteLength: mrcBytes.length,
      firstWords: readInt32Words(mrcBytes, 16),
      inferredWidth: mrcBytes.readInt32LE(16),
      inferredHeight: mrcBytes.readInt32LE(20),
    },
    translatedMrc: {
      byteLength: translatedMrcBytes.length,
      firstWords: readInt32Words(translatedMrcBytes, 16),
      inferredWidth: translatedMrcBytes.readInt32LE(16),
      inferredHeight: translatedMrcBytes.readInt32LE(20),
    },
    hmap: parseBmpInfo(join(mapDir, '01hmap.BMP')),
    setArc: parseArcManifest(mapArc),
  },
  scripts: {
    deo: summarizeScript(readCp949(join(extractedDir, '01.DEO'))),
    evt: summarizeScript(readCp949(join(extractedDir, '01.evt'))),
    srf: summarizeScript(readCp949(join(extractedDir, '01.srf'))),
  },
  compressedInteriorMapping: {
    currentLayout: { width: 34, height: 19 },
    sourceMap: { width: mrcBytes.readInt32LE(16), height: mrcBytes.readInt32LE(20) },
    anchors: [
      { id: 'entry', original: { x: 14, y: 28 }, compressed: { x: 1, y: 9 } },
      { id: 'party_start', original: { x: 14, y: 28 }, compressed: { x: 4, y: 9 } },
      { id: 'ambush', original: { x: 13, y: 28 }, compressed: { x: 13, y: 9 } },
      { id: 'king', original: { x: 19, y: 7 }, compressed: { x: 30, y: 9 } },
      { id: 'kisra', original: { x: 19, y: 10 }, compressed: { x: 30, y: 9 } },
      { id: 'cain_son_relic', originalEvent: 'EVENT 13', compressed: { x: 9, y: 12 } },
      { id: 'key_handoff', originalEvent: 'EVENT 12', compressed: { x: 25, y: 9 } },
    ],
  },
};

const outputPath = join(outDir, 'burgos-map-summary.json');
writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
rmSync(tempDir, { recursive: true, force: true });

console.log(`Wrote Burgos map summary: ${outputPath}`);

