export interface TilePoint {
    x: number;
    y: number;
}

export type FieldIntentKind = 'move' | 'attack' | 'interact' | 'follow' | 'enemy';

export interface FieldPassableQuery {
    x: number;
    y: number;
    actorId?: string;
    intent: FieldIntentKind;
    goal?: TilePoint;
}

export type FieldPassable = (query: FieldPassableQuery) => boolean;

export interface FindPathOptions {
    actorId?: string;
    intent?: FieldIntentKind;
    maxNodes?: number;
    maxDistance?: number;
    allowGoalBlocked?: boolean;
}

export interface WeightedPathResult {
    path: TilePoint[];
    cost: number;
}

export interface FindPathWithCostOptions extends FindPathOptions {
    maxCost?: number;
}

export interface ReachableTile {
    tile: TilePoint;
    cost: number;
}

interface PathNode extends TilePoint {
    g: number;
    f: number;
}

type StepCost = (tile: TilePoint, from: TilePoint) => number;

const CARDINAL_DIRS: TilePoint[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];

export function tileKey(x: number, y: number): string {
    return `${x},${y}`;
}

export function sameTile(a: TilePoint, b: TilePoint): boolean {
    return a.x === b.x && a.y === b.y;
}

export function manhattan(a: TilePoint, b: TilePoint): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isInRange(a: TilePoint, b: TilePoint, range: number): boolean {
    return manhattan(a, b) <= range;
}

export function tilesInRange(center: TilePoint, range: number): TilePoint[] {
    const tiles: TilePoint[] = [];
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.abs(dx) + Math.abs(dy) <= range) {
                tiles.push({ x: center.x + dx, y: center.y + dy });
            }
        }
    }
    return tiles;
}

export function findPath(
    start: TilePoint,
    goal: TilePoint,
    isFieldPassable: FieldPassable,
    options: FindPathOptions = {}
): TilePoint[] {
    if (sameTile(start, goal)) return [];

    const intent = options.intent ?? 'move';
    const maxNodes = options.maxNodes ?? 5000;
    const open: PathNode[] = [{ ...start, g: 0, f: manhattan(start, goal) }];
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[tileKey(start.x, start.y), 0]]);
    const closed = new Set<string>();
    let visited = 0;

    while (open.length > 0 && visited < maxNodes) {
        open.sort((a, b) => a.f - b.f || a.g - b.g);
        const current = open.shift()!;
        const currentKey = tileKey(current.x, current.y);
        if (closed.has(currentKey)) continue;
        closed.add(currentKey);
        visited++;

        if (sameTile(current, goal)) {
            return reconstructPath(cameFrom, currentKey).slice(1);
        }

        for (const dir of CARDINAL_DIRS) {
            const next = { x: current.x + dir.x, y: current.y + dir.y };
            if (options.maxDistance !== undefined && manhattan(start, next) > options.maxDistance) continue;

            const nextKey = tileKey(next.x, next.y);
            if (closed.has(nextKey)) continue;

            const isGoal = sameTile(next, goal);
            const passable = isGoal && options.allowGoalBlocked
                ? true
                : isFieldPassable({
                    x: next.x,
                    y: next.y,
                    actorId: options.actorId,
                    intent,
                    goal,
                });
            if (!passable) continue;

            const tentativeG = current.g + 1;
            const knownG = gScore.get(nextKey);
            if (knownG !== undefined && tentativeG >= knownG) continue;

            cameFrom.set(nextKey, currentKey);
            gScore.set(nextKey, tentativeG);
            open.push({
                ...next,
                g: tentativeG,
                f: tentativeG + manhattan(next, goal),
            });
        }
    }

    return [];
}

export function findPathToAny(
    start: TilePoint,
    goals: TilePoint[],
    isFieldPassable: FieldPassable,
    options: FindPathOptions = {}
): TilePoint[] {
    const sortedGoals = [...goals].sort((a, b) => manhattan(start, a) - manhattan(start, b));
    let best: TilePoint[] = [];

    for (const goal of sortedGoals) {
        const path = findPath(start, goal, isFieldPassable, options);
        if (path.length === 0 && !sameTile(start, goal)) continue;
        if (best.length === 0 || path.length < best.length) best = path;
        if (best.length <= 1) break;
    }

    return best;
}

