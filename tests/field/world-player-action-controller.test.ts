import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { hasStatus } from '../../src/combat/StatusEffects';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { ATTACK_AP_COST, MAGIC_AP_COST, getActionApCost } from '../../src/field/FieldActionEconomy';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import { WorldPlayerActionController, type WorldPlayerActionContext } from '../../src/engine/world/WorldPlayerActionController';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string, x: number, y: number): FieldActor {
    const character = new Character(id, id, 'infantry');
    return {
        id: character.id,
        character,
        entity: new Player(x, y),
        path: [],
        queuedIntent: null,
    };
}

function makeEnemyEntry(id: string, x: number, y: number): FieldEnemy {
    return {
        enemy: new Enemy(id, x, y, id, 1),
        home: { x, y },
        path: [],
    };
}

interface ControllerOptions {
    partyActors?: FieldActor[];
    fieldEnemies?: FieldEnemy[];
    hasCastableFieldSkill?: boolean;
    hasUsableCombatTool?: boolean;
    hasRecoveryConsumable?: boolean;
    hasEffectiveRecovery?: boolean;
    majorActionUsed?: { value: boolean };
    fanfareLeaderId?: { value: string | null };
    fanfareFollowerCount?: (actor: FieldActor) => number;
    getActorAttackTargetFailure?: WorldPlayerActionContext['getActorAttackTargetFailure'];
    logs?: string[];
    reopened?: { value: number };
    spentCosts?: number[];
    additionalInteractTiles?: Set<string>;
    interactAtTile?: WorldPlayerActionContext['interactAtTile'];
}

function makeController(actor: FieldActor, remainingAp: number, options: ControllerOptions = {}): WorldPlayerActionController {
    const context: WorldPlayerActionContext = {
        getActivePartyTurnActor: () => actor,
        getPartyActors: () => options.partyActors ?? [actor],
        getFieldEnemies: () => options.fieldEnemies ?? [],
        getRemainingActionPoints: () => remainingAp,
        getReservedAction: () => null,
        getActiveTurnActorId: () => actor.id,
        getActorTerrainMovementBudget: () => 4,
        getActorTerrainStepCost: () => 1,
        getActorAttackProfile: () => ({ select: { kind: 'adjacent', maxRange: 1 }, effect: { kind: 'single' } }),
        getPatternContext: () => ({ casterTile: { x: actor.entity.gridX, y: actor.entity.gridY } }),
        getActorAttackTargetFailure: options.getActorAttackTargetFailure ?? (() => null),
        getEnemyById: () => null,
        getLootById: () => null,
        getLoot: () => [],
        isActorAt: (_actor, tile) => _actor.entity.gridX === tile.x && _actor.entity.gridY === tile.y,
        isEntityMoving: () => false,
        isFieldPassable: () => true,
        spendAp: (cost) => {
            options.spentCosts?.push(cost);
            return true;
        },
        isMajorActionUsed: () => options.majorActionUsed?.value ?? false,
        markMajorActionUsed: () => {
            if (options.majorActionUsed) options.majorActionUsed.value = true;
        },
        getFanfareLeaderId: () => options.fanfareLeaderId?.value ?? null,
        setFanfareLeaderId: (actorId) => {
            if (options.fanfareLeaderId) options.fanfareLeaderId.value = actorId;
        },
        getFanfareFollowerCount: options.fanfareFollowerCount,
        tryActorAttack: () => false,
        openLoot: () => undefined,
        openMagic: () => undefined,
        openTool: () => undefined,
        hasCastableFieldSkill: () => options.hasCastableFieldSkill ?? false,
        hasUsableCombatTool: () => options.hasUsableCombatTool ?? false,
        getCombatToolAvailability: () => ({
            hasRecoveryConsumable: options.hasRecoveryConsumable ?? options.hasUsableCombatTool ?? false,
            hasEffectiveRecovery: options.hasEffectiveRecovery ?? options.hasUsableCombatTool ?? false,
        }),
        reopenActionMenu: () => {
            if (options.reopened) options.reopened.value += 1;
        },
        closeActionMenu: () => undefined,
        closeTacticalMenu: () => undefined,
        resumeOrEndActiveTurn: () => undefined,
        endActorTurn: () => undefined,
        clearActorIntent: () => undefined,
        setReservedAction: () => undefined,
        selectEnemy: () => undefined,
        selectLoot: () => undefined,
        getAdditionalInteractTiles: () => options.additionalInteractTiles ?? new Set(),
        interactAtTile: options.interactAtTile,
    };
    return new WorldPlayerActionController(context, {
        log: (message) => {
            options.logs?.push(message);
        },
        spawnHeal: () => undefined,
        spawnStatus: () => undefined,
        spawnHealEffect: () => undefined,
        spawnBuffEffect: () => undefined,
    });
}

