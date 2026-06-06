import type { TilePoint } from '../field/FieldPathing';
import { TILE_PROPERTIES, TileType } from '../map/Tile';

export type StoryInteriorTheme = 'castle' | 'volcano' | 'temple' | 'pyramid' | 'ament';
export type StoryInteriorPropKind = 'torch' | 'crate' | 'banner' | 'sealedDoor' | 'throne' | 'bossSeal' | 'rubble';

export interface StoryInteriorRoom {
    id: string;
    nameKey: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface StoryInteriorProp {
    kind: StoryInteriorPropKind;
    tile: TilePoint;
    labelKey?: string;
}

export interface StoryInteriorTileOverride {
    tile: TilePoint;
    type: TileType;
}

export interface StoryInteriorLayout {
    dungeonId: string;
    displayNameKey: string;
    width: number;
    height: number;
    theme: StoryInteriorTheme;
    entryTile: TilePoint;
    playerStart: TilePoint;
    guardTiles: TilePoint[];
    bossTile: TilePoint;
    rooms: StoryInteriorRoom[];
    props: StoryInteriorProp[];
    walkableAreas?: StoryInteriorRoom[];
    tileOverrides?: StoryInteriorTileOverride[];
}

const BASE_WIDTH = 26;
const BASE_HEIGHT = 17;
const BASE_ENTRY_TILE: TilePoint = { x: 1, y: 8 };
const BASE_PLAYER_START: TilePoint = { x: 3, y: 8 };
const BASE_GUARD_TILES: TilePoint[] = [
    { x: 8, y: 6 },
    { x: 8, y: 10 },
    { x: 11, y: 5 },
    { x: 11, y: 11 },
    { x: 14, y: 6 },
    { x: 14, y: 10 },
    { x: 16, y: 5 },
    { x: 16, y: 11 },
    { x: 19, y: 6 },
    { x: 19, y: 10 },
];
const BASE_BOSS_TILE: TilePoint = { x: 22, y: 8 };
const BASE_ROOMS: StoryInteriorRoom[] = [
    { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 2, y: 6, width: 4, height: 5 },
    { id: 'guardNorth', nameKey: 'story.interior.room.guardPost', x: 6, y: 3, width: 7, height: 4 },
    { id: 'guardSouth', nameKey: 'story.interior.room.armory', x: 6, y: 10, width: 7, height: 4 },
    { id: 'mainHall', nameKey: 'story.interior.room.mainHall', x: 6, y: 6, width: 9, height: 5 },
    { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 15, y: 4, width: 9, height: 9 },
];
const BASE_PROPS: StoryInteriorProp[] = [
    { kind: 'torch', tile: { x: 3, y: 6 } },
    { kind: 'torch', tile: { x: 3, y: 10 } },
    { kind: 'crate', tile: { x: 6, y: 4 } },
    { kind: 'crate', tile: { x: 6, y: 12 } },
    { kind: 'banner', tile: { x: 10, y: 4 } },
    { kind: 'banner', tile: { x: 10, y: 12 } },
    { kind: 'sealedDoor', tile: { x: 15, y: 8 }, labelKey: 'story.interior.prop.sealedDoor' },
    { kind: 'bossSeal', tile: { x: 22, y: 8 }, labelKey: 'story.interior.prop.bossSeal' },
    { kind: 'throne', tile: { x: 23, y: 8 } },
];

const BURGOS_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'gatehouse', nameKey: 'story.interior.room.burgosGatehouse', x: 2, y: 7, width: 6, height: 5 },
    { id: 'westBarracks', nameKey: 'story.interior.room.burgosWestBarracks', x: 7, y: 3, width: 7, height: 6 },
    { id: 'eastBarracks', nameKey: 'story.interior.room.burgosEastBarracks', x: 7, y: 10, width: 7, height: 6 },
    { id: 'greatHall', nameKey: 'story.interior.room.burgosGreatHall', x: 13, y: 6, width: 9, height: 7 },
    { id: 'innerKeep', nameKey: 'story.interior.room.burgosInnerKeep', x: 21, y: 5, width: 7, height: 9 },
    { id: 'throneRoom', nameKey: 'story.interior.room.burgosThroneRoom', x: 27, y: 7, width: 5, height: 5 },
];

