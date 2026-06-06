import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoryScenarioEventSequence, STORY_SCENARIO_EVENT_SEQUENCES } from '../../src/data/StoryScenarioEventData';
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
    assert.ok(sequence.fieldEvents.every((event) => event.markerLabelKey));
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

    map.setInspectMarkers(sequence.fieldEvents.map((event) => ({
        id: event.id,
        tile: event.triggerTiles[0],
        labelKey: event.markerLabelKey,
    })));
    assert.deepEqual(
        map.getInspectMarkers().map((marker) => ({ id: marker.id, tile: marker.tile, labelKey: marker.labelKey })),
        [
            { id: 'burgos_key_handoff', tile: { x: 25, y: 9 }, labelKey: 'story.event.ep01.field.key.marker' },
            { id: 'cain_son_relic', tile: { x: 9, y: 12 }, labelKey: 'story.event.ep01.field.cain.marker' },
        ]
    );
});

test('Zamora Fortress uses a dedicated original-inspired interior route', () => {
    const layout = getStoryInteriorLayout('zamora_fortress');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 32, height: 21 });
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraGate'));
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraWestCrypt'));
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraEastCrypt'));
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraCentralKeep'));
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraNorthRampart'));
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraSouthRampart'));
    assert.ok(layout.rooms.some((room) => room.id === 'zamoraFenrisChamber'));
    assert.ok(layout.doors?.some((door) => door.id === 'fenris_chamber_seal' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 8);
    assert.equal(layout.objectiveKey, 'story.interior.zamora_fortress.objective');
    assert.equal(getStoryInteriorTileAt(layout, 17, 8), TileType.WALL);
    assert.equal(getStoryInteriorTileAt(layout, 17, 10), TileType.ROAD);
    assert.equal(map.isWalkable(28, 9), true);
    assert.equal(map.getDisplayName(), '자모라 요새 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const blocked of layout.blockedPaths ?? []) {
        assert.equal(map.isWalkable(blocked.tile.x, blocked.tile.y), false, blocked.id);
    }
});

test('Etna Volcano uses a dedicated vertical lava cave route', () => {
    const layout = getStoryInteriorLayout('etna_volcano');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 30, height: 36 });
    assert.equal(layout.theme, 'volcano');
    assert.equal(layout.objectiveKey, 'story.interior.etna_volcano.objective');
    assert.ok(layout.rooms.some((room) => room.id === 'etnaMouth'));
    assert.ok(layout.rooms.some((room) => room.id === 'etnaLowerTunnel'));
    assert.ok(layout.rooms.some((room) => room.id === 'etnaWestSteamVent'));
    assert.ok(layout.rooms.some((room) => room.id === 'etnaEastAshShelf'));
    assert.ok(layout.rooms.some((room) => room.id === 'etnaMagmaBridge'));
    assert.ok(layout.rooms.some((room) => room.id === 'etnaUpperTunnel'));
    assert.ok(layout.rooms.some((room) => room.id === 'etnaGanomasLair'));
    assert.ok(layout.doors?.some((door) => door.id === 'ganomas_lair_choke' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 10);
    assert.equal(getStoryInteriorTileAt(layout, 12, 27), TileType.LAVA);
    assert.equal(getStoryInteriorTileAt(layout, 15, 20), TileType.ROAD);
    assert.equal(map.isWalkable(12, 27), false);
    assert.equal(map.getDisplayName(), '에트나 화산 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const blocked of layout.blockedPaths ?? []) {
        assert.equal(map.isWalkable(blocked.tile.x, blocked.tile.y), false, blocked.id);
    }
});

test('Zamora Fortress exposes original episode 2 entry event flow', () => {
    const sequence = getStoryScenarioEventSequence('zamora_fortress');
    assert.ok(sequence);

    assert.equal(sequence.originalSources.sceneScript, 'Wlib/scene2.lsc');
    assert.equal(sequence.originalSources.globalScript, 'Glib/gscene2.lsc');
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/02.mrc'));
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/02set.arc'));
    assert.equal(sequence.entry.filter((step) => step.kind === 'dialogue').length, 12);
    assert.equal(sequence.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(sequence.fieldEvents.length, 8);
    assert.equal(sequence.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'gold' && reward.amount === 100)).length, 4);
    assert.equal(sequence.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.originalItemId === 300)).length, 4);
    assert.ok(sequence.fieldEvents.every((event) => event.originalSource === 'MAP/02set.arc:02.evt'));
    assert.ok(sequence.fieldEvents.every((event) => event.markerKind === 'chest'));
    assert.equal(sequence.objectiveRuntimeFlag, 'princess_rescued');
    assert.deepEqual(sequence.markers?.map((marker) => ({
        id: marker.id,
        tile: marker.tile,
        markerLabelKey: marker.markerLabelKey,
        hideWhenRuntimeFlag: marker.hideWhenRuntimeFlag,
    })), [{
        id: 'zamora_princess_captive',
        tile: { x: 28, y: 9 },
        markerLabelKey: 'story.event.ep02.princess.marker.captive',
        hideWhenRuntimeFlag: 'princess_rescued',
    }]);
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Etna Volcano exposes original episode 3 entry, chest, and Ganomas event flow', () => {
    const layout = getStoryInteriorLayout('etna_volcano');
    const sequence = getStoryScenarioEventSequence('etna_volcano');
    assert.ok(layout);
    assert.ok(sequence);
    const map = new StoryInteriorMap(layout);

    assert.equal(sequence.originalSources.sceneScript, 'Wlib/scene3.lsc');
    assert.equal(sequence.originalSources.globalScript, 'Glib/gscene3.lsc');
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/03.mrc'));
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/03set.arc'));
    assert.equal(sequence.entry.filter((step) => step.kind === 'dialogue').length, 10);
    assert.equal(sequence.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(sequence.fieldEvents.length, 8);
    assert.equal(sequence.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'gold' && reward.amount === 100)).length, 4);
    assert.equal(sequence.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.originalItemId === 300)).length, 4);
    assert.ok(sequence.fieldEvents.every((event) => event.originalSource === 'MAP/03set.arc:03.evt'));
    assert.ok(sequence.fieldEvents.every((event) => event.markerKind === 'chest'));
    assert.ok(sequence.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('story scenario event keys exist in both languages without snapshotting full text', () => {
    const keys = new Set<string>();
    const collect = (step: (typeof STORY_SCENARIO_EVENT_SEQUENCES)[number]['entry'][number]) => {
        if ('labelKey' in step) keys.add(step.labelKey);
        if ('speakerNameKey' in step) keys.add(step.speakerNameKey);
        if ('textKey' in step) keys.add(step.textKey);
    };

    for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
        sequence.entry.forEach(collect);
        sequence.bossDefeat.forEach(collect);
        sequence.markers?.forEach((marker) => keys.add(marker.markerLabelKey));
        sequence.fieldEvents.forEach((event) => {
            if (event.markerLabelKey) keys.add(event.markerLabelKey);
            event.steps.forEach(collect);
        });
    }

    for (const key of keys) {
        assert.notEqual(i18n.strings.ko[key as keyof typeof i18n.strings.ko], undefined, `missing ko key ${key}`);
        assert.notEqual(i18n.strings.en[key as keyof typeof i18n.strings.en], undefined, `missing en key ${key}`);
    }
});
