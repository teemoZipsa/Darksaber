/**
 * MinimapUI — Classic RPG-style minimap overlay.
 * Shows terrain tiles as colored pixels around the player,
 * with player position, enemy markers, and extraction zones.
 * Ornate gold/wood frame like reference image.
 */

import { TILE_PROPERTIES, TileType } from '../map/Tile';
import { UI } from './UITheme';

interface MinimapEntity {
    gridX: number;
    gridY: number;
    color: string;
    isBoss?: boolean;
}

interface MinimapConfig {
    getTile: (gx: number, gy: number) => TileType;
    getPlayerPos: () => { x: number; y: number };
    getEnemies: () => MinimapEntity[];
    getExtractionZones: () => { centerX: number; centerY: number; radius: number }[];
    getLoot: () => { gridX: number; gridY: number }[];
}

const MAP_SIZE = 140;     // minimap pixel dimensions
const VIEW_RANGE = 24;    // tiles visible in each direction from player
const FRAME_PAD = 6;
const TOTAL_SIZE = MAP_SIZE + FRAME_PAD * 2;

// Minimap-specific tile colors (slightly brighter/more vivid for tiny rendering)
const MINI_TILE_COLORS: Record<TileType, string> = {
    [TileType.GRASS]:  '#5a9a5a',
    [TileType.STONE]:  '#7a7a7a',
    [TileType.WATER]:  '#3498db',
    [TileType.WALL]:   '#1a1a1a',
    [TileType.LAVA]:   '#e74c3c',
    [TileType.SAND]:   '#e8c882',
    [TileType.FOREST]: '#2d6b2d',
    [TileType.ROAD]:   '#a08868',
    [TileType.SNOW]:   '#ffffff',
};

export class MinimapUI {
    private visible = false;
    private config: MinimapConfig;

    // Offscreen buffer for terrain (re-rendered each frame for scrolling)
    private buffer: OffscreenCanvas;
    private bufferCtx: OffscreenCanvasRenderingContext2D;

    // Close button hit zone
    private closeBtnX = 0;
    private closeBtnY = 0;
    private panelX = 0;
    private panelY = 0;

    constructor(config: MinimapConfig) {
        this.config = config;
        this.buffer = new OffscreenCanvas(MAP_SIZE, MAP_SIZE);
        const ctx = this.buffer.getContext('2d');
        if (!ctx) throw new Error('Minimap buffer context failed');
        this.bufferCtx = ctx;
    }

    public toggle(): void { this.visible = !this.visible; }
    public isVisible(): boolean { return this.visible; }
    public show(): void { this.visible = true; }
    public hide(): void { this.visible = false; }

    public onClick(mx: number, my: number): boolean {
        if (!this.visible) return false;
        // Close button
        const dx = mx - (this.closeBtnX + 8);
        const dy = my - (this.closeBtnY + 8);
        if (dx * dx + dy * dy <= 100) {
            this.toggle();
            return true;
        }
        // Consume click if inside minimap panel
        if (mx >= this.panelX && mx <= this.panelX + TOTAL_SIZE &&
            my >= this.panelY && my <= this.panelY + TOTAL_SIZE) {
            return true;
        }
        return false;
    }