const BURGOS_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 1, y: 9 }, type: TileType.DUNGEON_ENTRANCE },
    { tile: { x: 8, y: 5 }, type: TileType.WALL },
    { tile: { x: 8, y: 13 }, type: TileType.WALL },
    { tile: { x: 14, y: 6 }, type: TileType.WALL },
    { tile: { x: 14, y: 12 }, type: TileType.WALL },
    { tile: { x: 17, y: 8 }, type: TileType.WALL },
    { tile: { x: 17, y: 10 }, type: TileType.WALL },
    { tile: { x: 20, y: 6 }, type: TileType.WALL },
    { tile: { x: 20, y: 12 }, type: TileType.WALL },
    { tile: { x: 24, y: 6 }, type: TileType.WALL },
    { tile: { x: 24, y: 12 }, type: TileType.WALL },
    { tile: { x: 28, y: 8 }, type: TileType.WALL },
    { tile: { x: 28, y: 10 }, type: TileType.WALL },
    { tile: { x: 4, y: 9 }, type: TileType.ROAD },
    { tile: { x: 5, y: 9 }, type: TileType.ROAD },
    { tile: { x: 6, y: 9 }, type: TileType.ROAD },
    { tile: { x: 7, y: 9 }, type: TileType.ROAD },
    { tile: { x: 8, y: 9 }, type: TileType.ROAD },
    { tile: { x: 9, y: 9 }, type: TileType.ROAD },
    { tile: { x: 10, y: 9 }, type: TileType.ROAD },
    { tile: { x: 11, y: 9 }, type: TileType.ROAD },
    { tile: { x: 12, y: 9 }, type: TileType.ROAD },
    { tile: { x: 13, y: 9 }, type: TileType.ROAD },
    { tile: { x: 14, y: 9 }, type: TileType.ROAD },
    { tile: { x: 15, y: 9 }, type: TileType.ROAD },
    { tile: { x: 16, y: 9 }, type: TileType.ROAD },
    { tile: { x: 17, y: 9 }, type: TileType.ROAD },
    { tile: { x: 18, y: 9 }, type: TileType.ROAD },
    { tile: { x: 19, y: 9 }, type: TileType.ROAD },
    { tile: { x: 20, y: 9 }, type: TileType.ROAD },
    { tile: { x: 21, y: 9 }, type: TileType.ROAD },
    { tile: { x: 22, y: 9 }, type: TileType.ROAD },
    { tile: { x: 23, y: 9 }, type: TileType.ROAD },
    { tile: { x: 24, y: 9 }, type: TileType.ROAD },
    { tile: { x: 25, y: 9 }, type: TileType.ROAD },
    { tile: { x: 26, y: 9 }, type: TileType.ROAD },
    { tile: { x: 27, y: 9 }, type: TileType.ROAD },
    { tile: { x: 29, y: 9 }, type: TileType.ROAD },
];

function layout(dungeonId: string, theme: StoryInteriorTheme): StoryInteriorLayout {
    return {
        dungeonId,
        displayNameKey: `story.interior.${dungeonId}.name`,
        width: BASE_WIDTH,
        height: BASE_HEIGHT,
        theme,
        entryTile: { ...BASE_ENTRY_TILE },
        playerStart: { ...BASE_PLAYER_START },
        guardTiles: BASE_GUARD_TILES.map((tile) => ({ ...tile })),
        bossTile: { ...BASE_BOSS_TILE },
        rooms: BASE_ROOMS.map((room) => ({ ...room })),
        props: BASE_PROPS.map((prop) => ({ ...prop, tile: { ...prop.tile } })),
    };
}

