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

const ETNA_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'etnaMouth', nameKey: 'story.interior.room.etnaMouth', x: 12, y: 31, width: 6, height: 4 },
    { id: 'etnaLowerTunnel', nameKey: 'story.interior.room.etnaLowerTunnel', x: 13, y: 24, width: 4, height: 8 },
    { id: 'etnaWestSteamVent', nameKey: 'story.interior.room.etnaWestSteamVent', x: 5, y: 22, width: 9, height: 5 },
    { id: 'etnaEastAshShelf', nameKey: 'story.interior.room.etnaEastAshShelf', x: 16, y: 20, width: 8, height: 5 },
    { id: 'etnaMagmaBridge', nameKey: 'story.interior.room.etnaMagmaBridge', x: 12, y: 15, width: 8, height: 7 },
    { id: 'etnaUpperTunnel', nameKey: 'story.interior.room.etnaUpperTunnel', x: 13, y: 8, width: 5, height: 8 },
    { id: 'etnaGanomasLair', nameKey: 'story.interior.room.etnaGanomasLair', x: 10, y: 3, width: 10, height: 6 },
];

const ETNA_DOORS: StoryInteriorDoor[] = [
    { id: 'cave_mouth', tile: { x: 15, y: 34 }, connects: ['entry'], originalTile: { x: 15, y: 2 } },
    { id: 'lower_tunnel_choke', tile: { x: 15, y: 24 }, connects: ['etnaMouth', 'etnaLowerTunnel'], originalTile: { x: 17, y: 3 } },
    { id: 'magma_bridge_choke', tile: { x: 15, y: 21 }, connects: ['etnaLowerTunnel', 'etnaMagmaBridge'], originalTile: { x: 25, y: 25 } },
    { id: 'ganomas_lair_choke', tile: { x: 15, y: 8 }, connects: ['etnaUpperTunnel', 'etnaGanomasLair'], originalTile: { x: 25, y: 25 }, sealed: true },
];

const ETNA_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'lower_lava_west_1', tile: { x: 12, y: 27 }, originalTile: { x: 14, y: 20 } },
    { id: 'lower_lava_east_1', tile: { x: 17, y: 27 }, originalTile: { x: 18, y: 20 } },
    { id: 'west_vent_lava', tile: { x: 9, y: 23 }, originalTile: { x: 13, y: 25 } },
    { id: 'east_shelf_lava', tile: { x: 20, y: 22 }, originalTile: { x: 25, y: 25 } },
    { id: 'bridge_lava_west_1', tile: { x: 12, y: 17 }, originalTile: { x: 20, y: 33 } },
    { id: 'bridge_lava_west_2', tile: { x: 12, y: 19 }, originalTile: { x: 20, y: 35 } },
    { id: 'bridge_lava_east_1', tile: { x: 19, y: 17 }, originalTile: { x: 30, y: 33 } },
    { id: 'bridge_lava_east_2', tile: { x: 19, y: 19 }, originalTile: { x: 30, y: 35 } },
    { id: 'upper_lava_west', tile: { x: 13, y: 11 }, originalTile: { x: 24, y: 47 } },
    { id: 'upper_lava_east', tile: { x: 17, y: 12 }, originalTile: { x: 27, y: 50 } },
];

const ETNA_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 15, y: 34 }, type: TileType.DUNGEON_ENTRANCE },
    ...ETNA_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.LAVA })),
    { tile: { x: 15, y: 32 }, type: TileType.ROAD },
    { tile: { x: 15, y: 31 }, type: TileType.ROAD },
    { tile: { x: 15, y: 30 }, type: TileType.ROAD },
    { tile: { x: 15, y: 29 }, type: TileType.ROAD },
    { tile: { x: 15, y: 28 }, type: TileType.ROAD },
    { tile: { x: 15, y: 27 }, type: TileType.ROAD },
    { tile: { x: 15, y: 26 }, type: TileType.ROAD },
    { tile: { x: 15, y: 25 }, type: TileType.ROAD },
    { tile: { x: 15, y: 24 }, type: TileType.ROAD },
    { tile: { x: 15, y: 23 }, type: TileType.ROAD },
    { tile: { x: 15, y: 22 }, type: TileType.ROAD },
    { tile: { x: 15, y: 21 }, type: TileType.ROAD },
    { tile: { x: 15, y: 20 }, type: TileType.ROAD },
    { tile: { x: 15, y: 19 }, type: TileType.ROAD },
    { tile: { x: 15, y: 18 }, type: TileType.ROAD },
    { tile: { x: 15, y: 17 }, type: TileType.ROAD },
    { tile: { x: 15, y: 16 }, type: TileType.ROAD },
    { tile: { x: 15, y: 15 }, type: TileType.ROAD },
    { tile: { x: 15, y: 14 }, type: TileType.ROAD },
    { tile: { x: 15, y: 13 }, type: TileType.ROAD },
    { tile: { x: 15, y: 12 }, type: TileType.ROAD },
    { tile: { x: 15, y: 11 }, type: TileType.ROAD },
    { tile: { x: 15, y: 10 }, type: TileType.ROAD },
    { tile: { x: 15, y: 9 }, type: TileType.ROAD },
    { tile: { x: 15, y: 8 }, type: TileType.ROAD },
    { tile: { x: 15, y: 7 }, type: TileType.ROAD },
    { tile: { x: 15, y: 6 }, type: TileType.ROAD },
    { tile: { x: 15, y: 5 }, type: TileType.ROAD },
];

function horizontalOverrides(y: number, xStart: number, xEnd: number, type: TileType): StoryInteriorTileOverride[] {
    return Array.from({ length: xEnd - xStart + 1 }, (_, index) => ({ tile: { x: xStart + index, y }, type }));
}

function verticalOverrides(x: number, yStart: number, yEnd: number, type: TileType): StoryInteriorTileOverride[] {
    return Array.from({ length: yEnd - yStart + 1 }, (_, index) => ({ tile: { x, y: yStart + index }, type }));
}

const SAGRAJAS_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'sagrajasEntry', nameKey: 'story.interior.room.sagrajasEntry', x: 16, y: 34, width: 7, height: 6 },
    { id: 'sagrajasProcessional', nameKey: 'story.interior.room.sagrajasProcessional', x: 18, y: 6, width: 3, height: 34 },
    { id: 'sagrajasSouthReliquary', nameKey: 'story.interior.room.sagrajasSouthReliquary', x: 16, y: 29, width: 7, height: 4 },
    { id: 'sagrajasWestAcolytes', nameKey: 'story.interior.room.sagrajasWestAcolytes', x: 4, y: 24, width: 12, height: 4 },
    { id: 'sagrajasEastAcolytes', nameKey: 'story.interior.room.sagrajasEastAcolytes', x: 24, y: 24, width: 13, height: 4 },
    { id: 'sagrajasInnerNave', nameKey: 'story.interior.room.sagrajasInnerNave', x: 14, y: 14, width: 12, height: 5 },
    { id: 'sagrajasScriptorium', nameKey: 'story.interior.room.sagrajasScriptorium', x: 7, y: 9, width: 27, height: 4 },
    { id: 'sagrajasSanctum', nameKey: 'story.interior.room.sagrajasSanctum', x: 15, y: 4, width: 9, height: 6 },
];

const SAGRAJAS_DOORS: StoryInteriorDoor[] = [
    { id: 'temple_gate', tile: { x: 19, y: 39 }, connects: ['entry'], originalTile: { x: 19, y: 34 } },
    { id: 'south_reliquary_gate', tile: { x: 19, y: 30 }, connects: ['sagrajasEntry', 'sagrajasSouthReliquary'], originalTile: { x: 19, y: 30 } },
    { id: 'inner_nave_gate', tile: { x: 19, y: 16 }, connects: ['sagrajasProcessional', 'sagrajasInnerNave'], originalTile: { x: 19, y: 16 } },
    { id: 'scriptorium_gate', tile: { x: 19, y: 10 }, connects: ['sagrajasProcessional', 'sagrajasScriptorium'], originalTile: { x: 19, y: 10 } },
    { id: 'sanctum_seal', tile: { x: 19, y: 9 }, connects: ['sagrajasScriptorium', 'sagrajasSanctum'], originalTile: { x: 19, y: 9 }, sealed: true },
];

const SAGRAJAS_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'entry_west_pool', tile: { x: 16, y: 36 }, originalTile: { x: 18, y: 39 } },
    { id: 'entry_east_pool', tile: { x: 22, y: 36 }, originalTile: { x: 20, y: 39 } },
    { id: 'south_west_font', tile: { x: 17, y: 30 }, originalTile: { x: 17, y: 29 } },
    { id: 'south_east_font', tile: { x: 22, y: 30 }, originalTile: { x: 22, y: 29 } },
    { id: 'west_acolyte_pillar', tile: { x: 10, y: 26 }, originalTile: { x: 13, y: 25 } },
    { id: 'east_acolyte_pillar', tile: { x: 30, y: 26 }, originalTile: { x: 34, y: 25 } },
    { id: 'inner_west_statue', tile: { x: 15, y: 17 }, originalTile: { x: 16, y: 16 } },
    { id: 'inner_east_statue', tile: { x: 24, y: 17 }, originalTile: { x: 23, y: 16 } },
    { id: 'scriptorium_west_shelf', tile: { x: 12, y: 10 }, originalTile: { x: 10, y: 9 } },
    { id: 'scriptorium_east_shelf', tile: { x: 28, y: 10 }, originalTile: { x: 31, y: 9 } },
    { id: 'sanctum_west_idol', tile: { x: 17, y: 7 }, originalTile: { x: 17, y: 6 } },
    { id: 'sanctum_east_idol', tile: { x: 21, y: 7 }, originalTile: { x: 21, y: 6 } },
];

