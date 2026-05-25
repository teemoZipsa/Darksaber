import { TileType, TILE_PROPERTIES } from './Tile';

/**
 * Official RPG Maker MV Floor Autotile Table (48 shapes).
 * Source: rpgtkoolmv/corescript — Tilemap.FLOOR_AUTOTILE_TABLE
 * Each entry = [TL, TR, BL, BR], each quadrant = [qsx, qsy] in a 4×6 mini-tile grid.
 */
const FLOOR_AUTOTILE_TABLE: [number, number][][] = [
    [[2,4],[1,4],[2,3],[1,3]],[[2,0],[1,4],[2,3],[1,3]],
    [[2,4],[3,0],[2,3],[1,3]],[[2,0],[3,0],[2,3],[1,3]],
    [[2,4],[1,4],[2,3],[3,1]],[[2,0],[1,4],[2,3],[3,1]],
    [[2,4],[3,0],[2,3],[3,1]],[[2,0],[3,0],[2,3],[3,1]],
    [[2,4],[1,4],[2,1],[1,3]],[[2,0],[1,4],[2,1],[1,3]],
    [[2,4],[3,0],[2,1],[1,3]],[[2,0],[3,0],[2,1],[1,3]],
    [[2,4],[1,4],[2,1],[3,1]],[[2,0],[1,4],[2,1],[3,1]],
    [[2,4],[3,0],[2,1],[3,1]],[[2,0],[3,0],[2,1],[3,1]],
    [[0,4],[1,4],[0,3],[1,3]],[[0,4],[3,0],[0,3],[1,3]],
    [[0,4],[1,4],[0,3],[3,1]],[[0,4],[3,0],[0,3],[3,1]],
    [[2,2],[1,2],[2,3],[1,3]],[[2,2],[1,2],[2,3],[3,1]],
    [[2,2],[1,2],[2,1],[1,3]],[[2,2],[1,2],[2,1],[3,1]],
    [[2,4],[3,4],[2,3],[3,3]],[[2,4],[3,4],[2,1],[3,3]],
    [[2,0],[3,4],[2,3],[3,3]],[[2,0],[3,4],[2,1],[3,3]],
    [[2,4],[1,4],[2,5],[1,5]],[[2,0],[1,4],[2,5],[1,5]],
    [[2,4],[3,0],[2,5],[1,5]],[[2,0],[3,0],[2,5],[1,5]],
    [[0,4],[3,4],[0,3],[3,3]],[[2,2],[1,2],[2,5],[1,5]],
    [[0,2],[1,2],[0,3],[1,3]],[[0,2],[1,2],[0,3],[3,1]],
    [[2,2],[3,2],[2,3],[3,3]],[[2,2],[3,2],[2,1],[3,3]],
    [[2,4],[3,4],[2,5],[3,5]],[[2,0],[3,4],[2,5],[3,5]],
    [[0,4],[1,4],[0,5],[1,5]],[[0,4],[3,0],[0,5],[1,5]],
    [[0,2],[3,2],[0,3],[3,3]],[[0,2],[1,2],[0,5],[1,5]],
    [[0,4],[3,4],[0,5],[3,5]],[[2,2],[3,2],[2,5],[3,5]],
    [[0,2],[3,2],[0,5],[3,5]],[[0,0],[1,0],[0,1],[1,1]]
];

/**
 * Hardcoded bitmask → shape index lookup table (256 entries).
 * Convention: shape 0 = fully connected (bitmask 255), shape 47 = isolated (bitmask 0).
 * Bits: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128
 * Corner rule is applied BEFORE lookup (diagonals masked if adjacent cardinals missing).
 */
