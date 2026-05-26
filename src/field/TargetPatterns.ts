import { TilePoint, manhattan, sameTile, tileKey } from './FieldPathing';

export type Direction4 = 'up' | 'down' | 'left' | 'right';
export type SelectPatternKind = 'adjacent' | 'orthogonalLine' | 'diamond' | 'square';
export type EffectPatternKind = 'single' | 'square' | 'cross' | 'cone' | 'piercingLine';
export type EffectOrigin = 'caster' | 'selected';

export interface TargetPatternSpec {
    kind: SelectPatternKind;
    minRange?: number;
    maxRange: number;
    requiresLineOfSight?: boolean;
}

export interface EffectPatternSpec {
    kind: EffectPatternKind;
    radius?: number;
    armLength?: number;
    length?: number;
    width?: number;
    origin?: EffectOrigin;
    requiresLineOfSight?: boolean;
}

export interface AttackPatternProfile {
    select: TargetPatternSpec;
    effect: EffectPatternSpec;
    damageMultiplier?: number;
}

export interface PatternContext {
    casterTile: TilePoint;
    selectedTile?: TilePoint;
    isInsideMap?: (tile: TilePoint) => boolean;
    isBlockingTile?: (tile: TilePoint) => boolean;
    hasLineOfSight?: (from: TilePoint, to: TilePoint) => boolean;
}

export interface SelectTileOptions {
    ignoreLineOfSight?: boolean;
}

const CARDINAL_DIRS: Record<Direction4, TilePoint> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

export function getSelectableTiles(profile: AttackPatternProfile, context: PatternContext): TilePoint[] {
    const maxRange = Math.max(0, profile.select.maxRange);
    const result: TilePoint[] = [];

    for (let dy = -maxRange; dy <= maxRange; dy++) {
        for (let dx = -maxRange; dx <= maxRange; dx++) {
            const tile = { x: context.casterTile.x + dx, y: context.casterTile.y + dy };
            if (sameTile(tile, context.casterTile)) continue;
            if (isSelectableTile(profile, context, tile)) result.push(tile);
        }
    }

    return result;
}

export function isSelectableTile(
    profile: AttackPatternProfile,
    context: PatternContext,
    tile: TilePoint,
    options: SelectTileOptions = {}
): boolean {
    if (!isInside(context, tile)) return false;
    if (!isTileInSelectShape(profile.select, context.casterTile, tile)) return false;
    if (
        profile.select.requiresLineOfSight &&
        !options.ignoreLineOfSight &&
        context.hasLineOfSight &&
        !context.hasLineOfSight(context.casterTile, tile)
    ) {
        return false;
    }
    return true;
}

export function getEffectTiles(profile: AttackPatternProfile, context: PatternContext): TilePoint[] {
    const origin = getEffectOrigin(profile.effect, context);
    if (!origin) return [];

    const candidates = getEffectCandidates(profile.effect, context, origin);
    const result: TilePoint[] = [];
    const seen = new Set<string>();
    const shouldCheckLineOfSight = profile.effect.requiresLineOfSight ?? profile.effect.kind !== 'single';

    for (const tile of candidates) {
        const key = tileKey(tile.x, tile.y);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!isInside(context, tile)) continue;
        if (context.isBlockingTile?.(tile)) continue;
        if (shouldCheckLineOfSight && context.hasLineOfSight && !context.hasLineOfSight(origin, tile)) continue;
        result.push(tile);
    }

    return result;
}

export function getDirection4(from: TilePoint, to: TilePoint): Direction4 | null {
    if (from.x === to.x && from.y < to.y) return 'down';
    if (from.x === to.x && from.y > to.y) return 'up';
    if (from.y === to.y && from.x < to.x) return 'right';
    if (from.y === to.y && from.x > to.x) return 'left';
    return null;
}

export function getSelectDistance(spec: TargetPatternSpec, from: TilePoint, to: TilePoint): number {
    if (spec.kind === 'square') return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return manhattan(from, to);
}

