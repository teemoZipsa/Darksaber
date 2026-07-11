import assert from 'node:assert/strict';
import test from 'node:test';
import { GameManager } from '../../src/engine/GameManager';
import { GameState } from '../../src/engine/GameState';

interface TransitionHarness {
    state: GameState;
    transitions: {
        requestTransition: (opts: { midCallback?: () => void }) => boolean;
        isActive: () => boolean;
    };
    transitionTo(next: GameState, prepare?: () => void): void;
    flushPendingTransition(): void;
    pendingTransition: unknown;
}

interface ReturnToTitleHarness extends TransitionHarness {
    pauseMenu: { close(): void };
    worldEngine: { closeNetworkRaidClient(sendLeave: boolean, reason: 'manual'): void };
    pauseReturnToTitle(): void;
}

test('GameManager queues a state transition requested during an active fade', () => {
    const manager = Object.create(GameManager.prototype) as TransitionHarness;
    const transitionRequests: Array<{ midCallback?: () => void }> = [];
    let active = true;
    let prepared = false;

    manager.state = GameState.TITLE;
    manager.transitions = {
        requestTransition: (opts) => {
            if (active) return false;
            transitionRequests.push(opts);
            return true;
        },
        isActive: () => active,
    };

    manager.transitionTo(GameState.WORLD, () => { prepared = true; });

    assert.ok(manager.pendingTransition);
    assert.equal(transitionRequests.length, 0);

    active = false;
    manager.flushPendingTransition();

    assert.equal(manager.pendingTransition, null);
    assert.equal(transitionRequests.length, 1);

    transitionRequests[0].midCallback?.();
    assert.equal(prepared, true);
    assert.equal(manager.state, GameState.WORLD);
});

test('GameManager closes an active world connection before returning to title', () => {
    const manager = Object.create(GameManager.prototype) as ReturnToTitleHarness;
    const transitionRequests: Array<{ midCallback?: () => void }> = [];
    const closeCalls: Array<{ sendLeave: boolean; reason: string }> = [];
    let pauseClosed = false;

    manager.state = GameState.WORLD;
    manager.pendingTransition = null;
    manager.pauseMenu = { close: () => { pauseClosed = true; } };
    manager.worldEngine = {
        closeNetworkRaidClient: (sendLeave, reason) => { closeCalls.push({ sendLeave, reason }); },
    };
    manager.transitions = {
        requestTransition: (opts) => {
            transitionRequests.push(opts);
            return true;
        },
        isActive: () => false,
    };

    manager.pauseReturnToTitle();

    assert.equal(pauseClosed, true);
    assert.deepEqual(closeCalls, [{ sendLeave: true, reason: 'manual' }]);
    assert.equal(transitionRequests.length, 1);
    transitionRequests[0].midCallback?.();
    assert.equal(manager.state, GameState.TITLE);
});
