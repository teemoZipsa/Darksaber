import { TILE_PROPERTIES, TileType } from '../map/Tile';
import type { WorldMapLandmark } from '../map/WorldMap';
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
    getBounds: () => { width: number; height: number };
    getLandmarks: () => WorldMapLandmark[];
    getEnemies: () => MinimapEntity[];
    getExtractionZones: () => { x: number; y: number; radius: number }[];
    getLoot: () => { x: number; y: number; opened: boolean }[];
}

interface MinimapPointerInput {
    uiMouseX: number;
    uiMouseY: number;
    mouseJustDown: boolean;
    mouseJustUp: boolean;
    mouseIsDown: boolean;
    mouseWheelDelta: number;
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
const FULL_HEADER_H = 34;
const FULL_FOOTER_H = 36;
const FULL_MARGIN = 22;
const FULL_FRAME_PAD = 16;
const FULL_MIN_ZOOM = 1;
const FULL_MAX_ZOOM = 5;
const FULL_MIN_OPACITY = 0.25;
const FULL_MAX_OPACITY = 1;
const FOOTER_INFO_H = 56;            // base footer height (gold/world + coords)
const FOOTER_TERRAIN_LINE_H = 16;    // per terrain hover line
const PANEL_W = MAP_SIZE + FRAME_PAD * 2;
const MARGIN_TOP = 16;
const MARGIN_RIGHT = 16;

type MinimapMode = 'mini' | 'full' | 'hidden';

interface FullMapCache {
    key: string;
    canvas: OffscreenCanvas;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

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
    private mode: MinimapMode = 'mini';
    private panelX = 0;
    private panelY = 0;
    private currentWidth = 0;
    private currentHeight = 0;
    private fullMapCache: FullMapCache | null = null;
    private fullMapZoom = 1;
    private fullMapPanX = 0;
    private fullMapPanY = 0;
    private fullMapOpacity = 1;
    private fullMapViewRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    private opacitySliderRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    private isDraggingFullMap = false;
    private isDraggingOpacity = false;
    private lastDragX = 0;
    private lastDragY = 0;

    constructor(private readonly config: MinimapConfig) {}

    public toggle(): void {
        this.cycleMode();
    }

    public cycleMode(): void {
        if (this.mode === 'mini') this.mode = 'full';
        else if (this.mode === 'full') this.mode = 'hidden';
        else this.mode = 'mini';
        this.stopFullMapDrag();
    }

    public isVisible(): boolean {
        return this.mode !== 'hidden';
    }

    /** Click handler. Returns true if the click landed on the panel (so map clicks below it are suppressed). */
    public onClick(mx: number, my: number): boolean {
        if (!this.isVisible()) return false;
        return mx >= this.panelX
            && mx <= this.panelX + this.currentWidth
            && my >= this.panelY
            && my <= this.panelY + this.currentHeight;
    }

    public handleInput(input: MinimapPointerInput): boolean {
        if (this.mode !== 'full') return false;

        const mx = input.uiMouseX;
        const my = input.uiMouseY;
        const panelHit = this.pointInRect(mx, my, {
            x: this.panelX,
            y: this.panelY,
            w: this.currentWidth,
            h: this.currentHeight,
        });
        const mapHit = this.pointInRect(mx, my, this.fullMapViewRect);
        const sliderHit = this.pointInRect(mx, my, this.opacitySliderRect);

        if (input.mouseJustUp || !input.mouseIsDown) {
            this.stopFullMapDrag();
        }

        if (input.mouseJustDown && sliderHit) {
            this.isDraggingOpacity = true;
            this.setFullMapOpacityFromMouse(mx);
            return true;
        }

        if (this.isDraggingOpacity) {
            this.setFullMapOpacityFromMouse(mx);
            return true;
        }

        if (input.mouseWheelDelta !== 0) {
            if (mapHit) this.zoomFullMapAt(mx, my, input.mouseWheelDelta);
            return true;
        }

        if (input.mouseJustDown && mapHit) {
            this.isDraggingFullMap = true;
            this.lastDragX = mx;
            this.lastDragY = my;
            return true;
        }

        if (this.isDraggingFullMap && input.mouseIsDown) {
            const dx = mx - this.lastDragX;
            const dy = my - this.lastDragY;
            this.fullMapPanX += dx;
            this.fullMapPanY += dy;
            this.lastDragX = mx;
            this.lastDragY = my;
            this.clampFullMapPan(this.fullMapViewRect);
            return true;
        }

        return panelHit || input.mouseJustDown || input.mouseJustUp || input.mouseIsDown;
    }

