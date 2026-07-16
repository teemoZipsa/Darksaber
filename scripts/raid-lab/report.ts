import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RaidLabCohortSummary, RaidLabExperimentResult, RaidLabPolicyId, RaidLabResult } from './types';
import { RAID_LAB_VERSION } from './types';

const EMPTY_RESULTS: Record<RaidLabResult, number> = {
    SURVIVED: 0,
    DEAD: 0,
    MIA: 0,
    LEFT: 0,
};

export function summarizeCohort(
    results: RaidLabExperimentResult[],
    policy: RaidLabPolicyId,
    seedStart: number
): RaidLabCohortSummary {
    const tallies = { ...EMPTY_RESULTS };
    const invariantCodes: Record<string, number> = {};
    let invariantViolationCount = 0;
    let elapsedTotal = 0;
    let killsTotal = 0;

    for (const result of results) {
        tallies[result.result] += 1;
        elapsedTotal += result.elapsedSeconds;
        killsTotal += result.kills;
        invariantViolationCount += result.invariantViolations.length;
        for (const violation of result.invariantViolations) {
            invariantCodes[violation.code] = (invariantCodes[violation.code] ?? 0) + 1;
        }
    }

    const count = results.length || 1;
    return {
        labVersion: RAID_LAB_VERSION,
        policy,
        seedStart,
        seedEnd: seedStart + results.length - 1,
        count: results.length,
        results: tallies,
        invariantViolationCount,
        invariantCodes,
        meanElapsedSeconds: elapsedTotal / count,
        meanKills: killsTotal / count,
        digests: results.map((result) => ({
            seed: result.seed,
            digest: result.digest,
            result: result.result,
        })),
    };
}

export function formatCohortMarkdown(summary: RaidLabCohortSummary): string {
    const ratio = (n: number) => `${n} (${((n / Math.max(1, summary.count)) * 100).toFixed(1)}%)`;
    const invariantLines = Object.entries(summary.invariantCodes)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `- \`${code}\`: ${count}`)
        .join('\n');

    return [
        `# Raid Lab Smoke Report`,
        '',
        `- labVersion: ${summary.labVersion}`,
        `- policy: ${summary.policy}`,
        `- seeds: ${summary.seedStart}..${summary.seedEnd} (n=${summary.count})`,
        `- mean elapsedSeconds: ${summary.meanElapsedSeconds.toFixed(2)}`,
        `- mean kills: ${summary.meanKills.toFixed(2)}`,
        '',
        '## Outcomes',
        '',
        `- SURVIVED: ${ratio(summary.results.SURVIVED)}`,
        `- DEAD: ${ratio(summary.results.DEAD)}`,
        `- MIA: ${ratio(summary.results.MIA)}`,
        `- LEFT: ${ratio(summary.results.LEFT)}`,
        '',
        '## Invariant violations',
        '',
        `- total: ${summary.invariantViolationCount}`,
        invariantLines || '- none',
        '',
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
        result: result.result,
        elapsedSeconds: result.elapsedSeconds,
        kills: result.kills,
        departureTownId: result.departureTownId,
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
