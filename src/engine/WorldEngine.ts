/**
 * WorldEngine — Open world WASD movement engine.
 * Handles the field/town exploration mode with real-time movement.
 * Detects dungeon entrances and triggers battle transitions.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
import { Player } from '../entity/Player';
import { TILE_SIZE } from '../map/Chunk';
import { PartyManager } from '../character/PartyManager';
import { GridInventory } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { UI, renderGameTitle, Parchment, drawParchmentPanel } from '../ui/UITheme';
import type { GameManager } from './GameManager';

import { WorldMap } from '../map/WorldMap';
import { TileType, TILE_PROPERTIES } from '../map/Tile';

interface DungeonEntrance {
    x: number;
    y: number;
    stageId: string;
    label: string;
}

// ═══════════════════════════════════════════════════════════
//  WorldEngine Class
// ═══════════════════════════════════════════════════════════

export class WorldEngine {
    private player: Player;
    private gameManager: GameManager;
    private party: PartyManager;
    private playerData: PlayerData;

    // Map data
    private worldMap: WorldMap;

    // Interaction
    private nearbyEntrance: DungeonEntrance | null = null;

    constructor(
        _canvas: HTMLCanvasElement, _ctx: CanvasRenderingContext2D,
        _input: InputManager, _camera: Camera,
        party: PartyManager, _inventory: GridInventory,
        playerData: PlayerData, gameManager: GameManager
    ) {
        this.party = party;
        this.playerData = playerData;
        this.gameManager = gameManager;

        // Map
        this.worldMap = new WorldMap();

        // Player starts in town center
        this.player = new Player(43, 36);
        this.player.isRealtime = true; // Use smooth open-world movement
        this.player.color = '#00aaff';

        const activeChars = this.party.getCharacters();
        const leader = activeChars.length > 0 ? activeChars[0] : null;
        if (leader) {
            this.player.label = leader.name;
            if (leader.portraitImage && leader.portraitLoaded) {
                 this.player.image = leader.portraitImage;
                 this.player.imageLoaded = true;
            } else {
                 this.player.setImage(leader.portraitImage?.src || '/Image/Character/fighter.png');
            }
        }
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        // ── Realtime WASD/Arrow movement ──
        let dx = 0, dy = 0;
        if (input.isDown('KeyW') || input.isDown('ArrowUp')) dy = -1;
        if (input.isDown('KeyS') || input.isDown('ArrowDown')) dy = 1;
        if (input.isDown('KeyA') || input.isDown('ArrowLeft')) dx = -1;
        if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx = 1;

        if (dx !== 0 || dy !== 0) {
            // Normalize length for diagonal
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;

            // Update facing
            if (Math.abs(dx) > Math.abs(dy)) {
                this.player.facing = dx > 0 ? 'right' : 'left';
            } else {
                this.player.facing = dy > 0 ? 'down' : 'up';
            }

            const speed = 6; // tiles per second
            
            // X-axis collision check
            const nx = this.player.pixelX + dx * speed * dt;
            const nyOld = this.player.pixelY;
            if (this.isWalkable(Math.floor(nx + 0.2), Math.floor(nyOld + 0.2)) &&
                this.isWalkable(Math.floor(nx + 0.8), Math.floor(nyOld + 0.2)) &&
                this.isWalkable(Math.floor(nx + 0.2), Math.floor(nyOld + 0.8)) &&
                this.isWalkable(Math.floor(nx + 0.8), Math.floor(nyOld + 0.8))) {
                this.player.pixelX = nx;
            }

            // Y-axis collision check
            const nxNew = this.player.pixelX;
            const nyNew = this.player.pixelY + dy * speed * dt;
            if (this.isWalkable(Math.floor(nxNew + 0.2), Math.floor(nyNew + 0.2)) &&
                this.isWalkable(Math.floor(nxNew + 0.8), Math.floor(nyNew + 0.2)) &&
                this.isWalkable(Math.floor(nxNew + 0.2), Math.floor(nyNew + 0.8)) &&
                this.isWalkable(Math.floor(nxNew + 0.8), Math.floor(nyNew + 0.8))) {
                this.player.pixelY = nyNew;
            }

            // Sync grid fallback for triggers
            this.player.gridX = Math.floor(this.player.pixelX + 0.5);
            this.player.gridY = Math.floor(this.player.pixelY + 0.5);
        }

        // Update player animation
        this.player.update(dt);

        // Camera follow — use pixel position for smooth scrolling
        camera.followPixel(this.player.pixelX, this.player.pixelY);
        camera.update();

        // Check nearby dungeon entrance
        this.nearbyEntrance = null;
        for (const zone of this.worldMap.extractionZones) {
            if (this.player.gridX === zone.x && this.player.gridY === zone.y) {
                this.nearbyEntrance = {
                    x: zone.x,
                    y: zone.y,
                    stageId: zone.stageId,
                    label: zone.stageId === 'goblin_cave' ? '⚔ 고블린 동굴' : `⚔ ${zone.stageId}`
                };
                break;
            }
        }

        // Enter dungeon with Enter/Space
        if (this.nearbyEntrance && (input.justPressed('Enter') || input.justPressed('Space'))) {
            this.gameManager.enterBattle(this.nearbyEntrance.stageId);
        }
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();

        // Dark background
        ctx.fillStyle = '#0a0c1a';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

        // Update and Render Map via Chunk system
        const viewW = width / camera.zoom;
        const viewH = height / camera.zoom;
        this.worldMap.updateLoadedChunks(this.player.pixelX * TILE_SIZE, this.player.pixelY * TILE_SIZE);
        this.worldMap.render(ctx, camX, camY, viewW, viewH);

        // Render player
        const px = this.player.pixelX * TILE_SIZE - camX;
        const py = this.player.pixelY * TILE_SIZE - camY;
        if (this.player.image && this.player.imageLoaded) {
            ctx.drawImage(this.player.image, px, py, TILE_SIZE, TILE_SIZE);
        } else {
            ctx.fillStyle = this.player.color;
            ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        }

        // Player direction indicator
        ctx.fillStyle = '#ffff00';
        const indicatorSize = 4;
        const centerX = px + TILE_SIZE / 2;
        const centerY = py + TILE_SIZE / 2;
        switch (this.player.facing) {
            case 'up': ctx.fillRect(centerX - indicatorSize/2, py, indicatorSize, indicatorSize); break;
            case 'down': ctx.fillRect(centerX - indicatorSize/2, py + TILE_SIZE - indicatorSize, indicatorSize, indicatorSize); break;
            case 'left': ctx.fillRect(px, centerY - indicatorSize/2, indicatorSize, indicatorSize); break;
            case 'right': ctx.fillRect(px + TILE_SIZE - indicatorSize, centerY - indicatorSize/2, indicatorSize, indicatorSize); break;
        }

        ctx.restore();

        // ═══ HUD (scaled) ═══
        ctx.save();
        ctx.scale(scale, scale);
        const vw = Math.floor(width / scale);
        const vh = Math.floor(height / scale);

        // Title
        renderGameTitle(ctx, 16, 12, { scale: 0.7, subtitle: '' });

        // Player info
        const active = this.party.getActive();
        if (active) {
            drawParchmentPanel(ctx, 16, 56, 180, 50);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 11px ${UI.fontMono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${active.name} Lv.${active.level}`, 28, 68);
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `10px ${UI.fontMono}`;
            ctx.fillText(`HP: ${active.stats.hp}/${active.stats.maxHp}  MP: ${active.stats.mp}/${active.stats.maxMp}`, 28, 82);
        }

        // Gold display
        drawParchmentPanel(ctx, 16, 112, 120, 28);
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold 11px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`💰 ${this.playerData.gold} G`, 28, 120);

        // Position
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.fillText(`(${this.player.gridX}, ${this.player.gridY})`, 16, 148);

        // Dungeon entrance prompt
        if (this.nearbyEntrance) {
            const promptW = 280;
            const promptH = 50;
            const promptX = Math.floor((vw - promptW) / 2);
            const promptY = vh - 100;

            drawParchmentPanel(ctx, promptX, promptY, promptW, promptH);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 13px "DOSMyungjo", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(this.nearbyEntrance.label, promptX + promptW / 2, promptY + 10);
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `11px "DOSMyungjo", sans-serif`;
            ctx.fillText('Enter 키로 입장', promptX + promptW / 2, promptY + 30);
        }

        // Controls help
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText('WASD 이동 | Enter 상호작용', vw - 16, vh - 16);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    private isWalkable(x: number, y: number): boolean {
        const tileType = this.worldMap.getTileAt(x, y);
        if (tileType === TileType.WATER || tileType === TileType.DEEP_WATER) return false;
        const props = TILE_PROPERTIES[tileType];
        return props ? props.walkable : false;
    }
}
