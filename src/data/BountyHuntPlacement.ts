import type { BountyContract } from './BountyContractData';
import type { TilePoint } from '../field/FieldPathing';
import type { WorldMap } from '../map/WorldMap';

export const BOUNTY_HUNT_DIRECTION_KEYS = [
    'n',
    'ne',
    'e',
    'se',
    's',
    'sw',
    'w',
    'nw',
] as const;

export const BOUNTY_HUNT_CLUE_KINDS = [
    'tracks',
    'remains',
    'witness',
] as const;

export type BountyHuntDirectionKey = typeof BOUNTY_HUNT_DIRECTION_KEYS[number];
export type BountyHuntClueKind = typeof BOUNTY_HUNT_CLUE_KINDS[number];

export interface BountyHuntLastSeenArea {
    id: string;
    center: TilePoint;
    radius: number;
}

export interface BountyHuntClue {
    id: string;
    index: 0 | 1;
    kind: BountyHuntClueKind;
    tile: TilePoint;
}

export interface BountyHuntLair {
    id: string;
    tile: TilePoint;
}

export interface BountyHuntLayout {
    contractId: string;
    directionKey: BountyHuntDirectionKey;
    lastSeenArea: BountyHuntLastSeenArea;
    clues: readonly [BountyHuntClue, BountyHuntClue];
    lair: BountyHuntLair;
}

interface ReachableCandidate {
    tile: TilePoint;
    distance: number;
    openNeighbors: number;
}

const CARDINAL_DIRECTIONS: readonly TilePoint[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];

const MAX_SEARCH_DISTANCE = 72;
const LAST_SEEN_RADIUS = 16;
const layoutCache = new WeakMap<WorldMap, Map<string, BountyHuntLayout | null>>();
const reachableCache = new WeakMap<WorldMap, Map<string, ReachableCandidate[]>>();

/**
 * Direction printed on the notice. It intentionally depends only on the stable
 * contract id so the town board does not need to construct a WorldMap.
 */
export function getBountyHuntDirectionKey(contractId: string): BountyHuntDirectionKey {
    return BOUNTY_HUNT_DIRECTION_KEYS[
        hashString(`${contractId}:hunt-direction`) % BOUNTY_HUNT_DIRECTION_KEYS.length
    ];
}

/**
 * Deterministically projects a bounty contract onto reachable open-world tiles.
 * Static coordinates are derived rather than trusted from a client or save.
 */
export function getBountyHuntLayout(
    contract: BountyContract,
    worldMap: WorldMap,
): BountyHuntLayout | null {
    const cache = getLayoutCache(worldMap);
    const cacheKey = `${worldMap.getRealm()}:${contract.id}`;
    if (cache.has(cacheKey)) return cloneLayout(cache.get(cacheKey) ?? null);

    const town = worldMap.getTowns().find((entry) => entry.id === contract.originTownId);
    if (!town) {
        cache.set(cacheKey, null);
        return null;
    }

    const origin = worldMap.getTownExitTile(town);
    const reachable = getReachableCandidates(worldMap, contract.originTownId, origin);
    const directionKey = getBountyHuntDirectionKey(contract.id);
    const center = pickCandidate(
        reachable,
        `${contract.id}:last-seen`,
        [
            (candidate) => candidate.distance >= 28
                && candidate.distance <= 46
                && matchesDirection(origin, candidate.tile, directionKey),
            (candidate) => candidate.distance >= 20
                && candidate.distance <= 58
                && matchesDirection(origin, candidate.tile, directionKey),
            (candidate) => candidate.distance >= 16
                && matchesDirection(origin, candidate.tile, directionKey),
            (candidate) => candidate.distance >= 16,
        ],
    );
    if (!center) {
        cache.set(cacheKey, null);
        return null;
    }

    const cluePair = pickCluePair(
        reachable,
        center,
        contract.id,
        LAST_SEEN_RADIUS,
    );
    if (!cluePair) {
        cache.set(cacheKey, null);
        return null;
    }

    const clueKinds = pickClueKinds(contract.id);
    const clues: [BountyHuntClue, BountyHuntClue] = [
        {
            id: `${contract.id}:clue:0`,
            index: 0,
            kind: clueKinds[0],
            tile: { ...cluePair[0].tile },
        },
        {
            id: `${contract.id}:clue:1`,
            index: 1,
            kind: clueKinds[1],
            tile: { ...cluePair[1].tile },
        },
    ];
    const furthestClueDistance = Math.max(cluePair[0].distance, cluePair[1].distance);
    const occupied = new Set([
        tileKey(center.tile),
        tileKey(cluePair[0].tile),
        tileKey(cluePair[1].tile),
    ]);
    const lair = pickCandidate(
        reachable,
        `${contract.id}:lair`,
        [
            (candidate) => !occupied.has(tileKey(candidate.tile))
                && candidate.openNeighbors >= 3
                && manhattan(center.tile, candidate.tile) >= LAST_SEEN_RADIUS + 2
                && manhattan(center.tile, candidate.tile) <= 34
                && candidate.distance >= furthestClueDistance + 4
                && matchesDirection(origin, candidate.tile, directionKey),
            (candidate) => !occupied.has(tileKey(candidate.tile))
                && candidate.openNeighbors >= 3
                && manhattan(center.tile, candidate.tile) >= LAST_SEEN_RADIUS + 1
                && manhattan(center.tile, candidate.tile) <= 42
                && candidate.distance > center.distance
                && matchesDirection(origin, candidate.tile, directionKey),
            (candidate) => !occupied.has(tileKey(candidate.tile))
                && candidate.openNeighbors >= 2
                && manhattan(center.tile, candidate.tile) >= 10
                && candidate.distance > center.distance,
            (candidate) => !occupied.has(tileKey(candidate.tile))
                && candidate.openNeighbors >= 2,
        ],
    );
    if (!lair) {
        cache.set(cacheKey, null);
        return null;
    }

    const layout: BountyHuntLayout = {
        contractId: contract.id,
        directionKey,
        lastSeenArea: {
            id: `${contract.id}:last-seen`,
            center: { ...center.tile },
            radius: LAST_SEEN_RADIUS,
        },
        clues,
        lair: {
            id: `${contract.id}:lair`,
            tile: { ...lair.tile },
        },
    };
    cache.set(cacheKey, layout);
    return cloneLayout(layout);
}

