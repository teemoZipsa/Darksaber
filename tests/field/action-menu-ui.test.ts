import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionMenuUI, type ActionMenuSlotState } from '../../src/ui/ActionMenuUI';
import { FieldMagicMenu, type FieldMagicSlot } from '../../src/ui/FieldMagicMenu';
import { ACTION_ICON_CELLS } from '../../src/ui/DarksaberIconRegistry';
import { getSkill } from '../../src/data/SkillDB';
import { TILE_SIZE } from '../../src/map/Chunk';

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
