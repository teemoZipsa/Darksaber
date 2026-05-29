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

const DARKSABER_LANDMARK_SPRITES = {
    village: '/assets/images/landmarks/darksaber/village.png',
    portTown: '/assets/images/landmarks/darksaber/port_town.png',
    castle: '/assets/images/landmarks/darksaber/castle.png',
    caveEntrance: '/assets/images/landmarks/darksaber/cave_entrance.png',
    beginnerRuins: '/assets/images/landmarks/darksaber/beginner_ruins.png',
    beginnerMine: '/assets/images/landmarks/darksaber/beginner_mine.png',
} as const;

export type LandmarkSpriteId = keyof typeof DARKSABER_LANDMARK_SPRITES;

class TileAssetManagerClass {
    private images: Map<string, HTMLImageElement> = new Map();
    private loadPromises: Promise<void>[] = [];

    public init(): Promise<void[]> {
        for (const texturePath of Object.values(DARKSABER_TERRAIN_TEXTURES)) {
            if (texturePath) this.queueTilesetLoad(texturePath);
        }
        for (const [key, src] of Object.entries(DARKSABER_LANDMARK_SPRITES)) {
            this.queueImageLoad(`landmark:${key}`, src);
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
        return this.drawTerrainTexture(ctx, type, dx, dy, size) || this.drawFallback(ctx, type, dx, dy, size);
    }

    public drawAutotile(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        type: TileType,
        dx: number,
        dy: number,
        size: number,
        _n: boolean = true,
        _ne: boolean = true,
        _e: boolean = true,
        _se: boolean = true,
        _s: boolean = true,
        _sw: boolean = true,
        _w: boolean = true,
        _nw: boolean = true,
        _worldX: number = 0,
        _worldY: number = 0
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
        const img = this.getSheet(`landmark:${spriteId}`);
        if (!img) return false;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, dx, dy, width, height);
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
        if (!img) return false;

        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, size, size);
        ctx.imageSmoothingEnabled = prevSmoothing;
        return true;
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
