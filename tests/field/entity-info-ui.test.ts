import test from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    ENTITY_INFO_COMPACT_HEIGHT,
    ENTITY_INFO_COMPACT_WIDTH,
    ENTITY_INFO_DESKTOP_HEIGHT,
    ENTITY_INFO_DESKTOP_WIDTH,
    EntityInfoUI,
    getEntityInfoHeaderLines,
    type EntityDisplayInfo,
} from '../../src/ui/EntityInfoUI';

function createInfo(overrides: Partial<EntityDisplayInfo> = {}): EntityDisplayInfo {
    return {
        name: '스켈레톤 궁수',
        className: '원거리형 몬스터',
        level: 2,
        hp: 30,
        maxHp: 30,
        mp: 0,
        maxMp: 0,
        actionGauge: 50,
        atk: 5,
        def: 2,
        magAtk: 1,
        magDef: 1,
        spriteColor: '#d4c4cc',
        ...overrides,
    };
}

function createMockCanvasContext(): CanvasRenderingContext2D {
    const state: Record<string, unknown> = {
        imageSmoothingEnabled: true,
        measureText: (text: string) => ({ width: String(text).length * 6 }),
        createLinearGradient: () => ({ addColorStop: () => undefined }),
    };
    return new Proxy(state, {
        get(target, property) {
            if (typeof property === 'string' && property in target) return target[property];
            return () => undefined;
        },
        set(target, property, value) {
            if (typeof property === 'string') target[property] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

test('entity info header uses monster name instead of role label', () => {
    const info = createInfo();

    const previousLang = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.deepEqual(getEntityInfoHeaderLines(info), {
            title: '스켈레톤 궁수',
            subtitle: '원거리형 몬스터 · 레벨 2',
        });

        i18n.lang = 'en';
        assert.deepEqual(getEntityInfoHeaderLines({ ...info, className: 'Ranged monster' }), {
            title: '스켈레톤 궁수',
            subtitle: 'Ranged monster · Level 2',
        });
    } finally {
        i18n.lang = previousLang;
    }
});

test('entity info hit test distinguishes close, consumed panel body, and world miss', () => {
    const ui = new EntityInfoUI();
    ui.setPosition(20, 30);

    assert.deepEqual(ui.getBounds(), {
        x: 20,
        y: 30,
        width: ENTITY_INFO_DESKTOP_WIDTH,
        height: ENTITY_INFO_DESKTOP_HEIGHT,
    });
    assert.equal(ui.hitTest(20 + ENTITY_INFO_DESKTOP_WIDTH - 20, 44), 'close');
    assert.equal(ui.hitTest(40, 80), 'consume');
    assert.equal(ui.hitTest(500, 500), 'miss');
    assert.equal(ui.onClick(40, 80), false);
    assert.equal(ui.onClick(20 + ENTITY_INFO_DESKTOP_WIDTH - 20, 44), true);
});

test('compact render updates the visible bounds and disabled panels cannot intercept input', () => {
    const ui = new EntityInfoUI();
    const ctx = createMockCanvasContext();
    ui.setPosition(12, 160);
    ui.renderCompact(ctx, createInfo());

    assert.deepEqual(ui.getBounds(), {
        x: 12,
        y: 160,
        width: ENTITY_INFO_COMPACT_WIDTH,
        height: ENTITY_INFO_COMPACT_HEIGHT,
    });
    assert.equal(ui.hitTest(12 + ENTITY_INFO_COMPACT_WIDTH - 13, 173), 'close');
    assert.equal(ui.hitTest(24, 248), 'consume');
    assert.equal(ui.hitTest(24, 264), 'miss');

    ui.setInteractive(false);
    assert.equal(ui.hitTest(24, 248), 'miss');
    assert.equal(ui.onClick(12 + ENTITY_INFO_COMPACT_WIDTH - 13, 173), false);

    ui.render(ctx, createInfo());
    assert.deepEqual(ui.getBounds(), {
        x: 12,
        y: 160,
        width: ENTITY_INFO_DESKTOP_WIDTH,
        height: ENTITY_INFO_DESKTOP_HEIGHT,
    });
    assert.equal(ui.hitTest(24, 400), 'consume');

    ui.renderCompact(ctx, createInfo(), 121);
    assert.deepEqual(ui.getBounds(), {
        x: 12,
        y: 160,
        width: 121,
        height: ENTITY_INFO_COMPACT_HEIGHT,
    });
});
