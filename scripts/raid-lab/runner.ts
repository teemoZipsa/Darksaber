import { createBaseStats, getBaseStatsForClass } from '../../src/data/Stats';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { createWorldJoinSaveState } from '../../server/WorldJoinSave';
import { getClassLine } from '../../src/data/ClassTree';
import { WorldSession, WORLD_TICK_MS } from '../../server/WorldSession';
import type { ServerActor } from '../../server/WorldSessionTypes';
import { WorldMap } from '../../src/map/WorldMap';
import type {
    ActorSnapshot,
    AutoLootGrantMessage,
    RaidResultMessage,
    WorldJoinMessage,
    WorldServerMessage,
} from '../../src/net/WorldProtocol';
import { FIELD_MAX_ACTION_GAUGE } from '../../src/field/FieldActionEconomy';
import type { StartingClassId } from '../../src/data/characterClasses';
import { digestExperimentResult } from './digest';
import { checkRaidLabInvariants } from './invariants';
import {
    applyRaidLabLoadout,
    applyRaidLabSupply,
    carriedItemsFromStacks,
    countHealQuantity,
    pickHealItemId,
} from './loadouts';
import { resolveRaidLabCompanionClasses } from './matrix';
import {
    applyLabPartyToSave,
    buildLabPartySpecs,
    selectReadyActor,
    type LabReadyActorView,
} from './party';
import { planLocalStep, type PathCache } from './pathing';
import { getRaidLabPolicy, type LabObservation } from './policies';
import { createLabTokenFactory, createMulberry32, sessionEpochFromSeed } from './rng';
import {
    RAID_LAB_DEFAULT_CONSERVE,
    RAID_LAB_DEFAULT_LOADOUT,
    RAID_LAB_DEFAULT_MULTI_READY,
    RAID_LAB_DEFAULT_PARTY_SIZE,
    RAID_LAB_DEFAULT_SUPPLY,
    RAID_LAB_VERSION,
    type RaidLabActionRecord,
    type RaidLabActorFinal,
    type RaidLabConserveId,
    type RaidLabExperimentResult,
    type RaidLabInvariantViolation,
    type RaidLabLoadoutId,
    type RaidLabMultiReadyId,
    type RaidLabPartySize,
    type RaidLabPolicyId,
    type RaidLabRunOptions,
    type RaidLabSupplyId,
} from './types';

const DEFAULT_MAX_ACTIONS = 1_500;
const DEFAULT_MAX_SIM_MS = 30 * 60 * 1000;
/** Phase 3 denser nests: faster respawn, wider roam, higher spawn caps. */
const DENSE_NEST_TUNING = {
    respawnMs: 20_000,
    roamRadiusChunks: 3,
    refreshMaxEnemies: 48,
    departureRadiusChunks: 5,
    departureMaxEnemies: 36,
} as const;

let sharedWorldMap: WorldMap | null = null;

function getSharedWorldMap(): WorldMap {
    sharedWorldMap ??= new WorldMap();
    return sharedWorldMap;
}

