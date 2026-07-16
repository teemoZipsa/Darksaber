import { getItemDef } from '../src/data/ItemDB';
import { Enemy } from '../src/entity/Enemy';
import { LootObject } from '../src/entity/LootObject';
import type { TilePoint } from '../src/field/FieldPathing';
import { getEnemyLootSourceLabel, getWorldLootSourceLabel } from '../src/loot/LootLabels';
import { generateWorldLootNear } from '../src/loot/WorldLootGenerator';
import type { AutoLootGrantMessage } from '../src/net/WorldProtocol';
import { getMarkedCacheItems } from '../src/raid/MarkedCache';
import {
    getRaidModifierEffects,
    getRaidModifierSupplyItems,
} from '../src/raid/RaidModifiers';
import type { WorldMap } from '../src/map/WorldMap';
import { gridToSnapshot } from './WorldSessionHelpers';
import { hasNearbyLiveEnemy } from './WorldSessionSpatialQueries';
import type { WorldSessionLootState } from './WorldSessionLootState';
import {
    FIELD_NEST_NEARBY_ENEMY_DISTANCE,
    WorldSessionFieldNests,
} from './WorldSessionFieldNests';
import type { ServerEnemy, ServerPlayer } from './WorldSessionTypes';

export interface WorldSessionContentSpawnerContext {
    worldMap: WorldMap;
    enemies: ReadonlyMap<string, ServerEnemy>;
    loot: Map<string, LootObject>;
    lootState: WorldSessionLootState;
    fieldNests: WorldSessionFieldNests;
    generatedLootChunks: Set<string>;
    sessionEpoch: number;
    shardId: string;
    allocateLootId: (containerType?: string) => string;
    findNearbyWalkableTile: (tile: TilePoint, actorId: string, ownerPlayerId?: string) => TilePoint;
}

export class WorldSessionContentSpawner {
    public constructor(private readonly context: WorldSessionContentSpawnerContext) {}

    public ensureContentNear(spawnTile: TilePoint, departureTownId: string | null | undefined, now: number): void {
        if (!hasNearbyLiveEnemy(this.context.enemies.values(), spawnTile, FIELD_NEST_NEARBY_ENEMY_DISTANCE)) {
            const departure = this.context.fieldNests.getDepartureSpawnParams();
            this.context.fieldNests.spawnEnemiesNear(
                spawnTile,
                now,
                new Set(),
                departure.radiusChunks,
                departure.maxEnemies,
            );
        }

        this.spawnLootNear(spawnTile, departureTownId);
    }

    public spawnLootNear(anchor: TilePoint, departureTownId?: string | null): void {
        const loot = generateWorldLootNear({
            worldMap: this.context.worldMap,
            playerTile: anchor,
            seed: `server:${this.context.sessionEpoch}`,
            generatedChunks: this.context.generatedLootChunks,
            existingLoot: [...this.context.loot.values()],
            departureTownId,
            findNearbyWalkableTile: (tile, actorId) => this.context.findNearbyWalkableTile(tile, actorId),
            createId: (containerType) => this.context.allocateLootId(containerType),
        });
        for (const lootObject of loot) {
            this.context.loot.set(lootObject.id, lootObject);
        }
    }

    public spawnRaidModifierSupplyDrop(player: ServerPlayer, spawnTile: TilePoint): void {
        if (!getRaidModifierEffects(player.raidModifier).supplyDrop) return;
        const items = getRaidModifierSupplyItems();
        if (items.length === 0) return;

        const tile = this.context.findNearbyWalkableTile({
            x: spawnTile.x + 6,
            y: spawnTile.y + 3,
        }, `${player.id}:supply_drop`, player.id);
        const id = `loot_supply_drop_${player.id}`;
        this.context.loot.set(id, new LootObject(id, tile.x, tile.y, items, {
            sourceLabel: 'Supply Drop',
            kind: 'chest',
            containerType: 'supply_cache',
            gridW: 5,
            gridH: 4,
        }));
    }

    public spawnMarkedCache(player: ServerPlayer, spawnTile: TilePoint): void {
        const items = getMarkedCacheItems(`${this.context.sessionEpoch}:${this.context.shardId}:${player.id}:marked_cache`);
        if (items.length === 0) return;

        const tile = this.context.findNearbyWalkableTile({
            x: spawnTile.x + 34,
            y: spawnTile.y + 18,
        }, `${player.id}:marked_cache`, player.id);
        const id = `loot_marked_cache_${player.id}`;
        this.context.loot.set(id, new LootObject(id, tile.x, tile.y, items, {
            sourceLabel: getWorldLootSourceLabel('marked_cache'),
            kind: 'chest',
            containerType: 'marked_cache',
            gridW: 5,
            gridH: 5,
        }));
    }

    public spawnEnemyLoot(enemy: Enemy, tile: TilePoint = { x: enemy.gridX, y: enemy.gridY }): void {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (!herb) return;
        const id = this.context.allocateLootId();
        this.context.loot.set(id, new LootObject(id, tile.x, tile.y, [herb], {
            sourceLabel: getEnemyLootSourceLabel(enemy.name),
            kind: 'corpse',
        }));
    }

    public spawnEnemyAutoLoot(enemy: Enemy, playerId: string, now: number): AutoLootGrantMessage | undefined {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (!herb) return undefined;

        const id = this.context.allocateLootId();
        const loot = new LootObject(id, enemy.gridX, enemy.gridY, [herb], {
            sourceLabel: getEnemyLootSourceLabel(enemy.name),
            kind: 'corpse',
        });
        this.context.loot.set(id, loot);
        this.context.lootState.createAutoLootPending(id, playerId, now);
        return {
            type: 'AUTO_LOOT_GRANT',
            lootId: id,
            sourceName: enemy.name,
            gridSnapshot: gridToSnapshot(loot.inventory),
        };
    }
}
