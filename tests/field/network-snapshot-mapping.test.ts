import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileNetworkEnemies } from '../../src/engine/world/NetworkSnapshotMapping';
import { getMonsterDefinitionSafe, MONSTER_SPRITE_PATH } from '../../src/data/MonsterCatalog';
import { createBaseStats } from '../../src/data/Stats';
import type { EnemySnapshot } from '../../src/net/WorldProtocol';

class ImageStub {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public complete = true;
    public naturalWidth = 96;
    public naturalHeight = 128;
    public src = '';
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('network enemy snapshots apply original monster sprites for late story bosses', () => {
    const snapshot: EnemySnapshot = {
        id: 'scenario_31_boss',
        monsterId: '751R',
        name: '마계 해결사',
        role: 'boss',
        level: 30,
        color: '#7a3150',
        tile: { x: 22, y: 11 },
        home: { x: 22, y: 11 },
        stats: createBaseStats({ hp: 320, maxHp: 320, atk: 90, def: 80 }),
        statuses: [],
        actionGauge: 35,
        facing: 'down',
        isAggro: true,
        isBoss: true,
    };

    const [entry] = reconcileNetworkEnemies([], [snapshot]);
    const definition = getMonsterDefinitionSafe('751R');
    assert.ok(definition);

    assert.equal(entry.enemy.id, 'scenario_31_boss');
    assert.equal(entry.enemy.name, '마계 해결사');
    assert.deepEqual({ x: entry.enemy.gridX, y: entry.enemy.gridY }, { x: 22, y: 11 });
    assert.equal(entry.enemy.isBoss, true);
    assert.equal(entry.enemy.walkSprite?.image.src, `${MONSTER_SPRITE_PATH}/${definition.sprite}`);
    assert.equal(entry.enemy.walkSprite?.frameWidth, 32);
    assert.equal(entry.enemy.walkSprite?.frameHeight, 32);
    assert.equal(entry.enemy.walkSprite?.frameCount, 3);
});
