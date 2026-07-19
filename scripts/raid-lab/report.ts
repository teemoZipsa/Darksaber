import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { raidLabPairwiseKeys } from './matrix';
import type {
    RaidLabCohortSummary,
    RaidLabExperimentResult,
    RaidLabFailureClusters,
    RaidLabPolicyId,
    RaidLabResult,
} from './types';
import { RAID_LAB_VERSION } from './types';

const EMPTY_RESULTS: Record<RaidLabResult, number> = {
    SURVIVED: 0,
    DEAD: 0,
    MIA: 0,
    LEFT: 0,
};

const SAMPLE_LIMIT = 8;

export function clusterResults(results: RaidLabExperimentResult[]): RaidLabFailureClusters {
    const byResult: Record<string, number> = {};
    const byStopReason: Record<string, number> = {};
    const byDeathCause: Record<string, number> = {};
    const byInvariantCode: Record<string, number> = {};
    const sampleSeeds: Record<string, number[]> = {};

    const pushSample = (key: string, seed: number) => {
        const list = sampleSeeds[key] ?? (sampleSeeds[key] = []);
        if (list.length < SAMPLE_LIMIT) list.push(seed);
    };

    for (const result of results) {
        byResult[result.result] = (byResult[result.result] ?? 0) + 1;
        pushSample(`result:${result.result}`, result.seed);

        byStopReason[result.stopReason] = (byStopReason[result.stopReason] ?? 0) + 1;
        pushSample(`stop:${result.stopReason}`, result.seed);

        const deathCause = result.telemetry.deathCause ?? 'unknown';
        byDeathCause[deathCause] = (byDeathCause[deathCause] ?? 0) + 1;
        pushSample(`death:${deathCause}`, result.seed);

        const codes = new Set(result.invariantViolations.map((entry) => entry.code));
        if (codes.size === 0) {
            byInvariantCode.none = (byInvariantCode.none ?? 0) + 1;
        } else {
            for (const code of codes) {
                byInvariantCode[code] = (byInvariantCode[code] ?? 0) + 1;
                pushSample(`invariant:${code}`, result.seed);
            }
        }
    }

    return { byResult, byStopReason, byDeathCause, byInvariantCode, sampleSeeds };
}

