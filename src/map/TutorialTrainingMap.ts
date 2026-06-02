import { TILE_SIZE } from './Chunk';
import { TileType, TILE_PROPERTIES } from './Tile';
import { WorldMap, type TileBounds, type TilePoint, type WorldMapDecoration, type WorldMapLandmark } from './WorldMap';
import { t } from '../i18n/LanguageManager';

const ARENA_WIDTH = 18;
const ARENA_HEIGHT = 14;
const PLAYER_START: TilePoint = { x: 8, y: 9 };
const INSTRUCTOR_TILE: TilePoint = { x: 8, y: 3 };
const ENEMY_TILE: TilePoint = { x: 11, y: 8 };

export class TutorialTrainingMap extends WorldMap {
    constructor() {
        super('mortal', { validateTownSpawns: false });
    }

    public getDisplayName(): string {
        return t('tutorial.world.trainingGround');
    }

    public getPlayerStartTile(): TilePoint {
        return { ...PLAYER_START };
    }

    public getInstructorTile(): TilePoint {
        return { ...INSTRUCTOR_TILE };
    }

    public getPracticeEnemyTile(): TilePoint {
        return { ...ENEMY_TILE };
    }

    public updateLoadedChunks(_worldCenterX: number, _worldCenterY: number): void {
        // Fixed tutorial room; no chunk streaming needed.
    }

    public getBoundsTiles(): TileBounds {
        return { width: ARENA_WIDTH, height: ARENA_HEIGHT };
    }

    public getMapLandmarks(): WorldMapLandmark[] {
        return [];
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
        // Fixed indoor tutorial room; world decorations are intentionally disabled.
    }

    public getTileAt(tx: number, ty: number): TileType {
        if (tx < 0 || ty < 0 || tx >= ARENA_WIDTH || ty >= ARENA_HEIGHT) return TileType.WALL;
        if (tx === 0 || ty === 0 || tx === ARENA_WIDTH - 1 || ty === ARENA_HEIGHT - 1) return TileType.WALL;
        if ((tx === 3 || tx === ARENA_WIDTH - 4) && (ty === 3 || ty === ARENA_HEIGHT - 4)) return TileType.WALL;
        if (ty === 2 && tx >= 5 && tx <= 12) return TileType.ROAD;
        if (tx >= 5 && tx <= 12 && ty >= 6 && ty <= 10) return TileType.SAND;
        if ((tx === 4 || tx === 13) && ty >= 5 && ty <= 11) return TileType.ROAD;
        return TileType.STONE;
    }

    public isWalkable(tx: number, ty: number): boolean {
        return !!TILE_PROPERTIES[this.getTileAt(tx, ty)]?.walkable;
    }

    public render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, vw: number, vh: number): void {
        const minX = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
        const minY = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
        const maxX = Math.min(ARENA_WIDTH - 1, Math.ceil((cameraX + vw) / TILE_SIZE) + 1);
        const maxY = Math.min(ARENA_HEIGHT - 1, Math.ceil((cameraY + vh) / TILE_SIZE) + 1);

        ctx.fillStyle = '#080705';
        ctx.fillRect(-cameraX, -cameraY, ARENA_WIDTH * TILE_SIZE, ARENA_HEIGHT * TILE_SIZE);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tile = this.getTileAt(x, y);
                const sx = x * TILE_SIZE - cameraX;
                const sy = y * TILE_SIZE - cameraY;
                this.renderTrainingTile(ctx, tile, sx, sy, x, y);
            }
        }

        this.renderArenaTrim(ctx, cameraX, cameraY);

        for (const obj of this.loot) {
            obj.render(ctx, obj.x * TILE_SIZE - cameraX, obj.y * TILE_SIZE - cameraY, TILE_SIZE);
        }
    }

    private renderTrainingTile(ctx: CanvasRenderingContext2D, tile: TileType, sx: number, sy: number, x: number, y: number): void {
        switch (tile) {
            case TileType.WALL:
                ctx.fillStyle = '#17120f';
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#2b211b';
                ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                ctx.strokeStyle = '#4a382a';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
                break;
            case TileType.SAND:
                ctx.fillStyle = '#6f4930';
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = (x + y) % 2 === 0 ? '#7c5639' : '#65432e';
                ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
                break;
            case TileType.ROAD:
                ctx.fillStyle = '#3c3028';
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#5b4a3c';
                ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
                break;
            default:
                ctx.fillStyle = '#2b2a2a';
                ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = (x + y) % 2 === 0 ? '#343230' : '#282625';
                ctx.fillRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                break;
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }

    private renderArenaTrim(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
        const x = 5 * TILE_SIZE - cameraX;
        const y = 6 * TILE_SIZE - cameraY;
        const w = 8 * TILE_SIZE;
        const h = 5 * TILE_SIZE;

        ctx.save();
        ctx.strokeStyle = '#b8874a';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
        ctx.strokeStyle = 'rgba(240, 192, 80, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
        ctx.restore();
    }
}
