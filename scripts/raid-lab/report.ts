import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    const classCounts: Record<string, number> = {};
    const targetTownCounts: Record<string, number> = {};
    const extractionTownCounts: Record<string, number> = {};

    for (const result of results) {
        tallies[result.result] += 1;
        elapsedTotal += result.elapsedSeconds;
        killsTotal += result.kills;
        engagementTotal += result.telemetry.engagementCount;
        lootTotal += result.telemetry.lootItemsAcquired;
        classCounts[result.classKey] = (classCounts[result.classKey] ?? 0) + 1;
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
        classCounts,
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
    options: { includeFullResults?: boolean } = {}
): { jsonPath: string; mdPath: string } {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'raid-lab', 'reports');
    mkdirSync(root, { recursive: true });
    const jsonPath = join(root, `${label}.json`);
    const mdPath = join(root, `${label}.md`);
    const compactResults = results.map((result) => ({
        seed: result.seed,
        policy: result.policy,
        classKey: result.classKey,
        routeMode: result.routeMode,
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
    }));
    writeFileSync(jsonPath, JSON.stringify({
        summary,
        results: compactResults,
        ...(options.includeFullResults ? { fullResults: results } : {}),
    }, null, 2), 'utf8');
    writeFileSync(mdPath, formatCohortMarkdown(summary), 'utf8');
    return { jsonPath, mdPath };
}

function formatCounts(counts: Record<string, number>): string {
    return Object.entries(counts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => `${key}=${count}`)
        .join(', ') || 'none';
}
