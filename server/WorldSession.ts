import {
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
} from '../src/combat/StatusEffects';
import { resolveSkillEffect, type SkillEffectResult } from '../src/combat/SkillEffectResolver';
import { CombatFormulas } from '../src/combat/CombatFormulas';
import { getClassLine } from '../src/data/ClassTree';
import { getSkillAttackProfile } from '../src/data/AttackPatternProfiles';
import { getItemDef, getCombatRecovery, isCombatRecoveryConsumable } from '../src/data/ItemDB';
import { getSkill, type Skill } from '../src/data/SkillDB';
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
import { getStoryScenarioByDungeonId, type StoryScenarioDefinition } from '../src/data/StoryScenarioData';
import { getStoryScenarioMonsterLayout } from '../src/data/StoryScenarioMonsterData';
import {
    getStoryScenarioEventSequence,
    type StoryScenarioEnemyDefeatEvent,
    type StoryScenarioEventStep,
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
import type { FieldNestState } from '../src/field/SpawnResolver';
import { Enemy } from '../src/entity/Enemy';
import { LootObject } from '../src/entity/LootObject';
import { getCarryAtbMultiplier, getPlacedItemWeight } from '../src/inventory/CarryWeight';
import {
    countCursedArtifactsInItemCounts,
    getCursedArtifactAtbMultiplier,
    getCursedArtifactTurnDamage,
} from '../src/raid/CursedArtifact';
import {
    getRaidModifierEffects,
    getRaidModifierSupplyItems,
    rollRaidModifier,
} from '../src/raid/RaidModifiers';
import { getMarkedCacheItems, MASTER_KEY_ITEM_ID } from '../src/raid/MarkedCache';
import { getEnemyLootSourceLabel, getWorldLootSourceLabel } from '../src/loot/LootLabels';
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
import { FIELD_ATB_SCALE } from '../src/field/FieldConfig';
import { planMoveIntentPath } from './WorldSessionMoveIntent';
import { advanceAtb } from '../src/field/FieldCombat';
import {
    manhattan,
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
import {
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type InventoryConsumedMessage,
    type LootGrantMessage,
    type RaidResultMessage,
    type ScenarioEnemyDefeatEventMessage,
    type ScenarioFieldEventResultMessage,
    type WorldClientMessage,
    type WorldJoinMessage,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from '../src/net/WorldProtocol';
import { WorldSessionLootState, type WorldSessionLootLock } from './WorldSessionLootState';
import { cloneCharacterSave, WorldSessionSaveState, type WorldCharacterSavePatch } from './WorldSessionSaveState';
import { WorldSessionEnemyState } from './WorldSessionEnemyState';
import { WorldSessionEnemyTurnResolver } from './WorldSessionEnemyTurnResolver';
import {
    FIELD_NEST_NEARBY_ENEMY_DISTANCE,
    WorldSessionFieldNests,
    WORLD_SESSION_FIELD_NEST_DEPARTURE_MAX_ENEMIES,
    WORLD_SESSION_FIELD_NEST_DEPARTURE_RADIUS_CHUNKS,
} from './WorldSessionFieldNests';
import { WorldSessionScenarioRewards } from './WorldSessionScenarioRewards';
import {
    addCarriedItemQuantity,
    addCarriedWeight,
} from './WorldSessionCarryState';
import {
    firstActorTile,
    hasActiveActorWithin,
    hasNearbyAggroEnemy,
    hasNearbyLiveEnemy,
} from './WorldSessionSpatialQueries';
import {
    canActorTargetEnemy,
    getTargetableActors,
    isPlayerWiped,
} from './WorldSessionVisibility';
import {
    clonePersistentActor,
    clonePersistentNestState,
    clonePersistentScenarioState,
    restorePersistentEnemy,
    restorePersistentLoot,
    restorePersistentPlayer,
} from './WorldSessionPersistence';
import { buildWorldSessionPersistentSnapshot } from './WorldSessionPersistentSnapshotBuilder';
import { buildWorldSessionSnapshot } from './WorldSessionSnapshotBuilder';
import {
    createFallbackActorSnapshot,
    readStringPayload,
    readTilePayload,
    sanitizeCarriedItems,
    sanitizeCarriedWeight,
    sanitizeStringArray,
    sanitizeTier,
} from './WorldSessionInput';
import {
    createWorldSessionDebugState,
    type WorldSessionDebugState,
} from './WorldSessionDebugState';
import {
    applyActorResourceDelta,
    getActorCasterSkillStats,
    getActorLearnedSkillIds,
    getAlliedActorsWithin,
    toSkillEffectEnemyInput,
    updateRestingActorResources,
} from './WorldSessionSkillState';
import {
    cloneStatuses,
    createActorEvent,
    createEnemyEvent,
    createToken,
    directionFromTo,
    formationOffset,
    gridToSnapshot,
    hashInt,
    reject,
    storyScenarioGuardOffsets,
    syncStatsMovementToClass,
} from './WorldSessionHelpers';
import type {
    CompleteEnemyKillResult,
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    ServerScenarioState,
    WorldJoinContext,
    WorldSessionPersistentSnapshot,
    WorldSessionDebugCounts,
    WorldSessionMessageResult,
    WorldSessionOptions,
    WorldSessionTickResult,
} from './WorldSessionTypes';

export const WORLD_TICK_MS = 100;
export const DISCONNECT_GRACE_MS = 30_000;
const RAID_LIMIT_SECONDS = 30 * 60;
const AUTO_LOOT_RESPONSE_MS = 5_000;
const FIELD_NEST_REFRESH_INTERVAL_MS = 1_000;

export type { WorldCharacterSavePatch } from './WorldSessionSaveState';
export type { WorldSessionDebugState } from './WorldSessionDebugState';
export { gridToSnapshot } from './WorldSessionHelpers';
export type {
    WorldJoinContext,
    WorldSessionPersistentSnapshot,
    WorldSessionDebugCounts,
    WorldSessionMessageResult,
    WorldSessionOptions,
    WorldSessionTickResult,
} from './WorldSessionTypes';

export class WorldResumeFailedError extends Error {
    public constructor(message = 'Resume token is expired or unknown.') {
        super(message);
    }
}
export class WorldSession {
    public readonly sessionEpoch: number;
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
    private readonly enemyTurnResolver: WorldSessionEnemyTurnResolver;
    private readonly fieldNests: WorldSessionFieldNests;
    private readonly scenarioRewards: WorldSessionScenarioRewards;
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
        this.sessionEpoch = options.sessionEpoch ?? Date.now();
        this.worldMap = new WorldMap(options.realm ?? 'mortal');
        this.shardId = `${this.worldMap.getRealm()}`;
        this.ghostGraceMs = options.ghostGraceMs ?? DISCONNECT_GRACE_MS;
        this.logger = options.logger ?? (() => undefined);
        this.enemyState = new WorldSessionEnemyState<ServerEnemy, ServerActor>({
            getTargetableActors: (entry) => getTargetableActors(this.players, this.actors.values(), entry),
            hasActiveActorWithin: (tile, distance, ownerPlayerId) =>
                hasActiveActorWithin(this.players.values(), this.actors, tile, distance, ownerPlayerId),
        });
        this.enemyTurnResolver = new WorldSessionEnemyTurnResolver({
            players: this.players,
            actors: this.actors,
            enemies: this.enemies,
            enemyState: this.enemyState,
            getServerTileAt: (tile, ownerPlayerId) => this.getServerTileAt(tile, ownerPlayerId),
            isFieldPassable: (query) => this.isFieldPassable(query),
            hasFieldLineOfSight: (from, to, ownerPlayerId) => this.hasFieldLineOfSight(from, to, ownerPlayerId),
        });
        this.fieldNests = new WorldSessionFieldNests({
            worldMap: this.worldMap,
            players: this.players,
            actors: this.actors,
            enemies: this.enemies,
            nestStates: this.nestStates,
            sessionEpoch: this.sessionEpoch,
            nextEnemyId: () => this.nextEnemyId++,
            findNearbyWalkableTile: (tile, actorId, ownerPlayerId) => this.findNearbyWalkableTile(tile, actorId, ownerPlayerId),
        });
        this.scenarioRewards = new WorldSessionScenarioRewards({
            saveState: this.saveState,
        });
    }

    public static restorePersistentSnapshot(snapshot: WorldSessionPersistentSnapshot, options: WorldSessionOptions = {}): WorldSession {
        if (snapshot.version !== 1) {
            throw new Error(`Unsupported world session snapshot version: ${snapshot.version}`);
        }
        const session = new WorldSession({
            ...options,
            realm: snapshot.realm,
            sessionEpoch: snapshot.sessionEpoch,
        });
        session.seq = snapshot.seq;
        session.nextPlayerId = snapshot.nextPlayerId;
        session.nextEnemyId = snapshot.nextEnemyId;
        session.nextLootId = snapshot.nextLootId;
        session.lastTickAt = snapshot.lastTickAt;
        session.lastNestRefreshAt = snapshot.lastNestRefreshAt;

        session.players.clear();
        for (const player of snapshot.players) {
            session.players.set(player.id, restorePersistentPlayer(player));
        }

        session.actors.clear();
        for (const actor of snapshot.actors) {
            session.actors.set(actor.id, clonePersistentActor(actor));
        }

        session.enemies.clear();
        for (const enemy of snapshot.enemies) {
            session.enemies.set(enemy.id, restorePersistentEnemy(enemy));
        }

        session.nestStates.clear();
        for (const nestState of snapshot.nestStates) {
            session.nestStates.set(nestState.chunkKey, clonePersistentNestState(nestState));
        }

        session.scenarioStates.clear();
        for (const scenarioState of snapshot.scenarioStates) {
            session.scenarioStates.set(scenarioState.playerId, clonePersistentScenarioState(scenarioState));
        }

        session.sharedScenarioFieldEventFlags.clear();
        for (const [dungeonId, flags] of snapshot.sharedScenarioFieldEventFlags) {
            session.sharedScenarioFieldEventFlags.set(dungeonId, new Set(flags));
        }

        session.loot.clear();
        for (const loot of snapshot.loot) {
            session.loot.set(loot.id, restorePersistentLoot(loot));
        }

        session.generatedLootChunks.clear();
        for (const chunkKey of snapshot.generatedLootChunks) session.generatedLootChunks.add(chunkKey);
        session.saveState.restoreDirtyPlayerIds(snapshot.dirtyPlayerIds);
        return session;
    }

    public createPersistentSnapshot(): WorldSessionPersistentSnapshot {
        return buildWorldSessionPersistentSnapshot({
            realm: this.worldMap.getRealm(),
            shardId: this.shardId,
            sessionEpoch: this.sessionEpoch,
            seq: this.seq,
            nextPlayerId: this.nextPlayerId,
            nextEnemyId: this.nextEnemyId,
            nextLootId: this.nextLootId,
            lastTickAt: this.lastTickAt,
            lastNestRefreshAt: this.lastNestRefreshAt,
            players: this.players.values(),
            actors: this.actors.values(),
            enemies: this.enemies.values(),
            nestStates: this.nestStates.values(),
            scenarioStates: this.scenarioStates.values(),
            sharedScenarioFieldEventFlags: this.sharedScenarioFieldEventFlags.entries(),
            loot: this.loot.values(),
            generatedLootChunks: this.generatedLootChunks,
            dirtyPlayerIds: this.saveState.getDirtyPlayerIds(),
        });
    }

    public join(message: WorldJoinMessage, now: number = Date.now(), context: WorldJoinContext = {}): { playerId: string; welcome: WorldWelcomeMessage } {
        const resumed = message.resumeToken ? this.findResumablePlayer(message.resumeToken, now) : null;
        if (resumed) {
            resumed.ghost = false;
            resumed.disconnectedAt = null;
            resumed.saveSnapshot ??= cloneCharacterSave(context.saveSnapshot);
            const spawnTile = firstActorTile(resumed, this.actors) ?? this.getOriginExitTile(resumed.originHubId);
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
                    raidModifier: resumed.raidModifier,
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
        const raidModifier = rollRaidModifier(`${this.sessionEpoch}:${this.shardId}:${originHubId}:${playerId}`);
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
            raidModifier,
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
        this.spawnRaidModifierSupplyDrop(player, spawnTile);
        this.spawnMarkedCache(player, spawnTile);
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
                raidModifier: player.raidModifier,
            },
        };
    }

    public reconnect(resumeToken: string, now: number = Date.now()): { playerId: string; welcome: WorldWelcomeMessage } | null {
        const player = this.findResumablePlayer(resumeToken, now);
        if (!player) return null;
        player.ghost = false;
        player.disconnectedAt = null;
        const spawnTile = firstActorTile(player, this.actors) ?? this.getOriginExitTile(player.originHubId);
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
                raidModifier: player.raidModifier,
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

    public disconnectActivePlayersForServerRestart(now: number = Date.now()): void {
        for (const player of this.players.values()) {
            if (!player.active) continue;
            player.ghost = true;
            player.disconnectedAt = now;
            for (const actorId of player.actorIds) {
                const actor = this.actors.get(actorId);
                if (actor) actor.remainingAp = 0;
            }
            this.releaseLootLocksForPlayer(player.id);
            this.log(`ghost start player=${player.id} reason=server_restart graceMs=${this.ghostGraceMs}`);
        }
    }

    public finishActivePlayersForShutdown(now: number = Date.now()): WorldSessionTickResult {
        const perPlayerMessages: Array<{ playerId: string; message: WorldServerMessage }> = [];
        for (const playerId of this.getActivePlayerIds()) {
            this.log(`force extract player=${playerId} reason=server_shutdown`);
            perPlayerMessages.push({ playerId, message: this.finishPlayerForShutdown(playerId) });
        }
        this.lastTickAt = now;
        return { events: [], perPlayerMessages };
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
                this.saveState.captureFinalPatch(player);
                this.saveState.markDirty(player.id);
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
                    const event = this.applyCursedArtifactTurnDamage(player, actor);
                    if (event) events.push(event);
                    if (!actor.isDead && actor.stats.hp > 0) {
                        actor.remainingAp = FIELD_MAX_ACTION_GAUGE;
                        actor.majorActionUsed = false;
                    }
                } else if (actor.actionGauge < FIELD_MAX_ACTION_GAUGE) {
                    actor.actionGauge = advanceAtb(
                        actor.actionGauge,
                        getEffectiveStats(actor.stats, actor.statuses).spd,
                        dt,
                        FIELD_ATB_SCALE
                        * getCarryAtbMultiplier(player.carriedWeight)
                        * getCursedArtifactAtbMultiplier(this.getPlayerCursedArtifactCount(player))
                        * getRaidModifierEffects(player.raidModifier).partyAtbMultiplier
                    );
                    if (actor.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
                        actor.actionGauge = FIELD_MAX_ACTION_GAUGE;
                        const event = this.applyCursedArtifactTurnDamage(player, actor);
                        if (event) events.push(event);
                        if (!actor.isDead && actor.stats.hp > 0) {
                            actor.remainingAp = FIELD_MAX_ACTION_GAUGE;
                            actor.majorActionUsed = false;
                        }
                    }
                }
            }
        }

        if (now - this.lastNestRefreshAt >= FIELD_NEST_REFRESH_INTERVAL_MS) {
            this.lastNestRefreshAt = now;
            this.fieldNests.refreshFieldNests(now);
        }

        for (const entry of this.enemies.values()) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            if (this.enemyState.advanceEnemy(entry, dt) === 'ready') {
                events.push(...this.enemyTurnResolver.resolveEnemyTurn(entry, now));
                enemy.actionGauge = 0;
            }
        }

        this.releaseExpiredAutoLoot(now);
        this.releaseExpiredLootLocks(now);
        for (const player of [...this.players.values()]) {
            if (!player.active || player.ghost) continue;
            if (isPlayerWiped(player, this.actors)) {
                perPlayerMessages.push({ playerId: player.id, message: this.finishPlayer(player.id, 'DEAD') });
            }
        }

        return { events, perPlayerMessages };
    }

    public createSnapshot(viewerPlayerId: string | null = null, now: number = Date.now()): WorldSnapshot {
        this.seq += 1;
        return buildWorldSessionSnapshot({
            seq: this.seq,
            now,
            viewerPlayerId,
            raidLimitSeconds: RAID_LIMIT_SECONDS,
            players: this.players,
            actors: this.actors,
            enemies: this.enemies.values(),
            loot: this.loot.values(),
            lootState: this.lootState,
            sharedScenarioFieldEventFlags: this.sharedScenarioFieldEventFlags,
        });
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

    public markCharacterSaveDirty(playerId: string): void {
        this.saveState.markDirty(playerId);
    }

    public createCharacterSavePatch(playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        const player = this.players.get(playerId);
        return this.saveState.createPatch(player, playerId, hubTownId);
    }

    public createRecoveryCharacterSavePatch(playerId: string, hubTownId?: string): WorldCharacterSavePatch | null {
        const player = this.players.get(playerId);
        return this.saveState.createRecoveryPatch(player, playerId, hubTownId);
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

    public getDebugState(): WorldSessionDebugState {
        return createWorldSessionDebugState({
            players: this.players,
            actors: this.actors,
            enemies: this.enemies,
            nestStates: this.nestStates,
            scenarioStates: this.scenarioStates,
            loot: this.loot,
        });
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

        const path = planMoveIntentPath({
            actor,
            targetTile: tile,
            isPassable: (query) => this.isFieldPassableForOwner(query, actor.ownerPlayerId),
            terrainCost: (step) => getTerrainMoveCost(this.getServerTileAt(step, actor.ownerPlayerId)),
        });
        if (path.length === 0 && manhattan(actor.tile, tile) > 0) return reject(intentId, 'No valid path.');

        if (actor.remainingAp < MOVE_ACTION_GAUGE_COST) return reject(intentId, 'No action available for movement.');

        this.spendActorGauge(actor, MOVE_ACTION_GAUGE_COST);
        removeActionStanceStatusesFromCarrier(actor);
        if (path.length > 0) {
            const next = path[path.length - 1];
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
        if (!canActorTargetEnemy(actor, target)) return reject(intentId, 'Target is not visible.');
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
        addCarriedItemQuantity(player, itemId, -1);
        this.saveState.removeItemQuantity(player, itemId, 1);
        this.saveState.markDirty(player.id);
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
        if (!getActorLearnedSkillIds(actor).has(skill.id)) return reject(intentId, 'Skill is not learned by this actor.');
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
            if (!canActorTargetEnemy(actor, target)) return reject(intentId, 'Target is not visible.');
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
            .filter((entry) => canActorTargetEnemy(actor, entry));
        const targetEnemies = target && targetTile
            ? getSkillCandidateEnemies(aliveEnemies.map((entry) => entry.enemy), profile, this.getSkillPatternContext(actor, targetTile), target.enemy)
            : [];
        // Authoritative damage/heal/duration scaling: apply the same enhancement
        // helper the client uses so results stay in lockstep (no desync).
        const effectiveSkill = getEffectiveSkill(skill, getUpgradeLevel(actor.skillUpgradeLevels, skill.id));
        const effect = resolveSkillEffect({
            casterStats: getActorCasterSkillStats(actor),
            skill: effectiveSkill,
            targetEnemy: target ? toSkillEffectEnemyInput(target.enemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => toSkillEffectEnemyInput(enemy)),
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
        const player = this.players.get(playerId);
        if (player?.activeDungeonId) return reject(intentId, 'Loot is not visible.');
        const lootObject = this.loot.get(lootId);
        if (!lootObject || lootObject.opened || this.lootState.isAutoLootPending(lootId)) return reject(intentId, 'Loot is not available.');
        if (actor.remainingAp < INTERACT_AP_COST) return reject(intentId, 'No action available to inspect loot.');
        if (manhattan(actor.tile, { x: lootObject.x, y: lootObject.y }) > 1) return reject(intentId, 'Loot is too far away.');
        if (lootObject.containerType === 'marked_cache' && !lootObject.unlocked) {
            if ((player?.carriedItems.get(MASTER_KEY_ITEM_ID) ?? 0) <= 0) {
                return reject(intentId, 'Master key is required to open this marked cache.');
            }
        }

        if (this.lootState.occupy(lootId, playerId, now) === 'occupied_by_other') return reject(intentId, 'Loot is already occupied.');

        this.spendActorGauge(actor, INTERACT_AP_COST);
        const replies: WorldServerMessage[] = [];
        if (lootObject.containerType === 'marked_cache' && !lootObject.unlocked && player) {
            addCarriedItemQuantity(player, MASTER_KEY_ITEM_ID, -1);
            this.saveState.removeItemQuantity(player, MASTER_KEY_ITEM_ID, 1);
            this.saveState.markDirty(player.id);
            lootObject.unlocked = true;
            replies.push({
                type: 'INVENTORY_CONSUMED',
                itemId: MASTER_KEY_ITEM_ID,
                quantity: 1,
            } satisfies InventoryConsumedMessage);
        }
        this.finishActorIfSpent(actor);
        replies.push({
            type: 'LOOT_GRANT',
            lootId,
            gridSnapshot: gridToSnapshot(lootObject.inventory),
        } satisfies LootGrantMessage);
        return {
            replies,
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
        const player = this.players.get(playerId);
        lootObject.inventory.remove(placed);
        addCarriedWeight(player, getPlacedItemWeight(placed));
        addCarriedItemQuantity(player, placed.item.id, placed.quantity);
        if (player) {
            this.saveState.addPlacedItem(player, placed);
            this.saveState.markDirty(playerId);
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
        const player = this.players.get(playerId);
        for (const cell of acceptedCells) {
            const placed = lootObject.inventory.getAt(cell.gridX, cell.gridY);
            if (!placed || removed.has(placed)) continue;
            lootObject.inventory.remove(placed);
            removed.add(placed);
            acceptedWeight += getPlacedItemWeight(placed);
            addCarriedItemQuantity(player, placed.item.id, placed.quantity);
            if (player) this.saveState.addPlacedItem(player, placed);
        }
        addCarriedWeight(player, acceptedWeight);
        if (acceptedWeight > 0 || removed.size > 0) this.saveState.markDirty(playerId);

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
        if (hasNearbyAggroEnemy(this.enemies.values(), actor!.tile, 18, playerId)) return reject(message.intentId, 'Nearby combat must be resolved before entering a scenario.');

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
        if (!this.scenarioRewards.canConsumeFieldEventUseItems(player!, event)) {
            return reject(message.intentId, 'Scenario field event requires a missing item.');
        }
        if (!this.scenarioRewards.rollFieldEventRandom(event)) {
            return reject(message.intentId, 'Scenario field event random condition failed.');
        }
        if (!this.scenarioRewards.canApplyRewards(player!, event.rewards)) {
            return reject(message.intentId, 'Scenario field event reward storage is full.');
        }

        this.markScenarioFieldEventFlagComplete(player!, dungeonId, flag, scope);
        this.scenarioRewards.consumeFieldEventUseItems(player!, event);
        const rewards = this.scenarioRewards.applyFieldEventRewards(player!, event);
        const trapDamage = this.scenarioRewards.applyFieldEventTrapMagic(actor!, event);
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
            ...(trapDamage ? { trapDamage } : {}),
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
        applyActorResourceDelta(actor, effect.casterHpDelta, effect.casterMpDelta);
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
                ? getAlliedActorsWithin(this.actors, player, actor.tile, skill.allyRadius ?? 0)
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
                applyActorResourceDelta(actor, 0, drainedMp);
                if (drainedMp > 0) broadcasts.push(createEnemyEvent('status', actor, enemy, drainedMp));
            }

            const guarded = applyGuardToDamage(enemy.statuses, enemyResult.damage);
            enemy.statuses = guarded.statuses;
            const dead = enemy.takeDamage(guarded.damage);
            if (enemyResult.casterHpRestore !== undefined && enemyResult.casterHpRestore > 0) {
                applyActorResourceDelta(actor, enemyResult.casterHpRestore, 0);
                broadcasts.push(createActorEvent('heal', actor, actor, enemyResult.casterHpRestore));
            }
            if (enemyResult.casterMpRestore !== undefined && enemyResult.casterMpRestore > 0) {
                applyActorResourceDelta(actor, 0, enemyResult.casterMpRestore);
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
        if (target.nestKey) this.fieldNests.markNestEnemyKilled(target.nestKey, enemy.id, now);
        if (target.scenarioPlayerId && target.scenarioDungeonId) this.markScenarioEnemyKilled(target, enemy.id);
        const player = this.players.get(actor.ownerPlayerId);
        if (player) player.kills += 1;
        const autoLootGrant = enemy.isBoss
            ? undefined
            : this.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
        if (enemy.isBoss || !autoLootGrant) this.spawnEnemyLoot(enemy, scenarioBossLootTile ?? undefined);
        return { autoLootGrant, scenarioEnemyDefeatEvent };
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
            if (survived) {
                message.firstSurvivalBonusGranted = this.saveState.grantsFirstSurvivalBonus(player);
            }
            this.saveState.captureFinalPatch(player, survived ? extractionTownId : undefined, survived);
            this.saveState.markDirty(playerId);
        }
        this.removePlayer(playerId);
        return message;
    }

    private finishPlayerForShutdown(playerId: string): RaidResultMessage {
        const player = this.players.get(playerId);
        const extractionTownId = player?.departureTownId ?? this.resolveExtractionTownId(player);
        const message: RaidResultMessage = {
            type: 'RAID_RESULT',
            playerId,
            result: 'SURVIVED',
            elapsedSeconds: player?.elapsedSeconds ?? 0,
            kills: player?.kills ?? 0,
            departureTownId: player?.departureTownId ?? 'central_castle',
            extractionTownId,
            completedDungeonIds: player ? [...player.completedDungeonIds] : [],
        };
        this.log(`raid result player=${playerId} result=SURVIVED reason=server_shutdown kills=${message.kills} elapsed=${message.elapsedSeconds.toFixed(1)}`);
        if (player) {
            message.firstSurvivalBonusGranted = this.saveState.grantsFirstSurvivalBonus(player);
            this.saveState.captureFinalPatch(player, extractionTownId, true);
            this.saveState.markDirty(playerId);
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

    private applyCursedArtifactTurnDamage(player: ServerPlayer, actor: ServerActor): CombatEventMessage | null {
        const damage = Math.min(
            actor.stats.hp,
            getCursedArtifactTurnDamage(actor.stats, this.getPlayerCursedArtifactCount(player))
        );
        if (damage <= 0) return null;

        actor.stats.hp = Math.max(0, actor.stats.hp - damage);
        removeActionStanceStatusesFromCarrier(actor);
        if (actor.stats.hp <= 0) {
            actor.isDead = true;
            actor.remainingAp = 0;
            actor.actionGauge = 0;
            actor.majorActionUsed = false;
        }
        return createActorEvent(actor.isDead ? 'down' : 'curse', actor, actor, damage);
    }

    private getPlayerCursedArtifactCount(player: ServerPlayer): number {
        return countCursedArtifactsInItemCounts(player.carriedItems, (itemId) => getItemDef(itemId));
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
        this.scenarioRewards.applyBossDefeatRewards(player, dungeonId);
        if (state?.returnTile) this.returnPlayerActorsFromScenarioInterior(player, state.returnTile);
        this.saveState.markDirty(player.id);

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
        this.saveState.markDirty(player.id);
    }

    private ensureContentNear(spawnTile: TilePoint, departureTownId: string | null | undefined, now: number): void {
        if (!hasNearbyLiveEnemy(this.enemies.values(), spawnTile, FIELD_NEST_NEARBY_ENEMY_DISTANCE)) {
            this.fieldNests.spawnEnemiesNear(
                spawnTile,
                now,
                false,
                new Set(),
                WORLD_SESSION_FIELD_NEST_DEPARTURE_RADIUS_CHUNKS,
                WORLD_SESSION_FIELD_NEST_DEPARTURE_MAX_ENEMIES,
            );
        }

        this.spawnLootNear(spawnTile, departureTownId);
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

    private spawnRaidModifierSupplyDrop(player: ServerPlayer, spawnTile: TilePoint): void {
        if (!getRaidModifierEffects(player.raidModifier).supplyDrop) return;
        const items = getRaidModifierSupplyItems();
        if (items.length === 0) return;

        const tile = this.findNearbyWalkableTile({
            x: spawnTile.x + 6,
            y: spawnTile.y + 3,
        }, `${player.id}:supply_drop`, player.id);
        const id = `loot_supply_drop_${player.id}`;
        this.loot.set(id, new LootObject(id, tile.x, tile.y, items, {
            sourceLabel: 'Supply Drop',
            kind: 'chest',
            containerType: 'supply_cache',
            gridW: 5,
            gridH: 4,
        }));
    }

    private spawnMarkedCache(player: ServerPlayer, spawnTile: TilePoint): void {
        const items = getMarkedCacheItems(`${this.sessionEpoch}:${this.shardId}:${player.id}:marked_cache`);
        if (items.length === 0) return;

        const tile = this.findNearbyWalkableTile({
            x: spawnTile.x + 34,
            y: spawnTile.y + 18,
        }, `${player.id}:marked_cache`, player.id);
        const id = `loot_marked_cache_${player.id}`;
        this.loot.set(id, new LootObject(id, tile.x, tile.y, items, {
            sourceLabel: getWorldLootSourceLabel('marked_cache'),
            kind: 'chest',
            containerType: 'marked_cache',
            gridW: 5,
            gridH: 5,
        }));
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

    private updateRestingActor(actor: ServerActor, dt: number): void {
        const timerUpdate = updateRestingActorResources(actor, this.restingRecoveryTimers.get(actor.id), dt);
        if (timerUpdate.type === 'delete') {
            this.restingRecoveryTimers.delete(actor.id);
            return;
        }
        if (timerUpdate.type === 'set') {
            this.restingRecoveryTimers.set(actor.id, timerUpdate.timer);
        }
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
