import type { FieldNestState } from '../src/field/SpawnResolver';
import { LootObject } from '../src/entity/LootObject';
import { rollRaidModifier } from '../src/raid/RaidModifiers';
import {
    type FieldPassableQuery,
    type TilePoint,
} from '../src/field/FieldPathing';
import { WorldMap } from '../src/map/WorldMap';
import type { TownInfo } from '../src/map/BiomeMask';
import {
    type CombatEventMessage,
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
    createWorldSessionDebugState,
    type WorldSessionDebugState,
} from './WorldSessionDebugState';
import {
    createToken,
} from './WorldSessionHelpers';
import {
    applyWorldSessionCursedArtifactTurnDamage,
    endWorldSessionActorTurn,
    finishWorldSessionActorIfSpent,
    getWorldSessionPlayerCursedArtifactCount,
    spendWorldSessionActorGauge,
    updateWorldSessionRestingActor,
} from './WorldSessionActorLifecycle';
import {
    completeWorldSessionEnemyKill,
    resolveWorldSessionActorAttack,
    type WorldSessionEnemyKillContext,
} from './WorldSessionCombatResolution';
import {
    findNearbyWorldSessionWalkableTile,
    getWorldSessionServerBoundsForOwner,
    getWorldSessionServerTileAt,
    hasWorldSessionFieldLineOfSight,
    isWorldSessionFieldPassable,
    isWorldSessionFieldPassableForOwner,
    type WorldSessionTerrainQueryContext,
} from './WorldSessionTerrainQueries';
import {
    buildWorldSessionJoinedPlayer,
    buildWorldSessionWelcome,
} from './WorldSessionJoinBuilder';
import { tickWorldSession } from './WorldSessionTickProcessor';
import { handleWorldSessionMessage } from './WorldSessionMessageDispatcher';
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
                welcome: buildWorldSessionWelcome({
                    player: resumed,
                    sessionEpoch: this.sessionEpoch,
                    spawnTile,
                    accountId: context.accountId,
                    shardId: context.shardId ?? this.shardId,
                    realm: this.worldMap.getRealm(),
                }),
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
        const { player, actors } = buildWorldSessionJoinedPlayer({
            message,
            context,
            playerId,
            resumeToken,
            originHubId,
            spawnTile,
            raidModifier,
            findNearbyWalkableTile: (tile, actorId) => this.findNearbyWalkableTile(tile, actorId),
        });
        this.players.set(playerId, player);
        for (const actor of actors) this.actors.set(actor.id, actor);

        this.contentSpawner.ensureContentNear(spawnTile, player.departureTownId, now);
        this.contentSpawner.spawnRaidModifierSupplyDrop(player, spawnTile);
        this.contentSpawner.spawnMarkedCache(player, spawnTile);
        this.log(`join player=${playerId} origin=${originHubId} actors=${player.actorIds.length}`);
        return {
            playerId,
            welcome: buildWorldSessionWelcome({
                player,
                sessionEpoch: this.sessionEpoch,
                spawnTile,
                accountId: context.accountId,
                shardId: context.shardId ?? this.shardId,
                realm: this.worldMap.getRealm(),
            }),
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
        return handleWorldSessionMessage({
            players: this.players,
            actors: this.actors,
            lootResolver: this.lootResolver,
            playerIntentResolver: this.playerIntentResolver,
            raidResults: this.raidResults,
            scenarioRuntime: this.scenarioRuntime,
            skillResolver: this.skillResolver,
            endActorTurn: (actor) => this.endActorTurn(actor),
            log: (entry) => this.log(entry),
        }, playerId, message, now);
    }

    public tick(now: number = Date.now()): WorldSessionTickResult {
        const dt = this.consumeTickDelta(now);
        return tickWorldSession({
            now,
            dt,
            raidLimitSeconds: RAID_LIMIT_SECONDS,
            fieldNestRefreshIntervalMs: FIELD_NEST_REFRESH_INTERVAL_MS,
            ghostGraceMs: this.ghostGraceMs,
            lastNestRefreshAt: this.lastNestRefreshAt,
            players: this.players,
            actors: this.actors,
            enemies: this.enemies,
            saveState: this.saveState,
            fieldNests: this.fieldNests,
            enemyState: this.enemyState,
            enemyTurnResolver: this.enemyTurnResolver,
            lootResolver: this.lootResolver,
            raidResults: this.raidResults,
            setLastNestRefreshAt: (value) => { this.lastNestRefreshAt = value; },
            removePlayer: (playerId) => this.removePlayer(playerId),
            updateRestingActor: (actor, elapsed) => this.updateRestingActor(actor, elapsed),
            applyCursedArtifactTurnDamage: (player, actor) => this.applyCursedArtifactTurnDamage(player, actor),
            getPlayerCursedArtifactCount: (player) => this.getPlayerCursedArtifactCount(player),
            log: (message) => this.log(message),
        });
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

    public placePlayerAtTownForTest(playerId: string, townId: string): { townId: string; tile: TilePoint } | null {
        const player = this.players.get(playerId);
        const town = this.getTownById(townId);
        if (!player || !town) return null;

        const tile = this.worldMap.getTownSpawnTile(town);
        for (const actorId of player.actorIds) {
            const actor = this.actors.get(actorId);
            if (!actor) continue;
            actor.tile = { ...tile };
            actor.actionGauge = 0;
            actor.remainingAp = 0;
            actor.facing = 'down';
        }
        return { townId: town.id, tile };
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

    private resolveActorAttack(
        actor: ServerActor,
        target: ServerEnemy,
        now: number
    ): WorldSessionActorAttackResult {
        return resolveWorldSessionActorAttack({
            enemyKillContext: this.getEnemyKillContext(),
            getServerTileAt: (tile, ownerPlayerId) => this.getServerTileAt(tile, ownerPlayerId),
        }, actor, target, now);
    }

    private completeEnemyKill(actor: ServerActor, target: ServerEnemy, now: number): CompleteEnemyKillResult {
        return completeWorldSessionEnemyKill(this.getEnemyKillContext(), actor, target, now);
    }

    private removePlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;
        this.scenarioRuntime.removePlayerRuntime(playerId);
        for (const actorId of player.actorIds) this.actors.delete(actorId);
        this.players.delete(playerId);
        this.lootResolver.releaseLocksForPlayer(playerId);
    }

    private getTerrainQueryContext(): WorldSessionTerrainQueryContext {
        return {
            worldMap: this.worldMap,
            players: this.players,
            actors: this.actors,
            enemies: this.enemies,
        };
    }

    private getEnemyKillContext(): WorldSessionEnemyKillContext {
        return {
            scenarioRuntime: this.scenarioRuntime,
            enemies: this.enemies,
            fieldNests: this.fieldNests,
            players: this.players,
            contentSpawner: this.contentSpawner,
        };
    }

    private isFieldPassable(query: FieldPassableQuery): boolean {
        return isWorldSessionFieldPassable(this.getTerrainQueryContext(), query);
    }

    private isFieldPassableForOwner(query: FieldPassableQuery, ownerPlayerId?: string): boolean {
        return isWorldSessionFieldPassableForOwner(this.getTerrainQueryContext(), query, ownerPlayerId);
    }

    private getServerTileAt(tile: TilePoint, ownerPlayerId?: string | null): ReturnType<WorldMap['getTileAt']> {
        return getWorldSessionServerTileAt(this.getTerrainQueryContext(), tile, ownerPlayerId);
    }

    private getServerBoundsForOwner(ownerPlayerId?: string | null): ReturnType<WorldMap['getBoundsTiles']> {
        return getWorldSessionServerBoundsForOwner(this.getTerrainQueryContext(), ownerPlayerId);
    }

    private hasFieldLineOfSight(from: TilePoint, to: TilePoint, ownerPlayerId?: string): boolean {
        return hasWorldSessionFieldLineOfSight(this.getTerrainQueryContext(), from, to, ownerPlayerId);
    }

    private finishActorIfSpent(actor: ServerActor): void {
        finishWorldSessionActorIfSpent(actor);
    }

    private applyCursedArtifactTurnDamage(player: ServerPlayer, actor: ServerActor): CombatEventMessage | null {
        return applyWorldSessionCursedArtifactTurnDamage(player, actor);
    }

    private getPlayerCursedArtifactCount(player: ServerPlayer): number {
        return getWorldSessionPlayerCursedArtifactCount(player);
    }

    private endActorTurn(actor: ServerActor): void {
        endWorldSessionActorTurn(actor);
    }

    private spendActorGauge(actor: ServerActor, cost: number): void {
        spendWorldSessionActorGauge(actor, cost);
    }

    private findNearbyWalkableTile(tile: TilePoint, actorId: string, ownerPlayerId?: string): TilePoint {
        return findNearbyWorldSessionWalkableTile(this.getTerrainQueryContext(), tile, actorId, ownerPlayerId);
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
        updateWorldSessionRestingActor(actor, this.restingRecoveryTimers, dt);
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
