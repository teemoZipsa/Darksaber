import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { createStatus, hasStatus } from '../../src/combat/StatusEffects';
import { Player } from '../../src/entity/Player';
import { getActionApCost } from '../../src/field/FieldActionEconomy';
import type { FieldActor } from '../../src/field/FieldTypes';
import { WorldEngine } from '../../src/engine/WorldEngine';
import type { ActorSnapshot, GridSnapshot, WorldSnapshot } from '../../src/net/WorldProtocol';

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
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.activeTurnActorId = actor.id;
    engine.readyQueue = [];
    engine.remainingActionPoints = 6;
    engine.majorActionUsedThisTurn = false;
    engine.reservedAction = null;
    engine.restingRecoveryTimers = new Map();
    engine.partyActors = [actor];
    engine.fieldEnemies = [];
    engine.remotePartyActors = new Map();
    engine.pendingLootPicks = new Map();
    engine.raidSession = { elapsedSeconds: 0 };
    engine.party = {
        getCharacters: () => [actor.character],
        getActiveIndex: () => 0,
    };
    engine.worldMap = { loot: [] };
    engine.combatLog = [];
    engine.addCombatLog = (message: string) => engine.combatLog.push(message);
    engine.actionMenuUI = {
        close: () => calls.push('closeActionMenu'),
        getIsOpen: () => false,
        open: () => calls.push('openActionMenu'),
    };
    engine.tacticalController = { close: () => calls.push('closeTacticalMenu') };
    engine.playerActionController = {
        hasExecutableAction: () => true,
        getTurnActionStates: () => [],
        getMode: () => null,
        clearTargeting: () => calls.push('clearTargeting'),
    };
    engine.magicController = { reset: () => calls.push('resetMagic') };
    engine.selectionController = {
        hasSelection: () => false,
        selectActor: () => calls.push('selectActor'),
    };
    return { engine, calls };
}

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

    assert.equal(engine.activeTurnActorId, null);
    assert.equal(engine.remainingActionPoints, 0);
    assert.equal(engine.majorActionUsedThisTurn, false);
    assert.equal(engine.reservedAction, null);
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

    assert.equal(engine.activeTurnActorId, null);
    assert.equal(engine.remainingActionPoints, 0);
    assert.ok(calls.includes('clearTargeting'));
    assert.ok(calls.includes('resetMagic'));
});

test('major action flag is set explicitly and cleared on turn end', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);

    engine.markMajorActionUsed();
    assert.equal(engine.majorActionUsedThisTurn, true);

    engine.endActorTurn(actor, 'test');
    assert.equal(engine.majorActionUsedThisTurn, false);
});

test('dismissing an untouched full action menu resets ATB so charging can resume', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);
    engine.remainingActionPoints = 100;

    engine.dismissActionMenuTurn();

    assert.equal(engine.activeTurnActorId, null);
    assert.equal(actor.entity.actionGauge, 0);
    assert.ok(engine.combatLog.includes('hero 턴 종료: 대기'));
});

test('dismissing a partial action menu keeps remaining ATB as carryover', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 60;
    const { engine } = makeEngineHarness(actor);
    engine.remainingActionPoints = 60;

    engine.dismissActionMenuTurn();

    assert.equal(engine.activeTurnActorId, null);
    assert.equal(actor.entity.actionGauge, 60);
    assert.ok(engine.combatLog.includes('hero 턴 종료: 대기'));
});

test('spending AP falls back to active actor gauge when remaining turn gauge is stale', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);
    engine.remainingActionPoints = 0;

    assert.equal(engine.spendAp(getActionApCost('move')), true);
    assert.equal(engine.remainingActionPoints, 80);
    assert.equal(actor.entity.actionGauge, 80);
});

test('network raid AP uses server remaining points instead of local actor gauge', () => {
    const actor = makeActor('hero');
    actor.entity.actionGauge = 100;
    const { engine } = makeEngineHarness(actor);
    engine.getNetworkRaidState().activate('client-1');
    engine.remainingActionPoints = 20;

    assert.equal(engine.getSpendableActionGauge(), 20);
    assert.equal(engine.spendAp(getActionApCost('move')), true);
    assert.equal(engine.remainingActionPoints, 0);
    assert.equal(actor.entity.actionGauge, 0);
});

test('intro tutorial uses only the currently active party character', () => {
    const lead = new Character('lead', 'Lead', 'infantry');
    const active = new Character('active', 'Active', 'cavalry');
    const engine = Object.create(WorldEngine.prototype) as any;
    engine.party = {
        getActive: () => active,
        getCharacters: () => [lead, active],
    };

    assert.deepEqual(engine.getIntroTutorialCharacters(), [active]);
});

