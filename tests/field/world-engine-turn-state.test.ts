import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { Player } from '../../src/entity/Player';
import { getActionApCost } from '../../src/field/FieldActionEconomy';
import type { FieldActor } from '../../src/field/FieldTypes';
import { WorldNetworkSyncController } from '../../src/engine/world/WorldNetworkSyncController';
import { WorldNetworkIntentController } from '../../src/engine/world/WorldNetworkIntentController';
import { WorldRestingController } from '../../src/engine/world/WorldRestingController';
import { WorldTurnStateController } from '../../src/engine/world/WorldTurnStateController';
import { WorldTutorialController } from '../../src/engine/world/WorldTutorialController';
import { i18n, type Language } from '../../src/i18n/LanguageManager';
import type { ActorSnapshot, AutoLootGrantMessage, GridSnapshot, WorldSnapshot } from '../../src/net/WorldProtocol';
import { createWorldEnginePrototypeHarness } from './world-engine-harness';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string): FieldActor {
    const character = new Character(id, id, 'infantry');
    return {
        id: character.id,
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };
}

function makeEngineHarness(actor: FieldActor): { engine: any; calls: string[] } {
    const calls: string[] = [];
    const engine = createWorldEnginePrototypeHarness<any>();
    let activePartyIndex = 0;
    engine.turnStateController = new WorldTurnStateController();
    engine.turnStateController.setActiveTurn(actor.id, 6);
    engine.turnStateController.readyQueue = [];
    engine.partyActors = [actor];
    engine.fieldEnemies = [];
    engine.remotePartyActors = new Map();
    const storyScenarioController = {
        applyNetworkScenarioSnapshot: () => undefined,
        handleNetworkActionRejected: () => false,
    };
    engine.raidSession = {
        elapsedSeconds: 0,
        raidModifier: null,
        setRaidModifier: (modifier: unknown) => {
            engine.raidSession.raidModifier = modifier;
        },
    };
    engine.party = {
        getCharacters: () => [actor.character],
        getActiveIndex: () => activePartyIndex,
        switchTo: (index: number) => {
            if (index < 0 || index >= 1 || actor.character.isDead) return false;
            activePartyIndex = index;
            calls.push(`switchTo:${index}`);
            return true;
        },
    };
    engine.worldMap = { loot: [] };
    engine.combatLog = [];
    engine.addCombatLog = (message: string) => engine.combatLog.push(message);
    engine.actionMenuUI = {
        close: () => calls.push('closeActionMenu'),
        getIsOpen: () => false,
        open: () => calls.push('openActionMenu'),
    };
    engine.presentationControllers = {
        tacticalController: { close: () => calls.push('closeTacticalMenu') },
        renderController: { render: () => undefined },
        inputController: { process: () => undefined },
    };
    const playerActionController = {
        hasExecutableAction: () => true,
        getTurnActionStates: () => [],
        getMode: () => null,
        clearTargeting: () => calls.push('clearTargeting'),
    };
    const tutorialController = {
        isActive: () => false,
        isCompletePending: () => false,
        getInstructor: () => null,
        getActionMenuStates: (targetActor: FieldActor) => engine.actionControllers.playerActionController.getTurnActionStates(targetActor),
        filterActionTiles: (_action: string, _targetActor: FieldActor, tiles: Set<string>) => tiles,
        addBlockedLog: () => undefined,
        isTutorialEnemy: () => false,
        complete: () => undefined,
        advanceStep: () => undefined,
    };
    const selectionController = {
        hasSelection: () => false,
        selectActor: () => calls.push('selectActor'),
        selectLoot: () => calls.push('selectLoot'),
    };
    engine.actionControllers = {
        selectionController,
        lootController: { refreshLootState: () => undefined, spawnEnemyLoot: () => undefined },
        magicController: { reset: () => calls.push('resetMagic') },
        toolController: { reset: () => calls.push('resetTool') },
        playerActionController,
    };
    engine.getControlledActor = () => engine.partyActors.find((entry: FieldActor) => engine.party.getCharacters().includes(entry.character)) ?? null;
    engine.getEnemyById = () => null;
    engine.actorTile = (entry: FieldActor) => ({ x: entry.entity.gridX, y: entry.entity.gridY });
    engine.enemyTile = (enemy: { gridX: number; gridY: number }) => ({ x: enemy.gridX, y: enemy.gridY });
    engine.applyMonsterSprite = () => undefined;
    engine.isEntityMoving = (entity: { pixelX: number; pixelY: number; gridX: number; gridY: number }) =>
        Math.abs(entity.pixelX - entity.gridX) > 0.01 || Math.abs(entity.pixelY - entity.gridY) > 0.01;
    engine.beginCombatFeedbackGroup = () => 'feedback';
    engine.registerCombatFeedback = () => undefined;
    engine.flushCombatFeedbackGroup = () => undefined;
    engine.spawnAttackCue = () => undefined;
    engine.effectManager = {
        spawnKillEffect: () => undefined,
        spawnDebuffEffect: () => undefined,
        spawnHitEffect: () => undefined,
        spawnHealEffect: () => undefined,
    };
    engine.floatingText = {
        spawnDamage: () => undefined,
        spawnHeal: () => undefined,
        spawnStatus: () => undefined,
    };
    engine.worldControllers = {
        restingController: new WorldRestingController({
            getPartyActors: () => engine.partyActors,
            spawnHeal: (x, y, amount) => engine.floatingText.spawnHeal(x, y, amount),
            spawnStatus: (x, y, text) => engine.floatingText.spawnStatus(x, y, text),
            spawnHealEffect: (x, y) => engine.effectManager.spawnHealEffect(x, y),
            log: (message) => engine.addCombatLog(message),
        }),
    };
    engine.gameManager = {
        inventory: { items: [], remove: () => undefined },
        inventoryUI: {
            setExternalGrid: () => undefined,
            isVisible: () => false,
            toggle: () => undefined,
            getBag: () => ({ autoPlaceExisting: () => true }),
            revertRaidLoot: () => undefined,
        },
    };
    const networkSyncController = new WorldNetworkSyncController({
        party: engine.party,
        gameManager: engine.gameManager,
        storyScenarioController: storyScenarioController as never,
        getNetworkPlayerId: () => engine.networkPlayerId,
        getNetworkRaidClient: () => engine.networkRaidClient ?? null,
        getWorldMap: () => engine.worldMap,
        getPartyActors: () => engine.partyActors,
        setPartyActors: (actors) => { engine.partyActors = actors; },
        getRemotePartyActors: () => engine.remotePartyActors,
        getFieldEnemies: () => engine.fieldEnemies,
        setFieldEnemies: (enemies) => { engine.fieldEnemies = enemies; },
        getControlledActor: () => engine.getControlledActor(),
        setPlayer: (player) => { engine.player = player; },
        getActiveTurnActorId: () => engine.turnStateController.getActiveTurnActorId(),
        setActiveTurnActorId: (actorId) => engine.turnStateController.setActiveTurnActorId(actorId),
        getRemainingActionPoints: () => engine.turnStateController.getRemainingActionPoints(),
        setRemainingActionPoints: (points) => engine.turnStateController.setRemainingActionPoints(points),
        setMajorActionUsedThisTurn: (used) => engine.turnStateController.setMajorActionUsedThisTurn(used),
        hasSelection: () => engine.actionControllers.selectionController.hasSelection(),
        selectActor: (actorId) => engine.actionControllers.selectionController.selectActor(actorId),
        selectLoot: (lootId) => engine.actionControllers.selectionController.selectLoot(lootId),
        getActionMenuIsOpen: () => engine.actionMenuUI.getIsOpen(),
        getPlayerActionMode: () => engine.actionControllers.playerActionController.getMode(),
        hasExecutableAction: (targetActor) => engine.actionControllers.playerActionController.hasExecutableAction(targetActor),
        reopenActionMenu: () => calls.push('openActionMenu'),
        getEnemyById: (enemyId) => engine.getEnemyById(enemyId),
        actorTile: (targetActor) => engine.actorTile(targetActor),
        enemyTile: (enemy) => engine.enemyTile(enemy),
        applyMonsterSprite: (enemy, monsterId) => engine.applyMonsterSprite(enemy, monsterId),
        isEntityMoving: (entity) => engine.isEntityMoving(entity),
        beginCombatFeedbackGroup: () => engine.beginCombatFeedbackGroup(),
        registerCombatFeedback: (kind, feedbackGroupId) => engine.registerCombatFeedback(kind, feedbackGroupId),
        flushCombatFeedbackGroup: (feedbackGroupId) => engine.flushCombatFeedbackGroup(feedbackGroupId),
        spawnAttackCue: (from, to, color, label) => engine.spawnAttackCue(from, to, color, label),
        spawnKillEffect: () => undefined,
        spawnDebuffEffect: (x, y) => engine.effectManager.spawnDebuffEffect(x, y),
        spawnHitEffect: (x, y) => engine.effectManager.spawnHitEffect(x, y),
        spawnHealEffect: (x, y) => engine.effectManager.spawnHealEffect(x, y),
        spawnDamage: (x, y, amount, isCrit, isMiss) => engine.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
        spawnHeal: (x, y, amount) => engine.floatingText.spawnHeal(x, y, amount),
        spawnStatus: (x, y, text) => engine.floatingText.spawnStatus(x, y, text),
        recordCharacterDown: (characterId) => calls.push(`recordDown:${characterId}`),
        log: (message) => engine.addCombatLog(message),
    });
    const networkIntentController = new WorldNetworkIntentController({
        networkSyncController,
        isNetworkRaid: () => engine.isNetworkRaid,
        getNetworkRaidClient: () => engine.networkRaidClient ?? null,
    });
    engine.scenarioNetworkControllers = {
        storyScenarioController,
        tutorialController,
        networkSyncController,
        networkIntentController,
    };
    return { engine, calls };
}

