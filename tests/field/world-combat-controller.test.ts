import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { TileType } from '../../src/map/Tile';
import type { FieldActor } from '../../src/field/FieldTypes';
import type { AttackPatternProfile } from '../../src/field/TargetPatterns';
import { WorldCombatController, type CombatEventSink } from '../../src/engine/world/WorldCombatController';
import { WorldCombatFeedbackController } from '../../src/engine/world/WorldCombatFeedbackController';
import { WorldFieldFeedbackState } from '../../src/engine/world/WorldFieldFeedbackState';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('world combat feedback group flushes the strongest registered feedback', () => {
    const shakes: { amount: number; durationMs: number }[] = [];
    const controller = new WorldCombatFeedbackController({
        getWorldTime: () => 42,
        shakeCamera: (amount, durationMs) => shakes.push({ amount, durationMs }),
    });

    const groupId = controller.beginGroup();
    controller.register('normal', groupId);
    controller.register('kill', groupId);
    controller.flush(groupId);

    assert.deepEqual(shakes, [{ amount: 16, durationMs: 320 }]);
});

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

test('guarded direct hit consumes counter readiness and triggers a weaker counter', () => {
    const previousRandom = Math.random;
    Math.random = () => 0;

    try {
        const character = new Character('hero-1', 'Hero', 'infantry');
        character.stats.hp = 100;
        character.stats.maxHp = 100;
        character.stats.atk = 80;
        character.stats.hitRate = 200;
        character.stats.critRate = 0;
        character.statuses = [createStatus('guard'), createStatus('counterReady')];
        const actor: FieldActor = {
            id: character.id,
            character,
            entity: new Player(0, 0),
            path: [],
            queuedIntent: null,
        };

        const enemy = new Enemy('enemy-1', 1, 0, 'Enemy', 1);
        enemy.stats.hp = 100;
        enemy.stats.atk = 20;
        enemy.stats.def = 0;
        enemy.stats.hitRate = 200;
        enemy.stats.critRate = 0;

        const events: string[] = [];
        const sink: CombatEventSink = {
            log: (message) => events.push(message),
            spawnDamage: () => undefined,
            spawnStatus: () => undefined,
            spawnHitEffect: (_x, _y, _isCrit, _group, feedbackKind) => {
                if (feedbackKind) events.push(`feedback:${feedbackKind}`);
            },
            spawnKillEffect: () => undefined,
            spawnAttackCue: () => undefined,
            spawnLoot: () => undefined,
        };
        const controller = new WorldCombatController(sink);

        const result = controller.enemyAttack({
            enemy,
            actor,
            range: 1,
            getTileAt: () => TileType.GRASS,
            getActorTerrainTraits: () => ({}),
            directionFromTo: () => 'left',
            tryActorCounterAttack: (counterActor, counterEnemy) => controller.tryActorCounterAttack({
                actor: counterActor,
                enemy: counterEnemy,
                canActorAttackTarget: () => true,
                getTileAt: () => TileType.GRASS,
            }),
        });

        assert.equal(result.executed, true);
        assert.equal(hasStatus(actor.character.statuses, 'guard'), false);
        assert.equal(hasStatus(actor.character.statuses, 'counterReady'), false);
        assert.ok(enemy.stats.hp < 100);
        assert.ok(events.includes('feedback:counter'));
    } finally {
        Math.random = previousRandom;
    }
});

test('missed direct hit does not consume counter readiness', () => {
    const previousRandom = Math.random;
    Math.random = () => 0.99;

    try {
        const character = new Character('hero-1', 'Hero', 'infantry');
        character.stats.spd = 100;
        character.statuses = [createStatus('guard'), createStatus('counterReady')];
        const actor: FieldActor = {
            id: character.id,
            character,
            entity: new Player(0, 0),
            path: [],
            queuedIntent: null,
        };

        const enemy = new Enemy('enemy-1', 1, 0, 'Enemy', 1);
        enemy.stats.hitRate = 1;

        const controller = new WorldCombatController({
            log: () => undefined,
            spawnDamage: () => undefined,
            spawnStatus: () => undefined,
            spawnHitEffect: () => undefined,
            spawnKillEffect: () => undefined,
            spawnAttackCue: () => undefined,
            spawnLoot: () => undefined,
        });

        controller.enemyAttack({
            enemy,
            actor,
            range: 1,
            getTileAt: () => TileType.GRASS,
            getActorTerrainTraits: () => ({}),
            directionFromTo: () => 'left',
            tryActorCounterAttack: () => {
                throw new Error('counter should not be attempted on miss');
            },
        });

        assert.equal(hasStatus(actor.character.statuses, 'guard'), true);
        assert.equal(hasStatus(actor.character.statuses, 'counterReady'), true);
    } finally {
        Math.random = previousRandom;
    }
});

