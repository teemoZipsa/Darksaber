import {
    findPath,
    findReachableTilesByCost,
    manhattan,
    type TilePoint,
} from '../../src/field/FieldPathing';
import { getTerrainMoveCost } from '../../src/field/TerrainRules';
import type { WorldMap } from '../../src/map/WorldMap';

export interface PathCache {
    goalKey: string;
    waypointKey: string;
    path: TilePoint[];
    index: number;
}

const WAYPOINT_SPAN = 48;

/**
 * Pick the best tile within one MOV budget toward `goal`.
 * Uses short staged waypoints so path searches stay cheap and stable.
 */
export function planLocalStep(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    mov: number,
    actorId: string,
    cache?: PathCache
): TilePoint {
    const budget = Math.max(1, mov);
    const distance = manhattan(from, goal);
    if (distance === 0) return { ...from };

    if (distance > budget * 2 && cache) {
        const routed = followStagedRoute(world, from, goal, budget, actorId, cache);
        if (routed) return routed;
    }

    const local = pickBestReachable(world, from, goal, budget, actorId);
    if (local && manhattan(local, goal) < distance) {
        return local;
    }

    if (cache) {
        const routed = followStagedRoute(world, from, goal, budget, actorId, cache);
        if (routed) return routed;
    }

    return cardinalFallback(world, from, goal);
}

function stageWaypoint(from: TilePoint, goal: TilePoint): TilePoint {
    const dist = manhattan(from, goal);
    if (dist <= WAYPOINT_SPAN) return { ...goal };
    let x = from.x;
    let y = from.y;
    let remaining = WAYPOINT_SPAN;
    while (remaining > 0 && (x !== goal.x || y !== goal.y)) {
        if (Math.abs(goal.x - x) >= Math.abs(goal.y - y) && x !== goal.x) {
            x += Math.sign(goal.x - x);
        } else if (y !== goal.y) {
            y += Math.sign(goal.y - y);
        } else if (x !== goal.x) {
            x += Math.sign(goal.x - x);
        }
        remaining -= 1;
    }
    return { x, y };
}

function followStagedRoute(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    budget: number,
    actorId: string,
    cache: PathCache
): TilePoint | null {
    const goalKey = `${goal.x},${goal.y}`;
    const waypoint = stageWaypoint(from, goal);
    const waypointKey = `${waypoint.x},${waypoint.y}`;

    const needRepath = cache.goalKey !== goalKey
        || cache.waypointKey !== waypointKey
        || cache.path.length === 0
        || cache.index >= cache.path.length;

    if (needRepath) {
        // Prefer a walkable waypoint near the staged target if the exact tile is blocked.
        const target = world.isWalkable(waypoint.x, waypoint.y)
            ? waypoint
            : findNearbyWalkable(world, waypoint, 6) ?? waypoint;
        cache.goalKey = goalKey;
        cache.waypointKey = waypointKey;
        cache.path = findPath(from, target, (query) => world.isWalkable(query.x, query.y), {
            actorId,
            intent: 'move',
            maxNodes: 12_000,
            maxDistance: WAYPOINT_SPAN + 32,
        });
        cache.index = 0;
    }

    if (cache.path.length === 0) return null;

    let bestIndex = cache.index;
    let bestDist = Infinity;
    const start = Math.max(0, cache.index - 2);
    const end = Math.min(cache.path.length, cache.index + 16);
    for (let i = start; i < end; i++) {
        const tile = cache.path[i]!;
        const dist = manhattan(from, tile);
        if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
        }
    }
    if (bestDist <= 1) bestIndex = Math.min(cache.path.length - 1, bestIndex + (bestDist === 0 ? 1 : 0));
    cache.index = bestIndex;

    let cost = 0;
    let chosen: TilePoint | null = null;
    for (let i = cache.index; i < cache.path.length; i++) {
        const step = cache.path[i]!;
        const stepCost = getTerrainMoveCost(world.getTileAt(step.x, step.y));
        if (!Number.isFinite(stepCost) || stepCost < 0) break;
        if (cost + stepCost > budget + 1e-9) break;
        cost += stepCost;
        chosen = step;
        cache.index = i + 1;
    }
    return chosen;
}

function findNearbyWalkable(world: WorldMap, tile: TilePoint, radius: number): TilePoint | null {
    for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) + Math.abs(dy) !== r) continue;
                const x = tile.x + dx;
                const y = tile.y + dy;
                if (world.isWalkable(x, y)) return { x, y };
            }
        }
    }
    return null;
}

function pickBestReachable(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    budget: number,
    actorId: string
): TilePoint | null {
    const reachable = findReachableTilesByCost(
        from,
        (query) => world.isWalkable(query.x, query.y),
        (step) => getTerrainMoveCost(world.getTileAt(step.x, step.y)),
        budget,
        {
            actorId,
            intent: 'move',
            maxNodes: 4_000,
        }
    );

    let best: TilePoint | null = null;
    let bestScore = Infinity;
    for (const entry of reachable.values()) {
        const score = manhattan(entry.tile, goal);
        if (score < bestScore) {
            bestScore = score;
            best = entry.tile;
        }
    }
    return best;
}

function cardinalFallback(world: WorldMap, from: TilePoint, goal: TilePoint): TilePoint {
    const candidates: TilePoint[] = [];
    const dx = Math.sign(goal.x - from.x);
    const dy = Math.sign(goal.y - from.y);
    if (dx !== 0) candidates.push({ x: from.x + dx, y: from.y });
    if (dy !== 0) candidates.push({ x: from.x, y: from.y + dy });
    candidates.push(
        { x: from.x + 1, y: from.y },
        { x: from.x - 1, y: from.y },
        { x: from.x, y: from.y + 1 },
        { x: from.x, y: from.y - 1 },
    );
    for (const tile of candidates) {
        if ((tile.x !== from.x || tile.y !== from.y) && world.isWalkable(tile.x, tile.y)) {
            return tile;
        }
    }
    return { ...from };
}