test('world turn state controller owns queue, AP, and active-turn clearing', () => {
    const controller = new WorldTurnStateController();

    assert.equal(controller.beginActorTurn('hero'), 100);
    assert.equal(controller.getDismissCarryover(), 0);
    controller.remainingActionPoints = 40;
    assert.equal(controller.getDismissCarryover(), 40);
    assert.equal(controller.markMajorActionUsed(), undefined);
    assert.equal(controller.majorActionUsedThisTurn, true);
    assert.equal(controller.spendAp(20, 100), true);
    assert.equal(controller.remainingActionPoints, 20);
    assert.equal(controller.enqueueReadyActor('hero'), true);
    assert.equal(controller.enqueueReadyActor('hero'), false);
    assert.deepEqual(controller.readyQueue, ['hero']);
    assert.equal(controller.isReadyTurnBlocked(), true);
    assert.equal(controller.hasTurnActivity(), true);

    assert.equal(controller.clearInvalidActiveTurn((actorId) => actorId === 'hero'), false);
    assert.equal(controller.clearInvalidActiveTurn(() => false), true);
    assert.equal(controller.activeTurnActorId, null);
    assert.equal(controller.remainingActionPoints, 0);
    assert.equal(controller.majorActionUsedThisTurn, false);
    assert.deepEqual(controller.readyQueue, ['hero']);

    assert.equal(controller.shiftReadyActorId(), 'hero');
    assert.equal(controller.hasTurnActivity(), false);

    controller.beginEnemyTurn('enemy');
    assert.equal(controller.activeTurnActorId, 'enemy');
    assert.equal(controller.remainingActionPoints, 0);
    controller.endActiveTurn();
    assert.equal(controller.activeTurnActorId, null);
});

