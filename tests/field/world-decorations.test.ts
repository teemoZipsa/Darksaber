import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldMap, type WorldMapDecoration } from '../../src/map/WorldMap';
import { TutorialTrainingMap } from '../../src/map/TutorialTrainingMap';
import { TileType, TILE_PROPERTIES } from '../../src/map/Tile';
import { CHUNK_SIZE, TILE_SIZE } from '../../src/map/Chunk';

class OffscreenCanvasStub {
    public constructor(public width: number, public height: number) {}
    public getContext(): OffscreenCanvasRenderingContext2D {
        return {} as OffscreenCanvasRenderingContext2D;
    }
}

(globalThis as unknown as { OffscreenCanvas: typeof OffscreenCanvasStub }).OffscreenCanvas = OffscreenCanvasStub;

type TreeDecoration = Extract<WorldMapDecoration, { kind: 'tree' }>;
type BridgeDecoration = Extract<WorldMapDecoration, { kind: 'bridge' }>;
type PropDecoration = Extract<WorldMapDecoration, { kind: 'prop' }>;

function getAllDecorations(world: WorldMap): readonly WorldMapDecoration[] {
    const bounds = world.getBoundsTiles();
    return [...world.getDecorationsInTileRect(0, 0, bounds.width - 1, bounds.height - 1)]
        .sort((a, b) => a.anchorTile.y - b.anchorTile.y || a.anchorTile.x - b.anchorTile.x || a.sprite.localeCompare(b.sprite));
}

function decorationSignature(decoration: WorldMapDecoration): string {
    const coveredTiles = decoration.kind === 'tree'
        ? decoration.trunkTiles
        : decoration.kind === 'bridge'
            ? decoration.passableTiles
            : decoration.blockedTiles;
    const covered = coveredTiles.map((tile) => `${tile.x},${tile.y}`).join('|');
    return `${decoration.kind}:${decoration.sprite}@${decoration.anchorTile.x},${decoration.anchorTile.y}:${covered}`;
}

function isTreeDecoration(decoration: WorldMapDecoration): decoration is TreeDecoration {
    return decoration.kind === 'tree';
}

function isBridgeDecoration(decoration: WorldMapDecoration): decoration is BridgeDecoration {
    return decoration.kind === 'bridge';
}

function isPropDecoration(decoration: WorldMapDecoration): decoration is PropDecoration {
    return decoration.kind === 'prop';
}

test('world map large decorations are deterministic and sparse', () => {
    const first = new WorldMap();
    const second = new WorldMap();
    const firstDecorations = getAllDecorations(first);
    const secondDecorations = getAllDecorations(second);

    assert.ok(firstDecorations.length > 0);
    assert.ok(firstDecorations.length < 300);
    assert.deepEqual(firstDecorations.map(decorationSignature), secondDecorations.map(decorationSignature));
});

test('ground details densely and deterministically fill walkable biome tiles without blocking movement', () => {
    const first = new WorldMap();
    const second = new WorldMap();
    const sampledChunks = [
        { x: 37, y: 42 },
        { x: 39, y: 38 },
        { x: 31, y: 34 },
        { x: 18, y: 20 },
        { x: 68, y: 12 },
        { x: 57, y: 31 },
    ];

    let total = 0;
    for (const chunk of sampledChunks) {
        const firstDetails = first.getGroundDetailsForChunk(chunk.x, chunk.y);
        const secondDetails = second.getGroundDetailsForChunk(chunk.x, chunk.y);
        assert.deepEqual(firstDetails, secondDetails);
        total += firstDetails.length;
        for (const detail of firstDetails) {
            const tile = first.getTileAt(detail.tile.x, detail.tile.y);
            assert.ok([
                TileType.GRASS,
                TileType.FOREST,
                TileType.STONE,
                TileType.SAND,
                TileType.SNOW,
                TileType.POISON_SWAMP,
            ].includes(tile));
            assert.equal(first.isDecorationBlocked(detail.tile.x, detail.tile.y), false);
            assert.equal(first.isWalkable(detail.tile.x, detail.tile.y), true);
        }
    }

    assert.ok(total >= 40, `expected dense ground detail coverage, received ${total}`);
});

