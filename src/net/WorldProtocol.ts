import type { StatusEffect } from '../combat/StatusEffects';
import type { MarketSnapshot } from '../data/MarketData';
import type { CharacterStats } from '../data/Stats';
import type { EnemyRole } from '../field/EnemyAI';
import type { WorldLootContainerType } from '../loot/WorldLootTypes';

const configuredWorldServerUrl = import.meta.env?.VITE_WORLD_SERVER_URL?.trim();

export const DEFAULT_WORLD_SERVER_URL = configuredWorldServerUrl || (import.meta.env?.DEV ? 'ws://localhost:8765' : '');
export const WORLD_PROTOCOL_VERSION = 'world-pve-v3';

export type WorldRealmId = 'mortal' | 'master';

export interface NetTilePoint {
    x: number;
    y: number;
}

export type NetFacing = 'up' | 'down' | 'left' | 'right';

export interface GridItemSnapshot {
    itemId: string;
    gridX: number;
    gridY: number;
    durability: number;
    quantity: number;
    acquiredInRaid?: boolean;
    sockets?: string[];
}

export interface GridSnapshot {
    width: number;
    height: number;
    items: GridItemSnapshot[];
}

export interface InventoryItemCountSnapshot {
    itemId: string;
    quantity: number;
}

export interface ActorSnapshot {
    id: string;
    ownerPlayerId?: string;
    localActorId?: string;
    name: string;
    classLineId: string;
    currentTier: number;
    level: number;
    tile: NetTilePoint;
    stats: CharacterStats;
    statuses: StatusEffect[];
    actionGauge: number;
    remainingAp: number;
    majorActionUsed?: boolean;
    facing: NetFacing;
    isDead: boolean;
    isGhost?: boolean;
}

export interface EnemySnapshot {
    id: string;
    monsterId?: string;
    name: string;
    role: EnemyRole;
    level: number;
    color: string;
    tile: NetTilePoint;
    home: NetTilePoint;
    stats: CharacterStats;
    statuses: StatusEffect[];
    actionGauge: number;
    facing: NetFacing;
    isAggro: boolean;
    isBoss: boolean;
}

export interface LootSnapshot {
    id: string;
    tile: NetTilePoint;
    sourceLabel: string;
    kind: 'chest' | 'corpse';
    containerType?: WorldLootContainerType;
    opened: boolean;
    lockedByPlayerId?: string;
    gridSnapshot: GridSnapshot;
}

export interface WorldPlayerSnapshot {
    playerId: string;
    originHubId: string;
    isGhost: boolean;
    actorIds: string[];
}

export interface RaidTimerSnapshot {
    active: boolean;
    elapsedSeconds: number;
    limitSeconds: number;
    departureTownId: string;
}

export interface ScenarioSnapshot {
    enteredDungeonIds: string[];
    activeDungeonId: string | null;
    completedDungeonIds: string[];
}

export interface WorldSnapshot {
    seq: number;
    serverTime: number;
    players: WorldPlayerSnapshot[];
    partyActors: ActorSnapshot[];
    enemies: EnemySnapshot[];
    loot: LootSnapshot[];
    readyActors: string[];
    remainingApByActor: Record<string, number>;
    raidTimer: RaidTimerSnapshot;
    scenario: ScenarioSnapshot;
}

export interface WorldJoinMessage {
    type: 'WORLD_JOIN';
    originHubId: string;
    partyComposition: ActorSnapshot[];
    clientVersion: string;
    carriedWeight?: number;
    resumeToken?: string;
    completedQuestIds?: string[];
    accessToken?: string;
    characterId?: string;
    requestedRealm?: WorldRealmId;
    carriedItems?: InventoryItemCountSnapshot[];
}

export interface ReconnectMessage {
    type: 'RECONNECT';
    resumeToken: string;
    accessToken?: string;
}

export interface WorldLeaveMessage {
    type: 'WORLD_LEAVE';
    reason: 'town' | 'wipe' | 'manual';
}

export interface ClientHeartbeatMessage {
    type: 'CLIENT_HEARTBEAT';
    clientTime: number;
}

export type PlayerIntentKind = 'move' | 'attack' | 'interact' | 'useItem' | 'castSkill' | 'endTurn';

export interface PlayerIntentMessage {
    type: 'PLAYER_INTENT';
    intentId: string;
    actorId: string;
    kind: PlayerIntentKind;
    payload: unknown;
}

export interface LootPickupMessage {
    type: 'LOOT_PICKUP';
    intentId: string;
    lootId: string;
    gridX: number;
    gridY: number;
}

export interface AutoLootCell {
    gridX: number;
    gridY: number;
}

export interface AutoLootResolveMessage {
    type: 'AUTO_LOOT_RESOLVE';
    lootId: string;
    acceptedCells: AutoLootCell[];
}