function makeActorSnapshot(overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
    return {
        id: 'server-hero',
        name: 'hero',
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 3, y: 4 },
        stats: new Character('snapshot-hero', 'hero', 'infantry').stats,
        statuses: [],
        actionGauge: 100,
        remainingAp: 20,
        facing: 'down',
        isDead: false,
        ...overrides,
    };
}

test('active actor turn ends instead of reopening when counter damage downs the actor', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    actor.character.stats.hp = 0;
    actor.character.isDead = true;
    actor.queuedIntent = { kind: 'attack', enemyId: 'enemy-1' };

    const { engine } = makeEngineHarness(actor);

    engine.resumeOrEndActiveTurn(actor);

    assert.equal(engine.turnStateController.getActiveTurnActorId(), null);
    assert.equal(engine.turnStateController.getRemainingActionPoints(), 0);
    assert.equal(engine.turnStateController.getMajorActionUsedThisTurn(), false);
    assert.equal(engine.turnStateController.getReservedAction(), null);
    assert.equal(actor.entity.actionGauge, 0);
    assert.equal(actor.queuedIntent, null);
    assert.ok(engine.combatLog.includes('hero 턴 종료: 행동 불능'));
});

test('ready queue is unblocked if active turn points at a downed actor', () => {
    const actor = makeActor('hero');
    actor.character.stats.hp = 0;
    actor.character.isDead = true;

    const { engine, calls } = makeEngineHarness(actor);

    engine.startNextReadyTurn();

    assert.equal(engine.turnStateController.getActiveTurnActorId(), null);
    assert.equal(engine.turnStateController.getRemainingActionPoints(), 0);
    assert.ok(calls.includes('clearTargeting'));
    assert.ok(calls.includes('resetMagic'));
});

