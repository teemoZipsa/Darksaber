import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldRaidLifecycleController, type WorldRaidLifecycleContext } from '../../src/engine/world/WorldRaidLifecycleController';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import { PartyManager } from '../../src/character/PartyManager';
import { PlayerData } from '../../src/data/PlayerData';
import type { GameManager } from '../../src/engine/GameManager';
import type { TownInfo } from '../../src/map/BiomeMask';
import type { WorldMap } from '../../src/map/WorldMap';
import type { WorldRaidOutcomeController } from '../../src/engine/world/WorldRaidOutcomeController';
import type { WorldTownSession } from '../../src/engine/world/WorldTownSession';

const originalFetch = globalThis.fetch;

const HUB_TOWN: TownInfo = {
    id: 'central_castle',
    name: 'Central Castle',
    nameKr: '중앙 성',
    chunkX: 0,
    chunkY: 0,
    radius: 2,
};

function stubRefreshResponse(accessToken: string | null): void {
    globalThis.fetch = (async () => ({
        ok: accessToken !== null,
        status: accessToken === null ? 401 : 200,
        json: async () => accessToken ? { accessToken } : { error: 'refresh_missing' },
    })) as unknown as typeof fetch;
}

function restoreFetch(): void {
    globalThis.fetch = originalFetch;
}

function createLifecycleHarness(options: {
    flushResult?: { ok: boolean; code?: string; message?: string };
    accessToken?: string;
} = {}) {
    const raidSession = new WorldRaidSession(HUB_TOWN.id);
    const party = new PartyManager();
    const playerData = new PlayerData();
    let isNetworkRaid = false;
    let isNetworkRaidConnecting = false;
    let networkClientSet = false;
    let deployError: string | null = null;
    let authContext = { accessToken: options.accessToken ?? 'token', characterId: 'hero-1' };
    const logs: string[] = [];
    const flushCalls: number[] = [];
    const flushTokens: string[] = [];

    const gameManager = {
        getNetworkAuthContext: () => authContext,
        updateNetworkAccessToken: (accessToken: string) => {
            authContext = { ...authContext, accessToken };
        },
        refreshNetworkAuthContext: async () => {
            const response = await fetch('http://auth.test/auth/refresh', { method: 'POST' });
            if (!response.ok) return null;
            const body = await response.json() as { accessToken: string };
            authContext = { ...authContext, accessToken: body.accessToken };
            return authContext;
        },
        flushHubSaveToServer: async () => {
            flushCalls.push(Date.now());
            flushTokens.push(authContext.accessToken);
            return options.flushResult ?? { ok: false, code: 'hub_flush_failed', message: 'save rejected' };
        },
        setHubFlushEnabled: () => undefined,
    } as unknown as GameManager;

    const townSession = {
        show: () => undefined,
        hide: () => undefined,
        setDeployError: (message: string) => { deployError = message; },
        applyPendingRestForRaidStart: () => undefined,
    } as unknown as WorldTownSession;

    const worldMap = {
        getRealm: () => 'surface' as const,
        setRealm: () => undefined,
    } as unknown as WorldMap;

    const context: WorldRaidLifecycleContext = {
        party,
        playerData,
        gameManager,
        raidSession,
        townSession,
        raidOutcomeController: {} as WorldRaidOutcomeController,
        storyScenarioController: { resetVisitState: () => undefined, resetNetworkState: () => undefined } as never,
        networkSyncController: { clearPendingState: () => undefined } as never,
        getWorldMap: () => worldMap,
        getTownById: () => HUB_TOWN,
        getCurrentHubTown: () => HUB_TOWN,
        getNetworkRaidClient: () => null,
        setNetworkRaidClient: () => { networkClientSet = true; },
        isNetworkRaid: () => isNetworkRaid,
        setIsNetworkRaid: (value: boolean) => { isNetworkRaid = value; },
        isNetworkRaidConnecting: () => isNetworkRaidConnecting,
        setIsNetworkRaidConnecting: (value: boolean) => { isNetworkRaidConnecting = value; },
        isNetworkWasReconnecting: () => false,
        setNetworkWasReconnecting: () => undefined,
        getNetworkPlayerId: () => null,
        setNetworkPlayerId: () => undefined,
        closeFieldOverlays: () => undefined,
        clearFieldTurnState: () => undefined,
        clearIntroTutorialStateForNetworkRaid: () => undefined,
        clearRemotePartyActors: () => undefined,
        placePartyNear: () => undefined,
        getControlledActor: () => null,
        setPlayer: () => undefined,
        setPartyActors: () => undefined,
        setFieldEnemies: () => undefined,
        clearWorldLoot: () => undefined,
        selectActor: () => undefined,
        syncCharacterMovementToClass: () => undefined,
        isTurnCombatActive: () => false,
        setPhase: () => undefined,
        applyNetworkSnapshot: () => undefined,
        handleNetworkCombatEvent: () => undefined,
        openNetworkLoot: () => undefined,
        handleNetworkAutoLootGrant: () => undefined,
        handleNetworkInventoryConsumed: () => undefined,
        handleNetworkActionRejected: () => undefined,
        log: (message: string) => { logs.push(message); },
    };

    const controller = new WorldRaidLifecycleController(context);
    return {
        controller,
        flushCalls,
        flushTokens,
        logs,
        getAuthContext: () => authContext,
        getNetworkRaid: () => isNetworkRaid,
        getNetworkClientSet: () => networkClientSet,
        getDeployError: () => deployError,
    };
}

test('deploy is blocked when hub flush fails before join', async () => {
    stubRefreshResponse(null);
    try {
        const harness = createLifecycleHarness();
        await harness.controller.beginRaidFromCurrentHub();
        assert.equal(harness.flushCalls.length, 1);
        assert.equal(harness.getNetworkRaid(), false);
        assert.equal(harness.getNetworkClientSet(), false);
        assert.ok(harness.getDeployError());
    } finally {
        restoreFetch();
    }
});

test('deploy refreshes auth before flushing the hub save', async () => {
    stubRefreshResponse('fresh-token');
    try {
        const harness = createLifecycleHarness({ accessToken: 'expired-token' });

        await harness.controller.beginRaidFromCurrentHub();

        assert.equal(harness.getAuthContext().accessToken, 'fresh-token');
        assert.deepEqual(harness.flushTokens, ['fresh-token']);
        assert.equal(harness.getNetworkRaid(), false);
        assert.equal(harness.getNetworkClientSet(), false);
        assert.ok(harness.getDeployError());
    } finally {
        restoreFetch();
    }
});
