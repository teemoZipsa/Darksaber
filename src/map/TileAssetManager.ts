import { TileType, TILE_PROPERTIES } from './Tile';

const DARKSABER_TERRAIN_TEXTURES: Partial<Record<TileType, string>> = {
    [TileType.GRASS]: 'darksaber/grass.png',
    [TileType.FOREST]: 'darksaber/forest.png',
    [TileType.SAND]: 'darksaber/sand.png',
    [TileType.STONE]: 'darksaber/stone.png',
    [TileType.SNOW]: 'darksaber/snow.png',
    [TileType.POISON_SWAMP]: 'darksaber/poison_swamp.png',
    [TileType.WATER]: 'darksaber/water.png',
    [TileType.DEEP_WATER]: 'darksaber/deep_water.png',
    [TileType.ROAD]: 'darksaber/road.png',
    [TileType.TOWN]: 'darksaber/town_pavement.png',
    [TileType.WALL]: 'darksaber/dungeon_floor.png',
    [TileType.LAVA]: 'darksaber/lava.png',
    [TileType.DUNGEON_ENTRANCE]: 'darksaber/dungeon_floor.png',
};

const ORIGINAL_AUTOTILE_SHEETS = {
    mdsr0: 'darksaber/mdsr0_alpha.png',
    mdsr15: 'darksaber/mdsr15_alpha.png',
    mdsr15Lava: 'darksaber/mdsr15_lava_alpha.png',
} as const;

const DARKSABER_LANDMARK_SPRITES = {
    village: '/assets/images/landmarks/darksaber/village.png',
    portTown: '/assets/images/landmarks/darksaber/port_town.png',
    castle: '/assets/images/landmarks/darksaber/castle.png',
    burgosCastle: '/assets/images/landmarks/darksaber/burgos_castle.png',
    caveEntrance: '/assets/images/landmarks/darksaber/cave_entrance.png',
    beginnerRuins: '/assets/images/landmarks/darksaber/beginner_ruins.png',
    beginnerMine: '/assets/images/landmarks/darksaber/beginner_mine.png',
} as const;

const DARKSABER_TREE_SPRITES = {
    largeTree: '/assets/images/decor/trees/large_tree.png',
    smallTree: '/assets/images/decor/trees/small_tree.png',
    scaryTree: '/assets/images/decor/trees/scary_tree.png',
} as const;

const DARKSABER_BRIDGE_SPRITES = {
    woodBridgeHorizontal: '/assets/images/decor/bridges/wood_bridge_horizontal.png',
    woodBridgeVertical: '/assets/images/decor/bridges/wood_bridge_vertical.png',
} as const;

const DARKSABER_PROP_SPRITES = {
    fallenLog: '/assets/images/decor/props/fallen_log.png',
    boulder: '/assets/images/decor/props/boulder.png',
    stoneOutcrop: '/assets/images/decor/props/stone_outcrop.png',
    snowBoulders: '/assets/images/decor/props/snow_boulders.png',
    sandstoneOutcrop: '/assets/images/decor/props/sandstone_outcrop.png',
    swampStones: '/assets/images/decor/props/swamp_stones.png',
    ruinedWall: '/assets/images/decor/props/ruined_wall.png',
    abandonedWagon: '/assets/images/decor/props/abandoned_wagon.png',
} as const;

type OriginalAutotileSheetId = keyof typeof ORIGINAL_AUTOTILE_SHEETS;
export type LandmarkSpriteId = keyof typeof DARKSABER_LANDMARK_SPRITES;
export type TreeSpriteId = keyof typeof DARKSABER_TREE_SPRITES;
export type BridgeSpriteId = keyof typeof DARKSABER_BRIDGE_SPRITES;
export type PropSpriteId = keyof typeof DARKSABER_PROP_SPRITES;

interface OriginalAutotileConfig {
    sheet: OriginalAutotileSheetId;
    cellsByMask: Partial<Record<number, readonly number[]>>;
}

interface OriginalAutotileNeighbors {
    n: boolean;
    ne: boolean;
    e: boolean;
    se: boolean;
    s: boolean;
    sw: boolean;
    w: boolean;
    nw: boolean;
}

interface OriginalTileConfig {
    sheet: OriginalAutotileSheetId;
    cells: readonly number[];
}

