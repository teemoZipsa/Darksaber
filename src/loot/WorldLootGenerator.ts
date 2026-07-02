import { GEM_ITEM_IDS, ITEMS, RUNE_ITEM_IDS, getItemDef, type ItemDef } from '../data/ItemDB';
import { LootObject } from '../entity/LootObject';
import type { TilePoint } from '../field/FieldPathing';
import { manhattan } from '../field/FieldPathing';
import { CHUNK_SIZE } from '../map/Chunk';
import { TileType } from '../map/Tile';
import type { WorldMap } from '../map/WorldMap';
import type { TownInfo } from '../map/BiomeMask';
import { MASTER_KEY_ITEM_ID } from '../raid/MarkedCache';
import { pickLegendaryLootItem } from './LegendaryLootData';
import { getWorldLootSourceLabel } from './LootLabels';
import type { WorldLootContainerType } from './WorldLootTypes';

export interface ExistingWorldLoot {
    x: number;
    y: number;
    opened?: boolean;
}

export interface GenerateWorldLootOptions {
    worldMap: WorldMap;
    playerTile: TilePoint;
    seed: string | number;
    generatedChunks: Set<string>;
    existingLoot: readonly ExistingWorldLoot[];
    findNearbyWalkableTile: (tile: TilePoint, actorId: string) => TilePoint;
    createId: (containerType: WorldLootContainerType, chunkX: number, chunkY: number) => string;
    departureTownId?: string | null;
    maxNew?: number;
    nearbyActiveLimit?: number;
    minNew?: number;
}

interface ResolvedGenerateWorldLootOptions extends GenerateWorldLootOptions {
    departureTownExit: TilePoint | null;
}

const WINDOW_RADIUS_CHUNKS = 2;
const DEFAULT_MAX_NEW = 3;
const DEFAULT_MIN_NEW = 1;
const DEFAULT_NEARBY_ACTIVE_LIMIT = 6;
const NEARBY_ACTIVE_RANGE = 80;
const LOOT_SPACING_TILES = 10;
const DEPARTURE_TOWN_SAFE_RANGE = 18;

const REGIONAL_TRADE_GOODS: Record<string, string[]> = {
    nw_desert_city: ['trade_desert_spice', 'trade_sun_ore'],
    w_forest_village: ['trade_forest_resin', 'trade_mooncap_mushroom'],
    central_castle: ['trade_forest_resin', 'trade_sea_salt'],
    sw_hideout: ['trade_contraband_relic', 'trade_shadow_amber'],
    s_coast_town: ['trade_sea_salt', 'trade_tide_pearl'],
    e_outpost: ['trade_forest_resin', 'trade_imported_silk'],
    e_stronghold: ['trade_imported_silk', 'trade_eastern_incense'],
    se_port: ['trade_imported_silk', 'trade_eastern_incense', 'trade_tide_pearl'],
    master_sanctum: ['trade_sanctum_incense'],
    astral_keep: ['trade_astral_sigil'],
    ember_citadel: ['trade_ember_core'],
};

const COMMON_EQUIPMENT = ITEMS.filter((item) =>
    (item.itemCategory === 'normal_weapon' || item.itemCategory === 'armor' || item.itemCategory === 'accessory')
    && (item.rarity === 'common' || item.rarity === 'uncommon')
    && item.slot !== 'material'
    && item.sellable !== false
);

const RARE_EQUIPMENT = ITEMS.filter((item) =>
    (item.itemCategory === 'normal_weapon' || item.itemCategory === 'armor' || item.itemCategory === 'accessory')
    && (item.rarity === 'rare' || item.rarity === 'epic')
    && item.sellable !== false
);

