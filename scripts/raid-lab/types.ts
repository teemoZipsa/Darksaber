import type { RaidBalanceTelemetry, RaidResultMessage } from '../../src/net/WorldProtocol';
import type { StartingClassId } from '../../src/data/characterClasses';

export const RAID_LAB_VERSION = 10;

export type RaidLabPolicyId = 'balanced' | 'cautious' | 'random-legal';
/** Optional Phase 3 stress presets (default / omitted = none). */
export type RaidLabStressMode = 'none' | 'low-hp' | 'dense-nests' | 'low-hp+dense-nests';
export type RaidLabRouteMode = 'nearest' | 'sweep';
/** Phase 4a: equipment load. Default `bare` preserves pre-matrix digests. */
export type RaidLabLoadoutId = 'bare' | 'light' | 'standard' | 'heavy';
/** Phase 4a: consumable supply. Default `lab` = herb_common×3. */
export type RaidLabSupplyId = 'none' | 'lab' | 'starter' | 'rich';
/** Phase 4a: heal spend policy. Default `standard` = current thresholds. */
export type RaidLabConserveId = 'spend' | 'standard' | 'hoard';
export type RaidLabResult = RaidResultMessage['result'];

export const RAID_LAB_DEFAULT_LOADOUT: RaidLabLoadoutId = 'bare';
export const RAID_LAB_DEFAULT_SUPPLY: RaidLabSupplyId = 'lab';
export const RAID_LAB_DEFAULT_CONSERVE: RaidLabConserveId = 'standard';

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
    classKey: StartingClassId;
    routeMode: RaidLabRouteMode;
    loadout: RaidLabLoadoutId;
    supply: RaidLabSupplyId;
    conserve: RaidLabConserveId;
    carriedWeight: number;
    healUses: number;
    healQtyRemaining: number;
    result: RaidLabResult;
    elapsedSeconds: number;
    kills: number;
    departureTownId: string;
    targetTownId: string;
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
    /** Starting class used by this expedition. */
    classKey?: StartingClassId;
    /** nearest preserves path regressions; sweep rotates through every destination town. */
    routeMode?: RaidLabRouteMode;
    /** Phase 4a equipment preset. */
    loadout?: RaidLabLoadoutId;
    /** Phase 4a consumable supply preset. */
    supply?: RaidLabSupplyId;
    /** Phase 4a heal conservation preset. */
    conserve?: RaidLabConserveId;
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
    meanEngagements: number;
    meanLootItemsAcquired: number;
    meanHealUses: number;
    meanHealQtyRemaining: number;
    classCounts: Record<string, number>;
    loadoutCounts: Record<string, number>;
    supplyCounts: Record<string, number>;
    conserveCounts: Record<string, number>;
    targetTownCounts: Record<string, number>;
    extractionTownCounts: Record<string, number>;
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
