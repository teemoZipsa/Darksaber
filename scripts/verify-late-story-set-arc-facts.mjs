import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const FACTS_PATH = 'src\\data\\content\\original-late-story-facts.json';
const ARC_SIGNATURE = '0901';
const TABLE_OFFSET = 5;
const ENTRY_SIZE = 36;

function parseArgs(argv) {
  const options = {
    sourceRoot: DEFAULT_ROOT,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--source-root') options.sourceRoot = argv[++index] ?? '';
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/verify-late-story-set-arc-facts.mjs [--source-root <Saver>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readAscii(bytes, offset, length) {
  let result = '';
  for (let index = 0; index < length; index++) {
    const value = bytes[offset + index];
    if (value === 0) break;
    result += String.fromCharCode(value);
  }
  return result;
}

function readArcMemberNames(path) {
  const bytes = readFileSync(path);
  if (bytes.length < TABLE_OFFSET || readAscii(bytes, 1, 4) !== ARC_SIGNATURE) {
    throw new Error(`Invalid original ARC archive: ${path}`);
  }

  const names = [];
  for (let offset = TABLE_OFFSET; offset + ENTRY_SIZE <= bytes.length; offset += ENTRY_SIZE) {
    const nameLength = bytes[offset];
    if (nameLength <= 0 || nameLength > 15) break;
    const name = readAscii(bytes, offset + 1, nameLength);
    if (name === 'HEADEND') break;
    if (name.length !== nameLength) break;
    names.push(name);
  }
  return names;
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(options.sourceRoot);
const facts = JSON.parse(readFileSync(resolve(FACTS_PATH), 'utf8'));
const verified = [];

for (const [episode, fact] of Object.entries(facts)) {
  const setArcPath = join(sourceRoot, fact.setArc);
  if (!existsSync(setArcPath)) throw new Error(`Missing episode ${episode} set arc: ${setArcPath}`);

  const names = new Set(readArcMemberNames(setArcPath));
  for (const member of [
    fact.aiMember,
    fact.eventMember,
    fact.deoMember,
    fact.deeMember,
  ].filter(Boolean)) {
    if (!names.has(member)) {
      throw new Error(`Missing episode ${episode} ${fact.setArc} member ${member}; found ${[...names].join(', ')}`);
    }
  }
  verified.push(`${episode}:${fact.setArc}`);
}

console.log(`verified late-story set arc members: ${verified.join(', ')}`);
