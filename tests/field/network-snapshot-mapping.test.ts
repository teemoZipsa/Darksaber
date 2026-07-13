import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNetworkActorSnapshot, reconcileNetworkEnemies } from '../../src/engine/world/NetworkSnapshotMapping';
import { Character } from '../../src/character/Character';
import { getCharacterExpToNext } from '../../src/character/CharacterProgression';
import { Player } from '../../src/entity/Player';
import { getMonsterDefinitionSafe, MONSTER_SPRITE_PATH } from '../../src/data/MonsterCatalog';
import { getStoryScenarioByDungeonId } from '../../src/data/StoryScenarioData';
import { getStoryScenarioMonsterLayout } from '../../src/data/StoryScenarioMonsterData';
import { createBaseStats } from '../../src/data/Stats';
import type { ActorSnapshot, EnemySnapshot } from '../../src/net/WorldProtocol';

class ImageStub {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public complete = true;
    public naturalWidth = 96;
    public naturalHeight = 128;
    public src = '';
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('network actor snapshots apply authoritative EXP and emblem progression', () => {
    const character = new Character('hero', 'Hero', 'infantry');
    const actor = {
        id: 'old-id',
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };
    const snapshot: ActorSnapshot = {
        id: 'p1:hero',
        localActorId: 'hero',
        name: 'Hero',
        classLineId: 'infantry',
        currentTier: 2,
        level: 3,
        exp: 17,
        hasEmblem: true,
        tile: { x: 4, y: 5 },
        stats: createBaseStats({ atk: 33 }),
        statuses: [],
        actionGauge: 42,
        remainingAp: 0,
        facing: 'left',
        isDead: false,
    };

    applyNetworkActorSnapshot(actor, snapshot);

    assert.equal(character.currentTier, 2);
    assert.equal(character.level, 3);
    assert.equal(character.exp, 17);
    assert.equal(character.expToNext, getCharacterExpToNext('infantry', 2, 3));
    assert.equal(character.hasEmblem, true);
});

test('network enemy snapshots apply original monster sprites for the episode 31 boss and guards', () => {
    const scenario = getStoryScenarioByDungeonId('demon_fixers_den');
    assert.ok(scenario);
    const monsterLayout = getStoryScenarioMonsterLayout(scenario);
    assert.equal(monsterLayout.bossMonsterId, '751R');
    assert.equal(monsterLayout.guardMonsterIds.length, scenario.guardCount);
    assert.deepEqual(monsterLayout.guardMonsterIds.slice(0, 3), ['729R', '750R', '752R']);

    const snapshots: EnemySnapshot[] = [
        {
            id: 'scenario_31_boss',
            monsterId: monsterLayout.bossMonsterId,
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
        },
        ...monsterLayout.guardMonsterIds.map((monsterId, index): EnemySnapshot => {
            const definition = getMonsterDefinitionSafe(monsterId);
            assert.ok(definition);
            return {
                id: `scenario_31_guard_${index}`,
                monsterId,
                name: definition.name,
                role: definition.role === 'boss' ? 'bruiser' : definition.role,
                level: definition.level,
                color: definition.color,
                tile: { x: 10 + index, y: 20 + index },
                home: { x: 10 + index, y: 20 + index },
                stats: createBaseStats({ hp: 180, maxHp: 180, atk: 55, def: 45 }),
                statuses: [],
                actionGauge: 10 + index,
                facing: 'down',
                isAggro: true,
                isBoss: false,
            };
        }),
    ];

    const entries = reconcileNetworkEnemies([], snapshots);
    assert.equal(entries.length, snapshots.length);

    for (const snapshot of snapshots) {
        const entry = entries.find((candidate) => candidate.enemy.id === snapshot.id);
        const definition = getMonsterDefinitionSafe(snapshot.monsterId);
        assert.ok(entry, snapshot.id);
        assert.ok(definition, snapshot.monsterId);
        assert.equal(entry.enemy.name, snapshot.name);
        assert.deepEqual({ x: entry.enemy.gridX, y: entry.enemy.gridY }, snapshot.tile);
        assert.equal(entry.enemy.isBoss, snapshot.isBoss);
        assert.equal(entry.enemy.walkSprite?.image.src, `${MONSTER_SPRITE_PATH}/${definition.sprite}`);
        assert.equal(entry.enemy.walkSprite?.frameWidth, definition.frameSize);
        assert.equal(entry.enemy.walkSprite?.frameHeight, definition.frameSize);
        assert.equal(entry.enemy.walkSprite?.frameCount, definition.frameCount);
    }
});
