import type { StatusEffect } from '../src/combat/StatusEffects';
import type { CharacterStats } from '../src/data/Stats';
import type { MonsterId } from '../src/data/MonsterCatalog';
import type { EnemyRole } from '../src/field/EnemyAI';
import type { StoryScenarioMissionKind } from '../src/data/StoryScenarioData';
import type { Enemy } from '../src/entity/Enemy';
import type { TilePoint } from '../src/field/FieldPathing';
import type { FieldNestState } from '../src/field/SpawnResolver';
import type { WorldLootContainerType } from '../src/loot/WorldLootTypes';
import type { WorldRealm } from '../src/map/BiomeMask';
import type { RaidModifier } from '../src/raid/RaidModifiers';
import type {
    AutoLootGrantMessage,
    CombatEventMessage,
    GridSnapshot,
    NetFacing,
    ScenarioEnemyDefeatEventMessage,
    WorldServerMessage,
} from '../src/net/WorldProtocol';
import type { CharacterSave } from './AuthStore';

export interface ServerActor {
    id: string;
    ownerPlayerId: string;
    localActorId: string;
    name: string;
    classLineId: string;
    currentTier: number;
    level: number;
    tile: TilePoint;
    stats: CharacterStats;
    statuses: StatusEffect[];
    actionGauge: number;
    remainingAp: number;
    majorActionUsed: boolean;
    facing: NetFacing;
    isDead: boolean;
    magicLoadout: string[];
    skillUpgradeLevels: Record<string, number>;
}

export interface ServerPlayer {
    id: string;
    accountId?: string;
    characterId?: string;
    resumeToken: string;
    originHubId: string;
    departureTownId: string;
    elapsedSeconds: number;
    kills: number;
    carriedWeight: number;
    carriedItems: Map<string, number>;
    raidGoldReward: number;
    raidModifier: RaidModifier;
    completedQuestIds: Set<string>;
    enteredDungeonIds: Set<string>;
    completedDungeonIds: Set<string>;
    fieldEventFlagsByDungeonId: Map<string, Set<string>>;
    activeDungeonId: string | null;
    active: boolean;
    ghost: boolean;
    disconnectedAt: number | null;
    actorIds: string[];
    saveSnapshot?: CharacterSave;
}

export interface ServerEnemy {
    enemy: Enemy;
    monsterId?: MonsterId;
    nestKey?: string;
    scenarioPlayerId?: string;
    scenarioDungeonId?: string;
    scenarioObjective?: boolean;
    home: TilePoint;
    wanderSeed: number;
}

export interface ServerScenarioState {
    playerId: string;
    dungeonId: string;
    missionKind: StoryScenarioMissionKind;
    returnTile: TilePoint | null;
    enemyIds: string[];
    objectiveEnemyId: string | null;
    completed: boolean;
}

export interface CompleteEnemyKillResult {
    autoLootGrant?: AutoLootGrantMessage;
    scenarioEnemyDefeatEvent?: ScenarioEnemyDefeatEventMessage;
}

export interface WorldSessionTickResult {
    events: CombatEventMessage[];
    perPlayerMessages: Array<{ playerId: string; message: WorldServerMessage }>;
}

export interface WorldSessionMessageResult {
    replies: WorldServerMessage[];
    broadcasts: WorldServerMessage[];
}

export interface WorldSessionDebugCounts {
    activePlayers: number;
    ghostPlayers: number;
    enemies: number;
    lootLocks: number;
}

export interface WorldSessionOptions {
    realm?: WorldRealm;
    ghostGraceMs?: number;
    sessionEpoch?: number;
    logger?: (message: string) => void;
}

export interface WorldJoinContext {
    accountId?: string;
    characterId?: string;
    completedQuestIds?: string[];
    shardId?: string;
    saveSnapshot?: CharacterSave;
}

export interface WorldSessionPersistentPlayer {
    id: string;
    accountId?: string;
    characterId?: string;
    resumeToken: string;
    originHubId: string;
    departureTownId: string;
    elapsedSeconds: number;
    kills: number;
    carriedWeight: number;
    carriedItems: Array<[string, number]>;
    raidGoldReward: number;
    raidModifier?: RaidModifier;
    completedQuestIds: string[];
    enteredDungeonIds: string[];
    completedDungeonIds: string[];
    fieldEventFlagsByDungeonId: Array<[string, string[]]>;
    activeDungeonId: string | null;
    active: boolean;
    ghost: boolean;
    disconnectedAt: number | null;
    actorIds: string[];
    saveSnapshot?: CharacterSave;
}

export interface WorldSessionPersistentEnemy {
    id: string;
    name: string;
    level: number;
    color: string;
    role: EnemyRole;
    monsterId?: MonsterId;
    tile: TilePoint;
    home: TilePoint;
    stats: CharacterStats;
    statuses: StatusEffect[];
    actionGauge: number;
    facing: NetFacing;
    aggroRange: number;
    expReward: number;
    isAggro: boolean;
    isBoss: boolean;
    lootTableId: string;
    aiMemory: {
        turnCount: number;
        cooldowns: Record<string, number>;
        lastPattern?: string;
    };
    nestKey?: string;
    scenarioPlayerId?: string;
    scenarioDungeonId?: string;
    scenarioObjective?: boolean;
    wanderSeed: number;
}

export interface WorldSessionPersistentLoot {
    id: string;
    tile: TilePoint;
    sourceLabel: string;
    kind: 'chest' | 'corpse';
    containerType?: WorldLootContainerType;
    opened: boolean;
    unlocked?: boolean;
    gridSnapshot: GridSnapshot;
    overflowItemIds: string[];
}

export interface WorldSessionPersistentSnapshot {
    version: 1;
    realm: WorldRealm;
    shardId: string;
    sessionEpoch: number;
    seq: number;
    nextPlayerId: number;
    nextEnemyId: number;
    nextLootId: number;
    lastTickAt: number | null;
    lastNestRefreshAt: number;
    players: WorldSessionPersistentPlayer[];
    actors: ServerActor[];
    enemies: WorldSessionPersistentEnemy[];
    nestStates: FieldNestState[];
    scenarioStates: ServerScenarioState[];
    sharedScenarioFieldEventFlags: Array<[string, string[]]>;
    loot: WorldSessionPersistentLoot[];
    generatedLootChunks: string[];
    dirtyPlayerIds: string[];
}