const SAGRAJAS_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 19, y: 39 }, type: TileType.DUNGEON_ENTRANCE },
    ...SAGRAJAS_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WATER })),
    ...verticalOverrides(19, 6, 39, TileType.ROAD),
    ...horizontalOverrides(30, 17, 21, TileType.ROAD),
    ...horizontalOverrides(25, 5, 35, TileType.ROAD),
    ...horizontalOverrides(16, 15, 24, TileType.ROAD),
    ...horizontalOverrides(10, 8, 32, TileType.ROAD),
    ...horizontalOverrides(6, 17, 21, TileType.ROAD),
];

const PYRAMID_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'pyramidEntry', nameKey: 'story.interior.room.pyramidEntry', x: 16, y: 32, width: 7, height: 7 },
    { id: 'pyramidLowerGallery', nameKey: 'story.interior.room.pyramidLowerGallery', x: 4, y: 27, width: 33, height: 6 },
    { id: 'pyramidProcessional', nameKey: 'story.interior.room.pyramidProcessional', x: 18, y: 5, width: 3, height: 34 },
    { id: 'pyramidWestPassage', nameKey: 'story.interior.room.pyramidWestPassage', x: 9, y: 20, width: 7, height: 10 },
    { id: 'pyramidEastPassage', nameKey: 'story.interior.room.pyramidEastPassage', x: 30, y: 20, width: 7, height: 8 },
    { id: 'pyramidCentralHall', nameKey: 'story.interior.room.pyramidCentralHall', x: 14, y: 16, width: 18, height: 6 },
    { id: 'pyramidUpperPassage', nameKey: 'story.interior.room.pyramidUpperPassage', x: 23, y: 8, width: 3, height: 7 },
    { id: 'pyramidNorthGallery', nameKey: 'story.interior.room.pyramidNorthGallery', x: 9, y: 1, width: 23, height: 8 },
    { id: 'pyramidSanctum', nameKey: 'story.interior.room.pyramidSanctum', x: 15, y: 1, width: 9, height: 8 },
];

const PYRAMID_DOORS: StoryInteriorDoor[] = [
    { id: 'pyramid_outer_gate', tile: { x: 19, y: 38 }, connects: ['entry'], originalTile: { x: 19, y: 26 } },
    { id: 'lower_gallery_gate', tile: { x: 19, y: 32 }, connects: ['pyramidEntry', 'pyramidLowerGallery'], originalTile: { x: 19, y: 32 } },
    { id: 'central_hall_gate', tile: { x: 19, y: 20 }, connects: ['pyramidProcessional', 'pyramidCentralHall'], originalTile: { x: 19, y: 20 } },
    { id: 'pyramid_sanctum_seal', tile: { x: 19, y: 8 }, connects: ['pyramidNorthGallery', 'pyramidSanctum'], originalTile: { x: 19, y: 5 }, sealed: true },
];

const PYRAMID_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'lower_west_sarcophagus', tile: { x: 8, y: 30 }, originalTile: { x: 10, y: 29 } },
    { id: 'lower_east_sarcophagus', tile: { x: 34, y: 29 }, originalTile: { x: 35, y: 27 } },
    { id: 'central_west_rubble', tile: { x: 16, y: 18 }, originalTile: { x: 14, y: 20 } },
    { id: 'central_east_rubble', tile: { x: 30, y: 18 }, originalTile: { x: 31, y: 21 } },
    { id: 'north_west_idol', tile: { x: 12, y: 4 }, originalTile: { x: 10, y: 1 } },
    { id: 'north_east_idol', tile: { x: 28, y: 4 }, originalTile: { x: 30, y: 1 } },
    { id: 'sanctum_west_statue', tile: { x: 17, y: 5 }, originalTile: { x: 17, y: 5 } },
    { id: 'sanctum_east_statue', tile: { x: 21, y: 5 }, originalTile: { x: 21, y: 5 } },
];

const PYRAMID_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 19, y: 38 }, type: TileType.DUNGEON_ENTRANCE },
    ...PYRAMID_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    ...verticalOverrides(19, 5, 38, TileType.ROAD),
    ...horizontalOverrides(30, 4, 36, TileType.ROAD),
    ...horizontalOverrides(21, 14, 31, TileType.ROAD),
    ...horizontalOverrides(8, 10, 30, TileType.ROAD),
    ...horizontalOverrides(5, 16, 22, TileType.ROAD),
    ...horizontalOverrides(2, 10, 30, TileType.ROAD),
];

const AMENT_GATE_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'amentGateEntry', nameKey: 'story.interior.room.amentGateEntry', x: 16, y: 31, width: 7, height: 7 },
    { id: 'amentGateProcessional', nameKey: 'story.interior.room.amentGateProcessional', x: 17, y: 8, width: 5, height: 25 },
    { id: 'amentGateSouthTraps', nameKey: 'story.interior.room.amentGateSouthTraps', x: 4, y: 27, width: 34, height: 5 },
    { id: 'amentGateMiddleTraps', nameKey: 'story.interior.room.amentGateMiddleTraps', x: 14, y: 13, width: 24, height: 9 },
    { id: 'amentGateVoidTrapColumn', nameKey: 'story.interior.room.amentGateVoidTrapColumn', x: 39, y: 11, width: 4, height: 22 },
    { id: 'amentGateFalseDoorHall', nameKey: 'story.interior.room.amentGateFalseDoorHall', x: 6, y: 3, width: 68, height: 5 },
    { id: 'amentGateWestRelicRoom', nameKey: 'story.interior.room.amentGateWestRelicRoom', x: 22, y: 10, width: 16, height: 6 },
    { id: 'amentGateEastRelicRoom', nameKey: 'story.interior.room.amentGateEastRelicRoom', x: 50, y: 10, width: 16, height: 21 },
    { id: 'amentGateAmphitSanctum', nameKey: 'story.interior.room.amentGateAmphitSanctum', x: 9, y: 2, width: 9, height: 7 },
];

const AMENT_GATE_DOORS: StoryInteriorDoor[] = [
    { id: 'ament_gate_front', tile: { x: 19, y: 38 }, connects: ['entry'], originalTile: { x: 19, y: 31 } },
    { id: 'ament_gate_nave', tile: { x: 19, y: 31 }, connects: ['amentGateEntry', 'amentGateProcessional'], originalTile: { x: 19, y: 31 } },
    { id: 'ament_gate_false_93', tile: { x: 6, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 6, y: 3 }, sealed: true },
    { id: 'ament_gate_false_94', tile: { x: 12, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 12, y: 3 }, sealed: true },
    { id: 'ament_gate_false_95', tile: { x: 18, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 18, y: 3 }, sealed: true },
    { id: 'ament_gate_true_99_west', tile: { x: 25, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 25, y: 3 } },
    { id: 'ament_gate_false_96', tile: { x: 54, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 54, y: 3 }, sealed: true },
    { id: 'ament_gate_false_97', tile: { x: 60, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 60, y: 3 }, sealed: true },
    { id: 'ament_gate_true_99_east', tile: { x: 66, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 66, y: 3 } },
    { id: 'ament_gate_false_98', tile: { x: 72, y: 3 }, connects: ['amentGateFalseDoorHall'], originalTile: { x: 72, y: 3 }, sealed: true },
];

const AMENT_GATE_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'ament_gate_south_west_statue', tile: { x: 12, y: 28 }, originalTile: { x: 10, y: 29 } },
    { id: 'ament_gate_south_east_statue', tile: { x: 37, y: 28 }, originalTile: { x: 36, y: 27 } },
    { id: 'ament_gate_middle_west_pillar', tile: { x: 14, y: 18 }, originalTile: { x: 14, y: 20 } },
    { id: 'ament_gate_middle_east_pillar', tile: { x: 31, y: 19 }, originalTile: { x: 31, y: 21 } },
    { id: 'ament_gate_north_west_idol', tile: { x: 22, y: 12 }, originalTile: { x: 23, y: 13 } },
    { id: 'ament_gate_north_east_idol', tile: { x: 65, y: 20 }, originalTile: { x: 64, y: 20 } },
    { id: 'ament_gate_void_67', tile: { x: 40, y: 12 }, originalTile: { x: 39, y: 13 } },
    { id: 'ament_gate_void_68', tile: { x: 42, y: 18 }, originalTile: { x: 42, y: 18 } },
    { id: 'ament_gate_void_69', tile: { x: 39, y: 24 }, originalTile: { x: 39, y: 24 } },
    { id: 'ament_gate_void_70', tile: { x: 42, y: 29 }, originalTile: { x: 42, y: 29 } },
    { id: 'ament_gate_sanctum_west', tile: { x: 11, y: 4 }, originalTile: { x: 11, y: 4 } },
    { id: 'ament_gate_sanctum_east', tile: { x: 15, y: 4 }, originalTile: { x: 15, y: 4 } },
];

