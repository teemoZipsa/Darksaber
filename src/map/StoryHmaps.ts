import { TileType } from './Tile';
import type { TilePoint } from './WorldMap';
import { sampleHmapEdge, type HmapSample } from './HmapBlend';
import STORY_HMAP_CONTENT_JSON from '../data/content/story-hmaps.json';

// Generated from original client MAP/02hmap.BMP through MAP/20hmap.BMP.
interface StoryHmapContent {
    size: number;
    rle: Record<string, readonly string[]>;
}

const STORY_HMAP_CONTENT = STORY_HMAP_CONTENT_JSON as StoryHmapContent;
export const STORY_HMAP_SIZE = STORY_HMAP_CONTENT.size;
const STORY_HMAP_HALF = Math.floor(STORY_HMAP_SIZE / 2);

type StoryHmapSymbol = 'w' | 'f' | 'g' | 's' | 'r' | 'x' | 't' | 'l';

const TILE_BY_SYMBOL: Record<StoryHmapSymbol, TileType> = {
    w: TileType.WATER,
    f: TileType.FOREST,
    g: TileType.GRASS,
    s: TileType.SAND,
    r: TileType.ROAD,
    x: TileType.WALL,
    t: TileType.STONE,
    l: TileType.LAVA,
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
    if (decoded.length !== STORY_HMAP_SIZE) {
        throw new Error(`Invalid story hmap row width: ${decoded.length}`);
    }
    return decoded;
}

const STORY_HMAP_ROWS = new Map<number, readonly string[]>(Object.entries(STORY_HMAP_CONTENT.rle).map(([episode, rows]) => [Number(episode), rows.map(decodeRow)]));

export function getStoryHmapTileAt(episode: number, tx: number, ty: number, center: TilePoint): HmapSample | null {
    const rows = STORY_HMAP_ROWS.get(episode);
    if (!rows) return null;
    const localX = tx - center.x + STORY_HMAP_HALF;
    const localY = ty - center.y + STORY_HMAP_HALF;
    if (localX < 0 || localY < 0 || localX >= STORY_HMAP_SIZE || localY >= STORY_HMAP_SIZE) {
        return null;
    }
    if (localX === STORY_HMAP_HALF && localY === STORY_HMAP_HALF) {
        return { tile: TileType.DUNGEON_ENTRANCE, weight: STORY_HMAP_HALF };
    }
    const symbol = rows[localY][localX] as StoryHmapSymbol;
    const edgeDist = Math.min(localX, localY, STORY_HMAP_SIZE - 1 - localX, STORY_HMAP_SIZE - 1 - localY);
    return sampleHmapEdge(TILE_BY_SYMBOL[symbol], edgeDist, tx, ty);
}
