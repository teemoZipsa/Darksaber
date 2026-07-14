import assert from 'node:assert/strict';
import test from 'node:test';
import { PartyManager } from '../../src/character/PartyManager';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { PlayerData } from '../../src/data/PlayerData';
import { GameManager, type HubFlushResult } from '../../src/engine/GameManager';
import { WorldEngine } from '../../src/engine/WorldEngine';
import type { HubSaveQueue } from '../../src/engine/HubSaveQueue';
import { WorldTutorialController } from '../../src/engine/world/WorldTutorialController';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { GridInventory } from '../../src/inventory/GridInventory';
import { AuthApiError, type AuthCharacter, type AuthClient, type CharacterSave, type CharacterSavePatch } from '../../src/net/AuthClient';
import { i18n, t } from '../../src/i18n/LanguageManager';
import { TownUI } from '../../src/ui/TownUI';

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
    worldEngine?: WorldEngine;
    playerData: PlayerData;
    inventory: GridInventory;
    stash: GridInventory;
    party: PartyManager;
    flushHubSaveToServer(): Promise<HubFlushResult>;
    flushHubSaveForPageExit(): void;
    applyServerSave(save: CharacterSave, selectedCharacterId?: string): void;
    loadRosterFromSave(selectedCharacter: AuthCharacter, save: CharacterSave): void;
    syncStoryCompanionsToRoster(): void;
    subscribeToLanguageChanges(): void;
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

test('authenticated story companions ignore persisted Korean names and follow the active language', () => {
    const previousLanguage = i18n.lang;
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const party = new PartyManager();
    const playerData = new PlayerData();
    const primary = new Character('hero', 'Hero', 'infantry');
    const selectedCharacter: AuthCharacter = {
        id: primary.id,
        slotNo: 1,
        name: primary.name,
        classKey: 'infantry',
        tier: primary.currentTier,
        level: primary.level,
        exp: primary.exp,
        baseStats: { ...primary.stats },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const companionId = 'story_cleric_ep02';
    const companionNameKey = 'story.companion.ep02Cleric.name';
    const save = playerData.toCharacterSave('2026-01-01T00:00:00.000Z', 1);
    save.characterId = primary.id;
    save.rosterSnapshot = {
        characters: [
            {
                id: primary.id,
                name: primary.name,
                classKey: primary.classLineId,
                tier: primary.currentTier,
                level: primary.level,
                exp: primary.exp,
                baseStats: primary.stats,
            },
            {
                id: companionId,
                name: '서버에 저장된 한국어 이름',
                nameKey: companionNameKey,
                classKey: 'cleric',
                tier: 1,
                level: 1,
                exp: 0,
                baseStats: {},
            },
        ],
    };
    save.partySnapshot = { activeCharacterIds: [primary.id, companionId] };
    manager.party = party;
    manager.playerData = playerData;

    try {
        i18n.lang = 'en';
        manager.loadRosterFromSave(selectedCharacter, save);
        const companion = party.getRoster().find((character) => character.id === companionId);
        assert.ok(companion);
        assert.equal(companion.name, t(companionNameKey));
        assert.doesNotMatch(companion.name, /[\uac00-\ud7a3]/);

        playerData.addStoryCompanion(companionId);
        i18n.lang = 'ko';
        manager.syncStoryCompanionsToRoster();
        assert.equal(companion.name, t(companionNameKey));
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('GameManager language subscription refreshes live enemies and system companions', () => {
    const previousLanguage = i18n.lang;
    const listenerCount = i18n.listeners.length;
    i18n.lang = 'ko';
    const manager = Object.create(GameManager.prototype) as HubSaveHarness;
    const worldEngine = Object.create(WorldEngine.prototype) as WorldEngine;
    const companion = new Character('story_cleric_ep02', '클레릭', 'cleric');
    const playerNamedCharacter = new Character('user-character', '홍길동', 'infantry');
    const companionEntity = new Player(0, 0);
    const playerEntity = new Player(1, 0);
    companionEntity.label = companion.name;
    playerEntity.label = playerNamedCharacter.name;
    worldEngine.partyActors = [
        { id: 'remote-companion', character: companion, entity: companionEntity, path: [], queuedIntent: null },
        { id: 'remote-user', character: playerNamedCharacter, entity: playerEntity, path: [], queuedIntent: null },
    ];
    const enemy = new Enemy('skeleton', 2, 0, '스켈레톤 궁수', 1);
    enemy.setLocalizedNames('스켈레톤 궁수', 'Skeleton Archer');
    const tutorialEnemy = new Enemy('intro_tutorial_enemy', 3, 0, '연습 몬스터', 1);
    const instructor = new Player(4, 0);
    instructor.label = '킹 교관';
    const tutorialController = new WorldTutorialController({
        getEnemyById: (enemyId: string) => enemyId === tutorialEnemy.id ? tutorialEnemy : null,
    } as never);
    Object.assign(tutorialController, {
        enemyId: tutorialEnemy.id,
        instructor,
    });
    (worldEngine as unknown as { scenarioNetworkControllers: unknown }).scenarioNetworkControllers = {
        tutorialController,
    };
    const townUI = new TownUI(new GridInventory(5, 5), new GridInventory(5, 5));
    townUI.getMarketRumor = () => i18n.lang === 'ko' ? '시장 소문' : 'Market rumor';
    townUI.show({ id: 'central_castle', name: 'Kaosia', nameKr: '카오시아', chunkX: 0, chunkY: 0, radius: 1 });
    (worldEngine as unknown as { townSession: unknown }).townSession = { ui: townUI };
    worldEngine.fieldEnemies = [
        { enemy, home: { x: 2, y: 0 }, path: [] },
        { enemy: tutorialEnemy, home: { x: 3, y: 0 }, path: [] },
    ];
    manager.party = new PartyManager();
    manager.playerData = new PlayerData();
    manager.worldEngine = worldEngine;

    try {
        manager.subscribeToLanguageChanges();
        i18n.setLanguage('en');

        assert.equal(enemy.name, 'Skeleton Archer');
        assert.equal(tutorialEnemy.name, 'Practice Monster');
        assert.equal(instructor.label, 'King Instructor');
        assert.equal(companion.name, 'Cleric');
        assert.equal(companionEntity.label, 'Cleric');
        assert.equal(playerNamedCharacter.name, '홍길동');
        assert.equal(playerEntity.label, '홍길동');
        assert.equal(townUI.getInventoryUI().getExternalTitle(), '🏰 Stash');
        assert.equal(townUI.getRumors()[0], 'Market rumor');
    } finally {
        i18n.listeners.splice(listenerCount);
        i18n.lang = previousLanguage;
    }
});
