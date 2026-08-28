import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import sharp from 'sharp';

const FRAME_SIZE = 32;
const REPAIRED_ACTION_SHEETS = [
    'naval_t2_walk.png',
    'infantry_t5_walk.png',
    'cavalry_t5_walk.png',
    'lancer_t5_walk.png',
    'archer_t5_walk.png',
    'cleric_t5_walk.png',
    'priest_t5_walk.png',
    'mage_t5_walk.png',
    'cultist_t5_walk.png',
    'infantry_t6_walk.png',
    'cavalry_t6_walk.png',
];

async function readCell(file: string, row: number, column: number): Promise<Buffer> {
    return sharp(file)
        .extract({
            left: column * FRAME_SIZE,
            top: row * FRAME_SIZE,
            width: FRAME_SIZE,
            height: FRAME_SIZE,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
}

function visiblePixelCount(raw: Buffer): number {
    let visible = 0;
    for (let offset = 3; offset < raw.length; offset += 4) {
        if (raw[offset] > 16) visible += 1;
    }
    return visible;
}

test('repaired party sheets contain distinct down and up basic-attack frames', async () => {
    const directory = path.resolve('public', 'assets', 'images', 'characters', 'animations');

    for (const sheet of REPAIRED_ACTION_SHEETS) {
        const file = path.join(directory, sheet);
        const metadata = await sharp(file).metadata();
        assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 96, height: 192 }, sheet);

        for (const row of [4, 5]) {
            const idle = await readCell(file, row, 0);
            const attack = await readCell(file, row, 1);
            assert.ok(visiblePixelCount(idle) > 0, `${sheet} row ${row} idle frame is blank`);
            assert.ok(visiblePixelCount(attack) > 0, `${sheet} row ${row} attack frame is blank`);
            assert.equal(idle.equals(attack), false, `${sheet} row ${row} attack frame duplicates idle`);
        }
    }
});