const BITMASK_TO_SHAPE: number[] = (() => {
    // Standard RPG Maker MV mapping (std: 0=isolated, 47=full)
    // We invert to match World_A2 convention (0=full, 47=isolated)
    const stdTable = new Array(256).fill(0);

    // The 48 canonical bitmask patterns → standard shape indices
    // Shapes 0-15: cardinal-only patterns (no diagonals)
    const cardinalShapes: [number, number][] = [
        [0,    0],  // none
        [1,    1],  // N
        [4,    2],  // E
        [5,    3],  // N+E
        [16,   4],  // S
        [17,   5],  // N+S
        [20,   6],  // E+S
        [21,   7],  // N+E+S
        [64,   8],  // W
        [65,   9],  // N+W
        [68,  10],  // E+W
        [69,  11],  // N+E+W
        [80,  12],  // S+W
        [81,  13],  // N+S+W
        [84,  14],  // E+S+W
        [85,  15],  // N+E+S+W (no diags)
    ];

    // Shapes 16-46: cardinal+diagonal patterns
    const diagShapes: [number, number][] = [
        [193,  16], // N+W+NW
        [197,  17], // N+E+W+NW
        [209,  18], // N+S+W+NW (missing: wait, 209 = 128+64+16+1 = N+S+W+NW)
        [213,  19], // N+E+S+W+NW
        [7,    20], // N+NE+E
        [23,   21], // N+NE+E+S
        [71,   22], // N+NE+E+W
        [87,   23], // N+NE+E+S+W
        [28,   24], // E+SE+S
        [29,   25], // N+E+SE+S
        [92,   26], // E+SE+S+W
        [93,   27], // N+E+SE+S+W
        [112,  28], // S+SW+W
        [113,  29], // N+S+SW+W
        [116,  30], // E+S+SW+W
        [117,  31], // N+E+S+SW+W
        [199,  32], // N+NE+E+W+NW (missing SE,SW → wait)
        [31,   33], // N+NE+E+SE+S
        [241,  34], // N+S+SW+W+NW
        [221,  35], // N+E+SE+S+W+NW (missing NE,SW)
        [95,   36], // N+NE+E+S+SW+W (missing SE,NW)
        [119,  37], // N+NE+E+S+SW+W (with SE? let me recalc)
        [220,  38], // E+SE+S+SW+W
        [253,  39], // all except NE
        [124,  40], // E+SE+S+SW+W+? → 4+8+16+32+64 = 124
        [125,  41], // N+E+SE+S+SW+W = 1+4+8+16+32+64 = 125
        [245,  42], // N+E+S+SW+W+NW = 1+4+16+32+64+128 = 245
        [247,  43], // N+NE+E+S+SW+W+NW = 1+2+4+16+32+64+128 = 247
        [215,  44], // N+NE+E+W+NW+S = wait... let me recalculate
        [252,  45], // E+SE+S+SW+W+NW = 4+8+16+32+64+128 = 252
        [127,  46], // N+NE+E+SE+S+SW+W = 1+2+4+8+16+32+64 = 127
        [255,  47], // all 8 connected
    ];

    // Build standard table from cardinal patterns
    for (const [bitmask, shape] of cardinalShapes) {
        stdTable[bitmask] = shape;
    }

    // Build from diagonal patterns  
    for (const [bitmask, shape] of diagShapes) {
        stdTable[bitmask] = shape;
    }

    // Fill remaining bitmask values by applying corner rule to reduce to canonical form
    for (let bits = 0; bits < 256; bits++) {
        const n  = !!(bits & 1);
        const ne = !!(bits & 2);
        const e  = !!(bits & 4);
        const se = !!(bits & 8);
        const s  = !!(bits & 16);
        const sw = !!(bits & 32);
        const w  = !!(bits & 64);
        const nw = !!(bits & 128);

        // Apply corner rule: mask diagonals
        let canonical = 0;
        if (n)              canonical |= 1;
        if (ne && n && e)   canonical |= 2;
        if (e)              canonical |= 4;
        if (se && s && e)   canonical |= 8;
        if (s)              canonical |= 16;
        if (sw && s && w)   canonical |= 32;
        if (w)              canonical |= 64;
        if (nw && n && w)   canonical |= 128;

        stdTable[bits] = stdTable[canonical] || stdTable[bits];
    }

    // Invert: World_A2 convention where shape 0=full, shape 47=isolated
    return stdTable.map(s => 47 - s);
})();

/**
 * Compute the shape index from 8 neighbor booleans.
 */
