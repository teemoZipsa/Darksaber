import fs from 'fs';
import path from 'path';

const AUDIO_MANAGER_REL = path.join('src', 'engine', 'AudioManager.ts');
const MAGIC_CONTROLLER_REL = path.join('src', 'engine', 'world', 'WorldMagicController.ts');
const STORY_SCENARIO_REL = path.join('src', 'data', 'StoryScenarioData.ts');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const CATALOG_ENTRY_REGEX = /'([^']+)':\s*\{\s*src:\s*(?:originalSfx\('([^']+)'\)|'([^']+)')/g;

function walkFiles(entry) {
  if (!fs.existsSync(entry)) return [];
  const stat = fs.statSync(entry);
  if (stat.isFile()) return SOURCE_EXTENSIONS.has(path.extname(entry)) ? [entry] : [];

  const results = [];
  for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
    const childPath = path.join(entry, child.name);
    if (child.isDirectory()) results.push(...walkFiles(childPath));
    else if (SOURCE_EXTENSIONS.has(path.extname(child.name))) results.push(childPath);
  }
  return results;
}

export function parseAudioCatalog(content) {
  const catalog = new Map();
  const blockMatch = content.match(/export const AUDIO_CATALOG[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!blockMatch) throw new Error('AUDIO_CATALOG block not found in AudioManager.ts');

  CATALOG_ENTRY_REGEX.lastIndex = 0;
  let match;
  while ((match = CATALOG_ENTRY_REGEX.exec(blockMatch[1])) !== null) {
    const key = match[1];
    const src = match[2] ? `/assets/sounds/original/${match[2]}.wav` : match[3];
    catalog.set(key, src);
  }
  return catalog;
}

export function collectStoryBgmKeys(rootDir) {
  const keys = new Set();
  const scenarioPath = path.join(rootDir, STORY_SCENARIO_REL);
  if (!fs.existsSync(scenarioPath)) return keys;

  const content = fs.readFileSync(scenarioPath, 'utf8');
  const episodeRegex = /episode:\s*(\d+)/g;
  let match;
  while ((match = episodeRegex.exec(content)) !== null) {
    keys.add(`bgm.story.episode${String(Number(match[1])).padStart(2, '0')}`);
  }
  return keys;
}

export function collectSkillCastSfxKeys(rootDir) {
  const keys = new Set();
  const magicPath = path.join(rootDir, MAGIC_CONTROLLER_REL);
  if (!fs.existsSync(magicPath)) return keys;

  const content = fs.readFileSync(magicPath, 'utf8');
  const fnMatch = content.match(/function getSkillCastSfx[\s\S]*?^}/m);
  if (!fnMatch) return keys;

  const returnRegex = /return\s+'([^']+)'/g;
  let match;
  while ((match = returnRegex.exec(fnMatch[0])) !== null) keys.add(match[1]);
  return keys;
}

const PLAY_METHOD_REGEX = /AudioManager\.play(?:Sfx|Ui|Bgm)\(/g;
const SOUND_KEY_LITERAL_REGEX = /['"]((?:ui|sfx|bgm)\.[^'"]+)['"]/g;

function extractSoundKeysFromPlayCalls(content) {
  const keys = new Set();
  PLAY_METHOD_REGEX.lastIndex = 0;
  let match;
  while ((match = PLAY_METHOD_REGEX.exec(content)) !== null) {
    let index = match.index + match[0].length;
    let depth = 1;
    const start = index;
    while (index < content.length && depth > 0) {
      const ch = content[index];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      index += 1;
    }
    const args = content.slice(start, index - 1);
    SOUND_KEY_LITERAL_REGEX.lastIndex = 0;
    let keyMatch;
    while ((keyMatch = SOUND_KEY_LITERAL_REGEX.exec(args)) !== null) keys.add(keyMatch[1]);
  }
  return keys;
}

export function collectRequiredSoundKeys(rootDir) {
  const keys = new Set();
  const srcDir = path.join(rootDir, 'src');

  for (const file of walkFiles(srcDir)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const key of extractSoundKeysFromPlayCalls(content)) keys.add(key);
  }

  for (const key of collectSkillCastSfxKeys(rootDir)) keys.add(key);
  for (const key of collectStoryBgmKeys(rootDir)) keys.add(key);
  return keys;
}

export function buildRequiredSoundPaths(rootDir) {
  const audioPath = path.join(rootDir, AUDIO_MANAGER_REL);
  const catalog = parseAudioCatalog(fs.readFileSync(audioPath, 'utf8'));
  const requiredKeys = collectRequiredSoundKeys(rootDir);
  const requiredPaths = new Set();
  const pathToKeys = new Map();

  for (const key of requiredKeys) {
    const src = catalog.get(key);
    if (!src) continue;
    requiredPaths.add(src);
    const owners = pathToKeys.get(src) ?? [];
    owners.push(key);
    pathToKeys.set(src, owners);
  }

  return { catalog, requiredKeys, requiredPaths, pathToKeys };
}

export function isSoundAsset(assetString) {
  return assetString.startsWith('/assets/sounds/');
}

export function isOptionalSoundAsset(assetString, policy) {
  if (!isSoundAsset(assetString)) return false;
  if (policy.requiredPaths.has(assetString)) return false;

  const catalogPaths = new Set(policy.catalog.values());
  return catalogPaths.has(assetString);
}
