import {
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
    /** Remaining full A* searches allowed this expedition (coast fallback after). */
    astarCredits?: number;
}

const WAYPOINT_SPAN = 40;
const DETOUR_SPAN = 200;
const ASTAR_MAX_NODES = 40_000;
const ASTAR_MAX_DISTANCE = 800;
const ROUTE_REJOIN_DIST = 12;

/**
 * Pick the best tile within one MOV budget toward `goal`.
 * Long-range routing uses a sticky corridor (greedy, or heap A* around blockers).
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
        const routed = followWaypointRoute(world, from, goal, budget, cache);
        if (routed) return routed;
    }

    const local = pickBestReachable(world, from, goal, budget, actorId);
    if (local && manhattan(local, goal) < distance) {
        return local;
    }

    if (cache) {
        const routed = followWaypointRoute(world, from, goal, budget, cache);
        if (routed) return routed;
    }

    return cardinalFallback(world, from, goal);
}

function followWaypointRoute(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    budget: number,
    cache: PathCache
): TilePoint | null {
    const goalKey = `${goal.x},${goal.y}`;
    const routeSlack = Math.max(ROUTE_REJOIN_DIST, budget * 2);
    // Stay on a committed corridor until exhausted or lost — rebuilding every
    // tile undoes temporary Manhattan worsenings and re-triggers expensive A*.
    let nearDist = cache.goalKey === goalKey && cache.path.length > 0
        ? nearestPathDistance(cache.path, from, cache.index)
        : Infinity;
    const onRoute = cache.goalKey === goalKey
        && cache.path.length > 0
        && cache.index < cache.path.length
        && nearDist <= routeSlack;

    if (!onRoute) {
        const corridor = buildCorridor(world, from, goal, cache);
        const waypoint = corridor[corridor.length - 1] ?? from;
        cache.goalKey = goalKey;
        cache.waypointKey = `${waypoint.x},${waypoint.y}`;
        cache.path = corridor;
        cache.index = 0;
        nearDist = corridor.length > 0 ? nearestPathDistance(corridor, from, 0) : Infinity;
    }

    if (cache.path.length === 0) return null;

    let bestIndex = cache.index;
    let bestDist = Infinity;
    const start = Math.max(0, cache.index - 8);
    const end = Math.min(cache.path.length, cache.index + 48);
    for (let i = start; i < end; i++) {
        const tile = cache.path[i]!;
        const dist = manhattan(from, tile);
        if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
        }
    }
    if (bestDist <= 1) {
        bestIndex = Math.min(cache.path.length - 1, bestIndex + (bestDist === 0 ? 1 : 0));
    }
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

const CARDINALS: TilePoint[] = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
];

/**
 * Build a short walkable corridor toward the goal.
 * Open ground uses greedy steps; blockers use binary-heap A*.
 */
function buildCorridor(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    cache: PathCache
): TilePoint[] {
    const straight = collectToward(world, from, goal, WAYPOINT_SPAN);
    const tip = straight[straight.length - 1] ?? from;
    const canContinue = stepTowardWalkable(world, tip, goal) !== null;

    if (straight.length > 0 && (canContinue || straight.length >= WAYPOINT_SPAN)) {
        return straight;
    }

    if (cache.astarCredits === undefined) cache.astarCredits = 20;
    if (cache.astarCredits > 0) {
        cache.astarCredits -= 1;
        // Stop at first Manhattan improvement — enough to clear a lake gap,
        // without searching all the way to the extraction town.
        const detour = astarCorridor(world, from, goal, DETOUR_SPAN, true);
        if (detour.length > 0) return detour;
    }

    const coastal = coastDetour(world, from, goal);
    if (coastal.length > 0) return coastal;

    return straight;
}

function collectToward(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    maxSteps: number
): TilePoint[] {
    const path: TilePoint[] = [];
    let cur = { ...from };
    for (let i = 0; i < maxSteps; i++) {
        const next = stepTowardWalkable(world, cur, goal);
        if (!next) break;
        path.push(next);
        cur = next;
    }
    return path;
}

/**
 * One greedy cardinal step toward goal. Prefers the dominant axis, then the
 * other; only accepts a step that strictly improves Manhattan.
 */
