export interface FieldHudRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface FieldMinimapLayout extends FieldHudRect {
    mapSize: number;
    compact: boolean;
}

export interface FieldHudLayout {
    compact: boolean;
    showTitle: boolean;
    character: FieldHudRect;
    entityInfo: FieldHudRect;
    minimap: FieldMinimapLayout;
}

export const COMPACT_FIELD_HUD_BREAKPOINT = 520;

export function getFieldHudLayout(
    viewWidth: number,
    topBanner: FieldHudRect | null = null,
): FieldHudLayout {
    const width = Math.max(0, viewWidth);
    if (width >= COMPACT_FIELD_HUD_BREAKPOINT) {
        return {
            compact: false,
            showTitle: true,
            character: { x: 16, y: 56, w: 232, h: 116 },
            entityInfo: { x: 16, y: 196, w: 210, h: 320 },
            minimap: {
                x: Math.max(0, width - 216 - 16),
                y: 16,
                w: 216,
                h: 274,
                mapSize: 168,
                compact: false,
            },
        };
    }

    const margin = 8;
    const gap = 8;
    const availableForColumns = Math.max(0, width - margin * 2 - gap);
    const minimapWidth = Math.max(0, Math.min(160, Math.floor(availableForColumns / 2)));
    const characterWidth = Math.max(0, availableForColumns - minimapWidth);
    const contentY = topBanner
        ? Math.max(margin, topBanner.y + topBanner.h + gap)
        : margin;
    const mapSize = Math.max(0, Math.min(112, minimapWidth - 24));
    const minimapHeight = 26 + 6 + mapSize + 8 + 24 + 8;

    return {
        compact: true,
        showTitle: false,
        character: {
            x: margin,
            y: contentY,
            w: characterWidth,
            h: 86,
        },
        entityInfo: {
            x: margin,
            y: contentY + 86 + gap,
            w: characterWidth,
            h: 108,
        },
        minimap: {
            x: margin + characterWidth + gap,
            y: contentY,
            w: minimapWidth,
            h: minimapHeight,
            mapSize,
            compact: true,
        },
    };
}

export function getRectIntersectionArea(a: FieldHudRect, b: FieldHudRect): number {
    const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return width * height;
}