const AMENT_GATE_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 19, y: 38 }, type: TileType.DUNGEON_ENTRANCE },
    ...AMENT_GATE_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    ...verticalOverrides(19, 4, 38, TileType.ROAD),
    ...horizontalOverrides(4, 6, 72, TileType.ROAD),
    ...horizontalOverrides(8, 19, 25, TileType.ROAD),
    ...horizontalOverrides(30, 4, 36, TileType.ROAD),
    ...horizontalOverrides(21, 14, 31, TileType.ROAD),
    ...horizontalOverrides(13, 20, 66, TileType.ROAD),
    ...verticalOverrides(64, 7, 21, TileType.ROAD),
];

const AMENT_1F_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'ament1fCentralCross', nameKey: 'story.interior.room.ament1fCentralCross', x: 23, y: 31, width: 11, height: 10 },
    { id: 'ament1fNorthHall', nameKey: 'story.interior.room.ament1fNorthHall', x: 26, y: 3, width: 7, height: 32 },
    { id: 'ament1fSouthHall', nameKey: 'story.interior.room.ament1fSouthHall', x: 26, y: 35, width: 7, height: 34 },
    { id: 'ament1fWestHall', nameKey: 'story.interior.room.ament1fWestHall', x: 1, y: 33, width: 28, height: 7 },
    { id: 'ament1fEastHall', nameKey: 'story.interior.room.ament1fEastHall', x: 29, y: 33, width: 30, height: 7 },
    { id: 'ament1fNorthTrapRoom', nameKey: 'story.interior.room.ament1fNorthTrapRoom', x: 28, y: 12, width: 5, height: 5 },
    { id: 'ament1fEastTrapRoom', nameKey: 'story.interior.room.ament1fEastTrapRoom', x: 50, y: 34, width: 6, height: 5 },
    { id: 'ament1fWestTrapRoom', nameKey: 'story.interior.room.ament1fWestTrapRoom', x: 5, y: 35, width: 6, height: 5 },
    { id: 'ament1fSouthTrapRoom', nameKey: 'story.interior.room.ament1fSouthTrapRoom', x: 26, y: 56, width: 7, height: 5 },
];

const AMENT_1F_DOORS: StoryInteriorDoor[] = [
    { id: 'ament_1f_north_shard', tile: { x: 28, y: 3 }, connects: ['ament1fNorthHall'], originalTile: { x: 28, y: 3 } },
    { id: 'ament_1f_south_shard', tile: { x: 29, y: 68 }, connects: ['ament1fSouthHall'], originalTile: { x: 29, y: 68 } },
    { id: 'ament_1f_west_shard', tile: { x: 1, y: 36 }, connects: ['ament1fWestHall'], originalTile: { x: 1, y: 36 } },
    { id: 'ament_1f_east_shard', tile: { x: 58, y: 35 }, connects: ['ament1fEastHall'], originalTile: { x: 58, y: 35 } },
];

const AMENT_1F_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'ament_1f_north_statue', tile: { x: 28, y: 5 }, originalTile: { x: 28, y: 5 } },
    { id: 'ament_1f_east_statue', tile: { x: 56, y: 34 }, originalTile: { x: 56, y: 34 } },
    { id: 'ament_1f_south_statue', tile: { x: 28, y: 65 }, originalTile: { x: 28, y: 65 } },
    { id: 'ament_1f_west_statue', tile: { x: 1, y: 35 }, originalTile: { x: 1, y: 35 } },
    { id: 'ament_1f_center_north_pillar', tile: { x: 26, y: 33 }, originalTile: { x: 26, y: 33 } },
    { id: 'ament_1f_center_south_pillar', tile: { x: 30, y: 37 }, originalTile: { x: 30, y: 37 } },
    { id: 'ament_1f_ice_east', tile: { x: 54, y: 35 }, originalTile: { x: 52, y: 35 } },
    { id: 'ament_1f_ice_south', tile: { x: 30, y: 59 }, originalTile: { x: 28, y: 59 } },
];

const AMENT_1F_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 28, y: 68 }, type: TileType.DUNGEON_ENTRANCE },
    ...AMENT_1F_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    ...verticalOverrides(28, 3, 68, TileType.ROAD),
    ...horizontalOverrides(35, 1, 58, TileType.ROAD),
    ...horizontalOverrides(36, 1, 58, TileType.ROAD),
    ...horizontalOverrides(13, 29, 51, TileType.ROAD),
    ...horizontalOverrides(14, 29, 31, TileType.ROAD),
    ...horizontalOverrides(37, 6, 8, TileType.ROAD),
    ...horizontalOverrides(58, 27, 29, TileType.ROAD),
];

const AMENT_2F_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'ament2fEntry', nameKey: 'story.interior.room.ament2fEntry', x: 15, y: 60, width: 8, height: 6 },
    { id: 'ament2fCentralAxis', nameKey: 'story.interior.room.ament2fCentralAxis', x: 27, y: 4, width: 5, height: 61 },
    { id: 'ament2fExecutionHall', nameKey: 'story.interior.room.ament2fExecutionHall', x: 22, y: 12, width: 15, height: 7 },
    { id: 'ament2fWestCloneHall', nameKey: 'story.interior.room.ament2fWestCloneHall', x: 8, y: 5, width: 11, height: 11 },
    { id: 'ament2fEastCloneHall', nameKey: 'story.interior.room.ament2fEastCloneHall', x: 42, y: 5, width: 11, height: 11 },
    { id: 'ament2fFlailVault', nameKey: 'story.interior.room.ament2fFlailVault', x: 1, y: 17, width: 8, height: 5 },
    { id: 'ament2fWestVault', nameKey: 'story.interior.room.ament2fWestVault', x: 8, y: 26, width: 10, height: 5 },
    { id: 'ament2fEastVault', nameKey: 'story.interior.room.ament2fEastVault', x: 49, y: 26, width: 5, height: 5 },
    { id: 'ament2fSouthVault', nameKey: 'story.interior.room.ament2fSouthVault', x: 28, y: 58, width: 5, height: 5 },
];

const AMENT_2F_DOORS: StoryInteriorDoor[] = [
    { id: 'ament_2f_front', tile: { x: 18, y: 64 }, connects: ['entry'], originalTile: { x: 18, y: 64 } },
    { id: 'ament_2f_boss_seal', tile: { x: 29, y: 11 }, connects: ['ament2fCentralAxis', 'ament2fExecutionHall'], originalTile: { x: 29, y: 9 }, sealed: true },
];

const AMENT_2F_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'ament_2f_west_clone_710', tile: { x: 9, y: 6 }, originalTile: { x: 9, y: 6 } },
    { id: 'ament_2f_west_clone_720', tile: { x: 16, y: 6 }, originalTile: { x: 16, y: 6 } },
    { id: 'ament_2f_west_clone_730', tile: { x: 8, y: 14 }, originalTile: { x: 8, y: 14 } },
    { id: 'ament_2f_west_clone_740', tile: { x: 15, y: 14 }, originalTile: { x: 15, y: 14 } },
    { id: 'ament_2f_east_clone_750', tile: { x: 42, y: 6 }, originalTile: { x: 42, y: 6 } },
    { id: 'ament_2f_east_clone_760', tile: { x: 50, y: 6 }, originalTile: { x: 50, y: 6 } },
    { id: 'ament_2f_east_clone_770', tile: { x: 44, y: 14 }, originalTile: { x: 44, y: 14 } },
    { id: 'ament_2f_east_clone_780', tile: { x: 51, y: 14 }, originalTile: { x: 51, y: 14 } },
    { id: 'ament_2f_lightning_column', tile: { x: 31, y: 20 }, originalTile: { x: 30, y: 20 } },
    { id: 'ament_2f_dark_sword_seal', tile: { x: 30, y: 7 }, originalTile: { x: 29, y: 7 } },
];

const AMENT_2F_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 18, y: 64 }, type: TileType.DUNGEON_ENTRANCE },
    ...AMENT_2F_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    ...verticalOverrides(29, 4, 64, TileType.ROAD),
    ...horizontalOverrides(64, 18, 29, TileType.ROAD),
    ...horizontalOverrides(28, 9, 50, TileType.ROAD),
    ...horizontalOverrides(19, 1, 29, TileType.ROAD),
    ...horizontalOverrides(14, 8, 51, TileType.ROAD),
    ...horizontalOverrides(6, 9, 50, TileType.ROAD),
];

const NERGAL_CASTLE_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'nergalEntry', nameKey: 'story.interior.room.nergalEntry', x: 16, y: 22, width: 7, height: 6 },
    { id: 'nergalProcessional', nameKey: 'story.interior.room.nergalProcessional', x: 17, y: 7, width: 5, height: 18 },
    { id: 'nergalFourKingsHall', nameKey: 'story.interior.room.nergalFourKingsHall', x: 14, y: 13, width: 12, height: 5 },
    { id: 'nergalLonginusVault', nameKey: 'story.interior.room.nergalLonginusVault', x: 8, y: 22, width: 5, height: 5 },
    { id: 'nergalRelicDais', nameKey: 'story.interior.room.nergalRelicDais', x: 12, y: 5, width: 10, height: 5 },
    { id: 'nergalSanctum', nameKey: 'story.interior.room.nergalSanctum', x: 16, y: 4, width: 7, height: 6 },
];