test('ambient roadside sites are deterministic, visible from routes, and keep paths open', () => {
    const first = new WorldMap();
    const second = new WorldMap();
    const routeChunks = new Map<string, { x: number; y: number }>();
    const segments = [
        [{ x: 16, y: 11 }, { x: 37, y: 44 }],
        [{ x: 10, y: 52 }, { x: 37, y: 44 }],
        [{ x: 37, y: 44 }, { x: 41, y: 80 }],
    ] as const;
    for (const [start, end] of segments) {
        const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        for (let step = 0; step <= steps; step++) {
            const chunk = {
                x: Math.round(start.x + (end.x - start.x) * step / steps),
                y: Math.round(start.y + (end.y - start.y) * step / steps),
            };
            routeChunks.set(`${chunk.x},${chunk.y}`, chunk);
        }
    }

    const sites = [...routeChunks.values()].flatMap((chunk) => first.getAmbientSitesForChunk(chunk.x, chunk.y));
    const repeated = [...routeChunks.values()].flatMap((chunk) => second.getAmbientSitesForChunk(chunk.x, chunk.y));
    assert.deepEqual(sites, repeated);
    assert.ok(sites.length >= 4, `expected roadside discoveries, received ${sites.length}`);

    for (const site of sites) {
        assert.equal(first.getAmbientSiteById(site.id)?.id, site.id);
        assert.deepEqual(first.getAmbientSitesNearTile(site.anchorTile, 0).map((candidate) => candidate.id), [site.id]);
        assert.equal(first.isAmbientSiteInspected(site.id), false);
        first.markAmbientSiteInspected(site.id);
        assert.equal(first.isAmbientSiteInspected(site.id), true);
        assert.notEqual(first.getTileAt(site.anchorTile.x, site.anchorTile.y), TileType.ROAD);
        assert.equal(first.isDecorationBlocked(site.anchorTile.x, site.anchorTile.y), false);
        assert.equal(first.isWalkable(site.anchorTile.x, site.anchorTile.y), true);
        let roadVisible = false;
        for (let dy = -7; dy <= 7 && !roadVisible; dy++) {
            for (let dx = -7; dx <= 7; dx++) {
                if (first.getTileAt(site.anchorTile.x + dx, site.anchorTile.y + dy) === TileType.ROAD) {
                    roadVisible = true;
                    break;
                }
            }
        }
        assert.equal(roadVisible, true);
    }
});

test('world streaming evicts decoration detail and ambient caches after long travel', () => {
    const world = new WorldMap();
    for (let step = 0; step < 24; step++) {
        const chunkX = 8 + step * 2;
        const chunkY = 10 + step * 2;
        world.getDecorationsInTileRect(
            chunkX * CHUNK_SIZE,
            chunkY * CHUNK_SIZE,
            (chunkX + 1) * CHUNK_SIZE - 1,
            (chunkY + 1) * CHUNK_SIZE - 1
        );
        world.getGroundDetailsForChunk(chunkX, chunkY);
        world.getAmbientSitesForChunk(chunkX, chunkY);
        world.updateLoadedChunks(
            (chunkX + 0.5) * CHUNK_SIZE * TILE_SIZE,
            (chunkY + 0.5) * CHUNK_SIZE * TILE_SIZE,
            CHUNK_SIZE * TILE_SIZE,
            CHUNK_SIZE * TILE_SIZE
        );
    }

    const counts = world.getStreamingCacheCounts();
    assert.ok(counts.chunks <= 16, `chunk cache grew to ${counts.chunks}`);
    assert.ok(counts.decorations <= counts.chunks, `decoration cache grew to ${counts.decorations}`);
    assert.ok(counts.groundDetails <= counts.chunks, `ground detail cache grew to ${counts.groundDetails}`);
    assert.ok(counts.ambientSites <= counts.chunks, `ambient site cache grew to ${counts.ambientSites}`);
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

test('fallen logs stay off routes and landmarks while only their trunk footprint blocks movement', () => {
    const world = new WorldMap();
    const props = getAllDecorations(world).filter(isPropDecoration);

    assert.ok(props.length > 0);

    for (const prop of props) {
        assert.equal(prop.sprite, 'fallenLog');
        assert.ok([TileType.GRASS, TileType.FOREST].includes(world.getTileAt(prop.anchorTile.x, prop.anchorTile.y)));

        for (let y = prop.bounds.minY; y <= prop.bounds.maxY; y++) {
            for (let x = prop.bounds.minX; x <= prop.bounds.maxX; x++) {
                assert.notEqual(world.getTileAt(x, y), TileType.ROAD);
                assert.equal(world.getTownAtTile(x, y), null);
                assert.equal(world.getTempleAtTile(x, y), null);
                assert.equal(world.getDungeonAtTile(x, y), null);
            }
        }

        for (const tile of prop.blockedTiles) {
            assert.ok([TileType.GRASS, TileType.FOREST].includes(world.getTileAt(tile.x, tile.y)));
            assert.equal(world.isDecorationBlocked(tile.x, tile.y), true);
            assert.equal(world.isWalkable(tile.x, tile.y), false);
        }

        const passableTile = (() => {
            for (let y = prop.bounds.minY; y <= prop.bounds.maxY; y++) {
                for (let x = prop.bounds.minX; x <= prop.bounds.maxX; x++) {
                    if (prop.blockedTiles.some((tile) => tile.x === x && tile.y === y)) continue;
                    if (world.isWalkable(x, y)) return { x, y };
                }
            }
            return null;
        })();
        assert.ok(passableTile);
        assert.equal(world.isDecorationBlocked(passableTile.x, passableTile.y), false);
    }
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
