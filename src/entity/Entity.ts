/**
 * Entity — base class for all game objects (players, monsters, NPCs).
 * Uses a static image by default, with optional sprite-sheet animation.
 *
 * Movement: SRPG board-game style — hops tile by tile with a brief
 * settle pause at each tile, like placing a piece on a board.
 */

export class Entity {
    public static readonly WALK_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
        down: 0,
        up: 1,
        left: 2,
        right: 3,
    };

    public id: string;
    public gridX: number;
    public gridY: number;
    public pixelX: number; // For rendering (in tile units, fractional during movement)
    public pixelY: number;
    public color: string;
    public label: string;
    public isRealtime: boolean = false;
    public actionGauge: number = 0; // ATB System: 0 to 100
    public facing: 'up' | 'down' | 'left' | 'right' = 'down';

    /** Optional static portrait image (128x128 single illustration) */
    public image?: HTMLImageElement;
    public imageLoaded: boolean = false;
    /** Optional walking sprite sheet. Renderers may also use one frame while idle. */
    public walkSprite?: {
        image: HTMLImageElement;
        frameWidth: number;
        frameHeight: number;
        frameCount: number;
        framesPerSecond: number;
        rowByFacing: Record<'up' | 'down' | 'left' | 'right', number>;
        renderScale: number;
    };
    public walkSpriteLoaded: boolean = false;

    // ── Tile-step movement state ──
    /** Current step target (one tile away from current integer position) */
    private stepTargetX: number = 0;
    private stepTargetY: number = 0;
    /** Whether currently animating a single-tile hop */
    private stepping: boolean = false;
    /** Brief pause timer after arriving at a tile (seconds) */
    private settlePause: number = 0;

    /** Hop speed: tiles per second for the single-tile movement */
    private static readonly HOP_SPEED = 8;
    /** Pause between tile hops (seconds) */
    private static readonly SETTLE_TIME = 0.03;

    constructor(id: string, gridX: number, gridY: number, color: string, label: string = '') {
        this.id = id;
        this.gridX = gridX;
        this.gridY = gridY;
        this.pixelX = gridX;
        this.pixelY = gridY;
        this.stepTargetX = gridX;
        this.stepTargetY = gridY;
        this.color = color;
        this.label = label;
    }

    /** Load a single static image for this entity */
    public setImage(src: string): void {
        const image = new Image();
        this.imageLoaded = false;
        this.image = image;
        image.onload = () => {
            if (this.image !== image) return;
            this.imageLoaded = true;
        };
        image.onerror = () => {
            if (this.image !== image) return;
            this.imageLoaded = false;
        };
        image.src = src;
    }

    public setWalkSprite(
        src: string,
        frameWidth: number,
        frameHeight: number,
        frameCount: number,
        framesPerSecond: number = 8,
        rowByFacing: Record<'up' | 'down' | 'left' | 'right', number> = Entity.WALK_ROW_BY_FACING,
        renderScale: number = 1
    ): void {
        const image = new Image();
        const sprite = { image, frameWidth, frameHeight, frameCount, framesPerSecond, rowByFacing, renderScale };
        this.walkSpriteLoaded = false;
        this.walkSprite = sprite;
        image.onload = () => {
            if (this.walkSprite !== sprite) return;
            this.walkSpriteLoaded = true;
        };
        image.onerror = () => {
            if (this.walkSprite !== sprite) return;
            this.walkSpriteLoaded = false;
            this.walkSprite = undefined;
        };
        image.src = src;
    }

    public setGridPosition(gridX: number, gridY: number, instant = false): void {
        this.gridX = gridX;
        this.gridY = gridY;

        if (!instant) return;

        this.pixelX = gridX;
        this.pixelY = gridY;
        this.stepTargetX = gridX;
        this.stepTargetY = gridY;
        this.stepping = false;
        this.settlePause = 0;
    }

    public update(dt: number): void {
        if (this.isRealtime) return; // WorldEngine handles real-time position updates manually

        // ── Settle pause: brief stop at each tile ──
        if (this.settlePause > 0) {
            this.settlePause -= dt;
            return;
        }

        // ── If currently hopping to a step target ──
        if (this.stepping) {
            const dx = this.stepTargetX - this.pixelX;
            const dy = this.stepTargetY - this.pixelY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.02) {
                const move = Entity.HOP_SPEED * dt;
                if (move >= dist) {
                    // Arrived at step target
                    this.pixelX = this.stepTargetX;
                    this.pixelY = this.stepTargetY;
                } else {
                    this.pixelX += (dx / dist) * move;
                    this.pixelY += (dy / dist) * move;
                    return; // still moving
                }
            } else {
                this.pixelX = this.stepTargetX;
                this.pixelY = this.stepTargetY;
            }
            this.stepping = false;
            // Only pause if we have more tiles to go
            if (this.pixelX !== this.gridX || this.pixelY !== this.gridY) {
                this.settlePause = Entity.SETTLE_TIME;
            }
            return;
        }

        // ── Pick the next tile step toward gridX/gridY ──
        const remainX = this.gridX - this.pixelX;
        const remainY = this.gridY - this.pixelY;

        if (Math.abs(remainX) < 0.01 && Math.abs(remainY) < 0.01) {
            // Already at destination
            this.pixelX = this.gridX;
            this.pixelY = this.gridY;
            return;
        }

        // Move one axis at a time (no diagonal sliding)
        // Prioritize the axis with greater remaining distance
        if (Math.abs(remainX) >= Math.abs(remainY)) {
            this.stepTargetX = this.pixelX + Math.sign(remainX);
            this.stepTargetY = Math.round(this.pixelY);
        } else {
            this.stepTargetX = Math.round(this.pixelX);
            this.stepTargetY = this.pixelY + Math.sign(remainY);
        }
        this.stepping = true;
    }
}
