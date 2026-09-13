import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldRaidLifecycleController, type WorldRaidLifecycleContext } from '../../src/engine/world/WorldRaidLifecycleController';
import type { WorldSnapshot } from '../../src/net/WorldProtocol';

function harness() {
    const calls: unknown[] = [];
    const client = { getIsOpen: () => true, leave: (...args: unknown[]) => calls.push(args), close: () => undefined };
    const context = {
        isNetworkRaid: () => true,
        raidSession: { active: true },
        getNetworkPlayerId: () => 'own',
        getNetworkRaidClient: () => client,
        setNetworkRaidClient: () => undefined,
        getWorldMap: () => ({ getTownAtTile: (x: number) => x === 10 ? { id: 'town' } : null }),
        closeFieldOverlays: () => undefined,
        clearRemotePartyActors: () => undefined,
        networkSyncController: { clearPendingState: () => undefined },
        storyScenarioController: { resetNetworkState: () => undefined },
    } as unknown as WorldRaidLifecycleContext;
    const controller = new WorldRaidLifecycleController(context);
    const snapshot = {
        raidTimer: { active: true },
        scenario: { activeDungeonId: null },
        partyActors: [{ id: 'hero', ownerPlayerId: 'own', tile: { x: 10, y: 0 }, isDead: false }],
    } as WorldSnapshot;
    return { controller, context, client, snapshot, calls };
}

test('confirmed town arrival asks the server once and waits for its result', () => {
    const { controller, snapshot, calls } = harness();
    assert.equal(controller.requestNetworkTownArrival(snapshot), true);
    assert.equal(controller.requestNetworkTownArrival(snapshot), true);
    assert.deepEqual(calls, [['town', true]]);
});

test('outdoor, remote actor, dungeon and dead leader snapshots cannot trigger town settlement', () => {
    for (const kind of ['outside', 'remote', 'dungeon', 'dead', 'disconnected', 'inactive']) {
        const { controller, snapshot, client, calls } = harness();
        if (kind === 'outside') snapshot.partyActors[0].tile.x = 0;
        if (kind === 'remote') snapshot.partyActors[0].ownerPlayerId = 'other';
        if (kind === 'dungeon') snapshot.scenario!.activeDungeonId = 'burgos_castle';
        if (kind === 'dead') snapshot.partyActors[0].isDead = true;
        if (kind === 'disconnected') client.getIsOpen = () => false;
        if (kind === 'inactive') snapshot.raidTimer.active = false;
        assert.equal(controller.requestNetworkTownArrival(snapshot), false, kind);
        assert.deepEqual(calls, [], kind);
    }
});

test('closing the session resets arrival so the next exploration can enter town', () => {
    const { controller, snapshot, calls } = harness();
    controller.requestNetworkTownArrival(snapshot);
    controller.closeNetworkRaidClient(false);
    controller.requestNetworkTownArrival(snapshot);
    assert.deepEqual(calls, [['town', true], ['town', true]]);
});