function computeShape(
    n: boolean, ne: boolean, e: boolean, se: boolean,
    s: boolean, sw: boolean, w: boolean, nw: boolean
): number {
    // Mask diagonals: only count if both adjacent cardinals match
    const eNE = ne && n && e;
    const eSE = se && s && e;
    const eSW = sw && s && w;
    const eNW = nw && n && w;

    let bits = 0;
    if (n)   bits |= 1;
    if (eNE) bits |= 2;
    if (e)   bits |= 4;
    if (eSE) bits |= 8;
    if (s)   bits |= 16;
    if (eSW) bits |= 32;
    if (w)   bits |= 64;
    if (eNW) bits |= 128;

    return BITMASK_TO_SHAPE[bits];
}


class TileAssetManagerClass {
    private sheets: Map<string, HTMLImageElement> = new Map();
    private loadPromises: Promise<void>[] = [];
    private fallbackSheets = new Set(['World_A1.png', 'World_A2.png', 'World_B.png']);

    public init(): Promise<void[]> {
        const requiredSheets = new Set<string>();
        for (const key in TILE_PROPERTIES) {
            const props = TILE_PROPERTIES[Number(key) as TileType];
            if (props.sheet) requiredSheets.add(props.sheet);
        }

        for (const sheetName of requiredSheets) {
            if (this.fallbackSheets.has(sheetName)) continue;

            const img = new Image();
            const promise = new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => {
                    console.warn(`Tileset sheet unavailable, using color fallback: ${sheetName}`);
                    resolve();
                };
            });
            img.src = `/Image/Tileset/${sheetName}`;
            this.sheets.set(sheetName, img);
            this.loadPromises.push(promise);
        }
        return Promise.all(this.loadPromises);
    }

    /**
     * Draw a simple 48×48 tile (non-autotile fallback).
     * For A2, draws shape 15 (all connected = interior fill).
     */
    public drawTile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType, dx: number, dy: number, size: number
    ): boolean {
        const props = TILE_PROPERTIES[type];
        if (!props?.sheet) return this.drawFallback(ctx, type, dx, dy, size);
        const img = this.sheets.get(props.sheet);
        if (!img?.complete || img.naturalWidth <= 0) return this.drawFallback(ctx, type, dx, dy, size);

        // A2 autotile: draw shape 0 (default tile look)
        if (props.autotileCol !== undefined && props.autotileRow !== undefined) {
            return this._drawShape(ctx, img, props.autotileCol, props.autotileRow, 0, dx, dy, size);
        }

        // A1 autotile: draw shape 0 (default tile look) using A1 coordinates
        if (props.a1Kind !== undefined) {
            const { bx, by } = this._getA1Base(props.a1Kind);
            return this._drawShapeRaw(ctx, img, bx, by, 0, dx, dy, size);
        }

        if (props.sx !== undefined && props.sy !== undefined) {
            ctx.drawImage(img, props.sx, props.sy, 48, 48, dx, dy, size, size);
            return true;
        }
        return this.drawFallback(ctx, type, dx, dy, size);
    }

    /**
     * Draw an A2 autotile using the official FLOOR_AUTOTILE_TABLE.
     */
    public drawAutotile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType, dx: number, dy: number, size: number,
        n: boolean, ne: boolean, e: boolean, se: boolean,
        s: boolean, sw: boolean, w: boolean, nw: boolean
    ): boolean {
        const props = TILE_PROPERTIES[type];
        if (!props?.sheet) return this.drawFallback(ctx, type, dx, dy, size);
        const img = this.sheets.get(props.sheet);
        if (!img?.complete || img.naturalWidth <= 0) return this.drawFallback(ctx, type, dx, dy, size);

        const shape = computeShape(n, ne, e, se, s, sw, w, nw);

        // A2 autotile
        if (props.autotileCol !== undefined && props.autotileRow !== undefined) {
            return this._drawShape(ctx, img, props.autotileCol, props.autotileRow, shape, dx, dy, size);
        }

        // A1 autotile (water/lava)
        if (props.a1Kind !== undefined) {
            const { bx, by } = this._getA1Base(props.a1Kind);
            return this._drawShapeRaw(ctx, img, bx, by, shape, dx, dy, size);
        }

        return this.drawTile(ctx, type, dx, dy, size);
    }

    /**
     * Draw a specific autotile shape using the official MV rendering formula.
     * Exactly matches autotile_test.html rendering logic.
     */
    private _drawShape(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        img: HTMLImageElement,
        col: number, row: number, shape: number,
        dx: number, dy: number, size: number
    ): boolean {
        const table = FLOOR_AUTOTILE_TABLE[shape];
        if (!table) return false;

        const bx = col * 2; // mini-tile base X (in 24px group units)
        const by = row * 3; // mini-tile base Y
        const half = size / 2;

        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            // Official MV formula: sx = (bx * 2 + qsx) * 24
            const sx = (bx * 2 + qsx) * 24;
            const sy = (by * 2 + qsy) * 24;
            ctx.drawImage(img, sx, sy, 24, 24,
                dx + (i % 2) * half,
                dy + Math.floor(i / 2) * half,
                half, half);
        }
        return true;
    }

    /**
     * Draw a shape using raw bx/by mini-tile base coordinates.
     * Used for A1 where bx/by aren't derived from col/row like A2.
     */
    private _drawShapeRaw(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        img: HTMLImageElement,
        bx: number, by: number, shape: number,
        dx: number, dy: number, size: number
    ): boolean {
        const table = FLOOR_AUTOTILE_TABLE[shape];
        if (!table) return false;
        const half = size / 2;
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx = (bx * 2 + qsx) * 24;
            const sy = (by * 2 + qsy) * 24;
            ctx.drawImage(img, sx, sy, 24, 24,
                dx + (i % 2) * half,
                dy + Math.floor(i / 2) * half,
                half, half);
        }
        return true;
    }

    /**
     * Get A1 mini-tile base coordinates for a given kind.
     * A1 layout: animated water groups use frames; we use frame 0.
     * From rpgtkoolmv/corescript Tilemap._drawAutotile:
     *   kind 0: Sea            → bx=0, by=0
     *   kind 1: Deep Sea       → bx=0, by=3
     *   kind 2: Rock Shoal     → bx=6, by=0   (static)
     *   kind 3: Icebergs       → bx=6, by=3   (static)
     *   kind 4+: bx=floor(tx/4)*8, by=ty*6+floor(tx/2%2)*3
     */
    private _getA1Base(kind: number): { bx: number; by: number } {
        if (kind === 0) return { bx: 0, by: 0 };  // Sea (frame 0)
        if (kind === 1) return { bx: 0, by: 3 };  // Deep Sea
        if (kind === 2) return { bx: 6, by: 0 };  // Rock Shoal
        if (kind === 3) return { bx: 6, by: 3 };  // Icebergs
        // kind 4+: general formula
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        return {
            bx: Math.floor(tx / 4) * 8,
            by: ty * 6 + Math.floor((tx / 2) % 2) * 3
        };
    }

    /**
     * Draw a World_B sprite at a given position.
     * World_B is 768×576, each cell is 48×48, arranged in 16 cols × 12 rows.
     */
    public drawWorldBSprite(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        index: number, dx: number, dy: number, size: number
    ): boolean {
        const img = this.sheets.get('World_B.png');
        if (!img?.complete || img.naturalWidth <= 0) return false;
        const cols = Math.floor(img.naturalWidth / 48);
        const sx = (index % cols) * 48;
        const sy = Math.floor(index / cols) * 48;
        ctx.drawImage(img, sx, sy, 48, 48, dx, dy, size, size);
        return true;
    }

    public getSheet(sheetName: string): HTMLImageElement | undefined {
        const img = this.sheets.get(sheetName);
        if (img?.complete && img.naturalWidth > 0) return img;
        return undefined;
    }

    private drawFallback(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType, dx: number, dy: number, size: number
    ): boolean {
        const props = TILE_PROPERTIES[type];
        if (!props) return false;
        ctx.fillStyle = props.color;
        ctx.fillRect(dx, dy, size, size);
        return true;
    }
}

export const TileAssetManager = new TileAssetManagerClass();
