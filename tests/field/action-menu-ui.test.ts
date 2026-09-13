import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ActionMenuUI,
    getCompactActionMenuLayout,
    type ActionMenuCompactChipBounds,
    type ActionMenuSlotState,
} from '../../src/ui/ActionMenuUI';
import { FieldMagicMenu, type FieldMagicSlot } from '../../src/ui/FieldMagicMenu';
import { ACTION_ICON_CELLS } from '../../src/ui/DarksaberIconRegistry';
import { DarksaberSpriteAtlas } from '../../src/ui/DarksaberSpriteAtlas';
import { getSkill } from '../../src/data/SkillDB';
import { TILE_SIZE } from '../../src/map/Chunk';
import { AudioManager } from '../../src/engine/AudioManager';
import { i18n, t, type Language } from '../../src/i18n/LanguageManager';

const ACTION_ORDER = [
    'move',
    'tool',
    'attack',
    'magic',
    'defend',
    'rest',
    'fanfare',
    'open',
] as const satisfies readonly ActionMenuSlotState['type'][];

interface TextCall {
    text: string;
    x: number;
    y: number;
    maxWidth?: number;
    font: string;
    fillStyle: unknown;
}

function createCanvasContextRecorder(): {
    ctx: CanvasRenderingContext2D;
    textCalls: TextCall[];
    paintCalls: string[];
} {
    const textCalls: TextCall[] = [];
    const paintCalls: string[] = [];
    const state: Record<string, unknown> = {
        fillStyle: '',
        font: '',
        globalAlpha: 1,
        lineWidth: 1,
        textAlign: 'start',
        textBaseline: 'alphabetic',
    };
    const gradient = { addColorStop: () => undefined };
    const target = {
        measureText: (text: string) => ({ width: Array.from(String(text)).length * 6 }),
        fillText(text: string, x: number, y: number, maxWidth?: number) {
            textCalls.push({
                text: String(text),
                x,
                y,
                maxWidth,
                font: String(state.font ?? ''),
                fillStyle: state.fillStyle,
            });
        },
        strokeText: () => undefined,
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
    };
    const ctx = new Proxy(target as unknown as CanvasRenderingContext2D, {
        get(object, property, receiver) {
            if (Reflect.has(object, property)) return Reflect.get(object, property, receiver);
            if (typeof property === 'string' && property in state) return state[property];
            return () => {
                if (['fill', 'fillRect', 'stroke', 'strokeRect', 'drawImage'].includes(String(property))) {
                    paintCalls.push(String(property));
                }
            };
        },
        set(object, property, value, receiver) {
            if (typeof property === 'string') state[property] = value;
            return Reflect.set(object, property, value, receiver);
        },
    });
    return { ctx, textCalls, paintCalls };
}

function buildActionStates(disabledReason?: string): ActionMenuSlotState[] {
    return ACTION_ORDER.map((type, index) => ({
        type,
        enabled: type !== 'fanfare' || !disabledReason,
        costLabel: `C${index}`,
        disabledReason: type === 'fanfare' ? disabledReason : undefined,
    }));
}

function assertRectInside(
    outer: ActionMenuCompactChipBounds,
    inner: ActionMenuCompactChipBounds,
    message: string
): void {
    assert.ok(inner.x >= outer.x, `${message}: left`);
    assert.ok(inner.y >= outer.y, `${message}: top`);
    assert.ok(inner.x + inner.width <= outer.x + outer.width, `${message}: right`);
    assert.ok(inner.y + inner.height <= outer.y + outer.height, `${message}: bottom`);
}

function intersectionArea(a: ActionMenuCompactChipBounds, b: ActionMenuCompactChipBounds): number {
    const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return width * height;
}

function rectCenter(bounds: ActionMenuCompactChipBounds): { x: number; y: number } {
    return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
    };
}

function clickSlot(menu: ActionMenuUI, type: ActionMenuSlotState['type']) {
    const runtime = menu as unknown as {
        centerX: number;
        centerY: number;
        slots: Array<{ type: ActionMenuSlotState['type'] }>;
        getSlotPosition(slot: { type: ActionMenuSlotState['type'] }): { x: number; y: number };
    };
    runtime.centerX = 0;
    runtime.centerY = 0;
    const slot = runtime.slots.find((candidate) => candidate.type === type);
    assert.ok(slot);
    const pos = runtime.getSlotPosition(slot);
    return menu.onClick(pos.x, pos.y);
}

