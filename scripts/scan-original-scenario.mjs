import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DEFAULT_ROOT = process.env.DARKSABER_ORIGINAL_SOURCE_ROOT?.trim() ?? '';

function readInt32Words(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wordCount = Math.floor(bytes.byteLength / 4);
  const words = [];
  for (let index = 0; index < wordCount; index++) words.push(view.getInt32(index * 4, true));
  return words;
}

function stableHash(words) {
  let hash = 0x811c9dc5;
  for (const word of words) {
    let value = word >>> 0;
    for (let index = 0; index < 4; index++) {
      hash ^= value & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      value >>>= 8;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function uniqueFirst(candidates, limit) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.value)) continue;
    seen.add(candidate.value);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

function scanScript(bytes) {
  const words = readInt32Words(bytes);
  const opcodeCandidates = [];
  const coordinateCandidates = [];
  const textReferenceCandidates = [];
  const sceneReferenceCandidates = [];

  for (let index = 0; index < words.length; index++) {
    const value = words[index];
    const offset = index * 4;
    if (value >= 0 && value <= 255) opcodeCandidates.push({ offset, value });
    if (value >= 1 && value <= 2000) textReferenceCandidates.push({ offset, value });
    if (value >= 0 && value <= 99) sceneReferenceCandidates.push({ offset, value });
    const next = words[index + 1];
    if (next !== undefined && value >= 0 && value <= 255 && next >= 0 && next <= 255) {
      coordinateCandidates.push({ offset, x: value, y: next });
    }
  }

  return {
    byteLength: bytes.byteLength,
    wordCount: words.length,
    trailingBytes: bytes.byteLength % 4,
    hash: stableHash(words),
    firstWords: words.slice(0, 16),
    opcodeCandidates: uniqueFirst(opcodeCandidates, 16),
    coordinateCandidates: coordinateCandidates.slice(0, 16),
    textReferenceCandidates: uniqueFirst(textReferenceCandidates, 16),
    sceneReferenceCandidates: uniqueFirst(sceneReferenceCandidates, 16),
  };
}

function walkFiles(root) {
  const results = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) results.push(...walkFiles(path));
    else results.push(path);
  }
  return results;
}

function createMapManifest(fileNames) {
  const entries = new Map();
  const getEntry = (mapId) => {
    const existing = entries.get(mapId);
    if (existing) return existing;
    const entry = { mapId };
    entries.set(mapId, entry);
    return entry;
  };

  for (const fileName of fileNames) {
    const normalized = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
    const match = /^(?<id>\d+)(?<kind>t|hmap|set)?\.(?<ext>mrc|bmp|arc)$/i.exec(normalized);
    if (!match?.groups) continue;
    const { id, kind = '', ext } = match.groups;
    const entry = getEntry(id);
    const lowerKind = kind.toLowerCase();
    const lowerExt = ext.toLowerCase();
    if (lowerExt === 'mrc' && lowerKind === '') entry.mrc = normalized;
    else if (lowerExt === 'mrc' && lowerKind === 't') entry.translatedMrc = normalized;
    else if (lowerExt === 'bmp' && lowerKind === 'hmap') entry.hmap = normalized;
    else if (lowerExt === 'arc' && lowerKind === 'set') entry.setArc = normalized;
  }

  return [...entries.values()].sort((a, b) => Number(a.mapId) - Number(b.mapId));
}

const root = process.argv[2]?.trim() || DEFAULT_ROOT;
if (!root) throw new Error('Original source root is required. Set DARKSABER_ORIGINAL_SOURCE_ROOT or pass [sourceRoot].');
const files = walkFiles(root);
const scripts = files
  .filter((file) => file.toLowerCase().endsWith('.lsc'))
  .map((file) => ({
    file: relative(root, file),
    ...scanScript(readFileSync(file)),
  }));
const mapManifest = createMapManifest(files.filter((file) =>
  relative(root, file).replace(/\\/g, '/').startsWith('MAP/')
));

console.log(JSON.stringify({ root, scripts, mapManifest }, null, 2));
