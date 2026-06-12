import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isOriginalArcArchive,
    isOriginalArcTextCandidate,
    parseOriginalArcArchive,
} from '../../src/data/original/originalArcArchive';

function createArcFixture(): Uint8Array {
    const bytes = new Uint8Array(5 + 36 * 3 + 16);
    bytes.set([0x04, 0x30, 0x39, 0x30, 0x31], 0);

    const writeEntry = (
        index: number,
        name: string,
        values: readonly [number, number, number, number, number],
    ) => {
        const offset = 5 + index * 36;
        bytes[offset] = name.length;
        for (let nameIndex = 0; nameIndex < name.length; nameIndex++) {
            bytes[offset + 1 + nameIndex] = name.charCodeAt(nameIndex);
        }
        const view = new DataView(bytes.buffer);
        values.forEach((value, valueIndex) => view.setUint32(offset + 16 + valueIndex * 4, value, true));
    };

    writeEntry(0, '01.DEO', [0xcafebabe, 1692, 832, 113, 944]);
    writeEntry(1, '01.evt', [0x9c7c1239, 5404, 1327, 945, 2271]);
    writeEntry(2, 'HEADEND', [0, 0xffffffff, 0xffffffff, 0, 0]);
    return bytes;
}

test('original arc parser reads 0901 archive table entries', () => {
    const fixture = createArcFixture();

    assert.equal(isOriginalArcArchive(fixture), true);
    const manifest = parseOriginalArcArchive(fixture);

    assert.equal(manifest.header, '0901');
    assert.equal(manifest.byteLength, fixture.byteLength);
    assert.equal(manifest.entries.length, 2);
    assert.deepEqual(manifest.entries[0], {
        name: '01.DEO',
        checksum: 0xcafebabe,
        unpackedSize: 1692,
        packedSize: 832,
        startOffset: 113,
        endOffset: 944,
    });
    assert.equal(manifest.entries[1].name, '01.evt');
    assert.equal(manifest.entries[1].unpackedSize, 5404);
});

test('original arc text candidate filter covers scenario and duty members', () => {
    assert.equal(isOriginalArcTextCandidate('01.DEO'), true);
    assert.equal(isOriginalArcTextCandidate('01.evt'), true);
    assert.equal(isOriginalArcTextCandidate('01.srf'), true);
    assert.equal(isOriginalArcTextCandidate('duty1-1.txt'), true);
    assert.equal(isOriginalArcTextCandidate('ability.atr'), true);
    assert.equal(isOriginalArcTextCandidate('Fx.bmp'), false);
    assert.equal(isOriginalArcTextCandidate('00.WAV'), false);
});

test('original arc parser rejects non-0901 archives', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4]);

    assert.equal(isOriginalArcArchive(bytes), false);
    assert.throws(() => parseOriginalArcArchive(bytes), /missing 0901 signature/);
});