test('disabled inspect slot remains visible and clickable as a disabled action', () => {
    const menu = new ActionMenuUI();
    menu.open([
        { type: 'open', enabled: false, disabledReason: '조사 대상 없음' },
    ]);

    const result = clickSlot(menu, 'open');

    assert.equal(result?.type, 'open');
    assert.equal(result?.enabled, false);
    assert.equal(result?.disabledReason, '조사 대상 없음');
});

test('open action menu can refresh a disabled attack slot after targets change', () => {
    const menu = new ActionMenuUI();
    menu.open([
        { type: 'attack', enabled: false, disabledReason: '공격 대상 없음' },
    ]);

    assert.equal(clickSlot(menu, 'attack')?.enabled, false);

    menu.updateStates([
        { type: 'attack', enabled: true },
    ]);

    const result = clickSlot(menu, 'attack');

    assert.equal(result?.type, 'attack');
    assert.equal(result?.enabled, true);
    assert.equal(result?.disabledReason, undefined);
});

test('action menu hover feedback fires once when entering a different slot', () => {
    const menu = new ActionMenuUI();
    menu.open();
    const runtime = menu as unknown as {
        centerX: number;
        centerY: number;
        slots: Array<{ type: ActionMenuSlotState['type'] }>;
        getSlotPosition(slot: { type: ActionMenuSlotState['type'] }): { x: number; y: number };
    };
    runtime.centerX = 100;
    runtime.centerY = 100;
    const moveSlot = runtime.slots.find((slot) => slot.type === 'move');
    const attackSlot = runtime.slots.find((slot) => slot.type === 'attack');
    assert.ok(moveSlot);
    assert.ok(attackSlot);
    const movePos = runtime.getSlotPosition(moveSlot);
    const attackPos = runtime.getSlotPosition(attackSlot);
    const played: string[] = [];
    const originalPlayUi = AudioManager.playUi.bind(AudioManager);
    AudioManager.playUi = (key: string) => { played.push(key); };

    try {
        menu.onMouseMove(movePos.x, movePos.y);
        menu.onMouseMove(movePos.x, movePos.y);
        menu.onMouseMove(attackPos.x, attackPos.y);
    } finally {
        AudioManager.playUi = originalPlayUi;
    }

    assert.deepEqual(played, ['ui.hover', 'ui.hover']);
});

test('fanfare slot remains visible and disabled when no state enables it', () => {
    const menu = new ActionMenuUI();
    menu.open();

    const result = clickSlot(menu, 'fanfare');

    assert.equal(result?.type, 'fanfare');
    assert.equal(result?.enabled, false);
    assert.equal(result?.disabledReason, '집결할 파티원이 없습니다.');
});

test('action menu slots use the eight adjacent square cells around the actor', () => {
    const menu = new ActionMenuUI();
    menu.open();
    const runtime = menu as unknown as {
        centerX: number;
        centerY: number;
        slots: Array<{ type: ActionMenuSlotState['type'] }>;
        getSlotPosition(slot: { type: ActionMenuSlotState['type'] }): { x: number; y: number };
    };
    runtime.centerX = 100;
    runtime.centerY = 200;

    const positions = new Map(runtime.slots.map((slot) => [slot.type, runtime.getSlotPosition(slot)]));

    assert.deepEqual(positions.get('move'), { x: 100 - TILE_SIZE, y: 200 - TILE_SIZE });
    assert.deepEqual(positions.get('tool'), { x: 100, y: 200 - TILE_SIZE });
    assert.deepEqual(positions.get('attack'), { x: 100 + TILE_SIZE, y: 200 - TILE_SIZE });
    assert.deepEqual(positions.get('magic'), { x: 100 - TILE_SIZE, y: 200 });
    assert.deepEqual(positions.get('defend'), { x: 100 + TILE_SIZE, y: 200 });
    assert.deepEqual(positions.get('rest'), { x: 100 - TILE_SIZE, y: 200 + TILE_SIZE });
    assert.deepEqual(positions.get('fanfare'), { x: 100, y: 200 + TILE_SIZE });
    assert.deepEqual(positions.get('open'), { x: 100 + TILE_SIZE, y: 200 + TILE_SIZE });
});

