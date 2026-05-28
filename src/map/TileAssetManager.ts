import { TileType, TILE_PROPERTIES } from './Tile';

const TILE_IMAGE_SRC: Partial<Record<TileType, string>> = {
    [TileType.GRASS]: '/Image/Tileset/grass.png',
    [TileType.FOREST]: '/Image/Tileset/forest.png',
    [TileType.SAND]: '/Image/Tileset/sand.png',
    [TileType.ROAD]: '/Image/Tileset/road.png',
    [TileType.TOWN]: '/Image/Tileset/road.png',
    [TileType.STONE]: '/Image/Tileset/stone.png',
    [TileType.SNOW]: '/Image/Tileset/snow.png',
    [TileType.POISON_SWAMP]: '/Image/Tileset/forest.png',
    [TileType.WATER]: '/Image/Tileset/water.png',
    [TileType.DEEP_WATER]: '/Image/Tileset/water.png',
    [TileType.LAVA]: '/Image/Tileset/lava.png',
    [TileType.WALL]: '/Image/Tileset/wall.png',
    [TileType.DUNGEON_ENTRANCE]: '/Image/Tileset/stone.png',
};

class TileAssetManagerClass {
    private images: Map<string, HTMLImageElement> = new Map();
    private loadPromises: Promise<void>[] = [];

    public init(): Promise<void[]> {
        for (const src of new Set(Object.values(TILE_IMAGE_SRC))) {
            if (src) this.queueImageLoad(src);
        }
        return Promise.all(this.loadPromises);
    }

    private queueImageLoad(src: string): void {
        if (this.images.has(src)) return;

        const img = new Image();
        const promise = new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => {
                console.warn(`Tileset image unavailable, using color fallback: ${src}`);
                resolve();
            };
        });
        img.src = src;
        this.images.set(src, img);
        this.loadPromises.push(promise);
    }

    public drawTile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number
    ): boolean {
        const src = TILE_IMAGE_SRC[type];
        const img = src ? this.getImage(src) : undefined;
        if (!img) return this.drawFallback(ctx, type, dx, dy, size);

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, dx, dy, size, size);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
    }

    public drawAutotile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        _n: boolean,
        _ne: boolean,
        _e: boolean,
        _se: boolean,
        _s: boolean,
        _sw: boolean,
        _w: boolean,
        _nw: boolean
    ): boolean {
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
        return this.getImage(sheetName.startsWith('/') ? sheetName : `/Image/Tileset/${sheetName}`);
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

    private getImage(src: string): HTMLImageElement | undefined {
        const img = this.images.get(src);
        if (img?.complete && img.naturalWidth > 0) return img;
        return undefined;
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
