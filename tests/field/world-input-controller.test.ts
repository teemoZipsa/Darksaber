import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import type { FieldActor, FieldHitParty } from '../../src/field/FieldTypes';
import { WorldInputController, type WorldInputContext } from '../../src/engine/world/WorldInputController';
import { i18n } from '../../src/i18n/LanguageManager';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string): FieldActor {
    const character = new Character(id, id, 'infantry');
    const entity = new Player(0, 0);
    return {
        id: character.id,
        character,
        entity,
        path: [],
        queuedIntent: null,
    };
}

function makeInput(overrides: Partial<Record<string, unknown>> = {}): any {
    return {
        mouseScreenX: 16,
        mouseScreenY: 16,
        mouseJustDown: true,
        mouseRightJustDown: false,
        mouseJustUp: false,
        mouseWheelDelta: 0,
        uiMouseX: 16,
        uiMouseY: 16,
        justPressed: () => false,
        ...overrides,
    };
}

function makeCamera(): any {
    return {
        zoom: 1,
        screenToTile: () => ({ tileX: 0, tileY: 0 }),
        zoomIn: () => undefined,
        zoomOut: () => undefined,
    };
}

function makeContext(actor: FieldActor, calls: string[]): WorldInputContext {
    const partyHit = { ...actor, gridX: actor.entity.gridX, gridY: actor.entity.gridY } as FieldHitParty;
    return {
        actionMenuUI: {
            getIsOpen: () => true,
            onClick: () => null,
            onMouseMove: () => undefined,
        } as any,
        entityInfoUI: {
            onMouseMove: () => undefined,
            onClick: () => false,
        } as any,
        magicController: {
            isVisible: () => false,
            isActive: () => false,
            getState: () => ({ mode: 'idle' }),
            onMouseMove: () => undefined,
            updateHoverPreview: () => undefined,
        } as any,
        toolController: {
            isVisible: () => false,
            isActive: () => false,
            onMouseMove: () => undefined,
        } as any,
        minimapUI: {
            handleInput: () => false,
            onClick: () => false,
            toggle: () => undefined,
        } as any,
        playerActionController: {
            getMode: () => null,
            execute: () => calls.push('executeAction'),
        } as any,
        selectionController: {
            hasSelection: () => false,
            selectActor: (id: string | null) => calls.push(`selectActor:${id}`),
        } as any,
        tacticalController: {
            isOpen: () => false,
            onMouseMove: () => undefined,
        } as any,
        getCanvasSize: () => ({ width: 800, height: 600 }),
        getActivePartyTurnActor: () => actor,
        getActiveTurnActorId: () => actor.id,
        getReservedAction: () => null,
        getControlledActor: () => actor,
        getPartyActors: () => [actor],
        getHoverTile: () => ({ x: 0, y: 0 }),
        setHoverTile: () => undefined,
        isEntityMoving: () => false,
        resolveFieldHitAt: () => ({ kind: 'party', party: partyHit }),
        switchToNextAliveActor: () => calls.push('switchNext'),
        switchToPartyMember: () => {
            calls.push('switchParty');
            return true;
        },
        toggleActionMenuForControlled: () => calls.push('toggleActionMenu'),
        closeActionMenu: () => calls.push('closeActionMenu'),
        dismissActionMenuTurn: () => calls.push('dismissActionMenuTurn'),
        closeTacticalMenu: () => calls.push('closeTacticalMenu'),
        clearIntent: () => calls.push('clearIntent'),
        log: (message: string) => calls.push(`log:${message}`),
        getCombatLog: () => [],
        onUnhandledEscape: () => calls.push('escape'),
    };
}

test('clicking the active actor body while action menu is open does not dismiss the turn', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const controller = new WorldInputController(makeContext(actor, calls));

    controller.process(makeInput(), makeCamera());

    assert.ok(calls.includes(`selectActor:${actor.id}`));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
    assert.ok(!calls.includes('switchParty'));
});

test('blocked field clicks use localized input logs', () => {
    i18n.setLanguage('en');
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.actionMenuUI = {
        ...context.actionMenuUI,
        getIsOpen: () => false,
    } as any;
    context.resolveFieldHitAt = () => ({ kind: 'blocked' }) as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput(), makeCamera());

    assert.ok(calls.includes('clearIntent'));
    assert.ok(calls.includes('log:That position cannot be reached.'));
    i18n.setLanguage('ko');
});
