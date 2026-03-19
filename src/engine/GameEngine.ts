export class GameEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isRunning: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = this.canvas.getContext('2d');
        if (!context) throw new Error("Could not get 2D context");
        this.ctx = context;
        
        // Setup scaling
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    public start(): void {
        this.isRunning = true;
        requestAnimationFrame(() => this.loop());
    }

    public stop(): void {
        this.isRunning = false;
    }

    private loop(): void {
        if (!this.isRunning) return;

        this.update();
        this.render();

        requestAnimationFrame(() => this.loop());
    }

    private update(): void {
        // Core game logic loop going here
    }

    private render(): void {
        // Clear screen with Darksaber style background color
        this.ctx.fillStyle = '#162447';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // TBD: Render Map Chunk
        // TBD: Render Grid over map
        // TBD: Render Entities
        
        this.ctx.fillStyle = '#e43f5a';
        this.ctx.font = '24px Arial';
        this.ctx.fillText("Rendering Active", 50, 50);
    }
}
