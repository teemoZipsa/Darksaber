import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerData } from '../../src/data/PlayerData';
import { getBountyOffers } from '../../src/data/BountyContractData';
import { getBountyHuntLayout } from '../../src/data/BountyHuntPlacement';
import { Player } from '../../src/entity/Player';
import type { FieldActor, FieldEnemy } from '../../src/field/FieldTypes';
import { WorldMap } from '../../src/map/WorldMap';
import { WorldRaidSession } from '../../src/engine/world/WorldRaidSession';
import {
    WorldStoryScenarioController,
    type WorldStoryScenarioContext,
} from '../../src/engine/world/WorldStoryScenarioController';

test('local bounty hunt reveals one clue at a time and spawns one elite after exactly two clues', () => {
    const worldMap = new WorldMap();
    const playerData = new PlayerData();
    const contract = getBountyOffers('central_castle', 0, 0)[0];
    playerData.activeBountyContractId = contract.id;
    const raidSession = new WorldRaidSession('central_castle');
    raidSession.beginRaidFromTown('central_castle');
    const player = new Player(0, 0);
    const actor = { id: 'hero', entity: player } as FieldActor;
    let enemies: FieldEnemy[] = [];
    const logs: string[] = [];

    const controller = new WorldStoryScenarioController({
        playerData,
        raidSession,
        getWorldMap: () => worldMap,
        getFieldEnemies: () => enemies,
        setFieldEnemies: (next: FieldEnemy[]) => { enemies = next; },
        getControlledActor: () => actor,
        actorTile: () => ({ x: player.gridX, y: player.gridY }),
        isNetworkRaid: () => false,
        getNetworkRaidClient: () => null,
        applyMonsterSprite: () => undefined,
        log: (message: string) => logs.push(message),
    } as unknown as WorldStoryScenarioContext);

    controller.beginLocalBountyHunt();
    const layout = getBountyHuntLayout(contract, worldMap);
    assert.ok(layout);
    assert.equal(raidSession.bountyHunt?.cluesFound, 0);
    assert.ok(raidSession.bountyHunt?.searchArea);
    assert.equal(raidSession.bountyHunt?.nearbyClue, undefined);
    assert.equal(enemies.some((entry) => entry.enemy.bountyContractId === contract.id), false);
    assert.equal(worldMap.getBountyMarkers().length, 0);

    const first = layout.clues[0];
    player.setGridPosition(first.tile.x + 6, first.tile.y, true);
    assert.equal(controller.getInspectableFieldEventTiles(actor).has(`${first.tile.x},${first.tile.y}`), false);
    assert.equal(worldMap.getBountyMarkers()[0]?.id, first.id);

    player.setGridPosition(first.tile.x - 1, first.tile.y, true);
    assert.equal(controller.getInspectableFieldEventTiles(actor).has(`${first.tile.x},${first.tile.y}`), true);
    assert.equal(controller.playFieldEventAt(first.tile, actor), true);
    assert.equal(raidSession.bountyHunt?.cluesFound, 1);
    assert.equal(enemies.some((entry) => entry.enemy.bountyContractId === contract.id), false);
    assert.equal(controller.playFieldEventAt(first.tile, actor), false);

    const second = layout.clues[1];
    player.setGridPosition(0, 0, true);
    controller.getInspectableFieldEventTiles(actor);
    assert.equal(worldMap.getBountyMarkers().length, 0);
    assert.deepEqual(raidSession.bountyHunt?.searchArea?.center, second.tile);

    player.setGridPosition(second.tile.x + 6, second.tile.y, true);
    controller.getInspectableFieldEventTiles(actor);
    assert.equal(worldMap.getBountyMarkers()[0]?.id, second.id);

    player.setGridPosition(second.tile.x - 1, second.tile.y, true);
    assert.equal(controller.playFieldEventAt(second.tile, actor), true);
    assert.equal(raidSession.bountyHunt?.cluesFound, 2);
    assert.equal(raidSession.bountyHunt?.targetRevealed, true);
    assert.equal(worldMap.getBountyMarkers().length, 0);
    const targets = enemies.filter((entry) => entry.enemy.bountyContractId === contract.id);
    assert.equal(targets.length, 1);
    assert.deepEqual(targets[0].enemy.eliteAffixes, contract.affixIds);
    assert.equal(controller.playFieldEventAt(second.tile, actor), false);
    assert.equal(enemies.filter((entry) => entry.enemy.bountyContractId === contract.id).length, 1);
    assert.ok(logs.length >= 4);
});
