import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { TileType } from '../../src/map/Tile';
import type { FieldActor } from '../../src/field/FieldTypes';
import type { AttackPatternProfile } from '../../src/field/TargetPatterns';
import { WorldCombatController, type CombatEventSink } from '../../src/engine/world/WorldCombatController';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('world combat controller applies actor attack damage and returns defeated enemies', () => {
    const previousRandom = Math.random;
    Math.random = () => 0;

    try {
        const character = new Character('hero-1', 'Hero', 'infantry');
        character.stats.atk = 100;
        character.stats.hitRate = 200;
        const actor: FieldActor = {
            id: character.id,
            character,
            entity: new Player(0, 0),
            path: [],
            queuedIntent: null,
        };
        actor.entity.actionGauge = 100;

        const enemy = new Enemy('enemy-1', 1, 0, 'Enemy', 1);
        enemy.stats.hp = 5;
        enemy.stats.def = 0;

        const events: string[] = [];
        const sink: CombatEventSink = {
            log: (message) => events.push(message),
            spawnDamage: () => undefined,
            spawnStatus: (_x, _y, text) => events.push(text),
            spawnHitEffect: () => undefined,
            spawnKillEffect: (target) => events.push(`kill:${target.id}`),
            spawnAttackCue: () => undefined,
            spawnLoot: (target) => events.push(`loot:${target.id}`),
        };
        const controller = new WorldCombatController(sink);
        const profile: AttackPatternProfile = {
            select: { kind: 'adjacent', maxRange: 1 },
            effect: { kind: 'single' },
        };

        const result = controller.tryActorAttack({
            actor,
            selectedEnemy: enemy,
            targetEnemies: [enemy],
            profile,
            getTileAt: () => TileType.GRASS,
            directionFromTo: () => 'right',
            tryEnemyCounterAttack: () => ({ executed: false, killedEnemyIds: [], downedCharacterIds: [] }),
        });

        assert.equal(result.executed, true);
        assert.deepEqual(result.killedEnemyIds, ['enemy-1']);
        assert.equal(enemy.stats.hp, 0);
        assert.equal(enemy.isAggro, false);
        assert.ok(events.includes('kill:enemy-1'));
        assert.ok(events.includes('loot:enemy-1'));
    } finally {
        Math.random = previousRandom;
    }
});