    /**
     * Render the minimap with an integrated info footer (gold, world name,
     * coords, and terrain hover lines). Snaps to the top-right corner with
     * a natural margin.
     */
    public render(ctx: CanvasRenderingContext2D, vw: number, vh: number, footer?: MinimapFooter): void {
        if (this.mode === 'hidden') return;
        if (this.mode === 'full') {
            this.renderFullMap(ctx, vw, vh, footer);
            return;
        }

        this.renderMiniMap(ctx, vw, footer);
    }

    private renderMiniMap(ctx: CanvasRenderingContext2D, vw: number, footer?: MinimapFooter): void {

        const terrainLineCount = footer?.terrainLines.length ?? 0;
        const footerH = FOOTER_INFO_H + (terrainLineCount > 0 ? 6 + terrainLineCount * FOOTER_TERRAIN_LINE_H : 0);
        const panelH = HEADER_H + 6 + MAP_SIZE + 8 + footerH + FRAME_PAD;

        this.panelX = vw - PANEL_W - MARGIN_RIGHT;
        this.panelY = MARGIN_TOP;
        this.currentWidth = PANEL_W;
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
        ctx.fillText('M 순환', this.panelX + PANEL_W - 14, this.panelY + HEADER_H / 2);

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

    private renderFullMap(ctx: CanvasRenderingContext2D, vw: number, vh: number, footer?: MinimapFooter): void {
        const bounds = this.config.getBounds();
        const margin = vw < 520 || vh < 420 ? 10 : FULL_MARGIN;
        const availableW = Math.max(1, vw - margin * 2);
        const availableH = Math.max(1, vh - margin * 2);
        const mapAspect = bounds.width / bounds.height;
        const chromeH = FULL_HEADER_H + 12 + FULL_FOOTER_H + FULL_FRAME_PAD;
        const maxMapW = Math.max(1, availableW - FULL_FRAME_PAD * 2);
        const maxMapH = Math.max(1, availableH - chromeH);
        const mapH = Math.max(1, Math.floor(Math.min(maxMapH, maxMapW / mapAspect)));
        const mapW = Math.max(1, Math.floor(mapH * mapAspect));
        const panelW = mapW + FULL_FRAME_PAD * 2;
        const panelH = mapH + chromeH;

        this.panelX = Math.round((vw - panelW) / 2);
        this.panelY = Math.round((vh - panelH) / 2);
        this.currentWidth = panelW;
        this.currentHeight = panelH;

        ctx.save();
        ctx.globalAlpha = this.fullMapOpacity;

        drawParchmentPanel(ctx, this.panelX, this.panelY, panelW, panelH, {
            radius: 8,
            headerH: FULL_HEADER_H,
        });

        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 15px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('전체 지도', this.panelX + 18, this.panelY + FULL_HEADER_H / 2);

        ctx.fillStyle = Parchment.textMid;
        ctx.font = `12px ${UI.fontPrimary}`;
        ctx.textAlign = 'right';
        ctx.fillText('M 순환', this.panelX + panelW - 18, this.panelY + FULL_HEADER_H / 2);
        this.drawOpacitySlider(ctx, panelW);

        const contentX = this.panelX + FULL_FRAME_PAD;
        const contentY = this.panelY + FULL_HEADER_H + 12;
        const mapX = contentX;
        const mapY = contentY;
        const mapRect: Rect = { x: mapX, y: mapY, w: mapW, h: mapH };
        this.fullMapViewRect = mapRect;
        this.clampFullMapPan(mapRect);
        const displayRect = this.getFullMapDisplayRect(mapRect);

        ctx.fillStyle = '#1a140c';
        ctx.fillRect(mapX, mapY, mapW, mapH);

        const cache = this.getFullMapCache(bounds, footer?.worldName);
        this.drawFullMapImage(ctx, cache, mapRect, displayRect);

        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mapX - 0.5, mapY - 0.5, mapW + 1, mapH + 1);

        this.drawFullMapMarkers(ctx, mapRect, displayRect, bounds);
        this.drawFullMapFooter(ctx, panelW, panelH, footer);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    private drawOpacitySlider(ctx: CanvasRenderingContext2D, panelW: number): void {
        const sliderW = Math.min(180, Math.max(72, panelW * 0.22));
        const sliderX = this.panelX + panelW - sliderW - 86;
        const sliderY = this.panelY + 11;
        const sliderH = 8;
        const ratio = (this.fullMapOpacity - FULL_MIN_OPACITY) / (FULL_MAX_OPACITY - FULL_MIN_OPACITY);
        const thumbX = sliderX + sliderW * this.clamp(ratio, 0, 1);

        this.opacitySliderRect = { x: sliderX, y: sliderY - 5, w: sliderW, h: sliderH + 10 };

        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = Parchment.textMid;
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.fillText('불투명도', sliderX - 8, sliderY + sliderH / 2);

        ctx.fillStyle = 'rgba(43, 30, 14, 0.38)';
        ctx.fillRect(sliderX, sliderY, sliderW, sliderH);
        ctx.fillStyle = '#d7b66a';
        ctx.fillRect(sliderX, sliderY, thumbX - sliderX, sliderH);

        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1;
        ctx.strokeRect(sliderX - 0.5, sliderY - 0.5, sliderW + 1, sliderH + 1);

        ctx.fillStyle = '#fff1c2';
        ctx.strokeStyle = '#2b1e00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(thumbX, sliderY + sliderH / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    private drawFullMapImage(
        ctx: CanvasRenderingContext2D,
        cache: FullMapCache | null,
        viewRect: Rect,
        displayRect: Rect
    ): void {
        ctx.save();
        ctx.beginPath();
        ctx.rect(viewRect.x, viewRect.y, viewRect.w, viewRect.h);
        ctx.clip();

        ctx.fillStyle = '#1a140c';
        ctx.fillRect(viewRect.x, viewRect.y, viewRect.w, viewRect.h);

        if (cache) {
            const previousSmoothing = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(cache.canvas, displayRect.x, displayRect.y, displayRect.w, displayRect.h);
            ctx.imageSmoothingEnabled = previousSmoothing;
        } else {
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `13px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('지도 불러오기 실패', viewRect.x + viewRect.w / 2, viewRect.y + viewRect.h / 2);
        }

        ctx.restore();
    }

    private getFullMapCache(bounds: { width: number; height: number }, worldName?: string): FullMapCache | null {
        if (bounds.width <= 0 || bounds.height <= 0) return null;

        const key = `${worldName ?? 'world'}:${bounds.width}x${bounds.height}`;
        if (this.fullMapCache?.key === key) return this.fullMapCache;

        const sampleStep = Math.max(2, Math.ceil(Math.max(bounds.width / 720, bounds.height / 900)));
        const cacheW = Math.ceil(bounds.width / sampleStep);
        const cacheH = Math.ceil(bounds.height / sampleStep);
        const canvas = new OffscreenCanvas(cacheW, cacheH);
        const cacheCtx = canvas.getContext('2d');
        if (!cacheCtx) return null;

        const colorLookup = this.buildTileColorLookup();
        const fallback: [number, number, number] = [5, 5, 5];
        const image = cacheCtx.createImageData(cacheW, cacheH);

        for (let py = 0; py < cacheH; py++) {
            for (let px = 0; px < cacheW; px++) {
                const tx = Math.min(bounds.width - 1, px * sampleStep);
                const ty = Math.min(bounds.height - 1, py * sampleStep);
                const tile = this.config.getTile(tx, ty);
                const [r, g, b] = colorLookup[tile] ?? fallback;
                const offset = (py * cacheW + px) * 4;
                image.data[offset] = r;
                image.data[offset + 1] = g;
                image.data[offset + 2] = b;
                image.data[offset + 3] = 255;
            }
        }

        cacheCtx.putImageData(image, 0, 0);
        this.fullMapCache = { key, canvas };
        return this.fullMapCache;
    }

    private buildTileColorLookup(): Partial<Record<TileType, [number, number, number]>> {
        const lookup: Partial<Record<TileType, [number, number, number]>> = {};
        for (const tileValue of Object.values(TileType)) {
            if (typeof tileValue !== 'number') continue;
            const color = MINI_TILE_COLORS[tileValue] || TILE_PROPERTIES[tileValue]?.color || '#050505';
            lookup[tileValue] = this.parseHexColor(color);
        }
        return lookup;
    }

    private parseHexColor(color: string): [number, number, number] {
        const hex = color.startsWith('#') ? color.slice(1) : color;
        if (hex.length !== 6) return [5, 5, 5];
        return [
            Number.parseInt(hex.slice(0, 2), 16),
            Number.parseInt(hex.slice(2, 4), 16),
            Number.parseInt(hex.slice(4, 6), 16),
        ];
    }

    private drawFullMapMarkers(
        ctx: CanvasRenderingContext2D,
        viewRect: Rect,
        displayRect: Rect,
        bounds: { width: number; height: number }
    ): void {
        const toScreen = (gx: number, gy: number) => ({
            x: displayRect.x + (gx / Math.max(1, bounds.width - 1)) * displayRect.w,
            y: displayRect.y + (gy / Math.max(1, bounds.height - 1)) * displayRect.h,
        });
        const scale = Math.min(displayRect.w / bounds.width, displayRect.h / bounds.height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(viewRect.x, viewRect.y, viewRect.w, viewRect.h);
        ctx.clip();

        for (const landmark of this.config.getLandmarks()) {
            const pos = toScreen(landmark.x, landmark.y);
            const color = landmark.kind === 'town' ? '#e0b64a' : landmark.kind === 'temple' ? '#b86cff' : '#d78254';
            ctx.fillStyle = color;
            ctx.strokeStyle = '#201509';
            ctx.lineWidth = 1.5;
            ctx.fillRect(pos.x - 3.5, pos.y - 3.5, 7, 7);
            ctx.strokeRect(pos.x - 3.5, pos.y - 3.5, 7, 7);

            if (viewRect.w >= 360 && this.pointInRect(pos.x, pos.y, viewRect)) {
                ctx.font = `11px ${UI.fontPrimary}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
                ctx.strokeText(landmark.label, pos.x, pos.y + 6);
                ctx.fillStyle = '#fff1c2';
                ctx.fillText(landmark.label, pos.x, pos.y + 6);
            }
        }

        for (const zone of this.config.getExtractionZones()) {
            const pos = toScreen(zone.x, zone.y);
            this.drawFullRing(ctx, pos.x, pos.y, Math.max(4, zone.radius * scale), '#57ff86');
        }

        for (const loot of this.config.getLoot()) {
            if (!loot.opened) {
                const pos = toScreen(loot.x, loot.y);
                this.drawFullDot(ctx, pos.x, pos.y, '#ffe45c', 3.2);
            }
        }

        for (const enemy of this.config.getEnemies()) {
            const pos = toScreen(enemy.gridX, enemy.gridY);
            this.drawFullDot(ctx, pos.x, pos.y, enemy.isBoss ? '#ff2d75' : '#ff6248', enemy.isBoss ? 5 : 3.4);
        }

        const player = this.config.getPlayerPos();
        const playerPos = toScreen(player.x, player.y);
        this.drawFullPlayer(ctx, playerPos.x, playerPos.y);

        ctx.restore();
    }