function stepTowardWalkable(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint
): TilePoint | null {
    const dx = Math.sign(goal.x - from.x);
    const dy = Math.sign(goal.y - from.y);
    if (dx === 0 && dy === 0) return null;

    const ordered: TilePoint[] = [];
    if (Math.abs(goal.x - from.x) >= Math.abs(goal.y - from.y)) {
        if (dx !== 0) ordered.push({ x: from.x + dx, y: from.y });
        if (dy !== 0) ordered.push({ x: from.x, y: from.y + dy });
    } else {
        if (dy !== 0) ordered.push({ x: from.x, y: from.y + dy });
        if (dx !== 0) ordered.push({ x: from.x + dx, y: from.y });
    }

    const startScore = manhattan(from, goal);
    for (const tile of ordered) {
        if (!world.isWalkable(tile.x, tile.y)) continue;
        if (manhattan(tile, goal) < startScore) return tile;
    }
    return null;
}

interface AStarNode {
    x: number;
    y: number;
    g: number;
    f: number;
}

/**
 * Binary-heap A* corridor toward goal; returns up to `span` steps.
 * When `stopOnProgress`, returns as soon as Manhattan to goal improves.
 */
function astarCorridor(
    world: WorldMap,
    from: TilePoint,
    goal: TilePoint,
    span: number,
    stopOnProgress = false
): TilePoint[] {
    if (from.x === goal.x && from.y === goal.y) return [];

    const startKey = tileKey(from);
    const goalKey = tileKey(goal);
    const startScore = manhattan(from, goal);
    const open = new MinHeap();
    open.push({ x: from.x, y: from.y, g: 0, f: startScore });
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startKey, 0]]);
    const closed = new Set<string>();
    let visited = 0;
    let bestKey = startKey;
    let bestScore = startScore;

    while (open.size > 0 && visited < ASTAR_MAX_NODES) {
        const current = open.pop()!;
        const currentKey = tileKey(current);
        if (closed.has(currentKey)) continue;
        closed.add(currentKey);
        visited += 1;

        const score = manhattan(current, goal);
        if (score < bestScore) {
            bestScore = score;
            bestKey = currentKey;
            if (stopOnProgress && score < startScore) {
                return reconstructPath(cameFrom, startKey, currentKey).slice(0, span);
            }
        }

        if (currentKey === goalKey) {
            return reconstructPath(cameFrom, startKey, currentKey).slice(0, span);
        }

        for (const dir of CARDINALS) {
            const next = { x: current.x + dir.x, y: current.y + dir.y };
            if (manhattan(from, next) > ASTAR_MAX_DISTANCE) continue;
            const nextKey = tileKey(next);
            if (closed.has(nextKey)) continue;
            if (!world.isWalkable(next.x, next.y)) continue;

            // Unit step cost: terrain weights make lake detours exceed node budgets.
            const tentativeG = current.g + 1;
            const prevG = gScore.get(nextKey);
            if (prevG !== undefined && tentativeG >= prevG - 1e-9) continue;

            gScore.set(nextKey, tentativeG);
            cameFrom.set(nextKey, currentKey);
            open.push({
                x: next.x,
                y: next.y,
                g: tentativeG,
                f: tentativeG + manhattan(next, goal),
            });
        }
    }

    if (bestKey === startKey || bestScore >= startScore) return [];
    return reconstructPath(cameFrom, startKey, bestKey).slice(0, span);
}

