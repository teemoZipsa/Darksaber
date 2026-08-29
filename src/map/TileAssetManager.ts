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
const ORIGINAL_TILE_CONFIGS: Partial<Record<TileType, OriginalTileConfig>> = {
    [TileType.GRASS]: { sheet: 'mdsr0', cells: [302, 303, 304] },
    [TileType.WATER]: { sheet: 'mdsr0', cells: [131, 132, 145, 146] },
    [TileType.DEEP_WATER]: { sheet: 'mdsr15', cells: [102, 103] },
    [TileType.SNOW]: { sheet: 'mdsr0', cells: [448, 452] },
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
            3: [279, 314, 315, 316],
            6: [284, 285, 286],
            7: [274, 299, 300, 301],
            9: [281],
            11: [280, 317, 318, 319],
            12: [271, 290, 291, 292],
            13: [276, 305, 306, 307],
            14: [270, 287, 288, 289],
            15: [272, 273, 275, 277, 278, 282, 283, 293, 294, 295, 296, 297, 298, 302, 303, 304, 308, 309, 310, 311, 312, 313],
        },
    },
    [TileType.FOREST]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [10],
            6: [0],
            7: [5, 7],
            9: [12],
            11: [10],
            12: [2],
            13: [12],
            14: [1],
            15: [3, 4, 6, 8, 9],
        },
    },
    [TileType.SAND]: {
        sheet: 'mdsr0',
        cellsByMask: {
            3: [104, 105, 106],
            6: [74, 75, 76, 119],
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

    public init(): Promise<void[]> {
        // The compact original autotile sheets are the primary terrain source.
        // Large painted terrain textures are fallback-only and load on demand.
        for (const [key, sheetPath] of Object.entries(ORIGINAL_AUTOTILE_SHEETS)) {
            this.queueImageLoad(`autotile:${key}`, `/assets/images/tilesets/${sheetPath}`);
        }
        return Promise.all(this.loadPromises);
    }

    private queueTilesetLoad(sheetName: string): void {
        this.queueImageLoad(sheetName, `/assets/images/tilesets/${sheetName}`);
    }

    private queueImageLoad(key: string, src: string): void {
        if (this.images.has(key)) return;

        const img = new Image();
        const promise = new Promise<void>((resolve) => {
            img.onload = () => resolve();
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
        return this.drawTerrainTexture(ctx, type, dx, dy, size) || this.drawFallback(ctx, type, dx, dy, size);
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
        size: number
    ): boolean {
        const texturePath = DARKSABER_TERRAIN_TEXTURES[type];
        if (!texturePath) return false;
        const img = this.getSheet(texturePath);
        if (!img) this.queueTilesetLoad(texturePath);
        if (!img) return false;

        const prevSmoothing = ctx.imageSmoothingEnabled;
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
