import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveStats } from '../../src/combat/StatusEffects';
import { createBaseStats } from '../../src/data/Stats';
import { getItemDef } from '../../src/data/ItemDB';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { createPartyCompositionFromSave, createWorldJoinSaveState } from '../../server/WorldJoinSave';
import { buildWorldSessionJoinedPlayer } from '../../server/WorldSessionJoinBuilder';
import { getEffectiveServerActorStats } from '../../server/WorldSessionHelpers';

test('world join save composition keeps the selected character as the controllable leader', () => {
    const selected = authCharacter('selected-hero', 'Selected Hero');
    const save = createDefaultCharacterSave(selected);
    save.rosterSnapshot = {
        characters: [
            {
                id: 'companion-a',
                name: 'Companion A',
                classKey: 'cleric',
                tier: 1,
                level: 1,
                baseStats: createBaseStats({ spd: 90, mov: 50, actionLimit: 80, hitRate: 180 }),
            },
            {
                id: selected.id,
                name: selected.name,
                classKey: selected.classKey,
                tier: selected.tier,
                level: selected.level,
                baseStats: selected.baseStats,
            },
        ],
    };
    save.partySnapshot = { activeCharacterIds: ['companion-a'] };

    const composition = createPartyCompositionFromSave(selected, save);

    assert.equal(composition[0]?.id, selected.id);
    assert.equal(composition[1]?.id, 'companion-a');
});

test('world join save composition falls back to selected character when old roster data omits it', () => {
    const selected = authCharacter('selected-missing-roster', 'Missing Roster Hero');
    const save = createDefaultCharacterSave(selected);
    save.rosterSnapshot = {
        characters: [{
            id: 'companion-only',
            name: 'Companion Only',
            classKey: 'mage',
            tier: 1,
            level: 1,
            baseStats: createBaseStats({ spd: 90, mov: 50, actionLimit: 80, hitRate: 180 }),
        }],
    };
    save.partySnapshot = { activeCharacterIds: ['companion-only'] };

    const composition = createPartyCompositionFromSave(selected, save);

    assert.equal(composition[0]?.id, selected.id);
    assert.equal(composition[0]?.name, selected.name);
    assert.equal(composition[1]?.id, 'companion-only');
});

test('world join save composition restores a persisted injury alongside rest buffs', () => {
    const selected = authCharacter('injured-hero', 'Injured Hero');
    const save = createDefaultCharacterSave(selected);
    save.hubLocation.pendingRestMenuId = 'meat_plate';
    const roster = save.rosterSnapshot.characters;
    assert.ok(Array.isArray(roster));
    const savedCharacter = roster.find((entry) => (
        typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === selected.id
    ));
    assert.ok(savedCharacter && typeof savedCharacter === 'object');
    Object.assign(savedCharacter, { injured: true });

    const [snapshot] = createPartyCompositionFromSave(selected, save);

    assert.ok(snapshot);
    assert.equal(snapshot.statuses.some((status) => status.kind === 'attackUp'), true);
    assert.equal(snapshot.statuses.some((status) => status.kind === 'injury'), true);
    assert.equal(getEffectiveStats(snapshot.stats, snapshot.statuses).maxHp, Math.floor(snapshot.stats.maxHp * 0.9));
});

test('world join save state restores authoritative equipment, sockets, magic, rest, and carried weight', () => {
    const selected = authCharacter('prepared-hero', 'Prepared Hero');
    const save = createDefaultCharacterSave(selected);
    save.hubLocation.pendingRestMenuId = 'meat_plate';
    save.inventory.items = [{
        itemId: 'herb_cheap',
        gridX: 0,
        gridY: 0,
        quantity: 2,
        durability: 1,
    }];
    save.equipment = {
        weapon: {
            itemId: 'short_sword',
            gridX: 0,
            gridY: 0,
            quantity: 1,
            durability: 100,
            sockets: ['rune_el'],
        },
    };
    save.partySnapshot = { activeCharacterIds: [selected.id, 'prepared-companion'] };
    save.rosterSnapshot = {
        characters: [
            {
                id: selected.id,
                name: selected.name,
                classKey: selected.classKey,
                tier: selected.tier,
                level: selected.level,
                exp: 37,
                hasEmblem: true,
                baseStats: selected.baseStats,
                magicLoadout: ['inf_t1'],
                skillUpgradeLevels: { inf_t1: 3 },
            },
            {
                id: 'prepared-companion',
                name: 'Prepared Companion',
                classKey: 'cleric',
                tier: 1,
                level: 1,
                baseStats: createBaseStats(),
                equipment: {
                    body: {
                        itemId: 'magic_t1_body',
                        gridX: 0,
                        gridY: 0,
                        quantity: 1,
                        durability: 100,
                    },
                },
            },
        ],
    };

    const state = createWorldJoinSaveState(selected, save);
    const snapshot = state.partyComposition[0];
    const sword = getItemDef('short_sword')!;
    const rune = getItemDef('rune_el')!;
    const herb = getItemDef('herb_cheap')!;
    const companionBody = getItemDef('magic_t1_body')!;
    const expectedWeight = Math.round((sword.weight + rune.weight + companionBody.weight + herb.weight * 2) * 10) / 10;

    assert.ok(snapshot);
    assert.deepEqual(snapshot.magicLoadout, ['inf_t1']);
    assert.deepEqual(snapshot.skillUpgradeLevels, { inf_t1: 3 });
    assert.equal(snapshot.exp, 37);
    assert.equal(snapshot.hasEmblem, true);
    assert.equal(snapshot.statuses[0]?.kind, 'attackUp');
    assert.equal(snapshot.statuses[0]?.remainingSeconds, 300);
    assert.equal(state.equipmentStatBonuses[selected.id]?.atk, 4);
    assert.ok((state.equipmentStatBonuses['prepared-companion']?.def ?? 0) > 0);
    assert.equal(state.carriedWeight, expectedWeight);
    assert.equal(save.hubLocation.pendingRestMenuId, 'meat_plate');
    assert.equal(state.saveSnapshot.hubLocation.pendingRestMenuId, null);

    const joined = buildWorldSessionJoinedPlayer({
        message: {
            type: 'WORLD_JOIN',
            originHubId: 'central_castle',
            partyComposition: state.partyComposition,
            clientVersion: 'test',
            carriedWeight: state.carriedWeight,
        },
        context: {
            equipmentStatBonuses: state.equipmentStatBonuses,
            saveSnapshot: state.saveSnapshot,
        },
        playerId: 'p1',
        resumeToken: 'resume-1',
        originHubId: 'central_castle',
        spawnTile: { x: 10, y: 10 },
        raidModifier: { id: 'night_raid' },
        findNearbyWalkableTile: (tile) => tile,
    });
    const actor = joined.actors[0]!;
    assert.equal(actor.exp, 37);
    assert.equal(actor.hasEmblem, true);
    assert.deepEqual(actor.equipmentStatBonus, state.equipmentStatBonuses[selected.id]);
    assert.equal(
        getEffectiveServerActorStats(actor).atk,
        Math.floor((actor.stats.atk + 4) * 1.1),
    );
    assert.equal(joined.player.carriedWeight, expectedWeight);
});

function authCharacter(id: string, name: string): AuthCharacter {
    return {
        id,
        accountId: 'account-test',
        slotNo: 1,
        name,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}