const ORIGINAL_AUTOTILE_COLS = 16;
const ORIGINAL_AUTOTILE_CELL_SIZE = 32;
export const WATER_ANIMATION_FRAMES = 12;
export const WATER_ANIMATION_FRAME_MS = 160;
const ORIGINAL_TILE_CONFIGS: Partial<Record<TileType, OriginalTileConfig>> = {
    [TileType.GRASS]: { sheet: 'mdsr0', cells: [302, 303, 304] },
    [TileType.FOREST]: { sheet: 'mdsr0', cells: [3, 4, 6, 9] },
    [TileType.SAND]: { sheet: 'mdsr0', cells: [92, 93, 94] },
    [TileType.ROAD]: { sheet: 'mdsr0', cells: [33, 34] },
    [TileType.STONE]: { sheet: 'mdsr15', cells: [18, 19, 20] },
    // 145/146 are transparent diagonal coast pieces, not water variations.
    // Base fills (including deep-water blends) need fully opaque water cells.
    [TileType.WATER]: { sheet: 'mdsr0', cells: [131, 132] },
    [TileType.DEEP_WATER]: { sheet: 'mdsr15', cells: [102, 103] },
    // 448/452 are blue fragments on white, not a snow ground texture.
    // Snow uses the dedicated texture below until an original snow set is verified.
    [TileType.POISON_SWAMP]: { sheet: 'mdsr15', cells: [243, 244, 245] },
    [TileType.LAVA]: { sheet: 'mdsr15Lava', cells: [243, 244, 245] },
    [TileType.TOWN]: { sheet: 'mdsr0', cells: [33, 34, 38, 39] },
    [TileType.WALL]: { sheet: 'mdsr15', cells: [18, 19, 20] },
    [TileType.DUNGEON_ENTRANCE]: { sheet: 'mdsr15', cells: [18, 19, 20] },
};