const NERGAL_CASTLE_DOORS: StoryInteriorDoor[] = [
    { id: 'nergal_front', tile: { x: 19, y: 27 }, connects: ['entry'], originalTile: { x: 19, y: 10 } },
    { id: 'nergal_sanctum_seal', tile: { x: 19, y: 10 }, connects: ['nergalProcessional', 'nergalSanctum'], originalTile: { x: 19, y: 10 }, sealed: true },
];

const NERGAL_CASTLE_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'nergal_west_king_pillar', tile: { x: 15, y: 14 }, originalTile: { x: 16, y: 15 } },
    { id: 'nergal_east_king_pillar', tile: { x: 24, y: 14 }, originalTile: { x: 23, y: 15 } },
    { id: 'nergal_west_pillar', tile: { x: 17, y: 6 }, originalTile: { x: 17, y: 7 } },
    { id: 'nergal_east_pillar', tile: { x: 21, y: 6 }, originalTile: { x: 21, y: 7 } },
];

const NERGAL_CASTLE_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 19, y: 27 }, type: TileType.DUNGEON_ENTRANCE },
    ...NERGAL_CASTLE_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    ...verticalOverrides(19, 7, 27, TileType.ROAD),
    ...horizontalOverrides(15, 16, 23, TileType.ROAD),
    ...horizontalOverrides(24, 9, 19, TileType.ROAD),
    ...horizontalOverrides(7, 14, 21, TileType.ROAD),
];

const FLAME_CASTLE_WALKABLE_AREAS: StoryInteriorRoom[] = [
    { id: 'flameEntry', nameKey: 'story.interior.room.flameEntry', x: 16, y: 34, width: 7, height: 5 },
    { id: 'flameSouthBridge', nameKey: 'story.interior.room.flameSouthBridge', x: 17, y: 22, width: 6, height: 13 },
    { id: 'flameCentralFurnace', nameKey: 'story.interior.room.flameCentralFurnace', x: 13, y: 17, width: 14, height: 8 },
    { id: 'flameWestWing', nameKey: 'story.interior.room.flameWestWing', x: 8, y: 14, width: 8, height: 14 },
    { id: 'flameEastWing', nameKey: 'story.interior.room.flameEastWing', x: 23, y: 14, width: 8, height: 14 },
    { id: 'flameNorthHall', nameKey: 'story.interior.room.flameNorthHall', x: 14, y: 11, width: 11, height: 7 },
    { id: 'flameRelicChamber', nameKey: 'story.interior.room.flameRelicChamber', x: 22, y: 21, width: 7, height: 6 },
    { id: 'flameArmory', nameKey: 'story.interior.room.flameArmory', x: 13, y: 16, width: 7, height: 5 },
    { id: 'flameSanctum', nameKey: 'story.interior.room.flameSanctum', x: 16, y: 10, width: 7, height: 5 },
];

const FLAME_CASTLE_DOORS: StoryInteriorDoor[] = [
    { id: 'flame_front', tile: { x: 19, y: 38 }, connects: ['entry'], originalTile: { x: 19, y: 22 } },
    { id: 'flame_sanctum_seal', tile: { x: 19, y: 15 }, connects: ['flameNorthHall', 'flameSanctum'], originalTile: { x: 19, y: 12 }, sealed: true },
];

const FLAME_CASTLE_BLOCKED_PATHS: StoryInteriorBlockedPath[] = [
    { id: 'flame_west_upper_brazier', tile: { x: 13, y: 13 }, originalTile: { x: 15, y: 13 } },
    { id: 'flame_east_upper_brazier', tile: { x: 25, y: 13 }, originalTile: { x: 23, y: 13 } },
    { id: 'flame_west_lower_brazier', tile: { x: 13, y: 29 }, originalTile: { x: 15, y: 27 } },
    { id: 'flame_east_lower_brazier', tile: { x: 25, y: 29 }, originalTile: { x: 24, y: 27 } },
];

const FLAME_CASTLE_TILE_OVERRIDES: StoryInteriorTileOverride[] = [
    { tile: { x: 19, y: 38 }, type: TileType.DUNGEON_ENTRANCE },
    ...FLAME_CASTLE_BLOCKED_PATHS.map((path) => ({ tile: { ...path.tile }, type: TileType.WALL })),
    ...verticalOverrides(19, 12, 38, TileType.ROAD),
    ...verticalOverrides(15, 13, 27, TileType.ROAD),
    ...verticalOverrides(23, 13, 27, TileType.ROAD),
    ...verticalOverrides(9, 19, 23, TileType.ROAD),
    ...verticalOverrides(30, 19, 23, TileType.ROAD),
    ...horizontalOverrides(13, 15, 23, TileType.ROAD),
    ...horizontalOverrides(15, 11, 28, TileType.ROAD),
    ...horizontalOverrides(18, 15, 24, TileType.ROAD),
    ...horizontalOverrides(20, 9, 30, TileType.ROAD),
    ...horizontalOverrides(23, 9, 30, TileType.ROAD),
    ...horizontalOverrides(27, 15, 24, TileType.ROAD),
];

const BEELZEBUTH_HALL_GUARDS: TilePoint[] = [
    { x: 13, y: 6 }, { x: 11, y: 10 }, { x: 26, y: 6 }, { x: 28, y: 10 },
    { x: 13, y: 34 }, { x: 26, y: 34 }, { x: 11, y: 31 }, { x: 28, y: 31 },
    { x: 5, y: 14 }, { x: 15, y: 10 }, { x: 24, y: 10 }, { x: 19, y: 11 },
    { x: 5, y: 27 }, { x: 15, y: 30 }, { x: 24, y: 30 }, { x: 11, y: 25 },
    { x: 10, y: 15 }, { x: 28, y: 14 }, { x: 14, y: 18 }, { x: 24, y: 18 },
    { x: 19, y: 17 }, { x: 29, y: 25 }, { x: 19, y: 24 },
];

const ASTAROTH_GATE_GUARDS: TilePoint[] = [
    { x: 8, y: 31 }, { x: 15, y: 33 }, { x: 19, y: 33 }, { x: 23, y: 33 },
    { x: 31, y: 31 }, { x: 13, y: 29 }, { x: 26, y: 29 }, { x: 20, y: 26 },
    { x: 20, y: 22 }, { x: 24, y: 19 }, { x: 15, y: 19 }, { x: 8, y: 14 },
    { x: 31, y: 14 }, { x: 13, y: 15 }, { x: 26, y: 15 }, { x: 19, y: 9 },
];

const NERGAL_DEPTHS_GUARDS: TilePoint[] = [
    { x: 14, y: 32 }, { x: 25, y: 32 }, { x: 20, y: 32 }, { x: 14, y: 28 },
    { x: 25, y: 28 }, { x: 20, y: 28 }, { x: 6, y: 23 }, { x: 32, y: 23 },
    { x: 37, y: 28 }, { x: 37, y: 33 }, { x: 37, y: 37 }, { x: 2, y: 28 },
    { x: 2, y: 33 }, { x: 2, y: 37 }, { x: 19, y: 22 }, { x: 6, y: 17 },
    { x: 2, y: 20 }, { x: 2, y: 9 }, { x: 2, y: 14 }, { x: 37, y: 9 },
    { x: 37, y: 14 }, { x: 37, y: 20 }, { x: 33, y: 17 }, { x: 16, y: 15 },
    { x: 23, y: 15 }, { x: 19, y: 18 }, { x: 19, y: 11 }, { x: 15, y: 6 },
    { x: 24, y: 6 },
];

const BEAST_MARK_SHRINE_GUARDS: TilePoint[] = [
    { x: 5, y: 17 }, { x: 17, y: 16 }, { x: 28, y: 16 }, { x: 11, y: 23 },
    { x: 36, y: 26 }, { x: 10, y: 30 }, { x: 25, y: 30 }, { x: 23, y: 21 },
    { x: 4, y: 3 }, { x: 10, y: 7 }, { x: 18, y: 2 }, { x: 28, y: 5 },
];

const CHOSEN_MARK_SHRINE_GUARDS: TilePoint[] = [
    { x: 17, y: 22 }, { x: 4, y: 19 }, { x: 10, y: 16 }, { x: 26, y: 23 },
    { x: 30, y: 17 }, { x: 24, y: 9 }, { x: 16, y: 3 }, { x: 5, y: 6 },
    { x: 34, y: 4 }, { x: 36, y: 26 }, { x: 36, y: 14 }, { x: 22, y: 2 },
];

const ERGION_KEEP_GUARDS: TilePoint[] = [
    { x: 12, y: 28 }, { x: 12, y: 23 }, { x: 12, y: 18 }, { x: 12, y: 12 },
    { x: 4, y: 11 }, { x: 6, y: 31 }, { x: 33, y: 31 }, { x: 27, y: 28 },
    { x: 27, y: 23 }, { x: 27, y: 18 }, { x: 29, y: 12 }, { x: 35, y: 11 },
    { x: 13, y: 5 }, { x: 26, y: 5 }, { x: 19, y: 15 }, { x: 19, y: 24 },
    { x: 19, y: 31 },
];

