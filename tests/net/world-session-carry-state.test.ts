import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerPlayer } from '../../server/WorldSessionTypes';
import {
    addCarriedItemQuantity,
    addCarriedWeight,
    removeCarriedWeight,
} from '../../server/WorldSessionCarryState';

function createPlayer(overrides: Partial<ServerPlayer> = {}): ServerPlayer {
    return {
        id: 'player-1',
        resumeToken: 'resume-1',
        originHubId: 'central_castle',
        departureTownId: 'central_castle',
        elapsedSeconds: 0,
        kills: 0,
        carriedWeight: 0,
        carriedItems: new Map(),
        raidGoldReward: 0,
        raidModifier: { id: 'supply_drop' },
        completedQuestIds: new Set(),
        enteredDungeonIds: new Set(),
        completedDungeonIds: new Set(),
        fieldEventFlagsByDungeonId: new Map(),
        inspectedAmbientSiteIds: new Set(),
        activeDungeonId: null,
        active: true,
        ghost: false,
        disconnectedAt: null,
        actorIds: [],
        ...overrides,
    };
}

test('world session carried weight helpers clamp negative and invalid totals', () => {
    const player = createPlayer({ carriedWeight: 10 });

    addCarriedWeight(player, 2.5);
    assert.equal(player.carriedWeight, 12.5);

    removeCarriedWeight(player, 99);
    assert.equal(player.carriedWeight, 0);

    addCarriedWeight(player, Number.POSITIVE_INFINITY);
    assert.equal(player.carriedWeight, 0);
});

test('world session carried item helper floors quantities and removes empty stacks', () => {
    const player = createPlayer();

    addCarriedItemQuantity(player, 'herb_common', 2.9);
    assert.equal(player.carriedItems.get('herb_common'), 2);

    addCarriedItemQuantity(player, 'herb_common', -1.1);
    assert.equal(player.carriedItems.has('herb_common'), false);

    addCarriedItemQuantity(player, 'herb_common', 3);
    addCarriedItemQuantity(player, 'herb_common', -10);
    assert.equal(player.carriedItems.has('herb_common'), false);
});
