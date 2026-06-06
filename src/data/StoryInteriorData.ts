import type { TilePoint } from '../field/FieldPathing';
import { TILE_PROPERTIES, TileType } from '../map/Tile';

export type StoryInteriorTheme = 'castle' | 'volcano' | 'temple' | 'pyramid' | 'ament';
export type StoryInteriorPropKind = 'torch' | 'crate' | 'banner' | 'door' | 'sealedDoor' | 'throne' | 'bossSeal' | 'rubble';

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

export interface StoryInteriorDoor {
    id: string;
    tile: TilePoint;
    connects: string[];
    originalTile?: TilePoint;
    sealed?: boolean;
    requiredRuntimeFlag?: string;
    requiredQuestItemId?: string;
    lockedLogKey?: string;
}

export interface StoryInteriorBlockedPath {
    id: string;
    tile: TilePoint;
    originalTile?: TilePoint;
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
    objectiveKey?: string;
    rooms: StoryInteriorRoom[];
    props: StoryInteriorProp[];
    doors?: StoryInteriorDoor[];
    blockedPaths?: StoryInteriorBlockedPath[];
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

const BURGOS_DOORS: StoryInteriorDoor[] = [
    { id: 'front_gate', tile: { x: 1, y: 9 }, connects: ['entry'], originalTile: { x: 14, y: 28 } },
    { id: 'west_barracks_door', tile: { x: 8, y: 7 }, connects: ['gatehouse', 'westBarracks'], originalTile: { x: 9, y: 10 } },
    { id: 'east_barracks_door', tile: { x: 8, y: 11 }, connects: ['gatehouse', 'eastBarracks'], originalTile: { x: 30, y: 10 } },
    { id: 'great_hall_door', tile: { x: 14, y: 9 }, connects: ['gatehouse', 'greatHall'], originalTile: { x: 14, y: 28 } },
    { id: 'inner_keep_door', tile: { x: 21, y: 9 }, connects: ['greatHall', 'innerKeep'], originalTile: { x: 19, y: 10 } },
    {
        id: 'throne_room_seal',
        tile: { x: 27, y: 9 },
        connects: ['innerKeep', 'throneRoom'],
        originalTile: { x: 19, y: 7 },
        sealed: true,
        requiredRuntimeFlag: 'burgos_key',
        requiredQuestItemId: 'quest_burgos_key',
        lockedLogKey: 'story.event.ep01.field.key.lockedDoor',
    },
];

const BURGOS_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'west_barracks_north_rubble', tile: { x: 8, y: 5 }, originalTile: { x: 8, y: 5 } },
    { id: 'east_barracks_south_rubble', tile: { x: 8, y: 13 }, originalTile: { x: 8, y: 13 } },
    { id: 'great_hall_north_barricade', tile: { x: 14, y: 6 }, originalTile: { x: 12, y: 28 } },
    { id: 'great_hall_south_barricade', tile: { x: 14, y: 12 }, originalTile: { x: 16, y: 28 } },
    { id: 'central_rubble_north', tile: { x: 17, y: 8 }, originalTile: { x: 18, y: 9 } },
    { id: 'central_rubble_south', tile: { x: 17, y: 10 }, originalTile: { x: 20, y: 9 } },
    { id: 'inner_keep_north_barricade', tile: { x: 20, y: 6 }, originalTile: { x: 18, y: 7 } },
    { id: 'inner_keep_south_barricade', tile: { x: 20, y: 12 }, originalTile: { x: 20, y: 10 } },
    { id: 'throne_approach_north_wall', tile: { x: 24, y: 6 }, originalTile: { x: 18, y: 7 } },
    { id: 'throne_approach_south_wall', tile: { x: 24, y: 12 }, originalTile: { x: 20, y: 10 } },
    { id: 'throne_room_north_pillar', tile: { x: 28, y: 8 }, originalTile: { x: 18, y: 7 } },
    { id: 'throne_room_south_pillar', tile: { x: 28, y: 10 }, originalTile: { x: 20, y: 10 } },
];