export function runRaidLabExpedition(options: RaidLabRunOptions): RaidLabExperimentResult {
    const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
    const maxSimMs = options.maxSimMs ?? DEFAULT_MAX_SIM_MS;
    const abortOnInvariant = options.abortOnInvariant ?? false;
    const policyId = options.policy;
    const policy = getRaidLabPolicy(policyId);
    const policyRng = createMulberry32((options.seed * 0x85ebca6b) >>> 0);
    const combatRng = createMulberry32((options.seed * 0xc2b2ae35) >>> 0);

    const stressMode = options.stress ?? 'none';
    const classKey = options.classKey ?? 'infantry';
    const routeMode = options.routeMode ?? 'nearest';
    const loadout: RaidLabLoadoutId = options.loadout ?? RAID_LAB_DEFAULT_LOADOUT;
    const supply: RaidLabSupplyId = usesLowHpStress(stressMode)
        ? 'none'
        : (options.supply ?? RAID_LAB_DEFAULT_SUPPLY);
    const conserve: RaidLabConserveId = options.conserve ?? RAID_LAB_DEFAULT_CONSERVE;
    const partySize: RaidLabPartySize = options.partySize ?? RAID_LAB_DEFAULT_PARTY_SIZE;
    const multiReady: RaidLabMultiReadyId = options.multiReady ?? RAID_LAB_DEFAULT_MULTI_READY;
    const companionClasses: StartingClassId[] = resolveRaidLabCompanionClasses(
        partySize,
        options.seed,
        options.companionClasses,
    );
    const sessionEpoch = sessionEpochFromSeed(options.seed);
    const session = new WorldSession({
        sessionEpoch,
        random: combatRng,
        createToken: createLabTokenFactory(options.seed),
        ...(usesDenseNestStress(stressMode) ? { fieldNestTuning: DENSE_NEST_TUNING } : {}),
    });

    const world = getSharedWorldMap();
    const departureTownId = 'central_castle';
    const extraction = pickExtractionTown(world, departureTownId, routeMode, options.seed);
    const character = createStarterCharacter(options.seed, classKey);
    const save = createDefaultCharacterSave(character, 'M', '2026-01-01T00:00:00.000Z');
    applyRaidLabLoadout(save, classKey, loadout);
    const supplyStacks = applyRaidLabSupply(save, supply);
    const carriedItems = carriedItemsFromStacks(supplyStacks);
    const partySpecs = buildLabPartySpecs(options.seed, character, partySize, companionClasses);
    applyLabPartyToSave(save, character, partySpecs, loadout);

    const useJoinSave = partySize > 1 || loadout !== 'bare';
    const joinSave = useJoinSave ? createWorldJoinSaveState(character, save) : null;
    const joinMessage = createJoinMessage({
        character,
        originHubId: departureTownId,
        carriedItems,
        partyComposition: joinSave?.partyComposition,
        carriedWeight: joinSave?.carriedWeight ?? 0,
    });
    let now = 0;
    const joined = session.join(joinMessage, now, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: joinSave?.saveSnapshot ?? save,
        ...(joinSave ? {
            equipmentStatBonuses: joinSave.equipmentStatBonuses,
            equipmentAttackRanges: joinSave.equipmentAttackRanges,
        } : {}),
    });
    const carriedWeightAtJoin = joined.playerId
        ? (session.getDebugState().players.get(joined.playerId)?.carriedWeight ?? joinMessage.carriedWeight ?? 0)
        : 0;
    let healUses = 0;
    let healQtyRemaining = countHealQuantity(
        session.getDebugState().players.get(joined.playerId)?.carriedItems ?? new Map()
    );

    const actions: RaidLabActionRecord[] = [];
    const invariantViolations: RaidLabInvariantViolation[] = [];
    let raidResult: RaidResultMessage | null = null;
    let raidResultCount = 0;
    let actorFinal: RaidLabExperimentResult['actorFinal'];
    let actorsFinal: RaidLabExperimentResult['actorsFinal'];
    let intentOrdinal = 0;
    let roundRobinCursor = 0;
    let cappedStop: 'max_actions' | 'max_sim_ms' | 'invariant_abort' | null = null;
    const ignoredLootIds = new Set<string>();
    const pathCache: PathCache = { goalKey: '', waypointKey: '', path: [], index: 0 };

    const recordAction = (kind: string, detail?: string, localActorId?: string) => {
        const tagged = partySize > 1 && localActorId
            ? (detail ? `${detail}|actor=${localActorId}` : `|actor=${localActorId}`)
            : detail;
        actions.push({
            index: actions.length,
            kind,
            simMs: now,
            ...(tagged ? { detail: tagged } : {}),
        });
    };

    const applyMessages = (messages: WorldServerMessage[]) => {
        for (const message of messages) {
            if (message.type === 'RAID_RESULT') {
                raidResultCount += 1;
                raidResult = message;
            }
            if (message.type === 'AUTO_LOOT_GRANT') {
                resolveAutoLoot(session, joined.playerId, message, now);
                recordAction('auto_loot_resolve', message.lootId);
            }
        }
    };

    applyMessages(flattenTick(session.tick(now)));
    if (usesLowHpStress(stressMode)) {
        applyLowHpStress(session, joined.playerId);
    }
    collectInvariants();

    while (!raidResult) {
        if (actions.length >= maxActions) {
            forceLeave('manual', 'max-actions');
            cappedStop = 'max_actions';
            break;
        }
        if (now >= maxSimMs) {
            forceLeave('manual', 'max-sim-ms');
            cappedStop = 'max_sim_ms';
            break;
        }

        const owned = listOwnedActors(session, joined.playerId);
        if (owned.length === 0) {
            break;
        }

        const readyViews = buildReadyActorViews(owned, character.id);
        if (readyViews.length === 0) {
            now = advanceUntilAnyReady(session, joined.playerId, now, maxSimMs, applyMessages);
            continue;
        }

        const selected = selectReadyActor(readyViews, multiReady, roundRobinCursor);
        if (!selected) {
            now = advanceUntilAnyReady(session, joined.playerId, now, maxSimMs, applyMessages);
            continue;
        }
        roundRobinCursor = selected.nextCursor;

        const serverActor = owned.find((entry) => entry.id === selected.actor.id);
        if (!serverActor) {
            break;
        }

        const observation = buildObservation(
            session,
            world,
            joined.playerId,
            serverActor,
            partySize,
            extraction,
            policyRng,
            ignoredLootIds,
            actions.length,
            pathCache,
            now,
            conserve,
        );
        if (!observation) {
            break;
        }
        healQtyRemaining = countHealQuantity(
            session.getDebugState().players.get(joined.playerId)?.carriedItems ?? new Map()
        );

        if (!observation.actorReady) {
            now = advanceUntilAnyReady(session, joined.playerId, now, maxSimMs, applyMessages);
            continue;
        }

        refreshActorFinals(owned, character.id);

        if (process.env.RAID_LAB_TRACE === '1' && actions.length % 50 === 0) {
            process.stderr.write(
                `trace seed=${options.seed} i=${actions.length} `
                + `pos=${observation.tile.x},${observation.tile.y} `
                + `hp=${observation.hp} kills=${observation.kills} `
                + `enemies=${observation.enemies.length} `
                + `town=${observation.currentTownId ?? '-'} `
                + `party=${partySize} actor=${serverActor.localActorId} `
                + `credits=${pathCache.astarCredits ?? '-'}\n`
            );
        }

        const decision = policy(observation);
        if (decision.kind === 'wait') {
            now += WORLD_TICK_MS;
            applyMessages(flattenTick(session.tick(now)));
            collectInvariants();
            continue;
        }

        if (decision.kind === 'leave_town' || decision.kind === 'leave_manual') {
            const reason = decision.kind === 'leave_town' ? 'town' : 'manual';
            forceLeave(reason, decision.detail ?? reason);
            break;
        }

        const actorId = observation.actorId;
        const localActorId = serverActor.localActorId;
        const intentId = `lab_${options.seed}_${intentOrdinal++}`;
        let handled = false;

        if (decision.kind === 'move' && decision.tile) {
            // Prefer tiles on the lab corridor — straight-line candidates clip through walls
            // and stall (cautious seeds 125/261 stuck at ~(1426,1444) east of a WALL).
            const pathHint = pathCache.path.slice(pathCache.index, pathCache.index + 10);
            const moveAttempt = attemptMove(
                session,
                joined.playerId,
                actorId,
                serverActor.tile,
                decision.tile,
                intentId,
                now,
                pathHint,
                world
            );
            applyMessages([...moveAttempt.replies, ...moveAttempt.broadcasts]);
            recordAction(
                moveAttempt.rejected ? 'move_rejected' : 'move',
                decision.detail ?? `${moveAttempt.tile.x},${moveAttempt.tile.y}`,
                localActorId,
            );
            handled = true;
        } else if (decision.kind === 'attack' && decision.targetId) {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId,
                kind: 'attack',
                payload: { targetId: decision.targetId },
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(
                hasActionRejected(result.replies) ? 'attack_rejected' : 'attack',
                decision.detail ?? decision.targetId,
                localActorId,
            );
            handled = true;
        } else if (decision.kind === 'defend') {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId,
                kind: 'defend',
                payload: {},
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(
                hasActionRejected(result.replies) ? 'defend_rejected' : 'defend',
                decision.detail,
                localActorId,
            );
            handled = true;
        } else if (decision.kind === 'rest') {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId,
                kind: 'rest',
                payload: {},
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(
                hasActionRejected(result.replies) ? 'rest_rejected' : 'rest',
                decision.detail,
                localActorId,
            );
            handled = true;
        } else if (decision.kind === 'useItem' && decision.itemId) {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId,
                kind: 'useItem',
                payload: { itemId: decision.itemId },
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            const rejected = hasActionRejected(result.replies);
            if (!rejected) healUses += 1;
            recordAction(rejected ? 'useItem_rejected' : 'useItem', decision.itemId, localActorId);
            handled = true;
        } else if (decision.kind === 'loot' && decision.lootId) {
            const interact = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId: `${intentId}:interact`,
                actorId,
                kind: 'interact',
                payload: { lootId: decision.lootId },
            }, now);
            applyMessages([...interact.replies, ...interact.broadcasts]);
            const grant = interact.replies.find((message) => message.type === 'LOOT_GRANT');
            if (grant && grant.type === 'LOOT_GRANT') {
                for (const item of grant.gridSnapshot.items) {
                    const pickup = session.handleMessage(joined.playerId, {
                        type: 'LOOT_PICKUP',
                        intentId: `${intentId}:pickup:${item.gridX},${item.gridY}`,
                        lootId: decision.lootId,
                        gridX: item.gridX,
                        gridY: item.gridY,
                    }, now);
                    applyMessages([...pickup.replies, ...pickup.broadcasts]);
                }
                ignoredLootIds.add(decision.lootId);
                recordAction('loot', decision.lootId, localActorId);
            } else {
                ignoredLootIds.add(decision.lootId);
                const rejected = interact.replies.some((message) => message.type === 'ACTION_REJECTED');
                recordAction(rejected ? 'loot_rejected' : 'loot', decision.lootId, localActorId);
            }
            handled = true;
        } else if (decision.kind === 'endTurn') {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId,
                kind: 'endTurn',
                payload: { reason: decision.detail ?? 'lab' },
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(
                hasActionRejected(result.replies) ? 'endTurn_rejected' : 'endTurn',
                decision.detail,
                localActorId,
            );
            handled = true;
        }

        if (!handled) {
            now += WORLD_TICK_MS;
            applyMessages(flattenTick(session.tick(now)));
            recordAction('noop', decision.kind, localActorId);
        }

        collectInvariants();
        if (abortOnInvariant && invariantViolations.length > 0) {
            forceLeave('manual', 'invariant-abort');
            cappedStop = 'invariant_abort';
            break;
        }

        now += WORLD_TICK_MS;
        applyMessages(flattenTick(session.tick(now)));
        collectInvariants();
    }

    if (!raidResult) {
        forceLeave('manual', 'fallback-leave');
        cappedStop ??= 'max_actions';
    }

    const finalResult = raidResult!;
    const stopReason: RaidLabExperimentResult['stopReason'] = cappedStop ?? 'raid_result';
    const stillPresent = session.getDebugState().players.get(joined.playerId);
    if (stillPresent) {
        healQtyRemaining = countHealQuantity(stillPresent.carriedItems);
        refreshActorFinals(listOwnedActors(session, joined.playerId), character.id);
    }

    const base = {
        labVersion: RAID_LAB_VERSION,
        seed: options.seed,
        policy: policyId,
        stress: stressMode,
        classKey,
        routeMode,
        loadout,
        supply,
        conserve,
        partySize,
        multiReady,
        companionClasses,
        carriedWeight: carriedWeightAtJoin,
        healUses,
        healQtyRemaining,
        result: finalResult.result,
        elapsedSeconds: finalResult.elapsedSeconds,
        kills: finalResult.kills,
        departureTownId: finalResult.departureTownId,
        targetTownId: extraction.townId,
        extractionTownId: finalResult.extractionTownId,
        completedDungeonIds: finalResult.completedDungeonIds ?? [],
        telemetry: finalResult.telemetry ?? {
            engagementCount: 0,
            engagementGapSecondsTotal: 0,
            lootItemsAcquired: 0,
            lootItemsSecured: 0,
            killsByDangerBand: { starter: 0, low: 0, mid: 0, high: 0, scenario: 0 },
            deathCause: 'none' as const,
        },
        actions,
        invariantViolations,
        finishedAtSimMs: now,
        actorFinal,
        actorsFinal,
        stopReason,
    };

    if (raidResultCount !== 1) {
        invariantViolations.push({
            code: 'raid_result_count',
            message: `Expected exactly one RAID_RESULT, received ${raidResultCount}`,
            simMs: now,
            actionIndex: actions.length,
        });
    }

    return {
        ...base,
        digest: digestExperimentResult(base),
    };

    function refreshActorFinals(owned: readonly ServerActor[], leaderLocalId: string): void {
        const mapped: RaidLabActorFinal[] = owned.map((entry) => ({
            hp: entry.stats.hp,
            maxHp: entry.stats.maxHp,
            mp: entry.stats.mp,
            level: entry.level,
            exp: entry.exp ?? 0,
            tileX: entry.tile.x,
            tileY: entry.tile.y,
            mov: Math.max(1, entry.stats.mov || 1),
            localActorId: entry.localActorId,
            isLeader: entry.localActorId === leaderLocalId,
        }));
        mapped.sort((a, b) => (a.localActorId ?? '').localeCompare(b.localActorId ?? ''));
        actorsFinal = mapped;
        actorFinal = mapped.find((entry) => entry.isLeader) ?? mapped[0];
    }

    function collectInvariants(): void {
        const finished = !session.getDebugState().players.has(joined.playerId);
        invariantViolations.push(...checkRaidLabInvariants({
            session,
            playerId: joined.playerId,
            simMs: now,
            actionIndex: actions.length,
            raidFinished: finished,
            expectedPartySize: partySize,
        }));
    }

    function forceLeave(reason: 'town' | 'manual', detail: string): void {
        if (raidResult || !session.getDebugState().players.has(joined.playerId)) return;
        healQtyRemaining = countHealQuantity(
            session.getDebugState().players.get(joined.playerId)?.carriedItems ?? new Map()
        );
        refreshActorFinals(listOwnedActors(session, joined.playerId), character.id);
        const leave = session.handleMessage(joined.playerId, { type: 'WORLD_LEAVE', reason }, now);
        applyMessages([...leave.replies, ...leave.broadcasts]);
        recordAction(`leave_${reason}`, detail);
        collectInvariants();
    }
}

