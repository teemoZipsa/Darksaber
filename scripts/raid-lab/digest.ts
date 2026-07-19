import { createHash } from 'node:crypto';
import {
    RAID_LAB_DEFAULT_CONSERVE,
    RAID_LAB_DEFAULT_LOADOUT,
    RAID_LAB_DEFAULT_MULTI_READY,
    RAID_LAB_DEFAULT_PARTY_SIZE,
    RAID_LAB_DEFAULT_SUPPLY,
    type RaidLabExperimentResult,
} from './types';

/** Stable digest of outcome-relevant fields (excludes wall-clock noise). */
export function digestExperimentResult(result: Omit<RaidLabExperimentResult, 'digest'>): string {
    const payload = {
        labVersion: result.labVersion,
        seed: result.seed,
        policy: result.policy,
        classKey: result.classKey,
        routeMode: result.routeMode,
        // Keep the common unstressed/default-matrix payload compact; labVersion guards comparisons.
        ...(result.stress !== 'none' ? { stress: result.stress } : {}),
        ...(result.loadout !== RAID_LAB_DEFAULT_LOADOUT ? { loadout: result.loadout } : {}),
        ...(result.supply !== RAID_LAB_DEFAULT_SUPPLY ? { supply: result.supply } : {}),
        ...(result.conserve !== RAID_LAB_DEFAULT_CONSERVE ? { conserve: result.conserve } : {}),
        ...(result.partySize !== RAID_LAB_DEFAULT_PARTY_SIZE ? { partySize: result.partySize } : {}),
        ...(result.multiReady !== RAID_LAB_DEFAULT_MULTI_READY ? { multiReady: result.multiReady } : {}),
        ...(result.companionClasses.length > 0 ? { companionClasses: result.companionClasses } : {}),
        carriedWeight: round3(result.carriedWeight),
        healUses: result.healUses,
        healQtyRemaining: result.healQtyRemaining,
        result: result.result,
        elapsedSeconds: round3(result.elapsedSeconds),
        kills: result.kills,
        departureTownId: result.departureTownId,
        targetTownId: result.targetTownId,
        extractionTownId: result.extractionTownId,
        completedDungeonIds: result.completedDungeonIds,
        telemetry: {
            firstEngagementSeconds: result.telemetry.firstEngagementSeconds === undefined
                ? null
                : round3(result.telemetry.firstEngagementSeconds),
            engagementCount: result.telemetry.engagementCount,
            engagementGapSecondsTotal: round3(result.telemetry.engagementGapSecondsTotal),
            lootItemsAcquired: result.telemetry.lootItemsAcquired,
            lootItemsSecured: result.telemetry.lootItemsSecured,
            killsByDangerBand: result.telemetry.killsByDangerBand,
            deathCause: result.telemetry.deathCause,
        },
        actions: result.actions.map((action) => ({
            index: action.index,
            kind: action.kind,
            simMs: action.simMs,
            detail: action.detail ?? null,
        })),
        invariantViolations: result.invariantViolations,
        finishedAtSimMs: result.finishedAtSimMs,
        actorFinal: result.actorFinal ?? null,
        actorsFinal: result.actorsFinal ?? null,
        stopReason: result.stopReason,
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}
