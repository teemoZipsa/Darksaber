import { TILE_PROPERTIES, TileType } from '../map/Tile';
import type { WorldMapLandmark } from '../map/WorldMap';
import { formatT, t } from '../i18n/LanguageManager';
import { drawParchmentPanel, Parchment, UI } from './UITheme';
import type { BountyHuntSnapshot } from '../net/WorldProtocol';

interface MinimapEntity {
    gridX: number;
    gridY: number;
    color: string;
    isBoss?: boolean;
    isBountyTarget?: boolean;
}

interface MinimapConfig {
    getTile: (gx: number, gy: number) => TileType;
    getPlayerPos: () => { x: number; y: number };
    getBounds: () => { width: number; height: number };
    getLandmarks: () => WorldMapLandmark[];
    getEnemies: () => MinimapEntity[];
    getExtractionZones: () => { x: number; y: number; radius: number }[];
    getLoot: () => { x: number; y: number; opened: boolean }[];
    getBountyHunt?: () => BountyHuntSnapshot | null;
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

const MAP_SIZE = 168;
const VIEW_RANGE = 26;
export const MINIMAP_LOOT_REVEAL_RANGE = 18;
const FRAME_PAD = 12;
const HEADER_H = 26;
const FULL_HEADER_H = 34;
const FULL_FOOTER_H = 36;
const FULL_MARGIN = 22;
const FULL_FRAME_PAD = 16;
const FULL_MIN_ZOOM = 1;
const FULL_MAX_ZOOM = 5;
const FULL_MIN_OPACITY = 0.25;
const FULL_MAX_OPACITY = 1;
const FULL_MAP_BUILD_BUDGET_MS = 6;
// Small per-frame budget used to pre-build the full map in the background while
// the mini map is showing, so opening the full map (M) feels instant.
const FULL_MAP_WARM_BUDGET_MS = 1.5;
const FULL_CLOSE_BUTTON_SIZE = 22;
const FULL_CLOSE_BUTTON_HIT_SIZE = 28;
const FOOTER_INFO_H = 50;            // base footer height (gold/world + coords)
const FOOTER_TERRAIN_LINE_H = 15;    // per terrain hover line
const PANEL_W = 216;
const FOOTER_MAX_ROWS = 5;
const MARGIN_TOP = 16;
const MARGIN_RIGHT = 16;

type MinimapMode = 'mini' | 'full' | 'hidden';

interface FullMapCache {
    key: string;
    canvas: OffscreenCanvas;
    ready: boolean;
    progress: number;
}

interface FullMapBuild {
    key: string;
    canvas: OffscreenCanvas;
    ctx: OffscreenCanvasRenderingContext2D;
    image: ImageData;
    cacheW: number;
    cacheH: number;
    tileW: number;
    tileH: number;
    sampleStep: number;
    nextRow: number;
    colorLookup: Partial<Record<TileType, [number, number, number]>>;
    fallback: [number, number, number];
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

export function isLootVisibleOnMinimap(
    player: { x: number; y: number },
    loot: { x: number; y: number; opened: boolean },
    range: number = MINIMAP_LOOT_REVEAL_RANGE
): boolean {
    return !loot.opened && Math.abs(player.x - loot.x) + Math.abs(player.y - loot.y) <= range;
}

export class MinimapUI {
    private mode: MinimapMode = 'mini';
    private panelX = 0;
    private panelY = 0;
    private currentWidth = 0;
    private currentHeight = 0;
    private fullMapCache: FullMapCache | null = null;
    private fullMapBuild: FullMapBuild | null = null;
    private fullMapZoom = 1;
    private fullMapPanX = 0;
    private fullMapPanY = 0;
    private fullMapOpacity = 1;
    private fullMapViewRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    private opacitySliderRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    private fullMapCloseButtonRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    private isDraggingFullMap = false;
    private isDraggingOpacity = false;
    private lastDragX = 0;
    private lastDragY = 0;

    constructor(private readonly config: MinimapConfig) {}

    private getVisibleLoot(): { x: number; y: number; opened: boolean }[] {
        const player = this.config.getPlayerPos();
        return this.config.getLoot().filter((loot) => isLootVisibleOnMinimap(player, loot));
    }

    public toggle(): void {
        this.cycleMode();
    }

    public cycleMode(): void {
        if (this.mode === 'mini') this.mode = 'full';
        else if (this.mode === 'full') this.mode = 'hidden';
        else this.mode = 'mini';
        this.stopFullMapDrag();
    }

