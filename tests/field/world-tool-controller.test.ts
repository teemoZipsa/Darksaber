import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import { getItemDef } from '../../src/data/ItemDB';
import { getActionApCost } from '../../src/field/FieldActionEconomy';
import type { FieldActor } from '../../src/field/FieldTypes';
import { GridInventory } from '../../src/inventory/GridInventory';
import { WorldToolController } from '../../src/engine/world/WorldToolController';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(): FieldActor {
    const character = new Character('hero', 'Hero', 'infantry');
    character.stats.hp = 40;
    character.stats.maxHp = 100;
    character.stats.mp = 10;
    character.stats.maxMp = 30;
    return {
        id: character.id,
        character,
        entity: new Player(0, 0),
        path: [],
        queuedIntent: null,
    };
}

function makeController(actor: FieldActor, inventory: GridInventory, ap: { value: number }, events: string[] = [], majorUsed: { value: boolean } = { value: false }): WorldToolController {
    return new WorldToolController(
        {
            getActivePartyTurnActor: () => actor,
            getRemainingActionPoints: () => ap.value,
            getInventoryItems: () => inventory.items,
            removeInventoryItem: (placed) => inventory.remove(placed),
            spendAp: (cost) => {
                if (ap.value < cost) return false;
                ap.value -= cost;
                return true;
            },
            isMajorActionUsed: () => majorUsed.value,
            markMajorActionUsed: () => {
                majorUsed.value = true;
                events.push('major');
            },
            reopenActionMenu: () => events.push('reopen'),
            resumeOrEndActiveTurn: () => events.push('resume'),
        },
        {
            log: (message) => events.push(message),
            spawnHeal: (_x, _y, amount) => events.push(`heal:${amount}`),
            spawnStatus: (_x, _y, text) => events.push(text),
            spawnHealEffect: () => events.push('heal-effect'),
        }
    );
}

test('combat tool use recovers, spends AP, and removes one item atomically', () => {
    const actor = makeActor();
    const inventory = new GridInventory(4, 4);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    inventory.autoPlace(herb);
    const toolApCost = getActionApCost('tool');
    const ap = { value: toolApCost };
    const events: string[] = [];
    const controller = makeController(actor, inventory, ap, events);

    assert.equal(controller.hasUsableCombatTool(actor), true);
    controller.useTool('herb_cheap');

    assert.equal(actor.character.stats.hp, 90);
    assert.equal(ap.value, 0);
    assert.equal(inventory.items.length, 0);
    assert.ok(events.includes('heal:50'));
    assert.ok(events.includes('major'));
    assert.ok(events.includes('resume'));
});

test('combat tool use marks the turn major action and blocks a second tool', () => {
    const actor = makeActor();
    const inventory = new GridInventory(4, 4);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    inventory.autoPlace(herb);
    inventory.autoPlace(herb);
    const ap = { value: getActionApCost('tool') * 2 };
    const events: string[] = [];
    const majorUsed = { value: false };
    const controller = makeController(actor, inventory, ap, events, majorUsed);

    controller.useTool('herb_cheap');
    controller.useTool('herb_cheap');

    assert.equal(majorUsed.value, true);
    assert.equal(ap.value, getActionApCost('tool'));
    assert.equal(inventory.items.length, 1);
    assert.ok(events.includes('이번 턴에는 공격/마법/도구를 이미 사용했습니다.'));
});

test('combat tool fails without AP and does not mutate HP or inventory', () => {
    const actor = makeActor();
    const inventory = new GridInventory(4, 4);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    inventory.autoPlace(herb);
    const toolApCost = getActionApCost('tool');
    const ap = { value: toolApCost - 1 };
    const controller = makeController(actor, inventory, ap);

    controller.useTool('herb_cheap');

    assert.equal(actor.character.stats.hp, 40);
    assert.equal(ap.value, toolApCost - 1);
    assert.equal(inventory.items.length, 1);
});

test('tool availability requires effective recovery and excludes repair kit', () => {
    const actor = makeActor();
    actor.character.stats.hp = actor.character.stats.maxHp;
    actor.character.stats.mp = actor.character.stats.maxMp;
    const inventory = new GridInventory(4, 4);
    const herb = getItemDef('herb_cheap');
    const repairKit = getItemDef('repair_kit');
    assert.ok(herb);
    assert.ok(repairKit);
    inventory.autoPlace(herb);
    inventory.autoPlace(repairKit);
    const controller = makeController(actor, inventory, { value: getActionApCost('tool') });

    assert.equal(controller.hasUsableCombatTool(actor), false);
});
