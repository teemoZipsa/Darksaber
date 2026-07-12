import { CHUNK_SIZE } from '../src/map/Chunk';
import type { WorldMap } from '../src/map/WorldMap';
import { getFieldDanger } from '../src/field/SpawnResolver';
import type { RaidBalanceTelemetry, RaidDangerBand, RaidResultMessage } from '../src/net/WorldProtocol';
import type { ServerEnemy, ServerPlayer, ServerRaidBalanceState } from './WorldSessionTypes';

const ENGAGEMENT_RESET_SECONDS = 15;

export function createServerRaidBalanceState(): ServerRaidBalanceState {
    return {
        engagementCount: 0,
        engagementGapSecondsTotal: 0,
        killsByDangerBand: { starter: 0, low: 0, mid: 0, high: 0, scenario: 0 },
    };
}

export function recordPlayerCombatActivity(player: ServerPlayer): void {
    const state = ensureState(player);
    const elapsed = Math.max(0, player.elapsedSeconds);
    const startsNewEngagement = state.lastCombatActivitySeconds === undefined
        || elapsed - state.lastCombatActivitySeconds >= ENGAGEMENT_RESET_SECONDS;
    if (startsNewEngagement) {
        state.engagementCount += 1;
        state.firstEngagementSeconds ??= elapsed;
        if (state.lastEngagementStartSeconds !== undefined) {
            state.engagementGapSecondsTotal += Math.max(0, elapsed - state.lastEngagementStartSeconds);
        }
        state.lastEngagementStartSeconds = elapsed;
    }
    state.lastCombatActivitySeconds = elapsed;
}

export function recordPlayerKillDangerBand(player: ServerPlayer, target: ServerEnemy, worldMap: WorldMap): void {
    const state = ensureState(player);
    const band = resolveDangerBand(target, worldMap);
    state.killsByDangerBand[band] += 1;
}

export function buildRaidBalanceTelemetry(
    player: ServerPlayer,
    result: RaidResultMessage['result']
): RaidBalanceTelemetry {
    const state = ensureState(player);
    const lootItemsAcquired = (player.saveSnapshot?.inventory.items ?? [])
        .filter((item) => item.acquiredInRaid === true)
        .reduce((sum, item) => sum + Math.max(1, Math.floor(item.quantity ?? 1)), 0);
    return {
        ...(state.firstEngagementSeconds !== undefined ? { firstEngagementSeconds: state.firstEngagementSeconds } : {}),
        engagementCount: state.engagementCount,
        engagementGapSecondsTotal: state.engagementGapSecondsTotal,
        lootItemsAcquired,
        lootItemsSecured: result === 'SURVIVED' ? lootItemsAcquired : 0,
        killsByDangerBand: { ...state.killsByDangerBand },
        deathCause: result === 'DEAD'
            ? player.lastDamageCause ?? 'unknown'
            : result === 'MIA'
                ? 'timeout'
                : result === 'LEFT'
                    ? 'manual'
                    : 'none',
    };
}

function ensureState(player: ServerPlayer): ServerRaidBalanceState {
    player.balanceTelemetry ??= createServerRaidBalanceState();
    return player.balanceTelemetry;
}

function resolveDangerBand(target: ServerEnemy, worldMap: WorldMap): RaidDangerBand {
    if (target.scenarioDungeonId) return 'scenario';
    const danger = getFieldDanger(
        Math.floor(target.enemy.gridX / CHUNK_SIZE),
        Math.floor(target.enemy.gridY / CHUNK_SIZE),
        worldMap.getRealm()
    );
    if (danger <= 2) return 'starter';
    if (danger <= 8) return 'low';
    if (danger <= 16) return 'mid';
    return 'high';
}