export function generateWorldLootNear(options: GenerateWorldLootOptions): LootObject[] {
    const resolvedOptions: ResolvedGenerateWorldLootOptions = {
        ...options,
        departureTownExit: getDepartureTownExit(options),
    };
    const maxNew = options.maxNew ?? DEFAULT_MAX_NEW;
    const minNew = Math.min(options.minNew ?? DEFAULT_MIN_NEW, maxNew);
    const nearbyLimit = options.nearbyActiveLimit ?? DEFAULT_NEARBY_ACTIVE_LIMIT;
    const activeNear = options.existingLoot.filter((loot) =>
        !loot.opened && manhattan(loot, options.playerTile) <= NEARBY_ACTIVE_RANGE
    ).length;
    if (activeNear >= nearbyLimit) return [];

    const realm = options.worldMap.getRealm();
    const centerChunkX = Math.floor(options.playerTile.x / CHUNK_SIZE);
    const centerChunkY = Math.floor(options.playerTile.y / CHUNK_SIZE);
    const chunkCoords = orderedWindowChunks(centerChunkX, centerChunkY, options.seed, realm);
    const candidates: Array<{ chunkX: number; chunkY: number; forced: boolean }> = [];
    const spawned: LootObject[] = [];
    const considered: Array<{ chunkX: number; chunkY: number }> = [];

    for (const chunk of chunkCoords) {
        const key = worldLootChunkKey(realm, chunk.chunkX, chunk.chunkY);
        if (options.generatedChunks.has(key)) continue;
        options.generatedChunks.add(key);
        considered.push(chunk);

        if (shouldSpawnInChunk(resolvedOptions, chunk.chunkX, chunk.chunkY)) {
            candidates.push({ ...chunk, forced: false });
        }
    }

    if (candidates.length < minNew) {
        for (const chunk of considered) {
            if (candidates.some((candidate) => candidate.chunkX === chunk.chunkX && candidate.chunkY === chunk.chunkY)) continue;
            candidates.push({ ...chunk, forced: true });
            if (candidates.length >= minNew) break;
        }
    }

    for (const candidate of candidates) {
        if (spawned.length >= maxNew) break;
        if (activeNear + spawned.length >= nearbyLimit) break;
        const loot = createLootForChunk(resolvedOptions, candidate.chunkX, candidate.chunkY, candidate.forced);
        if (!loot) continue;
        if (isTooCloseToLoot(loot, [...options.existingLoot, ...spawned])) continue;
        spawned.push(loot);
    }

    return spawned;
}

export function worldLootChunkKey(realm: string, chunkX: number, chunkY: number): string {
    return `${realm}:${chunkX},${chunkY}`;
}

function orderedWindowChunks(
    centerChunkX: number,
    centerChunkY: number,
    seed: string | number,
    realm: string
): Array<{ chunkX: number; chunkY: number }> {
    const chunks: Array<{ chunkX: number; chunkY: number }> = [];
    for (let dy = -WINDOW_RADIUS_CHUNKS; dy <= WINDOW_RADIUS_CHUNKS; dy++) {
        for (let dx = -WINDOW_RADIUS_CHUNKS; dx <= WINDOW_RADIUS_CHUNKS; dx++) {
            chunks.push({ chunkX: centerChunkX + dx, chunkY: centerChunkY + dy });
        }
    }
    return chunks
        .map((chunk) => ({
            chunkX: chunk.chunkX,
            chunkY: chunk.chunkY,
            order: roll01(seed, realm, chunk.chunkX, chunk.chunkY, 'order'),
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ chunkX, chunkY }) => ({ chunkX, chunkY }));
}

function shouldSpawnInChunk(options: ResolvedGenerateWorldLootOptions, chunkX: number, chunkY: number): boolean {
    const context = getChunkContext(options.worldMap, chunkX, chunkY);
    if (!context.hasLand) return false;

    let chance = 0.06;
    if (context.nearRoad) chance += 0.08;
    if (context.nearTownExterior) chance += 0.08;
    if (context.nearDungeon) chance += 0.1;
    if (context.nearStoryLandmark) chance += 0.08;
    if (context.hasDangerBiome) chance += 0.03;

    const rareChance = context.nearDungeon || context.nearStoryLandmark ? 0.018 : 0.009;
    const rareRoll = roll01(options.seed, options.worldMap.getRealm(), chunkX, chunkY, 'sealed');
    if (rareRoll < rareChance) return true;

    return roll01(options.seed, options.worldMap.getRealm(), chunkX, chunkY, 'spawn') < chance;
}