const MARTANI_BASTION_GUARDS: TilePoint[] = [
    { x: 19, y: 8 }, { x: 12, y: 12 }, { x: 11, y: 26 }, { x: 20, y: 30 },
    { x: 20, y: 20 }, { x: 31, y: 20 }, { x: 40, y: 11 }, { x: 41, y: 28 },
    { x: 48, y: 20 }, { x: 22, y: 14 }, { x: 26, y: 35 }, { x: 39, y: 16 },
    { x: 39, y: 23 },
];

const BLIN_WATCH_GUARDS: TilePoint[] = [
    { x: 7, y: 32 }, { x: 12, y: 35 }, { x: 32, y: 32 }, { x: 28, y: 36 },
    { x: 7, y: 8 }, { x: 11, y: 5 }, { x: 29, y: 7 }, { x: 33, y: 4 },
    { x: 7, y: 17 }, { x: 33, y: 17 }, { x: 19, y: 12 }, { x: 20, y: 29 },
    { x: 12, y: 19 }, { x: 28, y: 19 }, { x: 20, y: 22 },
];

const DEMON_FIXERS_DEN_GUARDS: TilePoint[] = [
    { x: 11, y: 44 }, { x: 16, y: 39 }, { x: 26, y: 34 }, { x: 9, y: 34 },
    { x: 36, y: 26 }, { x: 14, y: 23 }, { x: 30, y: 21 }, { x: 4, y: 19 },
    { x: 22, y: 17 }, { x: 30, y: 13 }, { x: 3, y: 9 }, { x: 37, y: 8 },
    { x: 15, y: 4 }, { x: 29, y: 2 },
];

interface LateOriginalInteriorConfig {
    dungeonId: string;
    displayNameKey: string;
    objectiveKey: string;
    width: number;
    height: number;
    theme: StoryInteriorTheme;
    entryTile: TilePoint;
    playerStart: TilePoint;
    bossTile: TilePoint;
    guardTiles: TilePoint[];
    rooms: StoryInteriorRoom[];
    cacheTiles: TilePoint[];
    characterMarkers?: Array<{ tile: TilePoint; labelKey: string }>;
    blockedPaths?: StoryInteriorBlockedPath[];
}

function cloneTile(tile: TilePoint): TilePoint {
    return { x: tile.x, y: tile.y };
}

