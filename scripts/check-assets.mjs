import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const srcDir = path.join(rootDir, 'src');

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
  return assetString.startsWith('/assets/sounds/');
}

function isBareSpriteName(assetString) {
  return /^[^/\\]+\.(png|jpg|jpeg|gif|webp)$/i.test(assetString);
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

console.log('Checking asset references...');

for (const file of sourceRoots.flatMap(walkFiles)) {
  const content = fs.readFileSync(file, 'utf8');
  const refs = collectAssetRefs(content);
  if (file.endsWith(path.join('src', 'data', 'MonsterCatalog.ts'))) {
    refs.push(...collectMonsterSprites(content));
  }

  for (const assetString of refs) {
    if (isBareSpriteName(assetString)) continue;

    checked += 1;
    if (existsAsset(assetString)) {
      console.log(`OK ${assetString}`);
      continue;
    }

    const location = path.relative(rootDir, file);
    if (isOptionalAsset(assetString)) {
      optionalMissing += 1;
      console.warn(`WARN optional missing ${assetString} (${location})`);
      continue;
    }

    hasError = true;
    console.error(`ERROR missing ${assetString} (${location})`);
  }
}

if (hasError) {
  console.error(`Asset check failed. Checked ${checked} references; optional missing ${optionalMissing}.`);
  process.exit(1);
}

console.log(`All required assets verified. Checked ${checked} references; optional missing ${optionalMissing}.`);
