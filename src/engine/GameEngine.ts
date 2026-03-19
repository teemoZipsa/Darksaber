/**
 * GameEngine — the master orchestrator.
 * Manages the game loop with fixed timestep update + variable render.
 * Coordinates all subsystems: WorldMap, Camera, InputManager, Entities,
 * Inventory, Enemies, and Combat.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { WorldMap } from '../map/WorldMap';
import { GridRenderer } from '../map/GridRenderer';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { TILE_SIZE } from '../map/Chunk';
import { TILE_PROPERTIES } from '../map/Tile';
import { GridInventory } from '../inventory/GridInventory';
import { InventoryUI } from '../inventory/InventoryUI';
import { ITEMS } from '../data/ItemDB';
import { CombatFormulas } from '../combat/CombatFormulas';
import { createBaseStats } from '../data/Stats';
import { PartyManager } from '../character/PartyManager';
import { CharacterPanelUI } from '../character/CharacterPanelUI';
import { Character } from '../character/Character';

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

    // Phase 3: Inventory
    private inventory: GridInventory;
    private inventoryUI: InventoryUI;

    // Phase 3: Enemies
    private enemies: Enemy[] = [];
    private combatLog: string[] = [];

    // Party System
    private party: PartyManager;
    private charUI: CharacterPanelUI;

    // Player combat stats
    private playerStats = createBaseStats({ mov: 4 });

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

        // Inventory
        this.inventory = new GridInventory(10, 6);
        this.inventoryUI = new InventoryUI(this.inventory);

        // Give player some starter items
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'short_sword')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'leather_armor')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'hp_potion')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'hp_potion')!);
        this.inventory.autoPlace(ITEMS.find(i => i.id === 'mp_potion')!);

        // Party System
        this.party = new PartyManager();
        this.charUI = new CharacterPanelUI(this.party);
        
        // Add main character
        const mainChar = new Character('char_main', '다크마스터', 'infantry');
        this.party.addCharacter(mainChar);
        // Add a secondary character to show party UI works
        const subChar = new Character('char_sub', '셔먼걸', 'cultist');
        this.party.addCharacter(subChar);

        // Spawn player near world center
        this.player = new Player(0, 0);

        // Load initial chunks FIRST so terrain data exists for spawn search
        this.worldMap.updateLoadedChunks(0, 0);

        // Now find a walkable tile
        this.findWalkableSpawn();

        // Snap camera to player's actual spawn position
        this.camera.followTile(this.player.gridX, this.player.gridY);
        this.camera.snapToTarget();

        // Reload chunks centered on the actual spawn position
        const center = this.camera.getWorldCenter();
        this.worldMap.updateLoadedChunks(center.x, center.y);

        // Spawn some test enemies near the player
        this.spawnEnemiesAround(this.player.gridX, this.player.gridY, 5);

        // UI references
        this.posText = document.getElementById('player-pos');
        this.turnText = document.getElementById('turn-info');

        // Resize handler
        window.addEventListener('resize', () => this.resize());
    }

    private spawnEnemiesAround(cx: number, cy: number, count: number): void {
        const names = ['Slime', 'Goblin', 'Bat', 'Skeleton', 'Spider'];
        const colors = ['#66bb6a', '#ff7043', '#ab47bc', '#bdbdbd', '#8d6e63'];
        let spawned = 0;

        for (let r = 5; r < 30 && spawned < count; r++) {
            for (let dy = -r; dy <= r && spawned < count; dy++) {
                for (let dx = -r; dx <= r && spawned < count; dx++) {
                    if (Math.abs(dx) + Math.abs(dy) !== r) continue;
                    const tx = cx + dx;
                    const ty = cy + dy;
                    const tile = this.worldMap.getTileAt(tx, ty);
                    if (TILE_PROPERTIES[tile].walkable && Math.random() < 0.15) {
                        const idx = spawned % names.length;
                        const level = 1 + Math.floor(Math.random() * 3);
                        this.enemies.push(new Enemy(
                            `enemy_${spawned}`, tx, ty,
                            names[idx], level, colors[idx]
                        ));
                        spawned++;
                    }
                }
            }
        }
    }

    private findWalkableSpawn(): void {
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

        // Toggle inventory with Tab or I
        if (this.input.justPressed('Tab') || this.input.justPressed('KeyI')) {
            this.inventoryUI.toggle();
            if (this.inventoryUI.isVisible() && this.charUI.isVisible()) this.charUI.toggle(); // mutually exclusive
        }

        // Toggle character panel with C
        if (this.input.justPressed('KeyC')) {
            this.charUI.toggle();
            if (this.charUI.isVisible() && this.inventoryUI.isVisible()) this.inventoryUI.toggle();
        }

        // If inventory is open, route input to inventory UI
        if (this.inventoryUI.isVisible()) {
            this.inventoryUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
            if (this.input.mouseJustDown) {
                this.inventoryUI.onMouseDown(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            if (this.input.mouseJustUp) {
                this.inventoryUI.onMouseUp(this.input.mouseScreenX, this.input.mouseScreenY);
            }
            return; // don't process game input while inventory is open
        }

        // If character UI is open, route input
        if (this.charUI.isVisible()) {
            this.charUI.onMouseMove(this.input.mouseScreenX, this.input.mouseScreenY);
            if (this.input.mouseClicked) {
                if (this.charUI.onClick(this.input.mouseScreenX, this.input.mouseScreenY)) {
                    // Switched character! Could update avatar/stats here
                    const active = this.party.getActive();
                    if (active) this.addCombatLog(`Switched to ${active.name}`);
                }
            }
            return;
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

        // Attack with Space
        if (this.input.justPressed('Space')) {
            this.attackAdjacentEnemy();
        }

        if (moved) {
            // Update chunks around new position
            const worldX = this.player.gridX * TILE_SIZE + TILE_SIZE / 2;
            const worldY = this.player.gridY * TILE_SIZE + TILE_SIZE / 2;
            this.worldMap.updateLoadedChunks(worldX, worldY);

            // Enemy AI turn after player moves
            this.processEnemyTurns();
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

    private attackAdjacentEnemy(): void {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.isAdjacentTo(this.player.gridX, this.player.gridY)) {
                const defTile = this.worldMap.getTileAt(enemy.gridX, enemy.gridY);
                const result = CombatFormulas.calcPhysicalDamage(this.playerStats, enemy.stats, defTile);

                if (result.isMiss) {
                    this.addCombatLog(`Miss! Attack on ${enemy.label} missed.`);
                } else {
                    const dead = enemy.takeDamage(result.damage);
                    const critText = result.isCrit ? ' CRIT!' : '';
                    this.addCombatLog(`Hit ${enemy.label} for ${result.damage} dmg!${critText}`);

                    if (dead) {
                        this.addCombatLog(`${enemy.label} defeated! +${enemy.expReward} EXP`);
                        this.enemies.splice(i, 1);
                    }
                }
                return; // only attack one enemy per action
            }
        }
        this.addCombatLog('No enemy adjacent to attack.');
    }

    private processEnemyTurns(): void {
        for (const enemy of this.enemies) {
            if (enemy.checkAggro(this.player.gridX, this.player.gridY)) {
                if (enemy.isAdjacentTo(this.player.gridX, this.player.gridY)) {
                    // Attack player
                    const defTile = this.worldMap.getTileAt(this.player.gridX, this.player.gridY);
                    const result = CombatFormulas.calcPhysicalDamage(enemy.stats, this.playerStats, defTile);
                    if (!result.isMiss) {
                        this.playerStats.hp = Math.max(0, this.playerStats.hp - result.damage);
                        this.addCombatLog(`${enemy.label} hits you for ${result.damage}!`);
                    }
                } else {
                    // Move toward player
                    enemy.moveToward(this.player.gridX, this.player.gridY, (x, y) => this.worldMap.getTileAt(x, y));
                }
            }
        }
    }

    private addCombatLog(msg: string): void {
        this.combatLog.unshift(msg);
        if (this.combatLog.length > 5) this.combatLog.pop();
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
            this.player.gridX, this.player.gridY,
            this.player.moveRange,
            camX, camY,
            'rgba(255, 200, 0, 0.15)',
            'rgba(255, 200, 0, 0.5)'
        );

        // 3. Render hover highlight
        this.gridRenderer.renderHoverTile(this.ctx, this.hoverTileX, this.hoverTileY, camX, camY);

        // 4. Render enemies
        for (const enemy of this.enemies) {
            const eColor = enemy.isAggro ? '#ff1744' : enemy.color;
            this.gridRenderer.renderEntity(this.ctx, enemy.gridX, enemy.gridY, camX, camY, eColor, enemy.label);

            // HP bar above enemy
            const sx = enemy.gridX * TILE_SIZE - camX;
            const sy = enemy.gridY * TILE_SIZE - camY - 6;
            const barW = TILE_SIZE - 8;
            const hpRatio = enemy.stats.hp / enemy.stats.maxHp;
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillRect(sx + 4, sy, barW, 4);
            this.ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : hpRatio > 0.2 ? '#ff9800' : '#f44336';
            this.ctx.fillRect(sx + 4, sy, barW * hpRatio, 4);
        }

        // 5. Render player entity
        this.gridRenderer.renderEntity(
            this.ctx, this.player.gridX, this.player.gridY,
            camX, camY, this.player.color, this.player.label
        );

        // 6. Player HP/MP bars
        this.renderPlayerBars();

        // 7. Combat log
        this.renderCombatLog(width, height);

        // 8. FPS counter
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(width - 80, 10, 70, 25);
        this.ctx.fillStyle = '#00ff88';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`FPS: ${this.fps}`, width - 75, 27);

        // 9. Hover tile info
        const hoverTile = this.worldMap.getTileAt(this.hoverTileX, this.hoverTileY);
        const hoverProps = TILE_PROPERTIES[hoverTile];
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(width - 180, 40, 170, 25);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '11px monospace';
        this.ctx.fillText(`Tile: ${hoverProps.label} (${this.hoverTileX},${this.hoverTileY})`, width - 175, 57);

        // 10. UIs (Inventory, Character)
        this.inventoryUI.render(this.ctx, width, height);
        this.charUI.render(this.ctx, width, height);
    }

    private renderPlayerBars(): void {
        const { width } = this.canvas;
        const barX = width - 180;
        const barY = 75;
        const barW = 160;
        const barH = 12;

        // HP bar
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(barX, barY, barW, barH);
        const hpRatio = this.playerStats.hp / this.playerStats.maxHp;
        this.ctx.fillStyle = '#e53935';
        this.ctx.fillRect(barX, barY, barW * hpRatio, barH);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px monospace';
        this.ctx.fillText(`HP ${this.playerStats.hp}/${this.playerStats.maxHp}`, barX + 4, barY + 10);

        // MP bar
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(barX, barY + 16, barW, barH);
        const mpRatio = this.playerStats.mp / this.playerStats.maxMp;
        this.ctx.fillStyle = '#1e88e5';
        this.ctx.fillRect(barX, barY + 16, barW * mpRatio, barH);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(`MP ${this.playerStats.mp}/${this.playerStats.maxMp}`, barX + 4, barY + 26);
    }

    private renderCombatLog(canvasW: number, canvasH: number): void {
        if (this.combatLog.length === 0) return;
        const logX = 16;
        const logY = canvasH - 20;

        for (let i = 0; i < this.combatLog.length; i++) {
            const alpha = 1 - (i * 0.2);
            this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            this.ctx.font = '12px Inter, sans-serif';
            this.ctx.fillText(this.combatLog[i], logX, logY - i * 18);
        }
    }

    private updateUI(): void {
        if (this.posText) {
            this.posText.innerText = `Pos: (${this.player.gridX}, ${this.player.gridY})`;
        }
        if (this.turnText) {
            const tile = this.worldMap.getTileAt(this.player.gridX, this.player.gridY);
            const props = TILE_PROPERTIES[tile];
            this.turnText.innerText = `Terrain: ${props.label} | Enemies: ${this.enemies.length}`;
        }
    }
}
