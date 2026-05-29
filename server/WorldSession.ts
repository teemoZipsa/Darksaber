import {
    applyStatus,
    createStatus,
    getEffectiveStats,
    getEffectiveStatsForEnemy,
    type StatusEffect,
} from '../src/combat/StatusEffects';
import { CombatFormulas } from '../src/combat/CombatFormulas';
import type { CharacterStats } from '../src/data/Stats';
import { getClassLine } from '../src/data/ClassTree';
import { getItemDef } from '../src/data/ItemDB';
import {
    GENERAL_MONSTER_IDS,
    getMonsterDefinition,
    type MonsterId,
} from '../src/data/MonsterCatalog';
import { Enemy } from '../src/entity/Enemy';
import { LootObject } from '../src/entity/LootObject';
import {
    ATTACK_AP_COST,
    INTERACT_AP_COST,
    MOVE_AP_PER_TILE,
} from '../src/field/FieldActionEconomy';
import { FIELD_ATB_SCALE, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, ENEMY_LEASH_RANGE } from '../src/field/FieldConfig';
import { decideEnemyAction, type EnemyAIDecision, type EnemyAIUnit } from '../src/field/EnemyAI';
import { advanceAtb, resolveAggroState } from '../src/field/FieldCombat';
import {
    findPathToAny,
    findPathWithCost,
    manhattan,
    tilesInRange,
    type FieldPassableQuery,
    type TilePoint,
} from '../src/field/FieldPathing';
import { hasLineOfSight } from '../src/field/LineOfSight';
import {
    getTerrainMoveCost,
    isTerrainLineOfSightBlocking,
    isTerrainPassable,
    terrainCostToApCost,
} from '../src/field/TerrainRules';
import { WorldMap } from '../src/map/WorldMap';
import type { TownInfo } from '../src/map/BiomeMask';
import {
    type ActorSnapshot,
    type ActionRejectedMessage,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type GridSnapshot,
    type LootGrantMessage,
    type LootSnapshot,
    type NetFacing,
    type RaidResultMessage,
    type WorldClientMessage,
    type WorldJoinMessage,
    type WorldPlayerSnapshot,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from '../src/net/WorldProtocol';

export const WORLD_TICK_MS = 100;
export const DISCONNECT_GRACE_MS = 30_000;
const RAID_LIMIT_SECONDS = 30 * 60;
const AUTO_LOOT_RESPONSE_MS = 5_000;

interface ServerActor {
    id: string;
    ownerPlayerId: string;
    localActorId: string;
    name: string;
    classLineId: string;
    level: number;
    tile: TilePoint;
    stats: CharacterStats;
    statuses: StatusEffect[];
    actionGauge: number;
    remainingAp: number;
    majorActionUsed: boolean;
    facing: NetFacing;
    isDead: boolean;
}

interface ServerPlayer {
    id: string;
    resumeToken: string;
    originHubId: string;
    departureTownId: string;
    elapsedSeconds: number;
    kills: number;
    active: boolean;
    ghost: boolean;
    disconnectedAt: number | null;
    actorIds: string[];
}

interface ServerEnemy {
    enemy: Enemy;
    monsterId?: MonsterId;
    home: TilePoint;
    wanderSeed: number;
}

interface LootLock {
    playerId: string;
    lastTouchedAt: number;
}

interface AutoLootPending {
    playerId: string;
    createdAt: number;
}

export interface WorldSessionTickResult {
    events: CombatEventMessage[];
    perPlayerMessages: Array<{ playerId: string; message: WorldServerMessage }>;
}

export interface WorldSessionMessageResult {
    replies: WorldServerMessage[];
    broadcasts: WorldServerMessage[];
}

export interface WorldSessionDebugCounts {
    activePlayers: number;
    ghostPlayers: number;
    enemies: number;
    lootLocks: number;
}

export interface WorldSessionOptions {
    ghostGraceMs?: number;
    logger?: (message: string) => void;
}

const ENEMY_SPAWN_OFFSETS: TilePoint[] = [
    { x: 7, y: 3 },
    { x: 10, y: -2 },
    { x: -6, y: 6 },
    { x: 12, y: 4 },
    { x: -9, y: -4 },
    { x: -11, y: 5 },
    { x: 15, y: -5 },
    { x: 17, y: 6 },
    { x: 6, y: -9 },
    { x: -13, y: -7 },
    { x: 19, y: 0 },
    { x: -16, y: 2 },
    { x: 3, y: 12 },
    { x: -5, y: 13 },
    { x: 14, y: 11 },
    { x: -18, y: -3 },
];

export class WorldSession {
    public readonly sessionEpoch = Date.now();
    private readonly worldMap = new WorldMap();
    private readonly players = new Map<string, ServerPlayer>();
    private readonly actors = new Map<string, ServerActor>();
    private readonly enemies = new Map<string, ServerEnemy>();
    private readonly loot = new Map<string, LootObject>();
    private readonly lootLocks = new Map<string, LootLock>();
    private readonly autoLootPending = new Map<string, AutoLootPending>();
    private seq = 0;
    private nextPlayerId = 1;
    private nextEnemyId = 1;
    private nextLootId = 1;
    private lastTickAt: number | null = null;
    private readonly ghostGraceMs: number;
    private readonly logger: (message: string) => void;

    constructor(options: WorldSessionOptions = {}) {
        this.ghostGraceMs = options.ghostGraceMs ?? DISCONNECT_GRACE_MS;
        this.logger = options.logger ?? (() => undefined);
    }

    public join(message: WorldJoinMessage, now: number = Date.now()): { playerId: string; welcome: WorldWelcomeMessage } {
        const resumed = message.resumeToken ? this.findResumablePlayer(message.resumeToken, now) : null;
        if (resumed) {
            resumed.ghost = false;
            resumed.disconnectedAt = null;
            const spawnTile = this.firstActorTile(resumed) ?? this.getOriginExitTile(resumed.originHubId);
            this.log(`reconnect player=${resumed.id} origin=${resumed.originHubId}`);
            return {
                playerId: resumed.id,
                welcome: {
                    type: 'WORLD_WELCOME',
                    playerId: resumed.id,
                    sessionEpoch: this.sessionEpoch,
                    resumeToken: resumed.resumeToken,
                    spawnTile,
                },
            };
        }

        const playerId = `player_${this.nextPlayerId++}`;
        const resumeToken = createToken('resume');
        const originHubId = this.getTownById(message.originHubId)?.id ?? 'central_castle';
        const spawnTile = this.getOriginExitTile(originHubId);
        const player: ServerPlayer = {
            id: playerId,
            resumeToken,
            originHubId,
            departureTownId: originHubId,
            elapsedSeconds: 0,
            kills: 0,
            active: true,
            ghost: false,
            disconnectedAt: null,
            actorIds: [],
        };
        this.players.set(playerId, player);

        const composition = message.partyComposition.length > 0 ? message.partyComposition : [createFallbackActorSnapshot()];
        composition.forEach((snapshot, index) => {
            const tile = this.findNearbyWalkableTile({
                x: spawnTile.x + formationOffset(index).x,
                y: spawnTile.y + formationOffset(index).y,
            }, `${playerId}:${snapshot.id}`);
            const actorId = `${playerId}:${snapshot.id}`;
            const actor: ServerActor = {
                id: actorId,
                ownerPlayerId: playerId,
                localActorId: snapshot.id,
                name: snapshot.name,
                classLineId: snapshot.classLineId,
                level: snapshot.level,
                tile,
                stats: cloneStats(snapshot.stats),
                statuses: cloneStatuses(snapshot.statuses),
                actionGauge: 0,
                remainingAp: 0,
                majorActionUsed: false,
                facing: 'down',
                isDead: snapshot.isDead,
            };
            this.actors.set(actorId, actor);
            player.actorIds.push(actorId);
        });

        this.ensureContentNear(spawnTile);
        this.log(`join player=${playerId} origin=${originHubId} actors=${player.actorIds.length}`);
        return {
            playerId,
            welcome: {
                type: 'WORLD_WELCOME',
                playerId,
                sessionEpoch: this.sessionEpoch,
                resumeToken,
                spawnTile,
            },
        };
    }

    public reconnect(resumeToken: string, now: number = Date.now()): { playerId: string; welcome: WorldWelcomeMessage } | null {
        const player = this.findResumablePlayer(resumeToken, now);
        if (!player) return null;
        player.ghost = false;
        player.disconnectedAt = null;
        const spawnTile = this.firstActorTile(player) ?? this.getOriginExitTile(player.originHubId);
        this.log(`reconnect player=${player.id} origin=${player.originHubId}`);
        return {
            playerId: player.id,
            welcome: {
                type: 'WORLD_WELCOME',
                playerId: player.id,
                sessionEpoch: this.sessionEpoch,
                resumeToken: player.resumeToken,
                spawnTile,
            },
        };
    }

    public disconnect(playerId: string, now: number = Date.now()): void {
        const player = this.players.get(playerId);
        if (!player || !player.active) return;
        player.ghost = true;
        player.disconnectedAt = now;
        for (const actorId of player.actorIds) {
            const actor = this.actors.get(actorId);
            if (actor) actor.remainingAp = 0;
        }
        this.releaseLootLocksForPlayer(playerId);
        this.log(`ghost start player=${playerId} graceMs=${this.ghostGraceMs}`);
    }

    public handleMessage(playerId: string, message: WorldClientMessage, now: number = Date.now()): WorldSessionMessageResult {
        switch (message.type) {
            case 'PLAYER_INTENT':
                return this.handleIntent(playerId, message, now);
            case 'LOOT_PICKUP':
                return this.handleLootPickup(playerId, message.intentId, message.lootId, message.gridX, message.gridY, now);
            case 'AUTO_LOOT_RESOLVE':
                return this.handleAutoLootResolve(playerId, message.lootId, message.acceptedCells);
            case 'WORLD_LEAVE':
                this.log(`leave player=${playerId} reason=${message.reason}`);
                return {
                    replies: [this.finishPlayer(playerId, message.reason === 'wipe' ? 'DEAD' : message.reason === 'town' ? 'SURVIVED' : 'LEFT')],
                    broadcasts: [],
                };
            default:
                return { replies: [], broadcasts: [] };
        }
    }

    public tick(now: number = Date.now()): WorldSessionTickResult {
        const dt = this.consumeTickDelta(now);
        const events: CombatEventMessage[] = [];
        const perPlayerMessages: Array<{ playerId: string; message: WorldServerMessage }> = [];

        for (const player of [...this.players.values()]) {
            if (!player.active) continue;
            if (player.ghost && player.disconnectedAt !== null && now - player.disconnectedAt >= this.ghostGraceMs) {
                this.log(`despawn player=${player.id} reason=ghost_expired`);
                this.removePlayer(player.id);
                continue;
            }
            if (player.ghost) continue;

            player.elapsedSeconds = Math.min(RAID_LIMIT_SECONDS, player.elapsedSeconds + dt);
            if (player.elapsedSeconds >= RAID_LIMIT_SECONDS) {
                perPlayerMessages.push({ playerId: player.id, message: this.finishPlayer(player.id, 'MIA') });
                continue;
            }

            for (const actorId of player.actorIds) {
                const actor = this.actors.get(actorId);
                if (!actor || actor.isDead) continue;
                if (actor.actionGauge < 100) {
                    actor.actionGauge = advanceAtb(actor.actionGauge, getEffectiveStats(actor.stats, actor.statuses).spd, dt, FIELD_ATB_SCALE);
                    if (actor.actionGauge >= 100) {
                        actor.actionGauge = 100;
                        actor.remainingAp = getActorActionLimit(actor);
                        actor.majorActionUsed = false;
                    }
                }
            }
        }

        for (const entry of this.enemies.values()) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            enemy.actionGauge = advanceAtb(enemy.actionGauge, getEffectiveStatsForEnemy(enemy).spd, dt, FIELD_ATB_SCALE * 0.7);
            if (enemy.actionGauge >= 100) {
                enemy.actionGauge = 100;
                events.push(...this.resolveEnemyTurn(entry, now));
                enemy.actionGauge = 0;
            }
        }

        this.releaseExpiredAutoLoot(now);
        this.releaseExpiredLootLocks(now);
        for (const player of [...this.players.values()]) {
            if (!player.active || player.ghost) continue;
            if (this.isPlayerWiped(player)) {
                perPlayerMessages.push({ playerId: player.id, message: this.finishPlayer(player.id, 'DEAD') });
            }
        }

        return { events, perPlayerMessages };
    }

    public createSnapshot(viewerPlayerId: string | null = null, now: number = Date.now()): WorldSnapshot {
        this.seq += 1;
        const players: WorldPlayerSnapshot[] = [...this.players.values()]
            .filter((player) => player.active)
            .map((player) => ({
                playerId: player.id,
                originHubId: player.originHubId,
                isGhost: player.ghost,
                actorIds: [...player.actorIds],
            }));
        const partyActors = [...this.actors.values()]
            .filter((actor) => this.players.get(actor.ownerPlayerId)?.active)
            .map((actor) => this.toActorSnapshot(actor));
        const enemies = [...this.enemies.values()]
            .filter((entry) => entry.enemy.stats.hp > 0)
            .map((entry) => ({
                id: entry.enemy.id,
                monsterId: entry.monsterId,
                name: entry.enemy.name,
                role: entry.enemy.role,
                level: entry.enemy.level,
                color: entry.enemy.color,
                tile: { x: entry.enemy.gridX, y: entry.enemy.gridY },
                home: { ...entry.home },
                stats: cloneStats(entry.enemy.stats),
                statuses: cloneStatuses(entry.enemy.statuses),
                actionGauge: entry.enemy.actionGauge,
                facing: entry.enemy.facing,
                isAggro: entry.enemy.isAggro,
                isBoss: entry.enemy.isBoss,
            }));
        const loot = [...this.loot.values()]
            .filter((lootObject) => !this.autoLootPending.has(lootObject.id))
            .map((lootObject) => this.toLootSnapshot(lootObject));
        const readyActors = partyActors
            .filter((actor) => !actor.isDead && !actor.isGhost && actor.actionGauge >= 100)
            .map((actor) => actor.id);
        const remainingApByActor: Record<string, number> = {};
        for (const actor of partyActors) remainingApByActor[actor.id] = actor.remainingAp;

        const viewer = viewerPlayerId ? this.players.get(viewerPlayerId) : undefined;
        const fallbackPlayer = viewer ?? [...this.players.values()].find((player) => player.active);
        return {
            seq: this.seq,
            serverTime: now,
            players,
            partyActors,
            enemies,
            loot,
            readyActors,
            remainingApByActor,
            raidTimer: {
                active: Boolean(fallbackPlayer?.active),
                elapsedSeconds: fallbackPlayer?.elapsedSeconds ?? 0,
                limitSeconds: RAID_LIMIT_SECONDS,
                departureTownId: fallbackPlayer?.departureTownId ?? 'central_castle',
            },
        };
    }

    public getActivePlayerIds(): string[] {
        return [...this.players.values()]
            .filter((player) => player.active && !player.ghost)
            .map((player) => player.id);
    }

    public getPlayerByResumeToken(resumeToken: string): ServerPlayer | null {
        return [...this.players.values()].find((player) => player.resumeToken === resumeToken) ?? null;
    }

    public getDebugCounts(): WorldSessionDebugCounts {
        const activePlayers = [...this.players.values()].filter((player) => player.active && !player.ghost).length;
        const ghostPlayers = [...this.players.values()].filter((player) => player.active && player.ghost).length;
        const enemies = [...this.enemies.values()].filter((entry) => entry.enemy.stats.hp > 0).length;
        return {
            activePlayers,
            ghostPlayers,
            enemies,
            lootLocks: this.lootLocks.size,
        };
    }

    private handleIntent(
        playerId: string,
        message: Extract<WorldClientMessage, { type: 'PLAYER_INTENT' }>,
        now: number
    ): WorldSessionMessageResult {
        const actor = this.actors.get(message.actorId);
        const player = this.players.get(playerId);
        const validationError = this.validateActorIntent(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        switch (message.kind) {
            case 'move':
                return this.handleMoveIntent(actor!, message.intentId, message.payload);
            case 'attack':
                return this.handleAttackIntent(actor!, message.intentId, message.payload, now);
            case 'interact':
                return this.handleInteractIntent(playerId, actor!, message.intentId, message.payload, now);
            case 'endTurn':
                this.endActorTurn(actor!);
                return { replies: [], broadcasts: [] };
            case 'useItem':
                return reject(message.intentId, 'useItem is not available in network raid V1.');
        }
    }

    private validateActorIntent(player: ServerPlayer | undefined, actor: ServerActor | undefined): string | null {
        if (!player || !player.active) return 'Player is not in an active raid.';
        if (player.ghost) return 'Ghost players cannot act.';
        if (!actor) return 'Actor does not exist.';
        if (actor.ownerPlayerId !== player.id) return 'Actor is not owned by this player.';
        if (actor.isDead || actor.stats.hp <= 0) return 'Actor is down.';
        if (actor.actionGauge < 100) return 'Actor action gauge is not ready.';
        return null;
    }

    private handleMoveIntent(actor: ServerActor, intentId: string, payload: unknown): WorldSessionMessageResult {
        const tile = readTilePayload(payload);
        if (!tile) return reject(intentId, 'Move payload must include a tile.');

        const movementBudget = Math.max(1, getEffectiveStats(actor.stats, actor.statuses).mov || 1);
        const pathResult = findPathWithCost(
            actor.tile,
            tile,
            (query) => this.isFieldPassable(query),
            (step) => getTerrainMoveCost(this.worldMap.getTileAt(step.x, step.y)),
            {
                actorId: actor.id,
                intent: 'move',
                maxNodes: 8000,
                maxCost: movementBudget,
            }
        );
        if (pathResult.path.length === 0 && manhattan(actor.tile, tile) > 0) return reject(intentId, 'No valid path.');

        const apCost = terrainCostToApCost(pathResult.cost);
        if (apCost > actor.remainingAp) return reject(intentId, 'Not enough AP for movement.');

        actor.remainingAp -= apCost;
        if (pathResult.path.length > 0) {
            const next = pathResult.path[pathResult.path.length - 1];
            actor.facing = directionFromTo(actor.tile, next);
            actor.tile = { ...next };
        }
        this.finishActorIfSpent(actor);
        return { replies: [], broadcasts: [] };
    }

    private handleAttackIntent(actor: ServerActor, intentId: string, payload: unknown, now: number): WorldSessionMessageResult {
        const targetId = readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
        if (!targetId) return reject(intentId, 'Attack payload must include targetId.');
        const target = this.enemies.get(targetId);
        if (!target || target.enemy.stats.hp <= 0) return reject(intentId, 'Target is not alive.');
        if (actor.majorActionUsed) return reject(intentId, 'Major action already used this turn.');
        if (actor.remainingAp < ATTACK_AP_COST) return reject(intentId, 'Not enough AP for attack.');

        const range = getClassLine(actor.classLineId)?.attackRange ?? 1;
        const targetTile = { x: target.enemy.gridX, y: target.enemy.gridY };
        if (manhattan(actor.tile, targetTile) > range) return reject(intentId, 'Target is out of range.');
        if (range > 1 && !this.hasFieldLineOfSight(actor.tile, targetTile)) return reject(intentId, 'Line of sight is blocked.');

        actor.remainingAp -= ATTACK_AP_COST;
        actor.majorActionUsed = true;
        actor.facing = directionFromTo(actor.tile, targetTile);
        const { event, autoLootGrant } = this.resolveActorAttack(actor, target, now);
        this.finishActorIfSpent(actor);
        return { replies: autoLootGrant ? [autoLootGrant] : [], broadcasts: [event] };
    }

    private handleInteractIntent(
        playerId: string,
        actor: ServerActor,
        intentId: string,
        payload: unknown,
        now: number
    ): WorldSessionMessageResult {
        const lootId = readStringPayload(payload, 'lootId');
        if (!lootId) return reject(intentId, 'Interact payload must include lootId.');
        const lootObject = this.loot.get(lootId);
        if (!lootObject || lootObject.opened || this.autoLootPending.has(lootId)) return reject(intentId, 'Loot is not available.');
        if (actor.remainingAp < INTERACT_AP_COST) return reject(intentId, 'Not enough AP to inspect loot.');
        if (manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 1) return reject(intentId, 'Loot is too far away.');

        const lock = this.lootLocks.get(lootId);
        if (lock && lock.playerId !== playerId) return reject(intentId, 'Loot is already occupied.');

        actor.remainingAp -= INTERACT_AP_COST;
        this.lootLocks.set(lootId, { playerId, lastTouchedAt: now });
        this.finishActorIfSpent(actor);
        return {
            replies: [{
                type: 'LOOT_GRANT',
                lootId,
                gridSnapshot: gridToSnapshot(lootObject.inventory),
            } satisfies LootGrantMessage],
            broadcasts: [],
        };
    }

    private handleLootPickup(
        playerId: string,
        intentId: string,
        lootId: string,
        gridX: number,
        gridY: number,
        now: number
    ): WorldSessionMessageResult {
        const lootObject = this.loot.get(lootId);
        if (!lootObject || this.autoLootPending.has(lootId)) return reject(intentId, 'Loot does not exist.');
        const lock = this.lootLocks.get(lootId);
        if (!lock || lock.playerId !== playerId) return reject(intentId, 'Loot is not occupied by this player.');

        const placed = lootObject.inventory.getAt(gridX, gridY);
        if (!placed) return reject(intentId, 'No item at requested loot cell.');
        lootObject.inventory.remove(placed);
        lock.lastTouchedAt = now;
        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) this.lootLocks.delete(lootId);

        return {
            replies: [{
                type: 'LOOT_GRANT',
                lootId,
                gridSnapshot: gridToSnapshot(lootObject.inventory),
            }],
            broadcasts: [],
        };
    }

    private handleAutoLootResolve(
        playerId: string,
        lootId: string,
        acceptedCells: Array<{ gridX: number; gridY: number }>
    ): WorldSessionMessageResult {
        const pending = this.autoLootPending.get(lootId);
        const lootObject = this.loot.get(lootId);
        if (!pending || pending.playerId !== playerId || !lootObject) return { replies: [], broadcasts: [] };

        const removed = new Set<object>();
        for (const cell of acceptedCells) {
            const placed = lootObject.inventory.getAt(cell.gridX, cell.gridY);
            if (!placed || removed.has(placed)) continue;
            lootObject.inventory.remove(placed);
            removed.add(placed);
        }

        this.autoLootPending.delete(lootId);
        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) {
            this.loot.delete(lootId);
            this.lootLocks.delete(lootId);
        }
        return { replies: [], broadcasts: [] };
    }

    private resolveActorAttack(actor: ServerActor, target: ServerEnemy, now: number): { event: CombatEventMessage; autoLootGrant?: AutoLootGrantMessage } {
        const enemy = target.enemy;
        const result = CombatFormulas.calcPhysicalDamage(
            getEffectiveStats(actor.stats, actor.statuses),
            getEffectiveStatsForEnemy(enemy),
            this.worldMap.getTileAt(enemy.gridX, enemy.gridY),
            { isRanged: manhattan(actor.tile, { x: enemy.gridX, y: enemy.gridY }) > 1 }
        );
        const event: CombatEventMessage = {
            type: 'COMBAT_EVENT',
            kind: result.isMiss ? 'miss' : 'damage',
            sourceId: actor.id,
            targetId: enemy.id,
            sourceName: actor.name,
            targetName: enemy.name,
            value: result.damage,
        };
        let autoLootGrant: AutoLootGrantMessage | undefined;
        if (!result.isMiss) {
            enemy.takeDamage(result.damage);
            if (enemy.stats.hp <= 0) {
                event.kind = 'kill';
                this.enemies.delete(enemy.id);
                const player = this.players.get(actor.ownerPlayerId);
                if (player) player.kills += 1;
                autoLootGrant = enemy.isBoss
                    ? undefined
                    : this.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
                if (enemy.isBoss || !autoLootGrant) this.spawnEnemyLoot(enemy);
            }
        }
        return { event, autoLootGrant };
    }

    private resolveEnemyTurn(entry: ServerEnemy, now: number): CombatEventMessage[] {
        const enemy = entry.enemy;
        const targets = this.getTargetableActors();
        const enemyTile = { x: enemy.gridX, y: enemy.gridY };
        const closest = targets.reduce<ServerActor | null>((best, candidate) => {
            if (!best) return candidate;
            return manhattan(enemyTile, candidate.tile) < manhattan(enemyTile, best.tile) ? candidate : best;
        }, null);
        if (!closest) {
            this.wanderEnemy(entry, now);
            return [];
        }

        const distanceToTarget = manhattan(enemyTile, closest.tile);
        const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
        enemy.isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, leashExceeded);
        if (!enemy.isAggro) {
            this.wanderEnemy(entry, now);
            return [];
        }

        enemy.aiMemory.turnCount += 1;
        const decision = decideEnemyAction({
            self: toEnemyAIUnit(enemy),
            targets: targets.map((actor) => toActorAIUnit(actor)),
            allies: [...this.enemies.values()]
                .map((candidate) => candidate.enemy)
                .filter((candidate) => candidate.stats.hp > 0)
                .map((candidate) => toEnemyAIUnit(candidate)),
            profile: enemy.aiProfile,
            turnCount: enemy.aiMemory.turnCount,
            hasLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to),
        });
        return this.executeEnemyDecision(entry, decision);
    }

    private executeEnemyDecision(entry: ServerEnemy, decision: EnemyAIDecision): CombatEventMessage[] {
        const enemy = entry.enemy;
        switch (decision.kind) {
            case 'attack': {
                const actor = this.actors.get(decision.targetId);
                if (!actor || !this.canEnemyAttack(enemy, actor, decision.range)) return [];
                return [this.resolveEnemyAttack(enemy, actor, decision.range)];
            }
            case 'moveToward': {
                const actor = this.actors.get(decision.targetId);
                if (actor) this.enemyStepToward(entry, actor, decision.desiredRange);
                return [];
            }
            case 'moveAway': {
                const actor = this.actors.get(decision.targetId);
                if (actor) this.enemyStepAway(entry, actor);
                return [];
            }
            case 'healAlly':
            case 'buffAlly':
            case 'debuffTarget':
                return [];
            case 'guard':
                enemy.statuses = applyStatus(enemy.statuses, createStatus('guard'));
                return [{
                    type: 'COMBAT_EVENT',
                    kind: 'status',
                    sourceId: enemy.id,
                    targetId: enemy.id,
                    sourceName: enemy.name,
                    targetName: enemy.name,
                    statusEffect: createStatus('guard'),
                }];
            case 'bossPattern': {
                const actor = this.actors.get(decision.targetId);
                if (!actor) return [];
                if (decision.pattern === 'enrage') {
                    const status = createStatus('allUp', { durationTurns: 4, magnitude: 1.3 });
                    enemy.statuses = applyStatus(enemy.statuses, status);
                    return [{
                        type: 'COMBAT_EVENT',
                        kind: 'status',
                        sourceId: enemy.id,
                        targetId: enemy.id,
                        sourceName: enemy.name,
                        targetName: enemy.name,
                        statusEffect: status,
                    }];
                }
                if (this.canEnemyAttack(enemy, actor, enemy.aiProfile.attackRange)) {
                    return [this.resolveEnemyAttack(enemy, actor, enemy.aiProfile.attackRange)];
                }
                this.enemyStepToward(entry, actor, enemy.aiProfile.preferredRange);
                return [];
            }
            case 'wait':
                return [];
        }
    }

    private resolveEnemyAttack(enemy: Enemy, actor: ServerActor, range: number): CombatEventMessage {
        const result = CombatFormulas.calcPhysicalDamage(
            getEffectiveStatsForEnemy(enemy),
            getEffectiveStats(actor.stats, actor.statuses),
            this.worldMap.getTileAt(actor.tile.x, actor.tile.y),
            { isRanged: range > 1 }
        );
        enemy.facing = directionFromTo({ x: enemy.gridX, y: enemy.gridY }, actor.tile);
        if (!result.isMiss) {
            actor.stats.hp = Math.max(0, actor.stats.hp - result.damage);
            if (actor.stats.hp <= 0) {
                actor.isDead = true;
                actor.remainingAp = 0;
                actor.actionGauge = 0;
                actor.majorActionUsed = false;
            }
        }
        return {
            type: 'COMBAT_EVENT',
            kind: result.isMiss ? 'miss' : actor.isDead ? 'down' : 'damage',
            sourceId: enemy.id,
            targetId: actor.id,
            sourceName: enemy.name,
            targetName: actor.name,
            value: result.damage,
        };
    }

    private finishPlayer(playerId: string, result: RaidResultMessage['result']): RaidResultMessage {
        const player = this.players.get(playerId);
        const extractionTownId = this.resolveExtractionTownId(player);
        const message: RaidResultMessage = {
            type: 'RAID_RESULT',
            playerId,
            result,
            elapsedSeconds: player?.elapsedSeconds ?? 0,
            kills: player?.kills ?? 0,
            departureTownId: player?.departureTownId ?? 'central_castle',
            extractionTownId,
        };
        this.log(`raid result player=${playerId} result=${result} kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        this.removePlayer(playerId);
        return message;
    }

    private removePlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;
        for (const actorId of player.actorIds) this.actors.delete(actorId);
        this.players.delete(playerId);
        this.releaseLootLocksForPlayer(playerId);
    }

    private resolveExtractionTownId(player: ServerPlayer | undefined): string {
        if (!player) return 'central_castle';
        const actor = player.actorIds.map((id) => this.actors.get(id)).find(Boolean);
        if (!actor) return player.departureTownId;
        const town = this.worldMap.getTownAtTile(actor.tile.x, actor.tile.y);
        return town?.id ?? player.departureTownId;
    }

    private getTargetableActors(): ServerActor[] {
        return [...this.actors.values()]
            .filter((actor) => !actor.isDead && actor.stats.hp > 0)
            .filter((actor) => this.players.get(actor.ownerPlayerId)?.active)
            .sort((a, b) => {
                const ghostA = this.players.get(a.ownerPlayerId)?.ghost ? 1 : 0;
                const ghostB = this.players.get(b.ownerPlayerId)?.ghost ? 1 : 0;
                return ghostA - ghostB;
            });
    }

    private isPlayerWiped(player: ServerPlayer): boolean {
        return player.actorIds.every((actorId) => {
            const actor = this.actors.get(actorId);
            return !actor || actor.isDead || actor.stats.hp <= 0;
        });
    }

    private canEnemyAttack(enemy: Enemy, actor: ServerActor, range: number): boolean {
        const enemyTile = { x: enemy.gridX, y: enemy.gridY };
        if (manhattan(enemyTile, actor.tile) > range) return false;
        return range <= 1 || this.hasFieldLineOfSight(enemyTile, actor.tile);
    }

    private enemyStepToward(entry: ServerEnemy, actor: ServerActor, desiredRange: number): void {
        const enemy = entry.enemy;
        const targetTile = actor.tile;
        const enemyTile = { x: enemy.gridX, y: enemy.gridY };
        if (manhattan(enemyTile, targetTile) <= desiredRange) return;
        const goals = tilesInRange(targetTile, desiredRange)
            .filter((tile) => manhattan(tile, targetTile) === desiredRange)
            .filter((tile) => this.isFieldPassable({ ...tile, actorId: enemy.id, intent: 'enemy', goal: targetTile }));
        const path = findPathToAny(enemyTile, goals, (query) => this.isFieldPassable(query), {
            actorId: enemy.id,
            intent: 'enemy',
            maxNodes: 2500,
        });
        if (path.length === 0) return;
        const next = path[0];
        enemy.facing = directionFromTo(enemyTile, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private enemyStepAway(entry: ServerEnemy, actor: ServerActor): void {
        const enemy = entry.enemy;
        const start = { x: enemy.gridX, y: enemy.gridY };
        const candidates = tilesInRange(start, 1)
            .filter((tile) => manhattan(tile, start) === 1)
            .filter((tile) => this.isFieldPassable({ ...tile, actorId: enemy.id, intent: 'enemy' }))
            .sort((a, b) => manhattan(b, actor.tile) - manhattan(a, actor.tile));
        const next = candidates.find((tile) => manhattan(tile, actor.tile) > manhattan(start, actor.tile));
        if (!next) return;
        enemy.facing = directionFromTo(start, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private wanderEnemy(entry: ServerEnemy, now: number): void {
        const enemy = entry.enemy;
        const start = { x: enemy.gridX, y: enemy.gridY };
        const options = tilesInRange(start, 1)
            .filter((tile) => manhattan(tile, start) === 1)
            .filter((tile) => manhattan(tile, entry.home) <= ENEMY_LEASH_RANGE)
            .filter((tile) => this.isFieldPassable({ ...tile, actorId: enemy.id, intent: 'enemy' }));
        if (options.length === 0) return;
        const next = options[Math.abs(hashInt(now + entry.wanderSeed)) % options.length];
        enemy.facing = directionFromTo(start, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private isFieldPassable(query: FieldPassableQuery): boolean {
        const tile = this.worldMap.getTileAt(query.x, query.y);
        if (!isTerrainPassable(tile)) return false;
        for (const actor of this.actors.values()) {
            if (actor.id === query.actorId || actor.isDead) continue;
            if (actor.tile.x === query.x && actor.tile.y === query.y) return false;
        }
        for (const entry of this.enemies.values()) {
            const enemy = entry.enemy;
            if (enemy.id === query.actorId || enemy.stats.hp <= 0) continue;
            if (enemy.gridX === query.x && enemy.gridY === query.y) return false;
        }
        return true;
    }

    private hasFieldLineOfSight(from: TilePoint, to: TilePoint): boolean {
        return hasLineOfSight(from, to, (tile) => isTerrainLineOfSightBlocking(this.worldMap.getTileAt(tile.x, tile.y)));
    }

    private finishActorIfSpent(actor: ServerActor): void {
        if (actor.remainingAp >= MOVE_AP_PER_TILE) return;
        this.endActorTurn(actor);
    }

    private endActorTurn(actor: ServerActor): void {
        actor.remainingAp = 0;
        actor.actionGauge = 0;
        actor.majorActionUsed = false;
    }

    private ensureContentNear(spawnTile: TilePoint): void {
        const hasNearbyEnemy = [...this.enemies.values()].some((entry) =>
            entry.enemy.stats.hp > 0 && manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, spawnTile) <= 24
        );
        if (!hasNearbyEnemy) this.spawnEnemiesNear(spawnTile);

        const hasNearbyLoot = [...this.loot.values()].some((loot) => manhattan({ x: loot.x, y: loot.y }, spawnTile) <= 8);
        if (!hasNearbyLoot) this.spawnLootNear(spawnTile);
    }

    private spawnEnemiesNear(anchor: TilePoint): void {
        GENERAL_MONSTER_IDS.forEach((monsterId, index) => {
            const definition = getMonsterDefinition(monsterId);
            const offset = ENEMY_SPAWN_OFFSETS[index % ENEMY_SPAWN_OFFSETS.length];
            const tile = this.findNearbyWalkableTile({ x: anchor.x + offset.x, y: anchor.y + offset.y }, `enemy_${this.nextEnemyId}`);
            const id = `enemy_${this.nextEnemyId++}`;
            const enemy = new Enemy(id, tile.x, tile.y, definition.name, definition.level, definition.color, definition.role);
            enemy.aggroRange = definition.aggroRange;
            this.enemies.set(id, { enemy, monsterId, home: tile, wanderSeed: this.nextEnemyId * 7919 });
        });
    }

    private spawnLootNear(anchor: TilePoint): void {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        const sword = getItemDef('short_sword');
        const seeds = [
            { offset: { x: 3, y: 2 }, item: herb, label: '버려진 보급 상자', kind: 'chest' as const },
            { offset: { x: -3, y: 4 }, item: sword, label: '전사자의 배낭', kind: 'corpse' as const },
        ];
        for (const seed of seeds) {
            if (!seed.item) continue;
            const id = `loot_${this.nextLootId++}`;
            const tile = this.findNearbyWalkableTile({ x: anchor.x + seed.offset.x, y: anchor.y + seed.offset.y }, id);
            this.loot.set(id, new LootObject(id, tile.x, tile.y, [seed.item], { sourceLabel: seed.label, kind: seed.kind }));
        }
    }

    private spawnEnemyLoot(enemy: Enemy): void {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (!herb) return;
        const id = `loot_${this.nextLootId++}`;
        this.loot.set(id, new LootObject(id, enemy.gridX, enemy.gridY, [herb], {
            sourceLabel: `${enemy.name} 전리품`,
            kind: 'corpse',
        }));
    }

    private spawnEnemyAutoLoot(enemy: Enemy, playerId: string, now: number): AutoLootGrantMessage | undefined {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (!herb) return undefined;

        const id = `loot_${this.nextLootId++}`;
        const loot = new LootObject(id, enemy.gridX, enemy.gridY, [herb], {
            sourceLabel: `${enemy.name} 전리품`,
            kind: 'corpse',
        });
        this.loot.set(id, loot);
        this.autoLootPending.set(id, { playerId, createdAt: now });
        return {
            type: 'AUTO_LOOT_GRANT',
            lootId: id,
            sourceName: enemy.name,
            gridSnapshot: gridToSnapshot(loot.inventory),
        };
    }

    private findNearbyWalkableTile(tile: TilePoint, actorId: string): TilePoint {
        if (this.isFieldPassable({ ...tile, actorId, intent: 'move' })) return tile;
        for (let radius = 1; radius <= 8; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const candidate = { x: tile.x + dx, y: tile.y + dy };
                    if (this.isFieldPassable({ ...candidate, actorId, intent: 'move' })) return candidate;
                }
            }
        }
        return tile;
    }

    private getOriginExitTile(originHubId: string): TilePoint {
        const town = this.getTownById(originHubId) ?? this.getTownById('central_castle') ?? this.worldMap.getTowns()[0];
        return this.worldMap.getTownExitTile(town);
    }

    private getTownById(townId: string): TownInfo | null {
        return this.worldMap.getTowns().find((town) => town.id === townId) ?? null;
    }

    private firstActorTile(player: ServerPlayer): TilePoint | null {
        const actor = player.actorIds.map((id) => this.actors.get(id)).find(Boolean);
        return actor ? { ...actor.tile } : null;
    }

    private findResumablePlayer(resumeToken: string, now: number): ServerPlayer | null {
        const player = [...this.players.values()].find((candidate) => candidate.resumeToken === resumeToken);
        if (!player || !player.active || !player.ghost || player.disconnectedAt === null) return null;
        if (now - player.disconnectedAt >= this.ghostGraceMs) {
            this.log(`despawn player=${player.id} reason=resume_expired`);
            this.removePlayer(player.id);
            return null;
        }
        return player;
    }

    private log(message: string): void {
        this.logger(message);
    }

    private consumeTickDelta(now: number): number {
        if (this.lastTickAt === null) {
            this.lastTickAt = now;
            return WORLD_TICK_MS / 1000;
        }
        const dt = Math.max(0, Math.min(0.5, (now - this.lastTickAt) / 1000));
        this.lastTickAt = now;
        return dt;
    }

    private toActorSnapshot(actor: ServerActor): ActorSnapshot {
        const player = this.players.get(actor.ownerPlayerId);
        return {
            id: actor.id,
            ownerPlayerId: actor.ownerPlayerId,
            localActorId: actor.localActorId,
            name: actor.name,
            classLineId: actor.classLineId,
            level: actor.level,
            tile: { ...actor.tile },
            stats: cloneStats(actor.stats),
            statuses: cloneStatuses(actor.statuses),
            actionGauge: actor.actionGauge,
            remainingAp: actor.remainingAp,
            majorActionUsed: actor.majorActionUsed,
            facing: actor.facing,
            isDead: actor.isDead,
            isGhost: player?.ghost ?? false,
        };
    }

    private toLootSnapshot(lootObject: LootObject): LootSnapshot {
        return {
            id: lootObject.id,
            tile: { x: lootObject.x, y: lootObject.y },
            sourceLabel: lootObject.sourceLabel,
            kind: lootObject.kind,
            opened: lootObject.opened,
            lockedByPlayerId: this.lootLocks.get(lootObject.id)?.playerId,
            gridSnapshot: gridToSnapshot(lootObject.inventory),
        };
    }

    private releaseLootLocksForPlayer(playerId: string): void {
        for (const [lootId, lock] of this.lootLocks) {
            if (lock.playerId === playerId) this.lootLocks.delete(lootId);
        }
    }

    private releaseExpiredAutoLoot(now: number): void {
        for (const [lootId, pending] of this.autoLootPending) {
            if (now - pending.createdAt <= AUTO_LOOT_RESPONSE_MS) continue;
            this.autoLootPending.delete(lootId);
            const lootObject = this.loot.get(lootId);
            if (!lootObject) continue;
            lootObject.opened = lootObject.inventory.items.length === 0;
            if (lootObject.opened) this.loot.delete(lootId);
        }
    }

    private releaseExpiredLootLocks(now: number): void {
        for (const [lootId, lock] of this.lootLocks) {
            const actor = this.players.get(lock.playerId)?.actorIds
                .map((actorId) => this.actors.get(actorId))
                .find(Boolean);
            const lootObject = this.loot.get(lootId);
            const tooFar = actor && lootObject && manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 2;
            if (now - lock.lastTouchedAt > 15_000 || tooFar || !actor || !lootObject) this.lootLocks.delete(lootId);
        }
    }
}

export function gridToSnapshot(grid: { width: number; height: number; items: Array<{ item: { id: string }; gridX: number; gridY: number; durability: number; quantity: number; acquiredInRaid?: boolean; sockets?: Array<{ id: string }> }> }): GridSnapshot {
    return {
        width: grid.width,
        height: grid.height,
        items: grid.items.map((placed) => ({
            itemId: placed.item.id,
            gridX: placed.gridX,
            gridY: placed.gridY,
            durability: placed.durability,
            quantity: placed.quantity,
            acquiredInRaid: placed.acquiredInRaid,
            sockets: placed.sockets?.map((item) => item.id),
        })),
    };
}

function reject(intentId: string, reason: string): WorldSessionMessageResult {
    return {
        replies: [{ type: 'ACTION_REJECTED', intentId, reason } satisfies ActionRejectedMessage],
        broadcasts: [],
    };
}

function cloneStats(stats: CharacterStats): CharacterStats {
    return { ...stats };
}

function cloneStatuses(statuses: StatusEffect[] | undefined): StatusEffect[] {
    return (statuses ?? []).map((status) => ({ ...status }));
}

function createToken(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function formationOffset(index: number): TilePoint {
    const offsets: TilePoint[] = [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
    ];
    return offsets[index % offsets.length] ?? { x: 0, y: 0 };
}

function getActorActionLimit(actor: ServerActor): number {
    return Math.max(1, Math.floor(actor.stats.actionLimit || 15));
}

function directionFromTo(from: TilePoint, to: TilePoint): NetFacing {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
}

function toEnemyAIUnit(enemy: Enemy): EnemyAIUnit {
    return {
        id: enemy.id,
        name: enemy.name,
        tile: { x: enemy.gridX, y: enemy.gridY },
        hp: enemy.stats.hp,
        maxHp: enemy.stats.maxHp,
        role: enemy.role,
        isBoss: enemy.isBoss,
        isAggro: enemy.isAggro,
        statusKinds: enemy.statuses.map((status) => status.kind),
    };
}

function toActorAIUnit(actor: ServerActor): EnemyAIUnit {
    return {
        id: actor.id,
        name: actor.name,
        tile: actor.tile,
        hp: actor.stats.hp,
        maxHp: actor.stats.maxHp,
        role: 'bruiser',
        statusKinds: actor.statuses.map((status) => status.kind),
    };
}

function readTilePayload(payload: unknown): TilePoint | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const tile = (record.tile ?? record.targetTile) as Record<string, unknown> | undefined;
    if (!tile || typeof tile.x !== 'number' || typeof tile.y !== 'number') return null;
    return { x: Math.floor(tile.x), y: Math.floor(tile.y) };
}

function readStringPayload(payload: unknown, key: string): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
}

function createFallbackActorSnapshot(): ActorSnapshot {
    return {
        id: 'fallback_actor',
        name: 'Adventurer',
        classLineId: 'infantry',
        level: 1,
        tile: { x: 0, y: 0 },
        stats: {
            hp: 100,
            maxHp: 100,
            mp: 30,
            maxMp: 30,
            atk: 10,
            def: 5,
            magAtk: 5,
            magDef: 3,
            spd: 5,
            mov: 3,
            hitRate: 80,
            critRate: 5,
            actionLimit: 15,
            evasion: 10,
            magHit: 80,
            magEva: 5,
            cmdRange: 6,
            atkMod: 0,
            defMod: 0,
        },
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        majorActionUsed: false,
        facing: 'down',
        isDead: false,
    };
}

function hashInt(value: number): number {
    let h = value | 0;
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return h;
}