/** Cheap north-preferring shore slide when A* credits are exhausted. */
function coastDetour(world: WorldMap, from: TilePoint, goal: TilePoint): TilePoint[] {
    const dominantIsX = Math.abs(goal.x - from.x) >= Math.abs(goal.y - from.y);
    const advance: TilePoint = dominantIsX
        ? { x: Math.sign(goal.x - from.x), y: 0 }
        : { x: 0, y: Math.sign(goal.y - from.y) };
    if (advance.x === 0 && advance.y === 0) return [];

    const perps: TilePoint[] = dominantIsX
        ? [{ x: 0, y: -1 }, { x: 0, y: 1 }]
        : [{ x: -1, y: 0 }, { x: 1, y: 0 }];

    let best: TilePoint[] | null = null;
    let bestScore = Infinity;

    for (const dir of perps) {
        const path: TilePoint[] = [];
        for (let dist = 1; dist <= 160; dist++) {
            const along = { x: from.x + dir.x * dist, y: from.y + dir.y * dist };
            if (!world.isWalkable(along.x, along.y)) break;
            path.push(along);
            const toward = { x: along.x + advance.x, y: along.y + advance.y };
            if (!world.isWalkable(toward.x, toward.y)) continue;

            let cur = along;
            for (let step = 0; step < 80; step++) {
                const next = { x: cur.x + advance.x, y: cur.y + advance.y };
                if (!world.isWalkable(next.x, next.y)) break;
                path.push(next);
                cur = next;
                if (manhattan(cur, goal) < manhattan(from, goal)) break;
            }
            const tip = path[path.length - 1]!;
            const score = path.length + manhattan(tip, goal);
            if (score < bestScore) {
                bestScore = score;
                best = path.slice();
            }
            break;
        }
    }
    return best ?? [];
}

class MinHeap {
    private data: AStarNode[] = [];

    get size(): number {
        return this.data.length;
    }

    push(node: AStarNode): void {
        this.data.push(node);
        this.bubbleUp(this.data.length - 1);
    }

    pop(): AStarNode | undefined {
        if (this.data.length === 0) return undefined;
        const root = this.data[0]!;
        const last = this.data.pop()!;
        if (this.data.length > 0) {
            this.data[0] = last;
            this.bubbleDown(0);
        }
        return root;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!this.less(this.data[index]!, this.data[parent]!)) break;
            [this.data[index], this.data[parent]] = [this.data[parent]!, this.data[index]!];
            index = parent;
        }
    }

    private bubbleDown(index: number): void {
        const n = this.data.length;
        while (true) {
            let smallest = index;
            const left = index * 2 + 1;
            const right = left + 1;
            if (left < n && this.less(this.data[left]!, this.data[smallest]!)) smallest = left;
            if (right < n && this.less(this.data[right]!, this.data[smallest]!)) smallest = right;
            if (smallest === index) break;
            [this.data[index], this.data[smallest]] = [this.data[smallest]!, this.data[index]!];
            index = smallest;
        }
    }

    private less(a: AStarNode, b: AStarNode): boolean {
        return a.f < b.f - 1e-9 || (Math.abs(a.f - b.f) <= 1e-9 && a.g < b.g);
    }
}

function tileKey(tile: TilePoint): string {
    return `${tile.x},${tile.y}`;
}

function reconstructPath(
    cameFrom: Map<string, string>,
    startKey: string,
    goalKey: string
): TilePoint[] {
    const path: TilePoint[] = [];
    let current = goalKey;
    while (current !== startKey) {
        const [xText, yText] = current.split(',');
        path.push({ x: Number(xText), y: Number(yText) });
        const parent = cameFrom.get(current);
        if (!parent) break;
        current = parent;
    }
    path.reverse();
    return path;
}

function nearestPathDistance(path: TilePoint[], from: TilePoint, index: number): number {
    let best = Infinity;
    const start = Math.max(0, index - 4);
    const end = Math.min(path.length, index + 24);
    for (let i = start; i < end; i++) {
        best = Math.min(best, manhattan(from, path[i]!));
    }
    return best;
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
    const dx = Math.sign(goal.x - from.x);
    const dy = Math.sign(goal.y - from.y);
    const ordered: TilePoint[] = [];
    if (dy !== 0) ordered.push({ x: from.x, y: from.y + dy });
    if (dx !== 0) ordered.push({ x: from.x + dx, y: from.y });
    ordered.push(
        { x: from.x + 1, y: from.y },
        { x: from.x - 1, y: from.y },
        { x: from.x, y: from.y + 1 },
        { x: from.x, y: from.y - 1 },
    );
    for (const tile of ordered) {
        if ((tile.x !== from.x || tile.y !== from.y) && world.isWalkable(tile.x, tile.y)) {
            return tile;
        }
    }
    return { ...from };
}
