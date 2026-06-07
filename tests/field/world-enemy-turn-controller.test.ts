import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus } from '../../src/combat/StatusEffects';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import type { EnemyAIDecision } from '../../src/field/EnemyAI';
import type { TilePoint } from '../../src/field/FieldPathing';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import { WorldCombatController, type CombatEventSink } from '../../src/engine/world/WorldCombatController';
import {
    WorldEnemyTurnController,
    type WorldEnemyEventSink,
} from '../../src/engine/world/WorldEnemyTurnController';
import { WorldMovementController } from '../../src/engine/world/WorldMovementController';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

interface Harness {
    controller: WorldEnemyTurnController;
    events: string[];
}

function makeActor(id: string, x: number, y: number): FieldActor {
    const character = new Character(id, id, 'infantry');
    character.stats.hitRate = 200;
    return {
        id: character.id,
        character,
        entity: new Player(x, y),
        path: [],
        queuedIntent: null,
    };
}

function makeEnemyEntry(id: string, x: number, y: number, role: ConstructorParameters<typeof Enemy>[6] = 'bruiser'): FieldEnemy {
    const enemy = new Enemy(id, x, y, id, 1, '#ff4444', role);
    enemy.isAggro = true;
    enemy.stats.hitRate = 200;
    return {
        enemy,
        home: { x, y },
        path: [],
    };
}

function distance(a: TilePoint, b: TilePoint): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function directionFromTo(from: TilePoint, to: TilePoint): 'up' | 'down' | 'left' | 'right' {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
}

function makeHarness(actors: FieldActor[], enemies: FieldEnemy[]): Harness {
    const events: string[] = [];
    const movement = new WorldMovementController({
        getPartyActors: () => actors,
        getFieldEnemies: () => enemies,
        getTileAt: () => TileType.GRASS,
        getTerrainTraitsForActorId: () => ({}),
    });
    const combatSink: CombatEventSink = {
        log: (message) => events.push(message),
        spawnDamage: (_x, _y, amount, _isCrit, isMiss) => events.push(isMiss ? 'miss' : `damage:${amount}`),
        spawnStatus: (_x, _y, text) => events.push(text),
        spawnHitEffect: () => undefined,
        spawnKillEffect: (enemy) => events.push(`kill:${enemy.id}`),
        spawnAttackCue: () => events.push('attack-cue'),
        spawnLoot: (enemy) => events.push(`loot:${enemy.id}`),
    };
    const enemySink: WorldEnemyEventSink = {
        log: (message) => events.push(message),
        spawnDamage: (_x, _y, amount, _isCrit, isMiss) => events.push(isMiss ? 'miss' : `damage:${amount}`),
        spawnStatus: (_x, _y, text) => events.push(text),
        spawnHeal: (_x, _y, amount) => events.push(`heal:${amount}`),
        spawnHealEffect: () => events.push('heal-effect'),
        spawnBuffEffect: () => events.push('buff-effect'),
        spawnDebuffEffect: () => events.push('debuff-effect'),
        spawnDarkEffect: () => events.push('dark-effect'),
        spawnElementEffect: (element) => events.push(`element:${element}`),
        spawnAttackCue: () => events.push('attack-cue'),
    };
    const combat = new WorldCombatController(combatSink);
    const controller = new WorldEnemyTurnController(
        {
            getPartyActors: () => actors,
            getFieldEnemies: () => enemies,
            getActorById: (actorId) => actors.find((actor) => actor.id === actorId && !actor.character.isDead) ?? null,
            getEnemyById: (enemyId) => enemies.find((entry) => entry.enemy.id === enemyId)?.enemy ?? null,
            getTileAt: () => TileType.GRASS,
            getActorTerrainTraits: () => ({}),
            canEnemyAttackTarget: (enemy, actor, range) =>
                distance({ x: enemy.gridX, y: enemy.gridY }, { x: actor.entity.gridX, y: actor.entity.gridY }) <= range,
            canActorAttackTarget: () => false,
            hasFieldLineOfSight: () => true,
            directionFromTo,
        },
        movement,
        combat,
        enemySink
    );

    return { controller, events };
}

