import type { SkillElement } from '../data/SkillDB';
import { TileType, TILE_PROPERTIES } from '../map/Tile';
import { MOVE_AP_PER_TILE } from './FieldActionEconomy';

export interface TerrainActorTraits {
    ignoresTerrain?: boolean;
    waterBonus?: boolean;
}

export interface TerrainProfile {
    tile: TileType;
    moveCost: number;
    walkable: boolean;
    defenseDamageMultiplier: number;
    rangedHitPenalty: number;
    blocksLineOfSight: boolean;
    casterMagic: Partial<Record<SkillElement, number>>;
    targetMagic: Partial<Record<SkillElement, number>>;
}

export interface MagicTerrainContext {
    casterTile?: TileType;
    targetTile?: TileType;
}

export interface MagicTerrainResult {
    multiplier: number;
    casterMultiplier: number;
    targetMultiplier: number;
}

const NEUTRAL_MAGIC: Partial<Record<SkillElement, number>> = {};

export const TERRAIN_PROFILES: Record<TileType, TerrainProfile> = {
    [TileType.GRASS]: {
        tile: TileType.GRASS,
        moveCost: 1,
        walkable: true,
        defenseDamageMultiplier: 1,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: NEUTRAL_MAGIC,
        targetMagic: NEUTRAL_MAGIC,
    },
    [TileType.STONE]: {
        tile: TileType.STONE,
        moveCost: 1.5,
        walkable: true,
        defenseDamageMultiplier: 0.8,
        rangedHitPenalty: -10,
        blocksLineOfSight: false,
        casterMagic: { earth: 1.1 },
        targetMagic: { earth: 1.15, lightning: 1.1, wind: 0.9 },
    },
    [TileType.WATER]: {
        tile: TileType.WATER,
        moveCost: Infinity,
        walkable: false,
        defenseDamageMultiplier: 1,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: { fire: 0.9, ice: 1.05, lightning: 1.05 },
        targetMagic: { fire: 0.8, ice: 1.2, lightning: 1.25 },
    },
    [TileType.WALL]: {
        tile: TileType.WALL,
        moveCost: Infinity,
        walkable: false,
        defenseDamageMultiplier: 0.75,
        rangedHitPenalty: -20,
        blocksLineOfSight: true,
        casterMagic: NEUTRAL_MAGIC,
        targetMagic: NEUTRAL_MAGIC,
    },
    [TileType.LAVA]: {
        tile: TileType.LAVA,
        moveCost: Infinity,
        walkable: false,
        defenseDamageMultiplier: 1,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: { fire: 1.1, ice: 0.9 },
        targetMagic: { fire: 1.25, ice: 0.8 },
    },
    [TileType.SAND]: {
        tile: TileType.SAND,
        moveCost: 1.5,
        walkable: true,
        defenseDamageMultiplier: 0.95,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: { fire: 1.05, earth: 1.05 },
        targetMagic: { fire: 1.1, earth: 1.1, ice: 0.9 },
    },
    [TileType.FOREST]: {
        tile: TileType.FOREST,
        moveCost: 2,
        walkable: true,
        defenseDamageMultiplier: 0.85,
        rangedHitPenalty: -15,
        blocksLineOfSight: false,
        casterMagic: { wind: 1.05, earth: 1.05 },
        targetMagic: { fire: 1.2, wind: 1.1, earth: 1.1 },
    },
    [TileType.ROAD]: {
        tile: TileType.ROAD,
        moveCost: 0.8,
        walkable: true,
        defenseDamageMultiplier: 1,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: NEUTRAL_MAGIC,
        targetMagic: NEUTRAL_MAGIC,
    },
    [TileType.SNOW]: {
        tile: TileType.SNOW,
        moveCost: 1.2,
        walkable: true,
        defenseDamageMultiplier: 0.95,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: { ice: 1.1, fire: 0.9 },
        targetMagic: { ice: 1.2, fire: 1.15 },
    },
    [TileType.POISON_SWAMP]: {
        tile: TileType.POISON_SWAMP,
        moveCost: 2.5,
        walkable: true,
        defenseDamageMultiplier: 0.9,
        rangedHitPenalty: -5,
        blocksLineOfSight: false,
        casterMagic: { dark: 1.1, holy: 0.9 },
        targetMagic: { dark: 1.2, holy: 0.8, earth: 1.1 },
    },
    [TileType.TOWN]: {
        tile: TileType.TOWN,
        moveCost: 0.8,
        walkable: true,
        defenseDamageMultiplier: 0.8,
        rangedHitPenalty: -10,
        blocksLineOfSight: false,
        casterMagic: { holy: 1.05 },
        targetMagic: { holy: 1.1, dark: 0.9 },
    },
    [TileType.DUNGEON_ENTRANCE]: {
        tile: TileType.DUNGEON_ENTRANCE,
        moveCost: 1,
        walkable: true,
        defenseDamageMultiplier: 0.8,
        rangedHitPenalty: -10,
        blocksLineOfSight: false,
        casterMagic: { dark: 1.05, earth: 1.05 },
        targetMagic: { dark: 1.1, earth: 1.1 },
    },
    [TileType.DEEP_WATER]: {
        tile: TileType.DEEP_WATER,
        moveCost: Infinity,
        walkable: false,
        defenseDamageMultiplier: 1,
        rangedHitPenalty: 0,
        blocksLineOfSight: false,
        casterMagic: { fire: 0.9, ice: 1.05, lightning: 1.05 },
        targetMagic: { fire: 0.75, ice: 1.25, lightning: 1.25 },
    },
};

