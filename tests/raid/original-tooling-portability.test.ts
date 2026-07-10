import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('original-data tooling uses explicit portable source configuration', () => {
    const verifier = readFileSync('scripts/verify-story-source-files.ts', 'utf8');
    const decoder = readFileSync('scripts/decode-original-atr.mjs', 'utf8');
    const generator = readFileSync('scripts/generate-late-story-item-defs.mjs', 'utf8');
    const docs = readFileSync('docs/original-scenario-import.md', 'utf8');
    const allScripts = readdirSync('scripts')
        .filter((name) => name.endsWith('.mjs') || name.endsWith('.ts'))
        .map((name) => readFileSync(`scripts/${name}`, 'utf8'));
    const combined = [...allScripts, docs].join('\n');

    assert.doesNotMatch(combined, /C:[/\\]Users[/\\]/i);
    assert.match(verifier, /DARKSABER_ORIGINAL_SOURCE_ROOT/);
    assert.match(decoder, /DARKSABER_ORIGINAL_SET_DIR/);
    assert.match(generator, /DARKSABER_ORIGINAL_SET_DIR/);
    assert.match(docs, /Do not commit developer-specific absolute source paths/);
});