test('network snapshot resolves zero remaining gauge from ready actor action gauge', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);

    assert.equal(engine.resolveSnapshotRemainingGauge(0, 100), 100);
    assert.equal(engine.resolveSnapshotRemainingGauge(0, 10), 0);
    assert.equal(engine.resolveSnapshotRemainingGauge(25, 80), 25);
});

test('network snapshot treats local player actorIds as owned and prefers actor remaining AP', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.getNetworkRaidState().activate('client-1');

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
    assert.equal(engine.activeTurnActorId, 'server-hero');
    assert.equal(engine.remainingActionPoints, 30);
});

test('network move reopens the action menu when the server confirms the moved tile and ATB remains', () => {
    const actor = makeActor('hero');
    const { engine, calls } = makeEngineHarness(actor);
    engine.remainingActionPoints = 80;
    const networkRaid = engine.getNetworkRaidState();
    networkRaid.registerPendingMove('move-1', actor.id, { x: 1, y: 0 }, [{ x: 1, y: 0 }]);

    engine.reopenPendingNetworkMoveMenu([{ id: actor.id, tile: { x: 1, y: 0 } }]);

    assert.equal(networkRaid.consumePendingMoveReopen(new Set([`${actor.id}:1,0`])), null);
    assert.ok(calls.includes('openActionMenu'));
});

test('network move rejection reopens the action menu when the actor can still act', () => {
    const actor = makeActor('hero');
    const { engine, calls } = makeEngineHarness(actor);
    engine.remainingActionPoints = 80;
    const networkRaid = engine.getNetworkRaidState();
    networkRaid.registerPendingMove('move-1', actor.id, { x: 1, y: 0 }, [{ x: 1, y: 0 }]);

    engine.handleNetworkActionRejected({ type: 'ACTION_REJECTED', intentId: 'move-1', reason: 'blocked' });

    assert.equal(networkRaid.consumePendingMoveReopen(new Set([`${actor.id}:1,0`])), null);
    assert.deepEqual(engine.getPathPreviewTiles(actor), []);
    assert.ok(engine.combatLog.includes('서버 거부: blocked'));
    assert.ok(calls.includes('openActionMenu'));
});

test('network move stores a render-only path preview without queuing local movement', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    const sent: unknown[] = [];
    const client = {
        getIsOpen: () => true,
        sendIntent: (...args: unknown[]) => {
            sent.push(args);
            return 'move-1';
        },
    };
    engine.getNetworkRaidState().setClient(client);
    engine.getNetworkRaidState().activate('client-1');

    const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }];
    const submitted = engine.submitNetworkMoveIntent(actor, { x: 2, y: 0 }, path, getActionApCost('move'), 2);

    assert.equal(submitted, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(actor.path, []);
    assert.equal(actor.queuedIntent, null);
    assert.deepEqual(engine.getPathPreviewTiles(actor), path);
    path[0].x = 99;
    assert.deepEqual(engine.getPathPreviewTiles(actor), [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
});

test('network move path preview remains through confirmed interpolation and clears on arrival', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.getNetworkRaidState().registerPendingMove('move-1', actor.id, { x: 1, y: 0 }, [{ x: 1, y: 0 }]);
    engine.getNetworkRaidState().clearPendingMoveReopen(actor.id);
    actor.entity.gridX = 1;
    actor.entity.gridY = 0;
    actor.entity.pixelX = 0.25;
    actor.entity.pixelY = 0;

    engine.refreshNetworkMovePathPreview();

    assert.deepEqual(engine.getPathPreviewTiles(actor), [{ x: 1, y: 0 }]);

    actor.entity.pixelX = 1;
    engine.refreshNetworkMovePathPreview();

    assert.deepEqual(engine.getPathPreviewTiles(actor), []);
});

test('network move path preview drops tiles already reached during interpolation', () => {
    const actor = makeActor('hero');
    const { engine } = makeEngineHarness(actor);
    engine.getNetworkRaidState().registerPendingMove('move-1', actor.id, { x: 2, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    engine.getNetworkRaidState().clearPendingMoveReopen(actor.id);
    actor.entity.gridX = 2;
    actor.entity.gridY = 0;
    actor.entity.pixelX = 1;
    actor.entity.pixelY = 0;

    engine.refreshNetworkMovePathPreview();

    assert.deepEqual(engine.getPathPreviewTiles(actor), [{ x: 2, y: 0 }]);
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

    const grid = engine.gridFromSnapshot(snapshot);

    assert.equal(grid.items.length, 1);
    assert.deepEqual(grid.items[0].sockets, []);
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