    public closeFullMap(): void {
        if (this.mode !== 'full') return;
        this.mode = 'hidden';
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
        const closeHit = this.pointInRect(mx, my, this.fullMapCloseButtonRect);

        if (input.mouseJustUp || !input.mouseIsDown) {
            this.stopFullMapDrag();
        }

        if (input.mouseJustDown && closeHit) {
            this.closeFullMap();
            return true;
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

        // Pre-build the full map in the background so pressing M feels instant.
        // Self-terminating: once the cache is ready for this world it does nothing.
        this.getFullMapCache(this.config.getBounds(), footer?.worldName, FULL_MAP_WARM_BUDGET_MS);

        const footerMaxW = PANEL_W - 28;
        const terrainRows = footer ? this.buildMiniTerrainRows(ctx, footer.terrainLines, footerMaxW) : [];
        const footerH = FOOTER_INFO_H + (terrainRows.length > 0 ? 8 + terrainRows.length * FOOTER_TERRAIN_LINE_H : 0);
        const panelH = HEADER_H + 8 + MAP_SIZE + 10 + footerH + FRAME_PAD;

        this.panelX = vw - PANEL_W - MARGIN_RIGHT;
        this.panelY = MARGIN_TOP;
        this.currentWidth = PANEL_W;
        this.currentHeight = panelH;

        const mapX = this.panelX + Math.floor((PANEL_W - MAP_SIZE) / 2);
        const mapY = this.panelY + HEADER_H + 8;
        const tilePx = MAP_SIZE / (VIEW_RANGE * 2);
        const player = this.config.getPlayerPos();

        ctx.save();
        drawParchmentPanel(ctx, this.panelX, this.panelY, PANEL_W, panelH, {
            radius: 8,
            headerH: HEADER_H,
            darksaberFrame: true,
        });

        // Header label
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('minimap.title.mini'), this.panelX + 14, this.panelY + HEADER_H / 2);

        // Header right hint
        ctx.fillStyle = Parchment.textMid;
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.textAlign = 'right';
        ctx.fillText(t('minimap.cycle'), this.panelX + PANEL_W - 14, this.panelY + HEADER_H / 2);

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

        const bountyHunt = this.config.getBountyHunt?.() ?? null;
        if (bountyHunt?.searchArea) {
            this.drawRectMarker(
                ctx,
                mapX,
                mapY,
                tilePx,
                player,
                bountyHunt.searchArea.center.x,
                bountyHunt.searchArea.center.y,
                '#d7a94d',
                Math.max(3, bountyHunt.searchArea.radius * tilePx),
            );
        }
        if (bountyHunt?.nearbyClue) {
            this.drawDot(
                ctx,
                mapX,
                mapY,
                tilePx,
                player,
                bountyHunt.nearbyClue.tile.x,
                bountyHunt.nearbyClue.tile.y,
                '#f5d57b',
                4,
            );
        }

        for (const loot of this.getVisibleLoot()) {
            if (!loot.opened) this.drawDot(ctx, mapX, mapY, tilePx, player, loot.x, loot.y, '#ffe45c', 2.6);
        }

        for (const enemy of this.config.getEnemies()) {
            this.drawDot(
                ctx,
                mapX,
                mapY,
                tilePx,
                player,
                enemy.gridX,
                enemy.gridY,
                enemy.isBountyTarget ? '#f0c050' : enemy.isBoss ? '#ff2d75' : '#ff6248',
                enemy.isBountyTarget || enemy.isBoss ? 4 : 3,
            );
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
        const footerRight = this.panelX + PANEL_W - 14;
        let footerY = mapY + MAP_SIZE + 14;

        if (footer) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#7a5410';
            ctx.font = `bold 14px ${UI.fontPrimary}`;
            this.fillClampedText(ctx, `${footer.gold} G`, footerX, footerY, 70);

            ctx.fillStyle = Parchment.textMid;
            ctx.font = `13px ${UI.fontPrimary}`;
            ctx.textAlign = 'right';
            this.fillClampedText(ctx, footer.worldName, footerRight, footerY + 1, footerMaxW - 78);
            footerY += 19;

            ctx.textAlign = 'left';
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillText(formatT('minimap.coords', { x: player.x, y: player.y }), footerX, footerY);
            footerY += 17;

            if (terrainRows.length > 0) {
                ctx.strokeStyle = Parchment.borderDark;
                ctx.globalAlpha = 0.25;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(footerX, footerY + 2);
                ctx.lineTo(footerRight, footerY + 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
                footerY += 8;

                ctx.fillStyle = Parchment.textDark;
                ctx.font = `12px ${UI.fontPrimary}`;
                for (const line of terrainRows) {
                    this.fillClampedText(ctx, line, footerX, footerY, footerMaxW);
                    footerY += FOOTER_TERRAIN_LINE_H;
                }
            }
        }

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    private buildMiniTerrainRows(ctx: CanvasRenderingContext2D, lines: string[], maxW: number): string[] {
        if (lines.length === 0) return [];

        ctx.save();
        ctx.font = `12px ${UI.fontPrimary}`;
        const rows = lines.flatMap((line) => this.wrapMiniText(ctx, line, maxW));
        const visible = rows.length <= FOOTER_MAX_ROWS ? rows : rows.slice(0, FOOTER_MAX_ROWS);
        if (rows.length > FOOTER_MAX_ROWS) {
            visible[visible.length - 1] = this.withEllipsis(ctx, visible[visible.length - 1], maxW);
        }
        ctx.restore();
        return visible;
    }

    private wrapMiniText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
        if (ctx.measureText(text).width <= maxW) return [text];

        const words = text.split(' ');
        const rows: string[] = [];
        let current = '';
        for (const word of words) {
            const next = current ? `${current} ${word}` : word;
            if (ctx.measureText(next).width <= maxW) {
                current = next;
                continue;
            }
            if (current) rows.push(current);
            current = word;
        }
        if (current) rows.push(current);
        return rows.length > 0 ? rows : [text];
    }

    private fillClampedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number): void {
        ctx.fillText(this.withEllipsis(ctx, text, maxW), x, y);
    }