test('attack decision calls combat controller and returns downed characters', () => {
    const previousRandom = Math.random;
    Math.random = () => 0;

    try {
        const actor = makeActor('hero', 1, 0);
        actor.character.stats.hp = 10;
        actor.character.stats.def = 0;
        const enemyEntry = makeEnemyEntry('enemy', 0, 0);
        enemyEntry.enemy.stats.atk = 100;
        enemyEntry.enemy.stats.critRate = 0;
        const { controller, events } = makeHarness([actor], [enemyEntry]);

        const result = controller.executeEnemyDecision(enemyEntry, {
            kind: 'attack',
            targetId: actor.id,
            range: 1,
            reason: 'test',
        });

        assert.equal(result.executed, true);
        assert.deepEqual(result.downedCharacterIds, [actor.id]);
        assert.equal(actor.character.stats.hp, 0);
        assert.ok(events.includes('attack-cue'));
    } finally {
        Math.random = previousRandom;
    }
});

test('move decisions invoke movement controller', () => {
    const target = makeActor('hero', 3, 0);
    const chaser = makeEnemyEntry('chaser', 0, 0);
    const chaseHarness = makeHarness([target], [chaser]);

    chaseHarness.controller.executeEnemyDecision(chaser, {
        kind: 'moveToward',
        targetId: target.id,
        desiredRange: 1,
        reason: 'test',
    });
    assert.deepEqual({ x: chaser.enemy.gridX, y: chaser.enemy.gridY }, { x: 1, y: 0 });

    const closeTarget = makeActor('close-hero', 0, 0);
    const kiter = makeEnemyEntry('kiter', 1, 0);
    const kiteHarness = makeHarness([closeTarget], [kiter]);

    kiteHarness.controller.executeEnemyDecision(kiter, {
        kind: 'moveAway',
        targetId: closeTarget.id,
        reason: 'test',
    });
    assert.notDeepEqual({ x: kiter.enemy.gridX, y: kiter.enemy.gridY }, { x: 1, y: 0 });
    assert.ok(distance({ x: kiter.enemy.gridX, y: kiter.enemy.gridY }, { x: closeTarget.entity.gridX, y: closeTarget.entity.gridY }) > 1);
});

test('aggro enemy turn chases when out of range and attacks once adjacent', () => {
    const previousRandom = Math.random;
    Math.random = () => 0;

    try {
        const actor = makeActor('hero', 3, 0);
        actor.character.stats.def = 0;
        const enemyEntry = makeEnemyEntry('chaser', 0, 0);
        enemyEntry.enemy.stats.atk = 30;
        enemyEntry.enemy.stats.critRate = 0;
        const { controller, events } = makeHarness([actor], [enemyEntry]);

        const chaseResult = controller.beginEnemyTurn(enemyEntry);

        assert.equal(chaseResult.executed, false);
        assert.deepEqual({ x: enemyEntry.enemy.gridX, y: enemyEntry.enemy.gridY }, { x: 1, y: 0 });
        assert.equal(events.includes('attack-cue'), false);

        events.length = 0;
        enemyEntry.enemy.gridX = 2;
        enemyEntry.enemy.gridY = 0;
        enemyEntry.enemy.pixelX = 2;
        enemyEntry.enemy.pixelY = 0;

        const attackResult = controller.beginEnemyTurn(enemyEntry);

        assert.equal(attackResult.executed, true);
        assert.deepEqual({ x: enemyEntry.enemy.gridX, y: enemyEntry.enemy.gridY }, { x: 2, y: 0 });
        assert.ok(events.includes('attack-cue'));
        assert.ok(events.some((event) => event.startsWith('damage:')));
    } finally {
        Math.random = previousRandom;
    }
});

