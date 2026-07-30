import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getBountyHuntDirectionKey,
    getBountyHuntLayout,
    type BountyHuntLayout,
} from '../../src/data/BountyHuntPlacement';
import { getBountyOffers } from '../../src/data/BountyContractData';
import { findPath, manhattan, type TilePoint } from '../../src/field/FieldPathing';
import { WorldMap } from '../../src/map/WorldMap';

const TEST_CYCLES = [0, 1, 2, 7, 31] as const;
const TEST_PROGRESSION_COUNTS = [0, 20] as const;

test('bounty hunt layouts are deterministic and reachable for every town and offer', () => {
    for (const realm of ['mortal', 'master'] as const) {
        const worldMap = new WorldMap(realm);
        for (const town of worldMap.getTowns()) {
            const origin = worldMap.getTownExitTile(town);
            for (const cycle of TEST_CYCLES) {
                for (const completedQuestCount of TEST_PROGRESSION_COUNTS) {
                    const offers = getBountyOffers(town.id, cycle, completedQuestCount);
                    assert.equal(offers.length, 3, `${realm}/${town.id}/${cycle} offer count`);

                    for (const contract of offers) {
                        const layout = getBountyHuntLayout(contract, worldMap);
                        assert.ok(layout, `${realm}/${contract.id} should have a hunt layout`);
                        assert.deepEqual(
                            getBountyHuntLayout(contract, worldMap),
                            layout,
                            `${realm}/${contract.id} should be deterministic`,
                        );
                        assert.equal(layout.contractId, contract.id);
                        assert.equal(
                            layout.directionKey,
                            getBountyHuntDirectionKey(contract.id),
                            `${contract.id} notice direction should match its layout`,
                        );
                        assertLayoutIdentity(layout);
                        assertLayoutTiles(worldMap, origin, layout);
                        assert.equal(
                            matchesDirection(origin, layout.lastSeenArea.center, layout.directionKey),
                            true,
                            `${contract.id} notice direction should point toward its search area`,
                        );
                    }
                }
            }
        }
    }
});

test('cached bounty hunt layouts are returned as defensive copies', () => {
    const worldMap = new WorldMap('mortal');
    const contract = getBountyOffers('central_castle', 0, 0)[0];
    const first = getBountyHuntLayout(contract, worldMap);
    assert.ok(first);
    const originalX = first.clues[0].tile.x;
    first.clues[0].tile.x += 10_000;

    const repeat = getBountyHuntLayout(contract, worldMap);
    assert.ok(repeat);
    assert.equal(repeat.clues[0].tile.x, originalX);
});

test('cached bounty hunt layouts do not leak across WorldMap realm changes', () => {
    const worldMap = new WorldMap('mortal');
    const mortalContract = getBountyOffers('central_castle', 0, 0)[0];
    const mortalLayout = getBountyHuntLayout(mortalContract, worldMap);
    assert.ok(mortalLayout);

    worldMap.setRealm('master');
    assert.equal(
        worldMap.getTowns().some((town) => town.id === mortalContract.originTownId),
        false,
    );
    assert.equal(getBountyHuntLayout(mortalContract, worldMap), null);

    const masterContract = getBountyOffers('master_sanctum', 0, 0)[0];
    assert.ok(getBountyHuntLayout(masterContract, worldMap));

    worldMap.setRealm('mortal');
    assert.equal(getBountyHuntLayout(masterContract, worldMap), null);
    assert.deepEqual(getBountyHuntLayout(mortalContract, worldMap), mortalLayout);
});

function assertLayoutIdentity(layout: BountyHuntLayout): void {
    assert.equal(layout.lastSeenArea.id, `${layout.contractId}:last-seen`);
    assert.equal(layout.clues.length, 2);
    assert.deepEqual(layout.clues.map((clue) => clue.index), [0, 1]);
    assert.deepEqual(
        layout.clues.map((clue) => clue.id),
        [`${layout.contractId}:clue:0`, `${layout.contractId}:clue:1`],
    );
    assert.equal(
        new Set(layout.clues.map((clue) => clue.kind)).size,
        2,
        `${layout.contractId} should use two different clue kinds`,
    );
    assert.equal(layout.lair.id, `${layout.contractId}:lair`);

    const tileKeys = [
        layout.lastSeenArea.center,
        layout.clues[0].tile,
        layout.clues[1].tile,
        layout.lair.tile,
    ].map(tileKey);
    assert.equal(new Set(tileKeys).size, tileKeys.length, `${layout.contractId} tiles must be unique`);
    assert.ok(
        manhattan(layout.lastSeenArea.center, layout.clues[0].tile) <= layout.lastSeenArea.radius,
        `${layout.contractId} first clue should be inside the search area`,
    );
    assert.ok(
        manhattan(layout.lastSeenArea.center, layout.clues[1].tile) <= layout.lastSeenArea.radius,
        `${layout.contractId} second clue should be inside the search area`,
    );
}

function assertLayoutTiles(worldMap: WorldMap, origin: TilePoint, layout: BountyHuntLayout): void {
    const tiles = [
        layout.lastSeenArea.center,
        layout.clues[0].tile,
        layout.clues[1].tile,
        layout.lair.tile,
    ];
    for (const tile of tiles) {
        assert.equal(worldMap.isWalkable(tile.x, tile.y), true, `${layout.contractId} ${tileKey(tile)} walkable`);
        assert.equal(worldMap.getTownAtTile(tile.x, tile.y), null, `${layout.contractId} ${tileKey(tile)} outside town`);
        assert.equal(worldMap.getTempleAtTile(tile.x, tile.y), null, `${layout.contractId} ${tileKey(tile)} outside temple`);
        assert.equal(worldMap.getDungeonAtTile(tile.x, tile.y), null, `${layout.contractId} ${tileKey(tile)} outside dungeon`);

        const path = findPath(
            origin,
            tile,
            (query) => worldMap.isWalkable(query.x, query.y),
            { maxNodes: 30_000, maxDistance: 72 },
        );
        assert.ok(path.length > 0, `${layout.contractId} ${tileKey(tile)} should be reachable from town exit`);
        assert.ok(path.length <= 72, `${layout.contractId} ${tileKey(tile)} should stay within hunt range`);
    }

    const centerPath = findPath(
        origin,
        layout.lastSeenArea.center,
        (query) => worldMap.isWalkable(query.x, query.y),
        { maxNodes: 30_000, maxDistance: 72 },
    );
    assert.ok(centerPath.length >= 16, `${layout.contractId} search area should be away from its town`);
}

function tileKey(tile: TilePoint): string {
    return `${tile.x},${tile.y}`;
}

function matchesDirection(
    origin: TilePoint,
    tile: TilePoint,
    direction: BountyHuntLayout['directionKey'],
): boolean {
    const dx = tile.x - origin.x;
    const dy = tile.y - origin.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    switch (direction) {
        case 'n': return dy < 0 && absX * 2 <= absY * 3;
        case 'ne': return dx > 0 && dy < 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
        case 'e': return dx > 0 && absY * 2 <= absX * 3;
        case 'se': return dx > 0 && dy > 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
        case 's': return dy > 0 && absX * 2 <= absY * 3;
        case 'sw': return dx < 0 && dy > 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
        case 'w': return dx < 0 && absY * 2 <= absX * 3;
        case 'nw': return dx < 0 && dy < 0 && Math.min(absX, absY) * 3 >= Math.max(absX, absY);
    }
}
