import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import type { FieldActor, FieldTurnEndReason } from '../../src/field/FieldTypes';
import { WorldEngineActionTurnFlow } from '../../src/engine/world/WorldEngineActionTurnFlow';
import type { ActionMenuSlotState } from '../../src/ui/ActionMenuUI';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string): FieldActor {
    const character = new Character(id, id, 'infantry');
    return {
        id,
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };
}

function makeFlow(options: {
    activeTurnActorId: string | null;
    actionMenuOpen?: boolean;
    actorGauge?: number;
}) {
    const actor = makeActor('hero');
    actor.entity.actionGauge = options.actorGauge ?? 100;
    let activeTurnActorId = options.activeTurnActorId;
    let actionMenuOpen = options.actionMenuOpen ?? false;
    const calls: string[] = [];
    const states: ActionMenuSlotState[] = [{ type: 'move', enabled: true }];
    const flow = new WorldEngineActionTurnFlow({
        getControlledActor: () => actor,
        getActivePartyTurnActor: () => activeTurnActorId === actor.id ? actor : null,
        getSpendableActionGauge: () => 100,
        getActionMenuIsOpen: () => actionMenuOpen,
        openActionMenu: () => {
            actionMenuOpen = true;
            calls.push('openActionMenu');
        },
        updateActionMenuStates: () => calls.push('updateActionMenuStates'),
        closeActionMenu: () => {
            actionMenuOpen = false;
            calls.push('closeActionMenu');
        },
        closeTacticalMenu: () => calls.push('closeTacticalMenu'),
        selectActor: (actorId) => calls.push(`selectActor:${actorId}`),
        getActionMenuStates: () => states,
        isTutorialActive: () => false,
        addTutorialBlockedLog: () => calls.push('tutorialBlocked'),
        getActiveTurnActorId: () => activeTurnActorId,
        beginActorTurn: () => {
            activeTurnActorId = actor.id;
            actionMenuOpen = true;
            calls.push('beginActorTurn');
        },
        spendTurnAp: () => true,
        getRemainingActionPoints: () => 100,
        setRemainingActionPoints: () => undefined,
        getDismissCarryover: () => 100,
        endActiveTurn: () => {
            activeTurnActorId = null;
            calls.push('endActiveTurn');
        },
        hasExecutableAction: () => true,
        submitEndTurn: (_actor: FieldActor, reason: FieldTurnEndReason) => calls.push(`submitEndTurn:${reason}`),
        clearActorIntent: () => calls.push('clearActorIntent'),
        clearTargeting: () => calls.push('clearTargeting'),
        resetMagic: () => calls.push('resetMagic'),
        resetTool: () => calls.push('resetTool'),
        log: (message) => calls.push(`log:${message}`),
    });
    return {
        actor,
        calls,
        flow,
        getActionMenuOpen: () => actionMenuOpen,
        getActiveTurnActorId: () => activeTurnActorId,
    };
}

test('clicking a ready active actor opens a closed action menu', () => {
    const { actor, calls, flow, getActionMenuOpen } = makeFlow({
        activeTurnActorId: 'hero',
        actionMenuOpen: false,
    });

    flow.toggleActionMenuForControlled();

    assert.equal(getActionMenuOpen(), true);
    assert.ok(calls.includes(`selectActor:${actor.id}`));
    assert.ok(calls.includes('closeTacticalMenu'));
    assert.ok(calls.includes('openActionMenu'));
    assert.ok(!calls.includes('updateActionMenuStates'));
});

test('clicking a full-gauge actor begins the turn without immediately dismissing it', () => {
    const { actor, calls, flow, getActionMenuOpen, getActiveTurnActorId } = makeFlow({
        activeTurnActorId: null,
        actionMenuOpen: false,
        actorGauge: 100,
    });

    flow.toggleActionMenuForControlled();

    assert.equal(getActiveTurnActorId(), actor.id);
    assert.equal(getActionMenuOpen(), true);
    assert.ok(calls.includes('beginActorTurn'));
    assert.ok(!calls.some((call) => call.startsWith('submitEndTurn')));
    assert.ok(!calls.includes('closeActionMenu'));
});

test('toggling an open action menu only closes the menu and preserves the active turn', () => {
    const { actor, calls, flow, getActionMenuOpen, getActiveTurnActorId } = makeFlow({
        activeTurnActorId: 'hero',
        actionMenuOpen: true,
    });

    flow.toggleActionMenuForControlled();

    assert.equal(getActionMenuOpen(), false);
    assert.equal(getActiveTurnActorId(), actor.id);
    assert.ok(calls.includes('closeActionMenu'));
    assert.ok(!calls.some((call) => call.startsWith('submitEndTurn')));
    assert.ok(!calls.includes('endActiveTurn'));
});

test('explicit action-menu turn dismissal still submits a wait turn end', () => {
    const { calls, flow, getActiveTurnActorId } = makeFlow({
        activeTurnActorId: 'hero',
        actionMenuOpen: true,
    });

    flow.dismissActionMenuTurn();

    assert.equal(getActiveTurnActorId(), null);
    assert.ok(calls.includes('submitEndTurn:wait'));
    assert.ok(calls.includes('endActiveTurn'));
});
