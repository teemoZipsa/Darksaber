import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createOriginalScenarioMapManifest,
    scanOriginalScenarioScript,
} from '../../src/data/original/originalScenarioScanner';

function wordsToBytes(words: readonly number[], trailing: readonly number[] = []): Uint8Array {
    const bytes = new Uint8Array(words.length * 4 + trailing.length);
    const view = new DataView(bytes.buffer);
    words.forEach((word, index) => view.setInt32(index * 4, word, true));
    trailing.forEach((byte, index) => { bytes[words.length * 4 + index] = byte; });
    return bytes;
}

test('original scenario script scanner summarizes 4-byte word scripts without text snapshots', () => {
    const scan = scanOriginalScenarioScript(wordsToBytes([
        0x78,
        0xd5,
        5,
        5,
        0x72,
        23,
        35,
        48,
        1001,
        2048,
    ], [0xaa, 0xbb]));

    assert.equal(scan.byteLength, 42);
    assert.equal(scan.wordCount, 10);
    assert.equal(scan.trailingBytes, 2);
    assert.deepEqual(scan.firstWords.slice(0, 4), [0x78, 0xd5, 5, 5]);
    assert.ok(scan.hash.length >= 8);
    assert.ok(scan.opcodeCandidates.some((candidate) => candidate.value === 0x78));
    assert.ok(scan.coordinateCandidates.some((candidate) => candidate.x === 5 && candidate.y === 5));
    assert.ok(scan.textReferenceCandidates.some((candidate) => candidate.value === 1001));
    assert.ok(scan.sceneReferenceCandidates.some((candidate) => candidate.value === 23));
});

test('original scenario map manifest groups mrc, translated mrc, hmap, and set files', () => {
    const manifest = createOriginalScenarioMapManifest([
        'MAP/01.mrc',
        'MAP/01t.mrc',
        'MAP/01hmap.BMP',
        'MAP/01set.arc',
        'MAP/1200.mrc',
        'MAP/1200hmap.bmp',
    ]);

    const burgos = manifest.find((entry) => entry.mapId === '01');
    assert.ok(burgos);
    assert.equal(burgos.mrc, '01.mrc');
    assert.equal(burgos.translatedMrc, '01t.mrc');
    assert.equal(burgos.hmap, '01hmap.BMP');
    assert.equal(burgos.setArc, '01set.arc');

    const pyramid = manifest.find((entry) => entry.mapId === '1200');
    assert.ok(pyramid);
    assert.equal(pyramid.mrc, '1200.mrc');
    assert.equal(pyramid.hmap, '1200hmap.bmp');
});
