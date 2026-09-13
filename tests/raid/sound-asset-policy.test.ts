import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    buildRequiredSoundPaths,
    collectRequiredSoundKeys,
    isOptionalSoundAsset,
    parseAudioCatalog,
} from '../../scripts/sound-asset-policy.mjs';

const rootDir = process.cwd();
const policy = buildRequiredSoundPaths(rootDir);

test('AUDIO_CATALOG parses from AudioManager', () => {
    const content = readFileSync(join(rootDir, 'src/engine/AudioManager.ts'), 'utf8');
    const catalog = parseAudioCatalog(content);
    assert.ok(catalog.size > 50);
    assert.equal(catalog.get('ui.confirm'), '/assets/sounds/ui/confirm.wav');
    assert.equal(catalog.get('sfx.swing'), '/assets/sounds/original/07.wav');
});

test('required sound keys resolve to catalog entries', () => {
    for (const key of policy.requiredKeys) {
        assert.ok(policy.catalog.has(key), `missing catalog entry for required key ${key}`);
    }
});

test('required sound assets exist on disk', () => {
    for (const src of policy.requiredPaths) {
        const assetPath = join(rootDir, 'public', src.replace(/^\//, ''));
        assert.ok(existsSync(assetPath), `missing required sound asset ${src}`);
    }
});

test('core combat and UI hooks are required', () => {
    const keys = collectRequiredSoundKeys(rootDir);
    for (const key of ['ui.confirm', 'sfx.swing', 'sfx.miss', 'sfx.crit', 'bgm.tutorial.training']) {
        assert.ok(keys.has(key), `expected required key ${key}`);
    }
});

test('unused recorded footsteps stay optional', () => {
    for (const src of [
        '/assets/sounds/world/footstep_grass.ogg',
    ]) {
        assert.ok(isOptionalSoundAsset(src, policy), `expected optional sound ${src}`);
    }
});

test('every music key resolves to a recovered MIDI and every numbered effect is used', () => {
    const used = new Set([...policy.requiredKeys].map((key) => policy.catalog.get(key)));
    for (const [key, src] of policy.catalog) {
        if (key.startsWith('bgm.')) {
            assert.ok(src.endsWith('.mid'), key);
            assert.ok(existsSync(join(rootDir, 'public', src)), key);
        }
        if (key.startsWith('sfx.original.')) assert.ok(used.has(src), `unconnected original ${src}`);
    }
    for (const key of ['bgm.title', 'bgm.world', 'bgm.town', 'bgm.raid', 'bgm.boss']) {
        assert.ok(policy.requiredKeys.has(key), key);
    }
});