test('compact action menu preserves the eight-slot 3x3 radial identity around its actor hole', () => {
    const uiScale = 1.2;
    for (const viewport of [
        { physicalWidth: 390, physicalHeight: 844 },
        { physicalWidth: 320, physicalHeight: 568 },
    ]) {
        const viewWidth = Math.floor(viewport.physicalWidth / uiScale);
        const viewHeight = Math.floor(viewport.physicalHeight / uiScale);
        const actorCenter = { x: viewWidth / 2, y: viewHeight / 2 };
        const layout = getCompactActionMenuLayout(
            viewWidth,
            viewHeight,
            actorCenter.x,
            actorCenter.y
        );
        const viewBounds = { x: 0, y: 0, width: viewWidth, height: viewHeight };

        assert.deepEqual(
            layout.slots.map((slot) => slot.type),
            ACTION_ORDER,
            `${viewport.physicalWidth}px order`
        );
        assertRectInside(viewBounds, layout.panel, `${viewport.physicalWidth}px panel`);
        assertRectInside(layout.panel, layout.center, `${viewport.physicalWidth}px actor hole`);
        assert.deepEqual(rectCenter(layout.center), actorCenter);

        const centers = new Map(layout.slots.map((slot) => [slot.type, rectCenter(slot)]));
        const center = rectCenter(layout.center);
        assert.ok(centers.get('move')!.x < center.x && centers.get('move')!.y < center.y);
        assert.ok(centers.get('tool')!.x === center.x && centers.get('tool')!.y < center.y);
        assert.ok(centers.get('attack')!.x > center.x && centers.get('attack')!.y < center.y);
        assert.ok(centers.get('magic')!.x < center.x && centers.get('magic')!.y === center.y);
        assert.ok(centers.get('defend')!.x > center.x && centers.get('defend')!.y === center.y);
        assert.ok(centers.get('rest')!.x < center.x && centers.get('rest')!.y > center.y);
        assert.ok(centers.get('fanfare')!.x === center.x && centers.get('fanfare')!.y > center.y);
        assert.ok(centers.get('open')!.x > center.x && centers.get('open')!.y > center.y);

        layout.slots.forEach((slot, index) => {
            assertRectInside(layout.panel, slot, `${viewport.physicalWidth}px slot ${slot.type}`);
            assert.equal(
                intersectionArea(slot, layout.center),
                0,
                `${slot.type} covers the actor hole`
            );
            for (let other = index + 1; other < layout.slots.length; other++) {
                assert.equal(
                    intersectionArea(slot, layout.slots[other]),
                    0,
                    `${slot.type} overlaps ${layout.slots[other].type}`
                );
            }
        });
    }
});

test('compact radial menu clamps near every viewport edge without changing slot identity', () => {
    const viewWidth = Math.floor(320 / 1.2);
    const viewHeight = Math.floor(568 / 1.2);
    const viewBounds = { x: 0, y: 0, width: viewWidth, height: viewHeight };
    const cases = [
        { x: 1, y: 1, direction: 'top-left' },
        { x: viewWidth - 1, y: 1, direction: 'top-right' },
        { x: 1, y: viewHeight - 1, direction: 'bottom-left' },
        { x: viewWidth - 1, y: viewHeight - 1, direction: 'bottom-right' },
    ] as const;

    for (const actorCenter of cases) {
        const layout = getCompactActionMenuLayout(
            viewWidth,
            viewHeight,
            actorCenter.x,
            actorCenter.y
        );
        const clampedCenter = rectCenter(layout.center);

        assertRectInside(viewBounds, layout.panel, `${actorCenter.direction} panel`);
        assert.deepEqual(layout.slots.map((slot) => slot.type), ACTION_ORDER);
        assert.notDeepEqual(
            clampedCenter,
            { x: actorCenter.x, y: actorCenter.y },
            `${actorCenter.direction} center was not clamped`
        );
        assert.ok(
            actorCenter.x < viewWidth / 2
                ? clampedCenter.x > actorCenter.x
                : clampedCenter.x < actorCenter.x
        );
        assert.ok(
            actorCenter.y < viewHeight / 2
                ? clampedCenter.y > actorCenter.y
                : clampedCenter.y < actorCenter.y
        );
        assert.ok(layout.slots.every((slot) => intersectionArea(slot, layout.center) === 0));
    }
});

