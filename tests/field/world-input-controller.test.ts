import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import type { FieldActor, FieldHitParty } from '../../src/field/FieldTypes';
import { WorldInputController, type WorldInputContext } from '../../src/engine/world/WorldInputController';

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
            open: () => calls.push('openTacticalMenu'),
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
        isCombatPresentationBusy: () => false,
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

test('combat presentation lock blocks a second action while hitstop input still updates', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.isCombatPresentationBusy = () => true;
    context.actionMenuUI = {
        getIsOpen: () => true,
        onClick: () => {
            calls.push('hiddenAction');
            return 'attack';
        },
        onMouseMove: () => undefined,
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput(), makeCamera());

    assert.ok(!calls.includes('hiddenAction'));
    assert.ok(!calls.includes('executeAction'));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
});

test('clicking unrelated loot closes an open action menu without ending the turn', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.resolveFieldHitAt = () => ({ kind: 'loot', loot: {} as any });
    const controller = new WorldInputController(context);

    controller.process(makeInput(), makeCamera());

    assert.ok(calls.includes('closeActionMenu'));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
});

test('Escape closes an open action menu without ending the turn', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const controller = new WorldInputController(makeContext(actor, calls));

    controller.process(makeInput({
        mouseJustDown: false,
        justPressed: (code: string) => code === 'Escape',
    }), makeCamera());

    assert.ok(calls.includes('closeActionMenu'));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
    assert.ok(!calls.includes('escape'));
});

test('Escape cancels action targeting and reopens the active actor menu', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.actionMenuUI = {
        getIsOpen: () => false,
        onClick: () => null,
        onMouseMove: () => undefined,
    } as any;
    context.playerActionController = {
        getMode: () => 'move',
        clearTargeting: () => calls.push('clearTargeting'),
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput({
        mouseJustDown: false,
        justPressed: (code: string) => code === 'Escape',
    }), makeCamera());

    assert.deepEqual(calls, ['clearTargeting', 'toggleActionMenu']);
    assert.ok(!calls.includes('escape'));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
});

test('right click closes an open action menu without ending the turn before opening tactics', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const controller = new WorldInputController(makeContext(actor, calls));

    controller.process(makeInput({
        mouseJustDown: false,
        mouseRightJustDown: true,
    }), makeCamera());

    assert.ok(calls.includes('closeActionMenu'));
    assert.ok(calls.includes('openTacticalMenu'));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
});

test('Space explicitly ends the active party turn as wait', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const controller = new WorldInputController(makeContext(actor, calls));

    controller.process(makeInput({
        mouseJustDown: false,
        justPressed: (code: string) => code === 'Space',
    }), makeCamera());

    assert.ok(calls.includes('dismissActionMenuTurn'));
    assert.ok(!calls.includes('closeActionMenu'));
});

test('clicking valid ground with an active party turn executes movement directly', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    let mode: 'move' | null = null;
    let hoverTile = { x: 0, y: 0 };
    context.setHoverTile = (tile) => { hoverTile = { ...tile }; };
    context.getHoverTile = () => hoverTile;
    context.resolveFieldHitAt = () => ({ kind: 'ground', tile: { x: 3, y: 0 } });
    context.actionMenuUI = {
        getIsOpen: () => true,
        onClick: () => null,
        onMouseMove: () => undefined,
    } as any;
    context.playerActionController = {
        getMode: () => mode,
        execute: (action: string) => {
            calls.push(`execute:${action}`);
            mode = action === 'move' ? 'move' : null;
        },
        handleTargetClick: (tile: { x: number; y: number }) => calls.push(`target:${tile.x},${tile.y}`),
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput(), {
        ...makeCamera(),
        screenToTile: () => ({ tileX: 3, tileY: 0 }),
    });

    assert.deepEqual(calls, ['execute:move', 'target:3,0']);
    assert.ok(!calls.includes('closeActionMenu'));
    assert.ok(!calls.includes('dismissActionMenuTurn'));
});

test('ground click does not quick-move an active actor that is not controlled', () => {
    const actor = makeActor('active');
    const controlledActor = makeActor('controlled');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.actionMenuUI = {
        getIsOpen: () => false,
        onClick: () => null,
        onMouseMove: () => undefined,
    } as any;
    context.getControlledActor = () => controlledActor;
    context.resolveFieldHitAt = () => ({ kind: 'ground', tile: { x: 3, y: 0 } });
    context.playerActionController = {
        getMode: () => null,
        execute: (action: string) => calls.push(`execute:${action}`),
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput(), {
        ...makeCamera(),
        screenToTile: () => ({ tileX: 3, tileY: 0 }),
    });

    assert.ok(!calls.includes('execute:move'));
    assert.deepEqual(calls, ['closeActionMenu']);
});

test('M key toggles the full minimap before full-map pointer handling can consume input', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    let minimapHandleCalls = 0;
    context.minimapUI = {
        handleInput: () => {
            minimapHandleCalls += 1;
            return true;
        },
        onClick: () => false,
        toggle: () => calls.push('toggleMinimap'),
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput({
        mouseIsDown: true,
        justPressed: (code: string) => code === 'KeyM',
    }), makeCamera());

    assert.deepEqual(calls, ['toggleMinimap']);
    assert.equal(minimapHandleCalls, 0);
});

test('action menu hotkeys execute the matching radial slot', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.actionMenuUI = {
        getIsOpen: () => true,
        onClick: () => null,
        onMouseMove: () => undefined,
        getActionResult: (type: string) => ({ type, enabled: true }),
    } as any;
    context.playerActionController = {
        getMode: () => null,
        execute: (type: string) => calls.push(`execute:${type}`),
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput({
        justPressed: (code: string) => code === 'KeyE',
    }), makeCamera());

    assert.deepEqual(calls, ['execute:attack']);
});

test('magic menu hotkeys select the matching radial magic slot', () => {
    const actor = makeActor('hero');
    const calls: string[] = [];
    const context = makeContext(actor, calls);
    context.actionMenuUI = {
        getIsOpen: () => false,
        onClick: () => null,
        onMouseMove: () => undefined,
    } as any;
    context.magicController = {
        isVisible: () => true,
        isActive: () => true,
        getState: () => ({ mode: 'menu' }),
        onMouseMove: () => undefined,
        updateHoverPreview: () => undefined,
        updateMp: () => undefined,
        handleMenuIndex: (index: number) => {
            calls.push(`magicSlot:${index}`);
            return true;
        },
        handleMenuDigit: () => false,
    } as any;
    const controller = new WorldInputController(context);

    controller.process(makeInput({
        mouseJustDown: false,
        justPressed: (code: string) => code === 'KeyR',
    }), makeCamera());

    assert.deepEqual(calls, ['magicSlot:3']);
});
