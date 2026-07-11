import assert from 'node:assert/strict';
import test from 'node:test';
import { PartyManager } from '../../src/character/PartyManager';
import { PlayerData } from '../../src/data/PlayerData';
import { GameManager, type HubFlushResult } from '../../src/engine/GameManager';
import { GridInventory } from '../../src/inventory/GridInventory';
import { AuthApiError, type AuthClient, type CharacterSave, type CharacterSavePatch } from '../../src/net/AuthClient';

interface HubSaveHarness {
    hubFlushEnabled: boolean;
    networkAuthContext: { accessToken: string; characterId: string };
    authClient: AuthClient;
    hubSaveInflight: Promise<HubFlushResult> | null;
    networkSaveRevision: number;
    worldEngine?: { isNetworkRaidActive(): boolean };
    playerData: PlayerData;
    inventory: GridInventory;
    stash: GridInventory;
    party: PartyManager;
    flushHubSaveToServer(): Promise<HubFlushResult>;
}

test('hub save conflict retry preserves the live local state while advancing the server revision', async () => {
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const playerData = new PlayerData();
    playerData.gold = 400;
    const party = {
        getActive: () => null,
        getCharacters: () => [],
        getRoster: () => [],
    } as unknown as PartyManager;

    const serverSave = playerData.toCharacterSave('2026-01-01T00:00:00.000Z', 2);
    serverSave.questState.gold = 900;
    let updateCalls = 0;
    const revisions: number[] = [];
    const sentGold: number[] = [];
    const authClient = {
        async updateCharacterSave(_characterId: string, patch: CharacterSavePatch, expectedRevision: number): Promise<CharacterSave> {
            updateCalls++;
            revisions.push(expectedRevision);
            sentGold.push(Number(patch.questState?.gold ?? -1));
            if (updateCalls === 1) throw new AuthApiError(409, 'revision_conflict', 'conflict');
            return { ...serverSave, revision: 3 };
        },
        async getCharacterSave(): Promise<CharacterSave> {
            return serverSave;
        },
    } as unknown as AuthClient;

    manager.hubFlushEnabled = true;
    manager.networkAuthContext = { accessToken: 'token', characterId: 'hero' };
    manager.authClient = authClient;
    manager.hubSaveInflight = null;
    manager.networkSaveRevision = 1;
    manager.playerData = playerData;
    manager.inventory = new GridInventory(10, 6);
    manager.stash = new GridInventory(15, 10);
    manager.party = party;

    const result = await manager.flushHubSaveToServer();

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(revisions, [1, 2]);
    assert.deepEqual(sentGold, [400, 400]);
    assert.equal(playerData.gold, 400);
    assert.equal(manager.networkSaveRevision, 3);
});