test('major action flag is set explicitly and cleared on turn end', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);

    engine.turnStateController.markMajorActionUsed();
    assert.equal(engine.turnStateController.getMajorActionUsedThisTurn(), true);

    engine.endActorTurn(actor, 'test');
    assert.equal(engine.turnStateController.getMajorActionUsedThisTurn(), false);
});

test('dismissing an untouched full action menu resets ATB so charging can resume', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);
    engine.turnStateController.setRemainingActionPoints(100);

    engine.dismissActionMenuTurn();

    assert.equal(engine.turnStateController.getActiveTurnActorId(), null);
    assert.equal(actor.entity.actionGauge, 0);
    assert.ok(engine.combatLog.includes('hero 턴 종료: 대기'));
});

test('dismissing a partial action menu keeps remaining ATB as carryover', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 60;
    const { engine } = makeEngineHarness(actor);
    engine.turnStateController.setRemainingActionPoints(60);

    engine.dismissActionMenuTurn();

    assert.equal(engine.turnStateController.getActiveTurnActorId(), null);
    assert.equal(actor.entity.actionGauge, 60);
    assert.ok(engine.combatLog.includes('hero 턴 종료: 대기'));
});

test('spending AP falls back to active actor gauge when remaining turn gauge is stale', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);
    engine.turnStateController.setRemainingActionPoints(0);

    assert.equal(engine.spendAp(getActionApCost('move')), true);
    assert.equal(engine.turnStateController.getRemainingActionPoints(), 80);
    assert.equal(actor.entity.actionGauge, 80);
});

test('network raid AP uses server remaining points instead of local actor gauge', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);
    engine.isNetworkRaid = true;
    engine.turnStateController.setRemainingActionPoints(20);

    assert.equal(engine.getSpendableActionGauge(), 20);
    assert.equal(engine.spendAp(getActionApCost('move')), true);
    assert.equal(engine.turnStateController.getRemainingActionPoints(), 0);
    assert.equal(actor.entity.actionGauge, 0);
});

test('world update freezes field simulation while story presentation is active', () => {
    const actor = makeActor('hero');
    const engine = createWorldEnginePrototypeHarness<any>();
    const calls: string[] = [];
    engine.worldTime = 0;
    engine.player = actor.entity;
    engine.townSession = {
        sync: () => calls.push('syncTown'),
        isVisible: () => false,
    };
    engine.raidLifecycleControllers = {
        raidOutcomeController: { isVisible: () => false },
    };
    engine.fusionTempleUI = { isVisible: () => false };
    engine.scenarioNetworkControllers = {
        tutorialController: {
            isActive: () => false,
            isCompletePending: () => false,
        },
        storyScenarioController: {
            isPresentationActive: () => true,
            updatePresentation: (dt: number) => calls.push(`presentation:${dt}`),
        },
    };
    engine.isNetworkRaid = false;
    engine.effectManager = { update: () => calls.push('effects') };
    engine.floatingText = { update: () => calls.push('floatingText') };
    engine.updateAttackCues = () => calls.push('attackCues');
    engine.getControlledActor = () => actor;
    engine.presentationControllers = {
        tacticalController: { updateMarkers: () => undefined },
        renderController: { render: () => undefined },
        inputController: { process: () => calls.push('input') },
    };
    engine.actionControllers = {
        playerActionController: { processQueuedIntents: () => calls.push('queuedIntents') },
    };
    engine.combatControllers = {
        movementController: {
            updatePartyActors: () => {
                calls.push('partyMovement');
                return { followRepathTimer: 0, readyActorIds: [] };
            },
            updateEnemies: () => {
                calls.push('enemyMovement');
                return { readyEnemyIds: [] };
            },
        },
    };
    engine.worldControllers = {
        templeController: { checkArrival: () => calls.push('temple') },
    };
    const camera = { update: () => calls.push('camera') };

    engine.update(0.5, {} as any, camera as any);

    assert.deepEqual(calls, ['syncTown', 'presentation:0.5', 'effects', 'floatingText', 'attackCues', 'camera']);
});

