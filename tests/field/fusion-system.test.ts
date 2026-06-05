import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { fuseActivePartyBranch, getFusionCandidates, hasActiveMasterCharacter } from '../../src/character/FusionSystem';
import { PartyManager } from '../../src/character/PartyManager';
import { getClassLine, isMasterClassLineId } from '../../src/data/ClassTree';
import { Enemy } from '../../src/entity/Enemy';
import { Player } from '../../src/entity/Player';
import { WorldTempleController } from '../../src/engine/world/WorldTempleController';
import { WorldRaidSession, type WorldPhase } from '../../src/engine/world/WorldRaidSession';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import { WorldMap } from '../../src/map/WorldMap';
import { TileType } from '../../src/map/Tile';
import { FusionTempleUI } from '../../src/ui/FusionTempleUI';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeFusionReady(id: string, classLineId: string): Character {
    const character = new Character(id, id, classLineId);
    character.currentTier = 7;
    character.level = character.levelCap();
    character.exp = character.expToNext;
    character.hasEmblem = true;
    character.stats.maxHp = 200;
    character.stats.hp = 200;
    character.stats.atk = 35;
    return character;
}

function createTempleHarness(options: { hostile?: boolean } = {}) {
    const world = new WorldMap('mortal');
    const temple = world.getPrimaryTempleTile();
    const party = new PartyManager();
    const character = new Character('hero', 'Hero', 'infantry');
    party.addToRoster(character);
    party.deployCharacter(character);
    const actor: FieldActor = {
        id: character.id,
        character,
        entity: new Player(temple.x, temple.y),
        path: [],
        queuedIntent: null,
    };
    let fieldEnemies: FieldEnemy[] = [];
    if (options.hostile) {
        const enemy = new Enemy('hostile', temple.x + 1, temple.y, 'Hostile', 1);
        enemy.isAggro = true;
        fieldEnemies = [{ enemy, home: { x: enemy.gridX, y: enemy.gridY }, path: [] }];
    }

    const ui = new FusionTempleUI();
    const raidSession = new WorldRaidSession('central_castle');
    let phase: WorldPhase = 'raid';
    const calls: string[] = [];
    const logs: string[] = [];
    const controller = new WorldTempleController({
        party,
        raidSession,
        fusionTempleUI: ui,
        getWorldMap: () => world,
        getControlledActor: () => actor,
        getFieldEnemies: () => fieldEnemies,
        isNetworkRaid: () => false,
        getPhase: () => phase,
        setPhase: (nextPhase) => { phase = nextPhase; },
        beginRaidFromCurrentHub: (realm) => calls.push(`begin:${realm}`),
        closeFieldOverlays: () => calls.push('closeFieldOverlays'),
        clearFieldTurnState: () => calls.push('clearFieldTurnState'),
        placePartyNear: (tile) => {
            actor.entity.setGridPosition(tile.x, tile.y);
            calls.push('placePartyNear');
        },
        setPlayer: () => calls.push('setPlayer'),
        setFieldEnemies: (enemies) => { fieldEnemies = enemies; },
        clearWorldLoot: () => calls.push('clearWorldLoot'),
        selectActor: (actorId) => calls.push(`select:${actorId ?? 'none'}`),
        log: (message) => logs.push(message),
    });
    return { controller, ui, calls, logs };
}

test('max base tier level unlocks the fusion emblem', () => {
    const character = new Character('fighter', 'Fighter', 'infantry');
    character.currentTier = 7;
    character.level = character.levelCap() - 1;
    character.expToNext = 1;

    const result = character.gainExp(1);

    assert.equal(character.level, character.levelCap());
    assert.equal(character.hasEmblem, true);
    assert.equal(result.emblemUnlocked, true);
    assert.equal(character.isFusionReady(), true);
});

test('active party fusion consumes three ready base classes into one T8 master class', () => {
    const party = new PartyManager();
    const infantry = makeFusionReady('infantry', 'infantry');
    const cavalry = makeFusionReady('cavalry', 'cavalry');
    const flying = makeFusionReady('flying', 'flying');
    for (const character of [infantry, cavalry, flying]) {
        party.addToRoster(character);
        assert.equal(party.deployCharacter(character), true);
    }
    party.switchTo(1);

    const candidates = getFusionCandidates(party);
    const battle = candidates.find((candidate) => candidate.branch === 'battle');
    assert.equal(battle?.canFuse, true);

    const result = fuseActivePartyBranch(party, 'battle');

    assert.equal(result.success, true);
    assert.equal(party.getCharacters().length, 1);
    assert.equal(party.getRoster().length, 1);
    assert.equal(party.getActive()?.id, 'cavalry');
    assert.equal(party.getActive()?.classLineId, 'master_battle');
    assert.equal(party.getActive()?.currentTier, 8);
    assert.equal(hasActiveMasterCharacter(party), true);
    assert.equal(isMasterClassLineId(party.getActive()?.classLineId ?? ''), true);
    assert.ok(getClassLine('master_battle'));
});

test('master class line promotes through T8 to T10', () => {
    const character = makeFusionReady('infantry', 'infantry');
    const absorbed = [
        makeFusionReady('cavalry', 'cavalry'),
        makeFusionReady('flying', 'flying'),
    ];
    assert.equal(character.fuseToMaster('battle', absorbed), true);

    character.level = Character.MAX_LEVEL;
    character.expToNext = 1;
    character.gainExp(1);
    assert.equal(character.currentTier, 9);

    character.level = Character.MAX_LEVEL;
    character.expToNext = 1;
    character.gainExp(1);
    assert.equal(character.currentTier, 10);
});

test('world map exposes mortal and master temple entrances', () => {
    const world = new WorldMap('mortal');
    const mortalTemple = world.getPrimaryTempleTile();
    assert.equal(world.getTileAt(mortalTemple.x, mortalTemple.y), TileType.DUNGEON_ENTRANCE);

    world.setRealm('master');
    const masterTemple = world.getPrimaryTempleTile();
    assert.equal(world.getRealm(), 'master');
    assert.equal(world.getTileAt(masterTemple.x, masterTemple.y), TileType.DUNGEON_ENTRANCE);
    assert.equal(world.getDisplayName(), '마스터 월드');
});

test('world temple controller opens the fusion temple when the party reaches a clear temple', () => {
    const { controller, ui, calls, logs } = createTempleHarness();

    controller.checkArrival();

    assert.equal(ui.isVisible(), true);
    assert.deepEqual(calls, ['closeFieldOverlays', 'clearFieldTurnState']);
    assert.equal(logs.at(-1), '융합의 신전에 들어섰습니다.');
});

test('world temple controller blocks temple entry while hostile enemies are active', () => {
    const { controller, ui, calls, logs } = createTempleHarness({ hostile: true });

    controller.checkArrival();
    controller.checkArrival();

    assert.equal(ui.isVisible(), false);
    assert.deepEqual(calls, []);
    assert.deepEqual(logs, ['주변의 적을 정리해야 신전에 들어갈 수 있습니다.']);
});
