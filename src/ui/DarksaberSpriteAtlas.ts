export type DarksaberSheetId = 'board' | 'fx2' | 'fx' | 'micon' | 'items';

export interface SpriteRect {
    sheet: DarksaberSheetId;
    x: number;
    y: number;
    w: number;
    h: number;
}

export type DamageNumberVariant = 'damage' | 'crit' | 'heal';

interface NumberRow {
    x: number;
    y: number;
    charW: number;
    charH: number;
}

export interface IconCell {
    col: number;
    row: number;
}

export interface DrawSpriteOptions {
    alpha?: number;
    anchorX?: number;
    anchorY?: number;
    flipX?: boolean;
    rotation?: number;
    smoothing?: boolean;
}

interface DrawNumberOptions {
    alpha?: number;
    align?: 'left' | 'center' | 'right';
    scale?: number;
    spacing?: number;
}

interface SliceInset {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const SHEET_SOURCES: Record<DarksaberSheetId, string> = {
    board: '/assets/images/ui/darksaber_board.png',
    fx2: '/assets/images/ui/darksaber_fx2.png',
    fx: '/assets/images/ui/darksaber_fx.png',
    micon: '/assets/images/ui/darksaber_micon.png',
    items: '/assets/images/items/darksaber_items.png',
};

const DAMAGE_GLYPHS = '1234567890+-';
export const MICON_CELL_SIZE = 32;
export const ITEM_CELL_SIZE = 32;

const NUMBER_ROWS: Record<DamageNumberVariant, NumberRow> = {
    damage: { x: 235, y: 418, charW: 8, charH: 14 },
    heal: { x: 235, y: 454, charW: 8, charH: 14 },
    crit: { x: 235, y: 472, charW: 8, charH: 14 },
};

export const DARKSABER_PANEL_FRAME: SpriteRect = { sheet: 'board', x: 502, y: 3, w: 55, h: 56 };

class DarksaberSpriteAtlasClass {
    private images = new Map<DarksaberSheetId, HTMLImageElement>();
    private loadPromises: Promise<void>[] = [];

    public init(): Promise<void[]> {
        if (typeof Image === 'undefined') return Promise.resolve([]);

        for (const [sheet, src] of Object.entries(SHEET_SOURCES)) {
            this.queueImageLoad(sheet as DarksaberSheetId, src);
        }
        return Promise.all(this.loadPromises);
    }

    public getImage(sheet: DarksaberSheetId): HTMLImageElement | undefined {
        const img = this.images.get(sheet);
        if (img?.complete && img.naturalWidth > 0) return img;
        return undefined;
    }

    public drawSprite(
        ctx: CanvasRenderingContext2D,
        rect: SpriteRect,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
        options: DrawSpriteOptions = {}
    ): boolean {
        const img = this.getImage(rect.sheet);
        if (!img) return false;

        const anchorX = options.anchorX ?? 0;
        const anchorY = options.anchorY ?? 0;
        const smoothing = options.smoothing ?? false;

        ctx.save();
        ctx.globalAlpha *= options.alpha ?? 1;
        ctx.imageSmoothingEnabled = smoothing;
        ctx.translate(dx + dw * anchorX, dy + dh * anchorY);
        if (options.rotation) ctx.rotate(options.rotation);
        if (options.flipX) ctx.scale(-1, 1);
        ctx.drawImage(
            img,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            -dw * anchorX,
            -dh * anchorY,
            dw,
            dh
        );
        ctx.restore();
        return true;
    }

    public drawIconCell(
        ctx: CanvasRenderingContext2D,
        col: number,
        row: number,
        x: number,
        y: number,
        size: number,
        options: DrawSpriteOptions = {}
    ): boolean {
        return this.drawSprite(
            ctx,
            {
                sheet: 'micon',
                x: col * MICON_CELL_SIZE,
                y: row * MICON_CELL_SIZE,
                w: MICON_CELL_SIZE,
                h: MICON_CELL_SIZE,
            },
            x,
            y,
            size,
            size,
            options
        );
    }

    public drawItemCell(
        ctx: CanvasRenderingContext2D,
        col: number,
        row: number,
        x: number,
        y: number,
        size: number,
        options: DrawSpriteOptions = {}
    ): boolean {
        return this.drawSprite(
            ctx,
            {
                sheet: 'items',
                x: col * ITEM_CELL_SIZE,
                y: row * ITEM_CELL_SIZE,
                w: ITEM_CELL_SIZE,
                h: ITEM_CELL_SIZE,
            },
            x,
            y,
            size,
            size,
            options
        );
    }