    private drawFullMapFooter(
        ctx: CanvasRenderingContext2D,
        panelW: number,
        panelH: number,
        footer?: MinimapFooter
    ): void {
        const player = this.config.getPlayerPos();
        const enemyCount = this.config.getEnemies().length;
        const lootCount = this.config.getLoot().filter((loot) => !loot.opened).length;
        const zoneCount = this.config.getExtractionZones().length;
        const footerX = this.panelX + 18;
        const footerY = this.panelY + panelH - FULL_FOOTER_H + 10;
        const leftText = footer
            ? `${footer.worldName} · ${footer.gold} G · 좌표 ${player.x}, ${player.y}`
            : `좌표 ${player.x}, ${player.y}`;
        const rightText = `적 ${enemyCount} · 루트 ${lootCount} · 탈출구 ${zoneCount}`;

        ctx.fillStyle = Parchment.textMid;
        ctx.font = `12px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(leftText, footerX, footerY);

        const canFitRight = ctx.measureText(leftText).width + ctx.measureText(rightText).width < panelW - 48;
        if (canFitRight) {
            ctx.textAlign = 'right';
            ctx.fillText(rightText, this.panelX + panelW - 18, footerY);
        }
    }

    private drawFullDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number): void {
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(21, 12, 4, 0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    private drawFullRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    private drawFullPlayer(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        ctx.fillStyle = '#f8f06a';
        ctx.strokeStyle = '#2b1e00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x + 7, y + 6);
        ctx.lineTo(x, y + 2);
        ctx.lineTo(x - 7, y + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    private zoomFullMapAt(mx: number, my: number, wheelDelta: number): void {
        const viewRect = this.fullMapViewRect;
        if (viewRect.w <= 0 || viewRect.h <= 0) return;

        const oldDisplay = this.getFullMapDisplayRect(viewRect);
        const anchorX = this.clamp(mx, viewRect.x, viewRect.x + viewRect.w);
        const anchorY = this.clamp(my, viewRect.y, viewRect.y + viewRect.h);
        const anchorU = (anchorX - oldDisplay.x) / oldDisplay.w;
        const anchorV = (anchorY - oldDisplay.y) / oldDisplay.h;
        const nextZoom = this.clamp(
            this.fullMapZoom * Math.pow(1.16, -wheelDelta),
            FULL_MIN_ZOOM,
            FULL_MAX_ZOOM
        );

        this.fullMapZoom = nextZoom;
        const nextW = viewRect.w * nextZoom;
        const nextH = viewRect.h * nextZoom;
        const centeredX = viewRect.x + (viewRect.w - nextW) / 2;
        const centeredY = viewRect.y + (viewRect.h - nextH) / 2;
        this.fullMapPanX = anchorX - anchorU * nextW - centeredX;
        this.fullMapPanY = anchorY - anchorV * nextH - centeredY;
        this.clampFullMapPan(viewRect);
    }

    private getFullMapDisplayRect(viewRect: Rect): Rect {
        const w = viewRect.w * this.fullMapZoom;
        const h = viewRect.h * this.fullMapZoom;
        return {
            x: viewRect.x + (viewRect.w - w) / 2 + this.fullMapPanX,
            y: viewRect.y + (viewRect.h - h) / 2 + this.fullMapPanY,
            w,
            h,
        };
    }

    private clampFullMapPan(viewRect: Rect): void {
        if (viewRect.w <= 0 || viewRect.h <= 0 || this.fullMapZoom <= FULL_MIN_ZOOM) {
            this.fullMapZoom = FULL_MIN_ZOOM;
            this.fullMapPanX = 0;
            this.fullMapPanY = 0;
            return;
        }

        const maxPanX = (viewRect.w * (this.fullMapZoom - 1)) / 2;
        const maxPanY = (viewRect.h * (this.fullMapZoom - 1)) / 2;
        this.fullMapPanX = this.clamp(this.fullMapPanX, -maxPanX, maxPanX);
        this.fullMapPanY = this.clamp(this.fullMapPanY, -maxPanY, maxPanY);
    }

    private setFullMapOpacityFromMouse(mx: number): void {
        const ratio = this.opacitySliderRect.w > 0
            ? (mx - this.opacitySliderRect.x) / this.opacitySliderRect.w
            : 1;
        this.fullMapOpacity = this.clamp(
            FULL_MIN_OPACITY + this.clamp(ratio, 0, 1) * (FULL_MAX_OPACITY - FULL_MIN_OPACITY),
            FULL_MIN_OPACITY,
            FULL_MAX_OPACITY
        );
    }

    private stopFullMapDrag(): void {
        this.isDraggingFullMap = false;
        this.isDraggingOpacity = false;
    }

    private pointInRect(x: number, y: number, rect: Rect): boolean {
        return rect.w > 0
            && rect.h > 0
            && x >= rect.x
            && x <= rect.x + rect.w
            && y >= rect.y
            && y <= rect.y + rect.h;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
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
