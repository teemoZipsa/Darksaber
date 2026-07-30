import test from 'node:test';
import assert from 'node:assert/strict';
import { formatT } from '../../src/i18n/LanguageManager';
import { TileType } from '../../src/map/Tile';
import {
    getCompactMinimapPanelHeight,
    MinimapUI,
} from '../../src/ui/MinimapUI';

interface FillRectCall {
    x: number;
    y: number;
    width: number;
    height: number;
    fillStyle: unknown;
}

function createCanvasContextRecorder(): {
    ctx: CanvasRenderingContext2D;
    fillRects: FillRectCall[];
    texts: string[];
} {
    const fillRects: FillRectCall[] = [];
    const texts: string[] = [];
    let activeFillStyle: unknown = '';
    const ctx = {
        get fillStyle() {
            return activeFillStyle;
        },
        set fillStyle(value: unknown) {
            activeFillStyle = value;
        },
        strokeStyle: '',
        font: '',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        globalAlpha: 1,
        lineWidth: 1,
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetY: 0,
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        closePath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        arcTo: () => undefined,
        clip: () => undefined,
        fill: () => undefined,
        stroke: () => undefined,
        strokeRect: () => undefined,
        fillRect(x: number, y: number, width: number, height: number) {
            fillRects.push({ x, y, width, height, fillStyle: activeFillStyle });
        },
        fillText(text: string) {
            texts.push(text);
        },
        measureText(text: string) {
            return { width: text.length * 6 };
        },
        createLinearGradient: () => ({
            addColorStop: () => undefined,
        }),
    } as unknown as CanvasRenderingContext2D;

    return { ctx, fillRects, texts };
}

test('compact minimap honors caller geometry and renders only a coordinate footer', () => {
    const player = { x: 10, y: 20 };
    const minimap = new MinimapUI({
        getTile: () => TileType.GRASS,
        getPlayerPos: () => player,
        getBounds: () => ({ width: 0, height: 0 }),
        getLandmarks: () => [],
        getEnemies: () => [
            { gridX: player.x + 20, gridY: player.y, color: '#fff' },
            // Outside the rendered 104px map, but inside the legacy fixed 168px bound.
            { gridX: player.x + 40, gridY: player.y, color: '#fff' },
        ],
        getExtractionZones: () => [],
        getLoot: () => [],
    });
    const { ctx, fillRects, texts } = createCanvasContextRecorder();

    minimap.render(
        ctx,
        390,
        844,
        {
            gold: 999,
            worldName: 'HIDDEN WORLD',
            terrainLines: ['HIDDEN TERRAIN'],
        },
        {
            compact: true,
            x: 234,
            y: 80,
            panelWidth: 148,
            mapSize: 104,
        },
    );

    assert.deepEqual(minimap.getLastPanelRect(), {
        x: 234,
        y: 80,
        width: 148,
        height: getCompactMinimapPanelHeight(104),
    });
    assert.ok(fillRects.some((call) =>
        call.fillStyle === '#1a140c'
        && call.x === 256
        && call.y === 112
        && call.width === 104
        && call.height === 104
    ));
    assert.equal(fillRects.filter((call) => call.fillStyle === '#ff6248').length, 1);
    assert.ok(texts.includes(formatT('minimap.coords', player)));
    assert.equal(texts.includes('999 G'), false);
    assert.equal(texts.includes('HIDDEN WORLD'), false);
    assert.equal(texts.includes('HIDDEN TERRAIN'), false);

    assert.equal(minimap.onClick(250, 90), true);
    assert.equal(minimap.handleInput({
        uiMouseX: 380,
        uiMouseY: 830,
        mouseJustDown: true,
        mouseJustUp: false,
        mouseIsDown: true,
        mouseWheelDelta: 0,
    }), true);
    minimap.closeFullMap();
    assert.equal(minimap.handleInput({
        uiMouseX: 380,
        uiMouseY: 830,
        mouseJustDown: true,
        mouseJustUp: false,
        mouseIsDown: true,
        mouseWheelDelta: 0,
    }), false);
});
