import { formatT, t } from '../i18n/LanguageManager';
import { getStoryInteriorTileAt, type StoryInteriorLayout, type StoryInteriorProp } from '../data/StoryInteriorData';
import { TILE_SIZE } from './Chunk';
import { TILE_PROPERTIES, TileType } from './Tile';
import { WorldMap, type TileBounds, type TilePoint, type WorldMapDecoration, type WorldMapLandmark, type WorldDungeonInfo } from './WorldMap';
import type { TempleInfo, TownInfo } from './BiomeMask';

const THEME_COLORS = {
    castle: {
        void: '#070607',
        wall: '#171419',
        wallInset: '#2a242b',
        floor: '#343036',
        floorAlt: '#2b272d',
        path: '#554537',
        accent: '#b78245',
        gate: '#5b2f33',
    },
    volcano: {
        void: '#080504',
        wall: '#1d1110',
        wallInset: '#3a2018',
        floor: '#5c3d2b',
        floorAlt: '#493122',
        path: '#6b4b30',
        accent: '#e16f3b',
        gate: '#5b2822',
    },
    temple: {
        void: '#070707',
        wall: '#171713',
        wallInset: '#2f2e24',
        floor: '#3c3a2f',
        floorAlt: '#313027',
        path: '#5a523d',
        accent: '#b7a05a',
        gate: '#4b3f29',
    },
    pyramid: {
        void: '#090704',
        wall: '#1f190f',
        wallInset: '#3c2f1b',
        floor: '#5f4b2d',
        floorAlt: '#4f3f27',
        path: '#76603a',
        accent: '#c7a45c',
        gate: '#5d4122',
    },
    ament: {
        void: '#050609',
        wall: '#111420',
        wallInset: '#23283a',
        floor: '#2b2f42',
        floorAlt: '#242838',
        path: '#424965',
        accent: '#9e8acb',
        gate: '#30284b',
    },
} as const;

export interface StoryInteriorInspectMarker {
    id: string;
    tile: TilePoint;
    labelKey?: string;
    kind?: 'person' | 'chest';
}

export class StoryInteriorMap extends WorldMap {
    private readonly layout: StoryInteriorLayout;
    private readonly lockedTileKeys: Set<string>;
    private inspectMarkers: StoryInteriorInspectMarker[] = [];

    constructor(layout: StoryInteriorLayout, options: { lockedTiles?: readonly TilePoint[] } = {}) {
        super('mortal', { validateTownSpawns: false });
        this.layout = layout;
        this.lockedTileKeys = new Set((options.lockedTiles ?? []).map((tile) => this.tileKey(tile.x, tile.y)));
    }

    public getDisplayName(): string {
        return formatT(this.layout.displayNameKey, {});
    }

    public getLayout(): StoryInteriorLayout {
        return this.layout;
    }

    public getPlayerStartTile(): TilePoint {
        return { ...this.layout.playerStart };
    }

    public updateLoadedChunks(_worldCenterX: number, _worldCenterY: number): void {
        // Fixed story interior room; no chunk streaming needed.
    }

    public getBoundsTiles(): TileBounds {
        return { width: this.layout.width, height: this.layout.height };
    }

    public getMapLandmarks(): WorldMapLandmark[] {
        return [];
    }

    public getTowns(): TownInfo[] {
        return [];
    }

    public getTemples(): TempleInfo[] {
        return [];
    }

    public getDungeons(): WorldDungeonInfo[] {
        return [];
    }

    public getTownAtTile(_tx: number, _ty: number): TownInfo | null {
        return null;
    }

    public getTempleAtTile(_tx: number, _ty: number): TempleInfo | null {
        return null;
    }

    public getDungeonAtTile(_tx: number, _ty: number): WorldDungeonInfo | null {
        return null;
    }

    public getDecorationsInTileRect(_minX: number, _minY: number, _maxX: number, _maxY: number): readonly WorldMapDecoration[] {
        return [];
    }