test('player turn continuation ends when remaining AP cannot pay for movement', () => {
    const actor = makeActor('hero', 0, 0);
    const controller = makeController(actor, getActionApCost('move') - 1);

    assert.equal(controller.hasExecutableAction(actor), false);
});

test('player turn continuation remains active when movement is affordable', () => {
    const actor = makeActor('hero', 0, 0);
    const controller = makeController(actor, getActionApCost('move'));

    assert.equal(controller.hasExecutableAction(actor), true);
});

test('available action menu hides attacks that cannot be executed now', () => {
    const actor = makeActor('hero', 0, 0);
    const enemy = makeEnemyEntry('enemy', 1, 0);
    const lowApController = makeController(actor, ATTACK_AP_COST - 1, { fieldEnemies: [enemy] });
    const readyController = makeController(actor, ATTACK_AP_COST, { fieldEnemies: [enemy] });
    const blockedController = makeController(actor, ATTACK_AP_COST, {
        fieldEnemies: [enemy],
        getActorAttackTargetFailure: () => 'blocked',
    });

    assert.equal(lowApController.getAvailableTurnActions(actor).includes('attack'), false);
    assert.equal(readyController.getAvailableTurnActions(actor).includes('attack'), true);
    assert.equal(blockedController.getAvailableTurnActions(actor).includes('attack'), false);
});

test('available action menu hides magic until AP and a castable field skill are both present', () => {
    const actor = makeActor('hero', 0, 0);
    const lowApController = makeController(actor, MAGIC_AP_COST - 1, { hasCastableFieldSkill: true });
    const noSkillController = makeController(actor, MAGIC_AP_COST, { hasCastableFieldSkill: false });
    const readyController = makeController(actor, MAGIC_AP_COST, { hasCastableFieldSkill: true });

    assert.equal(lowApController.getAvailableTurnActions(actor).includes('magic'), false);
    assert.equal(noSkillController.getAvailableTurnActions(actor).includes('magic'), false);
    assert.equal(readyController.getAvailableTurnActions(actor).includes('magic'), true);
});

test('turn action states always expose tool with disabled reasons', () => {
    const actor = makeActor('hero', 0, 0);
    const toolApCost = getActionApCost('tool');
    const lowApController = makeController(actor, toolApCost - 1, { hasUsableCombatTool: true });
    const noToolController = makeController(actor, toolApCost, { hasRecoveryConsumable: false, hasEffectiveRecovery: false });
    const noEffectController = makeController(actor, toolApCost, { hasRecoveryConsumable: true, hasEffectiveRecovery: false });
    const readyController = makeController(actor, toolApCost, { hasUsableCombatTool: true });

    assert.equal(lowApController.getAvailableTurnActions(actor).includes('tool'), false);
    assert.equal(noToolController.getAvailableTurnActions(actor).includes('tool'), false);
    assert.equal(readyController.getAvailableTurnActions(actor).includes('tool'), true);
    assert.equal(lowApController.getTurnActionStates(actor).find((state) => state.type === 'tool')?.disabledReason, '행동력 부족');
    assert.equal(noToolController.getTurnActionStates(actor).find((state) => state.type === 'tool')?.disabledReason, '회복 도구 없음');
    assert.equal(noEffectController.getTurnActionStates(actor).find((state) => state.type === 'tool')?.disabledReason, '회복 효과 없음');
    assert.equal(readyController.getTurnActionStates(actor).find((state) => state.type === 'tool')?.enabled, true);
});

