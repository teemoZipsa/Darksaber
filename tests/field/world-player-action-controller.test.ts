import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { ATTACK_AP_COST, MAGIC_AP_COST, MOVE_AP_PER_TILE } from '../../src/field/FieldActionEconomy';
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
    fieldEnemies?: FieldEnemy[];
    hasCastableFieldSkill?: boolean;
    getActorAttackTargetFailure?: WorldPlayerActionContext['getActorAttackTargetFailure'];
}

function makeController(actor: FieldActor, remainingAp: number, options: ControllerOptions = {}): WorldPlayerActionController {
    const context: WorldPlayerActionContext = {
        getActivePartyTurnActor: () => actor,
        getPartyActors: () => [actor],
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
        spendAp: () => true,
        tryActorAttack: () => false,
        openLoot: () => undefined,
        openMagic: () => undefined,
        hasCastableFieldSkill: () => options.hasCastableFieldSkill ?? false,
        reopenActionMenu: () => undefined,
        closeActionMenu: () => undefined,
        closeTacticalMenu: () => undefined,
        resumeOrEndActiveTurn: () => undefined,
        endActorTurn: () => undefined,
        clearActorIntent: () => undefined,
        setReservedAction: () => undefined,
        selectEnemy: () => undefined,
        selectLoot: () => undefined,
    };
    return new WorldPlayerActionController(context, {
        log: () => undefined,
        spawnHeal: () => undefined,
        spawnStatus: () => undefined,
        spawnHealEffect: () => undefined,
        spawnBuffEffect: () => undefined,
    });
}

test('player turn continuation ends when remaining AP cannot pay for movement', () => {
    const actor = makeActor('hero', 0, 0);
    const controller = makeController(actor, MOVE_AP_PER_TILE - 1);

    assert.equal(controller.hasExecutableAction(actor), false);
});

test('player turn continuation remains active when movement is affordable', () => {
    const actor = makeActor('hero', 0, 0);
    const controller = makeController(actor, MOVE_AP_PER_TILE);

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