    public isDecorationBlocked(_tx: number, _ty: number): boolean {
        return false;
    }

    public renderDecorationOverlays(
        _ctx: CanvasRenderingContext2D,
        _cameraX: number,
        _cameraY: number,
        _vw: number,
        _vh: number
    ): void {
        // Fixed story interior room; world decorations are disabled.
    }

    public getTileAt(tx: number, ty: number): TileType {
        if (this.lockedTileKeys.has(this.tileKey(tx, ty))) return TileType.WALL;
        return getStoryInteriorTileAt(this.layout, tx, ty);
    }

    public isWalkable(tx: number, ty: number): boolean {
        return Boolean(TILE_PROPERTIES[this.getTileAt(tx, ty)]?.walkable);
    }

    public setLockedTiles(tiles: readonly TilePoint[]): void {
        this.lockedTileKeys.clear();
        for (const tile of tiles) this.lockedTileKeys.add(this.tileKey(tile.x, tile.y));
    }

    public isTileLocked(tx: number, ty: number): boolean {
        return this.lockedTileKeys.has(this.tileKey(tx, ty));
    }

    public setInspectMarkers(markers: readonly StoryInteriorInspectMarker[]): void {
        this.inspectMarkers = markers.map((marker) => ({
            ...marker,
            tile: { ...marker.tile },
        }));
    }

    public getInspectMarkers(): StoryInteriorInspectMarker[] {
        return this.inspectMarkers.map((marker) => ({
            ...marker,
            tile: { ...marker.tile },
        }));
    }

