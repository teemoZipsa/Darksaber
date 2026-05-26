import type { TilePoint } from './FieldPathing';

export type LineOfSightBlocker = (tile: TilePoint) => boolean;

export function getSupercoverLine(from: TilePoint, to: TilePoint): TilePoint[] {
    const result: TilePoint[] = [{ x: from.x, y: from.y }];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const nx = Math.abs(dx);
    const ny = Math.abs(dy);
    const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    let x = from.x;
    let y = from.y;
    let ix = 0;
    let iy = 0;

    while (ix < nx || iy < ny) {
        if (ny === 0) {
            x += sx;
            ix++;
        } else if (nx === 0) {
            y += sy;
            iy++;
        } else {
            const nextXCross = (0.5 + ix) / nx;
            const nextYCross = (0.5 + iy) / ny;
            if (nextXCross < nextYCross) {
                x += sx;
                ix++;
            } else if (nextYCross < nextXCross) {
                y += sy;
                iy++;
            } else {
                pushUnique(result, { x: x + sx, y });
                pushUnique(result, { x, y: y + sy });
                x += sx;
                y += sy;
                ix++;
                iy++;
            }
        }
        pushUnique(result, { x, y });
    }

    return result;
}

export function hasLineOfSight(from: TilePoint, to: TilePoint, isBlocking: LineOfSightBlocker): boolean {
    for (const tile of getSupercoverLine(from, to)) {
        if ((tile.x === from.x && tile.y === from.y) || (tile.x === to.x && tile.y === to.y)) continue;
        if (isBlocking(tile)) return false;
    }
    return true;
}

function pushUnique(points: TilePoint[], tile: TilePoint): void {
    if (points.some((point) => point.x === tile.x && point.y === tile.y)) return;
    points.push(tile);
}