test('intro tutorial uses only the currently active party character', () => {
    const lead = new Character('lead', 'Lead', 'infantry');
    const active = new Character('active', 'Active', 'cavalry');
    const tutorial = new WorldTutorialController({
        party: {
            MAX_ACTIVE_PARTY_SIZE: 3,
            getActive: () => active,
            getCharacters: () => [lead, active],
        },
    } as any);

    assert.deepEqual(tutorial.getIntroTutorialCharacters(), [active]);
});

test('network snapshot resolves zero remaining gauge from ready actor action gauge', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);

    assert.equal(engine.scenarioNetworkControllers.networkSyncController.resolveSnapshotRemainingGauge(0, 100), 100);
    assert.equal(engine.scenarioNetworkControllers.networkSyncController.resolveSnapshotRemainingGauge(0, 10), 0);
    assert.equal(engine.scenarioNetworkControllers.networkSyncController.resolveSnapshotRemainingGauge(25, 80), 25);
});

test('network snapshot treats local player actorIds as owned and prefers actor remaining AP', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.networkPlayerId = 'client-1';

    const snapshot: WorldSnapshot = {
        seq: 1,
        serverTime: 1000,
        players: [
            {
                playerId: 'client-1',
                originHubId: 'central_castle',
                isGhost: false,
                actorIds: ['server-hero'],
            },
        ],
        partyActors: [
            makeActorSnapshot({
                id: 'server-hero',
                localActorId: actor.character.id,
                remainingAp: 30,
                actionGauge: 100,
            }),
        ],
        enemies: [],
        loot: [],
        readyActors: ['server-hero'],
        remainingApByActor: { 'server-hero': 99 },
        raidTimer: {
            active: true,
            elapsedSeconds: 12,
            limitSeconds: 900,
            departureTownId: 'central_castle',
            modifier: null,
        },
        scenario: {
            enteredDungeonIds: [],
            activeDungeonId: null,
            completedDungeonIds: [],
        },
    };

    engine.applyNetworkSnapshot(snapshot);

    assert.equal(engine.partyActors.length, 1);
    assert.equal(engine.partyActors[0].id, 'server-hero');
    assert.equal(engine.remotePartyActors.size, 0);
    assert.equal(engine.turnStateController.getActiveTurnActorId(), 'server-hero');
    assert.equal(engine.turnStateController.getRemainingActionPoints(), 30);
});

