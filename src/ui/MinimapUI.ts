import { TILE_PROPERTIES, TileType } from '../map/Tile';
import { drawDarkPanel, DarkParchment, UI } from './UITheme';

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

const MAP_SIZE = 148;
const VIEW_RANGE = 26;
const FRAME_PAD = 8;
const PANEL_W = MAP_SIZE + FRAME_PAD * 2;
const PANEL_H = MAP_SIZE + FRAME_PAD * 2 + 22;

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
    private closeX = 0;
    private closeY = 0;

    constructor(private readonly config: MinimapConfig) {}

    public toggle(): void {
        this.visible = !this.visible;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public onClick(mx: number, my: number): boolean {
        if (!this.visible) return false;

        if (Math.hypot(mx - this.closeX, my - this.closeY) <= 12) {
            this.visible = false;
            return true;
        }

        return mx >= this.panelX
            && mx <= this.panelX + PANEL_W
            && my >= this.panelY
            && my <= this.panelY + PANEL_H;
    }

    public render(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        if (!this.visible) return;

        this.panelX = Math.max(12, vw - PANEL_W - 16);
        this.panelY = Math.max(52, Math.min(vh - PANEL_H - 52, 62));
        this.closeX = this.panelX + PANEL_W - 18;
        this.closeY = this.panelY + 18;

        const player = this.config.getPlayerPos();
        const mapX = this.panelX + FRAME_PAD;
        const mapY = this.panelY + FRAME_PAD + 20;
        const tilePx = MAP_SIZE / (VIEW_RANGE * 2);

        ctx.save();
        drawDarkPanel(ctx, this.panelX, this.panelY, PANEL_W, PANEL_H, {
            bg: 'rgba(16, 19, 24, 0.9)',
            borderColor: 'rgba(216, 180, 92, 0.75)',
            radius: 8,
            headerH: 24,
        });

        ctx.fillStyle = DarkParchment.textLabel;
        ctx.font = `bold 11px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('미니맵', this.panelX + 12, this.panelY + 15);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(this.closeX, this.closeY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.24)';
        ctx.stroke();
        ctx.fillStyle = '#efe3c4';
        ctx.font = `bold 10px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText('X', this.closeX, this.closeY + 1);

        ctx.fillStyle = '#07090d';
        ctx.fillRect(mapX, mapY, MAP_SIZE, MAP_SIZE);

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

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`M 토글  ${player.x},${player.y}`, this.panelX + PANEL_W - 10, this.panelY + PANEL_H - 7);
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
