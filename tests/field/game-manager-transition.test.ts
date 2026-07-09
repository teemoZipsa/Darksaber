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
