import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const stat = statSync(path);
        if (stat.isDirectory()) out.push(...walkFiles(path));
        else if (/\.(ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
}

function objectBlockAfter(text: string, marker: string): string {
    const markerIndex = text.indexOf(marker);
    assert.notEqual(markerIndex, -1, `missing marker ${marker}`);
    const start = text.indexOf('{', markerIndex);
    assert.notEqual(start, -1, `missing object after ${marker}`);

    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start + 1, i);
        }
    }
    assert.fail(`unterminated object after ${marker}`);
}

function collectLiteralUiKeys(): Set<string> {
    const keys = new Set<string>();
    for (const file of walkFiles(join(process.cwd(), 'src'))) {
        const text = readFileSync(file, 'utf8');
        for (const re of [/\bt\(\s*['"]([^'"]+)['"]\s*\)/g, /\bformatT\(\s*['"]([^'"]+)['"]/g]) {
            for (const match of text.matchAll(re)) keys.add(match[1]);
        }
    }
    return keys;
}

function collectLanguageKeys(lang: 'ko' | 'en'): Set<string> {
    const text = readFileSync(join(process.cwd(), 'src/i18n/LanguageManager.ts'), 'utf8');
    const stringsBlock = objectBlockAfter(text, 'strings:');
    const langBlock = objectBlockAfter(stringsBlock, `${lang}:`);
    return new Set([...langBlock.matchAll(/['"]([^'"]+)['"]\s*:/g)].map((match) => match[1]));
}

test('literal UI translation keys exist in both languages', () => {
    const used = collectLiteralUiKeys();
    const ko = collectLanguageKeys('ko');
    const en = collectLanguageKeys('en');

    assert.deepEqual([...used].filter((key) => !ko.has(key)).sort(), []);
    assert.deepEqual([...used].filter((key) => !en.has(key)).sort(), []);
});
