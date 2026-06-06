import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoryScenarioEventSequence } from '../../src/data/StoryScenarioEventData';
import { getStoryInteriorLayout, getStoryInteriorTileAt, STORY_INTERIOR_LAYOUTS } from '../../src/data/StoryInteriorData';
import { i18n } from '../../src/i18n/LanguageManager';
import { TileType } from '../../src/map/Tile';
import { StoryInteriorMap } from '../../src/map/StoryInteriorMap';

function hasWalkablePath(map: StoryInteriorMap, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    const bounds = map.getBoundsTiles();
    const queue = [{ ...from }];
    const seen = new Set<string>([`${from.x},${from.y}`]);
    for (let index = 0; index < queue.length; index++) {
        const tile = queue[index];
        if (tile.x === to.x && tile.y === to.y) return true;
        for (const next of [
            { x: tile.x + 1, y: tile.y },
            { x: tile.x - 1, y: tile.y },
            { x: tile.x, y: tile.y + 1 },
            { x: tile.x, y: tile.y - 1 },
        ]) {
            const key = `${next.x},${next.y}`;
            if (seen.has(key)) continue;
            if (next.x < 0 || next.y < 0 || next.x >= bounds.width || next.y >= bounds.height) continue;
            if (!map.isWalkable(next.x, next.y)) continue;
            seen.add(key);
            queue.push(next);
        }
    }
    return false;
}

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

test('Burgos interior uses a dedicated original-inspired route and event sequence', () => {
    const layout = getStoryInteriorLayout('burgos_castle');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 34, height: 19 });
    assert.ok(layout.rooms.some((room) => room.id === 'gatehouse'));
    assert.ok(layout.rooms.some((room) => room.id === 'westBarracks'));
    assert.ok(layout.rooms.some((room) => room.id === 'eastBarracks'));
    assert.ok(layout.rooms.some((room) => room.id === 'greatHall'));
    assert.ok(layout.rooms.some((room) => room.id === 'innerKeep'));
    assert.ok(layout.rooms.some((room) => room.id === 'throneRoom'));
    assert.equal(getStoryInteriorTileAt(layout, 17, 8), TileType.WALL);
    assert.equal(getStoryInteriorTileAt(layout, 17, 9), TileType.ROAD);
    assert.equal(getStoryInteriorTileAt(layout, layout.bossTile.x, layout.bossTile.y), TileType.STONE);
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    const sequence = getStoryScenarioEventSequence('burgos_castle');
    assert.ok(sequence);
    assert.equal(sequence.originalSources.sceneScript, 'Wlib/scene1.lsc');
    assert.equal(sequence.originalSources.globalScript, 'Glib/gscene1.lsc');
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/01.mrc'));
    assert.equal(sequence.entry.filter((step) => step.kind === 'dialogue').length, 7);
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(sequence.fieldEvents.length, 2);
    assert.ok(sequence.fieldEvents.some((event) => event.id === 'cain_son_relic'));
    assert.ok(sequence.fieldEvents.every((event) => event.originalSource === 'MAP/01set.arc:01.evt'));
    assert.ok(sequence.fieldEvents.every((event) => event.steps.length > 0));
    assert.ok(sequence.fieldEvents.every((event) => event.triggerTiles.length > 0));
});

test('Burgos interior exposes original-inspired doors, blocked paths, and event access', () => {
    const layout = getStoryInteriorLayout('burgos_castle');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.ok(layout.doors?.some((door) => door.id === 'throne_room_seal' && door.sealed));
    assert.ok(layout.doors?.every((door) => map.isWalkable(door.tile.x, door.tile.y)));
    assert.equal(layout.blockedPaths?.length, 12);
    for (const blocked of layout.blockedPaths ?? []) {
        assert.equal(map.isWalkable(blocked.tile.x, blocked.tile.y), false, blocked.id);
    }

    const sequence = getStoryScenarioEventSequence('burgos_castle');
    assert.ok(sequence);
    const eventTiles = sequence.fieldEvents.flatMap((event) => event.triggerTiles);
    assert.ok(eventTiles.length > 0);
    for (const tile of eventTiles) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
});

test('Burgos scenario event keys exist in both languages without snapshotting full text', () => {
    const sequence = getStoryScenarioEventSequence('burgos_castle');
    assert.ok(sequence);

    const keys = new Set<string>();
    const collect = (step: (typeof sequence.entry)[number]) => {
        if ('labelKey' in step) keys.add(step.labelKey);
        if ('speakerNameKey' in step) keys.add(step.speakerNameKey);
        if ('textKey' in step) keys.add(step.textKey);
    };
    sequence.entry.forEach(collect);
    sequence.bossDefeat.forEach(collect);
    sequence.fieldEvents.forEach((event) => event.steps.forEach(collect));

    for (const key of keys) {
        assert.notEqual(i18n.strings.ko[key as keyof typeof i18n.strings.ko], undefined, `missing ko key ${key}`);
        assert.notEqual(i18n.strings.en[key as keyof typeof i18n.strings.en], undefined, `missing en key ${key}`);
    }
});
