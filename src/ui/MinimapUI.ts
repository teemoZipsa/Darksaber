import { TILE_PROPERTIES, TileType } from '../map/Tile';
import { drawParchmentPanel, Parchment, UI } from './UITheme';

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
    getExtractionZones: () => { x: number; y: number; radius: number }[];
    getLoot: () => { x: number; y: number; opened: boolean }[];
}

/** Per-frame info shown in the panel footer below the map. */
export interface MinimapFooter {
    gold: number;
    worldName: string;
    /** Terrain hover lines, empty array when not hovering a tile. */
    terrainLines: string[];
}

const MAP_SIZE = 152;
const VIEW_RANGE = 26;
const FRAME_PAD = 10;
const HEADER_H = 26;
const FOOTER_INFO_H = 56;            // base footer height (gold/world + coords)
const FOOTER_TERRAIN_LINE_H = 16;    // per terrain hover line
const PANEL_W = MAP_SIZE + FRAME_PAD * 2;
const MARGIN_TOP = 16;
const MARGIN_RIGHT = 16;

const MINI_TILE_COLORS: Record<TileType, string> = {
    [TileType.GRASS]: '#4f8e58',
    [TileType.STONE]: '#7c7780',
    [TileType.WATER]: '#2e85c7',
    [TileType.DEEP_WATER]: '#123a5a',
    [TileType.WALL]: '#1b1a1f',
    [TileType.LAVA]: '#d94a30',
    [TileType.SAND]: '#caa15f',
    [TileType.FOREST]: '#255f35',
    [TileType.ROAD]: '#9d8566',
    [TileType.SNOW]: '#d8e6ed',
    [TileType.POISON_SWAMP]: '#5b3c78',
    [TileType.TOWN]: '#cba64b',
    [TileType.DUNGEON_ENTRANCE]: '#8d4c7a',
};

export class MinimapUI {
    private visible = true;
    private panelX = 0;
    private panelY = 0;
    private currentHeight = 0;

    constructor(private readonly config: MinimapConfig) {}

