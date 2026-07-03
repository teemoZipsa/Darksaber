import {
    createStatus,
    getEffectiveStats,
    removeActionStanceStatusesFromCarrier,
    replaceActionStanceStatuses,
} from '../src/combat/StatusEffects';
import { getClassLine } from '../src/data/ClassTree';
import {
    getCombatRecovery,
    getItemDef,
    isCombatRecoveryConsumable,
} from '../src/data/ItemDB';
import {
    ATTACK_AP_COST,
    DEFEND_ACTION_GAUGE_COST,
    MOVE_ACTION_GAUGE_COST,
    REST_ACTION_GAUGE_COST,
    TOOL_ACTION_GAUGE_COST,
} from '../src/field/FieldActionEconomy';
import { manhattan, type FieldPassableQuery, type TilePoint } from '../src/field/FieldPathing';
import { getTerrainMoveCost } from '../src/field/TerrainRules';
import type {
    AutoLootGrantMessage,
    CombatEventMessage,
    InventoryConsumedMessage,
    ScenarioEnemyDefeatEventMessage,
    WorldServerMessage,
} from '../src/net/WorldProtocol';
import {
    readAttackTargetId,
    readStringPayload,
    readTilePayload,
} from '../src/net/WorldIntentPayloads';
import { planMoveIntentPath } from './WorldSessionMoveIntent';
import { canActorTargetEnemy } from './WorldSessionVisibility';
import { addCarriedItemQuantity } from './WorldSessionCarryState';
import { createActorEvent, directionFromTo, reject } from './WorldSessionHelpers';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    WorldSessionMessageResult,
} from './WorldSessionTypes';
import type { WorldMap } from '../src/map/WorldMap';

export interface WorldSessionActorAttackResult {
    event: CombatEventMessage;
    autoLootGrant?: AutoLootGrantMessage;
    scenarioEnemyDefeatEvent?: ScenarioEnemyDefeatEventMessage;
}

export interface WorldSessionPlayerIntentContext {
    players: ReadonlyMap<string, ServerPlayer>;
    enemies: ReadonlyMap<string, ServerEnemy>;
    saveState: WorldSessionSaveState;
    getServerTileAt: (tile: TilePoint, ownerPlayerId?: string | null) => ReturnType<WorldMap['getTileAt']>;
    isFieldPassableForOwner: (query: FieldPassableQuery, ownerPlayerId?: string) => boolean;
    hasFieldLineOfSight: (from: TilePoint, to: TilePoint, ownerPlayerId?: string) => boolean;
    spawnLootNear: (anchor: TilePoint, departureTownId?: string | null) => void;
    spendActorGauge: (actor: ServerActor, cost: number) => void;
    finishActorIfSpent: (actor: ServerActor) => void;
    resolveActorAttack: (actor: ServerActor, target: ServerEnemy, now: number) => WorldSessionActorAttackResult;
}

export class WorldSessionPlayerIntentResolver {
    public constructor(private readonly context: WorldSessionPlayerIntentContext) {}

    public handleMove(actor: ServerActor, intentId: string, payload: unknown): WorldSessionMessageResult {
        const tile = readTilePayload(payload);
        if (!tile) return reject(intentId, 'Move payload must include a tile.');

        const path = planMoveIntentPath({
            actor,
            targetTile: tile,
            isPassable: (query) => this.context.isFieldPassableForOwner(query, actor.ownerPlayerId),
            terrainCost: (step) => getTerrainMoveCost(this.context.getServerTileAt(step, actor.ownerPlayerId)),
        });
        if (path.length === 0 && manhattan(actor.tile, tile) > 0) return reject(intentId, 'No valid path.');
        if (actor.remainingAp < MOVE_ACTION_GAUGE_COST) return reject(intentId, 'No action available for movement.');

        this.context.spendActorGauge(actor, MOVE_ACTION_GAUGE_COST);
        removeActionStanceStatusesFromCarrier(actor);
        if (path.length > 0) {
            const next = path[path.length - 1];
            actor.facing = directionFromTo(actor.tile, next);
            actor.tile = { ...next };
        }
        const player = this.context.players.get(actor.ownerPlayerId);
        if (!player?.activeDungeonId) this.context.spawnLootNear(actor.tile, player?.departureTownId);
        this.context.finishActorIfSpent(actor);
        return { replies: [], broadcasts: [] };
    }

    public handleDefend(actor: ServerActor, intentId: string): WorldSessionMessageResult {
        if (actor.remainingAp < DEFEND_ACTION_GAUGE_COST) return reject(intentId, 'No action available to defend.');

        this.context.spendActorGauge(actor, DEFEND_ACTION_GAUGE_COST);
        const guard = createStatus('guard', { durationTurns: undefined, sourceType: 'action' });
        const counterReady = createStatus('counterReady', { durationTurns: undefined, sourceType: 'action' });
        actor.statuses = replaceActionStanceStatuses(actor.statuses, [guard, counterReady]);
        this.context.finishActorIfSpent(actor);

        return {
            replies: [],
            broadcasts: [createActorEvent('status', actor, actor, undefined, guard)],
        };
    }