export interface ScenarioEnterMessage {
    type: 'SCENARIO_ENTER';
    intentId: string;
    actorId: string;
    dungeonId: string;
}

export interface MarketHelloMessage {
    type: 'MARKET_HELLO';
    clientId: string;
    clientVersion: string;
}

export interface MarketSnapshotRequestMessage {
    type: 'MARKET_SNAPSHOT_REQUEST';
    clientId: string;
}

export interface MarketRecordBuyMessage {
    type: 'MARKET_RECORD_BUY';
    clientId: string;
    townId: string;
    itemId: string;
    quantity: number;
}

export interface MarketRecordSellMessage {
    type: 'MARKET_RECORD_SELL';
    clientId: string;
    townId: string;
    itemId: string;
    quantity: number;
}

export interface MarketTouchTownMessage {
    type: 'MARKET_TOUCH_TOWN';
    clientId: string;
    townId: string;
}

export type MarketClientMessage =
    | MarketHelloMessage
    | MarketSnapshotRequestMessage
    | MarketRecordBuyMessage
    | MarketRecordSellMessage
    | MarketTouchTownMessage;

export type WorldClientMessage =
    | WorldJoinMessage
    | ReconnectMessage
    | WorldLeaveMessage
    | ClientHeartbeatMessage
    | PlayerIntentMessage
    | LootPickupMessage
    | AutoLootResolveMessage
    | ScenarioEnterMessage
    | MarketClientMessage;

export interface WorldWelcomeMessage {
    type: 'WORLD_WELCOME';
    playerId: string;
    sessionEpoch: number;
    resumeToken: string;
    spawnTile: NetTilePoint;
    accountId?: string;
    shardId?: string;
    realm?: WorldRealmId;
    completedQuestIds?: string[];
}

export interface WorldSnapshotMessage {
    type: 'WORLD_SNAPSHOT';
    snapshot: WorldSnapshot;
}

export interface ActionRejectedMessage {
    type: 'ACTION_REJECTED';
    intentId: string;
    reason: string;
}

export interface LootGrantMessage {
    type: 'LOOT_GRANT';
    lootId: string;
    gridSnapshot: GridSnapshot;
}

export interface AutoLootGrantMessage {
    type: 'AUTO_LOOT_GRANT';
    lootId: string;
    sourceName: string;
    gridSnapshot: GridSnapshot;
}

export interface InventoryConsumedMessage {
    type: 'INVENTORY_CONSUMED';
    itemId: string;
    quantity: number;
}

export interface CombatEventMessage {
    type: 'COMBAT_EVENT';
    kind: string;
    sourceId: string;
    targetId: string;
    sourceName?: string;
    targetName?: string;
    value?: number;
    statusEffect?: StatusEffect;
}

export interface RaidResultMessage {
    type: 'RAID_RESULT';
    playerId: string;
    result: 'SURVIVED' | 'DEAD' | 'MIA' | 'LEFT';
    elapsedSeconds: number;
    kills: number;
    departureTownId: string;
    extractionTownId: string;
    completedDungeonIds: string[];
}

export interface WorldErrorMessage {
    type: 'ERROR';
    code: string;
    message: string;
}

export interface ServerHeartbeatAckMessage {
    type: 'SERVER_HEARTBEAT_ACK';
    clientTime: number;
    serverTime: number;
    joined: boolean;
}

export interface MarketSnapshotMessage {
    type: 'MARKET_SNAPSHOT';
    serverTime: number;
    snapshot: MarketSnapshot;
}

export interface MarketRecordAckMessage {
    type: 'MARKET_RECORD_ACK';
    kind: 'hello' | 'request' | 'buy' | 'sell' | 'touch';
    accepted: boolean;
    snapshot: MarketSnapshot;
}

export type MarketServerMessage =
    | MarketSnapshotMessage
    | MarketRecordAckMessage;

export type WorldServerMessage =
    | WorldWelcomeMessage
    | WorldSnapshotMessage
    | ActionRejectedMessage
    | LootGrantMessage
    | AutoLootGrantMessage
    | InventoryConsumedMessage
    | CombatEventMessage
    | RaidResultMessage
    | WorldErrorMessage
    | ServerHeartbeatAckMessage
    | MarketServerMessage;

export function isWorldSnapshotMessage(message: WorldServerMessage): message is WorldSnapshotMessage {
    return message.type === 'WORLD_SNAPSHOT';
}

export function isMarketClientMessage(message: WorldClientMessage): message is MarketClientMessage {
    return message.type === 'MARKET_HELLO'
        || message.type === 'MARKET_SNAPSHOT_REQUEST'
        || message.type === 'MARKET_RECORD_BUY'
        || message.type === 'MARKET_RECORD_SELL'
        || message.type === 'MARKET_TOUCH_TOWN';
}
