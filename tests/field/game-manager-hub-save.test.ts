import assert from 'node:assert/strict';
import test from 'node:test';
import { PartyManager } from '../../src/character/PartyManager';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { PlayerData } from '../../src/data/PlayerData';
import { GameManager, type HubFlushResult } from '../../src/engine/GameManager';
import type { HubSaveQueue } from '../../src/engine/HubSaveQueue';
import { GridInventory } from '../../src/inventory/GridInventory';
import { AuthApiError, type AuthCharacter, type AuthClient, type CharacterSave, type CharacterSavePatch } from '../../src/net/AuthClient';

interface HubSaveHarness {
    hubFlushEnabled: boolean;
    networkAuthContext: { accessToken: string; characterId: string };
    authClient: AuthClient;
    hubSaveInflight: Promise<HubFlushResult> | null;
    hubSaveQueue: HubSaveQueue | null;
    hubSaveDebounceTimer: ReturnType<typeof setTimeout> | null;
    hubSaveError: string | null;
    hubPageExitFlushArmed: boolean;
    networkSaveRevision: number;
    worldEngine?: { isNetworkRaidActive(): boolean };
    playerData: PlayerData;
    inventory: GridInventory;
    stash: GridInventory;
    party: PartyManager;
    flushHubSaveToServer(): Promise<HubFlushResult>;
    flushHubSaveForPageExit(): void;
    applyServerSave(save: CharacterSave, selectedCharacterId?: string): void;
    loadRosterFromSave(selectedCharacter: AuthCharacter, save: CharacterSave): void;
}

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

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

test('server save sync restores nested equipment for every roster character', () => {
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const playerData = new PlayerData();
    const party = new PartyManager();
    const primary = new Character('primary', 'Primary', 'infantry');
    const companion = new Character('companion', 'Companion', 'cleric');
    party.addToRoster(primary);
    party.addToRoster(companion);
    party.deployCharacter(primary);
    party.deployCharacter(companion);
    const save = playerData.toCharacterSave('2026-01-01T00:00:00.000Z', 7);
    save.characterId = primary.id;
    save.rosterSnapshot = {
        characters: [
            { id: primary.id, equipment: { weapon: { itemId: 'short_sword', gridX: 0, gridY: 0, quantity: 1, durability: 100, sockets: ['rune_el'] } } },
            { id: companion.id, equipment: { body: { itemId: 'magic_t1_body', gridX: 0, gridY: 0, quantity: 1, durability: 100 } } },
        ],
    };
    manager.playerData = playerData;
    manager.inventory = new GridInventory(10, 6);
    manager.stash = new GridInventory(15, 10);
    manager.party = party;
    manager.networkSaveRevision = 1;

    manager.applyServerSave(save, primary.id);

    assert.equal(primary.equipment.get('weapon')?.item.id, 'short_sword');
    assert.deepEqual(primary.equipment.get('weapon')?.sockets?.map((socket) => socket.id), ['rune_el']);
    assert.equal(companion.equipment.get('body')?.item.id, 'magic_t1_body');
    assert.equal(manager.networkSaveRevision, 7);
});

test('page exit sends one deduplicated keepalive snapshot', async () => {
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const playerData = new PlayerData();
    const save = playerData.toCharacterSave('2026-01-01T00:00:00.000Z', 2);
    const keepaliveValues: Array<boolean | undefined> = [];
    const authClient = {
        async updateCharacterSave(
            _characterId: string,
            _patch: CharacterSavePatch,
            _expectedRevision: number,
            options?: { keepalive?: boolean },
        ): Promise<CharacterSave> {
            keepaliveValues.push(options?.keepalive);
            return save;
        },
    } as unknown as AuthClient;

    manager.hubFlushEnabled = true;
    manager.networkAuthContext = { accessToken: 'token', characterId: 'hero' };
    manager.authClient = authClient;
    manager.hubSaveQueue = null;
    manager.hubSaveDebounceTimer = null;
    manager.hubSaveError = null;
    manager.hubPageExitFlushArmed = false;
    manager.networkSaveRevision = 1;
    manager.playerData = playerData;
    manager.inventory = new GridInventory(10, 6);
    manager.stash = new GridInventory(15, 10);
    manager.party = {
        getActive: () => null,
        getCharacters: () => [],
        getRoster: () => [],
    } as unknown as PartyManager;

    manager.flushHubSaveForPageExit();
    manager.flushHubSaveForPageExit();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(keepaliveValues, [true]);
    assert.equal(manager.networkSaveRevision, 2);
});

test('server save sync reconciles only injury while preserving other live statuses', () => {
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const playerData = new PlayerData();
    const party = new PartyManager();
    const recovered = new Character('recovered', 'Recovered', 'infantry');
    const injured = new Character('injured', 'Injured', 'cleric');
    recovered.statuses = [createStatus('poison'), createStatus('injury')];
    injured.statuses = [createStatus('attackUp')];
    party.addToRoster(recovered);
    party.addToRoster(injured);
    party.deployCharacter(recovered);
    party.deployCharacter(injured);
    const save = playerData.toCharacterSave('2026-01-01T00:00:00.000Z', 8);
    save.rosterSnapshot = {
        characters: [
            { id: recovered.id, injured: false },
            { id: injured.id, injured: true },
        ],
    };
    manager.playerData = playerData;
    manager.inventory = new GridInventory(10, 6);
    manager.stash = new GridInventory(15, 10);
    manager.party = party;
    manager.networkSaveRevision = 1;

    manager.applyServerSave(save, recovered.id);

    assert.equal(hasStatus(recovered.statuses, 'injury'), false);
    assert.equal(hasStatus(recovered.statuses, 'poison'), true);
    assert.equal(hasStatus(injured.statuses, 'injury'), true);
    assert.equal(hasStatus(injured.statuses, 'attackUp'), true);
});

test('authenticated roster construction restores persisted injury state', () => {
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const party = new PartyManager();
    const template = new Character('hero', 'Hero', 'infantry');
    const selectedCharacter: AuthCharacter = {
        id: template.id,
        slotNo: 1,
        name: template.name,
        classKey: 'infantry',
        tier: template.currentTier,
        level: template.level,
        exp: template.exp,
        baseStats: { ...template.stats },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const save = new PlayerData().toCharacterSave('2026-01-01T00:00:00.000Z', 3);
    save.characterId = selectedCharacter.id;
    save.rosterSnapshot = {
        characters: [{
            id: selectedCharacter.id,
            name: selectedCharacter.name,
            classKey: selectedCharacter.classKey,
            tier: selectedCharacter.tier,
            level: selectedCharacter.level,
            exp: selectedCharacter.exp,
            baseStats: selectedCharacter.baseStats,
            injured: true,
        }],
    };
    save.partySnapshot = { activeCharacterIds: [selectedCharacter.id] };
    manager.party = party;

    manager.loadRosterFromSave(selectedCharacter, save);

    const restored = party.getRoster()[0];
    assert.ok(restored);
    assert.equal(hasStatus(restored.statuses, 'injury'), true);
});