const BURGOS_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 1, y: 9 }, type: TileType.DUNGEON_ENTRANCE },
    ...BURGOS_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
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

const ZAMORA_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'zamoraGate', nameKey: 'story.interior.room.zamoraGate', x: 2, y: 8, width: 6, height: 5 },
    { id: 'zamoraWestCrypt', nameKey: 'story.interior.room.zamoraWestCrypt', x: 7, y: 4, width: 7, height: 5 },
    { id: 'zamoraEastCrypt', nameKey: 'story.interior.room.zamoraEastCrypt', x: 7, y: 12, width: 7, height: 5 },
    { id: 'zamoraCrossHall', nameKey: 'story.interior.room.zamoraCrossHall', x: 7, y: 9, width: 14, height: 3 },
    { id: 'zamoraCentralKeep', nameKey: 'story.interior.room.zamoraCentralKeep', x: 13, y: 7, width: 8, height: 7 },
    { id: 'zamoraNorthRampart', nameKey: 'story.interior.room.zamoraNorthRampart', x: 16, y: 3, width: 8, height: 5 },
    { id: 'zamoraSouthRampart', nameKey: 'story.interior.room.zamoraSouthRampart', x: 16, y: 13, width: 8, height: 5 },
    { id: 'zamoraFenrisChamber', nameKey: 'story.interior.room.zamoraFenrisChamber', x: 23, y: 7, width: 7, height: 7 },
];

const ZAMORA_DOORS: StoryInteriorDoor[] = [
    { id: 'front_gate', tile: { x: 1, y: 10 }, connects: ['entry'], originalTile: { x: 21, y: 17 } },
    { id: 'west_crypt_door', tile: { x: 10, y: 8 }, connects: ['zamoraGate', 'zamoraWestCrypt'], originalTile: { x: 20, y: 22 } },
    { id: 'east_crypt_door', tile: { x: 10, y: 12 }, connects: ['zamoraGate', 'zamoraEastCrypt'], originalTile: { x: 22, y: 20 } },
    { id: 'central_keep_door', tile: { x: 14, y: 10 }, connects: ['zamoraCrossHall', 'zamoraCentralKeep'], originalTile: { x: 21, y: 17 } },
    { id: 'fenris_chamber_seal', tile: { x: 23, y: 10 }, connects: ['zamoraCentralKeep', 'zamoraFenrisChamber'], originalTile: { x: 22, y: 20 }, sealed: true },
];

const ZAMORA_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'west_crypt_broken_arch', tile: { x: 8, y: 6 }, originalTile: { x: 19, y: 21 } },
    { id: 'east_crypt_broken_arch', tile: { x: 8, y: 14 }, originalTile: { x: 20, y: 22 } },
    { id: 'north_rampart_collapse', tile: { x: 18, y: 5 }, originalTile: { x: 21, y: 17 } },
    { id: 'south_rampart_collapse', tile: { x: 18, y: 15 }, originalTile: { x: 22, y: 20 } },
    { id: 'central_pillar_north', tile: { x: 17, y: 8 }, originalTile: { x: 20, y: 22 } },
    { id: 'central_pillar_south', tile: { x: 17, y: 12 }, originalTile: { x: 19, y: 21 } },
    { id: 'fenris_chamber_north_pillar', tile: { x: 25, y: 8 }, originalTile: { x: 21, y: 17 } },
    { id: 'fenris_chamber_south_pillar', tile: { x: 25, y: 12 }, originalTile: { x: 22, y: 20 } },
];