test('world combat controller keeps authoritative damage synchronous and presents impact after anticipation', () => {
    const previousRandom = Math.random;
    Math.random = () => 0;

    try {
        const character = new Character('hero-1', 'Hero', 'infantry');
        character.stats.atk = 30;
        character.stats.hitRate = 200;
        character.stats.critRate = 0;
        const actor: FieldActor = {
            id: character.id,
            character,
            entity: new Player(0, 0),
            path: [],
            queuedIntent: null,
        };
        const enemy = new Enemy('enemy-1', 1, 0, 'Enemy', 1);
        enemy.stats.hp = 100;
        enemy.stats.def = 0;
        const presentation = new WorldFieldFeedbackState();
        const events: string[] = [];
        const controller = new WorldCombatController({
            log: () => undefined,
            spawnDamage: () => events.push('damage'),
            spawnStatus: () => undefined,
            spawnHitEffect: () => events.push('hit'),
            spawnKillEffect: () => undefined,
            spawnAttackCue: () => events.push('anticipation'),
            spawnLoot: () => undefined,
            flushFeedbackGroup: () => events.push('hitstop'),
            schedulePresentation: (delaySeconds, action) => {
                presentation.scheduleCombatPresentation(delaySeconds, action);
            },
        });

        controller.tryActorAttack({
            actor,
            selectedEnemy: enemy,
            targetEnemies: [enemy],
            profile: {
                select: { kind: 'adjacent', maxRange: 1 },
                effect: { kind: 'single' },
            },
            getTileAt: () => TileType.GRASS,
            directionFromTo: () => 'right',
            tryEnemyCounterAttack: () => ({ executed: false, killedEnemyIds: [], downedCharacterIds: [] }),
        });

        assert.ok(enemy.stats.hp < 100);
        assert.deepEqual(events, ['anticipation']);
        assert.equal(presentation.isCombatPresentationBusy(), true);

        presentation.updateAttackCues(0.099);
        assert.deepEqual(events, ['anticipation']);
        presentation.updateAttackCues(0.002);
        assert.deepEqual(events, ['anticipation', 'damage', 'hit', 'hitstop']);
        assert.equal(presentation.isCombatPresentationBusy(), true);

        presentation.updateAttackCues(1);
        assert.equal(presentation.isCombatPresentationBusy(), false);
    } finally {
        Math.random = previousRandom;
    }
});

test('out-of-range actor counter does not consume counter readiness', () => {
    const character = new Character('hero-1', 'Hero', 'infantry');
    character.statuses = [createStatus('counterReady', { magnitude: 0.7 })];
    const actor: FieldActor = {
        id: character.id,
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };

    const enemy = new Enemy('enemy-1', 5, 0, 'Enemy', 1);
    const events: string[] = [];
    const controller = new WorldCombatController({
        log: (message) => events.push(message),
        spawnDamage: () => undefined,
        spawnStatus: () => undefined,
        spawnHitEffect: () => undefined,
        spawnKillEffect: () => undefined,
        spawnAttackCue: () => undefined,
        spawnLoot: () => undefined,
    });

    const result = controller.tryActorCounterAttack({
        actor,
        enemy,
        canActorAttackTarget: () => false,
        getTileAt: () => TileType.GRASS,
    });

    assert.equal(result.executed, false);
    assert.equal(hasStatus(actor.character.statuses, 'counterReady'), true);
    assert.ok(events.some((message) => message.includes('사거리 밖')));
});