    public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, vw: number, vh: number): void {
        const minX = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
        const minY = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
        const maxX = Math.min(this.layout.width - 1, Math.ceil((cameraX + vw) / TILE_SIZE) + 1);
        const maxY = Math.min(this.layout.height - 1, Math.ceil((cameraY + vh) / TILE_SIZE) + 1);
        const colors = THEME_COLORS[this.layout.theme];

        ctx.fillStyle = colors.void;
        ctx.fillRect(-cameraX, -cameraY, this.layout.width * TILE_SIZE, this.layout.height * TILE_SIZE);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.renderInteriorTile(ctx, x, y, x * TILE_SIZE - cameraX, y * TILE_SIZE - cameraY);
            }
        }

        this.renderRoomTrim(ctx, cameraX, cameraY);
        this.renderInteriorProps(ctx, cameraX, cameraY);
        this.renderInspectMarkers(ctx, cameraX, cameraY);
        this.renderGate(ctx, cameraX, cameraY);

        for (const obj of this.loot) {
            obj.render(ctx, obj.x * TILE_SIZE - cameraX, obj.y * TILE_SIZE - cameraY, TILE_SIZE);
        }
    }

    private renderInteriorTile(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number): void {
        const colors = THEME_COLORS[this.layout.theme];
        const tile = this.getTileAt(x, y);

        switch (tile) {
            case TileType.WALL:
                ctx.fillStyle = colors.wall;
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = colors.wallInset;
                ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
                break;
            case TileType.DUNGEON_ENTRANCE:
                ctx.fillStyle = colors.gate;
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = colors.accent;
                ctx.fillRect(sx + 10, sy + 6, TILE_SIZE - 20, TILE_SIZE - 12);
                break;
            case TileType.ROAD:
                ctx.fillStyle = colors.path;
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = 'rgba(255, 220, 155, 0.08)';
                ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
                break;
            case TileType.LAVA:
                ctx.fillStyle = '#4d140f';
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#c23a20';
                ctx.fillRect(sx + 3, sy + 6, TILE_SIZE - 6, TILE_SIZE - 12);
                ctx.fillStyle = 'rgba(255, 170, 58, 0.34)';
                ctx.fillRect(sx + 8, sy + 10, TILE_SIZE - 16, TILE_SIZE - 20);
                break;
            default:
                ctx.fillStyle = (x + y) % 2 === 0 ? colors.floor : colors.floorAlt;
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                break;
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }

    private tileKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    private renderRoomTrim(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
        const colors = THEME_COLORS[this.layout.theme];

        ctx.save();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        for (const room of this.layout.rooms) {
            const x = room.x * TILE_SIZE - cameraX;
            const y = room.y * TILE_SIZE - cameraY;
            const w = room.width * TILE_SIZE;
            const h = room.height * TILE_SIZE;
            ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillStyle = 'rgba(240, 215, 138, 0.82)';
            const label = t(room.nameKey);
            ctx.strokeText(label, x + w / 2, y + 7);
            ctx.fillText(label, x + w / 2, y + 7);
            ctx.strokeStyle = colors.accent;
        }
        ctx.restore();
    }

    private renderInteriorProps(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
        for (const prop of this.layout.props) {
            this.renderInteriorProp(ctx, prop, prop.tile.x * TILE_SIZE - cameraX, prop.tile.y * TILE_SIZE - cameraY);
        }
    }

    private renderInspectMarkers(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
        for (const marker of this.inspectMarkers) {
            this.renderInspectMarker(ctx, marker, marker.tile.x * TILE_SIZE - cameraX, marker.tile.y * TILE_SIZE - cameraY);
        }
    }

    private renderInspectMarker(ctx: CanvasRenderingContext2D, marker: StoryInteriorInspectMarker, sx: number, sy: number): void {
        ctx.save();
        const cx = sx + TILE_SIZE / 2;

        ctx.fillStyle = 'rgba(10, 8, 8, 0.62)';
        ctx.beginPath();
        ctx.ellipse(cx, sy + TILE_SIZE - 8, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (marker.kind === 'chest') {
            ctx.fillStyle = '#5b3922';
            ctx.fillRect(sx + 8, sy + 15, TILE_SIZE - 16, 12);
            ctx.fillStyle = '#8a5b2f';
            ctx.fillRect(sx + 7, sy + 12, TILE_SIZE - 14, 7);
            ctx.strokeStyle = '#d6a85f';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 8, sy + 13, TILE_SIZE - 16, 13);
            ctx.fillStyle = '#f1d58b';
            ctx.fillRect(cx - 2, sy + 17, 4, 5);
        } else {
            ctx.fillStyle = '#5f4a42';
            ctx.fillRect(sx + 9, sy + 17, TILE_SIZE - 14, 7);
            ctx.fillStyle = '#b19a7a';
            ctx.beginPath();
            ctx.arc(sx + 12, sy + 18, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#f1d58b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, sy + 7, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, sy + 14);
        ctx.lineTo(cx, sy + 18);
        ctx.stroke();

        if (marker.labelKey) {
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillStyle = '#f1d58b';
            const label = t(marker.labelKey);
            ctx.strokeText(label, cx, sy - 2);
            ctx.fillText(label, cx, sy - 2);
        }
        ctx.restore();
    }

    private renderInteriorProp(ctx: CanvasRenderingContext2D, prop: StoryInteriorProp, sx: number, sy: number): void {
        const colors = THEME_COLORS[this.layout.theme];
        ctx.save();
        switch (prop.kind) {
            case 'torch': {
                const pulse = 0.65 + Math.sin(Date.now() / 180 + prop.tile.x * 0.7) * 0.18;
                ctx.fillStyle = `rgba(236, 128, 54, ${0.16 + pulse * 0.14})`;
                ctx.beginPath();
                ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE * 0.58, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#3c2618';
                ctx.fillRect(sx + 13, sy + 8, TILE_SIZE - 26, TILE_SIZE - 10);
                ctx.fillStyle = colors.accent;
                ctx.beginPath();
                ctx.arc(sx + TILE_SIZE / 2, sy + 10, 5, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'crate':
                ctx.fillStyle = '#533826';
                ctx.fillRect(sx + 5, sy + 8, TILE_SIZE - 10, TILE_SIZE - 12);
                ctx.strokeStyle = '#9b7044';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 6, sy + 9, TILE_SIZE - 12, TILE_SIZE - 14);
                ctx.beginPath();
                ctx.moveTo(sx + 8, sy + TILE_SIZE - 8);
                ctx.lineTo(sx + TILE_SIZE - 8, sy + 10);
                ctx.stroke();
                break;
            case 'banner':
                ctx.fillStyle = colors.accent;
                ctx.fillRect(sx + 8, sy + 4, TILE_SIZE - 16, TILE_SIZE - 8);
                ctx.fillStyle = 'rgba(40, 20, 20, 0.55)';
                ctx.fillRect(sx + 11, sy + 8, TILE_SIZE - 22, TILE_SIZE - 16);
                break;
            case 'door':
                ctx.fillStyle = 'rgba(10, 8, 12, 0.44)';
                ctx.fillRect(sx + 4, sy + 3, TILE_SIZE - 8, TILE_SIZE - 6);
                ctx.strokeStyle = 'rgba(183, 130, 69, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 7, sy + 5, TILE_SIZE - 14, TILE_SIZE - 10);
                ctx.fillStyle = 'rgba(255, 218, 142, 0.28)';
                ctx.fillRect(sx + TILE_SIZE - 11, sy + TILE_SIZE / 2 - 2, 3, 4);
                break;
            case 'sealedDoor':
                ctx.fillStyle = 'rgba(10, 8, 12, 0.74)';
                ctx.fillRect(sx - 3, sy - 6, TILE_SIZE + 6, TILE_SIZE + 12);
                ctx.strokeStyle = colors.accent;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 3, sy - 1, TILE_SIZE - 6, TILE_SIZE + 2);
                ctx.fillStyle = 'rgba(255, 218, 142, 0.2)';
                ctx.fillRect(sx + 10, sy + 7, TILE_SIZE - 20, TILE_SIZE - 14);
                break;
            case 'throne':
                ctx.fillStyle = '#2c1c20';
                ctx.fillRect(sx + 7, sy + 6, TILE_SIZE - 14, TILE_SIZE - 6);
                ctx.fillStyle = colors.accent;
                ctx.fillRect(sx + 9, sy + 4, TILE_SIZE - 18, 5);
                ctx.fillRect(sx + 8, sy + TILE_SIZE - 8, TILE_SIZE - 16, 4);
                break;
            case 'bossSeal':
                ctx.strokeStyle = colors.accent;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE * 0.34, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(sx + TILE_SIZE / 2, sy + 7);
                ctx.lineTo(sx + TILE_SIZE - 8, sy + TILE_SIZE - 9);
                ctx.lineTo(sx + 8, sy + TILE_SIZE - 9);
                ctx.closePath();
                ctx.stroke();
                break;
            case 'rubble':
                ctx.fillStyle = colors.wallInset;
                ctx.fillRect(sx + 7, sy + 17, 9, 8);
                ctx.fillRect(sx + 18, sy + 11, 8, 13);
                ctx.fillRect(sx + 4, sy + 8, 7, 6);
                break;
        }

        if (prop.labelKey) {
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillStyle = '#f1d58b';
            const label = t(prop.labelKey);
            ctx.strokeText(label, sx + TILE_SIZE / 2, sy - 2);
            ctx.fillText(label, sx + TILE_SIZE / 2, sy - 2);
        }
        ctx.restore();
    }

    private renderGate(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
        const colors = THEME_COLORS[this.layout.theme];
        const x = this.layout.entryTile.x * TILE_SIZE - cameraX;
        const y = this.layout.entryTile.y * TILE_SIZE - cameraY;

        ctx.save();
        ctx.fillStyle = colors.gate;
        ctx.fillRect(x + 2, y - 12, TILE_SIZE - 4, TILE_SIZE + 16);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, y - 7, TILE_SIZE - 10, TILE_SIZE + 7);
        ctx.fillStyle = 'rgba(255, 230, 170, 0.18)';
        ctx.fillRect(x + 11, y + 2, TILE_SIZE - 22, TILE_SIZE - 4);
        ctx.restore();
    }
}
