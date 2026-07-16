import type { RaidBalanceTelemetry, RaidResultMessage } from '../../src/net/WorldProtocol';

export const RAID_LAB_VERSION = 8;

export type RaidLabPolicyId = 'balanced' | 'cautious' | 'random-legal';
/** Optional Phase 3 stress presets (default / omitted = none). */
export type RaidLabStressMode = 'none' | 'low-hp' | 'dense-nests';
export type RaidLabResult = RaidResultMessage['result'];

export interface RaidLabActionRecord {
    index: number;
    kind: string;
    simMs: number;
    detail?: string;
}

export interface RaidLabInvariantViolation {
    code: string;
    message: string;
    simMs: number;
    actionIndex: number;
}

export interface RaidLabActorFinal {
    hp: number;
    maxHp: number;
    mp: number;
    level: number;
    exp: number;
    tileX: number;
    tileY: number;
    mov?: number;
}

export interface RaidLabExperimentResult {
    labVersion: number;
    seed: number;
    policy: RaidLabPolicyId;
    stress: RaidLabStressMode;
    result: RaidLabResult;
    elapsedSeconds: number;
    kills: number;
    departureTownId: string;
    extractionTownId: string;
    completedDungeonIds: string[];
    telemetry: RaidBalanceTelemetry;
    actions: RaidLabActionRecord[];
    invariantViolations: RaidLabInvariantViolation[];
    digest: string;
    finishedAtSimMs: number;
    actorFinal?: RaidLabActorFinal;
    stopReason: 'raid_result' | 'max_actions' | 'max_sim_ms' | 'invariant_abort';
}

export interface RaidLabRunOptions {
    seed: number;
    policy: RaidLabPolicyId;
    maxActions?: number;
    maxSimMs?: number;
    abortOnInvariant?: boolean;
    /** Phase 3: forced hardship presets. */
    stress?: RaidLabStressMode;
}

export interface RaidLabCohortSummary {
    labVersion: number;
    policy: RaidLabPolicyId;
    stress: RaidLabStressMode;
    seedStart: number;
    seedEnd: number;
    count: number;
    results: Record<RaidLabResult, number>;
    invariantViolationCount: number;
    invariantCodes: Record<string, number>;
    meanElapsedSeconds: number;
    meanKills: number;
    digests: Array<{ seed: number; digest: string; result: RaidLabResult }>;
    clusters: RaidLabFailureClusters;
}

export interface RaidLabFailureClusters {
    byResult: Record<string, number>;
    byStopReason: Record<string, number>;
    byDeathCause: Record<string, number>;
    byInvariantCode: Record<string, number>;
    sampleSeeds: Record<string, number[]>;
}
