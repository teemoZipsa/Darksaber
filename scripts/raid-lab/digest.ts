import { createHash } from 'node:crypto';
import type { RaidLabExperimentResult } from './types';

/** Stable digest of outcome-relevant fields (excludes wall-clock noise). */
export function digestExperimentResult(result: Omit<RaidLabExperimentResult, 'digest'>): string {
    const payload = {
        labVersion: result.labVersion,
        seed: result.seed,
        policy: result.policy,
        // Omit default so unstressed digests stay comparable to labVersion 8.
        ...(result.stress !== 'none' ? { stress: result.stress } : {}),
        result: result.result,
        elapsedSeconds: round3(result.elapsedSeconds),
        kills: result.kills,
        departureTownId: result.departureTownId,
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
        stopReason: result.stopReason,
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}