function collectReachableCandidates(
    worldMap: WorldMap,
    origin: TilePoint,
    maxDistance: number,
): ReachableCandidate[] {
    const bounds = worldMap.getBoundsTiles();
    const queue: Array<{ tile: TilePoint; distance: number }> = [{
        tile: { ...origin },
        distance: 0,
    }];
    const visited = new Set<string>([tileKey(origin)]);
    const candidates: ReachableCandidate[] = [];

    for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        if (isPlacementCandidate(worldMap, current.tile)) {
            candidates.push({
                tile: { ...current.tile },
                distance: current.distance,
                openNeighbors: countOpenNeighbors(worldMap, current.tile),
            });
        }
        if (current.distance >= maxDistance) continue;

        for (const direction of CARDINAL_DIRECTIONS) {
            const next = {
                x: current.tile.x + direction.x,
                y: current.tile.y + direction.y,
            };
            if (
                next.x < 0
                || next.y < 0
                || next.x >= bounds.width
                || next.y >= bounds.height
            ) continue;
            const key = tileKey(next);
            if (visited.has(key) || !worldMap.isWalkable(next.x, next.y)) continue;
            visited.add(key);
            queue.push({ tile: next, distance: current.distance + 1 });
        }
    }

    return candidates;
}

function getReachableCandidates(
    worldMap: WorldMap,
    townId: string,
    origin: TilePoint,
): readonly ReachableCandidate[] {
    let worldCache = reachableCache.get(worldMap);
    if (!worldCache) {
        worldCache = new Map();
        reachableCache.set(worldMap, worldCache);
    }
    const cacheKey = `${worldMap.getRealm()}:${townId}`;
    const cached = worldCache.get(cacheKey);
    if (cached) return cached;
    const reachable = collectReachableCandidates(worldMap, origin, MAX_SEARCH_DISTANCE);
    worldCache.set(cacheKey, reachable);
    return reachable;
}

function isPlacementCandidate(worldMap: WorldMap, tile: TilePoint): boolean {
    if (!worldMap.isWalkable(tile.x, tile.y)) return false;
    if (worldMap.getTownAtTile(tile.x, tile.y)) return false;
    if (worldMap.getTempleAtTile(tile.x, tile.y)) return false;
    if (worldMap.getDungeonAtTile(tile.x, tile.y)) return false;
    return countOpenNeighbors(worldMap, tile) >= 2;
}

function countOpenNeighbors(worldMap: WorldMap, tile: TilePoint): number {
    let count = 0;
    for (const direction of CARDINAL_DIRECTIONS) {
        if (worldMap.isWalkable(tile.x + direction.x, tile.y + direction.y)) count++;
    }
    return count;
}

