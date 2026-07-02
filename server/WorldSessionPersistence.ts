import { getItemDef, type ItemDef } from '../src/data/ItemDB';
import { Enemy } from '../src/entity/Enemy';
import { LootObject } from '../src/entity/LootObject';
import type { FieldNestState } from '../src/field/SpawnResolver';
import { rollRaidModifier } from '../src/raid/RaidModifiers';
import { cloneCharacterSave } from './WorldSessionSaveState';
import { cloneStats, cloneStatuses, gridToSnapshot } from './WorldSessionHelpers';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    ServerScenarioState,
    WorldSessionPersistentEnemy,
    WorldSessionPersistentLoot,
    WorldSessionPersistentPlayer,
} from './WorldSessionTypes';

export function toPersistentPlayer(player: ServerPlayer): WorldSessionPersistentPlayer {
    return {
        id: player.id,
        accountId: player.accountId,
        characterId: player.characterId,
        resumeToken: player.resumeToken,
        originHubId: player.originHubId,
        departureTownId: player.departureTownId,
        elapsedSeconds: player.elapsedSeconds,
        kills: player.kills,
        carriedWeight: player.carriedWeight,
        carriedItems: [...player.carriedItems.entries()],
        raidGoldReward: player.raidGoldReward,
        raidModifier: player.raidModifier,
        completedQuestIds: [...player.completedQuestIds],
        enteredDungeonIds: [...player.enteredDungeonIds],
        completedDungeonIds: [...player.completedDungeonIds],
        fieldEventFlagsByDungeonId: [...player.fieldEventFlagsByDungeonId.entries()]
            .map(([dungeonId, flags]) => [dungeonId, [...flags]]),
        activeDungeonId: player.activeDungeonId,
        active: player.active,
        ghost: player.ghost,
        disconnectedAt: player.disconnectedAt,
        actorIds: [...player.actorIds],
        saveSnapshot: cloneCharacterSave(player.saveSnapshot),
    };
}

export function restorePersistentPlayer(player: WorldSessionPersistentPlayer): ServerPlayer {
    return {
        id: player.id,
        accountId: player.accountId,
        characterId: player.characterId,
        resumeToken: player.resumeToken,
        originHubId: player.originHubId,
        departureTownId: player.departureTownId,
        elapsedSeconds: player.elapsedSeconds,
        kills: player.kills,
        carriedWeight: player.carriedWeight,
        carriedItems: new Map(player.carriedItems),
        raidGoldReward: player.raidGoldReward,
        raidModifier: player.raidModifier ?? rollRaidModifier(`restore:${player.id}`),
        completedQuestIds: new Set(player.completedQuestIds),
        enteredDungeonIds: new Set(player.enteredDungeonIds),
        completedDungeonIds: new Set(player.completedDungeonIds),
        fieldEventFlagsByDungeonId: new Map(
            player.fieldEventFlagsByDungeonId.map(([dungeonId, flags]) => [dungeonId, new Set(flags)])
        ),
        activeDungeonId: player.activeDungeonId,
        active: player.active,
        ghost: player.ghost,
        disconnectedAt: player.disconnectedAt,
        actorIds: [...player.actorIds],
        saveSnapshot: cloneCharacterSave(player.saveSnapshot),
    };
}

export function clonePersistentActor(actor: ServerActor): ServerActor {
    return {
        ...actor,
        tile: { ...actor.tile },
        stats: cloneStats(actor.stats),
        statuses: cloneStatuses(actor.statuses),
        magicLoadout: [...actor.magicLoadout],
        skillUpgradeLevels: { ...actor.skillUpgradeLevels },
    };
}

export function toPersistentEnemy(entry: ServerEnemy): WorldSessionPersistentEnemy {
    return {
        id: entry.enemy.id,
        name: entry.enemy.name,
        level: entry.enemy.level,
        color: entry.enemy.color,
        role: entry.enemy.role,
        monsterId: entry.monsterId,
        tile: { x: entry.enemy.gridX, y: entry.enemy.gridY },
        home: { ...entry.home },
        stats: cloneStats(entry.enemy.stats),
        statuses: cloneStatuses(entry.enemy.statuses),
        actionGauge: entry.enemy.actionGauge,
        facing: entry.enemy.facing,
        aggroRange: entry.enemy.aggroRange,
        expReward: entry.enemy.expReward,
        isAggro: entry.enemy.isAggro,
        isBoss: entry.enemy.isBoss,
        lootTableId: entry.enemy.lootTableId,
        aiMemory: {
            turnCount: entry.enemy.aiMemory.turnCount,
            cooldowns: { ...entry.enemy.aiMemory.cooldowns },
            lastPattern: entry.enemy.aiMemory.lastPattern,
        },
        nestKey: entry.nestKey,
        scenarioPlayerId: entry.scenarioPlayerId,
        scenarioDungeonId: entry.scenarioDungeonId,
        scenarioObjective: entry.scenarioObjective,
        wanderSeed: entry.wanderSeed,
    };
}

