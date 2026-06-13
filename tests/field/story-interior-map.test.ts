import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getStoryScenarioEventSequence,
    getStoryScenarioEventStepDurationMs,
    getStoryScenarioPresentationDurationMs,
    STORY_SCENARIO_EVENT_SEQUENCES,
} from '../../src/data/StoryScenarioEventData';
import type { StoryScenarioEventStep } from '../../src/data/StoryScenarioEventData';
import {
    getStoryScenarioFieldEventPlacements,
    getStoryScenarioFieldEventTiles,
} from '../../src/data/StoryScenarioFieldEventPlacement';
import { getStoryInteriorLayout, getStoryInteriorTileAt, STORY_INTERIOR_LAYOUTS } from '../../src/data/StoryInteriorData';
import {
    getOriginalLateStoryBossTile,
    getOriginalLateStoryCacheEvents,
    getOriginalLateStoryFact,
    getOriginalLateStoryGuardTiles,
} from '../../src/data/OriginalLateStoryFacts';
import { getOriginalLateStoryMrcFact, getOriginalLateStoryMrcVisualSymbol } from '../../src/data/OriginalLateStoryMapFacts';
import { i18n } from '../../src/i18n/LanguageManager';
import { TileType } from '../../src/map/Tile';
import { StoryInteriorMap } from '../../src/map/StoryInteriorMap';
import { WorldMap } from '../../src/map/WorldMap';

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

function getPresentationStepTiles(step: StoryScenarioEventStep): Array<{ label: string; tile: { x: number; y: number } }> {
    if (step.kind === 'focus') return [{ label: 'target', tile: step.target }];
    if (step.kind === 'moveActor') {
        return [
            { label: 'target', tile: step.target },
            ...(step.focus ? [{ label: 'focus', tile: step.focus }] : []),
        ];
    }
    return step.focus ? [{ label: 'focus', tile: step.focus }] : [];
}

test('solo interior layouts expose walkable entry, player, guard, and boss tiles', () => {
    assert.ok(STORY_INTERIOR_LAYOUTS.length > 0);
    for (const layout of STORY_INTERIOR_LAYOUTS) {
        assert.equal(getStoryInteriorTileAt(layout, 0, 0), TileType.WALL);
        assert.equal(getStoryInteriorTileAt(layout, layout.entryTile.x, layout.entryTile.y), TileType.DUNGEON_ENTRANCE);
        assert.notEqual(getStoryInteriorTileAt(layout, layout.playerStart.x, layout.playerStart.y), TileType.WALL);
        assert.notEqual(getStoryInteriorTileAt(layout, layout.bossTile.x, layout.bossTile.y), TileType.WALL);
        assert.notEqual(i18n.strings.ko[layout.displayNameKey as keyof typeof i18n.strings.ko], undefined, `missing ko key ${layout.displayNameKey}`);
        assert.notEqual(i18n.strings.en[layout.displayNameKey as keyof typeof i18n.strings.en], undefined, `missing en key ${layout.displayNameKey}`);
        assert.ok(layout.objectiveKey, `${layout.dungeonId} needs a dedicated objective HUD key`);
        assert.notEqual(i18n.strings.ko[layout.objectiveKey as keyof typeof i18n.strings.ko], undefined, `missing ko key ${layout.objectiveKey}`);
        assert.notEqual(i18n.strings.en[layout.objectiveKey as keyof typeof i18n.strings.en], undefined, `missing en key ${layout.objectiveKey}`);
        assert.ok(layout.rooms.some((room) => room.id === 'entry'));
        assert.ok(layout.rooms.some((room) => room.id === 'bossRoom'));
        assert.ok(layout.props.some((prop) => prop.kind === 'sealedDoor'));
        assert.ok(layout.props.some((prop) => prop.kind === 'bossSeal'));
        for (const tile of layout.guardTiles) {
            assert.notEqual(getStoryInteriorTileAt(layout, tile.x, tile.y), TileType.WALL);
        }
    }
});