test('enemy intent preview is shown before the stored decision is consumed', () => {
    const previousRandom = Math.random;
    Math.random = () => 0;

    try {
        const actor = makeActor('hero', 1, 0);
        actor.character.stats.def = 0;
        const enemyEntry = makeEnemyEntry('enemy', 0, 0);
        enemyEntry.enemy.stats.atk = 30;
        enemyEntry.enemy.stats.critRate = 0;
        const { controller, events } = makeHarness([actor], [enemyEntry]);

        const preview = controller.previewEnemyIntent(enemyEntry);

        assert.equal(preview?.kind, 'attack');
        assert.equal(enemyEntry.enemy.aiMemory.turnCount, 0);
        enemyEntry.previewIntent = preview;

        const result = controller.beginEnemyTurn(enemyEntry);

        assert.equal(result.executed, true);
        assert.equal(enemyEntry.previewIntent, null);
        assert.equal(enemyEntry.enemy.aiMemory.turnCount, 1);
        assert.ok(events.includes('attack-cue'));
    } finally {
        Math.random = previousRandom;
    }
});

test('immobilized move decision emits root feedback without moving', () => {
    const target = makeActor('hero', 3, 0);
    const rooted = makeEnemyEntry('rooted', 0, 0);
    rooted.enemy.statuses = [createStatus('immobilize')];
    const { controller, events } = makeHarness([target], [rooted]);

    controller.executeEnemyDecision(rooted, {
        kind: 'moveToward',
        targetId: target.id,
        desiredRange: 1,
        reason: 'test',
    });

    assert.deepEqual({ x: rooted.enemy.gridX, y: rooted.enemy.gridY }, { x: 0, y: 0 });
    assert.ok(events.includes('ROOT'));
    assert.ok(events.some((event) => event.includes('rooted:')));
});

test('support decisions and boss spell pattern mutate state and return combat result', () => {
    const actor = makeActor('hero', 2, 0);
    const support = makeEnemyEntry('support', 0, 0, 'support');
    const ally = makeEnemyEntry('ally', 1, 0, 'tank');
    ally.enemy.stats.hp = 5;
    ally.enemy.stats.maxHp = 50;
    support.enemy.stats.magAtk = 20;
    const supportHarness = makeHarness([actor], [support, ally]);

    supportHarness.controller.executeEnemyDecision(support, {
        kind: 'healAlly',
        allyId: ally.enemy.id,
        reason: 'test',
    });
    assert.ok(ally.enemy.stats.hp > 5);
    assert.ok(supportHarness.events.some((event) => event.startsWith('heal:')));

    supportHarness.controller.executeEnemyDecision(support, {
        kind: 'buffAlly',
        allyId: ally.enemy.id,
        status: 'attackUp',
        reason: 'test',
    });
    assert.ok(ally.enemy.statuses.some((status) => status.kind === 'attackUp'));

    supportHarness.controller.executeEnemyDecision(support, {
        kind: 'debuffTarget',
        targetId: actor.id,
        status: 'attackDown',
        reason: 'test',
    });
    assert.ok(actor.character.statuses.some((status) => status.kind === 'attackDown'));

    const bossTarget = makeActor('boss-target', 1, 0);
    bossTarget.character.stats.hp = 10;
    bossTarget.character.stats.magDef = 0;
    const boss = makeEnemyEntry('boss', 0, 0, 'boss');
    boss.enemy.stats.magAtk = 100;
    const bossHarness = makeHarness([bossTarget], [boss]);
    const decision: EnemyAIDecision = {
        kind: 'bossPattern',
        targetId: bossTarget.id,
        pattern: 'voidBolt',
        reason: 'test',
    };

    const result = bossHarness.controller.executeEnemyDecision(boss, decision);

    assert.equal(result.executed, true);
    assert.deepEqual(result.downedCharacterIds, [bossTarget.id]);
    assert.equal(bossTarget.character.stats.hp, 0);
    assert.ok(bossHarness.events.includes('element:dark'));
});
