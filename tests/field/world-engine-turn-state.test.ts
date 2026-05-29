import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { Player } from '../../src/entity/Player';
import type { FieldActor } from '../../src/field/FieldTypes';
import { WorldEngine } from '../../src/engine/WorldEngine';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string): FieldActor {
    const character = new Character(id, id, 'infantry');
    return {
        id: character.id,
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };
}

function makeEngineHarness(actor: FieldActor): { engine: any; calls: string[] } {
    const calls: string[] = [];
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.activeTurnActorId = actor.id;
    engine.readyQueue = [];
    engine.remainingActionPoints = 6;
    engine.majorActionUsedThisTurn = false;
    engine.reservedAction = null;
    engine.restingRecoveryTimers = new Map();
    engine.partyActors = [actor];
    engine.fieldEnemies = [];
    engine.combatLog = [];
    engine.actionMenuUI = { close: () => calls.push('closeActionMenu') };
    engine.tacticalController = { close: () => calls.push('closeTacticalMenu') };
    engine.playerActionController = {
        hasExecutableAction: () => true,
        clearTargeting: () => calls.push('clearTargeting'),
    };
    engine.magicController = { reset: () => calls.push('resetMagic') };
    engine.selectionController = { selectActor: () => calls.push('selectActor') };
    return { engine, calls };
}

test('active actor turn ends instead of reopening when counter damage downs the actor', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    actor.character.stats.hp = 0;
    actor.character.isDead = true;
    actor.queuedIntent = { kind: 'attack', enemyId: 'enemy-1' };

    const { engine } = makeEngineHarness(actor);

    engine.resumeOrEndActiveTurn(actor);

    assert.equal(engine.activeTurnActorId, null);
    assert.equal(engine.remainingActionPoints, 0);
    assert.equal(engine.majorActionUsedThisTurn, false);
    assert.equal(engine.reservedAction, null);
    assert.equal(actor.entity.actionGauge, 0);
    assert.equal(actor.queuedIntent, null);
    assert.ok(engine.combatLog.includes('hero 턴 종료: 행동 불능'));
});

test('ready queue is unblocked if active turn points at a downed actor', () => {
    const actor = makeActor('hero');
    actor.character.stats.hp = 0;
    actor.character.isDead = true;

    const { engine, calls } = makeEngineHarness(actor);

    engine.startNextReadyTurn();

    assert.equal(engine.activeTurnActorId, null);
    assert.equal(engine.remainingActionPoints, 0);
    assert.ok(calls.includes('clearTargeting'));
    assert.ok(calls.includes('resetMagic'));
});

test('major action flag is set explicitly and cleared on turn end', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);

    engine.markMajorActionUsed();
    assert.equal(engine.majorActionUsedThisTurn, true);

    engine.endActorTurn(actor, 'test');
    assert.equal(engine.majorActionUsedThisTurn, false);
});

test('resting status recovers over time and clears at full resources', () => {
    const actor = makeActor('hero');
    actor.character.stats.hp = 90;
    actor.character.stats.maxHp = 100;
    actor.character.stats.mp = 8;
    actor.character.stats.maxMp = 10;
    actor.character.statuses = [createStatus('resting')];
    const { engine } = makeEngineHarness(actor);
    engine.floatingText = {
        spawnHeal: () => undefined,
        spawnStatus: () => undefined,
    };
    engine.effectManager = { spawnHealEffect: () => undefined };

    engine.updateRestingActors(1);

    assert.equal(actor.character.stats.hp, 93);
    assert.equal(actor.character.stats.mp, 9);
    assert.equal(hasStatus(actor.character.statuses, 'resting'), true);

    engine.updateRestingActors(3);

    assert.equal(actor.character.stats.hp, 100);
    assert.equal(actor.character.stats.mp, 10);
    assert.equal(hasStatus(actor.character.statuses, 'resting'), false);
    assert.ok(engine.combatLog.includes('hero: 휴식 완료'));
});

test('resting status is interrupted when HP drops', () => {
    const actor = makeActor('hero');
    actor.character.stats.hp = 90;
    actor.character.statuses = [createStatus('resting')];
    const { engine } = makeEngineHarness(actor);
    engine.floatingText = { spawnStatus: () => undefined };
    const before = engine.snapshotPartyHp();

    actor.character.stats.hp = 80;
    engine.interruptRestingForDamage(before);

    assert.equal(hasStatus(actor.character.statuses, 'resting'), false);
    assert.ok(engine.combatLog.includes('hero: 피해로 휴식 중단'));
});