const ZAMORA_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 1, y: 10 }, type: TileType.DUNGEON_ENTRANCE },
    ...ZAMORA_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    { tile: { x: 4, y: 10 }, type: TileType.ROAD },
    { tile: { x: 5, y: 10 }, type: TileType.ROAD },
    { tile: { x: 6, y: 10 }, type: TileType.ROAD },
    { tile: { x: 7, y: 10 }, type: TileType.ROAD },
    { tile: { x: 8, y: 10 }, type: TileType.ROAD },
    { tile: { x: 9, y: 10 }, type: TileType.ROAD },
    { tile: { x: 10, y: 10 }, type: TileType.ROAD },
    { tile: { x: 11, y: 10 }, type: TileType.ROAD },
    { tile: { x: 12, y: 10 }, type: TileType.ROAD },
    { tile: { x: 13, y: 10 }, type: TileType.ROAD },
    { tile: { x: 14, y: 10 }, type: TileType.ROAD },
    { tile: { x: 15, y: 10 }, type: TileType.ROAD },
    { tile: { x: 16, y: 10 }, type: TileType.ROAD },
    { tile: { x: 17, y: 10 }, type: TileType.ROAD },
    { tile: { x: 18, y: 10 }, type: TileType.ROAD },
    { tile: { x: 19, y: 10 }, type: TileType.ROAD },
    { tile: { x: 20, y: 10 }, type: TileType.ROAD },
    { tile: { x: 21, y: 10 }, type: TileType.ROAD },
    { tile: { x: 22, y: 10 }, type: TileType.ROAD },
    { tile: { x: 23, y: 10 }, type: TileType.ROAD },
    { tile: { x: 24, y: 10 }, type: TileType.ROAD },
    { tile: { x: 25, y: 10 }, type: TileType.ROAD },
    { tile: { x: 26, y: 10 }, type: TileType.ROAD },
    { tile: { x: 27, y: 10 }, type: TileType.ROAD },
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
        { kind: 'door', tile: { x: 8, y: 7 } },
        { kind: 'door', tile: { x: 8, y: 11 } },
        { kind: 'door', tile: { x: 14, y: 9 } },
        { kind: 'door', tile: { x: 21, y: 9 } },
        { kind: 'rubble', tile: { x: 17, y: 8 } },
        { kind: 'rubble', tile: { x: 17, y: 10 } },
        { kind: 'sealedDoor', tile: { x: 27, y: 9 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'bossSeal', tile: { x: 30, y: 9 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 31, y: 9 } },
    ],
    doors: BURGOS_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: BURGOS_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: BURGOS_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: BURGOS_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const ZAMORA_FORTRESS_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'zamora_fortress',
    displayNameKey: 'story.interior.zamora_fortress.name',
    width: 32,
    height: 21,
    theme: 'castle',
    entryTile: { x: 1, y: 10 },
    playerStart: { x: 4, y: 10 },
    guardTiles: [
        { x: 9, y: 7 },
        { x: 9, y: 13 },
        { x: 14, y: 9 },
        { x: 14, y: 11 },
        { x: 20, y: 6 },
        { x: 20, y: 14 },
        { x: 23, y: 9 },
        { x: 23, y: 11 },
    ],
    bossTile: { x: 27, y: 10 },
    objectiveKey: 'story.interior.zamora_fortress.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 2, y: 8, width: 6, height: 5 },
        ...ZAMORA_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 23, y: 7, width: 7, height: 7 },
    ],
    props: [
        { kind: 'torch', tile: { x: 3, y: 8 } },
        { kind: 'torch', tile: { x: 3, y: 12 } },
        { kind: 'crate', tile: { x: 11, y: 5 } },
        { kind: 'crate', tile: { x: 11, y: 15 } },
        { kind: 'banner', tile: { x: 15, y: 8 } },
        { kind: 'banner', tile: { x: 15, y: 12 } },
        { kind: 'door', tile: { x: 10, y: 8 } },
        { kind: 'door', tile: { x: 10, y: 12 } },
        { kind: 'door', tile: { x: 14, y: 10 } },
        { kind: 'rubble', tile: { x: 17, y: 8 } },
        { kind: 'rubble', tile: { x: 17, y: 12 } },
        { kind: 'sealedDoor', tile: { x: 23, y: 10 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'bossSeal', tile: { x: 27, y: 10 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 28, y: 10 } },
    ],
    doors: ZAMORA_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: ZAMORA_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: ZAMORA_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: ZAMORA_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

export const STORY_INTERIOR_LAYOUTS: StoryInteriorLayout[] = [
    BURGOS_CASTLE_LAYOUT,
    ZAMORA_FORTRESS_LAYOUT,
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