export function isTileInSelectShape(spec: TargetPatternSpec, from: TilePoint, to: TilePoint): boolean {
    const minRange = spec.minRange ?? 1;
    const maxRange = spec.maxRange;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    switch (spec.kind) {
        case 'adjacent': {
            const distance = manhattan(from, to);
            return distance >= minRange && distance <= Math.min(maxRange, 1);
        }
        case 'orthogonalLine': {
            if (dx !== 0 && dy !== 0) return false;
            const distance = manhattan(from, to);
            return distance >= minRange && distance <= maxRange;
        }
        case 'diamond': {
            const distance = manhattan(from, to);
            return distance >= minRange && distance <= maxRange;
        }
        case 'square': {
            const distance = Math.max(Math.abs(dx), Math.abs(dy));
            return distance >= minRange && distance <= maxRange;
        }
    }
}

function getEffectOrigin(spec: EffectPatternSpec, context: PatternContext): TilePoint | null {
    const origin = spec.origin ?? (isDirectionalEffect(spec.kind) ? 'caster' : 'selected');
    if (origin === 'caster') return context.casterTile;
    return context.selectedTile ?? null;
}

function getEffectCandidates(spec: EffectPatternSpec, context: PatternContext, origin: TilePoint): TilePoint[] {
    switch (spec.kind) {
        case 'single':
            return [context.selectedTile ?? origin];
        case 'square':
            return getSquareTiles(origin, spec.radius ?? 0);
        case 'cross':
            return getCrossTiles(origin, spec.armLength ?? spec.radius ?? 1);
        case 'cone':
            return getConeTiles(context.casterTile, context.selectedTile, spec.length ?? spec.radius ?? 1, spec.width ?? 1);
        case 'piercingLine':
            return getPiercingLineTiles(context.casterTile, context.selectedTile, spec.length ?? 1);
    }
}

function getSquareTiles(origin: TilePoint, radius: number): TilePoint[] {
    const result: TilePoint[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            result.push({ x: origin.x + dx, y: origin.y + dy });
        }
    }
    return result;
}

function getCrossTiles(origin: TilePoint, armLength: number): TilePoint[] {
    const result: TilePoint[] = [{ x: origin.x, y: origin.y }];
    for (const dir of Object.values(CARDINAL_DIRS)) {
        for (let step = 1; step <= armLength; step++) {
            result.push({ x: origin.x + dir.x * step, y: origin.y + dir.y * step });
        }
    }
    return result;
}

function getPiercingLineTiles(caster: TilePoint, selected: TilePoint | undefined, length: number): TilePoint[] {
    if (!selected) return [];
    const direction = getDirection4(caster, selected);
    if (!direction) return [];

    const dir = CARDINAL_DIRS[direction];
    const result: TilePoint[] = [];
    for (let step = 1; step <= length; step++) {
        result.push({ x: caster.x + dir.x * step, y: caster.y + dir.y * step });
    }
    return result;
}

function getConeTiles(caster: TilePoint, selected: TilePoint | undefined, length: number, width: number): TilePoint[] {
    if (!selected) return [];
    const direction = getDirection4(caster, selected);
    if (!direction) return [];

    const result: TilePoint[] = [];
    for (let step = 1; step <= length; step++) {
        const lateralReach = Math.min(width, step - 1);
        for (let lateral = -lateralReach; lateral <= lateralReach; lateral++) {
            result.push(coneTile(caster, direction, step, lateral));
        }
    }
    return result;
}

function coneTile(caster: TilePoint, direction: Direction4, step: number, lateral: number): TilePoint {
    switch (direction) {
        case 'right':
            return { x: caster.x + step, y: caster.y + lateral };
        case 'left':
            return { x: caster.x - step, y: caster.y + lateral };
        case 'down':
            return { x: caster.x + lateral, y: caster.y + step };
        case 'up':
            return { x: caster.x + lateral, y: caster.y - step };
    }
}

function isDirectionalEffect(kind: EffectPatternKind): boolean {
    return kind === 'cone' || kind === 'piercingLine';
}

function isInside(context: PatternContext, tile: TilePoint): boolean {
    return context.isInsideMap ? context.isInsideMap(tile) : true;
}