function buildLateOriginalInterior(config: LateOriginalInteriorConfig): StoryInteriorLayout {
    const episode = config.objectiveKey.match(/ep(\d+)/)?.[1] ?? '23';
    const blockedPaths = config.blockedPaths ?? [];
    return {
        dungeonId: config.dungeonId,
        displayNameKey: config.displayNameKey,
        width: config.width,
        height: config.height,
        theme: config.theme,
        entryTile: cloneTile(config.entryTile),
        playerStart: cloneTile(config.playerStart),
        guardTiles: config.guardTiles.map(cloneTile),
        bossTile: cloneTile(config.bossTile),
        objectiveKey: config.objectiveKey,
        rooms: [
            { id: 'entry', nameKey: 'story.interior.room.entryHall', x: Math.max(1, config.entryTile.x - 3), y: Math.max(1, config.entryTile.y - 4), width: 7, height: 5 },
            ...config.rooms.map((room) => ({ ...room })),
            { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: Math.max(1, config.bossTile.x - 4), y: Math.max(1, config.bossTile.y - 3), width: 9, height: 7 },
        ],
        props: [
            { kind: 'torch', tile: { x: Math.max(1, config.entryTile.x - 2), y: Math.max(1, config.entryTile.y - 3) } },
            { kind: 'torch', tile: { x: Math.min(config.width - 2, config.entryTile.x + 2), y: Math.max(1, config.entryTile.y - 3) } },
            ...config.cacheTiles.map((tile) => ({ kind: 'crate' as const, tile: cloneTile(tile), labelKey: `story.event.ep${episode}.cache.marker` })),
            ...(config.characterMarkers ?? []).map((marker) => ({ kind: 'banner' as const, tile: cloneTile(marker.tile), labelKey: marker.labelKey })),
            { kind: 'sealedDoor', tile: { x: config.bossTile.x, y: Math.min(config.height - 2, config.bossTile.y + 2) }, labelKey: 'story.interior.prop.sealedDoor' },
            { kind: 'bossSeal', tile: cloneTile(config.bossTile), labelKey: 'story.interior.prop.bossSeal' },
            { kind: 'throne', tile: { x: config.bossTile.x, y: Math.max(1, config.bossTile.y - 1) } },
        ],
        doors: [
            { id: `${config.dungeonId}_front`, tile: cloneTile(config.entryTile), connects: ['entry'], originalTile: cloneTile(config.entryTile) },
            { id: `${config.dungeonId}_boss_seal`, tile: { x: config.bossTile.x, y: Math.min(config.height - 2, config.bossTile.y + 2) }, connects: ['route', 'bossRoom'], originalTile: cloneTile(config.bossTile), sealed: true },
        ],
        blockedPaths: blockedPaths.map((path) => ({ ...path, tile: cloneTile(path.tile), originalTile: path.originalTile ? cloneTile(path.originalTile) : undefined })),
        walkableAreas: config.rooms.map((room) => ({ ...room })),
        tileOverrides: [
            { tile: cloneTile(config.entryTile), type: TileType.DUNGEON_ENTRANCE },
            ...blockedPaths.map((path) => ({ tile: cloneTile(path.tile), type: TileType.WALL })),
            ...verticalOverrides(config.playerStart.x, Math.min(config.playerStart.y, config.bossTile.y), Math.max(config.playerStart.y, config.bossTile.y), TileType.ROAD),
            ...horizontalOverrides(config.bossTile.y, Math.min(config.playerStart.x, config.bossTile.x), Math.max(config.playerStart.x, config.bossTile.x), TileType.ROAD),
        ],
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

const ETNA_VOLCANO_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'etna_volcano',
    displayNameKey: 'story.interior.etna_volcano.name',
    width: 30,
    height: 36,
    theme: 'volcano',
    entryTile: { x: 15, y: 34 },
    playerStart: { x: 15, y: 32 },
    guardTiles: [
        { x: 10, y: 24 },
        { x: 21, y: 22 },
        { x: 14, y: 20 },
        { x: 16, y: 18 },
        { x: 14, y: 12 },
        { x: 16, y: 10 },
        { x: 12, y: 6 },
        { x: 18, y: 6 },
    ],
    bossTile: { x: 15, y: 5 },
    objectiveKey: 'story.interior.etna_volcano.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 12, y: 31, width: 6, height: 4 },
        ...ETNA_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 10, y: 3, width: 10, height: 6 },
    ],
    props: [
        { kind: 'torch', tile: { x: 13, y: 31 } },
        { kind: 'torch', tile: { x: 17, y: 31 } },
        { kind: 'rubble', tile: { x: 12, y: 27 } },
        { kind: 'rubble', tile: { x: 17, y: 27 } },
        { kind: 'rubble', tile: { x: 12, y: 17 } },
        { kind: 'rubble', tile: { x: 19, y: 19 } },
        { kind: 'sealedDoor', tile: { x: 15, y: 8 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'bossSeal', tile: { x: 15, y: 5 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'banner', tile: { x: 14, y: 4 } },
    ],
    doors: ETNA_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: ETNA_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: ETNA_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: ETNA_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const SAGRAJAS_TEMPLE_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'sagrajas_temple',
    displayNameKey: 'story.interior.sagrajas_temple.name',
    width: 40,
    height: 42,
    theme: 'temple',
    entryTile: { x: 19, y: 39 },
    playerStart: { x: 19, y: 35 },
    guardTiles: [
        { x: 18, y: 30 },
        { x: 21, y: 30 },
        { x: 5, y: 25 },
        { x: 13, y: 25 },
        { x: 26, y: 25 },
        { x: 34, y: 25 },
        { x: 16, y: 16 },
        { x: 23, y: 16 },
        { x: 8, y: 10 },
        { x: 15, y: 10 },
    ],
    bossTile: { x: 19, y: 6 },
    objectiveKey: 'story.interior.sagrajas_temple.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 16, y: 34, width: 7, height: 6 },
        ...SAGRAJAS_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 15, y: 4, width: 9, height: 6 },
    ],
    props: [
        { kind: 'torch', tile: { x: 17, y: 34 } },
        { kind: 'torch', tile: { x: 21, y: 34 } },
        { kind: 'banner', tile: { x: 18, y: 30 } },
        { kind: 'banner', tile: { x: 21, y: 30 } },
        { kind: 'rubble', tile: { x: 10, y: 26 } },
        { kind: 'rubble', tile: { x: 30, y: 26 } },
        { kind: 'door', tile: { x: 19, y: 30 } },
        { kind: 'door', tile: { x: 19, y: 16 } },
        { kind: 'door', tile: { x: 19, y: 10 } },
        { kind: 'sealedDoor', tile: { x: 19, y: 9 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'bossSeal', tile: { x: 19, y: 6 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 17, y: 6 }, labelKey: 'story.event.ep07.hagen.marker' },
    ],
    doors: SAGRAJAS_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: SAGRAJAS_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: SAGRAJAS_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: SAGRAJAS_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const PYRAMID_INSIDE_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'pyramid_inside',
    displayNameKey: 'story.interior.pyramid_inside.name',
    width: 40,
    height: 40,
    theme: 'pyramid',
    entryTile: { x: 19, y: 38 },
    playerStart: { x: 19, y: 34 },
    guardTiles: [
        { x: 11, y: 29 },
        { x: 29, y: 30 },
        { x: 14, y: 21 },
        { x: 31, y: 21 },
        { x: 23, y: 14 },
        { x: 25, y: 8 },
        { x: 11, y: 2 },
        { x: 30, y: 2 },
    ],
    bossTile: { x: 19, y: 5 },
    objectiveKey: 'story.interior.pyramid_inside.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 16, y: 32, width: 7, height: 7 },
        ...PYRAMID_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 15, y: 1, width: 9, height: 8 },
    ],
    props: [
        { kind: 'torch', tile: { x: 17, y: 32 } },
        { kind: 'torch', tile: { x: 21, y: 32 } },
        { kind: 'door', tile: { x: 19, y: 32 } },
        { kind: 'door', tile: { x: 19, y: 20 } },
        { kind: 'sealedDoor', tile: { x: 19, y: 8 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'rubble', tile: { x: 8, y: 30 } },
        { kind: 'rubble', tile: { x: 34, y: 29 } },
        { kind: 'crate', tile: { x: 20, y: 16 }, labelKey: 'story.event.ep13.chest.marker' },
        { kind: 'crate', tile: { x: 20, y: 32 }, labelKey: 'story.event.ep13.chest.marker' },
        { kind: 'crate', tile: { x: 11, y: 2 }, labelKey: 'story.event.ep13.chest.marker' },
        { kind: 'crate', tile: { x: 30, y: 2 }, labelKey: 'story.event.ep13.chest.marker' },
        { kind: 'bossSeal', tile: { x: 19, y: 5 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 19, y: 3 } },
    ],
    doors: PYRAMID_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: PYRAMID_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: PYRAMID_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: PYRAMID_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const AMENT_GATE_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'ament_gate',
    displayNameKey: 'story.interior.ament_gate.name',
    width: 78,
    height: 40,
    theme: 'ament',
    entryTile: { x: 19, y: 38 },
    playerStart: { x: 19, y: 34 },
    guardTiles: [
        { x: 7, y: 4 },
        { x: 13, y: 4 },
        { x: 21, y: 4 },
        { x: 29, y: 4 },
        { x: 56, y: 4 },
        { x: 62, y: 4 },
        { x: 68, y: 4 },
        { x: 72, y: 4 },
        { x: 58, y: 25 },
    ],
    bossTile: { x: 13, y: 5 },
    objectiveKey: 'story.interior.ament_gate.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 16, y: 31, width: 7, height: 7 },
        ...AMENT_GATE_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 9, y: 2, width: 9, height: 7 },
    ],
    props: [
        { kind: 'torch', tile: { x: 17, y: 31 } },
        { kind: 'torch', tile: { x: 21, y: 31 } },
        { kind: 'door', tile: { x: 19, y: 31 } },
        { kind: 'crate', tile: { x: 28, y: 4 }, labelKey: 'story.event.ep18.cache.marker' },
        { kind: 'crate', tile: { x: 53, y: 4 }, labelKey: 'story.event.ep18.cache.marker' },
        { kind: 'crate', tile: { x: 25, y: 4 }, labelKey: 'story.event.ep18.cache.marker' },
        { kind: 'sealedDoor', tile: { x: 6, y: 3 }, labelKey: 'story.event.ep18.falseDoor.marker' },
        { kind: 'sealedDoor', tile: { x: 12, y: 3 }, labelKey: 'story.event.ep18.falseDoor.marker' },
        { kind: 'sealedDoor', tile: { x: 18, y: 3 }, labelKey: 'story.event.ep18.falseDoor.marker' },
        { kind: 'door', tile: { x: 25, y: 3 }, labelKey: 'story.event.ep18.trueDoor.marker' },
        { kind: 'sealedDoor', tile: { x: 54, y: 3 }, labelKey: 'story.event.ep18.falseDoor.marker' },
        { kind: 'sealedDoor', tile: { x: 60, y: 3 }, labelKey: 'story.event.ep18.falseDoor.marker' },
        { kind: 'door', tile: { x: 66, y: 3 }, labelKey: 'story.event.ep18.trueDoor.marker' },
        { kind: 'sealedDoor', tile: { x: 72, y: 3 }, labelKey: 'story.event.ep18.falseDoor.marker' },
        { kind: 'bossSeal', tile: { x: 13, y: 5 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 13, y: 4 } },
    ],
    doors: AMENT_GATE_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: AMENT_GATE_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: AMENT_GATE_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: AMENT_GATE_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const AMENT_1F_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'ament_1f',
    displayNameKey: 'story.interior.ament_1f.name',
    width: 60,
    height: 70,
    theme: 'ament',
    entryTile: { x: 28, y: 68 },
    playerStart: { x: 28, y: 35 },
    guardTiles: [
        { x: 28, y: 31 },
        { x: 28, y: 40 },
        { x: 23, y: 35 },
        { x: 33, y: 35 },
        { x: 30, y: 14 },
        { x: 52, y: 36 },
        { x: 7, y: 37 },
        { x: 28, y: 58 },
        { x: 31, y: 60 },
    ],
    bossTile: { x: 28, y: 40 },
    objectiveKey: 'story.interior.ament_1f.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 26, y: 63, width: 7, height: 6 },
        ...AMENT_1F_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 23, y: 31, width: 11, height: 10 },
    ],
    props: [
        { kind: 'torch', tile: { x: 26, y: 35 } },
        { kind: 'torch', tile: { x: 30, y: 35 } },
        { kind: 'crate', tile: { x: 29, y: 36 }, labelKey: 'story.event.ep19.cache.marker' },
        { kind: 'crate', tile: { x: 51, y: 13 }, labelKey: 'story.event.ep19.cache.marker' },
        { kind: 'crate', tile: { x: 31, y: 60 }, labelKey: 'story.event.ep19.cache.marker' },
        { kind: 'sealedDoor', tile: { x: 28, y: 3 }, labelKey: 'story.event.ep19.shard.marker' },
        { kind: 'sealedDoor', tile: { x: 29, y: 68 }, labelKey: 'story.event.ep19.shard.marker' },
        { kind: 'sealedDoor', tile: { x: 1, y: 36 }, labelKey: 'story.event.ep19.shard.marker' },
        { kind: 'sealedDoor', tile: { x: 58, y: 35 }, labelKey: 'story.event.ep19.shard.marker' },
        { kind: 'bossSeal', tile: { x: 28, y: 40 }, labelKey: 'story.interior.prop.bossSeal' },
    ],
    doors: AMENT_1F_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: AMENT_1F_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: AMENT_1F_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: AMENT_1F_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const AMENT_2F_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'ament_2f',
    displayNameKey: 'story.interior.ament_2f.name',
    width: 60,
    height: 68,
    theme: 'ament',
    entryTile: { x: 18, y: 64 },
    playerStart: { x: 18, y: 62 },
    guardTiles: [
        { x: 23, y: 14 },
        { x: 25, y: 14 },
        { x: 27, y: 14 },
        { x: 31, y: 14 },
        { x: 33, y: 14 },
        { x: 35, y: 14 },
        { x: 23, y: 16 },
        { x: 25, y: 16 },
        { x: 33, y: 16 },
        { x: 35, y: 16 },
    ],
    bossTile: { x: 29, y: 9 },
    objectiveKey: 'story.interior.ament_2f.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 15, y: 60, width: 8, height: 6 },
        ...AMENT_2F_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 26, y: 5, width: 8, height: 8 },
    ],
    props: [
        { kind: 'torch', tile: { x: 17, y: 60 } },
        { kind: 'torch', tile: { x: 21, y: 60 } },
        { kind: 'door', tile: { x: 29, y: 28 } },
        { kind: 'sealedDoor', tile: { x: 29, y: 11 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'crate', tile: { x: 9, y: 28 }, labelKey: 'story.event.ep20.cache.marker' },
        { kind: 'crate', tile: { x: 30, y: 4 }, labelKey: 'story.event.ep20.cache.marker' },
        { kind: 'crate', tile: { x: 50, y: 28 }, labelKey: 'story.event.ep20.cache.marker' },
        { kind: 'crate', tile: { x: 31, y: 60 }, labelKey: 'story.event.ep20.cache.marker' },
        { kind: 'bossSeal', tile: { x: 29, y: 9 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 29, y: 7 }, labelKey: 'story.event.ep20.darkSword.marker' },
    ],
    doors: AMENT_2F_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: AMENT_2F_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: AMENT_2F_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: AMENT_2F_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const NERGAL_CASTLE_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'nergal_castle',
    displayNameKey: 'story.interior.nergal_castle.name',
    width: 40,
    height: 29,
    theme: 'ament',
    entryTile: { x: 19, y: 27 },
    playerStart: { x: 19, y: 23 },
    guardTiles: [
        { x: 16, y: 15 },
        { x: 18, y: 15 },
        { x: 21, y: 15 },
        { x: 23, y: 15 },
    ],
    bossTile: { x: 19, y: 7 },
    objectiveKey: 'story.interior.nergal_castle.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 16, y: 22, width: 7, height: 6 },
        ...NERGAL_CASTLE_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 16, y: 4, width: 7, height: 6 },
    ],
    props: [
        { kind: 'torch', tile: { x: 17, y: 22 } },
        { kind: 'torch', tile: { x: 21, y: 22 } },
        { kind: 'door', tile: { x: 19, y: 24 } },
        { kind: 'sealedDoor', tile: { x: 19, y: 10 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'crate', tile: { x: 9, y: 24 }, labelKey: 'story.event.ep21.cache.marker' },
        { kind: 'crate', tile: { x: 14, y: 7 }, labelKey: 'story.event.ep21.cache.marker' },
        { kind: 'banner', tile: { x: 16, y: 15 }, labelKey: 'story.event.ep21.fourKings.succubus' },
        { kind: 'banner', tile: { x: 18, y: 15 }, labelKey: 'story.event.ep21.fourKings.beramode' },
        { kind: 'banner', tile: { x: 21, y: 15 }, labelKey: 'story.event.ep21.fourKings.beelzebuth' },
        { kind: 'banner', tile: { x: 23, y: 15 }, labelKey: 'story.event.ep21.fourKings.astaroth' },
        { kind: 'bossSeal', tile: { x: 19, y: 7 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 19, y: 6 } },
    ],
    doors: NERGAL_CASTLE_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: NERGAL_CASTLE_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: NERGAL_CASTLE_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: NERGAL_CASTLE_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const FLAME_CASTLE_LAYOUT: StoryInteriorLayout = {
    dungeonId: 'flame_castle',
    displayNameKey: 'story.interior.flame_castle.name',
    width: 40,
    height: 40,
    theme: 'volcano',
    entryTile: { x: 19, y: 38 },
    playerStart: { x: 19, y: 22 },
    guardTiles: [
        { x: 15, y: 13 },
        { x: 19, y: 13 },
        { x: 23, y: 13 },
        { x: 9, y: 19 },
        { x: 9, y: 22 },
        { x: 15, y: 27 },
        { x: 24, y: 27 },
        { x: 11, y: 15 },
        { x: 11, y: 26 },
        { x: 19, y: 27 },
        { x: 30, y: 19 },
        { x: 30, y: 22 },
        { x: 28, y: 15 },
        { x: 28, y: 26 },
        { x: 19, y: 20 },
        { x: 15, y: 20 },
        { x: 23, y: 20 },
        { x: 19, y: 17 },
    ],
    bossTile: { x: 19, y: 12 },
    objectiveKey: 'story.interior.flame_castle.objective',
    rooms: [
        { id: 'entry', nameKey: 'story.interior.room.entryHall', x: 16, y: 34, width: 7, height: 5 },
        ...FLAME_CASTLE_WALKABLE_AREAS.map((room) => ({ ...room })),
        { id: 'bossRoom', nameKey: 'story.interior.room.bossRoom', x: 16, y: 10, width: 7, height: 5 },
    ],
    props: [
        { kind: 'torch', tile: { x: 17, y: 34 } },
        { kind: 'torch', tile: { x: 21, y: 34 } },
        { kind: 'door', tile: { x: 19, y: 34 } },
        { kind: 'sealedDoor', tile: { x: 19, y: 15 }, labelKey: 'story.interior.prop.sealedDoor' },
        { kind: 'crate', tile: { x: 24, y: 23 }, labelKey: 'story.event.ep22.cache.marker' },
        { kind: 'crate', tile: { x: 15, y: 18 }, labelKey: 'story.event.ep22.cache.marker' },
        { kind: 'banner', tile: { x: 15, y: 13 }, labelKey: 'story.event.ep22.guard.fireSpirit' },
        { kind: 'banner', tile: { x: 23, y: 13 }, labelKey: 'story.event.ep22.guard.fireSpirit' },
        { kind: 'bossSeal', tile: { x: 19, y: 12 }, labelKey: 'story.interior.prop.bossSeal' },
        { kind: 'throne', tile: { x: 19, y: 11 } },
    ],
    doors: FLAME_CASTLE_DOORS.map((door) => ({ ...door, tile: { ...door.tile }, originalTile: door.originalTile ? { ...door.originalTile } : undefined })),
    blockedPaths: FLAME_CASTLE_BLOCKED_PATHS.map((path) => ({ ...path, tile: { ...path.tile }, originalTile: path.originalTile ? { ...path.originalTile } : undefined })),
    walkableAreas: FLAME_CASTLE_WALKABLE_AREAS.map((room) => ({ ...room })),
    tileOverrides: FLAME_CASTLE_TILE_OVERRIDES.map((override) => ({ ...override, tile: { ...override.tile } })),
};

const BEELZEBUTH_HALL_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'beelzebuth_hall',
    displayNameKey: 'story.interior.beelzebuth_hall.name',
    objectiveKey: 'story.interior.beelzebuth_hall.objective',
    width: 40,
    height: 40,
    theme: 'ament',
    entryTile: { x: 19, y: 38 },
    playerStart: { x: 19, y: 31 },
    bossTile: { x: 19, y: 28 },
    guardTiles: BEELZEBUTH_HALL_GUARDS,
    rooms: [
        { id: 'beelzebuthNorthVault', nameKey: 'story.interior.room.beelzebuthNorthVault', x: 10, y: 5, width: 20, height: 10 },
        { id: 'beelzebuthThroneHall', nameKey: 'story.interior.room.beelzebuthThroneHall', x: 5, y: 14, width: 29, height: 12 },
        { id: 'beelzebuthRelicHall', nameKey: 'story.interior.room.beelzebuthRelicHall', x: 5, y: 24, width: 25, height: 8 },
        { id: 'beelzebuthEntry', nameKey: 'story.interior.room.entryHall', x: 10, y: 31, width: 20, height: 8 },
    ],
    cacheTiles: [{ x: 19, y: 19 }, { x: 15, y: 27 }],
    characterMarkers: [
        { tile: { x: 18, y: 15 }, labelKey: 'story.event.speaker.nergal' },
        { tile: { x: 21, y: 15 }, labelKey: 'story.event.speaker.beelzebuth' },
    ],
});