const ORIGINAL_AUTOTILE_CONFIGS: Partial<Record<TileType, OriginalAutotileConfig>> = {
    [TileType.GRASS]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [314, 315, 316],
            6: [284, 285, 286],
            7: [299, 300, 301],
            9: [320, 321, 322],
            11: [317, 318, 319],
            12: [290, 291, 292],
            13: [305, 306, 307],
            14: [287, 288, 289],
            15: [293, 294, 295, 296, 297, 298, 302, 303, 304, 308, 309, 310, 311, 312, 313, 323, 324, 325, 326, 327, 328],
        },
    },
    [TileType.FOREST]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [10],
            6: [0],
            7: [5, 7],
            9: [12],
            11: [11],
            12: [2],
            13: [8],
            14: [1],
            15: [3, 4, 6, 9],
        },
    },
    [TileType.SAND]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [104, 105, 106],
            6: [74, 75, 76],
            7: [89, 90, 91],
            9: [110, 111, 112],
            11: [107, 108, 109],
            12: [80, 81, 82],
            13: [95, 96, 97],
            14: [77, 78, 79],
            15: [83, 84, 85, 86, 87, 88, 92, 93, 94, 98, 99, 100, 101, 102, 103, 113, 114, 115, 116, 117, 118],
        },
    },
    [TileType.ROAD]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [44, 45, 46],
            6: [15, 16, 17],
            7: [30, 31, 32],
            9: [50, 51, 52],
            11: [47, 48, 49],
            12: [21, 22, 23],
            13: [35, 36, 37],
            14: [18, 19, 20],
            15: [24, 25, 26, 27, 28, 29, 33, 34, 38, 39, 40, 41, 42, 43, 53, 54, 55, 56, 57, 58],
        },
    },
    [TileType.TOWN]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [44, 45, 46],
            6: [15, 16, 17],
            7: [30, 31, 32],
            9: [50, 51, 52],
            11: [47, 48, 49],
            12: [21, 22, 23],
            13: [35, 36, 37],
            14: [18, 19, 20],
            15: [33, 34, 38, 39, 40, 41, 42, 43],
        },
    },
    [TileType.STONE]: {
        sheet: 'mdsr15',
        cellsByMask: {
            3: [30, 31, 32],
            6: [0, 1, 2, 45],
            7: [15, 16, 17],
            9: [36, 37, 38],
            11: [33, 34, 35],
            12: [6, 7, 8],
            13: [21, 22, 23],
            14: [3, 4, 5],
            15: [9, 10, 11, 12, 13, 14, 18, 19, 20, 24, 25, 26, 27, 28, 29, 39, 40, 41, 42, 43, 44],
        },
    },
    [TileType.POISON_SWAMP]: {
        sheet: 'mdsr15',
        cellsByMask: {
            3: [255],
            6: [225, 226, 227],
            7: [240, 241, 242],
            12: [231, 232, 233],
            13: [246, 247, 248],
            14: [228, 229, 230],
            15: [243, 244, 245, 249, 250, 251, 252, 253, 254],
        },
    },
    [TileType.LAVA]: {
        sheet: 'mdsr15Lava',
        cellsByMask: {
            3: [255],
            6: [225, 226, 227],
            7: [240, 241, 242],
            12: [231, 232, 233],
            13: [246, 247, 248],
            14: [228, 229, 230],
            15: [243, 244, 245, 249, 250, 251, 252, 253, 254],
        },
    },
    [TileType.WALL]: {
        sheet: 'mdsr15',
        cellsByMask: {
            3: [30, 31, 32],
            6: [0, 1, 2, 45],
            7: [15, 16, 17],
            9: [36, 37, 38],
            11: [33, 34, 35],
            12: [6, 7, 8],
            13: [21, 22, 23],
            14: [3, 4, 5],
            15: [9, 10, 11, 12, 13, 14, 18, 19, 20, 24, 25, 26, 27, 28, 29, 39, 40, 41, 42, 43, 44],
        },
    },
    [TileType.DUNGEON_ENTRANCE]: {
        sheet: 'mdsr15',
        cellsByMask: {
            3: [30, 31, 32],
            6: [0, 1, 2, 45],
            7: [15, 16, 17],
            9: [36, 37, 38],
            11: [33, 34, 35],
            12: [6, 7, 8],
            13: [21, 22, 23],
            14: [3, 4, 5],
            15: [9, 10, 11, 12, 13, 14, 18, 19, 20, 24, 25, 26, 27, 28, 29, 39, 40, 41, 42, 43, 44],
        },
    },
    [TileType.WATER]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [139, 140, 169, 170],
            6: [120, 149, 150],
            7: [129, 130, 159, 160],
            9: [143, 144, 173, 174],
            11: [141, 142, 171, 172],
            12: [123, 124, 153, 154],
            13: [133, 134, 163, 164],
            14: [121, 122, 151, 152],
            15: [125, 126, 127, 128, 131, 132, 135, 136, 137, 138, 145, 146, 147, 148, 155, 156, 157, 158, 161, 162, 165, 166, 167, 168, 175, 176, 177, 178],
        },
    },
};

class TileAssetManagerClass {
    private images: Map<string, HTMLImageElement> = new Map();
    private loadPromises: Promise<void>[] = [];
    private cellCornerCache: Map<string, number> = new Map();
    private cornerCellsCache: Map<string, readonly number[]> = new Map();
    private waterFrameCache = new Map<string, OffscreenCanvas>();
    private snowEdgeCache = new Map<string, OffscreenCanvas>();
    private snowTextureCache = new Map<string, OffscreenCanvas>();
    private terrainRevision = 0;

    public getTerrainRevision(): number { return this.terrainRevision; }

    public init(): Promise<void[]> {
        // The compact original autotile sheets are the primary terrain source.
        // Large painted terrain textures are fallback-only and load on demand.
        for (const [key, sheetPath] of Object.entries(ORIGINAL_AUTOTILE_SHEETS)) {
            this.queueImageLoad(`autotile:${key}`, `/assets/images/tilesets/${sheetPath}`);
        }
        return Promise.all(this.loadPromises);
    }

    private queueTilesetLoad(sheetName: string): void {
        this.queueImageLoad(sheetName, `/assets/images/tilesets/${sheetName}`, () => {
            this.terrainRevision++;
            this.snowEdgeCache.clear();
        });
    }