    private withEllipsis(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
        if (ctx.measureText(text).width <= maxW) return text;
        const ellipsis = '…';
        let clipped = text;
        while (clipped.length > 0 && ctx.measureText(`${clipped}${ellipsis}`).width > maxW) {
            clipped = clipped.slice(0, -1);
        }
        return clipped.length > 0 ? `${clipped}${ellipsis}` : ellipsis;
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
        ctx.fillText(t('minimap.title.full'), this.panelX + 18, this.panelY + FULL_HEADER_H / 2);

        ctx.fillStyle = Parchment.textMid;
        ctx.font = `12px ${UI.fontPrimary}`;
        ctx.textAlign = 'right';
        ctx.fillText(t('minimap.close'), this.panelX + panelW - 52, this.panelY + FULL_HEADER_H / 2);
        this.drawOpacitySlider(ctx, panelW);
        this.drawFullMapCloseButton(ctx, panelW);

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

    private drawFullMapCloseButton(ctx: CanvasRenderingContext2D, panelW: number): void {
        const size = FULL_CLOSE_BUTTON_SIZE;
        const hitSize = FULL_CLOSE_BUTTON_HIT_SIZE;
        const cx = this.panelX + panelW - 18;
        const cy = this.panelY + FULL_HEADER_H / 2;
        const x = cx - size / 2;
        const y = cy - size / 2;
        this.fullMapCloseButtonRect = {
            x: cx - hitSize / 2,
            y: cy - hitSize / 2,
            w: hitSize,
            h: hitSize,
        };

        ctx.save();
        ctx.fillStyle = 'rgba(58, 38, 24, 0.28)';
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, size, size);
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

        ctx.strokeStyle = '#2d1f12';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 5);
        ctx.lineTo(cx + 5, cy + 5);
        ctx.moveTo(cx + 5, cy - 5);
        ctx.lineTo(cx - 5, cy + 5);
        ctx.stroke();
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
        ctx.fillText(t('minimap.opacity'), sliderX - 8, sliderY + sliderH / 2);

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

