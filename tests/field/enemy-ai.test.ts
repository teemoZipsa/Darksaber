import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyAIProfile, decideEnemyAction, EnemyAIUnit } from '../../src/field/EnemyAI';

function unit(id: string, x: number, y: number, hp: number = 100, maxHp: number = 100): EnemyAIUnit {
    return {
        id,
        name: id,
        tile: { x, y },
        hp,
        maxHp,
        statusKinds: [],
    };
}

test('archer keeps distance before shooting', () => {
    const self = { ...unit('archer', 0, 0), role: 'archer' as const };
    const close = unit('hero', 1, 0);
    const far = unit('hero', 3, 0);

    assert.equal(decideEnemyAction({
        self,
        targets: [close],
        allies: [self],
        profile: createEnemyAIProfile('archer'),
    }).kind, 'moveAway');

    const shot = decideEnemyAction({
        self,
        targets: [far],
        allies: [self],
        profile: createEnemyAIProfile('archer'),
        hasLineOfSight: () => true,
    });
    assert.equal(shot.kind, 'attack');
    assert.equal(shot.range, 4);
});

test('healer prioritizes wounded allies in support range', () => {
    const self = { ...unit('healer', 0, 0), role: 'healer' as const };
    const wounded = { ...unit('tank', 2, 0, 20, 100), role: 'tank' as const };
    const hero = unit('hero', 4, 0);

    const decision = decideEnemyAction({
        self,
        targets: [hero],
        allies: [self, wounded],
        profile: createEnemyAIProfile('healer'),
    });

    assert.equal(decision.kind, 'healAlly');
    assert.equal(decision.allyId, wounded.id);
});

test('coward flees when hurt', () => {
    const self = { ...unit('coward', 0, 0, 30, 100), role: 'coward' as const };
    const hero = unit('hero', 4, 0);

    const decision = decideEnemyAction({
        self,
        targets: [hero],
        allies: [self],
        profile: createEnemyAIProfile('coward'),
    });

    assert.equal(decision.kind, 'moveAway');
});

test('support buffs allies before debuffing targets', () => {
    const self = { ...unit('support', 0, 0), role: 'support' as const };
    const ally = { ...unit('tank', 2, 0), role: 'tank' as const };
    const hero = unit('hero', 3, 0);

    const decision = decideEnemyAction({
        self,
        targets: [hero],
        allies: [self, ally],
        profile: createEnemyAIProfile('support'),
    });

    assert.equal(decision.kind, 'buffAlly');
    assert.equal(decision.allyId, ally.id);
});

test('boss switches to scheduled and low-hp patterns', () => {
    const self = { ...unit('boss', 0, 0), role: 'boss' as const, isBoss: true };
    const hero = unit('hero', 3, 0);

    const pulse = decideEnemyAction({
        self,
        targets: [hero],
        allies: [self],
        profile: createEnemyAIProfile('boss'),
        turnCount: 4,
        hasLineOfSight: () => true,
    });
    assert.equal(pulse.kind, 'bossPattern');
    assert.equal(pulse.pattern, 'darkPulse');

    const enrage = decideEnemyAction({
        self: { ...self, hp: 20, maxHp: 100 },
        targets: [hero],
        allies: [self],
        profile: createEnemyAIProfile('boss'),
        turnCount: 5,
        hasLineOfSight: () => true,
    });
    assert.equal(enrage.kind, 'bossPattern');
    assert.equal(enrage.pattern, 'enrage');
});
