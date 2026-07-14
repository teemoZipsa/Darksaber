import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import { getItemDef } from '../../src/data/ItemDB';
import { getActionApCost } from '../../src/field/FieldActionEconomy';
import type { FieldActor } from '../../src/field/FieldTypes';
import { GridInventory } from '../../src/inventory/GridInventory';
import { WorldToolController } from '../../src/engine/world/WorldToolController';
import { i18n } from '../../src/i18n/LanguageManager';

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
    i18n.setLanguage('ko');
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
    assert.ok(events.includes('resume'));
    assert.ok(events.some((event) => /사용: HP \+50, MP \+0/.test(event)));
});

test('combat tool use logs the English item name in English mode', () => {
    const previousLanguage = i18n.lang;
    const actor = makeActor();
    const inventory = new GridInventory(4, 4);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    inventory.autoPlace(herb);
    const events: string[] = [];
    const controller = makeController(actor, inventory, { value: getActionApCost('tool') }, events);

    try {
        i18n.lang = 'en';
        controller.useTool(herb.id);
        assert.ok(events.some((event) => event.includes(herb.name)));
        assert.equal(events.some((event) => event.includes(herb.nameKr)), false);
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('combat tool can be used again while enough partial ATB and effective recovery remain', () => {
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

    assert.equal(majorUsed.value, false);
    assert.equal(actor.character.stats.hp, 100);
    assert.equal(ap.value, 0);
    assert.equal(inventory.items.length, 0);
    assert.equal(events.filter((event) => event.startsWith('heal:')).length, 2);
});

test('combat tool fails without AP and does not mutate HP or inventory', () => {
    i18n.setLanguage('ko');
    const actor = makeActor();
    const inventory = new GridInventory(4, 4);
    const herb = getItemDef('herb_cheap');
    assert.ok(herb);
    inventory.autoPlace(herb);
    const toolApCost = getActionApCost('tool');
    const ap = { value: toolApCost - 1 };
    const events: string[] = [];
    const controller = makeController(actor, inventory, ap, events);

    controller.useTool('herb_cheap');

    assert.equal(actor.character.stats.hp, 40);
    assert.equal(ap.value, toolApCost - 1);
    assert.equal(inventory.items.length, 1);
    assert.ok(events.includes('도구를 사용할 행동력이 부족합니다.'));
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