test('both action layouts show only original icons and preserve disabled click feedback', (context) => {
    let iconCount = 0;
    context.mock.method(DarksaberSpriteAtlas, 'drawSprite', () => { iconCount++; return true; });
    const previousLanguage = i18n.lang;
    try {
        for (const language of ['ko', 'en'] as Language[]) {
            i18n.setLanguage(language);
            for (const compact of [false, true]) {
                const reason = t('field.action.fanfareNoFollowers');
                const menu = new ActionMenuUI();
                menu.open(buildActionStates(reason).map((state) => ({ ...state, highlighted: state.type === 'move' })));
                const { ctx, textCalls, paintCalls } = createCanvasContextRecorder();
                const render = () => compact
                    ? menu.renderCompact(ctx, 320, 568, 160, 284, true)
                    : menu.render(ctx, 136, 260, true);
                iconCount = 0;
                render();
                assert.equal(iconCount, 8);
                assert.equal(menu.usesCompactLayout(), compact);
                const layout = getCompactActionMenuLayout(320, 568, 160, 284);
                for (const slot of layout.slots) {
                    assert.equal(slot.width, TILE_SIZE);
                    assert.equal(slot.height, TILE_SIZE);
                    const point = rectCenter(slot);
                    const result = menu.onClick(point.x, point.y);
                    assert.equal(result?.type, slot.type);
                    assert.equal(result?.enabled, slot.type !== 'fanfare');
                    if (slot.type === 'fanfare') assert.equal(result?.disabledReason, reason);
                    menu.onMouseMove(point.x, point.y);
                    render();
                }
                assert.deepEqual(textCalls, [], 'no badges, labels, costs or disabled text around the actor');
                assert.deepEqual(paintCalls, [], 'no card backgrounds, frames, spokes or focus rings');
                assert.equal(menu.onClick(160, 284), null, 'the actor center is not an action');
                assert.equal(menu.onClick(layout.panel.x - 1, layout.panel.y - 1), null);
            }
        }
    } finally {
        i18n.setLanguage(previousLanguage);
    }
});

test('resizing from compact to desktop clears stale touch bounds and preserves icon hit targets', () => {
    const menu = new ActionMenuUI();
    const { ctx } = createCanvasContextRecorder();
    menu.open(buildActionStates());
    menu.renderCompact(ctx, 325, 703, 162.5, 351.5, true);
    const staleCompactPoint = menu.getCompactChipBounds('fanfare');
    assert.ok(staleCompactPoint);
    menu.render(ctx, 616, 336, true);
    assert.equal(menu.usesCompactLayout(), false);
    for (const type of ACTION_ORDER) assert.equal(menu.getCompactChipBounds(type), null);
    const oldPoint = rectCenter(staleCompactPoint);
    assert.equal(menu.onClick(oldPoint.x, oldPoint.y), null);
    assert.equal(menu.onClick(640 + TILE_SIZE, 360 - TILE_SIZE)?.type, 'attack');
});

test('compact icons remain on the same world tiles across UI scale and camera zoom', () => {
    for (const uiScale of [0.8, 1, 1.2]) {
        for (const zoom of [0.75, 1, 1.5]) {
            const actor = { x: 258, y: 480 };
            const menu = new ActionMenuUI();
            const { ctx } = createCanvasContextRecorder();
            menu.open(buildActionStates());
            menu.renderCompact(ctx, 516 / uiScale, 960 / uiScale,
                actor.x / uiScale, actor.y / uiScale, true, zoom / uiScale);
            const move = menu.getCompactChipBounds('move');
            assert.ok(move);
            const center = rectCenter(move);
            assert.ok(Math.abs(center.x * uiScale - (actor.x - TILE_SIZE * zoom)) < 1e-8);
            assert.ok(Math.abs(center.y * uiScale - (actor.y - TILE_SIZE * zoom)) < 1e-8);
            assert.ok(Math.abs(move.width * uiScale - TILE_SIZE * zoom) < 1e-8);
            assert.equal(menu.onClick((actor.x - TILE_SIZE * zoom) / uiScale,
                (actor.y - TILE_SIZE * zoom) / uiScale)?.type, 'move');
        }
    }
});