test('story interior event presentation and trigger tiles stay walkable', () => {
    for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
        const layout = getStoryInteriorLayout(sequence.dungeonId);
        if (!layout) continue;

        const map = new StoryInteriorMap(layout);
        const bounds = map.getBoundsTiles();
        const assertWalkable = (label: string, tile: { x: number; y: number }) => {
            const context = `${sequence.dungeonId}:${label}:${tile.x},${tile.y}`;
            assert.equal(tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height, true, context);
            assert.equal(map.isWalkable(tile.x, tile.y), true, context);
        };

        for (const [group, steps] of [
            ['entry', sequence.entry],
            ['bossDefeat', sequence.bossDefeat],
        ] as const) {
            steps.forEach((step, index) => {
                for (const point of getPresentationStepTiles(step)) {
                    assertWalkable(`${group}:${index}:${step.kind}:${point.label}`, point.tile);
                }
            });
        }

        for (const event of sequence.fieldEvents) {
            event.triggerTiles.forEach((tile, index) => assertWalkable(`field:${event.id}:trigger:${index}`, tile));
            event.steps.forEach((step, index) => {
                for (const point of getPresentationStepTiles(step)) {
                    assertWalkable(`field:${event.id}:${index}:${step.kind}:${point.label}`, point.tile);
                }
            });
        }

        for (const event of sequence.enemyDefeatEvents ?? []) {
            event.steps.forEach((step, index) => {
                for (const point of getPresentationStepTiles(step)) {
                    assertWalkable(`enemy:${event.id}:${index}:${step.kind}:${point.label}`, point.tile);
                }
            });
        }

        for (const marker of sequence.markers ?? []) {
            assertWalkable(`marker:${marker.id}`, marker.tile);
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

test('Sagrajas Temple uses the original episode 7 vertical temple route', () => {
    const layout = getStoryInteriorLayout('sagrajas_temple');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 40, height: 42 });
    assert.equal(layout.theme, 'temple');
    assert.equal(layout.objectiveKey, 'story.interior.sagrajas_temple.objective');
    assert.ok(layout.rooms.some((room) => room.id === 'sagrajasEntry'));
    assert.ok(layout.rooms.some((room) => room.id === 'sagrajasProcessional'));
    assert.ok(layout.rooms.some((room) => room.id === 'sagrajasWestAcolytes'));
    assert.ok(layout.rooms.some((room) => room.id === 'sagrajasEastAcolytes'));
    assert.ok(layout.rooms.some((room) => room.id === 'sagrajasScriptorium'));
    assert.ok(layout.rooms.some((room) => room.id === 'sagrajasSanctum'));
    assert.ok(layout.doors?.some((door) => door.id === 'sanctum_seal' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 12);
    assert.equal(getStoryInteriorTileAt(layout, 19, 25), TileType.ROAD);
    assert.equal(getStoryInteriorTileAt(layout, 10, 26), TileType.WATER);
    assert.equal(map.isWalkable(10, 26), false);
    assert.equal(map.getDisplayName(), '사그라하스 신전 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 19, y: 10 }, { x: 20, y: 10 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
    for (const blocked of layout.blockedPaths ?? []) {
        assert.equal(map.isWalkable(blocked.tile.x, blocked.tile.y), false, blocked.id);
    }
});

test('Pyramid Interior uses the original episode 13 royal tomb route', () => {
    const layout = getStoryInteriorLayout('pyramid_inside');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 40, height: 40 });
    assert.equal(layout.theme, 'pyramid');
    assert.equal(layout.objectiveKey, 'story.interior.pyramid_inside.objective');
    assert.deepEqual(layout.entryTile, { x: 19, y: 38 });
    assert.deepEqual(layout.playerStart, { x: 19, y: 34 });
    assert.deepEqual(layout.bossTile, { x: 19, y: 5 });
    assert.ok(layout.rooms.some((room) => room.id === 'pyramidEntry'));
    assert.ok(layout.rooms.some((room) => room.id === 'pyramidLowerGallery'));
    assert.ok(layout.rooms.some((room) => room.id === 'pyramidProcessional'));
    assert.ok(layout.rooms.some((room) => room.id === 'pyramidCentralHall'));
    assert.ok(layout.rooms.some((room) => room.id === 'pyramidNorthGallery'));
    assert.ok(layout.rooms.some((room) => room.id === 'pyramidSanctum'));
    assert.ok(layout.doors?.some((door) => door.id === 'pyramid_sanctum_seal' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 8);
    assert.equal(getStoryInteriorTileAt(layout, 19, 30), TileType.ROAD);
    assert.equal(getStoryInteriorTileAt(layout, 8, 30), TileType.WALL);
    assert.equal(map.isWalkable(8, 30), false);
    assert.equal(map.getDisplayName(), '피라미드 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 20, y: 16 }, { x: 19, y: 17 }, { x: 11, y: 2 }, { x: 30, y: 2 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
    for (const blocked of layout.blockedPaths ?? []) {
        assert.equal(map.isWalkable(blocked.tile.x, blocked.tile.y), false, blocked.id);
    }
});

test('Ament Gate uses the original episode 18 multi-door entrance route', () => {
    const layout = getStoryInteriorLayout('ament_gate');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 78, height: 40 });
    assert.equal(layout.theme, 'ament');
    assert.equal(layout.objectiveKey, 'story.interior.ament_gate.objective');
    assert.deepEqual(layout.entryTile, { x: 19, y: 38 });
    assert.deepEqual(layout.playerStart, { x: 19, y: 34 });
    assert.deepEqual(layout.bossTile, { x: 13, y: 5 });
    assert.ok(layout.rooms.some((room) => room.id === 'amentGateFalseDoorHall'));
    assert.ok(layout.rooms.some((room) => room.id === 'amentGateEastRelicRoom'));
    assert.ok(layout.doors?.some((door) => door.id === 'ament_gate_true_99_west'));
    assert.ok(layout.doors?.some((door) => door.id === 'ament_gate_false_98' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 12);
    assert.equal(map.getDisplayName(), '아멘트입구 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 25, y: 3 }, { x: 66, y: 3 }, { x: 36, y: 13 }, { x: 45, y: 13 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
});

test('Ament 1F uses the original episode 19 four-direction shard route', () => {
    const layout = getStoryInteriorLayout('ament_1f');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 60, height: 70 });
    assert.equal(layout.theme, 'ament');
    assert.equal(layout.objectiveKey, 'story.interior.ament_1f.objective');
    assert.deepEqual(layout.entryTile, { x: 28, y: 68 });
    assert.deepEqual(layout.playerStart, { x: 28, y: 35 });
    assert.deepEqual(layout.bossTile, { x: 28, y: 40 });
    assert.ok(layout.rooms.some((room) => room.id === 'ament1fCentralCross'));
    assert.ok(layout.rooms.some((room) => room.id === 'ament1fNorthHall'));
    assert.ok(layout.rooms.some((room) => room.id === 'ament1fEastHall'));
    assert.equal(layout.blockedPaths?.length, 8);
    assert.equal(map.getDisplayName(), '아멘트 1층 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 28, y: 3 }, { x: 29, y: 68 }, { x: 1, y: 36 }, { x: 58, y: 35 }, { x: 31, y: 60 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
});

test('Ament 2F uses the original episode 20 final hall and clone route', () => {
    const layout = getStoryInteriorLayout('ament_2f');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 60, height: 68 });
    assert.equal(layout.theme, 'ament');
    assert.equal(layout.objectiveKey, 'story.interior.ament_2f.objective');
    assert.deepEqual(layout.entryTile, { x: 18, y: 64 });
    assert.deepEqual(layout.playerStart, { x: 18, y: 62 });
    assert.deepEqual(layout.bossTile, { x: 29, y: 9 });
    assert.ok(layout.rooms.some((room) => room.id === 'ament2fCentralAxis'));
    assert.ok(layout.rooms.some((room) => room.id === 'ament2fWestCloneHall'));
    assert.ok(layout.rooms.some((room) => room.id === 'ament2fFlailVault'));
    assert.ok(layout.doors?.some((door) => door.id === 'ament_2f_boss_seal' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 10);
    assert.equal(map.getDisplayName(), '아멘트 2층 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 9, y: 28 }, { x: 30, y: 4 }, { x: 50, y: 28 }, { x: 1, y: 19 }, { x: 31, y: 60 }, { x: 29, y: 7 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
});

test('Nergal Castle uses the original episode 21 summoning hall route', () => {
    const layout = getStoryInteriorLayout('nergal_castle');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 40, height: 29 });
    assert.equal(layout.theme, 'ament');
    assert.equal(layout.objectiveKey, 'story.interior.nergal_castle.objective');
    assert.deepEqual(layout.entryTile, { x: 19, y: 27 });
    assert.deepEqual(layout.playerStart, { x: 19, y: 23 });
    assert.deepEqual(layout.bossTile, { x: 19, y: 7 });
    assert.deepEqual(layout.guardTiles, [
        { x: 16, y: 15 },
        { x: 18, y: 15 },
        { x: 21, y: 15 },
        { x: 23, y: 15 },
    ]);
    assert.ok(layout.rooms.some((room) => room.id === 'nergalEntry'));
    assert.ok(layout.rooms.some((room) => room.id === 'nergalProcessional'));
    assert.ok(layout.rooms.some((room) => room.id === 'nergalFourKingsHall'));
    assert.ok(layout.rooms.some((room) => room.id === 'nergalLonginusVault'));
    assert.ok(layout.rooms.some((room) => room.id === 'nergalRelicDais'));
    assert.ok(layout.rooms.some((room) => room.id === 'nergalSanctum'));
    assert.ok(layout.doors?.some((door) => door.id === 'nergal_sanctum_seal' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 4);
    assert.equal(map.getDisplayName(), '네르갈 성 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 9, y: 24 }, { x: 14, y: 7 }, { x: 19, y: 7 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
    for (const blocked of layout.blockedPaths ?? []) {
        assert.equal(map.isWalkable(blocked.tile.x, blocked.tile.y), false, blocked.id);
    }
});

test('Flame Castle uses the original episode 22 Beramode route', () => {
    const layout = getStoryInteriorLayout('flame_castle');
    assert.ok(layout);
    const map = new StoryInteriorMap(layout);

    assert.deepEqual(map.getBoundsTiles(), { width: 40, height: 40 });
    assert.equal(layout.theme, 'volcano');
    assert.equal(layout.objectiveKey, 'story.interior.flame_castle.objective');
    assert.deepEqual(layout.entryTile, { x: 19, y: 38 });
    assert.deepEqual(layout.playerStart, { x: 19, y: 22 });
    assert.deepEqual(layout.bossTile, { x: 19, y: 12 });
    assert.equal(layout.guardTiles.length, 18);
    assert.deepEqual(layout.guardTiles.slice(0, 3), [
        { x: 15, y: 13 },
        { x: 19, y: 13 },
        { x: 23, y: 13 },
    ]);
    assert.ok(layout.rooms.some((room) => room.id === 'flameEntry'));
    assert.ok(layout.rooms.some((room) => room.id === 'flameCentralFurnace'));
    assert.ok(layout.rooms.some((room) => room.id === 'flameWestWing'));
    assert.ok(layout.rooms.some((room) => room.id === 'flameEastWing'));
    assert.ok(layout.rooms.some((room) => room.id === 'flameRelicChamber'));
    assert.ok(layout.rooms.some((room) => room.id === 'flameArmory'));
    assert.ok(layout.rooms.some((room) => room.id === 'flameSanctum'));
    assert.ok(layout.doors?.some((door) => door.id === 'flame_sanctum_seal' && door.sealed));
    assert.equal(layout.blockedPaths?.length, 4);
    assert.equal(map.getDisplayName(), '플래임 캐슬 내부');
    assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true);

    for (const tile of [{ x: 24, y: 23 }, { x: 15, y: 18 }, { x: 19, y: 12 }, { x: 19, y: 38 }]) {
        assert.equal(map.isWalkable(tile.x, tile.y), true, `${tile.x},${tile.y}`);
        assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${tile.x},${tile.y}`);
    }
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
    assert.equal(sequence.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.itemId === 'orig_story_0300_heal_potion')).length, 4);
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
    assert.equal(sequence.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.itemId === 'orig_story_0300_heal_potion')).length, 4);
    assert.ok(sequence.fieldEvents.every((event) => event.originalSource === 'MAP/03set.arc:03.evt'));
    assert.ok(sequence.fieldEvents.every((event) => event.markerKind === 'chest'));
    assert.ok(sequence.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Sagrajas Temple exposes original episode 7 entry, scripture, and Amphisbaena event flow', () => {
    const layout = getStoryInteriorLayout('sagrajas_temple');
    const sequence = getStoryScenarioEventSequence('sagrajas_temple');
    assert.ok(layout);
    assert.ok(sequence);
    const map = new StoryInteriorMap(layout);

    assert.equal(sequence.originalSources.sceneScript, 'Wlib/scene7.lsc');
    assert.equal(sequence.originalSources.globalScript, 'Glib/gscene7.lsc');
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/07.mrc'));
    assert.ok(sequence.originalSources.mapFiles.includes('MAP/07set.arc'));
    assert.equal(sequence.entry.filter((step) => step.kind === 'dialogue').length, 3);
    assert.equal(sequence.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(sequence.fieldEvents.length, 1);
    assert.equal(sequence.fieldEvents[0].originalSource, 'MAP/07set.arc:07.evt');
    assert.equal(sequence.fieldEvents[0].originalEventId, 'EVENT 10');
    assert.equal(sequence.fieldEvents[0].runtimeFlag, 'sagrajas_scripture_recovered');
    assert.ok(sequence.fieldEvents[0].triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y)));
    assert.equal(sequence.objectiveRuntimeFlag, 'sagrajas_scripture_recovered');
    assert.deepEqual(sequence.markers?.map((marker) => ({
        id: marker.id,
        tile: marker.tile,
        markerLabelKey: marker.markerLabelKey,
        hideWhenRuntimeFlag: marker.hideWhenRuntimeFlag,
    })), [{
        id: 'sagrajas_hagen_captive',
        tile: { x: 17, y: 6 },
        markerLabelKey: 'story.event.ep07.hagen.marker',
        hideWhenRuntimeFlag: 'sagrajas_scripture_recovered',
    }]);
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('episodes 4 through 6 expose original field scenario event flows', () => {
    const arcadia = getStoryScenarioEventSequence('arcadia_plain');
    const cacaora = getStoryScenarioEventSequence('cacaora_highland');
    const village = getStoryScenarioEventSequence('remote_village');
    assert.ok(arcadia);
    assert.ok(cacaora);
    assert.ok(village);

    assert.equal(arcadia.originalSources.sceneScript, 'Wlib/scene4.lsc');
    assert.ok(arcadia.originalSources.mapFiles.includes('MAP/04set.arc'));
    assert.equal(arcadia.entry.filter((step) => step.kind === 'dialogue').length, 7);
    assert.equal(arcadia.fieldEvents.length, 7);
    assert.equal(arcadia.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'gold' && reward.amount === 100)).length, 4);
    assert.equal(arcadia.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.originalItemId === 300)).length, 2);
    assert.equal(arcadia.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.itemId === 'orig_story_0300_heal_potion')).length, 2);
    assert.ok(arcadia.fieldEvents.some((event) => event.id === 'arcadia_child_rescue'));
    assert.equal(arcadia.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);

    assert.equal(cacaora.originalSources.sceneScript, 'Wlib/scene5.lsc');
    assert.ok(cacaora.originalSources.mapFiles.includes('MAP/05set.arc'));
    assert.equal(cacaora.entry.filter((step) => step.kind === 'dialogue').length, 7);
    assert.equal(cacaora.fieldEvents.length, 4);
    assert.equal(cacaora.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'gold' && reward.amount === 100)).length, 2);
    assert.ok(cacaora.fieldEvents.some((event) => event.id === 'cacaora_rusted_sword'));
    assert.ok(cacaora.fieldEvents.some((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.originalItemId === 305)));
    assert.equal(cacaora.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.itemId === 'orig_story_0305_magic_potion')).length, 1);

    assert.equal(village.originalSources.sceneScript, 'Wlib/scene6.lsc');
    assert.ok(village.originalSources.mapFiles.includes('MAP/06set.arc'));
    assert.equal(village.entry.filter((step) => step.kind === 'dialogue').length, 4);
    assert.equal(village.fieldEvents.length, 3);
    assert.ok(village.fieldEvents.some((event) => event.id === 'remote_village_healer_01'));
    assert.ok(village.fieldEvents.some((event) => event.id === 'remote_village_poison_02'));
    assert.ok(village.fieldEvents.some((event) => event.id === 'remote_village_dark_root'));
    assert.equal(village.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
});

test('Sagunto Port exposes original episode 8 ship and blockade event flow', () => {
    const sagunto = getStoryScenarioEventSequence('sagunto_port');
    assert.ok(sagunto);

    assert.equal(sagunto.originalSources.sceneScript, 'Wlib/scene8.lsc');
    assert.equal(sagunto.originalSources.globalScript, 'Glib/gscene8.lsc');
    assert.ok(sagunto.originalSources.mapFiles.includes('MAP/08.mrc'));
    assert.ok(sagunto.originalSources.mapFiles.includes('MAP/08set.arc'));
    assert.equal(sagunto.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(sagunto.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(sagunto.fieldEvents.length, 4);
    assert.deepEqual(sagunto.fieldEvents.map((event) => event.originalEventId), ['EVENT 50', 'EVENT 51', 'EVENT 52', 'EVENT 53']);
    assert.ok(sagunto.fieldEvents.every((event) => event.originalSource === 'MAP/08set.arc:08.evt'));
    assert.ok(sagunto.fieldEvents.every((event) => event.scope === 'shared'));
    assert.ok(sagunto.fieldEvents.every((event) => event.triggerTiles.length === 2));
    assert.equal(sagunto.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(sagunto.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Sicilio Island exposes original episode 9 coast ambush and rescue flow', () => {
    const sicilio = getStoryScenarioEventSequence('sicilio_island');
    assert.ok(sicilio);

    assert.equal(sicilio.originalSources.sceneScript, 'Wlib/scene9.lsc');
    assert.equal(sicilio.originalSources.globalScript, 'Glib/gscene9.lsc');
    assert.ok(sicilio.originalSources.mapFiles.includes('MAP/09.mrc'));
    assert.ok(sicilio.originalSources.mapFiles.includes('MAP/09set.arc'));
    assert.equal(sicilio.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(sicilio.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(sicilio.fieldEvents.length, 0);
    assert.equal(sicilio.objectiveRuntimeFlag, 'kamora_son_rescued');
    assert.deepEqual(sicilio.markers?.map((marker) => ({
        id: marker.id,
        tile: marker.tile,
        markerLabelKey: marker.markerLabelKey,
        hideWhenRuntimeFlag: marker.hideWhenRuntimeFlag,
    })), [{
        id: 'sicilio_kamora_son',
        tile: { x: 45, y: 26 },
        markerLabelKey: 'story.event.ep09.kamoraSon.marker',
        hideWhenRuntimeFlag: 'kamora_son_rescued',
    }]);
    assert.equal(sicilio.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(sicilio.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Dalai Lake exposes original episode 10 lake temptation and rescue flow', () => {
    const dalai = getStoryScenarioEventSequence('dalai_lake');
    assert.ok(dalai);

    assert.equal(dalai.originalSources.sceneScript, 'Wlib/scene10.lsc');
    assert.equal(dalai.originalSources.globalScript, 'Glib/gscene10.lsc');
    assert.ok(dalai.originalSources.mapFiles.includes('MAP/10.mrc'));
    assert.ok(dalai.originalSources.mapFiles.includes('MAP/10set.arc'));
    assert.equal(dalai.entry.filter((step) => step.kind === 'dialogue').length, 5);
    assert.equal(dalai.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(dalai.fieldEvents.length, 0);
    assert.equal(dalai.objectiveRuntimeFlag, 'tripani_fiancee_rescued');
    assert.deepEqual(dalai.markers?.map((marker) => ({
        id: marker.id,
        tile: marker.tile,
        markerLabelKey: marker.markerLabelKey,
        hideWhenRuntimeFlag: marker.hideWhenRuntimeFlag,
    })), [{
        id: 'dalai_tripani_fiancee',
        tile: { x: 23, y: 4 },
        markerLabelKey: 'story.event.ep10.fiancee.marker',
        hideWhenRuntimeFlag: 'tripani_fiancee_rescued',
    }]);
    assert.equal(dalai.bossDefeat.filter((step) => step.kind === 'dialogue').length, 0);
    assert.equal(dalai.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Oasis exposes original episode 11 Charon and treasure chest flow', () => {
    const oasis = getStoryScenarioEventSequence('oasis');
    assert.ok(oasis);

    assert.equal(oasis.originalSources.sceneScript, 'Wlib/scene11.lsc');
    assert.equal(oasis.originalSources.globalScript, 'Glib/gscene11.lsc');
    assert.ok(oasis.originalSources.mapFiles.includes('MAP/11.mrc'));
    assert.ok(oasis.originalSources.mapFiles.includes('MAP/11set.arc'));
    assert.equal(oasis.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(oasis.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(oasis.objectiveRuntimeFlag, 'acheron_truth_seal_opened');
    assert.equal(oasis.fieldEvents.length, 6);
    assert.deepEqual(oasis.fieldEvents.map((event) => event.originalEventId), [
        'EVENT 01',
        'EVENT 02',
        'EVENT 03',
        'EVENT 04',
        'EVENT 05',
        'EVENT 06',
    ]);
    assert.deepEqual(oasis.fieldEvents.map((event) => event.triggerTiles[0]), [
        { x: 17, y: 32 },
        { x: 18, y: 30 },
        { x: 24, y: 23 },
        { x: 35, y: 29 },
        { x: 35, y: 33 },
        { x: 25, y: 37 },
    ]);
    assert.ok(oasis.fieldEvents.every((event) => event.originalSource === 'MAP/11set.arc:11.EVT'));
    assert.ok(oasis.fieldEvents.every((event) => event.trigger === 'treasure chest RANDOM 50 GOLD 500'));
    assert.ok(oasis.fieldEvents.every((event) => event.markerKind === 'chest'));
    assert.ok(oasis.fieldEvents.every((event) => event.rewards?.some((reward) => reward.type === 'gold' && reward.amount === 500)));
    assert.equal(oasis.bossDefeat.filter((step) => step.kind === 'dialogue').length, 0);
    assert.equal(oasis.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Pyramid Front exposes original episode 12 Mantagoras and trap flow', () => {
    const pyramid = getStoryScenarioEventSequence('pyramid_front');
    assert.ok(pyramid);

    assert.equal(pyramid.originalSources.sceneScript, 'Wlib/scene12.lsc');
    assert.equal(pyramid.originalSources.globalScript, 'Glib/gscene12.lsc');
    assert.ok(pyramid.originalSources.mapFiles.includes('MAP/12.mrc'));
    assert.ok(pyramid.originalSources.mapFiles.includes('MAP/12set.arc'));
    assert.equal(pyramid.entry.filter((step) => step.kind === 'dialogue').length, 5);
    assert.equal(pyramid.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(pyramid.fieldEvents.length, 8);
    assert.deepEqual(pyramid.fieldEvents.map((event) => event.originalEventId), [
        'EVENT 50',
        'EVENT 51',
        'EVENT 52',
        'EVENT 53',
        'EVENT 54',
        'EVENT 55',
        'EVENT 56',
        'EVENT 57',
    ]);
    assert.deepEqual(pyramid.fieldEvents.map((event) => event.triggerTiles), [
        [{ x: 28, y: 30 }, { x: 29, y: 30 }],
        [{ x: 10, y: 29 }, { x: 11, y: 29 }],
        [{ x: 35, y: 27 }, { x: 36, y: 27 }],
        [{ x: 4, y: 31 }, { x: 5, y: 31 }],
        [{ x: 14, y: 20 }, { x: 15, y: 20 }],
        [{ x: 31, y: 21 }, { x: 30, y: 21 }],
        [{ x: 23, y: 14 }, { x: 24, y: 14 }],
        [{ x: 24, y: 8 }, { x: 25, y: 8 }],
    ]);
    assert.ok(pyramid.fieldEvents.every((event) => event.originalSource === 'MAP/12set.arc:12.evt'));
    assert.ok(pyramid.fieldEvents.every((event) => event.trigger.includes('RANDOM 50')));
    assert.ok(pyramid.fieldEvents.some((event) => event.trigger.includes('MAGIC 1002')));
    assert.equal(pyramid.bossDefeat.filter((step) => step.kind === 'dialogue').length, 0);
    assert.equal(pyramid.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Pyramid Interior exposes original episode 13 Myant, trap, and chest flow', () => {
    const pyramid = getStoryScenarioEventSequence('pyramid_inside');
    assert.ok(pyramid);

    assert.equal(pyramid.originalSources.sceneScript, 'Wlib/scene13.lsc');
    assert.equal(pyramid.originalSources.globalScript, 'Glib/gscene13.lsc');
    assert.ok(pyramid.originalSources.mapFiles.includes('MAP/13.mrc'));
    assert.ok(pyramid.originalSources.mapFiles.includes('MAP/13set.arc'));
    assert.equal(pyramid.entry.filter((step) => step.kind === 'dialogue').length, 5);
    assert.equal(pyramid.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(pyramid.fieldEvents.length, 12);
    assert.deepEqual(pyramid.fieldEvents.slice(0, 8).map((event) => event.originalEventId), [
        'EVENT 50',
        'EVENT 51',
        'EVENT 52',
        'EVENT 53',
        'EVENT 54',
        'EVENT 55',
        'EVENT 56',
        'EVENT 57',
    ]);
    assert.ok(pyramid.fieldEvents.slice(0, 8).every((event) => event.originalSource === 'MAP/13set.arc:13.evt'));
    assert.ok(pyramid.fieldEvents.slice(0, 8).every((event) => event.trigger.includes('RANDOM 50')));
    assert.ok(pyramid.fieldEvents.some((event) => event.trigger.includes('MAGIC 0803')));
    assert.ok(pyramid.fieldEvents.some((event) => event.trigger.includes('MAGIC 1002')));
    assert.deepEqual(pyramid.fieldEvents.slice(8).map((event) => event.originalEventId), [
        'EVENT 60',
        'EVENT 61',
        'EVENT 62',
        'EVENT 63',
    ]);
    assert.deepEqual(pyramid.fieldEvents.slice(8).map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'web_65_08', originalItemId: 10 },
        { type: 'item', itemId: 'orig_story_0008_star_knife', originalItemId: 8 },
        { type: 'item', itemId: 'orig_story_0300_heal_potion', originalItemId: 300 },
        { type: 'item', itemId: 'orig_story_0305_magic_potion', originalItemId: 305 },
    ]);
    assert.ok(pyramid.fieldEvents.slice(8).every((event) => event.markerKind === 'chest'));
    assert.equal(pyramid.bossDefeat.filter((step) => step.kind === 'dialogue').length, 0);
    assert.equal(pyramid.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Skeria exposes original episode 14 Yadua, quake trap, and cache flow', () => {
    const skeria = getStoryScenarioEventSequence('skeria');
    assert.ok(skeria);

    assert.equal(skeria.originalSources.sceneScript, 'Wlib/scene14.lsc');
    assert.equal(skeria.originalSources.globalScript, 'Glib/gscene14.lsc');
    assert.ok(skeria.originalSources.mapFiles.includes('MAP/14.mrc'));
    assert.ok(skeria.originalSources.mapFiles.includes('MAP/14set.arc'));
    assert.equal(skeria.objectiveRuntimeFlag, 'skeria_yadua_saved');
    assert.equal(skeria.entry.filter((step) => step.kind === 'dialogue').length, 9);
    assert.equal(skeria.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(skeria.fieldEvents.length, 7);
    assert.deepEqual(skeria.fieldEvents.slice(0, 4).map((event) => event.originalEventId), [
        'EVENT 50',
        'EVENT 51',
        'EVENT 52',
        'EVENT 53',
    ]);
    assert.ok(skeria.fieldEvents.slice(0, 4).every((event) => event.originalSource === 'MAP/14set.arc:14.evt'));
    assert.ok(skeria.fieldEvents.slice(0, 4).every((event) => event.trigger.includes('MAGIC 0903')));
    assert.ok(skeria.fieldEvents.slice(0, 3).every((event) => event.trigger.includes('RANDOM 100')));
    assert.ok(skeria.fieldEvents[3].trigger.includes('RANDOM 50'));
    assert.deepEqual(skeria.fieldEvents.slice(4).map((event) => event.originalEventId), [
        'EVENT 60',
        'EVENT 61',
        'EVENT 62',
    ]);
    assert.deepEqual(skeria.fieldEvents.slice(4).map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'orig_story_0203_resist_fire_ring', originalItemId: 203 },
        { type: 'gold', amount: 200 },
        { type: 'item', itemId: 'web_66_01', originalItemId: 18 },
    ]);
    assert.equal(skeria.bossDefeat.filter((step) => step.kind === 'dialogue').length, 2);
    assert.equal(skeria.bossDefeat.filter((step) => step.kind === 'objective').length, 2);
});

test('Skeria 2 exposes original episode 15 nameless village and yellow flower flow', () => {
    const skeria = getStoryScenarioEventSequence('skeria_2');
    assert.ok(skeria);

    assert.equal(skeria.originalSources.sceneScript, 'Wlib/scene15.lsc');
    assert.equal(skeria.originalSources.globalScript, 'Glib/gscene15.lsc');
    assert.ok(skeria.originalSources.mapFiles.includes('MAP/15.mrc'));
    assert.ok(skeria.originalSources.mapFiles.includes('MAP/15set.arc'));
    assert.ok(skeria.originalSources.mapFiles.includes('MAP/1500.mrc'));
    assert.equal(skeria.objectiveRuntimeFlag, 'skeria_2_yellow_flower_delivered');
    assert.equal(skeria.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(skeria.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(skeria.fieldEvents.length, 23);
    assert.deepEqual(skeria.fieldEvents.slice(0, 8).map((event) => event.originalEventId), [
        'EVENT 01',
        'EVENT 02',
        'EVENT 03',
        'EVENT 04',
        'EVENT 05',
        'EVENT 06',
        'EVENT 07',
        'EVENT 08',
    ]);
    assert.equal(skeria.fieldEvents.filter((event) => event.originalEventId === 'EVENT 04' && event.rewards?.some((reward) => reward.type === 'gold' && reward.amount === 3000)).length, 1);
    assert.equal(skeria.fieldEvents.filter((event) => event.rewards?.some((reward) => reward.type === 'item' && reward.originalItemId === 397)).length, 15);
    assert.equal(skeria.fieldEvents.filter((event) => event.originalEventId === 'EVENT 08' && event.rewards?.some((reward) => reward.type === 'item' && reward.originalItemId === 315)).length, 1);
    assert.ok(skeria.fieldEvents.slice(8).every((event) =>
        event.rewards?.some((reward) => reward.type === 'item' && reward.itemId === 'orig_story_0397_yellow_flower')
    ));
    assert.ok(skeria.fieldEvents.some((event) =>
        event.originalEventId === 'EVENT 08'
        && event.rewards?.some((reward) => reward.type === 'item' && reward.itemId === 'orig_story_0315_stone_snake')
    ));
    assert.deepEqual(skeria.fieldEvents.slice(8).map((event) => event.originalEventId), [
        'EVENT 10',
        'EVENT 11',
        'EVENT 12',
        'EVENT 13',
        'EVENT 14',
        'EVENT 15',
        'EVENT 16',
        'EVENT 17',
        'EVENT 18',
        'EVENT 19',
        'EVENT 20',
        'EVENT 21',
        'EVENT 22',
        'EVENT 23',
        'EVENT 24',
    ]);
    assert.ok(skeria.fieldEvents.slice(8).every((event) => event.trigger.includes('MAGIC 1602')));
    assert.equal(skeria.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Valhalla Plain exposes original episode 16 Barbatu, trap, and cache flow', () => {
    const valhalla = getStoryScenarioEventSequence('valhalla_plain');
    assert.ok(valhalla);

    assert.equal(valhalla.originalSources.sceneScript, 'Wlib/scene16.lsc');
    assert.equal(valhalla.originalSources.globalScript, 'Glib/gscene16.lsc');
    assert.ok(valhalla.originalSources.mapFiles.includes('MAP/16.mrc'));
    assert.ok(valhalla.originalSources.mapFiles.includes('MAP/16set.arc'));
    assert.equal(valhalla.objectiveRuntimeFlag, 'valhalla_airship_route_opened');
    assert.equal(valhalla.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(valhalla.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(valhalla.fieldEvents.length, 18);
    assert.equal(valhalla.fieldEvents.filter((event) => event.originalEventId.startsWith('EVENT 5')).length, 8);
    assert.ok(valhalla.fieldEvents.filter((event) => event.originalEventId.startsWith('EVENT 5')).every((event) => event.trigger.includes('RANDOM 50')));
    assert.ok(valhalla.fieldEvents.some((event) => event.trigger.includes('MAGIC 1003')));
    assert.equal(valhalla.fieldEvents.filter((event) => event.trigger.includes('MAGIC 1603')).length, 2);
    assert.deepEqual(valhalla.fieldEvents.filter((event) => event.rewards?.length).map((event) => event.originalEventId), [
        'EVENT 20',
        'EVENT 60',
        'EVENT 63',
        'EVENT 70',
        'EVENT 80',
        'EVENT 90',
        'EVENT 91',
        'EVENT 92',
    ]);
    assert.deepEqual(valhalla.fieldEvents.find((event) => event.originalEventId === 'EVENT 20')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0315_stone_snake',
        originalItemId: 315,
    });
    assert.deepEqual(valhalla.fieldEvents.find((event) => event.originalEventId === 'EVENT 63')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0305_magic_potion',
        originalItemId: 305,
    });
    assert.deepEqual(valhalla.fieldEvents.find((event) => event.originalEventId === 'EVENT 70')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0204_resist_thunder_ring',
        originalItemId: 204,
    });
    assert.deepEqual(valhalla.fieldEvents.find((event) => event.originalEventId === 'EVENT 80')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0261_hermes_shoes',
        originalItemId: 261,
    });
    assert.deepEqual(valhalla.fieldEvents.find((event) => event.originalEventId === 'EVENT 90')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0005_assassin_knife',
        originalItemId: 5,
    });
    assert.deepEqual(valhalla.fieldEvents.find((event) => event.originalEventId === 'EVENT 92')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0619_dragon_killer6',
        originalItemId: 619,
    });
    assert.equal(valhalla.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(valhalla.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Airship exposes original episode 17 purity seal and boarding flow', () => {
    const airship = getStoryScenarioEventSequence('airship');
    assert.ok(airship);

    assert.equal(airship.originalSources.sceneScript, 'Wlib/scene17.lsc');
    assert.equal(airship.originalSources.globalScript, 'Glib/gscene17.lsc');
    assert.ok(airship.originalSources.mapFiles.includes('MAP/17.mrc'));
    assert.ok(airship.originalSources.mapFiles.includes('MAP/17set.arc'));
    assert.equal(airship.objectiveRuntimeFlag, 'airship_boarded');
    assert.equal(airship.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(airship.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(airship.fieldEvents.length, 7);
    assert.deepEqual(airship.fieldEvents.map((event) => event.originalEventId), [
        'EVENT 81',
        'EVENT 82',
        'EVENT 83',
        'EVENT 90',
        'EVENT 91',
        'EVENT 91',
        'EVENT 99',
    ]);
    assert.equal(airship.fieldEvents.filter((event) => event.originalEventId === 'EVENT 91').length, 2);
    assert.deepEqual(airship.fieldEvents.filter((event) => event.rewards?.length).map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'orig_story_0180_light_robe', originalItemId: 180 },
        { type: 'gold', amount: 500 },
        { type: 'item', itemId: 'fire_herb', originalItemId: 0 },
        { type: 'item', itemId: 'orig_story_0620_dragon_killer7', originalItemId: 620 },
        { type: 'item', itemId: 'orig_story_0204_resist_thunder_ring', originalItemId: 204 },
        { type: 'item', itemId: 'orig_story_0208_necklace', originalItemId: 208 },
    ]);
    assert.equal(airship.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Ament Gate exposes original episode 18 Amphit, trap, cache, and true-door flow', () => {
    const layout = getStoryInteriorLayout('ament_gate');
    const ament = getStoryScenarioEventSequence('ament_gate');
    assert.ok(layout);
    assert.ok(ament);
    const map = new StoryInteriorMap(layout);

    assert.equal(ament.originalSources.sceneScript, 'Wlib/scene18.lsc');
    assert.equal(ament.originalSources.globalScript, 'Glib/gscene18.lsc');
    assert.ok(ament.originalSources.mapFiles.includes('MAP/18.mrc'));
    assert.ok(ament.originalSources.mapFiles.includes('MAP/18set.arc'));
    assert.equal(ament.objectiveRuntimeFlag, 'ament_gate_route_opened');
    assert.equal(ament.entry.filter((step) => step.kind === 'dialogue').length, 5);
    assert.equal(ament.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(ament.fieldEvents.length, 36);
    assert.deepEqual(ament.fieldEvents.slice(0, 3).map((event) => event.originalEventId), ['EVENT 30', 'EVENT 31', 'EVENT 32']);
    assert.equal(ament.fieldEvents.filter((event) => event.originalEventId.startsWith('EVENT 5')).length, 8);
    assert.equal(ament.fieldEvents.filter((event) => event.originalEventId.startsWith('EVENT 6')).length, 10);
    assert.equal(ament.fieldEvents.filter((event) => event.originalEventId === 'EVENT 70').length, 1);
    assert.equal(ament.fieldEvents.filter((event) => ['EVENT 80', 'EVENT 81', 'EVENT 82', 'EVENT 83'].includes(event.originalEventId)).length, 4);
    assert.deepEqual(ament.fieldEvents.filter((event) => event.rewards?.length).map((event) => event.originalEventId), [
        'EVENT 30',
        'EVENT 85',
        'EVENT 86',
        'EVENT 87',
    ]);
    assert.deepEqual(ament.fieldEvents.find((event) => event.originalEventId === 'EVENT 30')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0305_magic_potion',
        originalItemId: 305,
    });
    assert.deepEqual(ament.fieldEvents.find((event) => event.originalEventId === 'EVENT 85')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0258_wind_boots',
        originalItemId: 258,
    });
    assert.deepEqual(ament.fieldEvents.find((event) => event.originalEventId === 'EVENT 87')?.rewards?.[0], {
        type: 'item',
        itemId: 'orig_story_0577_zambia6',
        originalItemId: 577,
    });
    assert.ok(ament.fieldEvents.some((event) => event.originalEventId === 'EVENT 99' && event.runtimeFlag === 'ament_gate_route_opened'));
    assert.ok(ament.fieldEvents.every((event) => event.originalSource === 'MAP/18set.arc:18.evt'));
    assert.ok(ament.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(ament.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Ament 1F exposes original episode 19 Uraeus, ice trap, cache, and shard flow', () => {
    const layout = getStoryInteriorLayout('ament_1f');
    const ament = getStoryScenarioEventSequence('ament_1f');
    assert.ok(layout);
    assert.ok(ament);
    const map = new StoryInteriorMap(layout);

    assert.equal(ament.originalSources.sceneScript, 'Wlib/scene19.lsc');
    assert.equal(ament.originalSources.globalScript, 'Glib/gscene19.lsc');
    assert.ok(ament.originalSources.mapFiles.includes('MAP/19.mrc'));
    assert.ok(ament.originalSources.mapFiles.includes('MAP/19set.arc'));
    assert.equal(ament.objectiveRuntimeFlag, 'ament_1f_mystic_shard_found');
    assert.equal(ament.entry.filter((step) => step.kind === 'dialogue').length, 5);
    assert.equal(ament.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(ament.fieldEvents.length, 12);
    assert.deepEqual(ament.fieldEvents.slice(0, 4).map((event) => event.originalEventId), ['EVENT 50', 'EVENT 51', 'EVENT 52', 'EVENT 53']);
    assert.ok(ament.fieldEvents.slice(0, 4).every((event) => event.trigger.includes('MAGIC 0404')));
    assert.deepEqual(ament.fieldEvents.slice(4, 8).map((event) => event.originalEventId), ['EVENT 80', 'EVENT 81', 'EVENT 82', 'EVENT 82']);
    assert.deepEqual(ament.fieldEvents.slice(4, 8).map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'short_bow', originalItemId: 15 },
        { type: 'item', itemId: 'wooden_shield', originalItemId: 110 },
        { type: 'item', itemId: 'magic_t5_body', originalItemId: 854 },
        { type: 'item', itemId: 'web_66_01', originalItemId: 578 },
    ]);
    assert.deepEqual(ament.fieldEvents.slice(8).map((event) => event.originalEventId), ['EVENT 99', 'EVENT 95', 'EVENT 97', 'EVENT 96']);
    assert.deepEqual(ament.fieldEvents.slice(8).map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'orig_ep19_shard_0386', originalItemId: 386 },
        { type: 'item', itemId: 'orig_ep19_shard_0387', originalItemId: 387 },
        { type: 'item', itemId: 'orig_ep19_shard_0388', originalItemId: 388 },
        { type: 'item', itemId: 'orig_ep19_shard_0389', originalItemId: 389 },
    ]);
    assert.ok(ament.fieldEvents.slice(8).every((event) => event.runtimeFlag === 'ament_1f_mystic_shard_found'));
    assert.ok(ament.fieldEvents.every((event) => event.originalSource === 'MAP/19set.arc:19.evt'));
    assert.ok(ament.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(ament.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(ament.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Ament 2F exposes original episode 20 Mephistopheles, lightning trap, cache, and dark sword flow', () => {
    const layout = getStoryInteriorLayout('ament_2f');
    const ament = getStoryScenarioEventSequence('ament_2f');
    assert.ok(layout);
    assert.ok(ament);
    const map = new StoryInteriorMap(layout);

    assert.equal(ament.originalSources.sceneScript, 'Wlib/scene20.lsc');
    assert.equal(ament.originalSources.globalScript, 'Glib/gscene20.lsc');
    assert.ok(ament.originalSources.mapFiles.includes('MAP/20.mrc'));
    assert.ok(ament.originalSources.mapFiles.includes('MAP/20set.arc'));
    assert.ok(ament.originalSources.mapFiles.includes('MAP/2000.mrc'));
    assert.equal(ament.objectiveRuntimeFlag, 'ament_2f_dark_sword_recovered');
    assert.equal(ament.entry.filter((step) => step.kind === 'dialogue').length, 10);
    assert.equal(ament.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(ament.fieldEvents.length, 7);
    assert.equal(ament.fieldEvents[0].originalEventId, 'EVENT 53');
    assert.equal(ament.fieldEvents[0].triggerTiles.length, 30);
    assert.ok(ament.fieldEvents[0].trigger.includes('MAGIC 0905'));
    assert.deepEqual(ament.fieldEvents.filter((event) => event.rewards?.length).map((event) => event.originalEventId), [
        'EVENT 80',
        'EVENT 81',
        'EVENT 82',
        'EVENT 83',
        'EVENT 84',
    ]);
    assert.deepEqual(ament.fieldEvents.filter((event) => event.rewards?.length).map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'orig_story_0207_illusion_ring', originalItemId: 207 },
        { type: 'item', itemId: 'magic_t5_head', originalItemId: 148 },
        { type: 'item', itemId: 'magic_t5_boots', originalItemId: 262 },
        { type: 'item', itemId: 'web_66_51', originalItemId: 632 },
        { type: 'item', itemId: 'magic_t6_body', originalItemId: 855 },
    ]);
    assert.ok(ament.fieldEvents.some((event) => event.originalEventId === 'EVENT 90' && event.runtimeFlag === 'ament_2f_dark_sword_recovered'));
    assert.ok(ament.fieldEvents.every((event) => event.originalSource === 'MAP/20set.arc:20.evt'));
    assert.ok(ament.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(ament.bossDefeat.filter((step) => step.kind === 'dialogue').length, 1);
    assert.equal(ament.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Nergal Castle exposes original episode 21 summoning, relic, and clear flow', () => {
    const layout = getStoryInteriorLayout('nergal_castle');
    const nergal = getStoryScenarioEventSequence('nergal_castle');
    assert.ok(layout);
    assert.ok(nergal);
    const map = new StoryInteriorMap(layout);

    assert.equal(nergal.originalSources.sceneScript, 'Wlib/scene21.lsc');
    assert.equal(nergal.originalSources.globalScript, 'Glib/gscene21.lsc');
    assert.ok(nergal.originalSources.mapFiles.includes('MAP/21.mrc'));
    assert.ok(nergal.originalSources.mapFiles.includes('MAP/21set.arc'));
    assert.ok(nergal.originalSources.mapFiles.includes('MAP/2100.mrc'));
    assert.equal(nergal.objectiveRuntimeFlag, 'nergal_defeated');
    assert.equal(nergal.entry.filter((step) => step.kind === 'dialogue').length, 6);
    assert.equal(nergal.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(nergal.fieldEvents.length, 5);
    assert.deepEqual(nergal.fieldEvents.map((event) => event.originalEventId), ['EVENT 91', 'EVENT 92', 'EVENT 93', 'EVENT 94', 'EVENT 99']);
    assert.deepEqual(nergal.fieldEvents.map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'lance', originalItemId: 974 },
        { type: 'item', itemId: 'void_crystal', originalItemId: 1037 },
        { type: 'item', itemId: 'magic_t6_body', originalItemId: 995 },
        { type: 'item', itemId: 'trade_ember_core', originalItemId: 990 },
        { type: 'item', itemId: 'corrupted_blade', originalItemId: 970 },
    ]);
    assert.ok(nergal.fieldEvents.every((event) => event.originalSource === 'MAP/21set.arc:21.evt'));
    assert.ok(nergal.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(nergal.bossDefeat.filter((step) => step.kind === 'dialogue').length, 0);
    assert.equal(nergal.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('Flame Castle exposes original episode 22 Beramode, relic, and clear flow', () => {
    const layout = getStoryInteriorLayout('flame_castle');
    const flame = getStoryScenarioEventSequence('flame_castle');
    assert.ok(layout);
    assert.ok(flame);
    const map = new StoryInteriorMap(layout);

    assert.equal(flame.originalSources.sceneScript, 'Wlib/scene22.lsc');
    assert.equal(flame.originalSources.globalScript, 'Glib/gscene22.lsc');
    assert.ok(flame.originalSources.mapFiles.includes('MAP/22.mrc'));
    assert.ok(flame.originalSources.mapFiles.includes('MAP/22set.arc'));
    assert.ok(flame.originalSources.mapFiles.includes('MAP/2200.mrc'));
    assert.equal(flame.objectiveRuntimeFlag, 'flame_castle_beramode_defeated');
    assert.equal(flame.entry.filter((step) => step.kind === 'dialogue').length, 4);
    assert.equal(flame.entry.filter((step) => step.kind === 'combatStart').length, 1);
    assert.equal(flame.fieldEvents.length, 5);
    assert.deepEqual(flame.fieldEvents.map((event) => event.originalEventId), ['EVENT 91', 'EVENT 92', 'EVENT 93', 'EVENT 94', 'EVENT 99']);
    assert.deepEqual(flame.fieldEvents.map((event) => event.rewards?.[0]), [
        { type: 'item', itemId: 'void_crystal', originalItemId: 1035 },
        { type: 'item', itemId: 'corrupted_blade', originalItemId: 969 },
        { type: 'item', itemId: 'magic_t6_body', originalItemId: 1015 },
        { type: 'item', itemId: 'web_66_51', originalItemId: 1000 },
        { type: 'item', itemId: 'shadow_cloak', originalItemId: 975 },
    ]);
    assert.ok(flame.fieldEvents.every((event) => event.originalSource === 'MAP/22set.arc:22.evt'));
    assert.ok(flame.fieldEvents.every((event) => event.triggerTiles.every((tile) => map.isWalkable(tile.x, tile.y))));
    assert.equal(flame.bossDefeat.filter((step) => step.kind === 'dialogue').length, 2);
    assert.equal(flame.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
});

test('episodes 23 through 31 use original late interior routes and events', () => {
    for (const episode of [23, 24, 25, 26, 27, 28, 29, 30, 31]) {
        const fact = getOriginalLateStoryFact(episode);
        const mrcFact = getOriginalLateStoryMrcFact(episode);
        const layout = getStoryInteriorLayout(fact.dungeonId);
        assert.ok(layout, `missing interior layout for ${fact.dungeonId}`);
        const map = new StoryInteriorMap(layout);
        assert.deepEqual(map.getBoundsTiles(), { width: mrcFact.width, height: mrcFact.height });
        assert.equal(layout.originalMrc?.source, `MAP/${String(episode).padStart(2, '0')}.mrc`);
        assert.equal(layout.originalMrc?.layerCount, mrcFact.layerCount);
        assert.equal(mrcFact.visualRows.length, mrcFact.height);
        assert.ok(mrcFact.visualRows.every((row) => row.length > 0));
        assert.notEqual(getOriginalLateStoryMrcVisualSymbol(mrcFact, layout.bossTile.x, layout.bossTile.y), null);
        let originalMrcOpenCells = 0;
        for (let y = 1; y < mrcFact.height - 1; y++) {
            for (let x = 1; x < mrcFact.width - 1; x++) {
                const symbol = getOriginalLateStoryMrcVisualSymbol(mrcFact, x, y);
                if (symbol !== 'd' && symbol !== 's') continue;
                originalMrcOpenCells++;
                assert.notEqual(getStoryInteriorTileAt(layout, x, y), TileType.WALL, `${fact.dungeonId}:${x},${y}`);
            }
        }
        assert.ok(originalMrcOpenCells > 0, fact.dungeonId);
        assert.deepEqual(layout.bossTile, getOriginalLateStoryBossTile(episode));
        assert.deepEqual(layout.guardTiles, getOriginalLateStoryGuardTiles(episode));
        const occupiedCombatTiles = [layout.playerStart, layout.bossTile, ...layout.guardTiles];
        assert.equal(
            new Set(occupiedCombatTiles.map((tile) => `${tile.x},${tile.y}`)).size,
            occupiedCombatTiles.length,
            `${fact.dungeonId}:combat spawn tiles must not overlap`
        );
        assert.equal(hasWalkablePath(map, layout.playerStart, layout.bossTile), true, fact.dungeonId);
        const stagingTiles = fact.staging.map((position) => ({ x: position.x, y: position.y }));
        for (const tile of [...layout.guardTiles, ...stagingTiles, layout.entryTile, layout.playerStart, layout.bossTile]) {
            assert.equal(map.isWalkable(tile.x, tile.y), true, `${fact.dungeonId}:${tile.x},${tile.y}`);
        }
        for (const tile of stagingTiles) {
            assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${fact.dungeonId}:staging:${tile.x},${tile.y}`);
        }

        const expectedCaches = getOriginalLateStoryCacheEvents(episode);
        const sequence = getStoryScenarioEventSequence(fact.dungeonId);
        assert.ok(sequence, `missing event sequence for ${fact.dungeonId}`);
        assert.equal(sequence.originalSources.sceneScript, `Wlib/scene${episode}.lsc`);
        assert.ok(sequence.originalSources.mapFiles.includes(fact.setArc));
        assert.equal(sequence.entry.filter((step) => step.kind === 'combatStart').length, 1);
        assert.equal(sequence.bossDefeat.filter((step) => step.kind === 'objective').length, 1);
        assert.equal(sequence.entry[0].durationMs, 650);
        const entryMove = sequence.entry.find((step) => step.kind === 'moveActor');
        assert.ok(entryMove, fact.dungeonId);
        assert.equal(entryMove.actorId, 'hero');
        assert.deepEqual(entryMove.target, { x: layout.playerStart.x, y: layout.playerStart.y - 1 });
        assert.equal(map.isWalkable(entryMove.target.x, entryMove.target.y), true, fact.dungeonId);
        const entryFocusKeys = new Set(sequence.entry.flatMap((step) => {
            const tile = step.kind === 'focus' ? step.target : step.focus;
            return tile ? [`${tile.x},${tile.y}`] : [];
        }));
        for (const tile of stagingTiles) {
            assert.equal(entryFocusKeys.has(`${tile.x},${tile.y}`), true, `${fact.dungeonId}:entry staging focus:${tile.x},${tile.y}`);
        }
        assert.ok(sequence.entry.every((step) => getStoryScenarioEventStepDurationMs(step) > 0), fact.dungeonId);
        assert.ok(sequence.bossDefeat.every((step) => getStoryScenarioEventStepDurationMs(step) > 0), fact.dungeonId);
        assert.ok(getStoryScenarioPresentationDurationMs(sequence.entry) >= 3150, fact.dungeonId);
        assert.deepEqual(sequence.fieldEvents.map((event) => event.originalEventId), expectedCaches.map((event) => `EVENT ${event.eventNumber}`));
        assert.deepEqual(sequence.fieldEvents.map((event) => event.triggerTiles[0]), expectedCaches.map((event) => event.tile));
        assert.ok(sequence.fieldEvents.every((event) => event.steps.every((step) => getStoryScenarioEventStepDurationMs(step) === 700)), fact.dungeonId);
        const actualOriginalItemIds = sequence.fieldEvents.map((event) => {
            const reward = event.rewards?.[0];
            if (!reward || reward.type !== 'item') {
                throw new Error(`Expected item reward for ${fact.dungeonId}:${event.id}`);
            }
            return reward.originalItemId;
        });
        assert.deepEqual(actualOriginalItemIds, expectedCaches.map((event) => event.originalItemId));
        if (episode === 23 || episode === 24) {
            assert.equal(sequence.bossDefeatEvent?.originalEventId, 'EVENT 99');
            assert.equal(sequence.bossDefeatEvent?.rewards?.[0]?.type, 'item');
            assert.equal(sequence.bossDefeatEvent?.rewards?.[0]?.originalItemId, episode === 23 ? 984 : 976);
        } else {
            assert.equal(sequence.bossDefeatEvent, undefined);
        }
        assert.ok(sequence.fieldEvents.every((event) => event.originalSource === `${fact.setArc}:${fact.eventMember}`));
        for (const event of sequence.fieldEvents) {
            for (const tile of event.triggerTiles) {
                assert.equal(map.isWalkable(tile.x, tile.y), true, `${fact.dungeonId}:${event.id}:${tile.x},${tile.y}`);
                assert.equal(hasWalkablePath(map, layout.playerStart, tile), true, `${fact.dungeonId}:${event.id}:${tile.x},${tile.y}`);
            }
        }
    }
});