export function runRaidLabCohort(
    seedStart: number,
    count: number,
    policy: RaidLabPolicyId,
    overrides: Partial<RaidLabRunOptions> = {}
): RaidLabExperimentResult[] {
    const results: RaidLabExperimentResult[] = [];
    for (let i = 0; i < count; i++) {
        results.push(runRaidLabExpedition({
            seed: seedStart + i,
            policy,
            ...overrides,
        }));
    }
    return results;
}

function createStarterCharacter(seed: number, classKey: AuthCharacter['classKey']): AuthCharacter {
    const classLine = getClassLine(classKey);
    const baseStats = createBaseStats(getBaseStatsForClass(classKey, classLine?.baseMovRange ?? 3));
    return {
        id: `lab_char_${seed}`,
        accountId: `lab_account_${seed}`,
        slotNo: 0,
        name: `LabHero${seed}`,
        classKey,
        tier: 1,
        level: 1,
        exp: 0,
        baseStats,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}

function createJoinMessage(input: {
    character: AuthCharacter;
    originHubId: string;
    carriedItems: WorldJoinMessage['carriedItems'];
    partyComposition?: ActorSnapshot[];
    carriedWeight?: number;
}): WorldJoinMessage {
    const partyActor: ActorSnapshot = {
        id: input.character.id,
        localActorId: input.character.id,
        name: input.character.name,
        classLineId: input.character.classKey,
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: { ...input.character.baseStats },
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
    };
    return {
        type: 'WORLD_JOIN',
        originHubId: input.originHubId,
        partyComposition: input.partyComposition ?? [partyActor],
        clientVersion: 'raid-lab',
        carriedWeight: input.carriedWeight ?? 0,
        carriedItems: input.carriedItems ?? [],
    };
}

function pickExtractionTown(
    world: WorldMap,
    departureTownId: string,
    routeMode: RaidLabRunOptions['routeMode'],
    seed: number,
): { townId: string; tile: { x: number; y: number } } {
    const departure = world.getTowns().find((town) => town.id === departureTownId);
    const others = world.getTowns().filter((town) => town.id !== departureTownId);
    const origin = departure ? world.getTownExitTile(departure) : { x: 0, y: 0 };
    if (routeMode === 'sweep') {
        const ordered = [...others].sort((a, b) => a.id.localeCompare(b.id));
        const index = ((seed % ordered.length) + ordered.length) % ordered.length;
        const selected = ordered[index]!;
        return { townId: selected.id, tile: world.getTownSpawnTile(selected) };
    }

    let best = others[0]!;
    let bestDist = Infinity;
    for (const town of others) {
        const spawn = world.getTownSpawnTile(town);
        const dist = Math.abs(spawn.x - origin.x) + Math.abs(spawn.y - origin.y);
        if (dist < bestDist) {
            best = town;
            bestDist = dist;
        }
    }
    return { townId: best.id, tile: world.getTownSpawnTile(best) };
}

function buildObservation(
    session: WorldSession,
    world: WorldMap,
    playerId: string,
    serverActor: ServerActor,
    partySize: number,
    extraction: { townId: string; tile: { x: number; y: number } },
    policyRng: () => number,
    ignoredLootIds: ReadonlySet<string>,
    actionCount: number,
    pathCache: PathCache,
    now: number,
    conserve: RaidLabConserveId,
): LabObservation | null {
    const debug = session.getDebugState();
    const player = debug.players.get(playerId);
    if (!player) return null;
    const snapshot = session.createSnapshot(playerId, now);
    const actor = snapshot.partyActors.find((entry) => entry.id === serverActor.id);
    if (!actor) return null;

    const currentTownId = world.getTownAtTile(actor.tile.x, actor.tile.y)?.id ?? null;
    const healItemId = pickHealItemId(player.carriedItems);
    const lootItemsAcquired = (player.saveSnapshot?.inventory.items ?? [])
        .filter((item) => item.acquiredInRaid === true)
        .reduce((sum, item) => sum + Math.max(1, Math.floor(item.quantity ?? 1)), 0);

    return {
        actorId: serverActor.id,
        actorReady: actor.actionGauge >= FIELD_MAX_ACTION_GAUGE && actor.remainingAp > 0 && !actor.isDead,
        remainingAp: actor.remainingAp,
        actionGauge: actor.actionGauge,
        hp: actor.stats.hp,
        maxHp: actor.stats.maxHp,
        mp: actor.stats.mp,
        maxMp: actor.stats.maxMp,
        tile: { ...actor.tile },
        attackRange: serverActor.attackRange ?? 1,
        mov: Math.max(1, actor.stats.mov || 1),
        partySize,
        currentTownId,
        departureTownId: player.departureTownId,
        extractionGoal: extraction.tile,
        extractionTownId: extraction.townId,
        // Policies consume the same visibility-filtered view a real client receives.
        enemies: snapshot.enemies.map((entry) => ({
            id: entry.id,
            tile: { ...entry.tile },
            hp: entry.stats.hp,
            isAggro: entry.isAggro,
        })),
        loot: snapshot.loot
            .filter((entry) => !entry.opened)
            .map((entry) => ({
                id: entry.id,
                tile: { ...entry.tile },
            })),
        ignoredLootIds,
        healItemId,
        conserve,
        kills: player.kills,
        lootItemsAcquired,
        actionCount,
        planStep: (goal) => {
            // Chase/loot can burn A* credits; always keep a reserve for extraction routing
            // (seed 53: credits=0 left the actor oscillating on a western water shore).
            if (goal.x === extraction.tile.x && goal.y === extraction.tile.y
                && (pathCache.astarCredits ?? 0) < 12) {
                pathCache.astarCredits = 12;
            }
            return planLocalStep(
                world,
                actor.tile,
                goal,
                Math.max(1, actor.stats.mov || 1),
                serverActor.id,
                pathCache
            );
        },
        random: policyRng,
    };
}

function listOwnedActors(session: WorldSession, playerId: string): ServerActor[] {
    const debug = session.getDebugState();
    const player = debug.players.get(playerId);
    if (!player) return [];
    const actors: ServerActor[] = [];
    for (const actorId of player.actorIds) {
        const actor = debug.actors.get(actorId);
        if (actor) actors.push(actor);
    }
    return actors;
}

function buildReadyActorViews(
    owned: readonly ServerActor[],
    leaderLocalId: string,
): LabReadyActorView[] {
    const ready: LabReadyActorView[] = [];
    for (const actor of owned) {
        if (actor.isDead) continue;
        if (actor.remainingAp <= 0) continue;
        if (actor.actionGauge < FIELD_MAX_ACTION_GAUGE) continue;
        ready.push({
            id: actor.id,
            localActorId: actor.localActorId,
            hp: actor.stats.hp,
            maxHp: actor.stats.maxHp,
            mp: actor.stats.mp,
            maxMp: actor.stats.maxMp,
            tile: { ...actor.tile },
            remainingAp: actor.remainingAp,
            actionGauge: actor.actionGauge,
            attackRange: actor.attackRange ?? 1,
            mov: Math.max(1, actor.stats.mov || 1),
            level: actor.level,
            exp: actor.exp ?? 0,
            isDead: actor.isDead,
            isLeader: actor.localActorId === leaderLocalId,
        });
    }
    return ready;
}

/** Phase 3 stress: start the expedition already wounded (≈30% HP) for every living party member. */
function applyLowHpStress(session: WorldSession, playerId: string): void {
    for (const actor of listOwnedActors(session, playerId)) {
        if (actor.isDead) continue;
        const maxHp = Math.max(1, actor.stats.maxHp);
        actor.stats.hp = Math.max(1, Math.floor(maxHp * 0.3));
    }
}

function usesLowHpStress(stress: RaidLabRunOptions['stress']): boolean {
    return stress === 'low-hp' || stress === 'low-hp+dense-nests';
}

function usesDenseNestStress(stress: RaidLabRunOptions['stress']): boolean {
    return stress === 'dense-nests' || stress === 'low-hp+dense-nests';
}

function flattenTick(tick: {
    events: WorldServerMessage[];
    perPlayerMessages: Array<{ message: WorldServerMessage }>;
}): WorldServerMessage[] {
    return [...tick.events, ...tick.perPlayerMessages.map((entry) => entry.message)];
}

function hasActionRejected(messages: readonly WorldServerMessage[]): boolean {
    return messages.some((message) => message.type === 'ACTION_REJECTED');
}

function resolveAutoLoot(
    session: WorldSession,
    playerId: string,
    grant: AutoLootGrantMessage,
    now: number
): void {
    session.handleMessage(playerId, {
        type: 'AUTO_LOOT_RESOLVE',
        lootId: grant.lootId,
        acceptedCells: grant.gridSnapshot.items.map((item) => ({ gridX: item.gridX, gridY: item.gridY })),
    }, now);
}

function attemptMove(
    session: WorldSession,
    playerId: string,
    actorId: string,
    from: { x: number; y: number },
    desired: { x: number; y: number },
    intentId: string,
    now: number,
    pathHint: Array<{ x: number; y: number }> = [],
    world?: WorldMap
): { replies: WorldServerMessage[]; broadcasts: WorldServerMessage[]; rejected: boolean; tile: { x: number; y: number } } {
    // Farthest corridor/walkable prefix first so wall chokepoints use the lab detour.
    const candidates = buildMoveCandidates(from, desired, 8, pathHint, world);
    const seen = new Set<string>();
    for (const tile of candidates) {
        const key = `${tile.x},${tile.y}`;
        if (seen.has(key) || (tile.x === from.x && tile.y === from.y)) continue;
        seen.add(key);
        const result = session.handleMessage(playerId, {
            type: 'PLAYER_INTENT',
            intentId: `${intentId}:${key}`,
            actorId,
            kind: 'move',
            payload: { tile, path: [], apCost: 0, pathCost: 0 },
        }, now);
        const rejected = result.replies.some((message) => message.type === 'ACTION_REJECTED');
        if (!rejected) {
            return { replies: result.replies, broadcasts: result.broadcasts, rejected: false, tile };
        }
    }
    return { replies: [], broadcasts: [], rejected: true, tile: desired };
}

function buildMoveCandidates(
    from: { x: number; y: number },
    desired: { x: number; y: number },
    maxSteps: number,
    pathHint: Array<{ x: number; y: number }> = [],
    world?: WorldMap
): Array<{ x: number; y: number }> {
    const walkableLine: Array<{ x: number; y: number }> = [];
    let cur = { ...from };
    for (let step = 0; step < maxSteps; step++) {
        if (cur.x === desired.x && cur.y === desired.y) break;
        const next = world
            ? stepTowardWalkableTile(world, cur, desired)
            : stepTowardBlind(cur, desired);
        if (!next || (next.x === cur.x && next.y === cur.y)) break;
        walkableLine.push(next);
        cur = next;
    }

    const hintForward = pathHint.filter((tile) => tile.x !== from.x || tile.y !== from.y);

    return [
        ...[...hintForward].reverse(),
        desired,
        ...[...walkableLine].reverse(),
        { x: from.x + 1, y: from.y },
        { x: from.x - 1, y: from.y },
        { x: from.x, y: from.y + 1 },
        { x: from.x, y: from.y - 1 },
    ];
}

function stepTowardBlind(
    from: { x: number; y: number },
    goal: { x: number; y: number }
): { x: number; y: number } | null {
    if (from.x === goal.x && from.y === goal.y) return null;
    let x = from.x;
    let y = from.y;
    if (Math.abs(goal.x - x) >= Math.abs(goal.y - y) && x !== goal.x) {
        x += Math.sign(goal.x - x);
    } else if (y !== goal.y) {
        y += Math.sign(goal.y - y);
    } else if (x !== goal.x) {
        x += Math.sign(goal.x - x);
    }
    return { x, y };
}

function stepTowardWalkableTile(
    world: WorldMap,
    from: { x: number; y: number },
    goal: { x: number; y: number }
): { x: number; y: number } | null {
    const dx = Math.sign(goal.x - from.x);
    const dy = Math.sign(goal.y - from.y);
    if (dx === 0 && dy === 0) return null;
    const ordered: Array<{ x: number; y: number }> = [];
    if (Math.abs(goal.x - from.x) >= Math.abs(goal.y - from.y)) {
        if (dx !== 0) ordered.push({ x: from.x + dx, y: from.y });
        if (dy !== 0) ordered.push({ x: from.x, y: from.y + dy });
    } else {
        if (dy !== 0) ordered.push({ x: from.x, y: from.y + dy });
        if (dx !== 0) ordered.push({ x: from.x + dx, y: from.y });
    }
    for (const tile of ordered) {
        if (world.isWalkable(tile.x, tile.y)) return tile;
    }
    return null;
}

/** Advance sim time until any owned living actor is gauge+AP ready, or player leaves / cap. */
function advanceUntilAnyReady(
    session: WorldSession,
    playerId: string,
    now: number,
    maxSimMs: number,
    applyMessages: (messages: WorldServerMessage[]) => void
): number {
    let cursor = now;
    for (let step = 0; step < 600; step++) {
        cursor += WORLD_TICK_MS * 5;
        if (cursor > maxSimMs) cursor = maxSimMs;
        applyMessages(flattenTick(session.tick(cursor)));
        const player = session.getDebugState().players.get(playerId);
        if (!player) return cursor;
        const owned = listOwnedActors(session, playerId);
        const living = owned.filter((actor) => !actor.isDead);
        if (living.length === 0) return cursor;
        const anyReady = living.some(
            (actor) => actor.actionGauge >= FIELD_MAX_ACTION_GAUGE && actor.remainingAp > 0
        );
        if (anyReady) return cursor;
        if (cursor >= maxSimMs) return cursor;
    }
    return cursor;
}
