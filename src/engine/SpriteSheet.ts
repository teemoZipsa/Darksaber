export class SpriteSheet {
    public image: HTMLImageElement;
    public frameWidth: number;
    public frameHeight: number;
    public cols: number;
    public rows: number;

    constructor(imageSrc: string, cols: number, rows: number) {
        this.image = new Image();
        this.image.src = imageSrc;
        this.cols = cols;
        this.rows = rows;
        this.frameWidth = 0;
        this.frameHeight = 0;

        this.image.onload = () => {
            this.frameWidth = this.image.naturalWidth / this.cols;
            this.frameHeight = this.image.naturalHeight / this.rows;
        };
    }

    public isLoaded(): boolean {
        return this.frameWidth > 0 && this.frameHeight > 0;
    }

    /**
     * Get the source rectangle for a specific direction array index and frame index
     */
    public getFrameRect(directionRow: number, frameCol: number): { x: number, y: number, w: number, h: number } {
        return {
            x: frameCol * this.frameWidth,
            y: directionRow * this.frameHeight,
            w: this.frameWidth,
            h: this.frameHeight
        };
    }
}