export function restorePersistentEnemy(snapshot: WorldSessionPersistentEnemy): ServerEnemy {
    const enemy = new Enemy(
        snapshot.id,
        snapshot.tile.x,
        snapshot.tile.y,
        snapshot.name,
        snapshot.level,
        snapshot.color,
        snapshot.role,
        snapshot.monsterId,
    );
    enemy.stats = cloneStats(snapshot.stats);
    enemy.statuses = cloneStatuses(snapshot.statuses);
    enemy.actionGauge = snapshot.actionGauge;
    enemy.facing = snapshot.facing;
    enemy.aggroRange = snapshot.aggroRange;
    enemy.expReward = snapshot.expReward;
    enemy.isAggro = snapshot.isAggro;
    enemy.isBoss = snapshot.isBoss;
    enemy.lootTableId = snapshot.lootTableId;
    enemy.aiMemory = {
        turnCount: snapshot.aiMemory.turnCount,
        cooldowns: { ...snapshot.aiMemory.cooldowns },
        lastPattern: snapshot.aiMemory.lastPattern,
    };
    return {
        enemy,
        monsterId: snapshot.monsterId,
        nestKey: snapshot.nestKey,
        scenarioPlayerId: snapshot.scenarioPlayerId,
        scenarioDungeonId: snapshot.scenarioDungeonId,
        scenarioObjective: snapshot.scenarioObjective,
        home: { ...snapshot.home },
        wanderSeed: snapshot.wanderSeed,
    };
}

export function clonePersistentNestState(state: FieldNestState): FieldNestState {
    return {
        ...state,
        centerTile: { ...state.centerTile },
        monsterIds: [...state.monsterIds],
    };
}

export function clonePersistentScenarioState(state: ServerScenarioState): ServerScenarioState {
    return {
        ...state,
        returnTile: state.returnTile ? { ...state.returnTile } : null,
        enemyIds: [...state.enemyIds],
    };
}

export function toPersistentLoot(lootObject: LootObject): WorldSessionPersistentLoot {
    return {
        id: lootObject.id,
        tile: { x: lootObject.x, y: lootObject.y },
        sourceLabel: lootObject.sourceLabel,
        kind: lootObject.kind,
        containerType: lootObject.containerType,
        opened: lootObject.opened,
        unlocked: lootObject.unlocked || undefined,
        gridSnapshot: gridToSnapshot(lootObject.inventory),
        overflowItemIds: lootObject.overflowItems.map((item) => item.id),
    };
}

export function restorePersistentLoot(snapshot: WorldSessionPersistentLoot): LootObject {
    const lootObject = new LootObject(snapshot.id, snapshot.tile.x, snapshot.tile.y, [], {
        sourceLabel: snapshot.sourceLabel,
        kind: snapshot.kind,
        containerType: snapshot.containerType,
        gridW: snapshot.gridSnapshot.width,
        gridH: snapshot.gridSnapshot.height,
    });
    lootObject.opened = snapshot.opened;
    lootObject.unlocked = snapshot.unlocked ?? false;
    for (const placedSnapshot of snapshot.gridSnapshot.items) {
        const item = getItemDef(placedSnapshot.itemId);
        if (!item) continue;
        const sockets = placedSnapshot.sockets
            ?.map((socketId) => getItemDef(socketId))
            .filter((socket): socket is ItemDef => Boolean(socket));
        const placed = {
            item,
            gridX: placedSnapshot.gridX,
            gridY: placedSnapshot.gridY,
            durability: placedSnapshot.durability,
            quantity: placedSnapshot.quantity,
            acquiredInRaid: placedSnapshot.acquiredInRaid,
            sockets,
        };
        if (!lootObject.inventory.placeExisting(placed, placedSnapshot.gridX, placedSnapshot.gridY)) {
            lootObject.overflowItems.push(item);
        }
    }
    for (const itemId of snapshot.overflowItemIds) {
        const item = getItemDef(itemId);
        if (item) lootObject.overflowItems.push(item);
    }
    return lootObject;
}