test('magic selection shows only original icons until an icon is hovered', (context) => {
    let iconCount = 0;
    context.mock.method(DarksaberSpriteAtlas, 'drawSprite', () => { iconCount++; return true; });
    const skill = getSkill('inf_t1');
    assert.ok(skill);
    const menu = new FieldMagicMenu();
    menu.show([{ skill, level: 1, enabled: true }]);
    const { ctx, textCalls, paintCalls } = createCanvasContextRecorder();
    menu.render(ctx, 136, 260);
    assert.equal(iconCount, 1);
    assert.deepEqual(textCalls, []);
    assert.deepEqual(paintCalls, []);
    assert.deepEqual(menu.onClick(160 - TILE_SIZE, 284 - TILE_SIZE), { kind: 'select', index: 0 });
});

test('inspect action no longer uses the computer icon cell', () => {
    assert.notDeepEqual(ACTION_ICON_CELLS.open, { col: 5, row: 0 });
});

test('magic menu slots use the same adjacent square layout as the action menu', () => {
    const menu = new FieldMagicMenu();
    const skillIds = ['inf_t1', 'inf_t2', 'inf_t3', 'arc_t1', 'arc_t2', 'mag_t1', 'mag_t2', 'pri_t1'];
    const slots = skillIds
        .map((id) => getSkill(id))
        .filter((skill): skill is NonNullable<ReturnType<typeof getSkill>> => Boolean(skill))
        .slice(0, 8)
        .map((skill): FieldMagicSlot => ({ skill, level: 1, enabled: true }));
    assert.equal(slots.length, 8);
    menu.show(slots);
    const runtime = menu as unknown as {
        centerX: number;
        centerY: number;
        slotPosition(index: number): { x: number; y: number };
    };
    runtime.centerX = 100;
    runtime.centerY = 200;

    assert.deepEqual(runtime.slotPosition(0), { x: 100 - TILE_SIZE, y: 200 - TILE_SIZE });
    assert.deepEqual(runtime.slotPosition(1), { x: 100, y: 200 - TILE_SIZE });
    assert.deepEqual(runtime.slotPosition(2), { x: 100 + TILE_SIZE, y: 200 - TILE_SIZE });
    assert.deepEqual(runtime.slotPosition(3), { x: 100 - TILE_SIZE, y: 200 });
    assert.deepEqual(runtime.slotPosition(4), { x: 100 + TILE_SIZE, y: 200 });
    assert.deepEqual(runtime.slotPosition(5), { x: 100 - TILE_SIZE, y: 200 + TILE_SIZE });
    assert.deepEqual(runtime.slotPosition(6), { x: 100, y: 200 + TILE_SIZE });
    assert.deepEqual(runtime.slotPosition(7), { x: 100 + TILE_SIZE, y: 200 + TILE_SIZE });
});

test('magic menu slot refresh preserves hover state while updating affordability', () => {
    const menu = new FieldMagicMenu();
    const skill = getSkill('inf_t1');
    assert.ok(skill);
    menu.show([{ skill, level: 1, enabled: true }]);
    const runtime = menu as unknown as {
        centerX: number;
        centerY: number;
        hoveredIndex: number | null;
        slotPosition(index: number): { x: number; y: number };
    };
    runtime.centerX = 100;
    runtime.centerY = 200;
    const pos = runtime.slotPosition(0);

    menu.onMouseMove(pos.x, pos.y);
    menu.updateSlots([{ skill, level: 1, enabled: false, disabledReason: 'MP 부족' }]);

    assert.equal(runtime.hoveredIndex, 0);
    assert.equal(menu.getSlot(0)?.enabled, false);
    assert.equal(menu.getSlot(0)?.disabledReason, 'MP 부족');
});
