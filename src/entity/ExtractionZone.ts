/**
 * Extraction Zone - A designated area on the Raid Map where players can escape and secure their loot.
 */
export class ExtractionZone {
    public x: number;
    public y: number;
    public radius: number; // typically 1 or 2 tiles radius
    private pulseTimer: number = 0;

    constructor(x: number, y: number, radius = 1) {
        this.x = x;
        this.y = y;
        this.radius = radius;
    }

    public contains(gridX: number, gridY: number): boolean {
        const dx = Math.abs(gridX - this.x);
        const dy = Math.abs(gridY - this.y);
        return dx <= this.radius && dy <= this.radius;
    }

    public update(dt: number) {
        this.pulseTimer += dt;
        if (this.pulseTimer > 2) this.pulseTimer -= 2;
    }

    public render(ctx: CanvasRenderingContext2D, getScreenPos: (gx: number, gy: number) => {x: number, y: number}, tileSize: number): void {
        const minX = this.x - this.radius;
        const maxX = this.x + this.radius;
        const minY = this.y - this.radius;
        const maxY = this.y + this.radius;

        // Draw a highlighted zone
        for (let gy = minY; gy <= maxY; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                const pos = getScreenPos(gx, gy);
                if (pos.x < -tileSize || pos.x > window.innerWidth || pos.y < -tileSize || pos.y > window.innerHeight) continue;

                // Pulsing green extraction effect
                const alpha = 0.2 + (Math.sin(this.pulseTimer * Math.PI) + 1) * 0.15;
                ctx.fillStyle = `rgba(50, 255, 100, ${alpha})`;
                ctx.fillRect(pos.x, pos.y, tileSize, tileSize);
                
                ctx.strokeStyle = `rgba(100, 255, 150, ${alpha * 2})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(pos.x + 2, pos.y + 2, tileSize - 4, tileSize - 4);
            }
        }

        // Draw icon in center
        const center = getScreenPos(this.x, this.y);
        ctx.font = `${tileSize * 0.4}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.fillText('EXIT', center.x + tileSize/2, center.y + tileSize/2);
        ctx.textAlign = 'start';
    }
}