export function summarizeCohort(
    results: RaidLabExperimentResult[],
    policy: RaidLabPolicyId,
    seedStart: number,
    stress: RaidLabExperimentResult['stress'] = 'none'
): RaidLabCohortSummary {
    const tallies = { ...EMPTY_RESULTS };
    const invariantCodes: Record<string, number> = {};
    let invariantViolationCount = 0;
    let elapsedTotal = 0;
    let killsTotal = 0;
    let engagementTotal = 0;
    let lootTotal = 0;
    let healUsesTotal = 0;
    let healRemainingTotal = 0;
    const classCounts: Record<string, number> = {};
    const loadoutCounts: Record<string, number> = {};
    const supplyCounts: Record<string, number> = {};
    const conserveCounts: Record<string, number> = {};
    const partySizeCounts: Record<string, number> = {};
    const multiReadyCounts: Record<string, number> = {};
    const companionClassCounts: Record<string, number> = {};
    const pairwiseCoverage: Record<string, number> = {};
    const targetTownCounts: Record<string, number> = {};
    const extractionTownCounts: Record<string, number> = {};

    for (const result of results) {
        tallies[result.result] += 1;
        elapsedTotal += result.elapsedSeconds;
        killsTotal += result.kills;
        engagementTotal += result.telemetry.engagementCount;
        lootTotal += result.telemetry.lootItemsAcquired;
        healUsesTotal += result.healUses;
        healRemainingTotal += result.healQtyRemaining;
        classCounts[result.classKey] = (classCounts[result.classKey] ?? 0) + 1;
        loadoutCounts[result.loadout] = (loadoutCounts[result.loadout] ?? 0) + 1;
        supplyCounts[result.supply] = (supplyCounts[result.supply] ?? 0) + 1;
        conserveCounts[result.conserve] = (conserveCounts[result.conserve] ?? 0) + 1;
        partySizeCounts[String(result.partySize)] = (partySizeCounts[String(result.partySize)] ?? 0) + 1;
        multiReadyCounts[result.multiReady] = (multiReadyCounts[result.multiReady] ?? 0) + 1;
        for (const companion of result.companionClasses) {
            companionClassCounts[companion] = (companionClassCounts[companion] ?? 0) + 1;
        }
        for (const key of raidLabPairwiseKeys({
            partySize: result.partySize,
            classKey: result.classKey,
            loadout: result.loadout,
            supply: result.supply,
            conserve: result.conserve,
            multiReady: result.multiReady,
            companionClasses: result.companionClasses,
            routeMode: result.routeMode,
        })) {
            pairwiseCoverage[key] = (pairwiseCoverage[key] ?? 0) + 1;
        }
        targetTownCounts[result.targetTownId] = (targetTownCounts[result.targetTownId] ?? 0) + 1;
        extractionTownCounts[result.extractionTownId] = (extractionTownCounts[result.extractionTownId] ?? 0) + 1;
        invariantViolationCount += result.invariantViolations.length;
        for (const violation of result.invariantViolations) {
            invariantCodes[violation.code] = (invariantCodes[violation.code] ?? 0) + 1;
        }
    }

    const count = results.length || 1;
    return {
        labVersion: RAID_LAB_VERSION,
        policy,
        stress,
        seedStart,
        seedEnd: seedStart + results.length - 1,
        count: results.length,
        results: tallies,
        invariantViolationCount,
        invariantCodes,
        meanElapsedSeconds: elapsedTotal / count,
        meanKills: killsTotal / count,
        meanEngagements: engagementTotal / count,
        meanLootItemsAcquired: lootTotal / count,
        meanHealUses: healUsesTotal / count,
        meanHealQtyRemaining: healRemainingTotal / count,
        classCounts,
        loadoutCounts,
        supplyCounts,
        conserveCounts,
        partySizeCounts,
        multiReadyCounts,
        companionClassCounts,
        pairwiseCoverage,
        targetTownCounts,
        extractionTownCounts,
        digests: results.map((result) => ({
            seed: result.seed,
            digest: result.digest,
            result: result.result,
        })),
        clusters: clusterResults(results),
    };
}

