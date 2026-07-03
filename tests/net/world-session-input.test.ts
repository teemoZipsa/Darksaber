import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createAttackIntentPayload,
    createCastSkillIntentPayload,
    createEndTurnIntentPayload,
    createInteractIntentPayload,
    createMoveIntentPayload,
    createUseItemIntentPayload,
    readAttackTargetId,
    readSkillTargetId,
    readStringPayload,
    readTilePayload,
} from '../../src/net/WorldIntentPayloads';
import {
    createFallbackActorSnapshot,
    sanitizeCarriedItems,
    sanitizeCarriedWeight,
    sanitizeStringArray,
    sanitizeTier,
} from '../../server/WorldSessionInput';

test('world session input helpers normalize client payloads', () => {
    assert.deepEqual(readTilePayload({ tile: { x: 3.9, y: -1.2 } }), { x: 3, y: -2 });
    assert.deepEqual(readTilePayload({ targetTile: { x: 5, y: 6 } }), { x: 5, y: 6 });
    assert.equal(readTilePayload({ tile: { x: '5', y: 6 } }), null);

    assert.equal(readStringPayload({ itemId: 'herb_cheap' }, 'itemId'), 'herb_cheap');
    assert.equal(readStringPayload({ itemId: 7 }, 'itemId'), null);

    assert.equal(sanitizeCarriedWeight(1.26), 1.3);
    assert.equal(sanitizeCarriedWeight(-4), 0);
    assert.equal(sanitizeTier(99), 10);
    assert.equal(sanitizeTier(0), 1);
    assert.deepEqual(sanitizeStringArray(['a', 1, 'b']), ['a', 'b']);
});

test('shared world intent payload helpers build client shapes and read server targets', () => {
    const tile = { x: 3, y: 4 };
    const path = [{ x: 2, y: 4 }, tile];
    assert.deepEqual(createMoveIntentPayload(tile, path, 20, 2), { tile, path, apCost: 20, pathCost: 2 });
    assert.deepEqual(readTilePayload(createMoveIntentPayload({ x: 3.9, y: 4.1 }, [], 20, 0)), { x: 3, y: 4 });

    assert.deepEqual(createAttackIntentPayload('enemy-1'), { targetId: 'enemy-1' });
    assert.equal(readAttackTargetId({ targetId: 'enemy-1' }), 'enemy-1');
    assert.equal(readAttackTargetId({ enemyId: 'legacy-enemy' }), 'legacy-enemy');

    assert.deepEqual(createCastSkillIntentPayload('fire', 'enemy-1'), { skillId: 'fire', targetId: 'enemy-1' });
    assert.deepEqual(createCastSkillIntentPayload('guard'), { skillId: 'guard' });
    assert.equal(readSkillTargetId({ targetId: 'enemy-1' }), 'enemy-1');
    assert.equal(readSkillTargetId({ enemyId: 'legacy-enemy' }), 'legacy-enemy');

    assert.deepEqual(createInteractIntentPayload('loot-1'), { lootId: 'loot-1' });
    assert.deepEqual(createUseItemIntentPayload('herb'), { itemId: 'herb' });
    assert.deepEqual(createEndTurnIntentPayload('done'), { reason: 'done' });
});

test('world session carried item input keeps known positive item quantities only', () => {
    const items = sanitizeCarriedItems([
        { itemId: 'herb_cheap', quantity: 2.8 },
        { itemId: 'herb_cheap', quantity: 998 },
        { itemId: 'missing_item', quantity: 5 },
        { itemId: 'mp_potion', quantity: -1 },
    ]);

    assert.equal(items.get('herb_cheap'), 999);
    assert.equal(items.has('missing_item'), false);
    assert.equal(items.has('mp_potion'), false);
});

test('world session fallback actor snapshot stays playable', () => {
    const fallback = createFallbackActorSnapshot();

    assert.equal(fallback.id, 'fallback_actor');
    assert.equal(fallback.classLineId, 'infantry');
    assert.equal(fallback.currentTier, 1);
    assert.equal(fallback.stats.hp, fallback.stats.maxHp);
    assert.equal(fallback.isDead, false);
});
