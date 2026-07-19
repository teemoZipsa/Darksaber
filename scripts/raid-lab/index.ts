import { runRaidLabExpedition } from './runner';
import { formatCohortMarkdown, summarizeCohort, writeCohortReport } from './report';
import type { StartingClassId } from '../../src/data/characterClasses';
import {
    RAID_LAB_CONSERVES,
    RAID_LAB_LOADOUTS,
    RAID_LAB_MULTI_READY,
    RAID_LAB_PARTY_SIZES,
    RAID_LAB_STARTING_CLASSES,
    RAID_LAB_SUPPLIES,
    resolveRaidLabClass,
    resolveRaidLabCompanionClasses,
    resolveRaidLabConserve,
    resolveRaidLabLoadout,
    resolveRaidLabMultiReady,
    resolveRaidLabPartySize,
    resolveRaidLabSupply,
} from './matrix';
import type {
    RaidLabConserveId,
    RaidLabExperimentResult,
    RaidLabLoadoutId,
    RaidLabMultiReadyId,
    RaidLabPartySize,
    RaidLabPolicyId,
    RaidLabRouteMode,
    RaidLabStressMode,
    RaidLabSupplyId,
} from './types';
import {
    RAID_LAB_DEFAULT_CONSERVE,
    RAID_LAB_DEFAULT_LOADOUT,
    RAID_LAB_DEFAULT_MULTI_READY,
    RAID_LAB_DEFAULT_PARTY_SIZE,
    RAID_LAB_DEFAULT_SUPPLY,
} from './types';

function parseArgs(argv: string[]): {
    seeds: number;
    seedStart: number;
    policy: RaidLabPolicyId;
    stress: RaidLabStressMode;
    classMode: StartingClassId | 'sweep';
    routeMode: RaidLabRouteMode;
    loadoutMode: RaidLabLoadoutId | 'sweep';
    supplyMode: RaidLabSupplyId | 'sweep';
    conserveMode: RaidLabConserveId | 'sweep';
    partySizeMode: RaidLabPartySize | 'sweep';
    multiReadyMode: RaidLabMultiReadyId | 'sweep';
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
    let loadoutMode: RaidLabLoadoutId | 'sweep' = RAID_LAB_DEFAULT_LOADOUT;
    let supplyMode: RaidLabSupplyId | 'sweep' = RAID_LAB_DEFAULT_SUPPLY;
    let conserveMode: RaidLabConserveId | 'sweep' = RAID_LAB_DEFAULT_CONSERVE;
    let partySizeMode: RaidLabPartySize | 'sweep' = RAID_LAB_DEFAULT_PARTY_SIZE;
    let multiReadyMode: RaidLabMultiReadyId | 'sweep' = RAID_LAB_DEFAULT_MULTI_READY;
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
            if (next === 'sweep' || RAID_LAB_STARTING_CLASSES.includes(next as StartingClassId)) {
                classMode = next as StartingClassId | 'sweep';
            }
            i += 1;
        } else if (arg === '--route' && next) {
            if (next === 'nearest' || next === 'sweep') routeMode = next;
            i += 1;
        } else if (arg === '--loadout' && next) {
            if (next === 'sweep' || RAID_LAB_LOADOUTS.includes(next as RaidLabLoadoutId)) {
                loadoutMode = next as RaidLabLoadoutId | 'sweep';
            }
            i += 1;
        } else if (arg === '--supply' && next) {
            if (next === 'sweep' || RAID_LAB_SUPPLIES.includes(next as RaidLabSupplyId)) {
                supplyMode = next as RaidLabSupplyId | 'sweep';
            }
            i += 1;
        } else if (arg === '--conserve' && next) {
            if (next === 'sweep' || RAID_LAB_CONSERVES.includes(next as RaidLabConserveId)) {
                conserveMode = next as RaidLabConserveId | 'sweep';
            }
            i += 1;
        } else if (arg === '--party-size' && next) {
            if (next === 'sweep') {
                partySizeMode = 'sweep';
            } else {
                const parsed = Number.parseInt(next, 10);
                if (RAID_LAB_PARTY_SIZES.includes(parsed as RaidLabPartySize)) {
                    partySizeMode = parsed as RaidLabPartySize;
                }
            }
            i += 1;
        } else if (arg === '--multi-ready' && next) {
            if (next === 'sweep' || RAID_LAB_MULTI_READY.includes(next as RaidLabMultiReadyId)) {
                multiReadyMode = next as RaidLabMultiReadyId | 'sweep';
            }
            i += 1;
        } else if (arg === '--max-actions' && next) {
            maxActions = Math.max(1, Number.parseInt(next, 10) || 400);
            i += 1;
        } else if (arg === '--no-report') {
            writeReport = false;
        }
    }

    return {
        seeds,
        seedStart,
        policy,
        stress,
        classMode,
        routeMode,
        loadoutMode,
        supplyMode,
        conserveMode,
        partySizeMode,
        multiReadyMode,
        maxActions,
        writeReport,
        singleSeed,
    };
}

function buildRunOptions(
    seed: number,
    args: ReturnType<typeof parseArgs>,
): Parameters<typeof runRaidLabExpedition>[0] {
    const partySize = resolveRaidLabPartySize(args.partySizeMode, seed);
    return {
        seed,
        policy: args.policy,
        maxActions: args.maxActions,
        stress: args.stress,
        classKey: resolveRaidLabClass(args.classMode, seed),
        routeMode: args.routeMode,
        loadout: resolveRaidLabLoadout(args.loadoutMode, seed),
        supply: resolveRaidLabSupply(args.supplyMode, seed),
        conserve: resolveRaidLabConserve(args.conserveMode, seed),
        partySize,
        multiReady: resolveRaidLabMultiReady(args.multiReadyMode, seed),
        companionClasses: resolveRaidLabCompanionClasses(partySize, seed),
    };
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    if (args.singleSeed !== null) {
        const result = runRaidLabExpedition(buildRunOptions(args.singleSeed, args));
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }

    const startedAt = Date.now();
    const results: RaidLabExperimentResult[] = [];
    for (let i = 0; i < args.seeds; i++) {
        const seed = args.seedStart + i;
        results.push(runRaidLabExpedition(buildRunOptions(seed, args)));
        if ((i + 1) % 10 === 0 || i + 1 === args.seeds) {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
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
        const matrixTag = [
            args.loadoutMode !== RAID_LAB_DEFAULT_LOADOUT ? `loadout-${args.loadoutMode}` : null,
            args.supplyMode !== RAID_LAB_DEFAULT_SUPPLY ? `supply-${args.supplyMode}` : null,
            args.conserveMode !== RAID_LAB_DEFAULT_CONSERVE ? `conserve-${args.conserveMode}` : null,
            args.partySizeMode !== RAID_LAB_DEFAULT_PARTY_SIZE ? `party-${args.partySizeMode}` : null,
            args.multiReadyMode !== RAID_LAB_DEFAULT_MULTI_READY ? `ready-${args.multiReadyMode}` : null,
        ].filter(Boolean).join('-');
        const matrixSuffix = matrixTag ? `-${matrixTag}` : '';
        const label = `smoke-${args.policy}${stressTag}${matrixSuffix}-class-${args.classMode}-route-${args.routeMode}-s${args.seedStart}-n${args.seeds}-${stamp}`;
        const paths = writeCohortReport(summary, results, label);
        process.stdout.write(`Wrote ${paths.mdPath}\n`);
        process.stdout.write(`Wrote ${paths.jsonPath}\n`);
    }
}

main();
