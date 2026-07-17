import { createBaseStats, getBaseStatsForClass } from '../../src/data/Stats';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import { getClassLine } from '../../src/data/ClassTree';
import { WorldSession, WORLD_TICK_MS } from '../../server/WorldSession';
import { WorldMap } from '../../src/map/WorldMap';
import type {
    ActorSnapshot,
    AutoLootGrantMessage,
    RaidResultMessage,
    WorldJoinMessage,
    WorldServerMessage,
} from '../../src/net/WorldProtocol';
import { FIELD_MAX_ACTION_GAUGE } from '../../src/field/FieldActionEconomy';
import { digestExperimentResult } from './digest';
import { checkRaidLabInvariants } from './invariants';
import { planLocalStep, type PathCache } from './pathing';
import { getRaidLabPolicy, type LabObservation } from './policies';
import { createLabTokenFactory, createMulberry32, sessionEpochFromSeed } from './rng';
import {
    RAID_LAB_VERSION,
    type RaidLabActionRecord,
    type RaidLabExperimentResult,
    type RaidLabInvariantViolation,
    type RaidLabPolicyId,
    type RaidLabRunOptions,
} from './types';

const DEFAULT_MAX_ACTIONS = 1_500;
const DEFAULT_MAX_SIM_MS = 30 * 60 * 1000;
const HEAL_ITEM_CANDIDATES = ['herb_common', 'herb_cheap', 'herb_rare'] as const;
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
    const starterHealQuantity = usesLowHpStress(stressMode) ? 0 : 3;
    configureStarterHealItems(save, starterHealQuantity);

    const joinMessage = createJoinMessage(character, departureTownId, starterHealQuantity);
    let now = 0;
    const joined = session.join(joinMessage, now, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });

    const actions: RaidLabActionRecord[] = [];
    const invariantViolations: RaidLabInvariantViolation[] = [];
    let raidResult: RaidResultMessage | null = null;
    let raidResultCount = 0;
    let actorFinal: RaidLabExperimentResult['actorFinal'];
    let intentOrdinal = 0;
    let cappedStop: 'max_actions' | 'max_sim_ms' | 'invariant_abort' | null = null;
    const ignoredLootIds = new Set<string>();
    const pathCache: PathCache = { goalKey: '', waypointKey: '', path: [], index: 0 };

    const recordAction = (kind: string, detail?: string) => {
        actions.push({
            index: actions.length,
            kind,
            simMs: now,
            ...(detail ? { detail } : {}),
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

        const observation = buildObservation(
            session,
            world,
            joined.playerId,
            extraction,
            policyRng,
            ignoredLootIds,
            actions.length,
            pathCache,
            now,
        );
        if (!observation) {
            break;
        }

        if (!observation.actorReady) {
            now = advanceUntilReadyOrDone(session, joined.playerId, now, maxSimMs, applyMessages);
            continue;
        }

        actorFinal = {
            hp: observation.hp,
            maxHp: observation.maxHp,
            mp: observation.mp,
            level: getActorLevel(session, joined.playerId),
            exp: getActorExp(session, joined.playerId),
            tileX: observation.tile.x,
            tileY: observation.tile.y,
            mov: observation.mov,
        };

        if (process.env.RAID_LAB_TRACE === '1' && actions.length % 50 === 0) {
            process.stderr.write(
                `trace seed=${options.seed} i=${actions.length} `
                + `pos=${observation.tile.x},${observation.tile.y} `
                + `hp=${observation.hp} kills=${observation.kills} `
                + `enemies=${observation.enemies.length} `
                + `town=${observation.currentTownId ?? '-'} `
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

        const actor = getOwnedActor(session, joined.playerId);
        if (!actor) break;

        const intentId = `lab_${options.seed}_${intentOrdinal++}`;
        let handled = false;

        if (decision.kind === 'move' && decision.tile) {
            // Prefer tiles on the lab corridor — straight-line candidates clip through walls
            // and stall (cautious seeds 125/261 stuck at ~(1426,1444) east of a WALL).
            const pathHint = pathCache.path.slice(pathCache.index, pathCache.index + 10);
            const moveAttempt = attemptMove(
                session,
                joined.playerId,
                actor.id,
                actor.tile,
                decision.tile,
                intentId,
                now,
                pathHint,
                world
            );
            applyMessages([...moveAttempt.replies, ...moveAttempt.broadcasts]);
            recordAction(
                moveAttempt.rejected ? 'move_rejected' : 'move',
                decision.detail ?? `${moveAttempt.tile.x},${moveAttempt.tile.y}`
            );
            handled = true;
        } else if (decision.kind === 'attack' && decision.targetId) {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId: actor.id,
                kind: 'attack',
                payload: { targetId: decision.targetId },
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(hasActionRejected(result.replies) ? 'attack_rejected' : 'attack', decision.detail ?? decision.targetId);
            handled = true;
        } else if (decision.kind === 'defend') {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId: actor.id,
                kind: 'defend',
                payload: {},
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(hasActionRejected(result.replies) ? 'defend_rejected' : 'defend', decision.detail);
            handled = true;
        } else if (decision.kind === 'rest') {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId: actor.id,
                kind: 'rest',
                payload: {},
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(hasActionRejected(result.replies) ? 'rest_rejected' : 'rest', decision.detail);
            handled = true;
        } else if (decision.kind === 'useItem' && decision.itemId) {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId: actor.id,
                kind: 'useItem',
                payload: { itemId: decision.itemId },
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(hasActionRejected(result.replies) ? 'useItem_rejected' : 'useItem', decision.itemId);
            handled = true;
        } else if (decision.kind === 'loot' && decision.lootId) {
            const interact = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId: `${intentId}:interact`,
                actorId: actor.id,
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
                recordAction('loot', decision.lootId);
            } else {
                ignoredLootIds.add(decision.lootId);
                const rejected = interact.replies.some((message) => message.type === 'ACTION_REJECTED');
                recordAction(rejected ? 'loot_rejected' : 'loot', decision.lootId);
            }
            handled = true;
        } else if (decision.kind === 'endTurn') {
            const result = session.handleMessage(joined.playerId, {
                type: 'PLAYER_INTENT',
                intentId,
                actorId: actor.id,
                kind: 'endTurn',
                payload: { reason: decision.detail ?? 'lab' },
            }, now);
            applyMessages([...result.replies, ...result.broadcasts]);
            recordAction(hasActionRejected(result.replies) ? 'endTurn_rejected' : 'endTurn', decision.detail);
            handled = true;
        }

        if (!handled) {
            now += WORLD_TICK_MS;
            applyMessages(flattenTick(session.tick(now)));
            recordAction('noop', decision.kind);
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

    const base = {
        labVersion: RAID_LAB_VERSION,
        seed: options.seed,
        policy: policyId,
        stress: stressMode,
        classKey,
        routeMode,
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

    function collectInvariants(): void {
        const finished = !session.getDebugState().players.has(joined.playerId);
        invariantViolations.push(...checkRaidLabInvariants({
            session,
            playerId: joined.playerId,
            simMs: now,
            actionIndex: actions.length,
            raidFinished: finished,
        }));
    }

    function forceLeave(reason: 'town' | 'manual', detail: string): void {
        if (raidResult || !session.getDebugState().players.has(joined.playerId)) return;
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

function configureStarterHealItems(
    save: ReturnType<typeof createDefaultCharacterSave>,
    quantity: number,
): void {
    save.inventory.items = save.inventory.items.filter((item) => (
        !HEAL_ITEM_CANDIDATES.includes(item.itemId as typeof HEAL_ITEM_CANDIDATES[number])
    ));
    if (quantity <= 0) return;
    save.inventory.items.push({
        itemId: 'herb_common',
        gridX: 0,
        gridY: 0,
        quantity,
        durability: 1,
    });
}

function createJoinMessage(character: AuthCharacter, originHubId: string, healQuantity: number): WorldJoinMessage {
    const partyActor: ActorSnapshot = {
        id: character.id,
        localActorId: character.id,
        name: character.name,
        classLineId: character.classKey,
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: { ...character.baseStats },
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        facing: 'down',
        isDead: false,
    };
    return {
        type: 'WORLD_JOIN',
        originHubId,
        partyComposition: [partyActor],
        clientVersion: 'raid-lab',
        carriedItems: healQuantity > 0 ? [{ itemId: 'herb_common', quantity: healQuantity }] : [],
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
    extraction: { townId: string; tile: { x: number; y: number } },
    policyRng: () => number,
    ignoredLootIds: ReadonlySet<string>,
    actionCount: number,
    pathCache: PathCache,
    now: number,
): LabObservation | null {
    const debug = session.getDebugState();
    const player = debug.players.get(playerId);
    if (!player) return null;
    const serverActor = [...debug.actors.values()].find((entry) => entry.ownerPlayerId === playerId);
    if (!serverActor) return null;
    const snapshot = session.createSnapshot(playerId, now);
    const actor = snapshot.partyActors.find((entry) => entry.id === serverActor.id);
    if (!actor) return null;

    const currentTownId = world.getTownAtTile(actor.tile.x, actor.tile.y)?.id ?? null;
    const healItemId = HEAL_ITEM_CANDIDATES.find((itemId) => (player.carriedItems.get(itemId) ?? 0) > 0) ?? null;
    const lootItemsAcquired = (player.saveSnapshot?.inventory.items ?? [])
        .filter((item) => item.acquiredInRaid === true)
        .reduce((sum, item) => sum + Math.max(1, Math.floor(item.quantity ?? 1)), 0);

    return {
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

function getOwnedActor(session: WorldSession, playerId: string) {
    return [...session.getDebugState().actors.values()].find((entry) => entry.ownerPlayerId === playerId);
}

/** Phase 3 stress: start the expedition already wounded (≈30% HP). */
function applyLowHpStress(session: WorldSession, playerId: string): void {
    const actor = getOwnedActor(session, playerId);
    if (!actor) return;
    const maxHp = Math.max(1, actor.stats.maxHp);
    actor.stats.hp = Math.max(1, Math.floor(maxHp * 0.3));
}

function usesLowHpStress(stress: RaidLabRunOptions['stress']): boolean {
    return stress === 'low-hp' || stress === 'low-hp+dense-nests';
}

function usesDenseNestStress(stress: RaidLabRunOptions['stress']): boolean {
    return stress === 'dense-nests' || stress === 'low-hp+dense-nests';
}

function getActorLevel(session: WorldSession, playerId: string): number {
    return getOwnedActor(session, playerId)?.level ?? 1;
}

function getActorExp(session: WorldSession, playerId: string): number {
    return getOwnedActor(session, playerId)?.exp ?? 0;
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

function advanceUntilReadyOrDone(
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
        const actor = getOwnedActor(session, playerId);
        if (!actor || actor.isDead) return cursor;
        if (actor.actionGauge >= FIELD_MAX_ACTION_GAUGE && actor.remainingAp > 0) return cursor;
        if (cursor >= maxSimMs) return cursor;
    }
    return cursor;
}