function pickCandidate(
    candidates: readonly ReachableCandidate[],
    seed: string,
    stages: readonly ((candidate: ReachableCandidate) => boolean)[],
): ReachableCandidate | null {
    for (const predicate of stages) {
        const eligible = candidates.filter(predicate);
        if (eligible.length === 0) continue;
        eligible.sort((left, right) => (
            candidateScore(seed, left.tile) - candidateScore(seed, right.tile)
            || left.distance - right.distance
            || left.tile.y - right.tile.y
            || left.tile.x - right.tile.x
        ));
        return eligible[0];
    }
    return null;
}

function pickCluePair(
    candidates: readonly ReachableCandidate[],
    center: ReachableCandidate,
    contractId: string,
    searchRadius: number,
): readonly [ReachableCandidate, ReachableCandidate] | null {
    const stages = [
        candidates.filter((candidate) => (
            tileKey(candidate.tile) !== tileKey(center.tile)
            && manhattan(center.tile, candidate.tile) >= 4
            && manhattan(center.tile, candidate.tile) <= searchRadius
        )),
        candidates.filter((candidate) => (
            tileKey(candidate.tile) !== tileKey(center.tile)
            && manhattan(center.tile, candidate.tile) >= 2
            && manhattan(center.tile, candidate.tile) <= searchRadius
        )),
    ];

    for (const stage of stages) {
        const ordered = [...stage].sort((left, right) => (
            candidateScore(`${contractId}:clues`, left.tile)
                - candidateScore(`${contractId}:clues`, right.tile)
            || left.distance - right.distance
            || left.tile.y - right.tile.y
            || left.tile.x - right.tile.x
        ));
        for (let firstIndex = 0; firstIndex < ordered.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex++) {
                const first = ordered[firstIndex];
                const second = ordered[secondIndex];
                if (manhattan(first.tile, second.tile) < 6) continue;
                return orderClues(first, second, contractId);
            }
        }
    }
    return null;
}

function orderClues(
    first: ReachableCandidate,
    second: ReachableCandidate,
    contractId: string,
): readonly [ReachableCandidate, ReachableCandidate] {
    const comparison = first.distance - second.distance
        || candidateScore(`${contractId}:clue-order`, first.tile)
            - candidateScore(`${contractId}:clue-order`, second.tile)
        || first.tile.y - second.tile.y
        || first.tile.x - second.tile.x;
    return comparison <= 0 ? [first, second] : [second, first];
}

function pickClueKinds(
    contractId: string,
): readonly [BountyHuntClueKind, BountyHuntClueKind] {
    const start = hashString(`${contractId}:clue-kinds`) % BOUNTY_HUNT_CLUE_KINDS.length;
    const direction = hashString(`${contractId}:clue-kind-order`) % 2 === 0 ? 1 : 2;
    return [
        BOUNTY_HUNT_CLUE_KINDS[start],
        BOUNTY_HUNT_CLUE_KINDS[(start + direction) % BOUNTY_HUNT_CLUE_KINDS.length],
    ];
}

function matchesDirection(
    origin: TilePoint,
    tile: TilePoint,
    direction: BountyHuntDirectionKey,
): boolean {
    const dx = tile.x - origin.x;
    const dy = tile.y - origin.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    switch (direction) {
        case 'n':
            return dy < 0 && absX * 2 <= absY * 3;
        case 'ne':
            return dx > 0 && dy < 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
        case 'e':
            return dx > 0 && absY * 2 <= absX * 3;
        case 'se':
            return dx > 0 && dy > 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
        case 's':
            return dy > 0 && absX * 2 <= absY * 3;
        case 'sw':
            return dx < 0 && dy > 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
        case 'w':
            return dx < 0 && absY * 2 <= absX * 3;
        case 'nw':
            return dx < 0 && dy < 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
    }
}

function getLayoutCache(worldMap: WorldMap): Map<string, BountyHuntLayout | null> {
    let cache = layoutCache.get(worldMap);
    if (!cache) {
        cache = new Map();
        layoutCache.set(worldMap, cache);
    }
    return cache;
}

function cloneLayout(layout: BountyHuntLayout | null): BountyHuntLayout | null {
    if (!layout) return null;
    return {
        contractId: layout.contractId,
        directionKey: layout.directionKey,
        lastSeenArea: {
            ...layout.lastSeenArea,
            center: { ...layout.lastSeenArea.center },
        },
        clues: [
            { ...layout.clues[0], tile: { ...layout.clues[0].tile } },
            { ...layout.clues[1], tile: { ...layout.clues[1].tile } },
        ],
        lair: {
            ...layout.lair,
            tile: { ...layout.lair.tile },
        },
    };
}

function candidateScore(seed: string, tile: TilePoint): number {
    return hashString(`${seed}:${tile.x},${tile.y}`);
}

function tileKey(tile: TilePoint): string {
    return `${tile.x},${tile.y}`;
}

function manhattan(left: TilePoint, right: TilePoint): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
