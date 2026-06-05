import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemDef } from '../../src/data/ItemDB';
import { getNormalizedMonsterBalance } from '../../src/data/original/originalMonsterBalance';
import { Enemy } from '../../src/entity/Enemy';
import { Entity } from '../../src/entity/Entity';
import { ExtractionZone } from '../../src/entity/ExtractionZone';
import { LootObject } from '../../src/entity/LootObject';
import { Player } from '../../src/entity/Player';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public src = '';
}

const testGlobal = globalThis as typeof globalThis & { Image: typeof Image };

function installImageStub(): { restore: () => void; images: ImageStub[] } {
    const original = testGlobal.Image;
    const images: ImageStub[] = [];
    testGlobal.Image = class extends ImageStub {
        public constructor() {
            super();
            images.push(this);
        }
    } as unknown as typeof Image;

    return {
        images,
        restore: () => {
            testGlobal.Image = original;
        },
    };
}

test('player movement honors range, occupancy, facing, and history', () => {
    const player = new Player(5, 5);
    const getTile = () => TileType.GRASS;

    assert.equal(player.tryMove(10, 5, getTile), false);
    assert.equal(player.tryMove(5, 5, getTile), false);
    assert.equal(player.tryMove(6, 5, getTile, () => true), false);
    assert.equal(player.tryMove(6, 5, getTile), true);
    assert.deepEqual({ x: player.gridX, y: player.gridY }, { x: 6, y: 5 });
    assert.equal(player.facing, 'right');
    assert.deepEqual(player.pastPositions, [{ x: 5, y: 5 }]);

    assert.equal(player.tryMove(6, 6, () => TileType.WATER), false);
});

test('enemy movement and damage guards handle edge cases', () => {
    const enemy = new Enemy('e1', 2, 2, 'Test Enemy', 1);
    const getTile = () => TileType.GRASS;

    assert.equal(enemy.moveToward(2, 2, getTile), false);
    assert.deepEqual({ x: enemy.gridX, y: enemy.gridY }, { x: 2, y: 2 });

    const hp = enemy.stats.hp;
    assert.equal(enemy.takeDamage(-10), false);
    assert.equal(enemy.stats.hp, hp);
    assert.equal(enemy.takeDamage(Number.NaN), false);
    assert.equal(enemy.stats.hp, hp);
});

test('enemy role changes do not stack tuning or revive dead enemies', () => {
    const enemy = new Enemy('e1', 0, 0, 'Test Enemy', 1);
    const baseMaxHp = enemy.stats.maxHp;

    enemy.setRole('tank');
    assert.equal(enemy.stats.maxHp, Math.floor(baseMaxHp * 1.35));
    enemy.setRole('archer');
    assert.equal(enemy.stats.maxHp, Math.floor(baseMaxHp * 0.85));
    assert.equal(enemy.isBoss, false);

    enemy.stats.hp = 0;
    enemy.setRole('boss');
    assert.equal(enemy.stats.hp, 0);
    assert.equal(enemy.isBoss, true);
    enemy.setRole('bruiser');
    assert.equal(enemy.isBoss, false);
});

test('enemy can initialize from normalized original monster balance', () => {
    const enemy = new Enemy('e1', 0, 0, 'Ratman', 1, '#fff', 'bruiser', '304R');
    const balance = getNormalizedMonsterBalance('304R', 1);

    assert.equal(enemy.stats.maxHp, balance.stats.maxHp);
    assert.equal(enemy.stats.atk, balance.stats.atk);
    assert.equal(enemy.stats.def, balance.stats.def);
    assert.ok(enemy.stats.atk < 65);
});

test('entity image loaders ignore stale callbacks and support instant positioning', () => {
    const { images, restore } = installImageStub();
    try {
        const entity = new Entity('e1', 0, 0, '#fff');

        entity.setImage('first.png');
        entity.imageLoaded = true;
        entity.setImage('second.png');
        assert.equal(entity.imageLoaded, false);
        images[0].onload?.();
        assert.equal(entity.imageLoaded, false);
        images[1].onload?.();
        assert.equal(entity.imageLoaded, true);

        entity.setWalkSprite('walk-a.png', 16, 16, 4);
        entity.setWalkSprite('walk-b.png', 16, 16, 4);
        const currentSprite = entity.walkSprite;
        images[2].onerror?.();
        assert.equal(entity.walkSprite, currentSprite);
        assert.equal(entity.walkSpriteLoaded, false);
        images[3].onload?.();
        assert.equal(entity.walkSpriteLoaded, true);

        entity.setGridPosition(7, 8, true);
        assert.deepEqual(
            { gridX: entity.gridX, gridY: entity.gridY, pixelX: entity.pixelX, pixelY: entity.pixelY },
            { gridX: 7, gridY: 8, pixelX: 7, pixelY: 8 }
        );
    } finally {
        restore();
    }
});

test('loot objects retain overflow items and sanitize grid sizes', () => {
    const sword = getItemDef('short_sword');
    assert.ok(sword);

    const loot = new LootObject('loot_1', 0, 0, [sword], { gridW: Number.NaN, gridH: -2 });

    assert.equal(loot.inventory.width, 5);
    assert.equal(loot.inventory.height, 1);
    assert.deepEqual(loot.overflowItems.map((item) => item.id), ['short_sword']);
});

test('extraction zone update wraps large deltas without depending on window size', () => {
    const zone = new ExtractionZone(0, 0);
    zone.update(5.25);
    assert.equal(zone.contains(1, 1), true);
});
