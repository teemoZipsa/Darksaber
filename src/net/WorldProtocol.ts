import type { StatusEffect } from '../combat/StatusEffects';
import type { MarketSnapshot } from '../data/MarketData';
import type { CharacterStats } from '../data/Stats';
import type { StoryScenarioEventStep } from '../data/StoryScenarioEventData';
import type { EnemyRole } from '../field/EnemyAI';
import type { EliteAffixId } from '../field/EliteAffixes';
import type { WorldLootContainerType } from '../loot/WorldLootTypes';
import type { WorldMapAmbientSiteKind } from '../map/WorldMap';
import type { RaidModifier } from '../raid/RaidModifiers';
import type { ItemSlot } from '../data/ItemDB';

const configuredWorldServerUrl = import.meta.env?.VITE_WORLD_SERVER_URL?.trim();
const configuredAuthServerUrl = import.meta.env?.VITE_AUTH_SERVER_URL?.trim();

export const DEFAULT_WORLD_SERVER_URL = configuredWorldServerUrl
    || deriveWorldServerUrl(configuredAuthServerUrl)
    || (import.meta.env?.DEV ? 'ws://localhost:8765' : '');
export const WORLD_PROTOCOL_VERSION = 'world-pve-v3';

export function deriveWorldServerUrl(authServerUrl: string | undefined): string {
    if (!authServerUrl) return '';
    try {
        const url = new URL(authServerUrl);
        if (url.protocol === 'https:') url.protocol = 'wss:';
        else if (url.protocol === 'http:') url.protocol = 'ws:';
        else return '';
        url.pathname = '';
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
}

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
    /** Server-authoritative progression. Optional for older persisted sessions/servers. */
    exp?: number;
    /** Fusion emblem unlocked at the final tier cap. */
    hasEmblem?: boolean;
    tile: NetTilePoint;
    stats: CharacterStats;
    statuses: StatusEffect[];
    actionGauge: number;
    remainingAp: number;
    majorActionUsed?: boolean;
    facing: NetFacing;
    isDead: boolean;
    isGhost?: boolean;
    /** Equipped magic skill ids (ordered, max 8). Server casts only from these. */
    magicLoadout?: string[];
    /** Per-skill gold upgrade level (1..5); absent = base. */
    skillUpgradeLevels?: Record<string, number>;
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
    eliteAffixes?: EliteAffixId[];
    bountyContractId?: string;
}

export interface LootSnapshot {
    id: string;
    tile: NetTilePoint;
    sourceLabel: string;
    kind: 'chest' | 'corpse';
    containerType?: WorldLootContainerType;
    opened: boolean;
    unlocked?: boolean;
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
    modifier?: RaidModifier | null;
}

export interface ScenarioSnapshot {
    enteredDungeonIds: string[];
    activeDungeonId: string | null;
    completedDungeonIds: string[];
    playerFieldEventFlagsByDungeonId?: Record<string, string[]>;
    sharedFieldEventFlagsByDungeonId?: Record<string, string[]>;
    inspectedAmbientSiteIds?: string[];
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
    requestedRaidInstanceId?: string;
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

export type PlayerIntentKind = 'move' | 'attack' | 'interact' | 'useItem' | 'castSkill' | 'defend' | 'rest' | 'endTurn';

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

export interface ScenarioFieldEventInteractMessage {
    type: 'SCENARIO_FIELD_EVENT_INTERACT';
    intentId: string;
    actorId: string;
    dungeonId: string;
    eventId: string;
}

export interface AmbientSiteInteractMessage {
    type: 'AMBIENT_SITE_INTERACT';
    intentId: string;
    actorId: string;
    siteId: string;
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
    | ScenarioFieldEventInteractMessage
    | AmbientSiteInteractMessage
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
    raidModifier?: RaidModifier | null;
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
    /** EXP actually awarded by the authoritative server for this kill. */
    expAward?: number;
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
    /** Set when this survival granted the one-time first-survival gold bonus. */
    firstSurvivalBonusGranted?: boolean;
    bounty?: BountySettlementSummary;
    /** Server-authoritative losses and recovery applied for DEAD/MIA/LEFT. */
    failure?: RaidFailureSummary;
    telemetry?: RaidBalanceTelemetry;
}

export interface BountySettlementSummary {
    contractId: string;
    baseReward: number;
    bonusReward: number;
    riskCompleted: boolean;
    totalReward: number;
}

export type RaidDangerBand = 'starter' | 'low' | 'mid' | 'high' | 'scenario';
export type RaidDeathCause = 'enemy' | 'curse' | 'timeout' | 'manual' | 'unknown' | 'none';

export interface RaidBalanceTelemetry {
    firstEngagementSeconds?: number;
    engagementCount: number;
    engagementGapSecondsTotal: number;
    lootItemsAcquired: number;
    lootItemsSecured: number;
    killsByDangerBand: Record<RaidDangerBand, number>;
    deathCause: RaidDeathCause;
}

export interface RaidFailureItemSummary {
    itemId: string;
    quantity: number;
}

export interface RaidFailureEquipmentSummary extends RaidFailureItemSummary {
    characterId: string;
    characterName: string;
    slot: ItemSlot;
}

export interface RaidFailureSummary {
    backpackLost: RaidFailureItemSummary[];
    equipmentLost: RaidFailureEquipmentSummary[];
    protectedEquipment?: RaidFailureEquipmentSummary;
    recoveryEquipped: number;
    recoveryBackpack: number;
}

export type ScenarioFieldEventScope = 'player' | 'shared';

export type ScenarioFieldEventRewardResult =
    | { type: 'gold'; amount: number }
    | { type: 'item'; itemId: string; originalItemId?: number };

export interface ScenarioFieldEventResultMessage {
    type: 'SCENARIO_FIELD_EVENT_RESULT';
    intentId: string;
    dungeonId: string;
    eventId: string;
    scope: ScenarioFieldEventScope;
    flag: string;
    presentationSteps: StoryScenarioEventStep[];
    rewards: ScenarioFieldEventRewardResult[];
    trapDamage?: { actorId: string; damage: number };
}

export interface AmbientSiteResultMessage {
    type: 'AMBIENT_SITE_RESULT';
    intentId: string;
    siteId: string;
    kind: WorldMapAmbientSiteKind;
    rewards: ScenarioFieldEventRewardResult[];
    trapDamage?: { actorId: string; damage: number };
}

export interface ScenarioFieldEventBroadcastMessage {
    type: 'SCENARIO_FIELD_EVENT_BROADCAST';
    dungeonId: string;
    eventId: string;
    scope: 'shared';
    flag: string;
    presentationSteps: StoryScenarioEventStep[];
}

export interface ScenarioEnemyDefeatEventMessage {
    type: 'SCENARIO_ENEMY_DEFEAT_EVENT';
    dungeonId: string;
    enemyId: string;
    eventId: string;
    presentationSteps: StoryScenarioEventStep[];
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
    | ScenarioFieldEventResultMessage
    | AmbientSiteResultMessage
    | ScenarioFieldEventBroadcastMessage
    | ScenarioEnemyDefeatEventMessage
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

export type MarketWriteClientMessage =
    | MarketRecordBuyMessage
    | MarketRecordSellMessage
    | MarketTouchTownMessage;

export function isMarketWriteClientMessage(message: MarketClientMessage): message is MarketWriteClientMessage {
    return message.type === 'MARKET_RECORD_BUY'
        || message.type === 'MARKET_RECORD_SELL'
        || message.type === 'MARKET_TOUCH_TOWN';
}
