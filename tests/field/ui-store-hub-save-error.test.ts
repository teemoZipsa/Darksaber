import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameManager } from '../../src/engine/GameManager';
import { UiStore } from '../../src/ui/react/UiStore';

test('UiStore exposes the background hub-save error independently', () => {
    const manager = {
        getHubSaveError: () => 'The latest town changes could not be saved.',
    } as unknown as GameManager;

    const store = new UiStore(manager);

    assert.equal(store.getHubSaveError(), 'The latest town changes could not be saved.');
});
