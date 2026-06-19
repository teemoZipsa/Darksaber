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
    getEffectiveSkill,
    getUpgradeLevel,
    normalizeLoadout,
    normalizeUpgradeLevels,
} from '../src/magic/MagicLoadout';
import {
    getMonsterDefinition,
    type MonsterId,
} from '../src/data/MonsterCatalog';
import { getStoryQuestByDungeonId } from '../src/data/StoryQuestData';
import { getStoryScenarioByDungeonId, type StoryScenarioDefinition, type StoryScenarioMissionKind } from '../src/data/StoryScenarioData';
import { getStoryScenarioMonsterLayout } from '../src/data/StoryScenarioMonsterData';
import {
    getStoryScenarioEventSequence,
    type StoryScenarioEnemyDefeatEvent,
    type StoryScenarioEventStep,
    type StoryScenarioFieldEvent,
} from '../src/data/StoryScenarioEventData';
import {
    getStoryScenarioFieldEventFlag,
    getStoryScenarioFieldEventScope,
    getStoryScenarioFieldEventTiles,
} from '../src/data/StoryScenarioFieldEventPlacement';
import {
    getStoryInteriorLayout,
    getStoryInteriorTileAt,
    type StoryInteriorLayout,
} from '../src/data/StoryInteriorData';
import { CHUNK_TILES, nestMemberOffsets, pickNestForChunk, type FieldNest, type FieldNestState } from '../src/field/SpawnResolver';
import { Enemy } from '../src/entity/Enemy';
import { LootObject } from '../src/entity/LootObject';
import { getCarryAtbMultiplier, getPlacedItemWeight } from '../src/inventory/CarryWeight';
import { getEnemyLootSourceLabel } from '../src/loot/LootLabels';
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
import {
    ENEMY_AGGRO_RANGE,
    FIELD_ATB_SCALE,
    ENEMY_LEASH_RANGE,
} from '../src/field/FieldConfig';
import { decideEnemyAction, type EnemyAIDecision, type EnemyAIUnit } from '../src/field/EnemyAI';
import { advanceAtb } from '../src/field/FieldCombat';
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
    type ScenarioEnemyDefeatEventMessage,
    type ScenarioFieldEventResultMessage,
    type ScenarioFieldEventRewardResult,
    type WorldClientMessage,
    type WorldJoinMessage,
    type WorldPlayerSnapshot,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from '../src/net/WorldProtocol';
import type { CharacterSave } from './AuthStore';
import { WorldSessionLootState, type WorldSessionLootLock } from './WorldSessionLootState';
import { cloneCharacterSave, WorldSessionSaveState, type WorldCharacterSavePatch } from './WorldSessionSaveState';
import { WorldSessionEnemyState } from './WorldSessionEnemyState';

export const WORLD_TICK_MS = 100;
export const DISCONNECT_GRACE_MS = 30_000;
const RAID_LIMIT_SECONDS = 30 * 60;
const AUTO_LOOT_RESPONSE_MS = 5_000;
const FIELD_NEST_RESPAWN_MS = 5 * 60_000;
const FIELD_NEST_RESPAWN_SAFE_DISTANCE = 18;
const FIELD_NEST_ROAM_RADIUS_CHUNKS = 2;
const FIELD_NEST_DEPARTURE_RADIUS_CHUNKS = 4;
const FIELD_NEST_DEPARTURE_MAX_ENEMIES = 18;
const FIELD_NEST_REFRESH_MAX_ENEMIES = 28;
const FIELD_NEST_NEARBY_ENEMY_DISTANCE = 24;
const FIELD_NEST_SPAWN_SAFE_DISTANCE = ENEMY_AGGRO_RANGE;
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
    magicLoadout: string[];
    skillUpgradeLevels: Record<string, number>;
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
    raidGoldReward: number;
    completedQuestIds: Set<string>;
    enteredDungeonIds: Set<string>;
    completedDungeonIds: Set<string>;
    fieldEventFlagsByDungeonId: Map<string, Set<string>>;
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
    missionKind: StoryScenarioMissionKind;
    returnTile: TilePoint | null;
    enemyIds: string[];
    objectiveEnemyId: string | null;
    completed: boolean;
}

