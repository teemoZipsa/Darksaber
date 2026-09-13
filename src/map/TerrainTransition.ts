import { TileType, TILE_PROPERTIES } from './Tile';

export interface GroundLayer {
    type: TileType;
    /** N, NE, E, SE, S, SW, W, NW. Higher layers continue over this one. */
    connections: boolean[];
}

function groundFamily(type: TileType): TileType | undefined {
    switch (type) {
        case TileType.TOWN: return TileType.ROAD;
        case TileType.GRASS:
        case TileType.FOREST:
        case TileType.SAND:
        case TileType.ROAD:
        case TileType.STONE:
        case TileType.SNOW: return type;
        default: return undefined;
    }
}

/** Paint only terrain that exists here; never invent a grass underlay. */
export function planGroundLayers(center: TileType, neighbors: readonly TileType[]): GroundLayer[] | undefined {
    const current = groundFamily(center);
    if (current === undefined) return undefined;
    // Forest artwork is a canopy, so its crown and roots sit over adjacent
    // ground. Drawing road/sand above it would slice trees into rectangles.
    // This affects paint order only, not movement cost or terrain rules.
    const priority = (type: TileType) => type === TileType.FOREST ? 9 : TILE_PROPERTIES[type].blendPriority;
    // Water has its own shoreline; hazards and walls retain their silhouettes.
    const surrounding = neighbors.map(type => groundFamily(type) ?? current);
    const layers = [...new Set([current, ...surrounding.filter(type => priority(type) <= priority(current))])]
        .sort((a, b) => priority(a) - priority(b));
    return layers.map(type => ({
        type,
        connections: surrounding.map(neighbor => priority(neighbor) >= priority(type)),
    }));
}
