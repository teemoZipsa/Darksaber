import fs from 'fs';
import path from 'path';
import { buildRequiredSoundPaths, isOptionalSoundAsset } from './sound-asset-policy.mjs';

const rootDir = process.cwd();
const soundPolicy = buildRequiredSoundPaths(rootDir);
const publicDir = path.join(rootDir, 'public');
const srcDir = path.join(rootDir, 'src');
const quiet = process.argv.includes('--quiet');

const sourceRoots = [
  srcDir,
  path.join(rootDir, 'index.html'),
  path.join(rootDir, 'style.css'),
  path.join(publicDir, 'legal.html'),
];

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json']);
const quotedAssetRegex = /['"`]([^'"`]+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|ttf))['"`]/ig;
const cssUrlRegex = /url\(\s*['"]?([^'")]+?\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|ttf))['"]?\s*\)/ig;

function walkFiles(entry) {
  if (!fs.existsSync(entry)) return [];
  const stat = fs.statSync(entry);
  if (stat.isFile()) return sourceExtensions.has(path.extname(entry)) ? [entry] : [];

  const results = [];
  for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
    const childPath = path.join(entry, child.name);
    if (child.isDirectory()) results.push(...walkFiles(childPath));
    else if (sourceExtensions.has(path.extname(child.name))) results.push(childPath);
  }
  return results;
}

function toPublicPath(assetString) {
  if (/^https?:\/\//i.test(assetString) || assetString.startsWith('data:')) return null;
  if (assetString.startsWith('/')) return assetString.slice(1);
  return assetString;
}

function candidatePaths(assetString) {
  const publicPath = toPublicPath(assetString);
  if (!publicPath) return [];

  const candidates = [path.join(publicDir, publicPath)];
  if (!assetString.startsWith('/')) {
    candidates.push(path.join(publicDir, 'assets', 'images', 'tilesets', publicPath));
  }
  return candidates;
}

function existsAsset(assetString) {
  return candidatePaths(assetString).some((candidate) => fs.existsSync(candidate));
}

function isOptionalAsset(assetString) {
  return isOptionalSoundAsset(assetString, soundPolicy);
}

function isBareSpriteName(assetString) {
  return /^[^/\\]+\.(png|jpg|jpeg|gif|webp)$/i.test(assetString);
}

function resolveKnownTemplateAsset(assetString) {
  if (assetString.startsWith('${MONSTER_SPRITE_PATH}/')) {
    return assetString.replace('${MONSTER_SPRITE_PATH}', '/assets/images/monsters');
  }
  return null;
}

function collectAssetRefs(content) {
  const refs = new Set();
  for (const regex of [quotedAssetRegex, cssUrlRegex]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) refs.add(match[1]);
  }
  return [...refs];
}

function collectMonsterSprites(content) {
  const baseMatch = content.match(/MONSTER_SPRITE_PATH\s*=\s*['"`]([^'"`]+)['"`]/);
  if (!baseMatch) return [];

  const basePath = baseMatch[1].replace(/\/$/, '');
  const sprites = [];
  const spriteRegex = /sprite:\s*['"`]([^'"`]+\.(?:png|jpg|jpeg|gif|webp))['"`]/ig;
  let match;
  while ((match = spriteRegex.exec(content)) !== null) {
    sprites.push(`${basePath}/${match[1]}`);
  }
  return sprites;
}

let hasError = false;
let checked = 0;
let optionalMissing = 0;
let skippedDynamic = 0;

if (!quiet) console.log('Checking asset references...');

for (const file of sourceRoots.flatMap(walkFiles)) {
  const content = fs.readFileSync(file, 'utf8');
  const refs = collectAssetRefs(content);
  if (file.endsWith(path.join('src', 'data', 'MonsterCatalog.ts'))) {
    refs.push(...collectMonsterSprites(content));
  }

  for (const assetString of refs) {
    if (isBareSpriteName(assetString)) continue;

    const resolvedAssetString = assetString.includes('${')
      ? resolveKnownTemplateAsset(assetString)
      : assetString;
    if (!resolvedAssetString) {
      skippedDynamic += 1;
      continue;
    }

    checked += 1;
    if (existsAsset(resolvedAssetString)) {
      if (!quiet) console.log(`OK ${resolvedAssetString}`);
      continue;
    }

    const location = path.relative(rootDir, file);
    if (isOptionalAsset(resolvedAssetString)) {
      optionalMissing += 1;
      if (!quiet) console.warn(`WARN optional missing ${resolvedAssetString} (${location})`);
      continue;
    }

    hasError = true;
    console.error(`ERROR missing ${resolvedAssetString} (${location})`);
  }
}

if (hasError) {
  console.error(`Asset check failed. Checked ${checked} references; optional missing ${optionalMissing}; skipped dynamic ${skippedDynamic}.`);
  process.exit(1);
}

console.log(`All required assets verified. Checked ${checked} references; optional missing ${optionalMissing}; skipped dynamic ${skippedDynamic}.`);
