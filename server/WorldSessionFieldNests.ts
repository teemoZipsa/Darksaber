import {
    CHUNK_TILES,
    nestMemberOffsets,
    pickNestForChunk,
    type FieldNest,
    type FieldNestState,
} from '../src/field/SpawnResolver';
import { Enemy } from '../src/entity/Enemy';
import { getMonsterDefinition } from '../src/data/MonsterCatalog';
import type { WorldMap } from '../src/map/WorldMap';
import type { TilePoint } from '../src/field/FieldPathing';
import {
    firstLivingActorTile,
    hasActiveActorWithin,
    hasNearbyLiveEnemy,
} from './WorldSessionSpatialQueries';
import {
    chunkOffsetsByDistance,
    nestStateKey,
} from './WorldSessionHelpers';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
} from './WorldSessionTypes';

const FIELD_NEST_RESPAWN_MS = 5 * 60_000;
const FIELD_NEST_RESPAWN_SAFE_DISTANCE = 18;
const FIELD_NEST_ROAM_RADIUS_CHUNKS = 2;
const FIELD_NEST_DEPARTURE_RADIUS_CHUNKS = 4;
const FIELD_NEST_DEPARTURE_MAX_ENEMIES = 18;
const FIELD_NEST_REFRESH_MAX_ENEMIES = 28;
export const FIELD_NEST_NEARBY_ENEMY_DISTANCE = 24;
const FIELD_NEST_SPAWN_SAFE_DISTANCE = 10;

export interface WorldSessionFieldNestContext {
    worldMap: WorldMap;
    players: ReadonlyMap<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    enemies: Map<string, ServerEnemy>;
    nestStates: Map<string, FieldNestState>;
    sessionEpoch: number;
    nextEnemyId: () => number;
    findNearbyWalkableTile: (tile: TilePoint, actorId: string, ownerPlayerId?: string) => TilePoint;
}

export class WorldSessionFieldNests {
    public constructor(private readonly context: WorldSessionFieldNestContext) {}

    public refreshFieldNests(now: number): void {
        const visited = new Set<string>();
        for (const player of this.context.players.values()) {
            if (!player.active || player.ghost) continue;
            if (player.activeDungeonId) continue;
            const anchor = firstLivingActorTile(player, this.context.actors);
            if (!anchor) continue;
            const forceCenter = !hasNearbyLiveEnemy(this.context.enemies.values(), anchor, FIELD_NEST_NEARBY_ENEMY_DISTANCE);
            this.spawnEnemiesNear(anchor, now, forceCenter, visited, FIELD_NEST_ROAM_RADIUS_CHUNKS, FIELD_NEST_REFRESH_MAX_ENEMIES);
        }
    }

    public spawnEnemiesNear(
        anchor: TilePoint,
        now: number,
        forceCenter: boolean,
        visited: Set<string> = new Set(),
        radiusChunks = FIELD_NEST_ROAM_RADIUS_CHUNKS,
        maxSpawnedEnemies = Number.POSITIVE_INFINITY,
    ): number {
        const realm = this.context.worldMap.getRealm();
        const seed = `server:${this.context.sessionEpoch}`;
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
            const biome = this.context.worldMap.getBiomeAtChunk(chunkX, chunkY);
            const force = forceCenter && offset.dx === 0 && offset.dy === 0;
            spawned += this.spawnNest(chunkX, chunkY, biome, realm, seed, force, now);
        }

        if (forceCenter && spawned === 0) spawned += this.spawnNest(centerChunkX, centerChunkY, 'grass', realm, seed, true, now);
        return spawned;
    }

    public markNestEnemyKilled(nestKey: string, enemyId: string, now: number): void {
        const state = this.context.nestStates.get(nestKey);
        if (!state) return;
        state.monsterIds = state.monsterIds.filter((id) => id !== enemyId);
        if (state.monsterIds.length > 0) return;
        state.cleared = true;
        state.respawnAt = now + FIELD_NEST_RESPAWN_MS;
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
        if (hasActiveActorWithin(this.context.players.values(), this.context.actors, nest.centerTile, FIELD_NEST_SPAWN_SAFE_DISTANCE)) return 0;
        const stateKey = nestStateKey(realm, chunkX, chunkY);
        const state = this.getOrCreateNestState(stateKey, nest);
        this.retainLiveNestEnemies(state);
        if (state.monsterIds.length > 0) return 0;
        if (state.cleared) {
            if (now < state.respawnAt) return 0;
            if (hasActiveActorWithin(this.context.players.values(), this.context.actors, state.centerTile, FIELD_NEST_RESPAWN_SAFE_DISTANCE)) return 0;
        }

        const offsets = nestMemberOffsets(nest.monsters.length);
        const spawnedEnemyIds: string[] = [];
        nest.monsters.forEach((monster, index) => {
            const offset = offsets[index] ?? { x: 0, y: 0 };
            const nextEnemyId = this.context.nextEnemyId();
            const id = `enemy_${nextEnemyId}`;
            const tile = this.context.findNearbyWalkableTile(
                { x: nest.centerTile.x + offset.x, y: nest.centerTile.y + offset.y },
                id,
            );
            const definition = getMonsterDefinition(monster.monsterId);
            const enemy = new Enemy(id, tile.x, tile.y, definition.name, monster.level, definition.color, definition.role, monster.monsterId);
            enemy.aggroRange = definition.aggroRange;
            this.context.enemies.set(id, { enemy, monsterId: monster.monsterId, nestKey: stateKey, home: tile, wanderSeed: (nextEnemyId + 1) * 7919 });
            spawnedEnemyIds.push(id);
        });
        state.monsterIds = spawnedEnemyIds;
        state.cleared = false;
        state.respawnAt = 0;
        return spawnedEnemyIds.length;
    }

    private getOrCreateNestState(stateKey: string, nest: FieldNest): FieldNestState {
        let state = this.context.nestStates.get(stateKey);
        if (!state) {
            state = {
                chunkKey: stateKey,
                nestId: nest.nestId,
                centerTile: { ...nest.centerTile },
                monsterIds: [],
                respawnAt: 0,
                cleared: false,
            };
            this.context.nestStates.set(stateKey, state);
        }
        return state;
    }

    private retainLiveNestEnemies(state: FieldNestState): void {
        state.monsterIds = state.monsterIds.filter((enemyId) => {
            const entry = this.context.enemies.get(enemyId);
            return Boolean(entry && entry.enemy.stats.hp > 0);
        });
    }
}

export const WORLD_SESSION_FIELD_NEST_DEPARTURE_RADIUS_CHUNKS = FIELD_NEST_DEPARTURE_RADIUS_CHUNKS;
export const WORLD_SESSION_FIELD_NEST_DEPARTURE_MAX_ENEMIES = FIELD_NEST_DEPARTURE_MAX_ENEMIES;