test('fanfare toggles the current actor as the rally leader without spending AP', () => {
    const actor = makeActor('leader', 0, 0);
    const follower = makeActor('follower', 2, 0);
    const fanfareLeaderId = { value: null as string | null };
    const logs: string[] = [];
    const spentCosts: number[] = [];
    const reopened = { value: 0 };
    const controller = makeController(actor, 0, {
        partyActors: [actor, follower],
        fanfareLeaderId,
        logs,
        spentCosts,
        reopened,
    });

    const initial = controller.getTurnActionStates(actor).find((state) => state.type === 'fanfare');
    assert.equal(initial?.enabled, true);
    assert.equal(initial?.highlighted, false);

    controller.execute('fanfare');

    assert.equal(fanfareLeaderId.value, actor.id);
    assert.deepEqual(spentCosts, []);
    assert.equal(reopened.value, 1);
    assert.match(logs[logs.length - 1] ?? '', /leader 기준으로 파티 집결/);

    const active = controller.getTurnActionStates(actor).find((state) => state.type === 'fanfare');
    assert.equal(active?.highlighted, true);
    assert.equal(active?.emphasisLabel, '집결 중');

    controller.execute('fanfare');

    assert.equal(fanfareLeaderId.value, null);
    assert.deepEqual(spentCosts, []);
    assert.match(logs[logs.length - 1] ?? '', /파티 집결을 해제/);
});

test('fanfare stays disabled when only remote actors would be followers', () => {
    const actor = makeActor('local', 0, 0);
    const remote = makeActor('remote', 3, 0);
    const controller = makeController(actor, 100, {
        partyActors: [actor, remote],
        fanfareFollowerCount: () => 0,
    });

    const fanfare = controller.getTurnActionStates(actor).find((state) => state.type === 'fanfare');

    assert.equal(fanfare?.enabled, false);
    assert.equal(fanfare?.disabledReason, '집결할 파티원이 없습니다.');
});

test('partial ATB keeps attack, magic, tool, and movement available when costs can be paid', () => {
    const actor = makeActor('hero', 0, 0);
    const enemy = makeEnemyEntry('enemy', 1, 0);
    const used = { value: true };
    const controller = makeController(actor, MAGIC_AP_COST, {
        fieldEnemies: [enemy],
        hasCastableFieldSkill: true,
        hasUsableCombatTool: true,
        majorActionUsed: used,
    });
    const states = controller.getTurnActionStates(actor);

    assert.equal(states.find((state) => state.type === 'attack')?.enabled, true);
    assert.equal(states.find((state) => state.type === 'magic')?.enabled, true);
    assert.equal(states.find((state) => state.type === 'tool')?.enabled, true);
    assert.equal(states.find((state) => state.type === 'move')?.enabled, true);
    assert.equal(states.find((state) => state.type === 'attack')?.costLabel, '행동력 -25%');
});

test('inspect action can execute a non-loot scenario interaction tile', () => {
    const actor = makeActor('hero', 0, 0);
    const logs: string[] = [];
    const spentCosts: number[] = [];
    const interacted: { tile: { x: number; y: number } | null } = { tile: null };
    const controller = makeController(actor, getActionApCost('interact'), {
        logs,
        spentCosts,
        additionalInteractTiles: new Set(['1,0']),
        interactAtTile: (_actor, tile) => {
            interacted.tile = { ...tile };
            return true;
        },
    });

    assert.equal(controller.getTurnActionStates(actor).find((state) => state.type === 'open')?.enabled, true);

    controller.execute('open');
    controller.handleTargetClick({ x: 1, y: 0 }, { kind: 'ground', tile: { x: 1, y: 0 } });

    assert.deepEqual(interacted.tile, { x: 1, y: 0 });
    assert.deepEqual(spentCosts, [getActionApCost('interact')]);
});

test('defend applies guard and the integrated counter readiness', () => {
    const actor = makeActor('hero', 0, 0);
    actor.entity.actionGauge = 100;
    const controller = makeController(actor, getActionApCost('defend'));

    controller.execute('defend');

    assert.equal(hasStatus(actor.character.statuses, 'guard'), true);
    assert.equal(hasStatus(actor.character.statuses, 'counterReady'), true);
    assert.equal((controller.getAvailableTurnActions(actor) as string[]).includes('counter'), false);
});