const ASTAROTH_GATE_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'astaroth_gate',
    displayNameKey: 'story.interior.astaroth_gate.name',
    objectiveKey: 'story.interior.astaroth_gate.objective',
    width: 40,
    height: 38,
    theme: 'ament',
    entryTile: { x: 19, y: 36 },
    playerStart: { x: 19, y: 33 },
    bossTile: { x: 19, y: 14 },
    guardTiles: ASTAROTH_GATE_GUARDS,
    rooms: [
        { id: 'astarothOuterGate', nameKey: 'story.interior.room.astarothOuterGate', x: 7, y: 29, width: 26, height: 7 },
        { id: 'astarothProcessional', nameKey: 'story.interior.room.astarothProcessional', x: 12, y: 18, width: 16, height: 12 },
        { id: 'astarothTwinReliquary', nameKey: 'story.interior.room.astarothTwinReliquary', x: 7, y: 10, width: 26, height: 9 },
        { id: 'astarothFinalGate', nameKey: 'story.interior.room.astarothFinalGate', x: 15, y: 5, width: 9, height: 7 },
    ],
    cacheTiles: [{ x: 16, y: 26 }, { x: 27, y: 11 }],
    characterMarkers: [{ tile: { x: 19, y: 7 }, labelKey: 'story.event.speaker.astaroth' }],
});

const NERGAL_DEPTHS_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'nergal_depths',
    displayNameKey: 'story.interior.nergal_depths.name',
    objectiveKey: 'story.interior.nergal_depths.objective',
    width: 40,
    height: 40,
    theme: 'ament',
    entryTile: { x: 19, y: 38 },
    playerStart: { x: 19, y: 23 },
    bossTile: { x: 19, y: 6 },
    guardTiles: NERGAL_DEPTHS_GUARDS,
    rooms: [
        { id: 'nergalDepthsSouth', nameKey: 'story.interior.room.nergalDepthsSouth', x: 1, y: 27, width: 38, height: 12 },
        { id: 'nergalDepthsCrossing', nameKey: 'story.interior.room.nergalDepthsCrossing', x: 1, y: 15, width: 38, height: 13 },
        { id: 'nergalDepthsWestCells', nameKey: 'story.interior.room.nergalDepthsCells', x: 1, y: 8, width: 8, height: 13 },
        { id: 'nergalDepthsEastCells', nameKey: 'story.interior.room.nergalDepthsCells', x: 31, y: 8, width: 8, height: 13 },
        { id: 'nergalDepthsTrialHall', nameKey: 'story.interior.room.nergalDepthsTrialHall', x: 14, y: 5, width: 12, height: 11 },
    ],
    cacheTiles: [{ x: 12, y: 18 }, { x: 12, y: 32 }],
    characterMarkers: [{ tile: { x: 19, y: 7 }, labelKey: 'story.event.speaker.nergal' }],
});