test('late story MRC visual hints expose original detail and shadow cells', () => {
    const beelzebuth = getOriginalLateStoryMrcFact(23);
    const chosenMark = getOriginalLateStoryMrcFact(27);
    assert.equal(getOriginalLateStoryMrcVisualSymbol(beelzebuth, 19, 28), 'd');
    assert.equal(getOriginalLateStoryMrcVisualSymbol(chosenMark, 31, 17), 's');
    assert.equal(getOriginalLateStoryMrcVisualSymbol(chosenMark, -1, 0), null);
});

test('outdoor field event placement is deterministic, walkable, and shared by callers', () => {
    const worldMap = new WorldMap();
    for (const dungeonId of ['arcadia_plain', 'cacaora_highland', 'remote_village', 'sagunto_port', 'oasis', 'pyramid_front', 'skeria', 'skeria_2', 'valhalla_plain', 'airship']) {
        const sequence = getStoryScenarioEventSequence(dungeonId);
        assert.ok(sequence);
        const placements = getStoryScenarioFieldEventPlacements(dungeonId, worldMap);
        const expectedTileCount = sequence.fieldEvents.reduce((sum, event) => sum + event.triggerTiles.length, 0);
        assert.equal(placements.length, expectedTileCount);

        const uniqueTiles = new Set(placements.map((placement) => `${placement.tile.x},${placement.tile.y}`));
        assert.equal(uniqueTiles.size, placements.length);
        assert.ok(placements.every((placement) => worldMap.isWalkable(placement.tile.x, placement.tile.y)));

        for (const event of sequence.fieldEvents) {
            const eventTiles = getStoryScenarioFieldEventTiles(dungeonId, event, worldMap);
            const placementTiles = placements
                .filter((placement) => placement.eventId === event.id)
                .sort((a, b) => a.triggerIndex - b.triggerIndex)
                .map((placement) => placement.tile);
            assert.deepEqual(eventTiles, placementTiles);
        }
    }
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
        sequence.enemyDefeatEvents?.forEach((event) => event.steps.forEach(collect));
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