    private queueImageLoad(key: string, src: string, onReady?: () => void): void {
        if (this.images.has(key)) return;

        const img = new Image();
        const promise = new Promise<void>((resolve) => {
            img.onload = () => { onReady?.(); resolve(); };
            img.onerror = () => {
                console.warn(`Image unavailable, using fallback rendering: ${src}`);
                resolve();
            };
        });
        img.src = src;
        this.images.set(key, img);
        this.loadPromises.push(promise);
    }

    public drawTile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        _worldX: number = 0,
        _worldY: number = 0
    ): boolean {
        if (this.drawOriginalTile(ctx, type, dx, dy, size, _worldX, _worldY)) return true;
        return this.drawTerrainTexture(ctx, type, dx, dy, size, _worldX, _worldY) || this.drawFallback(ctx, type, dx, dy, size);
    }

    public drawAutotile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        n: boolean = true,
        ne: boolean = true,
        e: boolean = true,
        se: boolean = true,
        s: boolean = true,
        sw: boolean = true,
        w: boolean = true,
        nw: boolean = true,
        worldX: number = 0,
        worldY: number = 0
    ): boolean {
        const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
        if (this.drawOriginalAutotile(ctx, type, dx, dy, size, { n, ne, e, se, s, sw, w, nw }, mask, worldX, worldY)) return true;
        return this.drawTile(ctx, type, dx, dy, size);
    }

    /** Compose four original quarters, covering narrow paths and all corners. */
    public drawGroundAutotile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType, dx: number, dy: number, size: number,
        connections: readonly boolean[], worldX: number, worldY: number
    ): void {
        if (connections.every(Boolean)) {
            this.drawTile(ctx, type, dx, dy, size, worldX, worldY);
            return;
        }
        if (type === TileType.SNOW) {
            const mask = connections.reduce((bits, on, index) => bits | (on ? 1 << index : 0), 0);
            // Reuse the original irregular ground edge as an alpha mask. Snow
            // has full cells but no edge set of its own in this recovered atlas.
            const variant = this.hashCell(worldX, worldY, type) % 6;
            const key = `${mask}:${variant}:${((worldX % 8) + 8) % 8}:${((worldY % 8) + 8) % 8}`;
            let edge = this.snowEdgeCache.get(key);
            if (!edge) {
                edge = new OffscreenCanvas(32, 32);
                const edgeCtx = edge.getContext('2d')!;
                this.drawGroundAutotile(edgeCtx, TileType.GRASS, 0, 0, 32, connections, variant, 0);
                edgeCtx.globalCompositeOperation = 'source-in';
                this.drawTile(edgeCtx, type, 0, 0, 32, worldX, worldY);
                if (this.snowEdgeCache.size >= 256) this.snowEdgeCache.delete(this.snowEdgeCache.keys().next().value!);
                this.snowEdgeCache.set(key, edge);
            }
            const smoothing = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(edge, dx, dy, size, size);
            ctx.imageSmoothingEnabled = smoothing;
            return;
        }
        const config = ORIGINAL_AUTOTILE_CONFIGS[type];
        const img = config && this.getSheet(`autotile:${config.sheet}`);
        const base = ORIGINAL_TILE_CONFIGS[type];
        if (!config || !img || !base) {
            this.drawTile(ctx, type, dx, dy, size, worldX, worldY);
            return;
        }
        const hash = this.hashCell(worldX, worldY, type);
        // Each quadrant needs only its two sides and diagonal: outer corner,
        // straight edge, inner corner, or solid. Never guess a nearby mask.
        const quadrants = [
            { x: 0, y: 0, a: 0, b: 6, diagonal: 7, outer: 6, edgeA: 14, edgeB: 7, cut: 1 },
            { x: 16, y: 0, a: 0, b: 2, diagonal: 1, outer: 12, edgeA: 14, edgeB: 13, cut: 2 },
            { x: 16, y: 16, a: 4, b: 2, diagonal: 3, outer: 9, edgeA: 11, edgeB: 13, cut: 4 },
            { x: 0, y: 16, a: 4, b: 6, diagonal: 5, outer: 3, edgeA: 11, edgeB: 7, cut: 8 },
        ];
        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        // Original diagonal cuts can extend past the half-cell. Keep a small
        // textured core and connected arms underneath them so opposing cuts
        // cannot erase a one-tile road or split a junction into four islands.
        const baseCell = base.cells[hash % base.cells.length];
        const baseX = baseCell % 16 * 32, baseY = Math.floor(baseCell / 16) * 32;
        const core: number[][] = [];
        // Add an arm only when neither adjacent quadrant provides a solid
        // connection. A blanket cross would flatten ordinary ragged borders.
        if (connections[0] && !(connections[6] && connections[7]) && !(connections[2] && connections[1])) core.push([12, 0, 8, 12]);
        if (connections[2] && !(connections[0] && connections[1]) && !(connections[4] && connections[3])) core.push([20, 12, 12, 8]);
        if (connections[4] && !(connections[2] && connections[3]) && !(connections[6] && connections[5])) core.push([12, 20, 8, 12]);
        if (connections[6] && !(connections[4] && connections[5]) && !(connections[0] && connections[7])) core.push([0, 12, 12, 8]);
        if (core.length || ![0, 2, 4, 6].some(i => connections[i])) core.push([12, 12, 8, 8]);
        for (const [x, y, width, height] of core) {
            ctx.drawImage(img, baseX + x, baseY + y, width, height,
                dx + x / 32 * size, dy + y / 32 * size, width / 32 * size, height / 32 * size);
        }
        for (const q of quadrants) {
            const a = connections[q.a], b = connections[q.b];
            let cells = base.cells;
            if (!a || !b) cells = config.cellsByMask[!a && !b ? q.outer : !a ? q.edgeA : q.edgeB] ?? cells;
            else if (!connections[q.diagonal]) {
                const candidates = config.cellsByMask[15] ?? [];
                const exact = candidates.filter(cell => this.getCellCornerCutMask(img, cell) === q.cut);
                const partial = candidates.filter(cell => (this.getCellCornerCutMask(img, cell) & q.cut) !== 0);
                cells = exact.length ? exact : partial.length ? partial : cells;
            }
            const cell = cells[hash % cells.length];
            ctx.drawImage(img, cell % 16 * 32 + q.x, Math.floor(cell / 16) * 32 + q.y, 16, 16,
                dx + q.x / 32 * size, dy + q.y / 32 * size, size / 2, size / 2);
        }
        ctx.imageSmoothingEnabled = smoothing;
    }

    /** Small shared frames made only from the original opaque water cells. */
    public drawAnimatedWater(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        worldX: number,
        worldY: number,
        frame: number
    ): void {
        const config = ORIGINAL_TILE_CONFIGS[type];
        const img = config && this.getSheet(`autotile:${config.sheet}`);
        if ((type !== TileType.WATER && type !== TileType.DEEP_WATER) || !config || !img) {
            this.drawTile(ctx, type, dx, dy, size, worldX, worldY);
            return;
        }
        const phase = ((frame % WATER_ANIMATION_FRAMES) + WATER_ANIMATION_FRAMES) % WATER_ANIMATION_FRAMES;
        const variant = this.hashCell(worldX, worldY, type) % config.cells.length;
        const key = `${type}:${variant}:${phase}`;
        let surface = this.waterFrameCache.get(key);
        if (!surface) {
            const pixels = ORIGINAL_AUTOTILE_CELL_SIZE;
            const source = new OffscreenCanvas(pixels, pixels);
            const sourceCtx = source.getContext('2d')!;
            this.drawOriginalCell(sourceCtx, img, config.cells[variant], 0, 0, pixels);
            const angle = phase / WATER_ANIMATION_FRAMES * Math.PI * 2;
            // Ease between the two original ripple patterns without flashing.
            sourceCtx.globalAlpha = (1 - Math.cos(angle)) / 2;
            this.drawOriginalCell(sourceCtx, img, config.cells[(variant + 1) % config.cells.length], 0, 0, pixels);

            surface = new OffscreenCanvas(pixels, pixels);
            const surfaceCtx = surface.getContext('2d')!;
            surfaceCtx.imageSmoothingEnabled = false;
            // A travelling one-pixel ripple; wrap within this water cell so
            // adjacent atlas cells (rocks/transparency) can never leak in.
            for (let row = 0; row < pixels; row += 4) {
                const rowAngle = row / pixels * Math.PI * 2;
                const shift = Math.round((Math.sin(angle + rowAngle) - Math.sin(rowAngle)) / 2);
                surfaceCtx.drawImage(source, 0, row, pixels, 4, shift, row, pixels, 4);
                if (shift > 0) surfaceCtx.drawImage(source, pixels - shift, row, shift, 4, 0, row, shift, 4);
                if (shift < 0) surfaceCtx.drawImage(source, 0, row, -shift, 4, pixels + shift, row, -shift, 4);
            }
            this.waterFrameCache.set(key, surface);
        }
        const previousSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(surface, dx, dy, size, size);
        ctx.imageSmoothingEnabled = previousSmoothing;
    }

    public drawWorldBSprite(
        _ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        _index: number,
        _dx: number,
        _dy: number,
        _size: number
    ): boolean {
        return false;
    }

    public getSheet(sheetName: string): HTMLImageElement | undefined {
        const img = this.images.get(sheetName);
        if (img?.complete && img.naturalWidth > 0) return img;
        return undefined;
    }

    public drawAtlasCell(
        _ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        _index: number,
        _dx: number,
        _dy: number,
        _size: number,
        _options?: { cropInset?: number }
    ): boolean {
        return false;
    }

    public drawLandmarkSprite(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        spriteId: LandmarkSpriteId,
        dx: number,
        dy: number,
        width: number,
        height: number
    ): boolean {
        const key = `landmark:${spriteId}`;
        const img = this.getSheet(key);
        if (!img) this.queueImageLoad(key, DARKSABER_LANDMARK_SPRITES[spriteId]);
        if (!img) return false;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, dx, dy, width, height);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    public drawTreeSprite(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        spriteId: TreeSpriteId,
        dx: number,
        dy: number,
        width: number,
        height: number,
        source?: { x: number; y: number; width: number; height: number }
    ): boolean {
        const key = `tree:${spriteId}`;
        const img = this.getSheet(key);
        if (!img) this.queueImageLoad(key, DARKSABER_TREE_SPRITES[spriteId]);
        if (!img) return false;

        const srcX = source ? source.x * img.naturalWidth : 0;
        const srcY = source ? source.y * img.naturalHeight : 0;
        const srcW = source ? source.width * img.naturalWidth : img.naturalWidth;
        const srcH = source ? source.height * img.naturalHeight : img.naturalHeight;
        const destX = source ? dx + width * source.x : dx;
        const destY = source ? dy + height * source.y : dy;
        const destW = source ? width * source.width : width;
        const destH = source ? height * source.height : height;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    public drawBridgeSprite(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        spriteId: BridgeSpriteId,
        dx: number,
        dy: number,
        width: number,
        height: number
    ): boolean {
        const key = `bridge:${spriteId}`;
        const img = this.getSheet(key);
        if (!img) this.queueImageLoad(key, DARKSABER_BRIDGE_SPRITES[spriteId]);
        if (!img) return false;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, dx, dy, width, height);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    public drawPropSprite(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        spriteId: PropSpriteId,
        dx: number,
        dy: number,
        width: number,
        height: number,
        source?: { x: number; y: number; width: number; height: number }
    ): boolean {
        const key = `prop:${spriteId}`;
        const img = this.getSheet(key);
        if (!img) this.queueImageLoad(key, DARKSABER_PROP_SPRITES[spriteId]);
        if (!img) return false;

        const srcX = source ? source.x * img.naturalWidth : 0;
        const srcY = source ? source.y * img.naturalHeight : 0;
        const srcW = source ? source.width * img.naturalWidth : img.naturalWidth;
        const srcH = source ? source.height * img.naturalHeight : img.naturalHeight;
        const destX = source ? dx + width * source.x : dx;
        const destY = source ? dy + height * source.y : dy;
        const destW = source ? width * source.width : width;
        const destH = source ? height * source.height : height;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    private drawTerrainTexture(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        worldX: number,
        worldY: number
    ): boolean {
        const texturePath = DARKSABER_TERRAIN_TEXTURES[type];
        if (!texturePath) return false;
        const img = this.getSheet(texturePath);
        if (!img) this.queueTilesetLoad(texturePath);
        if (!img) return false;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        if (type === TileType.SNOW) {
            // Sample one continuous 8x8-tile patch, instead of repeating the
            // entire painted image on every cell. Rasterize to native 32px dots.
            const column = ((worldX % 8) + 8) % 8;
            const row = ((worldY % 8) + 8) % 8;
            const key = `${column}:${row}`;
            let tile = this.snowTextureCache.get(key);
            if (!tile) {
                tile = new OffscreenCanvas(32, 32);
                const tileCtx = tile.getContext('2d')!;
                tileCtx.imageSmoothingEnabled = false;
                const sw = img.naturalWidth / 8, sh = img.naturalHeight / 8;
                tileCtx.drawImage(img, column * sw, row * sh, sw, sh, 0, 0, 32, 32);
                this.snowTextureCache.set(key, tile);
            }
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tile, dx, dy, size, size);
            ctx.imageSmoothingEnabled = prevSmoothing;
            return true;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, size, size);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    private drawOriginalTile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        worldX: number,
        worldY: number
    ): boolean {
        const config = ORIGINAL_TILE_CONFIGS[type];
        if (!config) return false;

        const img = this.getSheet(`autotile:${config.sheet}`);
        if (!img) return false;

        const cell = config.cells[this.hashCell(worldX, worldY, type) % config.cells.length];
        return this.drawOriginalCell(ctx, img, cell, dx, dy, size);
    }

    private drawOriginalAutotile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        neighbors: OriginalAutotileNeighbors,
        mask: number,
        worldX: number,
        worldY: number
    ): boolean {
        const config = ORIGINAL_AUTOTILE_CONFIGS[type];
        if (!config) return false;

        const img = this.getSheet(`autotile:${config.sheet}`);
        if (!img) return false;

        const cells = this.pickOriginalAutotileCells(config, img, mask, neighbors);
        if (!cells || cells.length === 0) return false;

        const cell = cells[this.hashCell(worldX, worldY, type) % cells.length];
        return this.drawOriginalCell(ctx, img, cell, dx, dy, size);
    }

    private drawOriginalCell(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        img: HTMLImageElement,
        cell: number,
        dx: number,
        dy: number,
        size: number
    ): boolean {
        const sx = (cell % ORIGINAL_AUTOTILE_COLS) * ORIGINAL_AUTOTILE_CELL_SIZE;
        const sy = Math.floor(cell / ORIGINAL_AUTOTILE_COLS) * ORIGINAL_AUTOTILE_CELL_SIZE;
        if (sx + ORIGINAL_AUTOTILE_CELL_SIZE > img.naturalWidth || sy + ORIGINAL_AUTOTILE_CELL_SIZE > img.naturalHeight) {
            return false;
        }

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            img,
            sx,
            sy,
            ORIGINAL_AUTOTILE_CELL_SIZE,
            ORIGINAL_AUTOTILE_CELL_SIZE,
            dx,
            dy,
            size,
            size
        );
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    private pickOriginalAutotileCells(
        config: OriginalAutotileConfig,
        img: HTMLImageElement,
        mask: number,
        neighbors: OriginalAutotileNeighbors
    ): readonly number[] | undefined {
        const exact = config.cellsByMask[mask];
        if (exact) return this.pickCornerCells(img, exact, neighbors) ?? exact;

        let best: readonly number[] | undefined;
        let bestDistance = Infinity;
        for (const [candidateMaskText, cells] of Object.entries(config.cellsByMask)) {
            const candidateMask = Number(candidateMaskText);
            const distance = this.bitCount(mask ^ candidateMask);
            if (distance < bestDistance) {
                best = cells;
                bestDistance = distance;
            }
        }
        const fallback = best ?? config.cellsByMask[15];
        return fallback ? this.pickCornerCells(img, fallback, neighbors) ?? fallback : undefined;
    }

    private pickCornerCells(
        img: HTMLImageElement,
        cells: readonly number[],
        neighbors: OriginalAutotileNeighbors
    ): readonly number[] | undefined {
        const wanted = this.getWantedInnerCornerMask(neighbors);
        const cacheKey = `${img.src}:${wanted}:${cells.join(',')}`;
        const cached = this.cornerCellsCache.get(cacheKey);
        if (cached) return cached;

        let picked: readonly number[] | undefined;
        if (wanted === 0) {
            const solidCells = cells.filter((cell) => this.getCellCornerCutMask(img, cell) === 0);
            picked = solidCells.length > 0 ? solidCells : undefined;
            if (picked) this.cornerCellsCache.set(cacheKey, picked);
            return picked;
        }

        const exact = cells.filter((cell) => this.getCellCornerCutMask(img, cell) === wanted);
        if (exact.length > 0) {
            this.cornerCellsCache.set(cacheKey, exact);
            return exact;
        }

        const partial = cells.filter((cell) => {
            const cellMask = this.getCellCornerCutMask(img, cell);
            return cellMask !== 0 && (cellMask & wanted) !== 0;
        });
        picked = partial.length > 0 ? partial : undefined;
        if (picked) this.cornerCellsCache.set(cacheKey, picked);
        return picked;
    }

    private getWantedInnerCornerMask(neighbors: OriginalAutotileNeighbors): number {
        let mask = 0;
        if (neighbors.n && neighbors.w && !neighbors.nw) mask |= 1;
        if (neighbors.n && neighbors.e && !neighbors.ne) mask |= 2;
        if (neighbors.s && neighbors.e && !neighbors.se) mask |= 4;
        if (neighbors.s && neighbors.w && !neighbors.sw) mask |= 8;
        return mask;
    }

    private getCellCornerCutMask(img: HTMLImageElement, cell: number): number {
        const cacheKey = `${img.src}:${cell}`;
        const cached = this.cellCornerCache.get(cacheKey);
        if (cached !== undefined) return cached;

        if (typeof document === 'undefined') return 0;

        const canvas = document.createElement('canvas');
        canvas.width = ORIGINAL_AUTOTILE_CELL_SIZE;
        canvas.height = ORIGINAL_AUTOTILE_CELL_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return 0;

        const sx = (cell % ORIGINAL_AUTOTILE_COLS) * ORIGINAL_AUTOTILE_CELL_SIZE;
        const sy = Math.floor(cell / ORIGINAL_AUTOTILE_COLS) * ORIGINAL_AUTOTILE_CELL_SIZE;
        ctx.drawImage(img, sx, sy, ORIGINAL_AUTOTILE_CELL_SIZE, ORIGINAL_AUTOTILE_CELL_SIZE, 0, 0, ORIGINAL_AUTOTILE_CELL_SIZE, ORIGINAL_AUTOTILE_CELL_SIZE);
        const data = ctx.getImageData(0, 0, ORIGINAL_AUTOTILE_CELL_SIZE, ORIGINAL_AUTOTILE_CELL_SIZE).data;

        const cornerSize = 10;
        const isCut = (startX: number, startY: number): boolean => {
            let empty = 0;
            for (let y = startY; y < startY + cornerSize; y++) {
                for (let x = startX; x < startX + cornerSize; x++) {
                    if (data[(y * ORIGINAL_AUTOTILE_CELL_SIZE + x) * 4 + 3] < 24) empty++;
                }
            }
            return empty >= 36;
        };

        let mask = 0;
        if (isCut(0, 0)) mask |= 1;
        if (isCut(ORIGINAL_AUTOTILE_CELL_SIZE - cornerSize, 0)) mask |= 2;
        if (isCut(ORIGINAL_AUTOTILE_CELL_SIZE - cornerSize, ORIGINAL_AUTOTILE_CELL_SIZE - cornerSize)) mask |= 4;
        if (isCut(0, ORIGINAL_AUTOTILE_CELL_SIZE - cornerSize)) mask |= 8;
        this.cellCornerCache.set(cacheKey, mask);
        return mask;
    }

    private hashCell(x: number, y: number, salt: number): number {
        let h = x * 374761393 + y * 668265263 + salt * 1442695041;
        h = (h ^ (h >> 13)) * 1274126177;
        return (h ^ (h >> 16)) & 0x7fffffff;
    }

    private bitCount(value: number): number {
        let count = 0;
        let v = value;
        while (v > 0) {
            count += v & 1;
            v >>= 1;
        }
        return count;
    }

    private drawFallback(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number
    ): boolean {
        const props = TILE_PROPERTIES[type];
        if (!props) return false;
        ctx.fillStyle = props.color;
        ctx.fillRect(dx, dy, size, size);
        return true;
    }
}

export const TileAssetManager = new TileAssetManagerClass();