    public toggle(): void {
        this.visible = !this.visible;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    /** Click handler. Returns true if the click landed on the panel (so map clicks below it are suppressed). */
    public onClick(mx: number, my: number): boolean {
        if (!this.visible) return false;
        return mx >= this.panelX
            && mx <= this.panelX + PANEL_W
            && my >= this.panelY
            && my <= this.panelY + this.currentHeight;
    }

    /**
     * Render the minimap with an integrated info footer (gold, world name,
     * coords, and terrain hover lines). Snaps to the top-right corner with
     * a natural margin.
     */
    public render(ctx: CanvasRenderingContext2D, vw: number, _vh: number, footer?: MinimapFooter): void {
        if (!this.visible) return;

        const terrainLineCount = footer?.terrainLines.length ?? 0;
        const footerH = FOOTER_INFO_H + (terrainLineCount > 0 ? 6 + terrainLineCount * FOOTER_TERRAIN_LINE_H : 0);
        const panelH = HEADER_H + 6 + MAP_SIZE + 8 + footerH + FRAME_PAD;

        this.panelX = vw - PANEL_W - MARGIN_RIGHT;
        this.panelY = MARGIN_TOP;
        this.currentHeight = panelH;

        const mapX = this.panelX + FRAME_PAD;
        const mapY = this.panelY + HEADER_H + 6;
        const tilePx = MAP_SIZE / (VIEW_RANGE * 2);
        const player = this.config.getPlayerPos();

        ctx.save();
        drawParchmentPanel(ctx, this.panelX, this.panelY, PANEL_W, panelH, {
            radius: 8,
            headerH: HEADER_H,
        });

        // Header label
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('미니맵', this.panelX + 14, this.panelY + HEADER_H / 2);

        // Header right hint
        ctx.fillStyle = Parchment.textMid;
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.textAlign = 'right';
        ctx.fillText('M 토글', this.panelX + PANEL_W - 14, this.panelY + HEADER_H / 2);

        // ─── Map area ───────────────────────────────────────────
        ctx.fillStyle = '#1a140c';
        ctx.fillRect(mapX, mapY, MAP_SIZE, MAP_SIZE);
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1;
        ctx.strokeRect(mapX, mapY, MAP_SIZE, MAP_SIZE);

        for (let dy = -VIEW_RANGE; dy < VIEW_RANGE; dy++) {
            for (let dx = -VIEW_RANGE; dx < VIEW_RANGE; dx++) {
                const tile = this.config.getTile(player.x + dx, player.y + dy);
                ctx.fillStyle = MINI_TILE_COLORS[tile] || TILE_PROPERTIES[tile]?.color || '#050505';
                ctx.fillRect(
                    mapX + (dx + VIEW_RANGE) * tilePx,
                    mapY + (dy + VIEW_RANGE) * tilePx,
                    tilePx + 0.4,
                    tilePx + 0.4
                );
            }
        }

        ctx.strokeStyle = 'rgba(232, 210, 150, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mapX - 0.5, mapY - 0.5, MAP_SIZE + 1, MAP_SIZE + 1);

        for (const zone of this.config.getExtractionZones()) {
            this.drawRectMarker(ctx, mapX, mapY, tilePx, player, zone.x, zone.y, '#57ff86', Math.max(2, zone.radius * tilePx));
        }

        for (const loot of this.config.getLoot()) {
            if (!loot.opened) this.drawDot(ctx, mapX, mapY, tilePx, player, loot.x, loot.y, '#ffe45c', 2.6);
        }

        for (const enemy of this.config.getEnemies()) {
            this.drawDot(ctx, mapX, mapY, tilePx, player, enemy.gridX, enemy.gridY, enemy.isBoss ? '#ff2d75' : '#ff6248', enemy.isBoss ? 4 : 3);
        }

        // Player marker
        const cx = mapX + MAP_SIZE / 2;
        const cy = mapY + MAP_SIZE / 2;
        ctx.fillStyle = '#f8f06a';
        ctx.strokeStyle = '#2b1e00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 6, cy + 5);
        ctx.lineTo(cx, cy + 2);
        ctx.lineTo(cx - 6, cy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ─── Info footer ────────────────────────────────────────
        const footerX = this.panelX + 14;
        let footerY = mapY + MAP_SIZE + 14;

        if (footer) {
            // Gold + world name on one row
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#7a5410';
            ctx.font = `bold 14px ${UI.fontPrimary}`;
            const goldText = `${footer.gold} G`;
            ctx.fillText(goldText, footerX, footerY);
            const goldW = ctx.measureText(goldText).width;

            ctx.fillStyle = Parchment.textMid;
            ctx.font = `13px ${UI.fontPrimary}`;
            ctx.fillText(`· ${footer.worldName}`, footerX + goldW + 6, footerY + 1);
            footerY += 20;

            // Coords
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillText(`좌표 ${player.x}, ${player.y}`, footerX, footerY);
            footerY += 18;

            // Terrain hover lines (only when hovering a tile)
            if (footer.terrainLines.length > 0) {
                // Divider
                ctx.strokeStyle = Parchment.borderDark;
                ctx.globalAlpha = 0.25;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(footerX, footerY + 2);
                ctx.lineTo(this.panelX + PANEL_W - 14, footerY + 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
                footerY += 8;

                ctx.fillStyle = Parchment.textDark;
                ctx.font = `12px ${UI.fontPrimary}`;
                for (const line of footer.terrainLines) {
                    ctx.fillText(line, footerX, footerY);
                    footerY += FOOTER_TERRAIN_LINE_H;
                }
            }
        }

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    private drawDot(
        ctx: CanvasRenderingContext2D,
        mapX: number,
        mapY: number,
        tilePx: number,
        player: { x: number; y: number },
        gx: number,
        gy: number,
        color: string,
        size: number
    ): void {
        const x = mapX + (gx - player.x + VIEW_RANGE) * tilePx;
        const y = mapY + (gy - player.y + VIEW_RANGE) * tilePx;
        if (x < mapX || x > mapX + MAP_SIZE || y < mapY || y > mapY + MAP_SIZE) return;
        ctx.fillStyle = color;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }

    private drawRectMarker(
        ctx: CanvasRenderingContext2D,
        mapX: number,
        mapY: number,
        tilePx: number,
        player: { x: number; y: number },
        gx: number,
        gy: number,
        color: string,
        radiusPx: number
    ): void {
        const x = mapX + (gx - player.x + VIEW_RANGE) * tilePx;
        const y = mapY + (gy - player.y + VIEW_RANGE) * tilePx;
        if (x + radiusPx < mapX || x - radiusPx > mapX + MAP_SIZE || y + radiusPx < mapY || y - radiusPx > mapY + MAP_SIZE) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);
    }
}
