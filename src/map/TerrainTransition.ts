import { TileType, TILE_PROPERTIES } from './Tile';

export interface GroundLayer {
    type: TileType;
    /** N, NE, E, SE, S, SW, W, NW. Higher layers continue over this one. */
    connections: boolean[];
}

function groundFamily(type: TileType): TileType | undefined {
    switch (type) {
        case TileType.TOWN: return TileType.ROAD;
        // These use the same stone artwork. Collision and entrance behavior
        // still come from the original tile type, independently of painting.
        case TileType.WALL:
        case TileType.DUNGEON_ENTRANCE: return TileType.STONE;
        case TileType.GRASS:
        case TileType.FOREST:
        case TileType.SAND:
        case TileType.ROAD:
        case TileType.STONE:
        case TileType.SNOW: return type;
        default: return undefined;
    }
}

/** Continue the actual banks underneath the transparent rocky shore artwork. */
export function planShoreLayers(neighbors: readonly TileType[]): GroundLayer[] {
    const ground = neighbors.map(type => {
        if (type === TileType.WATER || type === TileType.DEEP_WATER) return undefined;
        // A canopy belongs to its land cell; only its ground reaches the shore.
        if (type === TileType.FOREST) return TileType.GRASS;
        if (type === TileType.WALL || type === TileType.DUNGEON_ENTRANCE) return TileType.STONE;
        return groundFamily(type) ?? type;
    });
    const layers = [...new Set(ground.filter((type): type is TileType => type !== undefined))]
        .sort((a, b) => TILE_PROPERTIES[a].blendPriority - TILE_PROPERTIES[b].blendPriority);
    return layers.map(type => ({
        type,
        connections: ground.map(neighbor => neighbor === undefined ||
            TILE_PROPERTIES[neighbor].blendPriority >= TILE_PROPERTIES[type].blendPriority),
    }));
}

/** Paint only terrain that exists here; never invent a grass underlay. */
export function planGroundLayers(center: TileType, neighbors: readonly TileType[]): GroundLayer[] | undefined {
    const current = groundFamily(center);
    if (current === undefined) return undefined;
    // Forest artwork is a canopy, so its crown and roots sit over adjacent
    // ground. Drawing road/sand above it would slice trees into rectangles.
    // This affects paint order only, not movement cost or terrain rules.
    const priority = (type: TileType) => type === TileType.FOREST ? 9 : TILE_PROPERTIES[type].blendPriority;
    // Water and hazards retain their own edge treatment.
    const surrounding = neighbors.map(type => groundFamily(type) ?? current);
    const layers = [...new Set([current, ...surrounding.filter(type => priority(type) <= priority(current))])]
        .sort((a, b) => priority(a) - priority(b));
    return layers.map(type => ({
        type,
        connections: surrounding.map(neighbor => priority(neighbor) >= priority(type)),
    }));
}