function createLootForChunk(
    options: ResolvedGenerateWorldLootOptions,
    chunkX: number,
    chunkY: number,
    forced: boolean
): LootObject | null {
    const context = getChunkContext(options.worldMap, chunkX, chunkY);
    if (!context.hasLand && !forced) return null;

    const tile = findCandidateTile(options, chunkX, chunkY);
    if (!tile) return null;

    const containerType = chooseContainerType(options, chunkX, chunkY, context);
    const items = chooseItems(options, containerType, tile, chunkX, chunkY);
    if (items.length === 0) return null;

    const id = options.createId(containerType, chunkX, chunkY);
    return new LootObject(id, tile.x, tile.y, items, {
        sourceLabel: getWorldLootSourceLabel(containerType),
        kind: 'chest',
        containerType,
        gridW: containerType === 'traveler_pack' ? 4 : 5,
        gridH: containerType === 'traveler_pack' ? 4 : 5,
    });
}

function findCandidateTile(options: ResolvedGenerateWorldLootOptions, chunkX: number, chunkY: number): TilePoint | null {
    const realm = options.worldMap.getRealm();
    for (let attempt = 0; attempt < 5; attempt++) {
        const x = chunkX * CHUNK_SIZE + 2 + Math.floor(roll01(options.seed, realm, chunkX, chunkY, `x:${attempt}`) * (CHUNK_SIZE - 4));
        const y = chunkY * CHUNK_SIZE + 2 + Math.floor(roll01(options.seed, realm, chunkX, chunkY, `y:${attempt}`) * (CHUNK_SIZE - 4));
        const tile = options.findNearbyWalkableTile({ x, y }, `world_loot_${realm}_${chunkX}_${chunkY}_${attempt}`);
        if (isValidLootTile(options, tile)) return tile;
    }
    return null;
}

function isValidLootTile(options: ResolvedGenerateWorldLootOptions, tile: TilePoint): boolean {
    const tileType = options.worldMap.getTileAt(tile.x, tile.y);
    if (tileType === TileType.TOWN || tileType === TileType.WATER || tileType === TileType.DEEP_WATER) return false;
    if (tileType === TileType.WALL || tileType === TileType.LAVA) return false;
    if (!options.worldMap.isWalkable(tile.x, tile.y)) return false;
    if (options.worldMap.getTownAtTile(tile.x, tile.y)) return false;

    if (options.departureTownExit && manhattan(tile, options.departureTownExit) <= DEPARTURE_TOWN_SAFE_RANGE) return false;

    return true;
}

function chooseContainerType(
    options: ResolvedGenerateWorldLootOptions,
    chunkX: number,
    chunkY: number,
    context: ChunkContext
): WorldLootContainerType {
    const realm = options.worldMap.getRealm();
    const sealedChance = context.nearDungeon || context.nearStoryLandmark ? 0.018 : 0.009;
    if (roll01(options.seed, realm, chunkX, chunkY, 'sealed') < sealedChance) return 'sealed_reliquary';

    const roll = roll01(options.seed, realm, chunkX, chunkY, 'type');
    if (roll < 0.52) return 'supply_cache';
    if (roll < 0.78 && context.nearTownExterior) return 'regional_goods_crate';
    if (roll < 0.86 && !context.nearTownExterior) return 'regional_goods_crate';
    return 'traveler_pack';
}

function chooseItems(
    options: ResolvedGenerateWorldLootOptions,
    containerType: WorldLootContainerType,
    tile: TilePoint,
    chunkX: number,
    chunkY: number
): ItemDef[] {
    switch (containerType) {
        case 'supply_cache':
            return chooseSupplyItems(options, tile, chunkX, chunkY);
        case 'traveler_pack':
            return chooseTravelerItems(options, tile, chunkX, chunkY);
        case 'regional_goods_crate':
            return chooseRegionalItems(options, tile, chunkX, chunkY);
        case 'sealed_reliquary':
            return chooseReliquaryItems(options, chunkX, chunkY);
        case 'marked_cache':
            return [];
    }
}

