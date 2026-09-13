import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import { Character } from '../../src/character/Character';
import { WorldFieldSpawnController } from '../../src/engine/world/WorldFieldSpawnController';
import type { WorldMovementController } from '../../src/engine/world/WorldMovementController';

const FRAME_SIZE = 32;
const TARGETS = [
    { id: 'master_battle_t10', classLineId: 'master_battle', tier: 10 },
    { id: 'master_tactics_t10', classLineId: 'master_tactics', tier: 10 },
    { id: 'master_magic_t10', classLineId: 'master_magic', tier: 10 },
    { id: 'alchemist_t3', classLineId: 'alchemist', tier: 3 },
    { id: 'alchemist_t4', classLineId: 'alchemist', tier: 4 },
    { id: 'alchemist_t7', classLineId: 'alchemist', tier: 7 },
    { id: 'master_healer_t9', classLineId: 'master_healer', tier: 9 },
    { id: 'master_healer_t8', classLineId: 'master_healer', tier: 8 },
] as const;

class ImageStub {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public src = '';
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function visiblePixelCount(raw: Buffer): number {
    let visible = 0;
    for (let offset = 3; offset < raw.length; offset += 4) {
        if (raw[offset] > 16) visible += 1;
    }
    return visible;
}

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

function assertTransparentCellBorder(raw: Buffer, label: string): void {
    const alphaAt = (x: number, y: number) => raw[(y * FRAME_SIZE + x) * 4 + 3];
    for (let index = 0; index < FRAME_SIZE; index += 1) {
        assert.equal(alphaAt(index, 0), 0, `${label} top border`);
        assert.equal(alphaAt(index, FRAME_SIZE - 1), 0, `${label} bottom border`);
        assert.equal(alphaAt(0, index), 0, `${label} left border`);
        assert.equal(alphaAt(FRAME_SIZE - 1, index), 0, `${label} right border`);
    }
}

test('eight requested class identities have production portraits and complete transparent animation sheets', async () => {
    const portraitDirectory = path.resolve('public', 'assets', 'images', 'characters', 'darksaber');
    const animationDirectory = path.resolve('public', 'assets', 'images', 'characters', 'animations');
    const southNeutralFrames: Buffer[] = [];

    for (const target of TARGETS) {
        const portrait = path.join(portraitDirectory, `${target.id}.png`);
        const sheet = path.join(animationDirectory, `${target.id}_walk.png`);
        const portraitMetadata = await sharp(portrait).metadata();
        const sheetMetadata = await sharp(sheet).metadata();

        assert.deepEqual(
            { width: portraitMetadata.width, height: portraitMetadata.height, alpha: portraitMetadata.hasAlpha },
            { width: 128, height: 128, alpha: true },
            `${target.id} portrait`,
        );
        assert.deepEqual(
            { width: sheetMetadata.width, height: sheetMetadata.height, alpha: sheetMetadata.hasAlpha },
            { width: 96, height: 192, alpha: true },
            `${target.id} sheet`,
        );

        for (let row = 0; row < 6; row += 1) {
            const rowFrames: Buffer[] = [];
            for (let column = 0; column < 3; column += 1) {
                const frame = await readCell(sheet, row, column);
                assert.ok(visiblePixelCount(frame) >= 20, `${target.id} row ${row + 1} column ${column + 1} is blank`);
                assertTransparentCellBorder(frame, `${target.id} row ${row + 1} column ${column + 1}`);
                rowFrames.push(frame);
            }
            assert.ok(
                !rowFrames[0].equals(rowFrames[1]) || !rowFrames[1].equals(rowFrames[2]),
                `${target.id} row ${row + 1} has no animation change`,
            );
        }

        southNeutralFrames.push(await readCell(sheet, 1, 1));
    }

    for (let left = 0; left < southNeutralFrames.length; left += 1) {
        for (let right = left + 1; right < southNeutralFrames.length; right += 1) {
            assert.equal(
                southNeutralFrames[left].equals(southNeutralFrames[right]),
                false,
                `${TARGETS[left].id} and ${TARGETS[right].id} duplicate the same south-facing identity`,
            );
        }
    }
});

test('the requested class tiers load their matching 3-frame walk and 2-frame action sheets', () => {
    const movement = {
        findNearbyWalkableTile: (tile: { x: number; y: number }) => tile,
    } as unknown as WorldMovementController;
    const controller = new WorldFieldSpawnController(movement);

    for (const target of TARGETS) {
        const character = new Character(target.id, target.id, target.classLineId);
        character.currentTier = target.tier;

        assert.equal(
            character.getPortraitSrc(),
            `/assets/images/characters/darksaber/${target.id}.png`,
            `${target.id} portrait mapping`,
        );

        const [actor] = controller.createPartyActors({ x: 4, y: 6 }, [character]);
        const sprite = actor.entity.walkSprite;
        assert.equal(sprite?.image.src, `/assets/images/characters/animations/${target.id}_walk.png`);
        assert.equal(sprite?.frameWidth, 32);
        assert.equal(sprite?.frameHeight, 32);
        assert.equal(sprite?.frameCount, 3);
        assert.deepEqual(sprite?.rowByFacing, { up: 0, down: 1, left: 3, right: 2 });
        assert.deepEqual(sprite?.actionRowByFacing, { down: 4, up: 5 });
        assert.equal(sprite?.actionFrameCount, 2);
    }
});
