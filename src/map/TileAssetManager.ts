import { TileType, TILE_PROPERTIES } from './Tile';

class TileAssetManagerClass {
    private images: Map<TileType, HTMLImageElement> = new Map();
    private loadPromises: Promise<void>[] = [];

    public init(): Promise<void[]> {
        for (const key in TILE_PROPERTIES) {
            const type = Number(key) as TileType;
            const props = TILE_PROPERTIES[type];
            if (props.imgSrc) {
                const img = new Image();
                const promise = new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => {
                        console.error(`Failed to load tile image: ${props.imgSrc}`);
                        // resolve anyway to not break the game, it just won't draw
                        resolve();
                    };
                });
                img.src = props.imgSrc;
                this.images.set(type, img);
                this.loadPromises.push(promise);
            }
        }
        return Promise.all(this.loadPromises);
    }

    public getImage(type: TileType): HTMLImageElement | undefined {
        const img = this.images.get(type);
        if (img && img.complete && img.naturalWidth > 0) {
            return img;
        }
        return undefined;
    }
}

export const TileAssetManager = new TileAssetManagerClass();