function chooseSupplyItems(options: ResolvedGenerateWorldLootOptions, tile: TilePoint, chunkX: number, chunkY: number): ItemDef[] {
    const realm = options.worldMap.getRealm();
    const pool = ['herb_cheap', 'herb_common', 'mp_potion', 'antidote'];
    const tileType = options.worldMap.getTileAt(tile.x, tile.y);
    if (tileType === TileType.SAND || tileType === TileType.LAVA) pool.push('fire_herb');
    if (tileType === TileType.SNOW) pool.push('ice_herb');
    if (roll01(options.seed, realm, chunkX, chunkY, 'supply:rare') < 0.12) pool.push('herb_rare');

    const first = itemFromPool(pool, options.seed, realm, chunkX, chunkY, 'supply:first');
    const second = roll01(options.seed, realm, chunkX, chunkY, 'supply:second-roll') < 0.55
        ? itemFromPool(pool, options.seed, realm, chunkX, chunkY, 'supply:second')
        : null;
    return [first, second].filter((item): item is ItemDef => Boolean(item));
}

function chooseTravelerItems(options: ResolvedGenerateWorldLootOptions, tile: TilePoint, chunkX: number, chunkY: number): ItemDef[] {
    const realm = options.worldMap.getRealm();
    const items = chooseSupplyItems(options, tile, chunkX, chunkY).slice(0, 1);
    if (roll01(options.seed, realm, chunkX, chunkY, 'traveler:eq-roll') < 0.28) {
        const equipment = pickFrom(COMMON_EQUIPMENT, options.seed, realm, chunkX, chunkY, 'traveler:eq');
        if (equipment) items.push(equipment);
    }
    return items;
}

function chooseRegionalItems(options: ResolvedGenerateWorldLootOptions, tile: TilePoint, chunkX: number, chunkY: number): ItemDef[] {
    const realm = options.worldMap.getRealm();
    const town = nearestTown(options.worldMap, tile);
    const tradePool = town ? REGIONAL_TRADE_GOODS[town.id] : null;
    const trade = itemFromPool(tradePool ?? ['trade_forest_resin', 'trade_sea_salt'], options.seed, realm, chunkX, chunkY, 'regional:trade');
    const extra = roll01(options.seed, realm, chunkX, chunkY, 'regional:extra-roll') < 0.35
        ? itemFromPool(['herb_common', 'mp_potion', 'antidote'], options.seed, realm, chunkX, chunkY, 'regional:extra')
        : null;
    return [trade, extra].filter((item): item is ItemDef => Boolean(item));
}

function chooseReliquaryItems(options: ResolvedGenerateWorldLootOptions, chunkX: number, chunkY: number): ItemDef[] {
    const realm = options.worldMap.getRealm();
    const roll = roll01(options.seed, realm, chunkX, chunkY, 'reliquary:roll');
    if (roll < 0.06) return [pickLegendaryLootItem(`${options.seed}:${realm}:${chunkX},${chunkY}`, 'reliquary:legendary')].filter((item): item is ItemDef => Boolean(item));
    if (roll < 0.16) return [itemFromPool(['cursed_blood_reliquary'], options.seed, realm, chunkX, chunkY, 'reliquary:cursed')].filter((item): item is ItemDef => Boolean(item));
    if (roll < 0.24) return [itemFromPool([MASTER_KEY_ITEM_ID], options.seed, realm, chunkX, chunkY, 'reliquary:key')].filter((item): item is ItemDef => Boolean(item));
    if (roll < 0.52) return [itemFromPool(GEM_ITEM_IDS.filter((id) => id.startsWith('gem_chipped_') || id.startsWith('gem_flawed_') || id.startsWith('gem_normal_')), options.seed, realm, chunkX, chunkY, 'reliquary:gem')].filter((item): item is ItemDef => Boolean(item));
    if (roll < 0.8) return [pickFrom(RARE_EQUIPMENT, options.seed, realm, chunkX, chunkY, 'reliquary:eq')].filter((item): item is ItemDef => Boolean(item));
    if (roll < 0.95) return [itemFromPool(['trade_tide_pearl', 'trade_sun_ore', 'trade_shadow_amber', 'trade_astral_sigil', 'trade_ember_core'], options.seed, realm, chunkX, chunkY, 'reliquary:trade')].filter((item): item is ItemDef => Boolean(item));
    return [itemFromPool(RUNE_ITEM_IDS.slice(0, 8), options.seed, realm, chunkX, chunkY, 'reliquary:rune')].filter((item): item is ItemDef => Boolean(item));
}

