import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldMap, type WorldMapDecoration } from '../../src/map/WorldMap';
import { TutorialTrainingMap } from '../../src/map/TutorialTrainingMap';
import { TileType, TILE_PROPERTIES } from '../../src/map/Tile';

type TreeDecoration = Extract<WorldMapDecoration, { kind: 'tree' }>;
type BridgeDecoration = Extract<WorldMapDecoration, { kind: 'bridge' }>;

function getAllDecorations(world: WorldMap): readonly WorldMapDecoration[] {
    const bounds = world.getBoundsTiles();
    return [...world.getDecorationsInTileRect(0, 0, bounds.width - 1, bounds.height - 1)]
        .sort((a, b) => a.anchorTile.y - b.anchorTile.y || a.anchorTile.x - b.anchorTile.x || a.sprite.localeCompare(b.sprite));
}

function decorationSignature(decoration: WorldMapDecoration): string {
    const coveredTiles = decoration.kind === 'tree' ? decoration.trunkTiles : decoration.passableTiles;
    const covered = coveredTiles.map((tile) => `${tile.x},${tile.y}`).join('|');
    return `${decoration.kind}:${decoration.sprite}@${decoration.anchorTile.x},${decoration.anchorTile.y}:${covered}`;
}

function isTreeDecoration(decoration: WorldMapDecoration): decoration is TreeDecoration {
    return decoration.kind === 'tree';
}

function isBridgeDecoration(decoration: WorldMapDecoration): decoration is BridgeDecoration {
    return decoration.kind === 'bridge';
}

test('world map tree decorations are deterministic and sparse', () => {
    const first = new WorldMap();
    const second = new WorldMap();
    const firstDecorations = getAllDecorations(first);
    const secondDecorations = getAllDecorations(second);

    assert.ok(firstDecorations.length > 0);
    assert.ok(firstDecorations.length < 140);
    assert.deepEqual(firstDecorations.map(decorationSignature), secondDecorations.map(decorationSignature));
});

test('tree decorations stay on eligible terrain by sprite family', () => {
    const world = new WorldMap();
    const decorations = getAllDecorations(world).filter(isTreeDecoration);
    const normalTrees = decorations.filter((decoration) => decoration.sprite !== 'scaryTree');
    const scaryTrees = decorations.filter((decoration) => decoration.sprite === 'scaryTree');

    assert.ok(normalTrees.length > 0);
    assert.ok(scaryTrees.length > 0);

    for (const decoration of normalTrees) {
        assert.ok([TileType.GRASS, TileType.FOREST].includes(world.getTileAt(decoration.anchorTile.x, decoration.anchorTile.y)));
        for (const trunk of decoration.trunkTiles) {
            assert.ok([TileType.GRASS, TileType.FOREST].includes(world.getTileAt(trunk.x, trunk.y)));
        }
    }

    for (const decoration of scaryTrees) {
        assert.equal(world.getTileAt(decoration.anchorTile.x, decoration.anchorTile.y), TileType.POISON_SWAMP);
        for (const trunk of decoration.trunkTiles) {
            assert.equal(world.getTileAt(trunk.x, trunk.y), TileType.POISON_SWAMP);
        }
    }
});

test('tree trunks block movement while canopy-only tiles remain walkable', () => {
    const world = new WorldMap();
    const decoration = getAllDecorations(world).filter(isTreeDecoration).find((candidate) => candidate.sprite !== 'scaryTree');
    assert.ok(decoration);

    const trunk = decoration.trunkTiles[0];
    assert.equal(world.isDecorationBlocked(trunk.x, trunk.y), true);
    assert.equal(world.isWalkable(trunk.x, trunk.y), false);

    let canopyTile: { x: number; y: number } | null = null;
    for (let y = decoration.bounds.minY; y <= decoration.bounds.maxY && !canopyTile; y++) {
        for (let x = decoration.bounds.minX; x <= decoration.bounds.maxX; x++) {
            const isTrunk = decoration.trunkTiles.some((tile) => tile.x === x && tile.y === y);
            if (isTrunk || !TILE_PROPERTIES[world.getTileAt(x, y)]?.walkable) continue;
            if (!world.isDecorationBlocked(x, y) && world.isWalkable(x, y)) {
                canopyTile = { x, y };
                break;
            }
        }
    }

    assert.ok(canopyTile);
    assert.equal(world.isDecorationBlocked(canopyTile.x, canopyTile.y), false);
    assert.equal(world.isWalkable(canopyTile.x, canopyTile.y), true);
});

test('bridge decorations make road river crossings passable', () => {
    const world = new WorldMap();
    const bridges = getAllDecorations(world).filter(isBridgeDecoration);

    assert.ok(bridges.length > 0);

    for (const bridge of bridges) {
        assert.equal(world.getTileAt(bridge.anchorTile.x, bridge.anchorTile.y), TileType.ROAD);
        assert.equal(world.isDecorationBlocked(bridge.anchorTile.x, bridge.anchorTile.y), false);
        assert.equal(world.isWalkable(bridge.anchorTile.x, bridge.anchorTile.y), true);

        for (const tile of bridge.passableTiles) {
            assert.equal(world.isDecorationBlocked(tile.x, tile.y), false);
            assert.equal(world.isWalkable(tile.x, tile.y), true);
        }
    }
});

test('tutorial training map disables world decorations', () => {
    const map = new TutorialTrainingMap();
    const bounds = map.getBoundsTiles();

    assert.equal(map.getDecorationsInTileRect(0, 0, bounds.width - 1, bounds.height - 1).length, 0);
    assert.equal(map.isDecorationBlocked(map.getPlayerStartTile().x, map.getPlayerStartTile().y), false);
});