export function findPathWithCost(
    start: TilePoint,
    goal: TilePoint,
    isFieldPassable: FieldPassable,
    getStepCost: StepCost,
    options: FindPathWithCostOptions = {}
): WeightedPathResult {
    if (sameTile(start, goal)) return { path: [], cost: 0 };

    const intent = options.intent ?? 'move';
    const maxNodes = options.maxNodes ?? 5000;
    const open: PathNode[] = [{ ...start, g: 0, f: 0 }];
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[tileKey(start.x, start.y), 0]]);
    const closed = new Set<string>();
    let visited = 0;

    while (open.length > 0 && visited < maxNodes) {
        open.sort((a, b) => a.f - b.f || a.g - b.g);
        const current = open.shift()!;
        const currentKey = tileKey(current.x, current.y);
        if (closed.has(currentKey)) continue;
        closed.add(currentKey);
        visited++;

        if (sameTile(current, goal)) {
            return { path: reconstructPath(cameFrom, currentKey).slice(1), cost: current.g };
        }

        for (const dir of CARDINAL_DIRS) {
            const next = { x: current.x + dir.x, y: current.y + dir.y };
            if (options.maxDistance !== undefined && manhattan(start, next) > options.maxDistance) continue;

            const nextKey = tileKey(next.x, next.y);
            if (closed.has(nextKey)) continue;

            const isGoal = sameTile(next, goal);
            const passable = isGoal && options.allowGoalBlocked
                ? true
                : isFieldPassable({
                    x: next.x,
                    y: next.y,
                    actorId: options.actorId,
                    intent,
                    goal,
                });
            if (!passable) continue;

            const stepCost = getStepCost(next, current);
            if (!Number.isFinite(stepCost) || stepCost < 0) continue;

            const tentativeG = current.g + stepCost;
            if (options.maxCost !== undefined && tentativeG > options.maxCost + 1e-9) continue;

            const knownG = gScore.get(nextKey);
            if (knownG !== undefined && tentativeG >= knownG - 1e-9) continue;

            cameFrom.set(nextKey, currentKey);
            gScore.set(nextKey, tentativeG);
            open.push({
                ...next,
                g: tentativeG,
                f: tentativeG,
            });
        }
    }

    return { path: [], cost: Infinity };
}

export function findReachableTilesByCost(
    start: TilePoint,
    isFieldPassable: FieldPassable,
    getStepCost: StepCost,
    maxCost: number,
    options: FindPathWithCostOptions = {}
): Map<string, ReachableTile> {
    const intent = options.intent ?? 'move';
    const maxNodes = options.maxNodes ?? 5000;
    const open: PathNode[] = [{ ...start, g: 0, f: 0 }];
    const gScore = new Map<string, number>([[tileKey(start.x, start.y), 0]]);
    const result = new Map<string, ReachableTile>();
    const closed = new Set<string>();
    let visited = 0;

    while (open.length > 0 && visited < maxNodes) {
        open.sort((a, b) => a.g - b.g);
        const current = open.shift()!;
        const currentKey = tileKey(current.x, current.y);
        if (closed.has(currentKey)) continue;
        closed.add(currentKey);
        visited++;

        if (!sameTile(current, start)) {
            result.set(currentKey, { tile: { x: current.x, y: current.y }, cost: current.g });
        }

        for (const dir of CARDINAL_DIRS) {
            const next = { x: current.x + dir.x, y: current.y + dir.y };
            if (options.maxDistance !== undefined && manhattan(start, next) > options.maxDistance) continue;

            const nextKey = tileKey(next.x, next.y);
            if (closed.has(nextKey)) continue;
            if (!isFieldPassable({
                x: next.x,
                y: next.y,
                actorId: options.actorId,
                intent,
            })) continue;

            const stepCost = getStepCost(next, current);
            if (!Number.isFinite(stepCost) || stepCost < 0) continue;

            const tentativeG = current.g + stepCost;
            if (tentativeG > maxCost + 1e-9) continue;

            const knownG = gScore.get(nextKey);
            if (knownG !== undefined && tentativeG >= knownG - 1e-9) continue;

            gScore.set(nextKey, tentativeG);
            open.push({ ...next, g: tentativeG, f: tentativeG });
        }
    }

    return result;
}

function reconstructPath(cameFrom: Map<string, string>, endKey: string): TilePoint[] {
    const keys = [endKey];
    let current = endKey;
    while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        keys.push(current);
    }
    keys.reverse();
    return keys.map((key) => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    });
}