test('production snapshot controller localizes server enemies and only authored remote companions', () => {
    const previousLanguage = i18n.lang;
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.networkPlayerId = 'client-1';
    const snapshot: WorldSnapshot = {
        seq: 1,
        serverTime: 1000,
        players: [
            { playerId: 'client-1', originHubId: 'central_castle', isGhost: false, actorIds: ['server-hero'] },
            {
                playerId: 'client-2',
                originHubId: 'central_castle',
                isGhost: false,
                actorIds: ['remote-companion', 'remote-user'],
            },
        ],
        partyActors: [
            makeActorSnapshot({
                id: 'server-hero',
                localActorId: actor.character.id,
                ownerPlayerId: 'client-1',
            }),
            makeActorSnapshot({
                id: 'remote-companion',
                localActorId: 'story_cleric_ep02',
                ownerPlayerId: 'client-2',
                name: '클레릭',
                classLineId: 'cleric',
            }),
            makeActorSnapshot({
                id: 'remote-user',
                localActorId: 'user-character',
                ownerPlayerId: 'client-2',
                name: '홍길동',
            }),
        ],
        enemies: [
            {
                id: 'story-boss',
                monsterId: '466R',
                name: '가노마스',
                role: 'boss',
                level: 5,
                color: '#fff',
                tile: { x: 5, y: 5 },
                home: { x: 5, y: 5 },
                stats: new Character('enemy-stats', 'Enemy', 'infantry').stats,
                statuses: [],
                actionGauge: 0,
                facing: 'down',
                isAggro: true,
                isBoss: true,
            },
            {
                id: 'legacy-enemy',
                name: '스켈레톤 궁수',
                role: 'archer',
                level: 2,
                color: '#fff',
                tile: { x: 6, y: 5 },
                home: { x: 6, y: 5 },
                stats: new Character('legacy-enemy-stats', 'Enemy', 'infantry').stats,
                statuses: [],
                actionGauge: 0,
                facing: 'down',
                isAggro: true,
                isBoss: false,
            },
        ],
        loot: [],
        readyActors: [],
        remainingApByActor: {},
        raidTimer: {
            active: true,
            elapsedSeconds: 0,
            limitSeconds: 900,
            departureTownId: 'central_castle',
            modifier: null,
        },
        scenario: {
            enteredDungeonIds: [],
            activeDungeonId: null,
            completedDungeonIds: [],
        },
    };

    try {
        i18n.lang = 'en';
        engine.scenarioNetworkControllers.networkSyncController.applySnapshot(snapshot);

        assert.equal(engine.fieldEnemies[0]?.enemy.name, 'Ganomas');
        assert.equal(engine.fieldEnemies[1]?.enemy.name, 'Skeleton Archer');
        assert.equal(engine.remotePartyActors.get('remote-companion')?.character.name, 'Cleric');
        assert.equal(engine.remotePartyActors.get('remote-companion')?.entity.label, 'Cleric');
        assert.equal(engine.remotePartyActors.get('remote-user')?.character.name, '홍길동');
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('network down events record injuries only for owned party characters', () => {
    const actor = makeActor('hero');
    const remote = makeActor('remote-hero');
    const { engine, calls } = makeEngineHarness(actor);
    engine.partyActors.push(remote);

    engine.scenarioNetworkControllers.networkSyncController.handleCombatEvent({
        type: 'COMBAT_EVENT',
        kind: 'down',
        sourceId: 'enemy-1',
        targetId: actor.id,
        value: 10,
    });
    engine.scenarioNetworkControllers.networkSyncController.handleCombatEvent({
        type: 'COMBAT_EVENT',
        kind: 'down',
        sourceId: 'enemy-1',
        targetId: remote.id,
        value: 10,
    });

    assert.deepEqual(calls.filter((entry: string) => entry.startsWith('recordDown:')), ['recordDown:hero']);
});

test('an owned dead snapshot records a missed down transition once', () => {
    const actor = makeActor('hero');
    const { engine, calls } = makeEngineHarness(actor);
    engine.networkPlayerId = 'client-1';
    const snapshot: WorldSnapshot = {
        seq: 1,
        serverTime: 1000,
        players: [{
            playerId: 'client-1',
            originHubId: 'central_castle',
            isGhost: false,
            actorIds: ['server-hero'],
        }],
        partyActors: [makeActorSnapshot({
            id: 'server-hero',
            localActorId: actor.character.id,
            ownerPlayerId: 'client-1',
            isDead: true,
            stats: { ...actor.character.stats, hp: 0 },
        })],
        enemies: [],
        loot: [],
        readyActors: [],
        remainingApByActor: {},
        raidTimer: {
            active: true,
            elapsedSeconds: 12,
            limitSeconds: 900,
            departureTownId: 'central_castle',
            modifier: null,
        },
        scenario: {
            enteredDungeonIds: [],
            activeDungeonId: null,
            completedDungeonIds: [],
        },
    };

    engine.applyNetworkSnapshot(snapshot);
    engine.applyNetworkSnapshot({ ...snapshot, seq: 2 });

    assert.equal(actor.character.isDead, true);
    assert.deepEqual(calls.filter((entry: string) => entry.startsWith('recordDown:')), ['recordDown:hero']);
});

test('network snapshot reattaches owned solo actor when legacy local actor id changed', () => {
    const actor = makeActor('darkmaster');
    const { engine } = makeEngineHarness(actor);
    engine.networkPlayerId = 'client-1';

    const snapshot: WorldSnapshot = {
        seq: 1,
        serverTime: 1000,
        players: [
            {
                playerId: 'client-1',
                originHubId: 'central_castle',
                isGhost: false,
                actorIds: ['server-darkmaster'],
            },
        ],
        partyActors: [
            makeActorSnapshot({
                id: 'server-darkmaster',
                ownerPlayerId: 'client-1',
                localActorId: 'legacy-darkmaster',
                name: actor.character.name,
                classLineId: actor.character.classLineId,
                remainingAp: 40,
            }),
        ],
        enemies: [],
        loot: [],
        readyActors: ['server-darkmaster'],
        remainingApByActor: {},
        raidTimer: {
            active: true,
            elapsedSeconds: 12,
            limitSeconds: 900,
            departureTownId: 'central_castle',
            modifier: null,
        },
        scenario: {
            enteredDungeonIds: [],
            activeDungeonId: null,
            completedDungeonIds: [],
        },
    };

    engine.applyNetworkSnapshot(snapshot);

    assert.equal(engine.partyActors.length, 1);
    assert.equal(engine.partyActors[0].id, 'server-darkmaster');
    assert.equal(engine.partyActors[0].character, actor.character);
    assert.equal(engine.remotePartyActors.size, 0);
    assert.equal(engine.turnStateController.getActiveTurnActorId(), 'server-darkmaster');
    assert.equal(engine.turnStateController.getRemainingActionPoints(), 40);
});

test('switching a clicked party actor maps network actor index back to the local party index', () => {
    const lead = makeActor('lead');
    const second = makeActor('second');
    const remote = makeActor('remote');
    const { engine, calls } = makeEngineHarness(lead);
    const partyCharacters = [lead.character, second.character];
    const switchCalls: number[] = [];
    let activeIndex = 1;
    engine.party = {
        getCharacters: () => partyCharacters,
        getActiveIndex: () => activeIndex,
        switchTo: (index: number) => {
            if (index < 0 || index >= partyCharacters.length || partyCharacters[index].isDead) return false;
            switchCalls.push(index);
            activeIndex = index;
            return true;
        },
    };
    engine.partyActors = [remote, second, lead];

    const switched = engine.switchToPartyMember(2);

    assert.equal(switched, true);
    assert.deepEqual(switchCalls, [0]);
    assert.equal(engine.player, lead.entity);
    assert.ok(calls.includes('clearTargeting'));
    assert.ok(calls.includes('closeActionMenu'));
    assert.ok(calls.includes('closeTacticalMenu'));

    const remoteSwitched = engine.switchToPartyMember(0);

    assert.equal(remoteSwitched, false);
    assert.deepEqual(switchCalls, [0]);
    assert.ok(engine.combatLog.some((message: string) => message.includes('표시 전용')));
});

test('network move reopens the action menu when the server confirms the moved tile and ATB remains', () => {
    const actor = makeActor('hero');
    const { engine, calls } = makeEngineHarness(actor);
    engine.turnStateController.setRemainingActionPoints(80);
    engine.scenarioNetworkControllers.networkSyncController.trackPendingMove('move-1', actor.id, { x: 1, y: 0 }, []);

    engine.scenarioNetworkControllers.networkSyncController.reopenPendingMoveMenu([{ id: actor.id, tile: { x: 1, y: 0 } }]);

    assert.ok(calls.includes('openActionMenu'));
});

test('network move rejection reopens the action menu when the actor can still act', () => {
    const actor = makeActor('hero');
    const { engine, calls } = makeEngineHarness(actor);
    engine.turnStateController.setRemainingActionPoints(80);
    engine.scenarioNetworkControllers.networkSyncController.trackPendingMove('move-1', actor.id, { x: 1, y: 0 }, [{ x: 1, y: 0 }]);

    engine.handleNetworkActionRejected({ type: 'ACTION_REJECTED', intentId: 'move-1', reason: 'blocked' });

    assert.deepEqual(engine.getPathPreviewTiles(actor), []);
    assert.ok(engine.combatLog.includes('서버 거부: blocked'));
    assert.ok(calls.includes('openActionMenu'));
});

test('network move stores a render-only path preview without queuing local movement', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    const sent: unknown[] = [];
    engine.isNetworkRaid = true;
    engine.networkRaidClient = {
        sendIntent: (...args: unknown[]) => {
            sent.push(args);
            return 'move-1';
        },
    };

    const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }];
    const submitted = engine.submitNetworkMoveIntent(actor, { x: 2, y: 0 }, path, getActionApCost('move'), 2);

    assert.equal(submitted, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(actor.path, []);
    assert.equal(actor.queuedIntent, null);
    const previewPath = engine.getPathPreviewTiles(actor);
    assert.deepEqual(previewPath, path);
    assert.notEqual(previewPath, path);
});

test('network move path preview remains through confirmed interpolation and clears on arrival', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.scenarioNetworkControllers.networkSyncController.trackPendingMove('move-1', actor.id, { x: 1, y: 0 }, [{ x: 1, y: 0 }]);
    actor.entity.gridX = 1;
    actor.entity.gridY = 0;
    actor.entity.pixelX = 0.25;
    actor.entity.pixelY = 0;

    engine.scenarioNetworkControllers.networkSyncController.refreshMovePathPreview();

    assert.deepEqual(engine.getPathPreviewTiles(actor), [{ x: 1, y: 0 }]);

    actor.entity.pixelX = 1;
    engine.scenarioNetworkControllers.networkSyncController.refreshMovePathPreview();

    assert.deepEqual(engine.getPathPreviewTiles(actor), []);
});

