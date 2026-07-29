import type { Character } from '../../character/Character';
import type { Player } from '../../entity/Player';
import type { EntityDisplayInfo } from '../../ui/EntityInfoUI';
import type { AttackCue, FieldActor, FieldEnemy, FieldMagicState } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { TacticalMarker } from '../../field/TacticalMarkers';
import type { RaidModifier } from '../../raid/RaidModifiers';
import type { WorldPhase } from './WorldRaidSession';

export type WorldActionMode = 'move' | 'attack' | 'interact';

export interface WorldRaidRenderModel {
    active: boolean;
    elapsedSeconds: number;
    limitSeconds: number;
    departureTownId: string;
    timerAdvancing: boolean;
    modifier: RaidModifier | null;
    bounty: {
        targetName: string;
        affixLabels: string[];
        riskLabel: string;
        proofSecured: boolean;
        targetAlive: boolean;
    } | null;
}

export interface WorldStoryInteriorRenderModel {
    active: boolean;
    dungeonId: string | null;
    title: string;
    objectiveKey: string;
    briefingLines?: string[];
    enemiesLeft: number;
}

export interface WorldRenderModel {
    worldTime: number;
    phase: WorldPhase;
    player: Player;
    activeCharacter: Character | null;
    controlledActor: FieldActor | null;
    partyActors: FieldActor[];
    tutorialActors: Player[];
    fieldEnemies: FieldEnemy[];
    activeTurnActorId: string | null;
    remainingActionPoints: number;
    majorActionUsedThisTurn: boolean;
    selectedActorId: string | null;
    selectedEnemyId: string | null;
    selectedLootId: string | null;
    selectedDisplayInfo: EntityDisplayInfo | null;
    hasSelection: boolean;
    actionMode: WorldActionMode | null;
    actionTiles: Set<string>;
    pathPreviewTiles: TilePoint[];
    actionMenuOpen: boolean;
    fieldMagicState: FieldMagicState;
    hoverTile: TilePoint;
    hoverTileWalkable: boolean;
    terrainHoverLines: string[];
    tacticalMarkers: TacticalMarker[];
    selectedLootTile: TilePoint | null;
    attackCues: AttackCue[];
    combatLog: string[];
    gold: number;
    worldName: string;
    raid: WorldRaidRenderModel;
    storyInterior: WorldStoryInteriorRenderModel;
}
