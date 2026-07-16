import { createBaseStats } from '../../src/data/Stats';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
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
const HEAL_ITEM_CANDIDATES = ['herb_common', 'herb_cheap', 'herb_rare', 'mp_potion'] as const;

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

    const sessionEpoch = sessionEpochFromSeed(options.seed);
    const session = new WorldSession({
        sessionEpoch,
        random: combatRng,
        createToken: createLabTokenFactory(options.seed),
    });

    const world = getSharedWorldMap();
    const departureTownId = 'central_castle';
    const extraction = pickExtractionTown(world, departureTownId);
    const character = createStarterCharacter(options.seed);
    const save = createDefaultCharacterSave(character, 'M', '2026-01-01T00:00:00.000Z');
    ensureStarterHealItem(save);

    const joinMessage = createJoinMessage(character, departureTownId);
    let now = 0;
    const joined = session.join(joinMessage, now, {
        accountId: character.accountId,
        characterId: character.id,
        saveSnapshot: save,
    });

    const actions: RaidLabActionRecord[] = [];
    const invariantViolations: RaidLabInvariantViolation[] = [];
    let raidResult: RaidResultMessage | null = null;
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
                raidResult = message;
            }
            if (message.type === 'AUTO_LOOT_GRANT') {
                resolveAutoLoot(session, joined.playerId, message, now);
                recordAction('auto_loot_resolve', message.lootId);
            }
        }
    };

    applyMessages(flattenTick(session.tick(now)));
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
            pathCache
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
            const moveAttempt = attemptMove(
                session,
                joined.playerId,
                actor.id,
                actor.tile,
                decision.tile,
                intentId,
                now
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
            recordAction('attack', decision.detail ?? decision.targetId);
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
            recordAction('rest', decision.detail);
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
            recordAction('useItem', decision.itemId);
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
            recordAction('endTurn', decision.detail);
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
        result: finalResult.result,
        elapsedSeconds: finalResult.elapsedSeconds,
        kills: finalResult.kills,
        departureTownId: finalResult.departureTownId,
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

function createStarterCharacter(seed: number): AuthCharacter {
    return {
        id: `lab_char_${seed}`,
        accountId: `lab_account_${seed}`,
        slotNo: 0,
        name: `LabHero${seed}`,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats({ spd: 100, mov: 5, actionLimit: 80, hitRate: 200 }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}

function ensureStarterHealItem(save: ReturnType<typeof createDefaultCharacterSave>): void {
    const hasHeal = save.inventory.items.some((item) => (
        HEAL_ITEM_CANDIDATES.includes(item.itemId as typeof HEAL_ITEM_CANDIDATES[number])
    ));
    if (hasHeal) return;
    save.inventory.items.push({
        itemId: 'herb_common',
        gridX: 0,
        gridY: 0,
        quantity: 3,
        durability: 1,
    });
}

function createJoinMessage(character: AuthCharacter, originHubId: string): WorldJoinMessage {
    const partyActor: ActorSnapshot = {
        id: character.id,
        localActorId: character.id,
        name: character.name,
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: createBaseStats({ spd: 100, mov: 5, actionLimit: 80, hitRate: 200 }),
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
        carriedItems: [{ itemId: 'herb_common', quantity: 3 }],
    };
}

function pickExtractionTown(
    world: WorldMap,
    departureTownId: string
): { townId: string; tile: { x: number; y: number } } {
    const departure = world.getTowns().find((town) => town.id === departureTownId);
    const others = world.getTowns().filter((town) => town.id !== departureTownId);
    const origin = departure ? world.getTownExitTile(departure) : { x: 0, y: 0 };
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
    pathCache: PathCache
): LabObservation | null {
    const debug = session.getDebugState();
    const player = debug.players.get(playerId);
    if (!player) return null;
    const actor = [...debug.actors.values()].find((entry) => entry.ownerPlayerId === playerId);
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
        attackRange: actor.attackRange ?? 1,
        mov: Math.max(1, actor.stats.mov || 1),
        currentTownId,
        departureTownId: player.departureTownId,
        extractionGoal: extraction.tile,
        extractionTownId: extraction.townId,
        enemies: [...debug.enemies.values()].map((entry) => ({
            id: entry.enemy.id,
            tile: { x: entry.enemy.gridX, y: entry.enemy.gridY },
            hp: entry.enemy.stats.hp,
            isAggro: entry.enemy.isAggro,
        })),
        loot: [...debug.loot.values()]
            .filter((entry) => !entry.opened)
            .map((entry) => ({
                id: entry.id,
                tile: { x: entry.x, y: entry.y },
            })),
        ignoredLootIds,
        healItemId,
        kills: player.kills,
        lootItemsAcquired,
        actionCount,
        planStep: (goal) => planLocalStep(
            world,
            actor.tile,
            goal,
            Math.max(1, actor.stats.mov || 1),
            actor.id,
            pathCache
        ),
        random: policyRng,
    };
}

function getOwnedActor(session: WorldSession, playerId: string) {
    return [...session.getDebugState().actors.values()].find((entry) => entry.ownerPlayerId === playerId);
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
    now: number
): { replies: WorldServerMessage[]; broadcasts: WorldServerMessage[]; rejected: boolean; tile: { x: number; y: number } } {
    // Try farthest legal prefix first so rejected long WorldMap plans still get full MOV steps.
    const candidates = buildMoveCandidates(from, desired, 8);
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
    maxSteps: number
): Array<{ x: number; y: number }> {
    const line: Array<{ x: number; y: number }> = [];
    let x = from.x;
    let y = from.y;
    for (let step = 0; step < maxSteps; step++) {
        if (x === desired.x && y === desired.y) break;
        if (Math.abs(desired.x - x) >= Math.abs(desired.y - y) && x !== desired.x) {
            x += Math.sign(desired.x - x);
        } else if (y !== desired.y) {
            y += Math.sign(desired.y - y);
        } else if (x !== desired.x) {
            x += Math.sign(desired.x - x);
        } else {
            break;
        }
        line.push({ x, y });
    }

    return [
        desired,
        ...[...line].reverse(),
        { x: from.x + 1, y: from.y },
        { x: from.x - 1, y: from.y },
        { x: from.x, y: from.y + 1 },
        { x: from.x, y: from.y - 1 },
    ];
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
