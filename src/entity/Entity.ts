/**
 * Entity — base class for all game objects (players, monsters, NPCs).
 * Uses a simple static image (128x128) instead of sprite-sheet animation.
 */

export class Entity {
    public id: string;
    public gridX: number;
    public gridY: number;
    public pixelX: number; // For smooth rendering
    public pixelY: number;
    public color: string;
    public label: string;
    public actionGauge: number = 0; // ATB System: 0 to 100

    /** Optional static portrait image (128x128 single illustration) */
    public image?: HTMLImageElement;
    public imageLoaded: boolean = false;

    constructor(id: string, gridX: number, gridY: number, color: string, label: string = '') {
        this.id = id;
        this.gridX = gridX;
        this.gridY = gridY;
        this.pixelX = gridX; // initially snap to grid
        this.pixelY = gridY;
        this.color = color;
        this.label = label;
    }

    /** Load a single static image for this entity */
    public setImage(src: string): void {
        this.image = new Image();
        this.image.onload = () => { this.imageLoaded = true; };
        this.image.onerror = () => { this.imageLoaded = false; };
        this.image.src = src;
    }

    public update(dt: number): void {
        // Smooth interpolation towards gridX/gridY
        const speed = 10 * dt; // movement speed (tiles per second)
        const dx = this.gridX - this.pixelX;
        const dy = this.gridY - this.pixelY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.05) {
            this.pixelX += (dx / dist) * Math.min(speed, dist);
            this.pixelY += (dy / dist) * Math.min(speed, dist);
        } else {
            this.pixelX = this.gridX;
            this.pixelY = this.gridY;
        }
    }
}