const BEAST_MARK_SHRINE_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'beast_mark_shrine',
    displayNameKey: 'story.interior.beast_mark_shrine.name',
    objectiveKey: 'story.interior.beast_mark_shrine.objective',
    width: 40,
    height: 40,
    theme: 'temple',
    entryTile: { x: 15, y: 38 },
    playerStart: { x: 15, y: 37 },
    bossTile: { x: 36, y: 3 },
    guardTiles: BEAST_MARK_SHRINE_GUARDS,
    rooms: [
        { id: 'beastMarkSouthSeal', nameKey: 'story.interior.room.beastMarkSouthSeal', x: 2, y: 28, width: 34, height: 10 },
        { id: 'beastMarkCentralShrine', nameKey: 'story.interior.room.beastMarkCentralShrine', x: 4, y: 15, width: 34, height: 12 },
        { id: 'beastMarkNorthShrine', nameKey: 'story.interior.room.beastMarkNorthShrine', x: 3, y: 1, width: 35, height: 9 },
    ],
    cacheTiles: [{ x: 15, y: 21 }],
    characterMarkers: [{ tile: { x: 36, y: 3 }, labelKey: 'story.event.speaker.markGuardian' }],
});

const CHOSEN_MARK_SHRINE_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'chosen_mark_shrine',
    displayNameKey: 'story.interior.chosen_mark_shrine.name',
    objectiveKey: 'story.interior.chosen_mark_shrine.objective',
    width: 40,
    height: 30,
    theme: 'temple',
    entryTile: { x: 20, y: 28 },
    playerStart: { x: 20, y: 25 },
    bossTile: { x: 20, y: 16 },
    guardTiles: CHOSEN_MARK_SHRINE_GUARDS,
    rooms: [
        { id: 'chosenMarkSouthSeal', nameKey: 'story.interior.room.chosenMarkSouthSeal', x: 3, y: 18, width: 34, height: 9 },
        { id: 'chosenMarkCentralShrine', nameKey: 'story.interior.room.chosenMarkCentralShrine', x: 4, y: 12, width: 33, height: 8 },
        { id: 'chosenMarkSealBridge', nameKey: 'story.interior.room.chosenMarkCentralShrine', x: 16, y: 8, width: 9, height: 6 },
        { id: 'chosenMarkNorthShrine', nameKey: 'story.interior.room.chosenMarkNorthShrine', x: 4, y: 1, width: 33, height: 9 },
    ],
    cacheTiles: [{ x: 16, y: 6 }, { x: 31, y: 17 }],
    characterMarkers: [{ tile: { x: 20, y: 16 }, labelKey: 'story.event.speaker.markGuardian' }],
});

const ERGION_KEEP_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'ergion_keep',
    displayNameKey: 'story.interior.ergion_keep.name',
    objectiveKey: 'story.interior.ergion_keep.objective',
    width: 40,
    height: 36,
    theme: 'castle',
    entryTile: { x: 14, y: 34 },
    playerStart: { x: 14, y: 32 },
    bossTile: { x: 19, y: 10 },
    guardTiles: ERGION_KEEP_GUARDS,
    rooms: [
        { id: 'ergionSouthernKeep', nameKey: 'story.interior.room.ergionSouthernKeep', x: 5, y: 27, width: 30, height: 7 },
        { id: 'ergionProcessional', nameKey: 'story.interior.room.ergionProcessional', x: 10, y: 4, width: 20, height: 29 },
        { id: 'ergionWestReliquary', nameKey: 'story.interior.room.ergionCrossHall', x: 2, y: 5, width: 12, height: 7 },
        { id: 'ergionCrossHall', nameKey: 'story.interior.room.ergionCrossHall', x: 2, y: 10, width: 35, height: 9 },
    ],
    cacheTiles: [{ x: 6, y: 16 }, { x: 35, y: 17 }, { x: 14, y: 31 }, { x: 2, y: 7 }],
    characterMarkers: [
        { tile: { x: 19, y: 7 }, labelKey: 'story.event.speaker.ergion' },
        { tile: { x: 19, y: 13 }, labelKey: 'story.event.speaker.blin' },
    ],
});

const MARTANI_BASTION_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'martani_bastion',
    displayNameKey: 'story.interior.martani_bastion.name',
    objectiveKey: 'story.interior.martani_bastion.objective',
    width: 60,
    height: 38,
    theme: 'castle',
    entryTile: { x: 14, y: 36 },
    playerStart: { x: 14, y: 32 },
    bossTile: { x: 43, y: 19 },
    guardTiles: MARTANI_BASTION_GUARDS,
    rooms: [
        { id: 'martaniSouthBastion', nameKey: 'story.interior.room.martaniSouthBastion', x: 10, y: 26, width: 20, height: 10 },
        { id: 'martaniCentralBastion', nameKey: 'story.interior.room.martaniCentralBastion', x: 10, y: 6, width: 40, height: 28 },
        { id: 'martaniEastReliquary', nameKey: 'story.interior.room.martaniEastReliquary', x: 35, y: 10, width: 22, height: 18 },
    ],
    cacheTiles: [{ x: 35, y: 13 }, { x: 40, y: 20 }, { x: 55, y: 24 }],
    characterMarkers: [
        { tile: { x: 19, y: 7 }, labelKey: 'story.event.speaker.martani' },
        { tile: { x: 19, y: 13 }, labelKey: 'story.event.speaker.blin' },
    ],
});

const BLIN_WATCH_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'blin_watch',
    displayNameKey: 'story.interior.blin_watch.name',
    objectiveKey: 'story.interior.blin_watch.objective',
    width: 40,
    height: 38,
    theme: 'castle',
    entryTile: { x: 14, y: 36 },
    playerStart: { x: 14, y: 32 },
    bossTile: { x: 20, y: 19 },
    guardTiles: BLIN_WATCH_GUARDS,
    rooms: [
        { id: 'blinLowerWatch', nameKey: 'story.interior.room.blinLowerWatch', x: 6, y: 28, width: 28, height: 9 },
        { id: 'blinMiddleWatch', nameKey: 'story.interior.room.blinMiddleWatch', x: 6, y: 14, width: 28, height: 15 },
        { id: 'blinUpperWatch', nameKey: 'story.interior.room.blinUpperWatch', x: 6, y: 3, width: 28, height: 12 },
    ],
    cacheTiles: [{ x: 15, y: 21 }, { x: 33, y: 25 }, { x: 6, y: 25 }, { x: 23, y: 12 }],
    characterMarkers: [
        { tile: { x: 19, y: 7 }, labelKey: 'story.event.speaker.blin' },
        { tile: { x: 19, y: 13 }, labelKey: 'story.event.speaker.jade' },
    ],
});

const DEMON_FIXERS_DEN_LAYOUT = buildLateOriginalInterior({
    dungeonId: 'demon_fixers_den',
    displayNameKey: 'story.interior.demon_fixers_den.name',
    objectiveKey: 'story.interior.demon_fixers_den.objective',
    width: 40,
    height: 47,
    theme: 'ament',
    entryTile: { x: 14, y: 45 },
    playerStart: { x: 14, y: 32 },
    bossTile: { x: 22, y: 11 },
    guardTiles: DEMON_FIXERS_DEN_GUARDS,
    rooms: [
        { id: 'demonFixerLowerDen', nameKey: 'story.interior.room.demonFixerLowerDen', x: 2, y: 32, width: 36, height: 14 },
        { id: 'demonFixerMiddleDen', nameKey: 'story.interior.room.demonFixerMiddleDen', x: 2, y: 16, width: 36, height: 18 },
        { id: 'demonFixerUpperDen', nameKey: 'story.interior.room.demonFixerUpperDen', x: 2, y: 8, width: 36, height: 10 },
        { id: 'demonFixerSummoningDen', nameKey: 'story.interior.room.demonFixerSummoningDen', x: 14, y: 1, width: 16, height: 9 },
    ],
    cacheTiles: [{ x: 33, y: 17 }, { x: 8, y: 21 }, { x: 21, y: 17 }],
    characterMarkers: [
        { tile: { x: 19, y: 7 }, labelKey: 'story.event.speaker.demonFixer' },
        { tile: { x: 19, y: 13 }, labelKey: 'story.event.speaker.jade' },
    ],
});

export const STORY_INTERIOR_LAYOUTS: StoryInteriorLayout[] = [
    BURGOS_CASTLE_LAYOUT,
    ZAMORA_FORTRESS_LAYOUT,
    ETNA_VOLCANO_LAYOUT,
    SAGRAJAS_TEMPLE_LAYOUT,
    PYRAMID_INSIDE_LAYOUT,
    AMENT_GATE_LAYOUT,
    AMENT_1F_LAYOUT,
    AMENT_2F_LAYOUT,
    NERGAL_CASTLE_LAYOUT,
    FLAME_CASTLE_LAYOUT,
    BEELZEBUTH_HALL_LAYOUT,
    ASTAROTH_GATE_LAYOUT,
    NERGAL_DEPTHS_LAYOUT,
    BEAST_MARK_SHRINE_LAYOUT,
    CHOSEN_MARK_SHRINE_LAYOUT,
    ERGION_KEEP_LAYOUT,
    MARTANI_BASTION_LAYOUT,
    BLIN_WATCH_LAYOUT,
    DEMON_FIXERS_DEN_LAYOUT,
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
