import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionMenuUI, type ActionMenuSlotState } from '../../src/ui/ActionMenuUI';
import { FieldMagicMenu, type FieldMagicSlot } from '../../src/ui/FieldMagicMenu';
import { ACTION_ICON_CELLS } from '../../src/ui/DarksaberIconRegistry';
import { getSkill } from '../../src/data/SkillDB';
import { TILE_SIZE } from '../../src/map/Chunk';
import { AudioManager } from '../../src/engine/AudioManager';

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
