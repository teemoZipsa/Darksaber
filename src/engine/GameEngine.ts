/**
 * GameEngine — the master orchestrator.
 * Manages the game loop with fixed timestep update + variable render.
 * Coordinates all subsystems: WorldMap, Camera, InputManager, Entities.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { WorldMap } from '../map/WorldMap';
import { GridRenderer } from '../map/GridRenderer';
import { Player } from '../entity/Player';
import { TILE_SIZE } from '../map/Chunk';
import { TILE_PROPERTIES } from '../map/Tile';

export class GameEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isRunning: boolean = false;

    // Subsystems
    private camera: Camera;
    private input: InputManager;
    private worldMap: WorldMap;
    private gridRenderer: GridRenderer;
    private player: Player;

    // UI elements
    private posText: HTMLElement | null;
    private turnText: HTMLElement | null;

    // Mouse hover
    private hoverTileX: number = 0;
    private hoverTileY: number = 0;

    // Performance
    private lastTime: number = 0;
    private fps: number = 0;
    private frameCount: number = 0;
    private fpsTimer: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = this.canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2D context');
        this.ctx = context;

        // Initialize subsystems
        this.resize();
        this.camera = new Camera(canvas.width, canvas.height);
        this.input = new InputManager(canvas);
        this.worldMap = new WorldMap();
        this.gridRenderer = new GridRenderer();

        // Spawn player near world center
        this.player = new Player(0, 0);

        // Load initial chunks FIRST so terrain data exists for spawn search
        this.worldMap.updateLoadedChunks(0, 0);

        // Now find a walkable tile (chunks are loaded, noise data is available)
        this.findWalkableSpawn();

        // Snap camera to player's actual spawn position
        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.snapToTarget();

        // Reload chunks centered on the actual spawn position
        const center = this.camera.getWorldCenter();
        this.worldMap.updateLoadedChunks(center.x, center.y);

        // UI references
        this.posText = document.getElementById('player-pos');
        this.turnText = document.getElementById('turn-info');

        // Resize handler
        window.addEventListener('resize', () => this.resize());
    }

    private findWalkableSpawn(): void {
        // Search outward in a spiral from (0,0) for a walkable tile
        for (let radius = 0; radius < 50; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const tile = this.worldMap.getTileAt(dx, dy);
                    if (TILE_PROPERTIES[tile].walkable) {
                        this.player.gridX = dx;
                        this.player.gridY = dy;
                        return;
                    }
                }
            }
        }
    }

    private resize(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.camera) {
            this.camera.setViewSize(this.canvas.width, this.canvas.height);
        }
    }

    public start(): void {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    public stop(): void {
        this.isRunning = false;
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;

        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.render();
        this.input.endFrame();

        requestAnimationFrame((t) => this.loop(t));
    }

    private update(dt: number): void {
        // FPS counter
        this.frameCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 1.0) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        // Player movement (grid-based, one tile per keypress)
        let moved = false;
        if (this.input.justPressed('ArrowUp') || this.input.justPressed('KeyW')) {
            moved = this.player.tryMove(this.player.gridX, this.player.gridY - 1, (x, y) => this.worldMap.getTileAt(x, y));
        } else if (this.input.justPressed('ArrowDown') || this.input.justPressed('KeyS')) {
            moved = this.player.tryMove(this.player.gridX, this.player.gridY + 1, (x, y) => this.worldMap.getTileAt(x, y));
        } else if (this.input.justPressed('ArrowLeft') || this.input.justPressed('KeyA')) {
            moved = this.player.tryMove(this.player.gridX - 1, this.player.gridY, (x, y) => this.worldMap.getTileAt(x, y));
        } else if (this.input.justPressed('ArrowRight') || this.input.justPressed('KeyD')) {
            moved = this.player.tryMove(this.player.gridX + 1, this.player.gridY, (x, y) => this.worldMap.getTileAt(x, y));
        }

        if (moved) {
            // Update chunks around new position
            const worldX = this.player.gridX * TILE_SIZE + TILE_SIZE / 2;
            const worldY = this.player.gridY * TILE_SIZE + TILE_SIZE / 2;
            this.worldMap.updateLoadedChunks(worldX, worldY);
        }

        // Camera follow
        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.update();

        // Hover tile
        const hover = this.camera.screenToTile(this.input.mouseScreenX, this.input.mouseScreenY);
        this.hoverTileX = hover.tileX;
        this.hoverTileY = hover.tileY;

        // Update UI
        this.updateUI();
    }

    private render(): void {
        const { width, height } = this.canvas;
        const camX = this.camera.x;
        const camY = this.camera.y;

        // Clear
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(0, 0, width, height);

        // 1. Render world map (chunks)
        this.worldMap.render(this.ctx, camX, camY, width, height);

        // 2. Render movement range indicator around player
        this.gridRenderer.renderRange(
            this.ctx,
            this.player.gridX,
            this.player.gridY,
            this.player.moveRange,
            camX, camY,
            'rgba(255, 200, 0, 0.15)',
            'rgba(255, 200, 0, 0.5)'
        );

        // 3. Render hover highlight
        this.gridRenderer.renderHoverTile(this.ctx, this.hoverTileX, this.hoverTileY, camX, camY);

        // 4. Render player entity
        this.gridRenderer.renderEntity(
            this.ctx,
            this.player.gridX,
            this.player.gridY,
            camX, camY,
            this.player.color,
            this.player.label
        );

        // 5. FPS counter
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(width - 80, 10, 70, 25);
        this.ctx.fillStyle = '#00ff88';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`FPS: ${this.fps}`, width - 75, 27);

        // 6. Hover tile info
        const hoverTile = this.worldMap.getTileAt(this.hoverTileX, this.hoverTileY);
        const hoverProps = TILE_PROPERTIES[hoverTile];
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(width - 180, 40, 170, 25);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '11px monospace';
        this.ctx.fillText(`Tile: ${hoverProps.label} (${this.hoverTileX},${this.hoverTileY})`, width - 175, 57);
    }

    private updateUI(): void {
        if (this.posText) {
            this.posText.innerText = `Pos: (${this.player.gridX}, ${this.player.gridY})`;
        }
        if (this.turnText) {
            const tile = this.worldMap.getTileAt(this.player.gridX, this.player.gridY);
            const props = TILE_PROPERTIES[tile];
            this.turnText.innerText = `Terrain: ${props.label}`;
        }
    }
}