            if (!cache.ready) {
                ctx.fillStyle = 'rgba(215, 182, 106, 0.82)';
                ctx.fillRect(viewRect.x, viewRect.y + viewRect.h - 3, viewRect.w * cache.progress, 3);
            }
        } else {
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `13px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t('minimap.loadFailed'), viewRect.x + viewRect.w / 2, viewRect.y + viewRect.h / 2);
        }

        ctx.restore();
    }

    private getFullMapCache(bounds: { width: number; height: number }, worldName?: string, budgetMs: number = FULL_MAP_BUILD_BUDGET_MS): FullMapCache | null {
        if (bounds.width <= 0 || bounds.height <= 0) return null;

        const key = `${worldName ?? 'world'}:${bounds.width}x${bounds.height}`;
        if (this.fullMapCache?.key === key && this.fullMapCache.ready) return this.fullMapCache;

        if (this.fullMapBuild?.key !== key) {
            this.fullMapBuild = this.createFullMapBuild(key, bounds);
        }
        const build = this.fullMapBuild;
        if (!build) return null;

        this.advanceFullMapBuild(build, budgetMs);

        const ready = build.nextRow >= build.cacheH;
        this.fullMapCache = {
            key,
            canvas: build.canvas,
            ready,
            progress: build.cacheH > 0 ? this.clamp(build.nextRow / build.cacheH, 0, 1) : 1,
        };
        if (ready) this.fullMapBuild = null;
        return this.fullMapCache;
    }

    private createFullMapBuild(key: string, bounds: { width: number; height: number }): FullMapBuild | null {
        const sampleStep = Math.max(2, Math.ceil(Math.max(bounds.width / 720, bounds.height / 900)));
        const cacheW = Math.ceil(bounds.width / sampleStep);
        const cacheH = Math.ceil(bounds.height / sampleStep);
        const canvas = new OffscreenCanvas(cacheW, cacheH);
        const cacheCtx = canvas.getContext('2d');
        if (!cacheCtx) return null;

        cacheCtx.fillStyle = '#1a140c';
        cacheCtx.fillRect(0, 0, cacheW, cacheH);

        return {
            key,
            canvas,
            ctx: cacheCtx,
            image: cacheCtx.createImageData(cacheW, cacheH),
            cacheW,
            cacheH,
            tileW: bounds.width,
            tileH: bounds.height,
            sampleStep,
            nextRow: 0,
            colorLookup: this.buildTileColorLookup(),
            fallback: [5, 5, 5],
        };
    }

    private advanceFullMapBuild(build: FullMapBuild, budgetMs: number = FULL_MAP_BUILD_BUDGET_MS): void {
        const start = this.now();
        const startRow = build.nextRow;

        while (build.nextRow < build.cacheH) {
            const py = build.nextRow;
            for (let px = 0; px < build.cacheW; px++) {
                const tx = Math.min(build.tileW - 1, px * build.sampleStep);
                const ty = Math.min(build.tileH - 1, py * build.sampleStep);
                const tile = this.config.getTile(tx, ty);
                const [r, g, b] = build.colorLookup[tile] ?? build.fallback;
                const offset = (py * build.cacheW + px) * 4;
                build.image.data[offset] = r;
                build.image.data[offset + 1] = g;
                build.image.data[offset + 2] = b;
                build.image.data[offset + 3] = 255;
            }

            build.nextRow++;
            if (build.nextRow > startRow && this.now() - start >= budgetMs) break;
        }

        const rows = build.nextRow - startRow;
        if (rows > 0) {
            build.ctx.putImageData(build.image, 0, 0, 0, startRow, build.cacheW, rows);
        }
    }

    private now(): number {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
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

        const bountyHunt = this.config.getBountyHunt?.() ?? null;
        if (bountyHunt?.searchArea) {
            const pos = toScreen(bountyHunt.searchArea.center.x, bountyHunt.searchArea.center.y);
            this.drawFullRing(
                ctx,
                pos.x,
                pos.y,
                Math.max(6, bountyHunt.searchArea.radius * scale),
                '#d7a94d',
            );
        }
        if (bountyHunt?.nearbyClue) {
            const pos = toScreen(bountyHunt.nearbyClue.tile.x, bountyHunt.nearbyClue.tile.y);
            this.drawFullDot(ctx, pos.x, pos.y, '#f5d57b', 4.2);
        }

        for (const loot of this.getVisibleLoot()) {
            if (!loot.opened) {
                const pos = toScreen(loot.x, loot.y);
                this.drawFullDot(ctx, pos.x, pos.y, '#ffe45c', 3.2);
            }
        }

        for (const enemy of this.config.getEnemies()) {
            const pos = toScreen(enemy.gridX, enemy.gridY);
            this.drawFullDot(
                ctx,
                pos.x,
                pos.y,
                enemy.isBountyTarget ? '#f0c050' : enemy.isBoss ? '#ff2d75' : '#ff6248',
                enemy.isBountyTarget || enemy.isBoss ? 5 : 3.4,
            );
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
        const lootCount = this.getVisibleLoot().filter((loot) => !loot.opened).length;
        const zoneCount = this.config.getExtractionZones().length;
        const footerX = this.panelX + 18;
        const footerY = this.panelY + panelH - FULL_FOOTER_H + 10;
        const leftText = footer
            ? formatT('minimap.footerWorldGoldCoords', {
                world: footer.worldName,
                gold: footer.gold,
                x: player.x,
                y: player.y,
            })
            : formatT('minimap.coords', { x: player.x, y: player.y });
        const rightText = formatT('minimap.footerCounts', {
            enemies: enemyCount,
            loot: lootCount,
            exits: zoneCount,
        });

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