const BURGOS_CASTLE_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'burgos_castle',
    displayNameKey: 'story.interior.burgos_castle.name',
    width: 34,
    height: 19,
    theme: 'castle',
    entryTile: { x: 1, y: 9 },
    playerStart: { x: 4, y: 9 },
    guardTiles: [
        { x: 9, y: 6 },
        { x: 9, y: 12 },
        { x: 13, y: 8 },
        { x: 13, y: 10 },
        { x: 18, y: 7 },
        { x: 18, y: 11 },
        { x: 23, y: 7 },
        { x: 23, y: 11 },
    ],
    bossTile: { x: 30, y: 9 },
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 2, y: 7, width: 6, height: 5 },
        ...BURGOS_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 27, y: 7, width: 5, height: 5 },
    ],
    props: [
        { kind: 'torch', tile: { x: 3, y: 7 } },
        { kind: 'torch', tile: { x: 3, y: 11 } },
        { kind: 'crate', tile: { x: 10, y: 5 } },
        { kind: 'crate', tile: { x: 10, y: 13 } },
        { kind: 'banner', tile: { x: 16, y: 7 } },
        { kind: 'banner', tile: { x: 16, y: 11 } },
        { kind: 'rubble', tile: { x: 17, y: 8 } },
        { kind: 'rubble', tile: { x: 17, y: 10 } },
        { kind: 'sealedDoor', tile: { x: 27, y: 9 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'bossSeal', tile: { x: 30, y: 9 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 31, y: 9 } },
    ],
    walkableAreas: BURGOS_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: BURGOS_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

export const STORY_INTERIOR_LAYOUTS: StoryInteriorLayout[] = [
    BURGOS_CASTLE_LAYOUT,
    layout('zamora_fortress', 'castle'),
    layout('etna_volcano', 'volcano'),
    layout('sagrajas_temple', 'temple'),
    layout('pyramid_inside', 'pyramid'),
    layout('ament_gate', 'ament'),
    layout('ament_1f', 'ament'),
    layout('ament_2f', 'ament'),
];

export function getStoryInteriorLayout(dungeonId: string): StoryInteriorLayout | null {
    return STORY_INTERIOR_LAYOUTS.find((entry) => entry.dungeonId === dungeonId) ?? null;
}

export function isStoryInteriorDungeon(dungeonId: string): boolean {
    return Boolean(getStoryInteriorLayout(dungeonId));
}

export function getStoryInteriorTileAt(layout: StoryInteriorLayout, tx: number, ty: number): TileType {
    if (tx < 0 || ty < 0 || tx >= layout.width || ty >= layout.height) return TileType.WALL;
    if (tx === 0 || ty === 0 || tx === layout.width - 1 || ty === layout.height - 1) return TileType.WALL;
    if (tx === layout.entryTile.x && ty === layout.entryTile.y) return TileType.DUNGEON_ENTRANCE;
    const override = layout.tileOverrides?.find((entry) => entry.tile.x === tx && entry.tile.y === ty);
    if (override) return override.type;

    if (layout.walkableAreas) {
        const inWalkableArea = layout.walkableAreas.some((area) =>
            tx >= area.x
            && tx < area.x + area.width
            && ty >= area.y
            && ty < area.y + area.height
        );
        return inWalkableArea ? TileType.STONE : TileType.WALL;
    }

    const inMainHall = tx >= 2 && tx <= 23 && ty >= 6 && ty <= 10;
    const inNorthRoom = tx >= 6 && tx <= 12 && ty >= 3 && ty <= 6;
    const inSouthRoom = tx >= 6 && tx <= 12 && ty >= 10 && ty <= 13;
    const inBossRoom = tx >= 15 && tx <= 23 && ty >= 4 && ty <= 12;
    if (!(inMainHall || inNorthRoom || inSouthRoom || inBossRoom)) return TileType.WALL;

    const pillarTiles = new Set(['7,4', '7,12', '13,6', '13,10', '18,5', '18,11', '21,5', '21,11']);
    if (pillarTiles.has(`${tx},${ty}`)) return TileType.WALL;

    if (tx === layout.bossTile.x && ty === layout.bossTile.y) return TileType.ROAD;
    if (ty === 8 || (tx >= 15 && tx <= 23 && ty >= 7 && ty <= 9)) return TileType.ROAD;
    return layout.theme === 'volcano' ? TileType.SAND : TileType.STONE;
}

export function isStoryInteriorWalkable(layout: StoryInteriorLayout, tx: number, ty: number): boolean {
    return Boolean(TILE_PROPERTIES[getStoryInteriorTileAt(layout, tx, ty)]?.walkable);
}