    public handleRest(actor: ServerActor, intentId: string): WorldSessionMessageResult {
        if (actor.remainingAp < REST_ACTION_GAUGE_COST) return reject(intentId, 'No action available to rest.');

        this.context.spendActorGauge(actor, REST_ACTION_GAUGE_COST);
        const resting = createStatus('resting', { sourceType: 'action' });
        actor.statuses = replaceActionStanceStatuses(actor.statuses, [resting]);
        this.context.finishActorIfSpent(actor);

        return {
            replies: [],
            broadcasts: [createActorEvent('status', actor, actor, undefined, resting)],
        };
    }

    public handleAttack(actor: ServerActor, intentId: string, payload: unknown, now: number): WorldSessionMessageResult {
        const targetId = readAttackTargetId(payload);
        if (!targetId) return reject(intentId, 'Attack payload must include targetId.');
        const target = this.context.enemies.get(targetId);
        if (!target || target.enemy.stats.hp <= 0) return reject(intentId, 'Target is not alive.');
        if (!canActorTargetEnemy(actor, target)) return reject(intentId, 'Target is not visible.');
        if (actor.remainingAp < ATTACK_AP_COST) return reject(intentId, 'No action available for attack.');

        const range = getClassLine(actor.classLineId)?.attackRange ?? 1;
        const targetTile = { x: target.enemy.gridX, y: target.enemy.gridY };
        if (manhattan(actor.tile, targetTile) > range) return reject(intentId, 'Target is out of range.');
        if (range > 1 && !this.context.hasFieldLineOfSight(actor.tile, targetTile, actor.ownerPlayerId)) {
            return reject(intentId, 'Line of sight is blocked.');
        }

        this.context.spendActorGauge(actor, ATTACK_AP_COST);
        actor.facing = directionFromTo(actor.tile, targetTile);
        const { event, autoLootGrant, scenarioEnemyDefeatEvent } = this.context.resolveActorAttack(actor, target, now);
        this.context.finishActorIfSpent(actor);
        const replies: WorldServerMessage[] = [];
        if (autoLootGrant) replies.push(autoLootGrant);
        if (scenarioEnemyDefeatEvent) replies.push(scenarioEnemyDefeatEvent);
        return { replies, broadcasts: [event] };
    }

    public handleUseItem(player: ServerPlayer, actor: ServerActor, intentId: string, payload: unknown): WorldSessionMessageResult {
        const itemId = readStringPayload(payload, 'itemId');
        if (!itemId) return reject(intentId, 'Use item payload must include itemId.');
        if ((player.carriedItems.get(itemId) ?? 0) <= 0) return reject(intentId, 'Item is not available on this server session.');

        const item = getItemDef(itemId);
        if (!item || !isCombatRecoveryConsumable(item)) return reject(intentId, 'Item cannot be used in combat.');
        if (actor.remainingAp < TOOL_ACTION_GAUGE_COST) return reject(intentId, 'No action available to use item.');

        const recovery = getCombatRecovery(item);
        const effective = getEffectiveStats(actor.stats, actor.statuses);
        const effectiveHp = Math.max(0, Math.min(recovery.hp, effective.maxHp - actor.stats.hp));
        const effectiveMp = Math.max(0, Math.min(recovery.mp, effective.maxMp - actor.stats.mp));
        if (effectiveHp <= 0 && effectiveMp <= 0) return reject(intentId, 'Item has no effect.');

        this.context.spendActorGauge(actor, TOOL_ACTION_GAUGE_COST);
        actor.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.stats.hp + effectiveHp));
        actor.stats.mp = Math.max(0, Math.min(effective.maxMp, actor.stats.mp + effectiveMp));
        addCarriedItemQuantity(player, itemId, -1);
        this.context.saveState.removeItemQuantity(player, itemId, 1);
        this.context.saveState.markDirty(player.id);
        this.context.finishActorIfSpent(actor);

        const consumed: InventoryConsumedMessage = { type: 'INVENTORY_CONSUMED', itemId, quantity: 1 };
        const event: CombatEventMessage = {
            type: 'COMBAT_EVENT',
            kind: effectiveHp > 0 ? 'heal' : 'status',
            sourceId: actor.id,
            targetId: actor.id,
            sourceName: actor.name,
            targetName: actor.name,
            value: effectiveHp > 0 ? effectiveHp : effectiveMp,
        };
        return { replies: [consumed], broadcasts: [event] };
    }
}