interface CompleteEnemyKillResult {
    autoLootGrant?: AutoLootGrantMessage;
    scenarioEnemyDefeatEvent?: ScenarioEnemyDefeatEventMessage;
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

export type { WorldCharacterSavePatch } from './WorldSessionSaveState';

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
    private readonly sharedScenarioFieldEventFlags = new Map<string, Set<string>>();
    private readonly loot = new Map<string, LootObject>();
    private readonly lootState = new WorldSessionLootState(AUTO_LOOT_RESPONSE_MS);
    private readonly generatedLootChunks = new Set<string>();
    private readonly saveState = new WorldSessionSaveState();
    private readonly enemyState: WorldSessionEnemyState<ServerEnemy, ServerActor>;
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
        this.enemyState = new WorldSessionEnemyState<ServerEnemy, ServerActor>({
            getTargetableActors: (entry) => this.getTargetableActors(entry),
            hasActiveActorWithin: (tile, distance, ownerPlayerId) => this.hasActiveActorWithin(tile, distance, ownerPlayerId),
        });
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
            raidGoldReward: 0,
            completedQuestIds: new Set(sanitizeStringArray(context.completedQuestIds ?? message.completedQuestIds)),
            enteredDungeonIds: new Set(),
            completedDungeonIds: new Set(),
            fieldEventFlagsByDungeonId: new Map(),
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
            const tier = sanitizeTier(snapshot.currentTier);
            const actor: ServerActor = {
                id: actorId,
                ownerPlayerId: playerId,
                localActorId: snapshot.id,
                name: snapshot.name,
                classLineId: snapshot.classLineId,
                currentTier: tier,
                level: snapshot.level,
                tile,
                stats: syncStatsMovementToClass(snapshot.stats, snapshot.classLineId),
                statuses: cloneStatuses(snapshot.statuses),
                actionGauge: 0,
                remainingAp: 0,
                majorActionUsed: false,
                facing: 'down',
                isDead: snapshot.isDead,
                magicLoadout: normalizeLoadout(snapshot.magicLoadout, { classLineId: snapshot.classLineId, currentTier: tier }),
                skillUpgradeLevels: normalizeUpgradeLevels(snapshot.skillUpgradeLevels),
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
            case 'SCENARIO_FIELD_EVENT_INTERACT':
                return this.handleScenarioFieldEventInteract(playerId, message, now);
            case 'WORLD_LEAVE':
                this.log(`leave player=${playerId} reason=${message.reason}`);
                return {
                    replies: [this.finishPlayer(playerId, this.resolveRequestedRaidResult(playerId, message.reason))],
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
            if (this.enemyState.advanceEnemy(entry, dt) === 'ready') {
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
        const viewer = viewerPlayerId ? this.players.get(viewerPlayerId) : undefined;
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
            .filter((actor) => this.isActorVisibleToViewer(actor, viewerPlayerId))
            .map((actor) => this.toActorSnapshot(actor));
        const enemies = [...this.enemies.values()]
            .filter((entry) => entry.enemy.stats.hp > 0)
            .filter((entry) => this.isEnemyVisibleToViewer(entry, viewerPlayerId))
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
            .filter((lootObject) => !this.lootState.isAutoLootPending(lootObject.id))
            .filter(() => !viewer?.activeDungeonId)
            .map((lootObject) => this.toLootSnapshot(lootObject));
        const readyActors = partyActors
            .filter((actor) => !actor.isDead && !actor.isGhost && actor.remainingAp >= MIN_FIELD_ACTION_GAUGE_COST)
            .map((actor) => actor.id);
        const remainingApByActor: Record<string, number> = {};
        for (const actor of partyActors) remainingApByActor[actor.id] = actor.remainingAp;

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
                playerFieldEventFlagsByDungeonId: fallbackPlayer
                    ? scenarioFlagSnapshot(fallbackPlayer.fieldEventFlagsByDungeonId)
                    : {},
                sharedFieldEventFlagsByDungeonId: scenarioFlagSnapshot(this.sharedScenarioFieldEventFlags),
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
        return this.saveState.consumeDirtyPlayerIds();
    }

    public createCharacterSavePatch(playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        const player = this.players.get(playerId);
        return this.saveState.createPatch(player, playerId, hubTownId);
    }

    public hasFinalCharacterSavePatch(playerId: string): boolean {
        return this.saveState.hasFinalPatch(playerId);
    }

    public consumeFinalCharacterSavePatch(playerId: string): WorldCharacterSavePatch | null {
        return this.saveState.consumeFinalPatch(playerId);
    }

    public getDebugCounts(): WorldSessionDebugCounts {
        const activePlayers = [...this.players.values()].filter((player) => player.active && !player.ghost).length;
        const ghostPlayers = [...this.players.values()].filter((player) => player.active && player.ghost).length;
        const enemies = [...this.enemies.values()].filter((entry) => entry.enemy.stats.hp > 0).length;
        return {
            activePlayers,
            ghostPlayers,
            enemies,
            lootLocks: this.lootState.lockCount(),
        };
    }

    private isEnemyVisibleToViewer(entry: ServerEnemy, viewerPlayerId: string | null): boolean {
        const viewer = viewerPlayerId ? this.players.get(viewerPlayerId) : undefined;
        if (viewer?.activeDungeonId) return entry.scenarioPlayerId === viewer.id;
        if (!entry.scenarioPlayerId) return true;
        if (!viewerPlayerId) return true;
        return entry.scenarioPlayerId === viewerPlayerId;
    }

    private isActorVisibleToViewer(actor: ServerActor, viewerPlayerId: string | null): boolean {
        if (!viewerPlayerId) return true;
        if (actor.ownerPlayerId === viewerPlayerId) return true;
        const viewer = this.players.get(viewerPlayerId);
        const owner = this.players.get(actor.ownerPlayerId);
        if (viewer?.activeDungeonId) return false;
        if (owner?.activeDungeonId) return false;
        return true;
    }

    private canActorTargetEnemy(actor: ServerActor, entry: ServerEnemy): boolean {
        return !entry.scenarioPlayerId || entry.scenarioPlayerId === actor.ownerPlayerId;
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
            (query) => this.isFieldPassableForOwner(query, actor.ownerPlayerId),
            (step) => getTerrainMoveCost(this.getServerTileAt(step, actor.ownerPlayerId)),
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
        const player = this.players.get(actor.ownerPlayerId);
        if (!player?.activeDungeonId) this.spawnLootNear(actor.tile, player?.departureTownId);
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
        if (!this.canActorTargetEnemy(actor, target)) return reject(intentId, 'Target is not visible.');
        if (actor.remainingAp < ATTACK_AP_COST) return reject(intentId, 'No action available for attack.');

        const range = getClassLine(actor.classLineId)?.attackRange ?? 1;
        const targetTile = { x: target.enemy.gridX, y: target.enemy.gridY };
        if (manhattan(actor.tile, targetTile) > range) return reject(intentId, 'Target is out of range.');
        if (range > 1 && !this.hasFieldLineOfSight(actor.tile, targetTile, actor.ownerPlayerId)) return reject(intentId, 'Line of sight is blocked.');

        this.spendActorGauge(actor, ATTACK_AP_COST);
        actor.facing = directionFromTo(actor.tile, targetTile);
        const { event, autoLootGrant, scenarioEnemyDefeatEvent } = this.resolveActorAttack(actor, target, now);
        this.finishActorIfSpent(actor);
        const replies: WorldServerMessage[] = [];
        if (autoLootGrant) replies.push(autoLootGrant);
        if (scenarioEnemyDefeatEvent) replies.push(scenarioEnemyDefeatEvent);
        return { replies, broadcasts: [event] };
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
        if (!actor.magicLoadout.includes(skill.id)) return reject(intentId, 'Skill is not equipped by this actor.');
        if (hasStatus(actor.statuses, 'silence')) return reject(intentId, 'Actor is silenced.');
        if (actor.remainingAp < MAGIC_ACTION_GAUGE_COST) return reject(intentId, 'No action available to cast skill.');
        if (actor.stats.mp < skill.mpCost) return reject(intentId, 'Actor does not have enough MP.');

        const requiresTarget = skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe';
        const targetId = readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
        const target = targetId ? this.enemies.get(targetId) : undefined;
        if (requiresTarget) {
            if (!targetId) return reject(intentId, 'Cast skill payload must include targetId.');
            if (!target || target.enemy.stats.hp <= 0) return reject(intentId, 'Target is not alive.');
            if (!this.canActorTargetEnemy(actor, target)) return reject(intentId, 'Target is not visible.');
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

        const aliveEnemies = [...this.enemies.values()]
            .filter((entry) => entry.enemy.stats.hp > 0)
            .filter((entry) => this.canActorTargetEnemy(actor, entry));
        const targetEnemies = target && targetTile
            ? getSkillCandidateEnemies(aliveEnemies.map((entry) => entry.enemy), profile, this.getSkillPatternContext(actor, targetTile), target.enemy)
            : [];
        // Authoritative damage/heal/duration scaling: apply the same enhancement
        // helper the client uses so results stay in lockstep (no desync).
        const effectiveSkill = getEffectiveSkill(skill, getUpgradeLevel(actor.skillUpgradeLevels, skill.id));
        const effect = resolveSkillEffect({
            casterStats: this.getCasterSkillStats(actor),
            skill: effectiveSkill,
            targetEnemy: target ? this.toSkillEnemyInput(target.enemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => this.toSkillEnemyInput(enemy)),
            targetsResolvedByPattern: Boolean(target),
            terrainContext: buildSkillTerrainContext({
                casterTile: actor.tile,
                targetEnemies,
                targetEnemy: target?.enemy,
                getTileAt: (tile) => this.getServerTileAt(tile, actor.ownerPlayerId),
            }),
        });

        this.spendActorGauge(actor, MAGIC_ACTION_GAUGE_COST);
        const result = this.applySkillEffect(player, actor, effectiveSkill, effect, now);
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
        if (this.players.get(playerId)?.activeDungeonId) return reject(intentId, 'Loot is not visible.');
        const lootObject = this.loot.get(lootId);
        if (!lootObject || lootObject.opened || this.lootState.isAutoLootPending(lootId)) return reject(intentId, 'Loot is not available.');
        if (actor.remainingAp < INTERACT_AP_COST) return reject(intentId, 'No action available to inspect loot.');
        if (manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 1) return reject(intentId, 'Loot is too far away.');

        if (this.lootState.occupy(lootId, playerId, now) === 'occupied_by_other') return reject(intentId, 'Loot is already occupied.');

        this.spendActorGauge(actor, INTERACT_AP_COST);
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
        if (!lootObject || this.lootState.isAutoLootPending(lootId)) return reject(intentId, 'Loot does not exist.');
        if (!this.lootState.isOccupiedBy(lootId, playerId)) return reject(intentId, 'Loot is not occupied by this player.');

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
        this.lootState.touch(lootId, now);
        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) this.lootState.releaseLoot(lootId);

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
        const lootObject = this.loot.get(lootId);
        if (!this.lootState.consumeAutoLootPending(lootId, playerId) || !lootObject) return { replies: [], broadcasts: [] };

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

        lootObject.opened = lootObject.inventory.items.length === 0;
        if (lootObject.opened) {
            this.loot.delete(lootId);
            this.lootState.releaseLoot(lootId);
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
        if (this.hasNearbyAggroEnemy(actor!.tile, 18, playerId)) return reject(message.intentId, 'Nearby combat must be resolved before entering a scenario.');

        const interiorLayout = getStoryInteriorLayout(dungeonId);
        const returnTile = interiorLayout ? { ...actor!.tile } : null;
        this.removeScenarioRuntimeForPlayer(playerId);
        player!.enteredDungeonIds.add(dungeonId);
        player!.activeDungeonId = dungeonId;
        if (interiorLayout) this.placePlayerActorsInScenarioInterior(player!, interiorLayout);

        const state = this.spawnScenarioEncounter(player!, scenario, interiorLayout?.playerStart ?? actor!.tile, now, returnTile);
        this.scenarioStates.set(playerId, state);
        if (!state.objectiveEnemyId) this.completeScenarioObjective(player!, dungeonId, { clearEnemies: false });

        this.log(`scenario enter player=${playerId} dungeon=${dungeonId} enemies=${state.enemyIds.length}`);
        return { replies: [], broadcasts: [] };
    }

    private handleScenarioFieldEventInteract(
        playerId: string,
        message: Extract<WorldClientMessage, { type: 'SCENARIO_FIELD_EVENT_INTERACT' }>,
        _now: number
    ): WorldSessionMessageResult {
        const player = this.players.get(playerId);
        const actor = this.actors.get(message.actorId);
        const validationError = this.validateScenarioActor(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        const dungeonId = typeof message.dungeonId === 'string' ? message.dungeonId.trim() : '';
        const eventId = typeof message.eventId === 'string' ? message.eventId.trim() : '';
        if (!dungeonId || !eventId) return reject(message.intentId, 'Scenario field event request is malformed.');
        if (player!.activeDungeonId !== dungeonId) return reject(message.intentId, 'Scenario is not active for this player.');

        const sequence = getStoryScenarioEventSequence(dungeonId);
        const event = sequence?.fieldEvents.find((candidate) => candidate.id === eventId);
        if (!event) return reject(message.intentId, 'Scenario field event does not exist.');

        const flag = getStoryScenarioFieldEventFlag(event);
        const scope = getStoryScenarioFieldEventScope(event);
        if (this.isScenarioFieldEventFlagComplete(player!, dungeonId, flag, scope)) {
            return reject(message.intentId, 'Scenario field event is already complete.');
        }

        const triggerTiles = getStoryInteriorLayout(dungeonId)
            ? event.triggerTiles
            : getStoryScenarioFieldEventTiles(dungeonId, event, this.worldMap);
        if (!triggerTiles.some((tile) => manhattan(actor!.tile, tile) <= 1)) {
            return reject(message.intentId, 'Scenario field event is too far away.');
        }
        if (!this.canApplyScenarioRewards(player!, event.rewards)) {
            return reject(message.intentId, 'Scenario field event reward storage is full.');
        }

        this.markScenarioFieldEventFlagComplete(player!, dungeonId, flag, scope);
        const rewards = this.applyScenarioFieldEventRewards(player!, event);
        if (event.completesObjective) this.completeScenarioObjective(player!, dungeonId, { clearEnemies: false });
        const result: ScenarioFieldEventResultMessage = {
            type: 'SCENARIO_FIELD_EVENT_RESULT',
            intentId: message.intentId,
            dungeonId,
            eventId: event.id,
            scope,
            flag,
            presentationSteps: event.steps.map((step) => ({ ...step })),
            rewards,
        };
        const broadcasts: WorldServerMessage[] = scope === 'shared'
            ? [{
                type: 'SCENARIO_FIELD_EVENT_BROADCAST',
                dungeonId,
                eventId: event.id,
                scope: 'shared',
                flag,
                presentationSteps: event.steps.map((step) => ({ ...step })),
            }]
            : [];
        this.log(`scenario field event player=${playerId} dungeon=${dungeonId} event=${event.id} scope=${scope}`);
        return { replies: [result], broadcasts };
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
                const killResult = this.completeEnemyKill(actor, target, now);
                if (killResult.autoLootGrant) replies.push(killResult.autoLootGrant);
                if (killResult.scenarioEnemyDefeatEvent) replies.push(killResult.scenarioEnemyDefeatEvent);
            } else if (guarded.damage > 0 || (!enemyResult.statusEffects && enemyResult.mpDamage === undefined)) {
                broadcasts.push(createEnemyEvent('damage', actor, enemy, guarded.damage));
            }
        }

        if (broadcasts.length === 0 && skill.type === 'buff') broadcasts.push(createActorEvent('status', actor, actor));
        return { replies, broadcasts };
    }

    private resolveActorAttack(
        actor: ServerActor,
        target: ServerEnemy,
        now: number
    ): { event: CombatEventMessage; autoLootGrant?: AutoLootGrantMessage; scenarioEnemyDefeatEvent?: ScenarioEnemyDefeatEventMessage } {
        const enemy = target.enemy;
        const result = CombatFormulas.calcPhysicalDamage(
            getEffectiveStats(actor.stats, actor.statuses),
            getEffectiveStatsForEnemy(enemy),
            this.getServerTileAt({ x: enemy.gridX, y: enemy.gridY }, actor.ownerPlayerId),
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
        let scenarioEnemyDefeatEvent: ScenarioEnemyDefeatEventMessage | undefined;
        if (!result.isMiss) {
            const guarded = applyGuardToDamage(enemy.statuses, result.damage);
            enemy.statuses = guarded.statuses;
            enemy.takeDamage(guarded.damage);
            event.value = guarded.damage;
            if (enemy.stats.hp <= 0) {
                event.kind = 'kill';
                const killResult = this.completeEnemyKill(actor, target, now);
                autoLootGrant = killResult.autoLootGrant;
                scenarioEnemyDefeatEvent = killResult.scenarioEnemyDefeatEvent;
            }
        }
        return { event, autoLootGrant, scenarioEnemyDefeatEvent };
    }

    private completeEnemyKill(actor: ServerActor, target: ServerEnemy, now: number): CompleteEnemyKillResult {
        const enemy = target.enemy;
        const scenarioEnemyDefeatEvent = this.createScenarioEnemyDefeatEventMessage(target);
        const scenarioState = target.scenarioPlayerId ? this.scenarioStates.get(target.scenarioPlayerId) : undefined;
        const scenarioBossLootTile = target.scenarioObjective && scenarioState?.returnTile
            ? { ...scenarioState.returnTile }
            : null;
        this.enemies.delete(enemy.id);
        if (target.nestKey) this.markNestEnemyKilled(target.nestKey, enemy.id, now);
        if (target.scenarioPlayerId && target.scenarioDungeonId) this.markScenarioEnemyKilled(target, enemy.id);
        const player = this.players.get(actor.ownerPlayerId);
        if (player) player.kills += 1;
        const autoLootGrant = enemy.isBoss
            ? undefined
            : this.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
        if (enemy.isBoss || !autoLootGrant) this.spawnEnemyLoot(enemy, scenarioBossLootTile ?? undefined);
        return { autoLootGrant, scenarioEnemyDefeatEvent };
    }

    private resolveEnemyTurn(entry: ServerEnemy, now: number): CombatEventMessage[] {
        const enemy = entry.enemy;
        const targets = this.getTargetableActors(entry);
        const closest = this.enemyState.findClosestTarget(entry, targets);
        if (!closest) {
            this.wanderEnemy(entry, now);
            return [];
        }

        if (!this.enemyState.refreshAggro(entry, closest)) {
            this.wanderEnemy(entry, now);
            return [];
        }

        enemy.aiMemory.turnCount += 1;
        const decision = decideEnemyAction({
            self: toEnemyAIUnit(enemy),
            targets: targets.map((actor) => toActorAIUnit(actor)),
            allies: [...this.enemies.values()]
                .filter((candidate) => entry.scenarioPlayerId
                    ? candidate.scenarioPlayerId === entry.scenarioPlayerId
                    : !candidate.scenarioPlayerId)
                .map((candidate) => candidate.enemy)
                .filter((candidate) => candidate.stats.hp > 0)
                .map((candidate) => toEnemyAIUnit(candidate)),
            profile: enemy.aiProfile,
            turnCount: enemy.aiMemory.turnCount,
            hasLineOfSight: (from, to) => this.hasFieldLineOfSight(from, to, entry.scenarioPlayerId),
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
            this.getServerTileAt(actor.tile, actor.ownerPlayerId),
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
        const finalResult = result === 'SURVIVED' && !this.isValidExtractionTown(player, extractionTownId) ? 'LEFT' : result;
        const message: RaidResultMessage = {
            type: 'RAID_RESULT',
            playerId,
            result: finalResult,
            elapsedSeconds: player?.elapsedSeconds ?? 0,
            kills: player?.kills ?? 0,
            departureTownId: player?.departureTownId ?? 'central_castle',
            extractionTownId,
            completedDungeonIds: player ? [...player.completedDungeonIds] : [],
        };
        this.log(`raid result player=${playerId} result=${finalResult} kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        if (player) {
            const survived = finalResult === 'SURVIVED';
            this.captureFinalSavePatch(player, survived ? extractionTownId : undefined, survived);
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

    private resolveRequestedRaidResult(
        playerId: string,
        reason: Extract<WorldClientMessage, { type: 'WORLD_LEAVE' }>['reason']
    ): RaidResultMessage['result'] {
        if (reason === 'wipe') return 'DEAD';
        if (reason !== 'town') return 'LEFT';
        const player = this.players.get(playerId);
        return this.isValidExtractionTown(player, this.resolveExtractionTownId(player)) ? 'SURVIVED' : 'LEFT';
    }

    private isValidExtractionTown(player: ServerPlayer | undefined, extractionTownId: string): boolean {
        if (!player) return false;
        if (extractionTownId === player.departureTownId) return false;
        const actor = player.actorIds.map((id) => this.actors.get(id)).find(Boolean);
        if (!actor) return false;
        return this.worldMap.getTownAtTile(actor.tile.x, actor.tile.y)?.id === extractionTownId;
    }

    private getTargetableActors(entry?: ServerEnemy): ServerActor[] {
        return [...this.actors.values()]
            .filter((actor) => !actor.isDead && actor.stats.hp > 0)
            .filter((actor) => {
                const owner = this.players.get(actor.ownerPlayerId);
                if (!owner?.active) return false;
                if (entry?.scenarioPlayerId) return actor.ownerPlayerId === entry.scenarioPlayerId;
                return !owner.activeDungeonId;
            })
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
        return range <= 1 || this.hasFieldLineOfSight(enemyTile, actor.tile, actor.ownerPlayerId);
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
        return this.isFieldPassableForOwner(query);
    }

    private isFieldPassableForOwner(query: FieldPassableQuery, ownerPlayerId?: string): boolean {
        const queryOwnerPlayerId = ownerPlayerId ?? this.getEntityOwnerPlayerId(query.actorId);
        const queryScenarioPlayerId = ownerPlayerId ?? this.getScenarioOwnerPlayerId(query.actorId);
        const tile = this.getServerTileAt(query, queryScenarioPlayerId ?? queryOwnerPlayerId ?? undefined);
        if (!isTerrainPassable(tile)) return false;
        for (const actor of this.actors.values()) {
            if (actor.id === query.actorId || actor.isDead) continue;
            const actorOwner = this.players.get(actor.ownerPlayerId);
            if (actorOwner?.activeDungeonId && actor.ownerPlayerId !== queryOwnerPlayerId) continue;
            if (queryScenarioPlayerId && actor.ownerPlayerId !== queryScenarioPlayerId) continue;
            if (actor.tile.x === query.x && actor.tile.y === query.y) return false;
        }
        for (const entry of this.enemies.values()) {
            const enemy = entry.enemy;
            if (enemy.id === query.actorId || enemy.stats.hp <= 0) continue;
            if (entry.scenarioPlayerId && entry.scenarioPlayerId !== queryOwnerPlayerId) continue;
            if (queryScenarioPlayerId && entry.scenarioPlayerId !== queryScenarioPlayerId) continue;
            if (enemy.gridX === query.x && enemy.gridY === query.y) return false;
        }
        return true;
    }

    private getServerTileAt(tile: TilePoint, ownerPlayerId?: string | null): ReturnType<WorldMap['getTileAt']> {
        const layout = this.getActiveInteriorLayoutForOwner(ownerPlayerId);
        return layout ? getStoryInteriorTileAt(layout, tile.x, tile.y) : this.worldMap.getTileAt(tile.x, tile.y);
    }

    private getServerBoundsForOwner(ownerPlayerId?: string | null): ReturnType<WorldMap['getBoundsTiles']> {
        const layout = this.getActiveInteriorLayoutForOwner(ownerPlayerId);
        return layout ? { width: layout.width, height: layout.height } : this.worldMap.getBoundsTiles();
    }

    private getActiveInteriorLayoutForOwner(ownerPlayerId?: string | null): StoryInteriorLayout | null {
        if (!ownerPlayerId) return null;
        const player = this.players.get(ownerPlayerId);
        return player?.activeDungeonId ? getStoryInteriorLayout(player.activeDungeonId) : null;
    }

    private getEntityOwnerPlayerId(entityId?: string): string | null {
        if (!entityId) return null;
        const actor = this.actors.get(entityId);
        if (actor) return actor.ownerPlayerId;
        return this.getScenarioOwnerPlayerId(entityId);
    }

    private getScenarioOwnerPlayerId(entityId?: string): string | null {
        if (!entityId) return null;
        return this.enemies.get(entityId)?.scenarioPlayerId ?? null;
    }

    private hasFieldLineOfSight(from: TilePoint, to: TilePoint, ownerPlayerId?: string): boolean {
        return hasLineOfSight(from, to, (tile) => isTerrainLineOfSightBlocking(this.getServerTileAt(tile, ownerPlayerId)));
    }

    private getSkillPatternContext(actor: ServerActor, selectedTile?: TilePoint) {
        const bounds = this.getServerBoundsForOwner(actor.ownerPlayerId);
        return {
            casterTile: actor.tile,
            selectedTile,
            isInsideMap: (tile: TilePoint) => tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height,
            isBlockingTile: (tile: TilePoint) => isTerrainLineOfSightBlocking(this.getServerTileAt(tile, actor.ownerPlayerId)),
            hasLineOfSight: (from: TilePoint, to: TilePoint) => this.hasFieldLineOfSight(from, to, actor.ownerPlayerId),
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

    private placePlayerActorsInScenarioInterior(player: ServerPlayer, layout: StoryInteriorLayout): void {
        player.actorIds.forEach((actorId, index) => {
            const actor = this.actors.get(actorId);
            if (!actor) return;
            const offset = formationOffset(index);
            const tile = this.findNearbyWalkableTile({
                x: layout.playerStart.x + offset.x,
                y: layout.playerStart.y + offset.y,
            }, actor.id, player.id);
            actor.tile = tile;
            actor.facing = 'right';
        });
    }

    private returnPlayerActorsFromScenarioInterior(player: ServerPlayer, returnTile: TilePoint): void {
        player.actorIds.forEach((actorId, index) => {
            const actor = this.actors.get(actorId);
            if (!actor) return;
            const offset = formationOffset(index);
            const tile = this.findNearbyWalkableTile({
                x: returnTile.x + offset.x,
                y: returnTile.y + offset.y,
            }, actor.id);
            actor.tile = tile;
            actor.facing = 'down';
        });
    }

    private spawnScenarioEncounter(
        player: ServerPlayer,
        scenario: StoryScenarioDefinition,
        anchor: TilePoint,
        now: number,
        returnTile: TilePoint | null = null
    ): ServerScenarioState {
        const state: ServerScenarioState = {
            playerId: player.id,
            dungeonId: scenario.dungeonId,
            missionKind: scenario.missionKind,
            returnTile: returnTile ? { ...returnTile } : null,
            enemyIds: [],
            objectiveEnemyId: null,
            completed: false,
        };
        const layout = getStoryScenarioMonsterLayout(scenario);
        const interiorLayout = getStoryInteriorLayout(scenario.dungeonId);
        const guardOffsets = layout.guardOffsets ?? storyScenarioGuardOffsets(scenario.guardCount, Boolean(scenario.bossName));

        for (let index = 0; index < scenario.guardCount; index++) {
            const monsterId = layout.guardMonsterIds[index % layout.guardMonsterIds.length];
            const definition = getMonsterDefinition(monsterId);
            const offset = guardOffsets[index] ?? { x: index % 2 === 0 ? 2 : -2, y: Math.floor(index / 2) + 1 };
            const tile = interiorLayout?.guardTiles[index] ?? { x: anchor.x + offset.x, y: anchor.y + offset.y };
            this.spawnScenarioEnemy({
                state,
                monsterId,
                name: definition.name,
                level: Math.max(scenario.guardLevel, definition.level),
                color: definition.color,
                role: definition.role,
                tile,
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
                tile: interiorLayout?.bossTile ?? { x: anchor.x + (layout.bossOffset?.x ?? 4), y: anchor.y + (layout.bossOffset?.y ?? 0) },
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
        const tile = this.findNearbyWalkableTile(input.tile, id, input.state.playerId);
        const definition = input.monsterId ? getMonsterDefinition(input.monsterId) : null;
        const enemy = new Enemy(id, tile.x, tile.y, input.name, input.level, input.color, input.role, input.monsterId);
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

    private createScenarioEnemyDefeatEventMessage(target: ServerEnemy): ScenarioEnemyDefeatEventMessage | undefined {
        if (target.scenarioObjective || !target.scenarioPlayerId || !target.scenarioDungeonId) return undefined;
        const event = this.getScenarioEnemyDefeatEvent(target);
        if (!event) return undefined;
        const focus = { x: target.enemy.gridX, y: target.enemy.gridY };
        return {
            type: 'SCENARIO_ENEMY_DEFEAT_EVENT',
            dungeonId: target.scenarioDungeonId,
            enemyId: target.enemy.id,
            eventId: event.id,
            presentationSteps: event.steps.map((step) => this.withScenarioEnemyDefeatFocus(step, focus)),
        };
    }

    private getScenarioEnemyDefeatEvent(target: ServerEnemy): StoryScenarioEnemyDefeatEvent | undefined {
        if (!target.scenarioPlayerId || !target.scenarioDungeonId) return undefined;
        const state = this.scenarioStates.get(target.scenarioPlayerId);
        if (!state || state.dungeonId !== target.scenarioDungeonId) return undefined;
        const scenarioEnemyIndex = state.enemyIds.indexOf(target.enemy.id);
        if (scenarioEnemyIndex < 0) return undefined;
        return getStoryScenarioEventSequence(target.scenarioDungeonId)?.enemyDefeatEvents
            ?.find((event) => event.scenarioEnemyIndex === scenarioEnemyIndex);
    }

    private withScenarioEnemyDefeatFocus(step: StoryScenarioEventStep, focus: TilePoint): StoryScenarioEventStep {
        if (step.kind === 'focus') return { ...step, target: { ...focus } };
        return { ...step, focus: { ...focus } };
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
        const state = this.scenarioStates.get(player.id);
        if (player.activeDungeonId === dungeonId) player.activeDungeonId = null;
        player.completedDungeonIds.add(dungeonId);
        const quest = getStoryQuestByDungeonId(dungeonId);
        if (quest) player.completedQuestIds.add(quest.id);
        this.applyScenarioBossDefeatRewards(player, dungeonId);
        if (state?.returnTile) this.returnPlayerActorsFromScenarioInterior(player, state.returnTile);
        this.markSaveDirty(player.id);

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

    private isScenarioFieldEventFlagComplete(
        player: ServerPlayer,
        dungeonId: string,
        flag: string,
        scope: 'player' | 'shared'
    ): boolean {
        const store = scope === 'shared' ? this.sharedScenarioFieldEventFlags : player.fieldEventFlagsByDungeonId;
        return store.get(dungeonId)?.has(flag) ?? false;
    }

    private markScenarioFieldEventFlagComplete(
        player: ServerPlayer,
        dungeonId: string,
        flag: string,
        scope: 'player' | 'shared'
    ): void {
        const store = scope === 'shared' ? this.sharedScenarioFieldEventFlags : player.fieldEventFlagsByDungeonId;
        let flags = store.get(dungeonId);
        if (!flags) {
            flags = new Set();
            store.set(dungeonId, flags);
        }
        flags.add(flag);
        this.markSaveDirty(player.id);
    }

    private applyScenarioFieldEventRewards(
        player: ServerPlayer,
        event: StoryScenarioFieldEvent
    ): ScenarioFieldEventRewardResult[] {
        return this.applyScenarioRewards(player, event.rewards);
    }

    private applyScenarioBossDefeatRewards(
        player: ServerPlayer,
        dungeonId: string
    ): ScenarioFieldEventRewardResult[] {
        const event = getStoryScenarioEventSequence(dungeonId)?.bossDefeatEvent;
        return this.applyScenarioRewards(player, event?.rewards);
    }

    private applyScenarioRewards(
        player: ServerPlayer,
        rewards: StoryScenarioFieldEvent['rewards']
    ): ScenarioFieldEventRewardResult[] {
        const results: ScenarioFieldEventRewardResult[] = [];
        for (const reward of rewards ?? []) {
            if (reward.type === 'gold') {
                player.raidGoldReward += Math.max(0, Math.floor(reward.amount));
                results.push({ type: 'gold', amount: reward.amount });
                continue;
            }

            const item = getItemDef(reward.itemId);
            if (!item) continue;
            const saved = this.addSavePlacedItem(player, {
                item,
                durability: item.maxDurability,
                quantity: 1,
            });
            if (!saved) continue;
            this.addCarriedItemQuantity(player.id, item.id, 1);
            this.addCarriedWeight(player.id, getPlacedItemWeight({ item, quantity: 1 }));
            this.markSaveDirty(player.id);
            results.push({
                type: 'item',
                itemId: item.id,
                ...(reward.originalItemId !== undefined ? { originalItemId: reward.originalItemId } : {}),
            });
        }
        return results;
    }

    private canApplyScenarioRewards(player: ServerPlayer, rewards: StoryScenarioFieldEvent['rewards']): boolean {
        const placedItems = (rewards ?? []).flatMap((reward) => {
            if (reward.type !== 'item') return [];
            const item = getItemDef(reward.itemId);
            return item ? [{ item, durability: item.maxDurability, quantity: 1 }] : [];
        });
        return this.saveState.canAddPlacedItems(player, placedItems);
    }

    private ensureContentNear(spawnTile: TilePoint, departureTownId: string | null | undefined, now: number): void {
        if (!this.hasNearbyLiveEnemy(spawnTile, FIELD_NEST_NEARBY_ENEMY_DISTANCE)) {
            this.spawnEnemiesNear(
                spawnTile,
                now,
                false,
                new Set(),
                FIELD_NEST_DEPARTURE_RADIUS_CHUNKS,
                FIELD_NEST_DEPARTURE_MAX_ENEMIES,
            );
        }

        this.spawnLootNear(spawnTile, departureTownId);
    }

    private refreshFieldNests(now: number): void {
        const visited = new Set<string>();
        for (const player of this.players.values()) {
            if (!player.active || player.ghost) continue;
            if (player.activeDungeonId) continue;
            const anchor = this.firstLivingActorTile(player);
            if (!anchor) continue;
            const forceCenter = !this.hasNearbyLiveEnemy(anchor, FIELD_NEST_NEARBY_ENEMY_DISTANCE);
            this.spawnEnemiesNear(anchor, now, forceCenter, visited, FIELD_NEST_ROAM_RADIUS_CHUNKS, FIELD_NEST_REFRESH_MAX_ENEMIES);
        }
    }

    private spawnEnemiesNear(
        anchor: TilePoint,
        now: number,
        forceCenter: boolean,
        visited: Set<string> = new Set(),
        radiusChunks = FIELD_NEST_ROAM_RADIUS_CHUNKS,
        maxSpawnedEnemies = Number.POSITIVE_INFINITY,
    ): number {
        const realm = this.worldMap.getRealm();
        const seed = `server:${this.sessionEpoch}`;
        const centerChunkX = Math.floor(anchor.x / CHUNK_TILES);
        const centerChunkY = Math.floor(anchor.y / CHUNK_TILES);

        let spawned = 0;
        for (const offset of chunkOffsetsByDistance(radiusChunks)) {
            if (spawned >= maxSpawnedEnemies) return spawned;
            const chunkX = centerChunkX + offset.dx;
            const chunkY = centerChunkY + offset.dy;
            const stateKey = nestStateKey(realm, chunkX, chunkY);
            if (visited.has(stateKey)) continue;
            visited.add(stateKey);
            const biome = this.worldMap.getBiomeAtChunk(chunkX, chunkY);
            const force = forceCenter && offset.dx === 0 && offset.dy === 0;
            spawned += this.spawnNest(chunkX, chunkY, biome, realm, seed, force, now);
        }

        // Player boxed in by water/town chunks — force one grass pack at the spawn chunk.
        if (forceCenter && spawned === 0) spawned += this.spawnNest(centerChunkX, centerChunkY, 'grass', realm, seed, true, now);
        return spawned;
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
        if (this.hasActiveActorWithin(nest.centerTile, FIELD_NEST_SPAWN_SAFE_DISTANCE)) return 0;
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
            const enemy = new Enemy(id, tile.x, tile.y, definition.name, monster.level, definition.color, definition.role, monster.monsterId);
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
            !entry.scenarioPlayerId
            && entry.enemy.stats.hp > 0
            && manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, tile) <= distance
        );
    }

    private hasNearbyAggroEnemy(tile: TilePoint, distance: number, viewerPlayerId?: string): boolean {
        return [...this.enemies.values()].some((entry) =>
            entry.enemy.stats.hp > 0
            && entry.enemy.isAggro
            && (!entry.scenarioPlayerId || entry.scenarioPlayerId === viewerPlayerId)
            && manhattan({ x: entry.enemy.gridX, y: entry.enemy.gridY }, tile) <= distance
        );
    }

    private hasActiveActorWithin(tile: TilePoint, distance: number, ownerPlayerId?: string): boolean {
        return [...this.players.values()].some((player) => {
            if (!player.active || player.ghost) return false;
            if (ownerPlayerId && player.id !== ownerPlayerId) return false;
            if (!ownerPlayerId && player.activeDungeonId) return false;
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

    private spawnEnemyLoot(enemy: Enemy, tile: TilePoint = { x: enemy.gridX, y: enemy.gridY }): void {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (!herb) return;
        const id = `loot_${this.nextLootId++}`;
        this.loot.set(id, new LootObject(id, tile.x, tile.y, [herb], {
            sourceLabel: getEnemyLootSourceLabel(enemy.name),
            kind: 'corpse',
        }));
    }

    private spawnEnemyAutoLoot(enemy: Enemy, playerId: string, now: number): AutoLootGrantMessage | undefined {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (!herb) return undefined;

        const id = `loot_${this.nextLootId++}`;
        const loot = new LootObject(id, enemy.gridX, enemy.gridY, [herb], {
            sourceLabel: getEnemyLootSourceLabel(enemy.name),
            kind: 'corpse',
        });
        this.loot.set(id, loot);
        this.lootState.createAutoLootPending(id, playerId, now);
        return {
            type: 'AUTO_LOOT_GRANT',
            lootId: id,
            sourceName: enemy.name,
            gridSnapshot: gridToSnapshot(loot.inventory),
        };
    }

    private findNearbyWalkableTile(tile: TilePoint, actorId: string, ownerPlayerId?: string): TilePoint {
        if (this.isFieldPassableForOwner({ ...tile, actorId, intent: 'move' }, ownerPlayerId)) return tile;
        for (let radius = 1; radius <= 8; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const candidate = { x: tile.x + dx, y: tile.y + dy };
                    if (this.isFieldPassableForOwner({ ...candidate, actorId, intent: 'move' }, ownerPlayerId)) return candidate;
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
        this.saveState.markDirty(playerId);
    }

    private captureFinalSavePatch(player: ServerPlayer, hubTownId?: string, includeRaidRewards: boolean = false): void {
        this.saveState.captureFinalPatch(player, hubTownId, includeRaidRewards);
    }

    private removeSaveItemQuantity(player: ServerPlayer, itemId: string, quantity: number): void {
        this.saveState.removeItemQuantity(player, itemId, quantity);
    }

    private addSavePlacedItem(player: ServerPlayer, placed: { item: { id: string; maxDurability: number }; durability: number; quantity: number; sockets?: Array<{ id: string }> }): boolean {
        return this.saveState.addPlacedItem(player, placed);
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
            magicLoadout: [...actor.magicLoadout],
            skillUpgradeLevels: { ...actor.skillUpgradeLevels },
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
            lockedByPlayerId: this.lootState.getLockPlayerId(lootObject.id),
            gridSnapshot: gridToSnapshot(lootObject.inventory),
        };
    }

    private releaseLootLocksForPlayer(playerId: string): void {
        this.lootState.releaseLocksForPlayer(playerId);
    }

    private releaseExpiredAutoLoot(now: number): void {
        this.lootState.releaseExpiredAutoLoot(now, (lootId) => {
            const lootObject = this.loot.get(lootId);
            if (!lootObject) return;
            lootObject.opened = lootObject.inventory.items.length === 0;
            if (lootObject.opened) this.loot.delete(lootId);
        });
    }

    private releaseExpiredLootLocks(now: number): void {
        this.lootState.releaseExpiredLocks(now, (lock) => this.shouldReleaseLootLock(lock));
    }

    private shouldReleaseLootLock(lock: WorldSessionLootLock): boolean {
        const actor = this.players.get(lock.playerId)?.actorIds
            .map((actorId) => this.actors.get(actorId))
            .find(Boolean);
        const lootObject = this.loot.get(lock.lootId);
        const tooFar = actor && lootObject && manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 2;
        return Boolean(tooFar || !actor || !lootObject);
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

function scenarioFlagSnapshot(flagsByDungeonId: Map<string, Set<string>>): Record<string, string[]> {
    const snapshot: Record<string, string[]> = {};
    for (const [dungeonId, flags] of flagsByDungeonId) {
        snapshot[dungeonId] = [...flags].sort();
    }
    return snapshot;
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

function chunkOffsetsByDistance(radiusChunks: number): { dx: number; dy: number }[] {
    const offsets: { dx: number; dy: number }[] = [];
    for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
        for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
            offsets.push({ dx, dy });
        }
    }
    return offsets.sort((a, b) => {
        const da = a.dx * a.dx + a.dy * a.dy;
        const db = b.dx * b.dx + b.dy * b.dy;
        if (da !== db) return da - db;
        if (a.dy !== b.dy) return a.dy - b.dy;
        return a.dx - b.dx;
    });
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
