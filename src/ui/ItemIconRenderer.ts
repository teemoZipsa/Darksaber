import type { ItemIconSprite } from '../data/ItemDB';
import { DarksaberSpriteAtlas } from './DarksaberSpriteAtlas';

export interface ItemIconLike {
    icon: string;
    iconSprite?: ItemIconSprite;
}

interface DrawItemIconOptions {
    alpha?: number;
    fontSize?: number;
    smoothing?: boolean;
}

export function drawItemIcon(
    ctx: CanvasRenderingContext2D,
    item: ItemIconLike,
    x: number,
    y: number,
    w: number,
    h: number,
    options: DrawItemIconOptions = {}
): boolean {
    ctx.save();
    ctx.globalAlpha *= options.alpha ?? 1;

    const size = Math.max(16, Math.min(w, h));
    const dx = x + (w - size) / 2;
    const dy = y + (h - size) / 2;

    const sprite = item.iconSprite;
    const rendered = sprite
        ? DarksaberSpriteAtlas.drawItemCell(ctx, sprite.col, sprite.row, dx, dy, size, {
            smoothing: options.smoothing ?? false,
        })
        : false;

    if (!rendered) {
        ctx.font = `${options.fontSize ?? Math.max(16, Math.floor(size * 0.58))}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon, x + w / 2, y + h / 2 + 1);
    }

    ctx.restore();
    return rendered;
}
