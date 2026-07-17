import { runRaidLabExpedition } from './runner';
import { formatCohortMarkdown, summarizeCohort, writeCohortReport } from './report';
import type { StartingClassId } from '../../src/data/characterClasses';
import type {
    RaidLabExperimentResult,
    RaidLabPolicyId,
    RaidLabRouteMode,
    RaidLabStressMode,
} from './types';

const STARTING_CLASSES: StartingClassId[] = ['infantry', 'cavalry', 'cleric', 'mage'];

function parseArgs(argv: string[]): {
    seeds: number;
    seedStart: number;
    policy: RaidLabPolicyId;
    stress: RaidLabStressMode;
    classMode: StartingClassId | 'sweep';
    routeMode: RaidLabRouteMode;
    maxActions: number;
    writeReport: boolean;
    singleSeed: number | null;
} {
    let seeds = 100;
    let seedStart = 0;
    let policy: RaidLabPolicyId = 'balanced';
    let stress: RaidLabStressMode = 'none';
    let classMode: StartingClassId | 'sweep' = 'sweep';
    let routeMode: RaidLabRouteMode = 'sweep';
    let maxActions = 1_500;
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
        } else if (arg === '--stress' && next) {
            if (
                next === 'none'
                || next === 'low-hp'
                || next === 'dense-nests'
                || next === 'low-hp+dense-nests'
            ) {
                stress = next;
            }
            i += 1;
        } else if (arg === '--class' && next) {
            if (next === 'sweep' || STARTING_CLASSES.includes(next as StartingClassId)) {
                classMode = next as StartingClassId | 'sweep';
            }
            i += 1;
        } else if (arg === '--route' && next) {
            if (next === 'nearest' || next === 'sweep') routeMode = next;
            i += 1;
        } else if (arg === '--max-actions' && next) {
            maxActions = Math.max(1, Number.parseInt(next, 10) || 400);
            i += 1;
        } else if (arg === '--no-report') {
            writeReport = false;
        }
    }

    return { seeds, seedStart, policy, stress, classMode, routeMode, maxActions, writeReport, singleSeed };
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    if (args.singleSeed !== null) {
        const classKey = resolveClassKey(args.classMode, args.singleSeed);
        const result = runRaidLabExpedition({
            seed: args.singleSeed,
            policy: args.policy,
            maxActions: args.maxActions,
            stress: args.stress,
            classKey,
            routeMode: args.routeMode,
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }

    const startedAt = Date.now();
    const results: RaidLabExperimentResult[] = [];
    for (let i = 0; i < args.seeds; i++) {
        const seed = args.seedStart + i;
        const classKey = resolveClassKey(args.classMode, seed);
        results.push(runRaidLabExpedition({
            seed,
            policy: args.policy,
            maxActions: args.maxActions,
            stress: args.stress,
            classKey,
            routeMode: args.routeMode,
        }));
        if ((i + 1) % 10 === 0 || i + 1 === args.seeds) {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            // stderr stays line-buffered when stdout is captured by the harness.
            process.stderr.write(`progress ${i + 1}/${args.seeds} seeds in ${elapsed}s\n`);
        }
    }
    const summary = summarizeCohort(results, args.policy, args.seedStart, args.stress);
    process.stdout.write(`${formatCohortMarkdown(summary)}\n`);

    if (args.writeReport) {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const stressTag = args.stress === 'none'
            ? ''
            : `-stress-${args.stress.replace(/\+/g, '-and-')}`;
        const label = `smoke-${args.policy}${stressTag}-class-${args.classMode}-route-${args.routeMode}-s${args.seedStart}-n${args.seeds}-${stamp}`;
        const paths = writeCohortReport(summary, results, label);
        process.stdout.write(`Wrote ${paths.mdPath}\n`);
        process.stdout.write(`Wrote ${paths.jsonPath}\n`);
    }
}

function resolveClassKey(mode: StartingClassId | 'sweep', seed: number): StartingClassId {
    if (mode !== 'sweep') return mode;
    const index = ((seed % STARTING_CLASSES.length) + STARTING_CLASSES.length) % STARTING_CLASSES.length;
    return STARTING_CLASSES[index]!;
}

main();