export function formatCohortMarkdown(summary: RaidLabCohortSummary): string {
    const ratio = (n: number) => `${n} (${((n / Math.max(1, summary.count)) * 100).toFixed(1)}%)`;
    const invariantLines = Object.entries(summary.invariantCodes)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `- \`${code}\`: ${count}`)
        .join('\n');
    const clusterSection = (title: string, bag: Record<string, number>, prefix: string) => {
        const lines = Object.entries(bag)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => {
                const samples = summary.clusters.sampleSeeds[`${prefix}${key}`] ?? [];
                const sampleText = samples.length > 0 ? ` — seeds ${samples.join(', ')}` : '';
                return `- \`${key}\`: ${count}${sampleText}`;
            });
        return [`## ${title}`, '', ...(lines.length > 0 ? lines : ['- none']), ''].join('\n');
    };

    return [
        `# Raid Lab Cohort Report`,
        '',
        `- labVersion: ${summary.labVersion}`,
        `- policy: ${summary.policy}`,
        `- stress: ${summary.stress}`,
        `- seeds: ${summary.seedStart}..${summary.seedEnd} (n=${summary.count})`,
        `- mean elapsedSeconds: ${summary.meanElapsedSeconds.toFixed(2)}`,
        `- mean kills: ${summary.meanKills.toFixed(2)}`,
        `- mean engagements: ${summary.meanEngagements.toFixed(2)}`,
        `- mean loot acquired: ${summary.meanLootItemsAcquired.toFixed(2)}`,
        `- mean heal uses: ${summary.meanHealUses.toFixed(2)}`,
        `- mean heal remaining: ${summary.meanHealQtyRemaining.toFixed(2)}`,
        '',
        '## Outcomes',
        '',
        `- SURVIVED: ${ratio(summary.results.SURVIVED)}`,
        `- DEAD: ${ratio(summary.results.DEAD)}`,
        `- MIA: ${ratio(summary.results.MIA)}`,
        `- LEFT: ${ratio(summary.results.LEFT)}`,
        '',
        '## Coverage',
        '',
        `- classes: ${formatCounts(summary.classCounts)}`,
        `- loadouts: ${formatCounts(summary.loadoutCounts)}`,
        `- supply: ${formatCounts(summary.supplyCounts)}`,
        `- conserve: ${formatCounts(summary.conserveCounts)}`,
        `- partySize: ${formatCounts(summary.partySizeCounts)}`,
        `- multiReady: ${formatCounts(summary.multiReadyCounts)}`,
        `- companionClasses: ${formatCounts(summary.companionClassCounts)}`,
        `- pairwise: ${formatCounts(summary.pairwiseCoverage)}`,
        `- target towns: ${formatCounts(summary.targetTownCounts)}`,
        `- final towns: ${formatCounts(summary.extractionTownCounts)}`,
        '',
        '## Invariant violations',
        '',
        `- total: ${summary.invariantViolationCount}`,
        invariantLines || '- none',
        '',
        clusterSection('Clusters — stopReason', summary.clusters.byStopReason, 'stop:'),
        clusterSection('Clusters — deathCause', summary.clusters.byDeathCause, 'death:'),
        clusterSection('Clusters — invariant codes', summary.clusters.byInvariantCode, 'invariant:'),
    ].join('\n');
}

export function writeCohortReport(
    summary: RaidLabCohortSummary,
    results: RaidLabExperimentResult[],
    label: string,
    options: { includeCompactResults?: boolean; includeFullResults?: boolean } = {}
): { jsonPath: string; mdPath: string } {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'raid-lab', 'reports');
    mkdirSync(root, { recursive: true });
    const jsonPath = join(root, `${label}.json`);
    const mdPath = join(root, `${label}.md`);
    // Default: summary-only (digests + clusters already live on summary).
    // Opt in to compact/full per-seed payloads for local debugging — do not commit those.
    const payload: Record<string, unknown> = { summary };
    if (options.includeCompactResults || options.includeFullResults) {
        payload.results = results.map((result) => ({
            seed: result.seed,
            policy: result.policy,
            classKey: result.classKey,
            routeMode: result.routeMode,
            loadout: result.loadout,
            supply: result.supply,
            conserve: result.conserve,
            partySize: result.partySize,
            multiReady: result.multiReady,
            companionClasses: result.companionClasses,
            carriedWeight: result.carriedWeight,
            healUses: result.healUses,
            healQtyRemaining: result.healQtyRemaining,
            result: result.result,
            elapsedSeconds: result.elapsedSeconds,
            kills: result.kills,
            departureTownId: result.departureTownId,
            targetTownId: result.targetTownId,
            extractionTownId: result.extractionTownId,
            telemetry: result.telemetry,
            invariantViolationCount: result.invariantViolations.length,
            invariantCodes: [...new Set(result.invariantViolations.map((entry) => entry.code))],
            actionCount: result.actions.length,
            digest: result.digest,
            stopReason: result.stopReason,
            actorFinal: result.actorFinal ?? null,
            actorsFinal: result.actorsFinal ?? null,
        }));
    }
    if (options.includeFullResults) {
        payload.fullResults = results;
    }
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    writeFileSync(mdPath, formatCohortMarkdown(summary), 'utf8');
    return { jsonPath, mdPath };
}

function formatCounts(counts: Record<string, number>): string {
    return Object.entries(counts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => `${key}=${count}`)
        .join(', ') || 'none';
}