    public drawNumberText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        variant: DamageNumberVariant,
        options: DrawNumberOptions = {}
    ): boolean {
        const img = this.getImage('board');
        if (!img) return false;

        const row = NUMBER_ROWS[variant];
        const scale = options.scale ?? 2;
        const spacing = options.spacing ?? 1;
        const chars = text.replace(/!/g, '').split('');
        let totalW = 0;

        for (const ch of chars) {
            if (ch === ' ') {
                totalW += row.charW * scale;
                continue;
            }
            if (!DAMAGE_GLYPHS.includes(ch)) return false;
            totalW += row.charW * scale + spacing * scale;
        }
        if (totalW > 0) totalW -= spacing * scale;

        const align = options.align ?? 'center';
        let cursorX = x;
        if (align === 'center') cursorX -= totalW / 2;
        if (align === 'right') cursorX -= totalW;

        ctx.save();
        ctx.globalAlpha *= options.alpha ?? 1;
        ctx.imageSmoothingEnabled = false;

        for (const ch of chars) {
            if (ch === ' ') {
                cursorX += row.charW * scale;
                continue;
            }

            const glyphIndex = DAMAGE_GLYPHS.indexOf(ch);
            const sx = row.x + glyphIndex * row.charW;
            const dw = row.charW * scale;
            const dh = row.charH * scale;
            ctx.drawImage(img, sx, row.y, row.charW, row.charH, cursorX, y - dh / 2, dw, dh);
            cursorX += dw + spacing * scale;
        }

        ctx.restore();
        return true;
    }

    public drawNineSlice(
        ctx: CanvasRenderingContext2D,
        rect: SpriteRect,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
        inset: number | SliceInset,
        options: { alpha?: number; smoothing?: boolean } = {}
    ): boolean {
        const img = this.getImage(rect.sheet);
        if (!img) return false;

        const slice = typeof inset === 'number'
            ? { left: inset, top: inset, right: inset, bottom: inset }
            : inset;
        const dstLeft = Math.min(slice.left, dw / 2);
        const dstRight = Math.min(slice.right, dw / 2);
        const dstTop = Math.min(slice.top, dh / 2);
        const dstBottom = Math.min(slice.bottom, dh / 2);
        const srcCenterW = rect.w - slice.left - slice.right;
        const srcCenterH = rect.h - slice.top - slice.bottom;
        const dstCenterW = Math.max(0, dw - dstLeft - dstRight);
        const dstCenterH = Math.max(0, dh - dstTop - dstBottom);

        ctx.save();
        ctx.globalAlpha *= options.alpha ?? 1;
        ctx.imageSmoothingEnabled = options.smoothing ?? false;

        this.drawSlice(ctx, img, rect.x, rect.y, slice.left, slice.top, dx, dy, dstLeft, dstTop);
        this.drawSlice(ctx, img, rect.x + slice.left, rect.y, srcCenterW, slice.top, dx + dstLeft, dy, dstCenterW, dstTop);
        this.drawSlice(ctx, img, rect.x + rect.w - slice.right, rect.y, slice.right, slice.top, dx + dw - dstRight, dy, dstRight, dstTop);

        this.drawSlice(ctx, img, rect.x, rect.y + slice.top, slice.left, srcCenterH, dx, dy + dstTop, dstLeft, dstCenterH);
        this.drawSlice(ctx, img, rect.x + slice.left, rect.y + slice.top, srcCenterW, srcCenterH, dx + dstLeft, dy + dstTop, dstCenterW, dstCenterH);
        this.drawSlice(ctx, img, rect.x + rect.w - slice.right, rect.y + slice.top, slice.right, srcCenterH, dx + dw - dstRight, dy + dstTop, dstRight, dstCenterH);

        this.drawSlice(ctx, img, rect.x, rect.y + rect.h - slice.bottom, slice.left, slice.bottom, dx, dy + dh - dstBottom, dstLeft, dstBottom);
        this.drawSlice(ctx, img, rect.x + slice.left, rect.y + rect.h - slice.bottom, srcCenterW, slice.bottom, dx + dstLeft, dy + dh - dstBottom, dstCenterW, dstBottom);
        this.drawSlice(ctx, img, rect.x + rect.w - slice.right, rect.y + rect.h - slice.bottom, slice.right, slice.bottom, dx + dw - dstRight, dy + dh - dstBottom, dstRight, dstBottom);

        ctx.restore();
        return true;
    }

    private queueImageLoad(sheet: DarksaberSheetId, src: string): void {
        if (this.images.has(sheet)) return;

        const img = new Image();
        const promise = new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => {
                console.warn(`Darksaber sprite sheet unavailable: ${src}`);
                resolve();
            };
        });
        img.src = src;
        this.images.set(sheet, img);
        this.loadPromises.push(promise);
    }

    private drawSlice(
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number
    ): void {
        if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }
}

export const DarksaberSpriteAtlas = new DarksaberSpriteAtlasClass();