export function getTerrainProfile(tile: TileType): TerrainProfile {
    return TERRAIN_PROFILES[tile];
}

export function isTerrainRuleTile(tile: number): tile is TileType {
    return Object.prototype.hasOwnProperty.call(TERRAIN_PROFILES, tile);
}

export function getTerrainMoveCost(tile: TileType, traits: TerrainActorTraits = {}): number {
    if (tile === TileType.WALL || tile === TileType.LAVA || tile === TileType.DEEP_WATER) return Infinity;
    if (tile === TileType.WATER) return traits.waterBonus ? 0.8 : Infinity;

    const profile = getTerrainProfile(tile);
    if (!profile.walkable) return Infinity;
    if (traits.ignoresTerrain) return 1;
    return profile.moveCost;
}

export function isTerrainPassable(tile: TileType, traits: TerrainActorTraits = {}): boolean {
    return Number.isFinite(getTerrainMoveCost(tile, traits));
}

export function getTerrainDefenseMultiplier(tile: TileType, traits: TerrainActorTraits = {}): number {
    if (tile === TileType.WATER && traits.waterBonus) return 0.85;
    return getTerrainProfile(tile).defenseDamageMultiplier;
}

export function terrainCostToApCost(totalCost: number): number {
    if (!Number.isFinite(totalCost)) return Infinity;
    return Math.ceil(Math.max(0, totalCost) * MOVE_AP_PER_TILE - 1e-9);
}

export function canAffordTerrainCost(totalCost: number, remainingAp: number): boolean {
    return terrainCostToApCost(totalCost) <= remainingAp;
}

export function getMagicTerrainMultiplier(
    element: SkillElement,
    context: MagicTerrainContext = {}
): MagicTerrainResult {
    if (element === 'physical' || element === 'none') {
        return { multiplier: 1, casterMultiplier: 1, targetMultiplier: 1 };
    }

    const casterMultiplier = context.casterTile === undefined
        ? 1
        : clamp(getTerrainProfile(context.casterTile).casterMagic[element] ?? 1, 0.9, 1.1);
    const targetMultiplier = context.targetTile === undefined
        ? 1
        : clamp(getTerrainProfile(context.targetTile).targetMagic[element] ?? 1, 0.8, 1.25);
    return {
        casterMultiplier,
        targetMultiplier,
        multiplier: clamp(casterMultiplier * targetMultiplier, 0.65, 1.45),
    };
}

export function isTerrainLineOfSightBlocking(tile: TileType): boolean {
    return getTerrainProfile(tile).blocksLineOfSight;
}

export function battleStageTileToTerrainTile(stageTile: number): TileType {
    return stageTile === 1 ? TileType.WALL : TileType.GRASS;
}

export function describeTerrainForHover(tile: TileType, traits: TerrainActorTraits = {}): string[] {
    const profile = getTerrainProfile(tile);
    const props = TILE_PROPERTIES[tile];
    const moveCost = getTerrainMoveCost(tile, traits);
    const lines = [`${props.label} | 이동 ${Number.isFinite(moveCost) ? moveCost : '불가'}`];

    const defenseMultiplier = getTerrainDefenseMultiplier(tile, traits);
    const defenseReduction = Math.round((1 - defenseMultiplier) * 100);
    if (defenseReduction > 0) lines.push(`방어 피해 -${defenseReduction}%`);
    if (profile.rangedHitPenalty < 0) lines.push(`원거리 명중 ${profile.rangedHitPenalty}`);
    if (profile.blocksLineOfSight) lines.push('시야 차단');

    const magicHints = Object.entries(profile.targetMagic)
        .filter(([, value]) => value !== undefined && value !== 1)
        .slice(0, 3)
        .map(([element, value]) => `${element} ${value! > 1 ? '+' : '-'}${Math.round(Math.abs(value! - 1) * 100)}%`);
    if (magicHints.length > 0) lines.push(`마법 ${magicHints.join(' ')}`);
    return lines;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