test('network move path preview drops tiles already reached during interpolation', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.scenarioNetworkControllers.networkSyncController.trackPendingMove('move-1', actor.id, { x: 2, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    actor.entity.gridX = 2;
    actor.entity.gridY = 0;
    actor.entity.pixelX = 1;
    actor.entity.pixelY = 0;

    engine.scenarioNetworkControllers.networkSyncController.refreshMovePathPreview();

    assert.deepEqual(engine.getPathPreviewTiles(actor), [{ x: 2, y: 0 }]);
});

test('local move path preview includes the current interpolation target', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    actor.entity.gridX = 1;
    actor.entity.gridY = 0;
    actor.entity.pixelX = 0.25;
    actor.entity.pixelY = 0;
    actor.path = [{ x: 2, y: 0 }];

    assert.deepEqual(engine.getPathPreviewTiles(actor), [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
});

test('grid snapshot without sockets restores placed items with an empty socket list', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    const snapshot: GridSnapshot = {
        width: 4,
        height: 4,
        items: [
            {
                itemId: 'short_sword',
                gridX: 0,
                gridY: 0,
                durability: 12,
                quantity: 1,
            },
        ],
    };

    const grid = engine.scenarioNetworkControllers.networkSyncController.gridFromSnapshot(snapshot);

    assert.equal(grid.items.length, 1);
    assert.deepEqual(grid.items[0].sockets, []);
});

test('network auto-loot log uses localized item names', () => {
    const previousLang: Language = i18n.lang;
    try {
        i18n.lang = 'en';
        const actor = makeActor('hero');
        const { engine } = makeEngineHarness(actor);
        const grant: AutoLootGrantMessage = {
            type: 'AUTO_LOOT_GRANT',
            lootId: 'loot-1',
            sourceName: 'Training Dummy',
            gridSnapshot: {
                width: 4,
                height: 4,
                items: [{
                    itemId: 'short_sword',
                    gridX: 0,
                    gridY: 0,
                    durability: 12,
                    quantity: 1,
                }],
            },
        };

        engine.scenarioNetworkControllers.networkSyncController.handleAutoLootGrant(grant);

        assert.deepEqual(engine.combatLog, ['Training Dummy Loot auto-collected: Short Sword']);
    } finally {
        i18n.lang = previousLang;
    }
});

test('resting status recovers over time and clears at full resources', () => {
    const actor = makeActor('hero');
    actor.character.stats.hp = 90;
    actor.character.stats.maxHp = 100;
    actor.character.stats.mp = 8;
    actor.character.stats.maxMp = 10;
    actor.character.statuses = [createStatus('resting')];
    const { engine } = makeEngineHarness(actor);
    engine.floatingText = {
        spawnHeal: () => undefined,
        spawnStatus: () => undefined,
    };
    engine.effectManager = { spawnHealEffect: () => undefined };

    engine.updateRestingActors(1);

    assert.equal(actor.character.stats.hp, 93);
    assert.equal(actor.character.stats.mp, 9);
    assert.equal(hasStatus(actor.character.statuses, 'resting'), true);

    engine.updateRestingActors(3);

    assert.equal(actor.character.stats.hp, 100);
    assert.equal(actor.character.stats.mp, 10);
    assert.equal(hasStatus(actor.character.statuses, 'resting'), false);
    assert.ok(engine.combatLog.includes('hero: 휴식 완료'));
});

test('resting status is interrupted when HP drops', () => {
    const actor = makeActor('hero');
    actor.character.stats.hp = 90;
    actor.character.statuses = [createStatus('resting')];
    const { engine } = makeEngineHarness(actor);
    engine.floatingText = { spawnStatus: () => undefined };
    const before = engine.snapshotPartyHp();

    actor.character.stats.hp = 80;
    engine.interruptRestingForDamage(before);

    assert.equal(hasStatus(actor.character.statuses, 'resting'), false);
    assert.ok(engine.combatLog.includes('hero: 피해로 휴식 중단'));
});
