import test from 'node:test';
import assert from 'node:assert/strict';
import { Enemy } from '../../src/entity/Enemy';
import { WorldMap } from '../../src/map/WorldMap';
import { CHUNK_SIZE } from '../../src/map/Chunk';
import { createBaseStats } from '../../src/data/Stats';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import {
    buildRaidBalanceTelemetry,
    createServerRaidBalanceState,
    recordPlayerCombatActivity,
    recordPlayerKillDangerBand,
} from '../../server/WorldSessionBalanceTelemetry';
import type { ServerEnemy, ServerPlayer } from '../../server/WorldSessionTypes';

function createPlayer(): ServerPlayer {
    const character: AuthCharacter = {
        id: 'telemetry-character',
        accountId: 'telemetry-account',
        slotNo: 0,
        name: 'Telemetry',
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
    const saveSnapshot = createDefaultCharacterSave(character);
    saveSnapshot.inventory.items.push({
        itemId: 'herb_common',
        gridX: 2,
        gridY: 0,
        quantity: 3,
        durability: 1,
        acquiredInRaid: true,
    });
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
        balanceTelemetry: createServerRaidBalanceState(),
        activeDungeonId: null,
        active: true,
        ghost: false,
        disconnectedAt: null,
        actorIds: [],
        saveSnapshot,
    };
}

test('raid balance telemetry groups engagements, loot, danger, and death cause', () => {
    const player = createPlayer();
    player.elapsedSeconds = 5;
    recordPlayerCombatActivity(player);
    player.elapsedSeconds = 12;
    recordPlayerCombatActivity(player);
    player.elapsedSeconds = 32;
    recordPlayerCombatActivity(player);

    const enemy = new Enemy('telemetry-enemy', 37 * CHUNK_SIZE, 44 * CHUNK_SIZE, 'Enemy', 1, '#fff', 'bruiser');
    const target = {
        enemy,
        home: { x: enemy.gridX, y: enemy.gridY },
        wanderSeed: 1,
    } as ServerEnemy;
    recordPlayerKillDangerBand(player, target, new WorldMap());
    player.lastDamageCause = 'curse';

    const telemetry = buildRaidBalanceTelemetry(player, 'DEAD');
    assert.equal(telemetry.firstEngagementSeconds, 5);
    assert.equal(telemetry.engagementCount, 2);
    assert.equal(telemetry.engagementGapSecondsTotal, 27);
    assert.equal(telemetry.lootItemsAcquired, 3);
    assert.equal(telemetry.lootItemsSecured, 0);
    assert.equal(Object.values(telemetry.killsByDangerBand).reduce((sum, value) => sum + value, 0), 1);
    assert.equal(telemetry.deathCause, 'curse');
});
