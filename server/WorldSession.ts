import {
    applyStatus,
    applyGuardToDamage,
    applyStatuses,
    applyStatusesToCarrier,
    cleanseNegativeStatuses,
    createStatus,
    getEffectiveStats,
    getEffectiveStatsForEnemy,
    hasStatus,
    removeActionStanceStatusesFromCarrier,
    replaceActionStanceStatuses,
    type StatusEffect,
} from '../src/combat/StatusEffects';
import { resolveSkillEffect, type SkillEffectEnemyInput, type SkillEffectResult } from '../src/combat/SkillEffectResolver';
import { CombatFormulas } from '../src/combat/CombatFormulas';
import type { CharacterStats } from '../src/data/Stats';
import { getClassLine } from '../src/data/ClassTree';
import { getSkillAttackProfile } from '../src/data/AttackPatternProfiles';
import { getItemDef, getCombatRecovery, isCombatRecoveryConsumable } from '../src/data/ItemDB';
import { getLearnedSkills, getSkill, type Skill } from '../src/data/SkillDB';
import {
    BURGOS_BOSS_MONSTER_ID,
    BURGOS_CASTLE_DUNGEON_ID,
    BURGOS_GUARD_MONSTER_ID,
    getMonsterDefinition,
    ZAMORA_FENRIS_BOSS_MONSTER_ID,
    ZAMORA_FORTRESS_DUNGEON_ID,
    ZAMORA_GUARD_MONSTER_ID,
    type MonsterId,
} from '../src/data/MonsterCatalog';
import { getStoryQuestByDungeonId } from '../src/data/StoryQuestData';
import { getStoryScenarioByDungeonId, type StoryScenarioDefinition } from '../src/data/StoryScenarioData';
import { CHUNK_TILES, nestMemberOffsets, pickNestForChunk, type FieldNest, type FieldNestState } from '../src/field/SpawnResolver';
import { Enemy } from '../src/entity/Enemy';
import { LootObject } from '../src/entity/LootObject';
import { getCarryAtbMultiplier, getPlacedItemWeight } from '../src/inventory/CarryWeight';
import { generateWorldLootNear } from '../src/loot/WorldLootGenerator';
import {
    ATTACK_AP_COST,
    DEFEND_ACTION_GAUGE_COST,
    INTERACT_AP_COST,
    FIELD_MAX_ACTION_GAUGE,
    MAGIC_ACTION_GAUGE_COST,
    MIN_FIELD_ACTION_GAUGE_COST,
    MOVE_ACTION_GAUGE_COST,
    REST_ACTION_GAUGE_COST,
    TOOL_ACTION_GAUGE_COST,
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
    buildSkillTerrainContext,
    getActorAttackTargetFailure as getSkillTargetFailure,
    getSkillCandidateEnemies,
} from '../src/field/FieldTargeting';
import {
    getTerrainMoveCost,
    isTerrainLineOfSightBlocking,
    isTerrainPassable,
} from '../src/field/TerrainRules';
import { WorldMap } from '../src/map/WorldMap';
import type { TownInfo } from '../src/map/BiomeMask';
import type { WorldRealm } from '../src/map/BiomeMask';
import {
    type ActorSnapshot,
    type ActionRejectedMessage,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type GridSnapshot,
    type InventoryConsumedMessage,
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
import type { CharacterSave, InventorySaveItem, InventorySaveSnapshot } from './AuthStore';

export const WORLD_TICK_MS = 100;
export const DISCONNECT_GRACE_MS = 30_000;
const RAID_LIMIT_SECONDS = 30 * 60;
const AUTO_LOOT_RESPONSE_MS = 5_000;
const FIELD_NEST_RESPAWN_MS = 5 * 60_000;
const FIELD_NEST_RESPAWN_SAFE_DISTANCE = 18;
const FIELD_NEST_ROAM_RADIUS_CHUNKS = 1;
const FIELD_NEST_NEARBY_ENEMY_DISTANCE = 24;
const FIELD_NEST_REFRESH_INTERVAL_MS = 1_000;

interface ServerActor {
    id: string;
    ownerPlayerId: string;
    localActorId: string;
    name: string;
    classLineId: string;
    currentTier: number;
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
    accountId?: string;
    characterId?: string;
    resumeToken: string;
    originHubId: string;
    departureTownId: string;
    elapsedSeconds: number;
    kills: number;
    carriedWeight: number;
    carriedItems: Map<string, number>;
    completedQuestIds: Set<string>;
    enteredDungeonIds: Set<string>;
    completedDungeonIds: Set<string>;
    activeDungeonId: string | null;
    active: boolean;
    ghost: boolean;
    disconnectedAt: number | null;
    actorIds: string[];
    saveSnapshot?: CharacterSave;
}

interface ServerEnemy {
    enemy: Enemy;
    monsterId?: MonsterId;
    nestKey?: string;
    scenarioPlayerId?: string;
    scenarioDungeonId?: string;
    scenarioObjective?: boolean;
    home: TilePoint;
    wanderSeed: number;
}

interface ServerScenarioState {
    playerId: string;
    dungeonId: string;
    enemyIds: string[];
    objectiveEnemyId: string | null;
    completed: boolean;
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
    realm?: WorldRealm;
    ghostGraceMs?: number;
    logger?: (message: string) => void;
}

export interface WorldJoinContext {
    accountId?: string;
    characterId?: string;
    completedQuestIds?: string[];
    shardId?: string;
    saveSnapshot?: CharacterSave;
}

export type WorldCharacterSavePatch = Partial<Omit<CharacterSave, 'characterId' | 'revision' | 'updatedAt'>>;

export class WorldResumeFailedError extends Error {
    public constructor(message = 'Resume token is expired or unknown.') {
        super(message);
    }
}

export class WorldSession {
    public readonly sessionEpoch = Date.now();
    private readonly worldMap: WorldMap;
    private readonly shardId: string;
    private readonly players = new Map<string, ServerPlayer>();
    private readonly actors = new Map<string, ServerActor>();
    private readonly enemies = new Map<string, ServerEnemy>();
    private readonly nestStates = new Map<string, FieldNestState>();
    private readonly scenarioStates = new Map<string, ServerScenarioState>();
    private readonly loot = new Map<string, LootObject>();
    private readonly lootLocks = new Map<string, LootLock>();
    private readonly autoLootPending = new Map<string, AutoLootPending>();
    private readonly generatedLootChunks = new Set<string>();
    private readonly saveDirtyPlayerIds = new Set<string>();
    private readonly finalSavePatches = new Map<string, WorldCharacterSavePatch>();
    private readonly restingRecoveryTimers = new Map<string, number>();
    private seq = 0;
    private nextPlayerId = 1;
    private nextEnemyId = 1;
    private nextLootId = 1;
    private lastTickAt: number | null = null;
    private lastNestRefreshAt = 0;
    private readonly ghostGraceMs: number;
    private readonly logger: (message: string) => void;

    constructor(options: WorldSessionOptions = {}) {
        this.worldMap = new WorldMap(options.realm ?? 'mortal');
        this.shardId = `${this.worldMap.getRealm()}`;
        this.ghostGraceMs = options.ghostGraceMs ?? DISCONNECT_GRACE_MS;
        this.logger = options.logger ?? (() => undefined);
    }

    public join(message: WorldJoinMessage, now: number = Date.now(), context: WorldJoinContext = {}): { playerId: string; welcome: WorldWelcomeMessage } {
        const resumed = message.resumeToken ? this.findResumablePlayer(message.resumeToken, now) : null;
        if (resumed) {
            resumed.ghost = false;
            resumed.disconnectedAt = null;
            resumed.saveSnapshot ??= cloneCharacterSave(context.saveSnapshot);
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
                    accountId: context.accountId,
                    shardId: context.shardId ?? this.shardId,
                    realm: this.worldMap.getRealm(),
                    completedQuestIds: [...resumed.completedQuestIds],
                },
            };
        }
        if (message.resumeToken) {
            this.log('resume denied reason=expired_or_unknown');
            throw new WorldResumeFailedError();
        }

        const playerId = `player_${this.nextPlayerId++}`;
        const resumeToken = createToken('resume');
        const originHubId = this.getTownById(message.originHubId)?.id ?? 'central_castle';
        const spawnTile = this.getOriginExitTile(originHubId);
        const player: ServerPlayer = {
            id: playerId,
            accountId: context.accountId,
            characterId: context.characterId,
            resumeToken,
            originHubId,
            departureTownId: originHubId,
            elapsedSeconds: 0,
            kills: 0,
            carriedWeight: sanitizeCarriedWeight(message.carriedWeight),
            carriedItems: sanitizeCarriedItems(message.carriedItems),
            completedQuestIds: new Set(sanitizeStringArray(context.completedQuestIds ?? message.completedQuestIds)),
            enteredDungeonIds: new Set(),
            completedDungeonIds: new Set(),
            activeDungeonId: null,
            active: true,
            ghost: false,
            disconnectedAt: null,
            actorIds: [],
            saveSnapshot: cloneCharacterSave(context.saveSnapshot),
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
                currentTier: sanitizeTier(snapshot.currentTier),
                level: snapshot.level,
                tile,
                stats: syncStatsMovementToClass(snapshot.stats, snapshot.classLineId),
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

        this.ensureContentNear(spawnTile, player.departureTownId, now);
        this.log(`join player=${playerId} origin=${originHubId} actors=${player.actorIds.length}`);
        return {
            playerId,
            welcome: {
                type: 'WORLD_WELCOME',
                playerId,
                sessionEpoch: this.sessionEpoch,
                resumeToken,
                spawnTile,
                accountId: context.accountId,
                shardId: context.shardId ?? this.shardId,
                realm: this.worldMap.getRealm(),
                completedQuestIds: [...player.completedQuestIds],
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
                realm: this.worldMap.getRealm(),
                completedQuestIds: [...player.completedQuestIds],
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
            case 'SCENARIO_ENTER':
                return this.handleScenarioEnter(playerId, message, now);
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
                this.captureFinalSavePatch(player);
                this.markSaveDirty(player.id);
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
                this.updateRestingActor(actor, dt);
                if (actor.actionGauge >= FIELD_MAX_ACTION_GAUGE && actor.remainingAp <= 0) {
                    actor.remainingAp = FIELD_MAX_ACTION_GAUGE;
                    actor.majorActionUsed = false;
                } else if (actor.actionGauge < FIELD_MAX_ACTION_GAUGE) {
                    actor.actionGauge = advanceAtb(
                        actor.actionGauge,
                        getEffectiveStats(actor.stats, actor.statuses).spd,
                        dt,
                        FIELD_ATB_SCALE * getCarryAtbMultiplier(player.carriedWeight)
                    );
                    if (actor.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
                        actor.actionGauge = FIELD_MAX_ACTION_GAUGE;
                        actor.remainingAp = FIELD_MAX_ACTION_GAUGE;
                        actor.majorActionUsed = false;
                    }
                }
            }
        }

        if (now - this.lastNestRefreshAt >= FIELD_NEST_REFRESH_INTERVAL_MS) {
            this.lastNestRefreshAt = now;
            this.refreshFieldNests(now);
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
            .filter((actor) => {
                const owner = this.players.get(actor.ownerPlayerId);
                return owner?.active && !owner.ghost;
            })
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
            .filter((actor) => !actor.isDead && !actor.isGhost && actor.remainingAp >= MIN_FIELD_ACTION_GAUGE_COST)
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
            scenario: {
                enteredDungeonIds: fallbackPlayer ? [...fallbackPlayer.enteredDungeonIds] : [],
                activeDungeonId: fallbackPlayer?.activeDungeonId ?? null,
                completedDungeonIds: fallbackPlayer ? [...fallbackPlayer.completedDungeonIds] : [],
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

    public consumeSaveDirtyPlayerIds(): string[] {
        const playerIds = [...this.saveDirtyPlayerIds];
        this.saveDirtyPlayerIds.clear();
        return playerIds;
    }

    public createCharacterSavePatch(playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        const player = this.players.get(playerId);
        return player ? this.buildCharacterSavePatch(player, hubTownId) : this.finalSavePatches.get(playerId) ?? null;
    }

    public hasFinalCharacterSavePatch(playerId: string): boolean {
        return this.finalSavePatches.has(playerId);
    }

    public consumeFinalCharacterSavePatch(playerId: string): WorldCharacterSavePatch | null {
        const patch = this.finalSavePatches.get(playerId) ?? null;
        this.finalSavePatches.delete(playerId);
        return patch;
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
        if (message.kind === 'endTurn' && actor && player?.active && actor.ownerPlayerId === player.id) {
            this.endActorTurn(actor);
            return { replies: [], broadcasts: [] };
        }
        const validationError = this.validateActorIntent(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        switch (message.kind) {
            case 'move':
                return this.handleMoveIntent(actor!, message.intentId, message.payload);
            case 'attack':
                return this.handleAttackIntent(actor!, message.intentId, message.payload, now);
            case 'interact':
                return this.handleInteractIntent(playerId, actor!, message.intentId, message.payload, now);
            case 'defend':
                return this.handleDefendIntent(actor!, message.intentId);
            case 'rest':
                return this.handleRestIntent(actor!, message.intentId);
            case 'endTurn':
                return { replies: [], broadcasts: [] };
            case 'useItem':
                return this.handleUseItemIntent(player!, actor!, message.intentId, message.payload);
            case 'castSkill':
                return this.handleCastSkillIntent(player!, actor!, message.intentId, message.payload, now);
        }
    }

    private validateActorIntent(player: ServerPlayer | undefined, actor: ServerActor | undefined): string | null {
        if (!player || !player.active) return 'Player is not in an active raid.';
        if (player.ghost) return 'Ghost players cannot act.';
        if (!actor) return 'Actor does not exist.';
        if (actor.ownerPlayerId !== player.id) return 'Actor is not owned by this player.';
        if (actor.isDead || actor.stats.hp <= 0) return 'Actor is down.';
        if (actor.remainingAp < MIN_FIELD_ACTION_GAUGE_COST) return 'Actor action gauge is not ready.';
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

        if (actor.remainingAp < MOVE_ACTION_GAUGE_COST) return reject(intentId, 'No action available for movement.');

        this.spendActorGauge(actor, MOVE_ACTION_GAUGE_COST);
        removeActionStanceStatusesFromCarrier(actor);
        if (pathResult.path.length > 0) {
            const next = pathResult.path[pathResult.path.length - 1];
            actor.facing = directionFromTo(actor.tile, next);
            actor.tile = { ...next };
        }
        this.spawnLootNear(actor.tile, this.players.get(actor.ownerPlayerId)?.departureTownId);
        this.finishActorIfSpent(actor);
        return { replies: [], broadcasts: [] };
    }

    private handleDefendIntent(actor: ServerActor, intentId: string): WorldSessionMessageResult {
        if (actor.remainingAp < DEFEND_ACTION_GAUGE_COST) return reject(intentId, 'No action available to defend.');

        this.spendActorGauge(actor, DEFEND_ACTION_GAUGE_COST);
        const guard = createStatus('guard', { durationTurns: undefined, sourceType: 'action' });
        const counterReady = createStatus('counterReady', { durationTurns: undefined, sourceType: 'action' });
        actor.statuses = replaceActionStanceStatuses(actor.statuses, [guard, counterReady]);
        this.finishActorIfSpent(actor);

        return {
            replies: [],
            broadcasts: [createActorEvent('status', actor, actor, undefined, guard)],
        };
    }

    private handleRestIntent(actor: ServerActor, intentId: string): WorldSessionMessageResult {
        if (actor.remainingAp < REST_ACTION_GAUGE_COST) return reject(intentId, 'No action available to rest.');

        this.spendActorGauge(actor, REST_ACTION_GAUGE_COST);
        const resting = createStatus('resting', { sourceType: 'action' });
        actor.statuses = replaceActionStanceStatuses(actor.statuses, [resting]);
        this.finishActorIfSpent(actor);

        return {
            replies: [],
            broadcasts: [createActorEvent('status', actor, actor, undefined, resting)],
        };
    }

    private handleAttackIntent(actor: ServerActor, intentId: string, payload: unknown, now: number): WorldSessionMessageResult {
        const targetId = readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
        if (!targetId) return reject(intentId, 'Attack payload must include targetId.');
        const target = this.enemies.get(targetId);
        if (!target || target.enemy.stats.hp <= 0) return reject(intentId, 'Target is not alive.');
        if (actor.remainingAp < ATTACK_AP_COST) return reject(intentId, 'No action available for attack.');

        const range = getClassLine(actor.classLineId)?.attackRange ?? 1;
        const targetTile = { x: target.enemy.gridX, y: target.enemy.gridY };
        if (manhattan(actor.tile, targetTile) > range) return reject(intentId, 'Target is out of range.');
        if (range > 1 && !this.hasFieldLineOfSight(actor.tile, targetTile)) return reject(intentId, 'Line of sight is blocked.');

        this.spendActorGauge(actor, ATTACK_AP_COST);
        actor.facing = directionFromTo(actor.tile, targetTile);
        const { event, autoLootGrant } = this.resolveActorAttack(actor, target, now);
        this.finishActorIfSpent(actor);
        return { replies: autoLootGrant ? [autoLootGrant] : [], broadcasts: [event] };
    }

    private handleUseItemIntent(player: ServerPlayer, actor: ServerActor, intentId: string, payload: unknown): WorldSessionMessageResult {
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

        this.spendActorGauge(actor, TOOL_ACTION_GAUGE_COST);
        actor.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.stats.hp + effectiveHp));
        actor.stats.mp = Math.max(0, Math.min(effective.maxMp, actor.stats.mp + effectiveMp));
        this.addCarriedItemQuantity(player.id, itemId, -1);
        this.removeSaveItemQuantity(player, itemId, 1);
        this.markSaveDirty(player.id);
        this.finishActorIfSpent(actor);

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

    private handleCastSkillIntent(
        player: ServerPlayer,
        actor: ServerActor,
        intentId: string,
        payload: unknown,
        now: number
    ): WorldSessionMessageResult {
        const skillId = readStringPayload(payload, 'skillId');
        if (!skillId) return reject(intentId, 'Cast skill payload must include skillId.');
        const skill = getSkill(skillId);
        if (!skill) return reject(intentId, 'Skill does not exist.');
        if (!this.getLearnedSkillIds(actor).has(skill.id)) return reject(intentId, 'Skill is not learned by this actor.');
        if (hasStatus(actor.statuses, 'silence')) return reject(intentId, 'Actor is silenced.');
        if (actor.remainingAp < MAGIC_ACTION_GAUGE_COST) return reject(intentId, 'No action available to cast skill.');
        if (actor.stats.mp < skill.mpCost) return reject(intentId, 'Actor does not have enough MP.');

        const requiresTarget = skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe';
        const targetId = readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
        const target = targetId ? this.enemies.get(targetId) : undefined;
        if (requiresTarget) {
            if (!targetId) return reject(intentId, 'Cast skill payload must include targetId.');
            if (!target || target.enemy.stats.hp <= 0) return reject(intentId, 'Target is not alive.');
        }

        const targetTile = target ? { x: target.enemy.gridX, y: target.enemy.gridY } : undefined;
        const profile = getSkillAttackProfile(skill);
        if (target && targetTile) {
            const failure = getSkillTargetFailure({
                profile,
                context: this.getSkillPatternContext(actor),
                selectedContext: this.getSkillPatternContext(actor, targetTile),
                target: targetTile,
            });
            if (failure) return reject(intentId, 'Skill target is not valid.');
        }

        const aliveEnemies = [...this.enemies.values()].filter((entry) => entry.enemy.stats.hp > 0);
        const targetEnemies = target && targetTile
            ? getSkillCandidateEnemies(aliveEnemies.map((entry) => entry.enemy), profile, this.getSkillPatternContext(actor, targetTile), target.enemy)
            : [];
        const effect = resolveSkillEffect({
            casterStats: this.getCasterSkillStats(actor),
            skill,
            targetEnemy: target ? this.toSkillEnemyInput(target.enemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => this.toSkillEnemyInput(enemy)),
            targetsResolvedByPattern: Boolean(target),
            terrainContext: buildSkillTerrainContext({
                casterTile: actor.tile,
                targetEnemies,
                targetEnemy: target?.enemy,
                getTileAt: (tile) => this.worldMap.getTileAt(tile.x, tile.y),
            }),
        });

        this.spendActorGauge(actor, MAGIC_ACTION_GAUGE_COST);
        const result = this.applySkillEffect(player, actor, skill, effect, now);
        this.finishActorIfSpent(actor);
        return result;
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
        if (actor.remainingAp < INTERACT_AP_COST) return reject(intentId, 'No action available to inspect loot.');
        if (manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 1) return reject(intentId, 'Loot is too far away.');

        const lock = this.lootLocks.get(lootId);
        if (lock && lock.playerId !== playerId) return reject(intentId, 'Loot is already occupied.');

        this.spendActorGauge(actor, INTERACT_AP_COST);
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
        this.addCarriedWeight(playerId, getPlacedItemWeight(placed));
        this.addCarriedItemQuantity(playerId, placed.item.id, placed.quantity);
        const player = this.players.get(playerId);
        if (player) {
            this.addSavePlacedItem(player, placed);
            this.markSaveDirty(playerId);
        }
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
        let acceptedWeight = 0;
        for (const cell of acceptedCells) {
            const placed = lootObject.inventory.getAt(cell.gridX, cell.gridY);
            if (!placed || removed.has(placed)) continue;
            lootObject.inventory.remove(placed);
            removed.add(placed);
            acceptedWeight += getPlacedItemWeight(placed);
            this.addCarriedItemQuantity(playerId, placed.item.id, placed.quantity);
            const player = this.players.get(playerId);
            if (player) this.addSavePlacedItem(player, placed);
        }
        this.addCarriedWeight(playerId, acceptedWeight);
        if (acceptedWeight > 0 || removed.size > 0) this.markSaveDirty(playerId);

        this.autoLootPending.delete(lootId);
        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) {
            this.loot.delete(lootId);
            this.lootLocks.delete(lootId);
        }
        return { replies: [], broadcasts: [] };
    }

    private handleScenarioEnter(
        playerId: string,
        message: Extract<WorldClientMessage, { type: 'SCENARIO_ENTER' }>,
        now: number
    ): WorldSessionMessageResult {
        const player = this.players.get(playerId);
        const actor = this.actors.get(message.actorId);
        const validationError = this.validateScenarioActor(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        const dungeonId = message.dungeonId.trim();
        const scenario = getStoryScenarioByDungeonId(dungeonId);
        const quest = getStoryQuestByDungeonId(dungeonId);
        if (!scenario || !quest) return reject(message.intentId, 'Scenario dungeon does not exist.');
        if (player!.activeDungeonId) return reject(message.intentId, 'A scenario is already active.');
        if (player!.completedDungeonIds.has(dungeonId)) return reject(message.intentId, 'Scenario objective is already complete in this raid.');
        if (quest.prerequisiteQuestId && !player!.completedQuestIds.has(quest.prerequisiteQuestId)) {
            return reject(message.intentId, 'Scenario prerequisite quest is not complete.');
        }

        const dungeon = this.worldMap.getDungeonAtTile(actor!.tile.x, actor!.tile.y);
        if (!dungeon || dungeon.id !== dungeonId) return reject(message.intentId, 'Actor is not at the requested scenario entrance.');
        if (this.hasNearbyAggroEnemy(actor!.tile, 18)) return reject(message.intentId, 'Nearby combat must be resolved before entering a scenario.');

        this.removeScenarioRuntimeForPlayer(playerId);
        player!.enteredDungeonIds.add(dungeonId);
        player!.activeDungeonId = dungeonId;

        const state = this.spawnScenarioEncounter(player!, scenario, actor!.tile, now);
        this.scenarioStates.set(playerId, state);
        if (!state.objectiveEnemyId) this.completeScenarioObjective(player!, dungeonId, { clearEnemies: false });

        this.log(`scenario enter player=${playerId} dungeon=${dungeonId} enemies=${state.enemyIds.length}`);
        return { replies: [], broadcasts: [] };
    }

    private validateScenarioActor(player: ServerPlayer | undefined, actor: ServerActor | undefined): string | null {
        if (!player || !player.active) return 'Player is not in an active raid.';
        if (player.ghost) return 'Ghost players cannot enter scenarios.';
        if (!actor) return 'Actor does not exist.';
        if (actor.ownerPlayerId !== player.id) return 'Actor is not owned by this player.';
        if (actor.isDead || actor.stats.hp <= 0) return 'Actor is down.';
        return null;
    }

    private applySkillEffect(
        player: ServerPlayer,
        actor: ServerActor,
        skill: Skill,
        effect: SkillEffectResult,
        now: number
    ): WorldSessionMessageResult {
        const broadcasts: CombatEventMessage[] = [];
        const replies: WorldServerMessage[] = [];
        this.applyActorResourceDelta(actor, effect.casterHpDelta, effect.casterMpDelta);
        if (effect.casterHpDelta > 0) {
            broadcasts.push(createActorEvent('heal', actor, actor, effect.casterHpDelta));
        } else if (effect.casterHpDelta < 0) {
            broadcasts.push(createActorEvent('damage', actor, actor, Math.abs(effect.casterHpDelta)));
        }

        if (effect.cleansesCasterStatuses) {
            actor.statuses = cleanseNegativeStatuses(actor.statuses);
            broadcasts.push(createActorEvent('status', actor, actor));
        }

        if (effect.casterStatusEffects && effect.casterStatusEffects.length > 0) {
            const targets = skill.targetScope === 'selfAndNearbyAllies'
                ? this.getAlliedActorsWithin(player, actor, skill.allyRadius ?? 0)
                : [actor];
            for (const target of targets) {
                applyStatusesToCarrier(target, effect.casterStatusEffects);
                broadcasts.push(createActorEvent('status', actor, target, undefined, effect.casterStatusEffects[0]));
            }
        }

        for (const enemyResult of effect.enemyResults) {
            const target = this.enemies.get(enemyResult.enemyId);
            if (!target) continue;
            const enemy = target.enemy;

            if (enemyResult.isMiss) {
                broadcasts.push(createEnemyEvent('miss', actor, enemy, 0));
                continue;
            }

            if (enemyResult.statusEffects && enemyResult.statusEffects.length > 0) {
                enemy.statuses = applyStatuses(enemy.statuses, enemyResult.statusEffects);
                broadcasts.push(createEnemyEvent('status', actor, enemy, undefined, enemyResult.statusEffects[0]));
            }

            if (enemyResult.mpDamage !== undefined && enemyResult.mpDamage > 0) {
                const drainedMp = Math.min(enemy.stats.mp, enemyResult.mpDamage);
                enemy.stats.mp = Math.max(0, enemy.stats.mp - drainedMp);
                this.applyActorResourceDelta(actor, 0, drainedMp);
                if (drainedMp > 0) broadcasts.push(createEnemyEvent('status', actor, enemy, drainedMp));
            }

            const guarded = applyGuardToDamage(enemy.statuses, enemyResult.damage);
            enemy.statuses = guarded.statuses;
            const dead = enemy.takeDamage(guarded.damage);
            if (enemyResult.casterHpRestore !== undefined && enemyResult.casterHpRestore > 0) {
                this.applyActorResourceDelta(actor, enemyResult.casterHpRestore, 0);
                broadcasts.push(createActorEvent('heal', actor, actor, enemyResult.casterHpRestore));
            }
            if (enemyResult.casterMpRestore !== undefined && enemyResult.casterMpRestore > 0) {
                this.applyActorResourceDelta(actor, 0, enemyResult.casterMpRestore);
                broadcasts.push(createActorEvent('status', actor, actor, enemyResult.casterMpRestore));
            }
            if (dead) {
                broadcasts.push(createEnemyEvent('kill', actor, enemy, guarded.damage));
                const autoLootGrant = this.completeEnemyKill(actor, target, now);
                if (autoLootGrant) replies.push(autoLootGrant);
            } else if (guarded.damage > 0 || (!enemyResult.statusEffects && enemyResult.mpDamage === undefined)) {
                broadcasts.push(createEnemyEvent('damage', actor, enemy, guarded.damage));
            }
        }

        if (broadcasts.length === 0 && skill.type === 'buff') broadcasts.push(createActorEvent('status', actor, actor));
        return { replies, broadcasts };
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
            const guarded = applyGuardToDamage(enemy.statuses, result.damage);
            enemy.statuses = guarded.statuses;
            enemy.takeDamage(guarded.damage);
            event.value = guarded.damage;
            if (enemy.stats.hp <= 0) {
                event.kind = 'kill';
                autoLootGrant = this.completeEnemyKill(actor, target, now);
            }
        }
        return { event, autoLootGrant };
    }

    private completeEnemyKill(actor: ServerActor, target: ServerEnemy, now: number): AutoLootGrantMessage | undefined {
        const enemy = target.enemy;
        this.enemies.delete(enemy.id);
        if (target.nestKey) this.markNestEnemyKilled(target.nestKey, enemy.id, now);
        if (target.scenarioPlayerId && target.scenarioDungeonId) this.markScenarioEnemyKilled(target, enemy.id);
        const player = this.players.get(actor.ownerPlayerId);
        if (player) player.kills += 1;
        const autoLootGrant = enemy.isBoss
            ? undefined
            : this.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
        if (enemy.isBoss || !autoLootGrant) this.spawnEnemyLoot(enemy);
        return autoLootGrant;
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
        let dealtDamage = result.damage;
        if (!result.isMiss) {
            const guarded = applyGuardToDamage(actor.statuses, result.damage);
            actor.statuses = guarded.statuses;
            dealtDamage = guarded.damage;
            actor.stats.hp = Math.max(0, actor.stats.hp - dealtDamage);
            if (dealtDamage > 0) removeActionStanceStatusesFromCarrier(actor);
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
            value: dealtDamage,
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
            completedDungeonIds: player ? [...player.completedDungeonIds] : [],
        };
        this.log(`raid result player=${playerId} result=${result} kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        if (player) {
            this.captureFinalSavePatch(player, extractionTownId);
            this.markSaveDirty(playerId);
        }
        this.removePlayer(playerId);
        return message;
    }

    private removePlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;
        this.removeScenarioRuntimeForPlayer(playerId);
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

    private getSkillPatternContext(actor: ServerActor, selectedTile?: TilePoint) {
        const bounds = this.worldMap.getBoundsTiles();
        return {
            casterTile: actor.tile,
            selectedTile,
            isInsideMap: (tile: TilePoint) => tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height,
            isBlockingTile: (tile: TilePoint) => isTerrainLineOfSightBlocking(this.worldMap.getTileAt(tile.x, tile.y)),
            hasLineOfSight: (from: TilePoint, to: TilePoint) => this.hasFieldLineOfSight(from, to),
        };
    }

    private finishActorIfSpent(actor: ServerActor): void {
        if (actor.remainingAp >= MIN_FIELD_ACTION_GAUGE_COST) return;
        this.endActorTurn(actor);
    }

    private endActorTurn(actor: ServerActor): void {
        actor.actionGauge = Math.max(0, Math.min(FIELD_MAX_ACTION_GAUGE, actor.remainingAp));
        actor.remainingAp = 0;
        actor.majorActionUsed = false;
    }

    private spendActorGauge(actor: ServerActor, cost: number): void {
        actor.remainingAp = Math.max(0, actor.remainingAp - cost);
        actor.actionGauge = actor.remainingAp;
    }

    private spawnScenarioEncounter(
        player: ServerPlayer,
        scenario: StoryScenarioDefinition,
        anchor: TilePoint,
        now: number
    ): ServerScenarioState {
        const state: ServerScenarioState = {
            playerId: player.id,
            dungeonId: scenario.dungeonId,
            enemyIds: [],
            objectiveEnemyId: null,
            completed: false,
        };
        const layout = getStoryScenarioMonsterLayout(scenario);
        const guardOffsets = storyScenarioGuardOffsets(scenario.guardCount, Boolean(scenario.bossName));

        for (let index = 0; index < scenario.guardCount; index++) {
            const monsterId = layout.guardMonsterIds[index % layout.guardMonsterIds.length];
            const definition = getMonsterDefinition(monsterId);
            const offset = guardOffsets[index] ?? { x: index % 2 === 0 ? 2 : -2, y: Math.floor(index / 2) + 1 };
            this.spawnScenarioEnemy({
                state,
                monsterId,
                name: definition.name,
                level: Math.max(scenario.guardLevel, definition.level),
                color: definition.color,
                role: definition.role,
                tile: { x: anchor.x + offset.x, y: anchor.y + offset.y },
                isObjective: false,
                now,
            });
        }

        if (scenario.bossName) {
            const monsterId = layout.bossMonsterId;
            const definition = monsterId ? getMonsterDefinition(monsterId) : null;
            const objectiveEnemyId = this.spawnScenarioEnemy({
                state,
                monsterId,
                name: scenario.bossName,
                level: scenario.bossLevel,
                color: scenario.bossColor,
                role: 'boss',
                tile: { x: anchor.x + 4, y: anchor.y },
                isObjective: true,
                now,
                aggroRange: Math.max(definition?.aggroRange ?? 0, 9),
            });
            state.objectiveEnemyId = objectiveEnemyId;
        }

        return state;
    }

    private spawnScenarioEnemy(input: {
        state: ServerScenarioState;
        monsterId?: MonsterId;
        name: string;
        level: number;
        color: string;
        role: Enemy['role'];
        tile: TilePoint;
        isObjective: boolean;
        now: number;
        aggroRange?: number;
    }): string {
        const id = `scenario_${this.nextEnemyId++}`;
        const tile = this.findNearbyWalkableTile(input.tile, id);
        const definition = input.monsterId ? getMonsterDefinition(input.monsterId) : null;
        const enemy = new Enemy(id, tile.x, tile.y, input.name, input.level, input.color, input.role);
        enemy.aggroRange = input.aggroRange ?? definition?.aggroRange ?? enemy.aggroRange;
        enemy.isAggro = true;
        this.enemies.set(id, {
            enemy,
            monsterId: input.monsterId,
            scenarioPlayerId: input.state.playerId,
            scenarioDungeonId: input.state.dungeonId,
            scenarioObjective: input.isObjective,
            home: tile,
            wanderSeed: hashInt(input.now + this.nextEnemyId * 7919),
        });
        input.state.enemyIds.push(id);
        return id;
    }

    private markScenarioEnemyKilled(target: ServerEnemy, enemyId: string): void {
        const playerId = target.scenarioPlayerId;
        const dungeonId = target.scenarioDungeonId;
        if (!playerId || !dungeonId) return;

        const state = this.scenarioStates.get(playerId);
        if (state && state.dungeonId === dungeonId) {
            state.enemyIds = state.enemyIds.filter((id) => id !== enemyId);
        }

        if (!target.scenarioObjective) return;
        const player = this.players.get(playerId);
        if (!player) return;
        this.completeScenarioObjective(player, dungeonId, { clearEnemies: true });
    }

    private completeScenarioObjective(
        player: ServerPlayer,
        dungeonId: string,
        options: { clearEnemies?: boolean }
    ): void {
        if (player.activeDungeonId === dungeonId) player.activeDungeonId = null;
        player.completedDungeonIds.add(dungeonId);
        const quest = getStoryQuestByDungeonId(dungeonId);
        if (quest) player.completedQuestIds.add(quest.id);
        this.markSaveDirty(player.id);

        const state = this.scenarioStates.get(player.id);
        if (state && state.dungeonId === dungeonId) {
            state.completed = true;
            if (options.clearEnemies ?? true) this.removeScenarioRuntimeForPlayer(player.id);
        }
        this.log(`scenario complete player=${player.id} dungeon=${dungeonId}`);
    }

    private removeScenarioRuntimeForPlayer(playerId: string): void {
        const state = this.scenarioStates.get(playerId);
        if (!state) return;
        for (const enemyId of state.enemyIds) this.enemies.delete(enemyId);
        this.scenarioStates.delete(playerId);
    }

    private ensureContentNear(spawnTile: TilePoint, departureTownId: string | null | undefined, now: number): void {
        if (!this.hasNearbyLiveEnemy(spawnTile, FIELD_NEST_NEARBY_ENEMY_DISTANCE)) {
            this.spawnEnemiesNear(spawnTile, now, true);
        }

        this.spawnLootNear(spawnTile, departureTownId);
    }

    private refreshFieldNests(now: number): void {
        const visited = new Set<string>();
        for (const player of this.players.values()) {
            if (!player.active || player.ghost) continue;
            const anchor = this.firstLivingActorTile(player);
            if (!anchor) continue;
            const forceCenter = !this.hasNearbyLiveEnemy(anchor, FIELD_NEST_NEARBY_ENEMY_DISTANCE);
            this.spawnEnemiesNear(anchor, now, forceCenter, visited);
        }
    }

    private spawnEnemiesNear(anchor: TilePoint, now: number, forceCenter: boolean, visited: Set<string> = new Set()): void {
        const realm = this.worldMap.getRealm();
        const seed = `server:${this.sessionEpoch}`;
        const centerChunkX = Math.floor(anchor.x / CHUNK_TILES);
        const centerChunkY = Math.floor(anchor.y / CHUNK_TILES);

        let spawned = 0;
        for (let dy = -FIELD_NEST_ROAM_RADIUS_CHUNKS; dy <= FIELD_NEST_ROAM_RADIUS_CHUNKS; dy++) {
            for (let dx = -FIELD_NEST_ROAM_RADIUS_CHUNKS; dx <= FIELD_NEST_ROAM_RADIUS_CHUNKS; dx++) {
                const chunkX = centerChunkX + dx;
                const chunkY = centerChunkY + dy;
                const stateKey = nestStateKey(realm, chunkX, chunkY);
                if (visited.has(stateKey)) continue;
                visited.add(stateKey);
                const biome = this.worldMap.getBiomeAtChunk(chunkX, chunkY);
                const force = forceCenter && dx === 0 && dy === 0;
                spawned += this.spawnNest(chunkX, chunkY, biome, realm, seed, force, now);
            }
        }

        // Player boxed in by water/town chunks — force one grass pack at the spawn chunk.
        if (forceCenter && spawned === 0) this.spawnNest(centerChunkX, centerChunkY, 'grass', realm, seed, true, now);
    }

    private spawnNest(
        chunkX: number,
        chunkY: number,
        biome: ReturnType<WorldMap['getBiomeAtChunk']>,
        realm: ReturnType<WorldMap['getRealm']>,
        seed: string,
        force: boolean,
        now: number,
    ): number {
        const nest = pickNestForChunk({ realm, chunkX, chunkY, biome, seed }, force);
        if (!nest) return 0;
        const stateKey = nestStateKey(realm, chunkX, chunkY);
        const state = this.getOrCreateNestState(stateKey, nest);
        this.retainLiveNestEnemies(state);
        if (state.monsterIds.length > 0) return 0;
        if (state.cleared) {
            if (now < state.respawnAt) return 0;
            if (this.hasActiveActorWithin(state.centerTile, FIELD_NEST_RESPAWN_SAFE_DISTANCE)) return 0;
        }

        const offsets = nestMemberOffsets(nest.monsters.length);
        const spawnedEnemyIds: string[] = [];
        nest.monsters.forEach((monster, index) => {
            const offset = offsets[index] ?? { x: 0, y: 0 };
            const id = `enemy_${this.nextEnemyId++}`;
            const tile = this.findNearbyWalkableTile(
                { x: nest.centerTile.x + offset.x, y: nest.centerTile.y + offset.y },
                id,
            );
            const definition = getMonsterDefinition(monster.monsterId);
            const enemy = new Enemy(id, tile.x, tile.y, definition.name, monster.level, definition.color, definition.role);
            enemy.aggroRange = definition.aggroRange;
            this.enemies.set(id, { enemy, monsterId: monster.monsterId, nestKey: stateKey, home: tile, wanderSeed: this.nextEnemyId * 7919 });
            spawnedEnemyIds.push(id);
        });
        state.monsterIds = spawnedEnemyIds;
        state.cleared = false;
        state.respawnAt = 0;
        return spawnedEnemyIds.length;
    }

    private getOrCreateNestState(stateKey: string, nest: FieldNest): FieldNestState {
        let state = this.nestStates.get(stateKey);
        if (!state) {
            state = {
                chunkKey: stateKey,
                nestId: nest.nestId,
                centerTile: { ...nest.centerTile },
                monsterIds: [],
                respawnAt: 0,
                cleared: false,
            };
            this.nestStates.set(stateKey, state);
        }
        return state;
    }

    private retainLiveNestEnemies(state: FieldNestState): void {
        state.monsterIds = state.monsterIds.filter((enemyId) => {
            const entry = this.enemies.get(enemyId);
            return Boolean(entry && entry.enemy.stats.hp > 0);
        });
    }

    private markNestEnemyKilled(nestKey: string, enemyId: string, now: number): void {
        const state = this.nestStates.get(nestKey);
        if (!state) return;
        state.monsterIds = state.monsterIds.filter((id) => id !== enemyId);
        if (state.monsterIds.length > 0) return;
        state.cleared = true;
        state.respawnAt = now + FIELD_NEST_RESPAWN_MS;
    }

    private hasNearbyLiveEnemy(tile: TilePoint, distance: number): boolean {
        return [...this.enemies.values()].some((entry) =>
            entry.enemy.stats.hp > 0 && manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, tile) <= distance
        );
    }

    private hasNearbyAggroEnemy(tile: TilePoint, distance: number): boolean {
        return [...this.enemies.values()].some((entry) =>
            entry.enemy.stats.hp > 0
            && entry.enemy.isAggro
            && manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, tile) <= distance
        );
    }

    private hasActiveActorWithin(tile: TilePoint, distance: number): boolean {
        return [...this.players.values()].some((player) => {
            if (!player.active || player.ghost) return false;
            return player.actorIds.some((actorId) => {
                const actor = this.actors.get(actorId);
                return Boolean(actor && !actor.isDead && actor.stats.hp > 0 && manhattan(actor.tile, tile) <= distance);
            });
        });
    }

    private spawnLootNear(anchor: TilePoint, departureTownId?: string | null): void {
        const loot = generateWorldLootNear({
            worldMap: this.worldMap,
            playerTile: anchor,
            seed: `server:${this.sessionEpoch}`,
            generatedChunks: this.generatedLootChunks,
            existingLoot: [...this.loot.values()],
            departureTownId,
            findNearbyWalkableTile: (tile, actorId) => this.findNearbyWalkableTile(tile, actorId),
            createId: (containerType) => `loot_${containerType}_${this.nextLootId++}`,
        });
        for (const lootObject of loot) {
            this.loot.set(lootObject.id, lootObject);
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

    private firstLivingActorTile(player: ServerPlayer): TilePoint | null {
        const actor = player.actorIds
            .map((id) => this.actors.get(id))
            .find((entry) => entry && !entry.isDead && entry.stats.hp > 0);
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

    private addCarriedWeight(playerId: string, weight: number): void {
        const player = this.players.get(playerId);
        if (!player || weight <= 0) return;
        player.carriedWeight = sanitizeCarriedWeight(player.carriedWeight + weight);
    }

    private addCarriedItemQuantity(playerId: string, itemId: string, quantity: number): void {
        const player = this.players.get(playerId);
        if (!player || !itemId || !Number.isFinite(quantity) || quantity === 0) return;
        const next = Math.max(0, (player.carriedItems.get(itemId) ?? 0) + Math.floor(quantity));
        if (next > 0) player.carriedItems.set(itemId, next);
        else player.carriedItems.delete(itemId);
    }

    private markSaveDirty(playerId: string): void {
        this.saveDirtyPlayerIds.add(playerId);
    }

    private captureFinalSavePatch(player: ServerPlayer, hubTownId?: string): void {
        const patch = this.buildCharacterSavePatch(player, hubTownId);
        if (patch) this.finalSavePatches.set(player.id, patch);
    }

    private buildCharacterSavePatch(player: ServerPlayer, hubTownId?: string): WorldCharacterSavePatch | null {
        const save = player.saveSnapshot;
        if (!save) return null;
        save.questState = {
            ...save.questState,
            completedQuestIds: [...player.completedQuestIds],
        };
        if (hubTownId) {
            save.hubLocation = {
                ...save.hubLocation,
                townId: hubTownId,
            };
        }
        return {
            saveVersion: save.saveVersion,
            hubLocation: cloneRecord(save.hubLocation),
            questState: cloneRecord(save.questState),
            inventory: cloneInventorySnapshot(save.inventory),
            equipment: cloneRecord(save.equipment),
            partySnapshot: cloneRecord(save.partySnapshot),
            rosterSnapshot: cloneRecord(save.rosterSnapshot),
        };
    }

    private removeSaveItemQuantity(player: ServerPlayer, itemId: string, quantity: number): void {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory || quantity <= 0) return;
        let remaining = Math.floor(quantity);
        for (const item of [...inventory.items]) {
            if (item.itemId !== itemId || remaining <= 0) continue;
            const consumed = Math.min(Math.max(1, item.quantity), remaining);
            item.quantity -= consumed;
            remaining -= consumed;
            if (item.quantity <= 0) {
                inventory.items = inventory.items.filter((entry) => entry !== item);
            }
        }
    }

    private addSavePlacedItem(player: ServerPlayer, placed: { item: { id: string; maxDurability: number }; durability: number; quantity: number; sockets?: Array<{ id: string }> }): void {
        const inventory = player.saveSnapshot?.inventory;
        if (!inventory || placed.quantity <= 0) return;
        const slot = findFreeInventorySlot(inventory, placed.item.id);
        if (!slot) return;
        const item: InventorySaveItem = {
            itemId: placed.item.id,
            gridX: slot.x,
            gridY: slot.y,
            durability: Number.isFinite(placed.durability) ? placed.durability : placed.item.maxDurability,
            quantity: Math.max(1, Math.floor(placed.quantity)),
            acquiredInRaid: true,
        };
        inventory.items.push(item);
    }

    private getLearnedSkillIds(actor: ServerActor): Set<string> {
        const classLine = getClassLine(actor.classLineId);
        const unlocked: string[] = [];
        if (classLine) {
            for (let tier = 1; tier <= actor.currentTier; tier++) {
                const ids = classLine.skillUnlocks[tier];
                if (ids) unlocked.push(...ids);
            }
        }
        return new Set(getLearnedSkills(actor.classLineId, actor.currentTier, unlocked).map((skill) => skill.id));
    }

    private getCasterSkillStats(actor: ServerActor): CharacterStats {
        const effective = getEffectiveStats(actor.stats, actor.statuses);
        return {
            ...effective,
            hp: actor.stats.hp,
            mp: actor.stats.mp,
        };
    }

    private toSkillEnemyInput(enemy: Enemy): SkillEffectEnemyInput {
        return {
            id: enemy.id,
            name: enemy.name,
            gridX: enemy.gridX,
            gridY: enemy.gridY,
            stats: getEffectiveStatsForEnemy(enemy),
        };
    }

    private applyActorResourceDelta(actor: ServerActor, hpDelta: number, mpDelta: number): void {
        const effective = getEffectiveStats(actor.stats, actor.statuses);
        actor.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.stats.hp + hpDelta));
        actor.stats.mp = Math.max(0, Math.min(effective.maxMp, actor.stats.mp + mpDelta));
        actor.isDead = actor.stats.hp <= 0;
    }

    private updateRestingActor(actor: ServerActor, dt: number): void {
        if (!hasStatus(actor.statuses, 'resting')) {
            this.restingRecoveryTimers.delete(actor.id);
            return;
        }

        const effective = getEffectiveStats(actor.stats, actor.statuses);
        if (actor.stats.hp >= effective.maxHp && actor.stats.mp >= effective.maxMp) return;

        let timer = (this.restingRecoveryTimers.get(actor.id) ?? 0) + dt;
        const ticks = Math.floor(timer);
        if (ticks <= 0) {
            this.restingRecoveryTimers.set(actor.id, timer);
            return;
        }

        timer -= ticks;
        this.restingRecoveryTimers.set(actor.id, timer);
        const hpPerTick = Math.max(2, Math.floor(effective.maxHp * 0.03));
        const mpPerTick = effective.maxMp > 0 ? Math.max(1, Math.floor(effective.maxMp * 0.03)) : 0;
        actor.stats.hp = Math.min(effective.maxHp, actor.stats.hp + hpPerTick * ticks);
        actor.stats.mp = Math.min(effective.maxMp, actor.stats.mp + mpPerTick * ticks);
    }

    private getAlliedActorsWithin(player: ServerPlayer, caster: ServerActor, radius: number): ServerActor[] {
        return player.actorIds
            .map((actorId) => this.actors.get(actorId))
            .filter((actor): actor is ServerActor => {
                if (!actor) return false;
                return !actor.isDead
                && actor.stats.hp > 0
                && manhattan(caster.tile, actor.tile) <= radius;
            });
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
            currentTier: actor.currentTier,
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
            containerType: lootObject.containerType,
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

function cloneCharacterSave(save: CharacterSave | undefined): CharacterSave | undefined {
    if (!save) return undefined;
    return {
        ...save,
        hubLocation: cloneRecord(save.hubLocation),
        questState: cloneRecord(save.questState),
        inventory: cloneInventorySnapshot(save.inventory),
        equipment: cloneRecord(save.equipment),
        partySnapshot: cloneRecord(save.partySnapshot),
        rosterSnapshot: cloneRecord(save.rosterSnapshot),
    };
}

function cloneInventorySnapshot(inventory: InventorySaveSnapshot): InventorySaveSnapshot {
    return {
        width: inventory.width,
        height: inventory.height,
        items: inventory.items.map((item) => ({ ...item })),
    };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function findFreeInventorySlot(inventory: InventorySaveSnapshot, itemId: string): TilePoint | null {
    const item = getItemDef(itemId);
    if (!item) return null;
    for (let y = 0; y <= inventory.height - item.gridH; y++) {
        for (let x = 0; x <= inventory.width - item.gridW; x++) {
            if (canPlaceSavedItem(inventory, x, y, item.gridW, item.gridH)) return { x, y };
        }
    }
    return null;
}

function canPlaceSavedItem(inventory: InventorySaveSnapshot, x: number, y: number, width: number, height: number): boolean {
    for (const placed of inventory.items) {
        const item = getItemDef(placed.itemId);
        const itemWidth = item?.gridW ?? 1;
        const itemHeight = item?.gridH ?? 1;
        const overlaps = x < placed.gridX + itemWidth
            && x + width > placed.gridX
            && y < placed.gridY + itemHeight
            && y + height > placed.gridY;
        if (overlaps) return false;
    }
    return true;
}

function reject(intentId: string, reason: string): WorldSessionMessageResult {
    return {
        replies: [{ type: 'ACTION_REJECTED', intentId, reason } satisfies ActionRejectedMessage],
        broadcasts: [],
    };
}

function createActorEvent(
    kind: string,
    source: ServerActor,
    target: ServerActor,
    value?: number,
    statusEffect?: StatusEffect
): CombatEventMessage {
    return {
        type: 'COMBAT_EVENT',
        kind,
        sourceId: source.id,
        targetId: target.id,
        sourceName: source.name,
        targetName: target.name,
        value,
        statusEffect,
    };
}

function createEnemyEvent(
    kind: string,
    source: ServerActor,
    target: Enemy,
    value?: number,
    statusEffect?: StatusEffect
): CombatEventMessage {
    return {
        type: 'COMBAT_EVENT',
        kind,
        sourceId: source.id,
        targetId: target.id,
        sourceName: source.name,
        targetName: target.name,
        value,
        statusEffect,
    };
}

function cloneStats(stats: CharacterStats): CharacterStats {
    return { ...stats };
}

function syncStatsMovementToClass(stats: CharacterStats, classLineId: string): CharacterStats {
    const synced = cloneStats(stats);
    const baseMovRange = getClassLine(classLineId)?.baseMovRange;
    if (baseMovRange !== undefined) synced.mov = baseMovRange;
    return synced;
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

function nestStateKey(realm: ReturnType<WorldMap['getRealm']>, chunkX: number, chunkY: number): string {
    return `${realm}:${chunkX}:${chunkY}`;
}

interface StoryScenarioMonsterLayout {
    bossMonsterId?: MonsterId;
    guardMonsterIds: MonsterId[];
}

const STORY_SCENARIO_MONSTER_LAYOUTS = {
    [BURGOS_CASTLE_DUNGEON_ID]: { bossMonsterId: BURGOS_BOSS_MONSTER_ID, guardMonsterIds: [BURGOS_GUARD_MONSTER_ID] },
    [ZAMORA_FORTRESS_DUNGEON_ID]: { bossMonsterId: ZAMORA_FENRIS_BOSS_MONSTER_ID, guardMonsterIds: [ZAMORA_GUARD_MONSTER_ID] },
    etna_volcano: { bossMonsterId: '466R', guardMonsterIds: ['215R', '224R', '225R'] },
    arcadia_plain: { bossMonsterId: '458R', guardMonsterIds: ['313R', '314R', '458R'] },
    cacaora_highland: { bossMonsterId: '315R', guardMonsterIds: ['317R', '453R', '463R'] },
    remote_village: { bossMonsterId: '311R', guardMonsterIds: ['303R', '313R', '458R'] },
    sagrajas_temple: { bossMonsterId: '467R', guardMonsterIds: ['307R', '353R', '467R'] },
    sagunto_port: { bossMonsterId: '634R', guardMonsterIds: ['635R', '637R', '639R'] },
    sicilio_island: { bossMonsterId: '634R', guardMonsterIds: ['634R', '635R', '463R'] },
    dalai_lake: { bossMonsterId: '216R', guardMonsterIds: ['214R', '216R', '462R'] },
    oasis: { bossMonsterId: '467R', guardMonsterIds: ['458R', '462R', '467R'] },
    pyramid_front: { bossMonsterId: '454R', guardMonsterIds: ['354R', '458R', '462R'] },
    pyramid_inside: { bossMonsterId: '466R', guardMonsterIds: ['354R', '466R', '467R'] },
    skeria: { bossMonsterId: '634R', guardMonsterIds: ['634R', '635R', '637R'] },
    skeria_2: { bossMonsterId: '467R', guardMonsterIds: ['467R', '638R', '639R'] },
    valhalla_plain: { bossMonsterId: '638R', guardMonsterIds: ['636R', '637R', '638R'] },
    airship: { guardMonsterIds: ['216R', '634R'] },
    ament_gate: { bossMonsterId: '638R', guardMonsterIds: ['634R', '636R', '639R'] },
    ament_1f: { bossMonsterId: '636R', guardMonsterIds: ['636R', '637R', '638R'] },
    ament_2f: { bossMonsterId: '638R', guardMonsterIds: ['636R', '638R', '639R'] },
} satisfies Record<string, StoryScenarioMonsterLayout>;

function getStoryScenarioMonsterLayout(scenario: StoryScenarioDefinition): StoryScenarioMonsterLayout {
    return STORY_SCENARIO_MONSTER_LAYOUTS[scenario.dungeonId as keyof typeof STORY_SCENARIO_MONSTER_LAYOUTS] ?? {
        bossMonsterId: undefined,
        guardMonsterIds: ['303R', '313R', '434R'],
    };
}

function storyScenarioGuardOffsets(count: number, hasBoss: boolean): TilePoint[] {
    const offsets: TilePoint[] = hasBoss
        ? [
            { x: 2, y: -1 }, { x: 2, y: 1 }, { x: 3, y: -2 }, { x: 3, y: 2 },
            { x: 1, y: -2 }, { x: 1, y: 2 }, { x: 4, y: -2 }, { x: 4, y: 2 },
            { x: 5, y: -1 }, { x: 5, y: 1 },
        ]
        : [
            { x: 2, y: 0 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: 4, y: 0 },
            { x: 2, y: -2 }, { x: 2, y: 2 }, { x: 5, y: -1 }, { x: 5, y: 1 },
            { x: 4, y: -2 }, { x: 4, y: 2 },
        ];
    return offsets.slice(0, Math.max(0, count));
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

function sanitizeCarriedWeight(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value * 10) / 10);
}

function sanitizeCarriedItems(value: unknown): Map<string, number> {
    const items = new Map<string, number>();
    if (!Array.isArray(value)) return items;
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as Record<string, unknown>;
        const itemId = typeof record.itemId === 'string' ? record.itemId.trim() : '';
        if (!itemId || !getItemDef(itemId)) continue;
        const quantity = typeof record.quantity === 'number' && Number.isFinite(record.quantity)
            ? Math.floor(record.quantity)
            : 0;
        if (quantity <= 0) continue;
        items.set(itemId, Math.min(999, (items.get(itemId) ?? 0) + quantity));
    }
    return items;
}

function sanitizeTier(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(10, Math.floor(value)));
}

function sanitizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
}

function createFallbackActorSnapshot(): ActorSnapshot {
    return {
        id: 'fallback_actor',
        name: 'Adventurer',
        classLineId: 'infantry',
        currentTier: 1,
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
            mov: getClassLine('infantry')?.baseMovRange ?? 5,
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
