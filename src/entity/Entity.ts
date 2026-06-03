/**
 * Entity — base class for all game objects (players, monsters, NPCs).
 * Uses a static image by default, with optional sprite-sheet animation.
 *
 * Movement: SRPG board-game style — hops tile by tile with a brief
 * settle pause at each tile, like placing a piece on a board.
 */

export type EntityFacing = 'up' | 'down' | 'left' | 'right';
export type EntityActionMotionKind = 'attack' | 'magic';

interface WalkSpriteData {
    image: HTMLImageElement;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    framesPerSecond: number;
    rowByFacing: Record<EntityFacing, number>;
    renderScale: number;
    actionRowByFacing?: Partial<Record<EntityFacing, number>>;
    actionFrameCount: number;
    actionRowsAvailable: Partial<Record<EntityFacing, boolean>>;
}

interface ActionMotionState {
    kind: EntityActionMotionKind;
    elapsed: number;
    duration: number;
    framesPerSecond: number;
}

export class Entity {
    public static readonly WALK_ROW_BY_FACING: Record<EntityFacing, number> = {
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
    public facing: EntityFacing = 'down';

    /** Optional static portrait image (128x128 single illustration) */
    public image?: HTMLImageElement;
    public imageLoaded: boolean = false;
    /** Optional walking sprite sheet. Renderers may also use one frame while idle. */
    public walkSprite?: WalkSpriteData;
    public walkSpriteLoaded: boolean = false;
    private actionMotion: ActionMotionState | null = null;

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
        rowByFacing: Record<EntityFacing, number> = Entity.WALK_ROW_BY_FACING,
        renderScale: number = 1,
        actionRowByFacing?: Partial<Record<EntityFacing, number>>,
        actionFrameCount: number = 2
    ): void {
        const image = new Image();
        const sprite: WalkSpriteData = {
            image,
            frameWidth,
            frameHeight,
            frameCount,
            framesPerSecond,
            rowByFacing,
            renderScale,
            actionRowByFacing,
            actionFrameCount,
            actionRowsAvailable: {},
        };
        this.walkSpriteLoaded = false;
        this.walkSprite = sprite;
        this.actionMotion = null;
        image.onload = () => {
            if (this.walkSprite !== sprite) return;
            sprite.actionRowsAvailable = this.detectActionRows(sprite);
            this.walkSpriteLoaded = true;
        };
        image.onerror = () => {
            if (this.walkSprite !== sprite) return;
            this.walkSpriteLoaded = false;
            this.walkSprite = undefined;
        };
        image.src = src;
    }

    public playActionMotion(kind: EntityActionMotionKind, duration: number = 0.36, framesPerSecond: number = 8): boolean {
        if (!this.hasActionMotionForFacing(this.facing)) return false;
        this.actionMotion = { kind, elapsed: 0, duration, framesPerSecond };
        return true;
    }

    public faceToward(gridX: number, gridY: number): void {
        const dx = gridX - this.gridX;
        const dy = gridY - this.gridY;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) this.facing = 'right';
            else if (dx < 0) this.facing = 'left';
        } else {
            if (dy > 0) this.facing = 'down';
            else if (dy < 0) this.facing = 'up';
        }
    }

    public getActionSpriteFrame(): { row: number; frame: number } | null {
        const sprite = this.walkSprite;
        const motion = this.actionMotion;
        if (!sprite || !motion || !this.hasActionMotionForFacing(this.facing)) return null;

        const row = sprite.actionRowByFacing?.[this.facing];
        if (row === undefined) return null;

        const frameCount = Math.max(1, sprite.actionFrameCount);
        const frame = Math.min(Math.floor(motion.elapsed * motion.framesPerSecond), frameCount - 1);
        return { row, frame };
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
        this.updateActionMotion(dt);
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

    private hasActionMotionForFacing(facing: EntityFacing): boolean {
        const sprite = this.walkSprite;
        if (!sprite || !this.walkSpriteLoaded) return false;
        const row = sprite.actionRowByFacing?.[facing];
        return row !== undefined && sprite.actionRowsAvailable[facing] === true;
    }

    private updateActionMotion(dt: number): void {
        if (!this.actionMotion) return;
        this.actionMotion.elapsed += dt;
        if (this.actionMotion.elapsed >= this.actionMotion.duration) this.actionMotion = null;
    }

    private detectActionRows(sprite: WalkSpriteData): Partial<Record<EntityFacing, boolean>> {
        const rows: Partial<Record<EntityFacing, boolean>> = {};
        if (!sprite.actionRowByFacing || typeof document === 'undefined') return rows;

        try {
            const canvas = document.createElement('canvas');
            const width = sprite.frameWidth * Math.max(1, sprite.actionFrameCount);
            canvas.width = width;
            canvas.height = sprite.frameHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return rows;

            for (const [facing, row] of Object.entries(sprite.actionRowByFacing) as [EntityFacing, number][]) {
                if (row < 0 || sprite.image.naturalHeight < (row + 1) * sprite.frameHeight) continue;
                if (sprite.image.naturalWidth < width) continue;

                ctx.clearRect(0, 0, width, sprite.frameHeight);
                ctx.drawImage(
                    sprite.image,
                    0,
                    row * sprite.frameHeight,
                    width,
                    sprite.frameHeight,
                    0,
                    0,
                    width,
                    sprite.frameHeight
                );
                const pixels = ctx.getImageData(0, 0, width, sprite.frameHeight).data;
                rows[facing] = hasVisiblePixels(pixels);
            }
        } catch {
            return rows;
        }

        return rows;
    }
}

function hasVisiblePixels(pixels: Uint8ClampedArray): boolean {
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) return true;
    }
    return false;
}