    public render(ctx: CanvasRenderingContext2D, anchorRight: number, anchorTop: number): void {
        if (!this.visible) return;

        const player = this.config.getPlayerPos();
        const enemies = this.config.getEnemies();
        const extractions = this.config.getExtractionZones();
        const loot = this.config.getLoot();

        // Position: right-aligned below terrain label
        this.panelX = anchorRight - TOTAL_SIZE - 4;
        this.panelY = anchorTop;

        const px = this.panelX;
        const py = this.panelY;
        const mapX = px + FRAME_PAD;
        const mapY = py + FRAME_PAD;

        // ── Render terrain to buffer ──
        const tilePixel = MAP_SIZE / (VIEW_RANGE * 2);
        this.bufferCtx.fillStyle = '#0a0a0a';
        this.bufferCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

        for (let dy = -VIEW_RANGE; dy < VIEW_RANGE; dy++) {
            for (let dx = -VIEW_RANGE; dx < VIEW_RANGE; dx++) {
                const gx = player.x + dx;
                const gy = player.y + dy;
                const tile = this.config.getTile(gx, gy);
                this.bufferCtx.fillStyle = MINI_TILE_COLORS[tile] || TILE_PROPERTIES[tile]?.color || '#000';
                const bx = (dx + VIEW_RANGE) * tilePixel;
                const by = (dy + VIEW_RANGE) * tilePixel;
                this.bufferCtx.fillRect(bx, by, tilePixel + 0.5, tilePixel + 0.5);
            }
        }

        // ── Ornate frame background ──
        ctx.save();

        // Drop shadow
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;

        // Outer frame (dark wood)
        ctx.fillStyle = '#3a2210';
        ctx.fillRect(px - 2, py - 2, TOTAL_SIZE + 4, TOTAL_SIZE + 4);

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Gold inner frame
        ctx.fillStyle = '#8a6b30';
        ctx.fillRect(px, py, TOTAL_SIZE, TOTAL_SIZE);

        // Darker inset
        ctx.fillStyle = '#5a4020';
        ctx.fillRect(px + 2, py + 2, TOTAL_SIZE - 4, TOTAL_SIZE - 4);

        // Gold inner border
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth = 1;
        ctx.strokeRect(mapX - 1, mapY - 1, MAP_SIZE + 2, MAP_SIZE + 2);

        // ── Blit terrain buffer ──
        ctx.drawImage(this.buffer, mapX, mapY);

        // ── Draw extraction zones ──
        for (const zone of extractions) {
            const zx = mapX + ((zone.centerX - player.x + VIEW_RANGE) * tilePixel);
            const zy = mapY + ((zone.centerY - player.y + VIEW_RANGE) * tilePixel);
            const zr = zone.radius * tilePixel;
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(zx - zr, zy - zr, zr * 2, zr * 2);
        }

        // ── Draw loot markers ──
        for (const l of loot) {
            const lx = mapX + ((l.gridX - player.x + VIEW_RANGE) * tilePixel);
            const ly = mapY + ((l.gridY - player.y + VIEW_RANGE) * tilePixel);
            if (lx >= mapX && lx <= mapX + MAP_SIZE && ly >= mapY && ly <= mapY + MAP_SIZE) {
                ctx.fillStyle = '#ffea00';
                ctx.fillRect(lx, ly, Math.max(2, tilePixel), Math.max(2, tilePixel));
            }
        }

        // ── Draw enemies ──
        for (const e of enemies) {
            const ex = mapX + ((e.gridX - player.x + VIEW_RANGE) * tilePixel);
            const ey = mapY + ((e.gridY - player.y + VIEW_RANGE) * tilePixel);
            if (ex >= mapX && ex <= mapX + MAP_SIZE && ey >= mapY && ey <= mapY + MAP_SIZE) {
                ctx.fillStyle = e.isBoss ? '#ff4444' : '#ff6644';
                const dotSize = e.isBoss ? Math.max(4, tilePixel * 1.5) : Math.max(2, tilePixel);
                ctx.fillRect(ex, ey, dotSize, dotSize);
            }
        }

        // ── Draw player (center cross) ──
        const centerX = mapX + MAP_SIZE / 2;
        const centerY = mapY + MAP_SIZE / 2;
        
        // Blinking effect
        const blink = Math.sin(Date.now() * 0.006) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255, 255, 100, ${blink})`;
        ctx.fillRect(centerX - 2, centerY - 2, 5, 5);
        ctx.strokeStyle = `rgba(255, 200, 50, ${blink * 0.6})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(centerX - 3, centerY - 3, 7, 7);

        // ── View frustum (camera viewport rect) ──
        // Small rectangle showing visible area
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 0.5;
        const frustumW = 16 * tilePixel; // approx visible tiles
        const frustumH = 12 * tilePixel;
        ctx.strokeRect(centerX - frustumW / 2, centerY - frustumH / 2, frustumW, frustumH);

        // ── Corner ornaments ──
        const cs = 8;
        ctx.fillStyle = '#c8a84e';
        ctx.fillRect(px, py, cs, 2); ctx.fillRect(px, py, 2, cs);
        ctx.fillRect(px + TOTAL_SIZE - cs, py, cs, 2); ctx.fillRect(px + TOTAL_SIZE - 2, py, 2, cs);
        ctx.fillRect(px, py + TOTAL_SIZE - 2, cs, 2); ctx.fillRect(px, py + TOTAL_SIZE - cs, 2, cs);
        ctx.fillRect(px + TOTAL_SIZE - cs, py + TOTAL_SIZE - 2, cs, 2); ctx.fillRect(px + TOTAL_SIZE - 2, py + TOTAL_SIZE - cs, 2, cs);

        // ── Close button (red circle top-right) ──
        this.closeBtnX = px + TOTAL_SIZE - 14;
        this.closeBtnY = py - 4;
        ctx.beginPath();
        ctx.arc(this.closeBtnX + 8, this.closeBtnY + 8, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#a03030';
        ctx.fill();
        ctx.strokeStyle = '#2a0808';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold 10px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', this.closeBtnX + 8, this.closeBtnY + 8);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'start';


        ctx.restore();
    }
}
