import type { MonsterId } from '../data/MonsterCatalog';
import type { WorldMap } from '../map/WorldMap';
import { findPath, manhattan, type TilePoint } from './FieldPathing';

export const KAOSIA_HUNT_TOWN = 'central_castle';
export const KAOSIA_HUNT_IDS = ['gate', 'thicket', 'outer'] as const;
export type KaosiaHuntId = typeof KAOSIA_HUNT_IDS[number];

export interface KaosiaHuntingGround {
    id: KaosiaHuntId;
    center: TilePoint;
    approach: TilePoint;
    level: number;
    members: Array<{ tile: TilePoint; monsterId: MonsterId }>;
}

const cache = new WeakMap<WorldMap, readonly KaosiaHuntingGround[]>();
export const huntingEnemyPrefix = (id: KaosiaHuntId): string => `hunt_kaosia_${id}_`;
export const huntingNestKey = (id: KaosiaHuntId): string => `mortal:hunt:kaosia:${id}`;

/** Authored outdoor encounters, shared by the server and the local development
 * preview. The town biome covers far more ground than the actual safe town;
 * validate real tiles and access instead of treating the whole biome as town. */
export function getKaosiaHuntingGrounds(world: WorldMap): readonly KaosiaHuntingGround[] {
    if (world.getRealm() !== 'mortal') return [];
    const cached = cache.get(world);
    if (cached) return cached;
    const town = world.getTowns().find((entry) => entry.id === KAOSIA_HUNT_TOWN);
    if (!town) return [];
    const exit = world.getTownExitTile(town);
    const outdoor = (tile: TilePoint) => world.isWalkable(tile.x, tile.y)
        && !world.getTownAtTile(tile.x, tile.y) && !world.getTempleAtTile(tile.x, tile.y)
        && !world.getDungeonAtTile(tile.x, tile.y);
    const grounds: KaosiaHuntingGround[] = [];
    for (const [index, id] of KAOSIA_HUNT_IDS.entries()) {
        const center = { x: exit.x + 6, y: exit.y + 22 + index * 20 };
        const tiles = index === 0 ? [center] : [center, { x: center.x + 2, y: center.y + 1 }];
        if (!tiles.every(outdoor)) continue;
        const path = findPath(exit, center, outdoor, { maxNodes: 8000, maxDistance: 90 });
        const approach = path.slice().reverse().find((tile) => tiles.every((member) => manhattan(tile, member) >= 6));
        if (!approach || path.length > 80) continue;
        grounds.push({ id, center, approach, level: index === 2 ? 2 : 1,
            members: tiles.map((tile, member) => ({ tile, monsterId: index === 2
                ? member === 0 ? '305R' : '302R' : '304R' })),
        });
    }
    cache.set(world, grounds);
    return grounds;
}
