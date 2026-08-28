import type { TilePoint } from '../src/field/FieldPathing';
import { normalizeBasicAttackRange } from '../src/combat/BasicAttackRange';
import { normalizeLoadout, normalizeUpgradeLevels } from '../src/magic/MagicLoadout';
import type { WorldJoinMessage, WorldWelcomeMessage } from '../src/net/WorldProtocol';
import type { RaidModifier } from '../src/raid/RaidModifiers';
import { createFallbackActorSnapshot, sanitizeCarriedItems, sanitizeCarriedWeight, sanitizeStringArray, sanitizeTier } from './WorldSessionInput';
import { cloneStatuses, formationOffset, syncStatsMovementToClass } from './WorldSessionHelpers';
import { cloneCharacterSave } from './WorldSessionSaveState';
import type { ServerActor, ServerPlayer, WorldJoinContext } from './WorldSessionTypes';
import { createServerRaidBalanceState } from './WorldSessionBalanceTelemetry';
import { resolveBountyContract } from '../src/data/BountyContractData';

export interface WorldSessionJoinedPlayerInput {
    message: WorldJoinMessage;
    context: WorldJoinContext;
    playerId: string;
    resumeToken: string;
    originHubId: string;
    spawnTile: TilePoint;
    raidModifier: RaidModifier;
    findNearbyWalkableTile(tile: TilePoint, actorId: string): TilePoint;
}

export interface WorldSessionJoinedPlayerResult {
    player: ServerPlayer;
    actors: ServerActor[];
}

export function buildWorldSessionJoinedPlayer(input: WorldSessionJoinedPlayerInput): WorldSessionJoinedPlayerResult {
    const { message, context, playerId, resumeToken, originHubId, spawnTile, raidModifier } = input;
    const acceptedBounty = resolveBountyContract(context.saveSnapshot?.questState.activeBountyContractId);
    const player: ServerPlayer = {
        id: playerId,
        accountId: context.accountId,
        characterId: context.characterId,
        resumeToken,
        originHubId,
        departureTownId: originHubId,
        elapsedSeconds: 0,
        kills: 0,
        carriedWeight: sanitizeCarriedWeight(message.carriedWeight),
        carriedItems: sanitizeCarriedItems(message.carriedItems),
        raidGoldReward: 0,
        raidModifier,
        completedQuestIds: new Set(sanitizeStringArray(context.completedQuestIds ?? message.completedQuestIds)),
        enteredDungeonIds: new Set(),
        completedDungeonIds: new Set(),
        fieldEventFlagsByDungeonId: new Map(),
        inspectedAmbientSiteIds: new Set(),
        monsterCodexEncounteredEnemyIds: new Set(),
        balanceTelemetry: createServerRaidBalanceState(),
        activeDungeonId: null,
        active: true,
        ghost: false,
        disconnectedAt: null,
        actorIds: [],
        saveSnapshot: cloneCharacterSave(context.saveSnapshot),
        ...(acceptedBounty ? {
            bounty: {
                contractId: acceptedBounty.id,
                targetEnemyId: null,
                proofEarned: false,
                hadActorDown: false,
                riskCompleted: null,
                cluesFound: 0,
            },
        } : {}),
    };
    const composition = message.partyComposition.length > 0 ? message.partyComposition : [createFallbackActorSnapshot()];
    const actors = composition.map((snapshot, index): ServerActor => {
        const actorId = `${playerId}:${snapshot.id}`;
        const tile = input.findNearbyWalkableTile({
            x: spawnTile.x + formationOffset(index).x,
            y: spawnTile.y + formationOffset(index).y,
        }, actorId);
        const tier = sanitizeTier(snapshot.currentTier);
        player.actorIds.push(actorId);
        return {
            id: actorId,
            ownerPlayerId: playerId,
            localActorId: snapshot.id,
            name: snapshot.name,
            classLineId: snapshot.classLineId,
            currentTier: tier,
            level: snapshot.level,
            exp: sanitizeNonNegativeInt(snapshot.exp),
            hasEmblem: snapshot.hasEmblem === true,
            tile,
            stats: syncStatsMovementToClass(snapshot.stats, snapshot.classLineId),
            equipmentStatBonus: { ...(context.equipmentStatBonuses?.[snapshot.id] ?? {}) },
            attackRange: normalizeBasicAttackRange(context.equipmentAttackRanges?.[snapshot.id]),
            statuses: cloneStatuses(snapshot.statuses),
            actionGauge: 0,
            remainingAp: 0,
            majorActionUsed: false,
            facing: 'down',
            isDead: snapshot.isDead,
            magicLoadout: normalizeLoadout(snapshot.magicLoadout, { classLineId: snapshot.classLineId, currentTier: tier }),
            skillUpgradeLevels: normalizeUpgradeLevels(snapshot.skillUpgradeLevels),
        };
    });
    return { player, actors };
}

function sanitizeNonNegativeInt(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
}

export interface WorldSessionWelcomeInput {
    player: ServerPlayer;
    sessionEpoch: number;
    spawnTile: TilePoint;
    accountId?: string;
    shardId: string;
    realm: WorldWelcomeMessage['realm'];
}

export function buildWorldSessionWelcome(input: WorldSessionWelcomeInput): WorldWelcomeMessage {
    const { player, sessionEpoch, spawnTile, accountId, shardId, realm } = input;
    return {
        type: 'WORLD_WELCOME',
        playerId: player.id,
        sessionEpoch,
        resumeToken: player.resumeToken,
        spawnTile,
        accountId,
        shardId,
        realm,
        completedQuestIds: [...player.completedQuestIds],
        raidModifier: player.raidModifier,
    };
}
