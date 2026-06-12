import { TileType } from './Tile';
import type { TilePoint } from './WorldMap';
import { sampleHmapEdge, type HmapSample } from './HmapBlend';
import BURGOS_CASTLE_HMAP_CONTENT_JSON from '../data/content/burgos-castle-hmap.json';

// Generated from original client MAP/01hmap.BMP (Burgos Castle), reduced to terrain symbols.
interface BurgosCastleHmapContent {
    size: number;
    rle: readonly string[];
}

const BURGOS_CASTLE_HMAP_CONTENT = BURGOS_CASTLE_HMAP_CONTENT_JSON as BurgosCastleHmapContent;
export const BURGOS_CASTLE_HMAP_SIZE = BURGOS_CASTLE_HMAP_CONTENT.size;
const BURGOS_CASTLE_HMAP_HALF = Math.floor(BURGOS_CASTLE_HMAP_SIZE / 2);

type BurgosHmapSymbol = 'w' | 'f' | 'g' | 's' | 'r' | 'x' | 't';

const TILE_BY_SYMBOL: Record<BurgosHmapSymbol, TileType> = {
    w: TileType.WATER,
    f: TileType.FOREST,
    g: TileType.GRASS,
    s: TileType.SAND,
    r: TileType.ROAD,
    x: TileType.WALL,
    t: TileType.STONE,
};

function decodeRow(row: string): string {
    let decoded = '';
    let countText = '';
    for (const char of row) {
        if (char >= '0' && char <= '9') {
            countText += char;
            continue;
        }
        const count = countText ? Number(countText) : 1;
        decoded += char.repeat(count);
        countText = '';
    }
    if (decoded.length !== BURGOS_CASTLE_HMAP_SIZE) {
        throw new Error(`Invalid Burgos Castle hmap row width: ${decoded.length}`);
    }
    return decoded;
}

export const BURGOS_CASTLE_HMAP_ROWS = BURGOS_CASTLE_HMAP_CONTENT.rle.map(decodeRow);

export function getBurgosCastleHmapTileAt(tx: number, ty: number, center: TilePoint): HmapSample | null {
    const localX = tx - center.x + BURGOS_CASTLE_HMAP_HALF;
    const localY = ty - center.y + BURGOS_CASTLE_HMAP_HALF;
    if (localX < 0 || localY < 0 || localX >= BURGOS_CASTLE_HMAP_SIZE || localY >= BURGOS_CASTLE_HMAP_SIZE) {
        return null;
    }

    if (localX === BURGOS_CASTLE_HMAP_HALF && localY === BURGOS_CASTLE_HMAP_HALF) {
        return { tile: TileType.DUNGEON_ENTRANCE, weight: BURGOS_CASTLE_HMAP_HALF };
    }

    const symbol = BURGOS_CASTLE_HMAP_ROWS[localY][localX] as BurgosHmapSymbol;
    const edgeDist = Math.min(localX, localY, BURGOS_CASTLE_HMAP_SIZE - 1 - localX, BURGOS_CASTLE_HMAP_SIZE - 1 - localY);
    return sampleHmapEdge(TILE_BY_SYMBOL[symbol], edgeDist, tx, ty);
}