function itemFromPool(pool: readonly string[], seed: string | number, realm: string, chunkX: number, chunkY: number, salt: string): ItemDef | null {
    const itemId = pickFrom(pool, seed, realm, chunkX, chunkY, salt);
    return itemId ? getItemDef(itemId) ?? null : null;
}

function pickFrom<T>(pool: readonly T[], seed: string | number, realm: string, chunkX: number, chunkY: number, salt: string): T | null {
    if (pool.length === 0) return null;
    const index = Math.floor(roll01(seed, realm, chunkX, chunkY, salt) * pool.length) % pool.length;
    return pool[index] ?? null;
}

interface ChunkContext {
    hasLand: boolean;
    nearRoad: boolean;
    nearTownExterior: boolean;
    nearDungeon: boolean;
    nearStoryLandmark: boolean;
    hasDangerBiome: boolean;
}

function getChunkContext(worldMap: WorldMap, chunkX: number, chunkY: number): ChunkContext {
    const center = {
        x: chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        y: chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
    };
    const samples = [
        center,
        { x: center.x - 8, y: center.y - 8 },
        { x: center.x + 8, y: center.y - 8 },
        { x: center.x - 8, y: center.y + 8 },
        { x: center.x + 8, y: center.y + 8 },
    ];
    const sampleTiles = samples.map((sample) => worldMap.getTileAt(sample.x, sample.y));
    const hasLand = sampleTiles.some((tile) => tile !== TileType.WATER && tile !== TileType.DEEP_WATER && tile !== TileType.WALL && tile !== TileType.LAVA);
    const nearRoad = sampleTiles.includes(TileType.ROAD);
    const hasDangerBiome = sampleTiles.includes(TileType.POISON_SWAMP) || sampleTiles.includes(TileType.SNOW) || sampleTiles.includes(TileType.SAND);
    const nearTownExterior = worldMap.getTowns().some((town) => {
        const distance = Math.hypot(chunkX - town.chunkX, chunkY - town.chunkY);
        return distance > town.radius && distance <= town.radius + 2;
    });
    const nearbyDungeons = worldMap.getDungeons().filter((dungeon) =>
        Math.hypot(chunkX - dungeon.chunkX, chunkY - dungeon.chunkY) <= 4
    );
    return {
        hasLand,
        nearRoad,
        nearTownExterior,
        nearDungeon: nearbyDungeons.length > 0,
        nearStoryLandmark: nearbyDungeons.some((dungeon) => dungeon.id.includes('_')),
        hasDangerBiome,
    };
}

function nearestTown(worldMap: WorldMap, tile: TilePoint): TownInfo | null {
    let best: { town: TownInfo; distance: number } | null = null;
    for (const town of worldMap.getTowns()) {
        const center = {
            x: town.chunkX * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
            y: town.chunkY * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2),
        };
        const distance = Math.hypot(tile.x - center.x, tile.y - center.y);
        if (!best || distance < best.distance) best = { town, distance };
    }
    return best?.town ?? null;
}

function getDepartureTownExit(options: GenerateWorldLootOptions): TilePoint | null {
    if (!options.departureTownId) return null;
    const town = options.worldMap.getTowns().find((candidate) => candidate.id === options.departureTownId);
    return town ? options.worldMap.getTownExitTile(town) : null;
}

function isTooCloseToLoot(loot: ExistingWorldLoot, existingLoot: readonly ExistingWorldLoot[]): boolean {
    return existingLoot.some((existing) =>
        !existing.opened
        && existing !== loot
        && manhattan(existing, loot) < LOOT_SPACING_TILES
    );
}

function roll01(seed: string | number, realm: string, chunkX: number, chunkY: number, salt: string): number {
    return hashString(`${seed}|${realm}|${chunkX}|${chunkY}|${salt}`) / 0xffffffff;
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0;
}
