import { runRaidLabCohort, runRaidLabExpedition } from './runner';
import { formatCohortMarkdown, summarizeCohort, writeCohortReport } from './report';
import type { RaidLabPolicyId } from './types';

function parseArgs(argv: string[]): {
    seeds: number;
    seedStart: number;
    policy: RaidLabPolicyId;
    maxActions: number;
    writeReport: boolean;
    singleSeed: number | null;
} {
    let seeds = 100;
    let seedStart = 0;
    let policy: RaidLabPolicyId = 'balanced';
    let maxActions = 400;
    let writeReport = true;
    let singleSeed: number | null = null;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--seeds' && next) {
            seeds = Math.max(1, Number.parseInt(next, 10) || 100);
            i += 1;
        } else if (arg === '--seed-start' && next) {
            seedStart = Number.parseInt(next, 10) || 0;
            i += 1;
        } else if (arg === '--seed' && next) {
            singleSeed = Number.parseInt(next, 10);
            i += 1;
        } else if (arg === '--policy' && next) {
            if (next === 'balanced' || next === 'cautious' || next === 'random-legal') policy = next;
            i += 1;
        } else if (arg === '--max-actions' && next) {
            maxActions = Math.max(1, Number.parseInt(next, 10) || 400);
            i += 1;
        } else if (arg === '--no-report') {
            writeReport = false;
        }
    }

    return { seeds, seedStart, policy, maxActions, writeReport, singleSeed };
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    if (args.singleSeed !== null) {
        const result = runRaidLabExpedition({
            seed: args.singleSeed,
            policy: args.policy,
            maxActions: args.maxActions,
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }

    const results = runRaidLabCohort(args.seedStart, args.seeds, args.policy, {
        maxActions: args.maxActions,
    });
    const summary = summarizeCohort(results, args.policy, args.seedStart);
    process.stdout.write(`${formatCohortMarkdown(summary)}\n`);

    if (args.writeReport) {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const label = `smoke-${args.policy}-s${args.seedStart}-n${args.seeds}-${stamp}`;
        const paths = writeCohortReport(summary, results, label);
        process.stdout.write(`Wrote ${paths.mdPath}\n`);
        process.stdout.write(`Wrote ${paths.jsonPath}\n`);
    }
}

main();
