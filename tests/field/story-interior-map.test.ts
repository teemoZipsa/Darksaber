import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoryInteriorLayout, getStoryInteriorTileAt, STORY_INTERIOR_LAYOUTS } from '../../src/data/StoryInteriorData';
import { TileType } from '../../src/map/Tile';
import { StoryInteriorMap } from '../../src/map/StoryInteriorMap';

test('solo interior layouts expose walkable entry, player, guard, and boss tiles', () => {
    assert.ok(STORY_INTERIOR_LAYOUTS.length > 0);
    for (const layout of STORY_INTERIOR_LAYOUTS) {
        assert.equal(getStoryInteriorTileAt(layout, 0, 0), TileType.WALL);
        assert.equal(getStoryInteriorTileAt(layout, layout.entryTile.x, layout.entryTile.y), TileType.DUNGEON_ENTRANCE);
        assert.notEqual(getStoryInteriorTileAt(layout, layout.playerStart.x, layout.playerStart.y), TileType.WALL);
        assert.notEqual(getStoryInteriorTileAt(layout, layout.bossTile.x, layout.bossTile.y), TileType.WALL);
        assert.ok(layout.rooms.some((room) => room.id === 'entry'));
        assert.ok(layout.rooms.some((room) => room.id === 'bossRoom'));
        assert.ok(layout.props.some((prop) => prop.kind === 'sealedDoor'));
        assert.ok(layout.props.some((prop) => prop.kind === 'bossSeal'));
        for (const tile of layout.guardTiles) {
            assert.notEqual(getStoryInteriorTileAt(layout, tile.x, tile.y), TileType.WALL);
        }
    }
});

test('story interior map renders fixed Burgos bounds and localized display name', () => {
    const layout = getStoryInteriorLayout('burgos_castle');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: layout.width, height: layout.height });
    assert.equal(map.getDisplayName(), '부르고스성 내부');
    assert.equal(map.getMapLandmarks().length, 0);
    assert.equal(map.getDungeons().length, 0);
    assert.equal(map.isWalkable(layout.playerStart.x, layout.playerStart.y), true);
    assert.equal(map.isWalkable(-1, layout.playerStart.y), false);
});
