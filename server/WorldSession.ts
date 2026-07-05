import {
    applyGuardToDamage,
    getEffectiveStats,
    getEffectiveStatsForEnemy,
    removeActionStanceStatusesFromCarrier,
} from '../src/combat/StatusEffects';
import { CombatFormulas } from '../src/combat/CombatFormulas';
import { getItemDef } from '../src/data/ItemDB';
import {
    normalizeLoadout,
    normalizeUpgradeLevels,
} from '../src/magic/MagicLoadout';
import {
    getStoryInteriorLayout,
    getStoryInteriorTileAt,
    type StoryInteriorLayout,
} from '../src/data/StoryInteriorData';
import type { FieldNestState } from '../src/field/SpawnResolver';
import { LootObject } from '../src/entity/LootObject';
import { getCarryAtbMultiplier } from '../src/inventory/CarryWeight';
import {
    countCursedArtifactsInItemCounts,
    getCursedArtifactAtbMultiplier,
    getCursedArtifactTurnDamage,
} from '../src/raid/CursedArtifact';
import {
    getRaidModifierEffects,
    rollRaidModifier,
} from '../src/raid/RaidModifiers';
import {
    FIELD_MAX_ACTION_GAUGE,
    MIN_FIELD_ACTION_GAUGE_COST,
} from '../src/field/FieldActionEconomy';
import { FIELD_ATB_SCALE } from '../src/field/FieldConfig';
import { advanceAtb } from '../src/field/FieldCombat';
import {
    manhattan,
    type FieldPassableQuery,
    type TilePoint,
} from '../src/field/FieldPathing';
import { hasLineOfSight } from '../src/field/LineOfSight';
import {
    isTerrainLineOfSightBlocking,
    isTerrainPassable,
} from '../src/field/TerrainRules';
import { WorldMap } from '../src/map/WorldMap';
import type { TownInfo } from '../src/map/BiomeMask';
import {
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type ScenarioEnemyDefeatEventMessage,
    type WorldClientMessage,
    type WorldJoinMessage,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from '../src/net/WorldProtocol';
import { WorldSessionLootState } from './WorldSessionLootState';
import { cloneCharacterSave, WorldSessionSaveState, type WorldCharacterSavePatch } from './WorldSessionSaveState';
import { WorldSessionEnemyState } from './WorldSessionEnemyState';
import { WorldSessionEnemyTurnResolver } from './WorldSessionEnemyTurnResolver';
import {
    WorldSessionFieldNests,
} from './WorldSessionFieldNests';
import { WorldSessionScenarioRewards } from './WorldSessionScenarioRewards';
import { WorldSessionScenarioRuntime } from './WorldSessionScenarioRuntime';
import {
    WorldSessionPlayerIntentResolver,
    type WorldSessionActorAttackResult,
} from './WorldSessionPlayerIntentResolver';
import { WorldSessionRaidResults } from './WorldSessionRaidResults';
import { WorldSessionLootResolver } from './WorldSessionLootResolver';
import { WorldSessionSkillResolver } from './WorldSessionSkillResolver';
import { WorldSessionContentSpawner } from './WorldSessionContentSpawner';
import {
    firstActorTile,
    hasActiveActorWithin,
} from './WorldSessionSpatialQueries';
import {
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
    updateRestingActorResources,
} from './WorldSessionSkillState';
import {
    cloneStatuses,
    createActorEvent,
    createToken,
    formationOffset,
    reject,
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

function canResumePlayerWithContext(player: ServerPlayer, context: WorldJoinContext): boolean {
    if (context.accountId !== undefined && player.accountId !== context.accountId) return false;
    if (context.characterId !== undefined && player.characterId !== context.characterId) return false;
    return true;
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
    private readonly scenarioRuntime: WorldSessionScenarioRuntime;
    private readonly playerIntentResolver: WorldSessionPlayerIntentResolver;
    private readonly raidResults: WorldSessionRaidResults;
    private readonly lootResolver: WorldSessionLootResolver;
    private readonly skillResolver: WorldSessionSkillResolver;
    private readonly contentSpawner: WorldSessionContentSpawner;
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
        this.scenarioRuntime = new WorldSessionScenarioRuntime({
            players: this.players,
            actors: this.actors,
            enemies: this.enemies,
            scenarioStates: this.scenarioStates,
            sharedFieldEventFlags: this.sharedScenarioFieldEventFlags,
            worldMap: this.worldMap,
            saveState: this.saveState,
            rewards: this.scenarioRewards,
            allocateScenarioEnemyId: () => {
                const id = `scenario_${this.nextEnemyId++}`;
                return { id, seedOrdinal: this.nextEnemyId };
            },
            findNearbyWalkableTile: (tile, actorId, ownerPlayerId) => this.findNearbyWalkableTile(tile, actorId, ownerPlayerId),
            log: (message) => this.log(message),
        });
        this.contentSpawner = new WorldSessionContentSpawner({
            worldMap: this.worldMap,
            enemies: this.enemies,
            loot: this.loot,
            lootState: this.lootState,
            fieldNests: this.fieldNests,
            generatedLootChunks: this.generatedLootChunks,
            sessionEpoch: this.sessionEpoch,
            shardId: this.shardId,
            allocateLootId: (containerType) => containerType
                ? `loot_${containerType}_${this.nextLootId++}`
                : `loot_${this.nextLootId++}`,
            findNearbyWalkableTile: (tile, actorId, ownerPlayerId) => this.findNearbyWalkableTile(tile, actorId, ownerPlayerId),
        });
        this.playerIntentResolver = new WorldSessionPlayerIntentResolver({
            players: this.players,
            enemies: this.enemies,
            saveState: this.saveState,
            getServerTileAt: (tile, ownerPlayerId) => this.getServerTileAt(tile, ownerPlayerId),
            isFieldPassableForOwner: (query, ownerPlayerId) => this.isFieldPassableForOwner(query, ownerPlayerId),
            hasFieldLineOfSight: (from, to, ownerPlayerId) => this.hasFieldLineOfSight(from, to, ownerPlayerId),
            spawnLootNear: (anchor, departureTownId) => this.contentSpawner.spawnLootNear(anchor, departureTownId),
            spendActorGauge: (actor, cost) => this.spendActorGauge(actor, cost),
            finishActorIfSpent: (actor) => this.finishActorIfSpent(actor),
            resolveActorAttack: (actor, target, now) => this.resolveActorAttack(actor, target, now),
        });
        this.raidResults = new WorldSessionRaidResults({
            players: this.players,
            actors: this.actors,
            worldMap: this.worldMap,
            saveState: this.saveState,
            log: (message) => this.log(message),
            removePlayer: (playerId) => this.removePlayer(playerId),
        });
        this.lootResolver = new WorldSessionLootResolver({
            players: this.players,
            actors: this.actors,
            loot: this.loot,
            lootState: this.lootState,
            saveState: this.saveState,
            spendActorGauge: (actor, cost) => this.spendActorGauge(actor, cost),
            finishActorIfSpent: (actor) => this.finishActorIfSpent(actor),
        });
        this.skillResolver = new WorldSessionSkillResolver({
            actors: this.actors,
            enemies: this.enemies,
            getServerTileAt: (tile, ownerPlayerId) => this.getServerTileAt(tile, ownerPlayerId),
            getServerBoundsForOwner: (ownerPlayerId) => this.getServerBoundsForOwner(ownerPlayerId),
            hasFieldLineOfSight: (from, to, ownerPlayerId) => this.hasFieldLineOfSight(from, to, ownerPlayerId),
            spendActorGauge: (actor, cost) => this.spendActorGauge(actor, cost),
            finishActorIfSpent: (actor) => this.finishActorIfSpent(actor),
            completeEnemyKill: (actor, target, now) => this.completeEnemyKill(actor, target, now),
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
            if (!canResumePlayerWithContext(resumed, context)) {
                this.log(`resume denied reason=owner_mismatch player=${resumed.id}`);
                throw new WorldResumeFailedError('Resume token does not belong to this account or character.');
            }
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

        this.contentSpawner.ensureContentNear(spawnTile, player.departureTownId, now);
        this.contentSpawner.spawnRaidModifierSupplyDrop(player, spawnTile);
        this.contentSpawner.spawnMarkedCache(player, spawnTile);
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
        this.lootResolver.releaseLocksForPlayer(playerId);
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
            this.lootResolver.releaseLocksForPlayer(player.id);
            this.log(`ghost start player=${player.id} reason=server_restart graceMs=${this.ghostGraceMs}`);
        }
    }

    public finishActivePlayersForShutdown(now: number = Date.now()): WorldSessionTickResult {
        const perPlayerMessages: Array<{ playerId: string; message: WorldServerMessage }> = [];
        for (const playerId of this.getActivePlayerIds()) {
            this.log(`force extract player=${playerId} reason=server_shutdown`);
            perPlayerMessages.push({ playerId, message: this.raidResults.finishPlayerForShutdown(playerId) });
        }
        this.lastTickAt = now;
        return { events: [], perPlayerMessages };
    }

    public handleMessage(playerId: string, message: WorldClientMessage, now: number = Date.now()): WorldSessionMessageResult {
        switch (message.type) {
            case 'PLAYER_INTENT':
                return this.handleIntent(playerId, message, now);
            case 'LOOT_PICKUP':
                return this.lootResolver.handleLootPickup(playerId, message.intentId, message.lootId, message.gridX, message.gridY, now);
            case 'AUTO_LOOT_RESOLVE':
                return this.lootResolver.handleAutoLootResolve(playerId, message.lootId, message.acceptedCells);
            case 'SCENARIO_ENTER':
                return this.scenarioRuntime.handleEnter(playerId, message, now);
            case 'SCENARIO_FIELD_EVENT_INTERACT':
                return this.scenarioRuntime.handleFieldEventInteract(playerId, message);
            case 'WORLD_LEAVE':
                this.log(`leave player=${playerId} reason=${message.reason}`);
                return {
                    replies: [this.raidResults.finishPlayer(playerId, this.raidResults.resolveRequestedRaidResult(playerId, message.reason))],
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
                perPlayerMessages.push({ playerId: player.id, message: this.raidResults.finishPlayer(player.id, 'MIA') });
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

        this.lootResolver.releaseExpiredAutoLoot(now);
        this.lootResolver.releaseExpiredLootLocks(now);
        for (const player of [...this.players.values()]) {
            if (!player.active || player.ghost) continue;
            if (isPlayerWiped(player, this.actors)) {
                perPlayerMessages.push({ playerId: player.id, message: this.raidResults.finishPlayer(player.id, 'DEAD') });
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

    public hasActiveCharacter(accountId: string, characterId: string): boolean {
        return [...this.players.values()].some((player) =>
            player.active
            && player.accountId === accountId
            && player.characterId === characterId
        );
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
                return this.playerIntentResolver.handleMove(actor!, message.intentId, message.payload);
            case 'attack':
                return this.playerIntentResolver.handleAttack(actor!, message.intentId, message.payload, now);
            case 'interact':
                return this.lootResolver.handleLootInspect(playerId, actor!, message.intentId, message.payload, now);
            case 'defend':
                return this.playerIntentResolver.handleDefend(actor!, message.intentId);
            case 'rest':
                return this.playerIntentResolver.handleRest(actor!, message.intentId);
            case 'endTurn':
                return { replies: [], broadcasts: [] };
            case 'useItem':
                return this.playerIntentResolver.handleUseItem(player!, actor!, message.intentId, message.payload);
            case 'castSkill':
                return this.skillResolver.handleCastSkill(player!, actor!, message.intentId, message.payload, now);
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

    private resolveActorAttack(
        actor: ServerActor,
        target: ServerEnemy,
        now: number
    ): WorldSessionActorAttackResult {
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
        const scenarioKillResult = this.scenarioRuntime.completeEnemyKill(target, enemy.id);
        this.enemies.delete(enemy.id);
        if (target.nestKey) this.fieldNests.markNestEnemyKilled(target.nestKey, enemy.id, now);
        const player = this.players.get(actor.ownerPlayerId);
        if (player) player.kills += 1;
        const autoLootGrant = enemy.isBoss
            ? undefined
            : this.contentSpawner.spawnEnemyAutoLoot(enemy, actor.ownerPlayerId, now);
        if (enemy.isBoss || !autoLootGrant) this.contentSpawner.spawnEnemyLoot(enemy, scenarioKillResult.bossLootTile);
        return { autoLootGrant, scenarioEnemyDefeatEvent: scenarioKillResult.scenarioEnemyDefeatEvent };
    }

    private removePlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;
        this.scenarioRuntime.removePlayerRuntime(playerId);
        for (const actorId of player.actorIds) this.actors.delete(actorId);
        this.players.delete(playerId);
        this.lootResolver.releaseLocksForPlayer(playerId);
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

}
