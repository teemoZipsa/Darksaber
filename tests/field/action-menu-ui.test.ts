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
} {
    const textCalls: TextCall[] = [];
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
            return () => undefined;
        },
        set(object, property, value, receiver) {
            if (typeof property === 'string') state[property] = value;
            return Reflect.set(object, property, value, receiver);
        },
    });
    return { ctx, textCalls };
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

test('compact radial menu always renders names and costs and uses its visible slots as hitboxes', () => {
    const previousLanguage = i18n.lang;
    i18n.setLanguage('ko');
    try {
        const viewWidth = Math.floor(390 / 1.2);
        const viewHeight = Math.floor(844 / 1.2);
        const actorCenter = { x: viewWidth / 2, y: viewHeight / 2 };
        const disabledReason = '집결할 파티원이 없습니다.';
        const states = buildActionStates(disabledReason);
        const menu = new ActionMenuUI();
        const { ctx, textCalls } = createCanvasContextRecorder();
        menu.open(states);

        menu.renderCompact(
            ctx,
            viewWidth,
            viewHeight,
            actorCenter.x,
            actorCenter.y,
            true
        );

        assert.equal(menu.usesCompactLayout(), true);
        const layout = getCompactActionMenuLayout(
            viewWidth,
            viewHeight,
            actorCenter.x,
            actorCenter.y
        );
        const labelKeys: Record<ActionMenuSlotState['type'], string> = {
            move: 'action.label.move',
            tool: 'action.label.tool',
            attack: 'action.label.attack',
            magic: 'action.label.magic',
            defend: 'action.label.defend',
            rest: 'action.label.rest',
            fanfare: 'action.label.fanfare',
            open: 'action.label.open',
        };
        for (const [index, slot] of layout.slots.entries()) {
            const expectedBounds = {
                x: slot.x,
                y: slot.y,
                width: slot.width,
                height: slot.height,
            };
            assert.deepEqual(menu.getCompactChipBounds(slot.type), expectedBounds);
            assert.ok(
                textCalls.some((call) => call.text === t(labelKeys[slot.type])),
                `${slot.type} label was not rendered`
            );
            assert.ok(
                textCalls.some((call) => call.text === `C${index}`),
                `${slot.type} cost was not rendered`
            );

            const point = rectCenter(slot);
            const result = menu.onClick(point.x, point.y);
            assert.equal(result?.type, slot.type);
            assert.equal(result?.enabled, states[index].enabled);
            assert.equal(result?.disabledReason, states[index].disabledReason);
        }

        const centerHole = rectCenter(layout.center);
        assert.equal(menu.hitTestCompactPanel(centerHole.x, centerHole.y), true);
        assert.equal(menu.onClick(centerHole.x, centerHole.y), null);
        assert.equal(menu.hitTestCompactPanel(layout.panel.x - 1, layout.panel.y - 1), false);
    } finally {
        i18n.setLanguage(previousLanguage);
    }
});

test('compact radial disabled reasons remain visible without hover in Korean and English', () => {
    const previousLanguage = i18n.lang;
    const cases: Array<{ language: Language; reason: string }> = [
        {
            language: 'ko',
            reason: '집결할 파티원이 없습니다.',
        },
        {
            language: 'en',
            reason: 'No ally can rally.',
        },
    ];

    try {
        for (const scenario of cases) {
            i18n.setLanguage(scenario.language);
            const menu = new ActionMenuUI();
            const { ctx, textCalls } = createCanvasContextRecorder();
            menu.open(buildActionStates(scenario.reason));
            const viewWidth = Math.floor(320 / 1.2);
            const viewHeight = Math.floor(568 / 1.2);
            menu.renderCompact(
                ctx,
                viewWidth,
                viewHeight,
                viewWidth / 2,
                viewHeight / 2,
                true
            );

            const bounds = menu.getCompactChipBounds('fanfare');
            assert.ok(bounds);
            const normalizedReason = scenario.reason.replace(/\s/g, '');
            const reasonCalls = textCalls.filter((call) => {
                const normalizedCall = call.text.replace(/…/g, '').replace(/\s/g, '');
                return normalizedCall.length >= 2
                    && (
                        normalizedReason.includes(normalizedCall)
                        || normalizedCall.includes(normalizedReason)
                    );
            });

            assert.ok(reasonCalls.length >= 1, `${scenario.language} disabled reason`);
            const renderedReason = reasonCalls
                .map((call) => call.text.replace(/…/g, ''))
                .join('')
                .replace(/\s/g, '');
            assert.ok(
                normalizedReason.startsWith(renderedReason)
                || renderedReason.startsWith(normalizedReason)
            );
            for (const call of reasonCalls) {
                assert.ok(call.x >= bounds.x);
                assert.ok(call.y >= bounds.y);
                assert.ok(call.x <= bounds.x + bounds.width);
                assert.ok(call.y <= bounds.y + bounds.height);
                const measuredWidth = Array.from(call.text).length * 6;
                assert.ok(measuredWidth <= bounds.width - 8);
            }
        }
    } finally {
        i18n.setLanguage(previousLanguage);
    }
});

test('desktop action menu keeps radial geometry and clears compact-only hitboxes and text', () => {
    const previousLanguage = i18n.lang;
    i18n.setLanguage('en');
    try {
        const menu = new ActionMenuUI();
        const states = buildActionStates().map((state) => state.type === 'attack'
            ? { ...state, enabled: false, disabledReason: 'No attackable enemy' }
            : state
        );
        const compactContext = createCanvasContextRecorder();
        menu.open(states);
        menu.renderCompact(compactContext.ctx, 325, 703, 162.5, 351.5, true);
        const staleCompactPoint = menu.getCompactChipBounds('fanfare');
        assert.ok(staleCompactPoint);

        const desktopContext = createCanvasContextRecorder();
        menu.render(desktopContext.ctx, 616, 336, true);

        assert.equal(menu.usesCompactLayout(), false);
        for (const type of ACTION_ORDER) assert.equal(menu.getCompactChipBounds(type), null);
        assert.equal(
            menu.onClick(
                staleCompactPoint.x + staleCompactPoint.width / 2,
                staleCompactPoint.y + staleCompactPoint.height / 2
            ),
            null
        );
        assert.equal(desktopContext.textCalls.some((call) => call.text.includes('C')), false);
        assert.equal(desktopContext.textCalls.some((call) => call.text === 'No attackable enemy'), false);

        const runtime = menu as unknown as {
            slots: Array<{ type: ActionMenuSlotState['type'] }>;
            getSlotPosition(slot: { type: ActionMenuSlotState['type'] }): { x: number; y: number };
        };
        const attackSlot = runtime.slots.find((slot) => slot.type === 'attack');
        assert.ok(attackSlot);
        assert.deepEqual(runtime.getSlotPosition(attackSlot), {
            x: 640 + TILE_SIZE,
            y: 360 - TILE_SIZE,
        });
        menu.onMouseMove(640 + TILE_SIZE, 360 - TILE_SIZE);
        const hoveredContext = createCanvasContextRecorder();
        menu.render(hoveredContext.ctx, 616, 336, true);
        assert.ok(hoveredContext.textCalls.some((call) => call.text === 'Attack'));
        assert.ok(hoveredContext.textCalls.some((call) => call.text === 'No attackable enemy'));
    } finally {
        i18n.setLanguage(previousLanguage);
    }
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
