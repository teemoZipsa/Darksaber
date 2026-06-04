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

export const STORY_INTERIOR_LAYOUTS: StoryInteriorLayout[] = [
    layout('burgos_castle', 'castle'),
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
