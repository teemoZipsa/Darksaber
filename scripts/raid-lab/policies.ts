import { manhattan, type TilePoint } from '../../src/field/FieldPathing';
import { normalizeBasicAttackRange } from '../../src/combat/BasicAttackRange';
import {
    ATTACK_AP_COST,
    DEFEND_ACTION_GAUGE_COST,
    MOVE_ACTION_GAUGE_COST,
    REST_ACTION_GAUGE_COST,
    getActionApCost,
} from '../../src/field/FieldActionEconomy';
import {
    getCautiousHealThreshold,
    getCautiousRestThreshold,
    getConserveHealThreshold,
    getExtractHealThreshold,
} from './loadouts';
import { pickIndex } from './rng';
import type { RaidLabConserveId, RaidLabPolicyId } from './types';

export type LabDecisionKind =
    | 'move'
    | 'attack'
    | 'defend'
    | 'rest'
    | 'useItem'
    | 'loot'
    | 'leave_town'
    | 'leave_manual'
    | 'endTurn'
    | 'wait';

export interface LabDecision {
    kind: LabDecisionKind;
    tile?: TilePoint;
    targetId?: string;
    itemId?: string;
    lootId?: string;
    detail?: string;
}

export interface LabEnemyView {
    id: string;
    tile: TilePoint;
    hp: number;
    isAggro: boolean;
}

export interface LabLootView {
    id: string;
    tile: TilePoint;
}

export interface LabObservation {
    /** Server actor id currently selected to act (multi-ready). */
    actorId: string;
    actorReady: boolean;
    remainingAp: number;
    actionGauge: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    tile: TilePoint;
    attackRange: number;
    mov: number;
    partySize: number;
    currentTownId: string | null;
    departureTownId: string;
    extractionGoal: TilePoint;
    extractionTownId: string;
    enemies: LabEnemyView[];
    loot: LabLootView[];
    ignoredLootIds: ReadonlySet<string>;
    healItemId: string | null;
    conserve: RaidLabConserveId;
    kills: number;
    lootItemsAcquired: number;
    actionCount: number;
    /** Policy-facing local step planner (terrain-aware). */
    planStep: (goal: TilePoint) => TilePoint;
    random: () => number;
}

export type RaidLabPolicy = (observation: LabObservation) => LabDecision;

const EXTRACT_AFTER_KILLS = 3;
const EXTRACT_AFTER_LOOT = 3;
const EXTRACT_AFTER_ACTIONS = 100;
const USE_ITEM_AP_COST = getActionApCost('tool');

export function getRaidLabPolicy(id: RaidLabPolicyId): RaidLabPolicy {
    switch (id) {
        case 'balanced':
            return balancedPolicy;
        case 'cautious':
            return cautiousPolicy;
        case 'random-legal':
            return randomLegalPolicy;
        default: {
            const _exhaustive: never = id;
            return _exhaustive;
        }
    }
}

function shouldExtract(obs: LabObservation): boolean {
    return obs.kills >= EXTRACT_AFTER_KILLS
        || obs.lootItemsAcquired >= EXTRACT_AFTER_LOOT
        || obs.actionCount >= EXTRACT_AFTER_ACTIONS;
}

function balancedPolicy(obs: LabObservation): LabDecision {
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId) {
        return { kind: 'leave_town', detail: `extract:${obs.currentTownId}` };
    }
    if (!obs.actorReady) return { kind: 'wait' };

    const hpRatio = obs.hp / Math.max(1, obs.maxHp);
    const healAt = getConserveHealThreshold(obs.conserve);
    if (hpRatio <= healAt && obs.healItemId && obs.remainingAp >= USE_ITEM_AP_COST) {
        return { kind: 'useItem', itemId: obs.healItemId, detail: 'heal' };
    }
    if (hpRatio <= healAt && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'rest', detail: 'low-hp-rest' };
    }

    if (shouldExtract(obs)) {
        return extractPhase(obs, hpRatio, 'balanced-extract');
    }

    const inRange = nearestAttackable(obs);
    if (inRange && obs.remainingAp >= ATTACK_AP_COST) {
        return { kind: 'attack', targetId: inRange.id, detail: 'engage' };
    }

    const adjacentLoot = nearestLoot(obs, 1);
    if (adjacentLoot) {
        return { kind: 'loot', lootId: adjacentLoot.id, detail: 'open-pickup' };
    }
    const nearbyLoot = nearestLoot(obs, 2);
    if (nearbyLoot && obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, nearbyLoot.tile, 'loot-approach');
    }

    const nearbyLootFar = nearestLoot(obs, 24);
    if (nearbyLootFar && obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, nearbyLootFar.tile, 'loot-hunt');
    }

    const chase = nearestEnemy(obs, Number.POSITIVE_INFINITY);
    if (chase && hpRatio > 0.4 && obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, chase.tile, 'chase');
    }

    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, obs.extractionGoal, 'extract-path');
    }
    if (obs.remainingAp > 0) return { kind: 'endTurn', detail: 'spent' };
    return { kind: 'wait' };
}

function cautiousPolicy(obs: LabObservation): LabDecision {
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId) {
        return { kind: 'leave_town', detail: `extract:${obs.currentTownId}` };
    }
    if (!obs.actorReady) return { kind: 'wait' };

    const hpRatio = obs.hp / Math.max(1, obs.maxHp);
    const healAt = getCautiousHealThreshold(obs.conserve);
    const restAt = getCautiousRestThreshold(obs.conserve);
    if (hpRatio <= healAt && obs.healItemId && obs.remainingAp >= USE_ITEM_AP_COST) {
        return { kind: 'useItem', itemId: obs.healItemId, detail: 'heal' };
    }
    if (hpRatio <= restAt && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'rest', detail: 'cautious-rest' };
    }

    // Once extracting, disengage — seed 2 died cornered-fighting on the extract path.
    if (shouldExtract(obs)) {
        if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
            return moveToward(obs, obs.extractionGoal, 'extract-path');
        }
        if (obs.remainingAp > 0) return { kind: 'endTurn', detail: 'extract-spent' };
        return { kind: 'wait' };
    }

    const adjacentThreat = nearestAttackable(obs);
    if (adjacentThreat && manhattan(obs.tile, adjacentThreat.tile) <= 1
        && obs.remainingAp >= ATTACK_AP_COST
        && hpRatio > 0.7) {
        return { kind: 'attack', targetId: adjacentThreat.id, detail: 'cornered' };
    }

    const closeThreat = nearestEnemy(obs, 3);
    if (closeThreat && hpRatio < 0.7 && obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        const away = {
            x: obs.tile.x + Math.sign(obs.tile.x - closeThreat.tile.x),
            y: obs.tile.y + Math.sign(obs.tile.y - closeThreat.tile.y),
        };
        return moveToward(obs, away, 'flee');
    }

    // Short loot peek near spawn only.
    const nearbyLoot = nearestLoot(obs, 12);
    if (nearbyLoot && obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        const adjacent = nearestLoot(obs, 1);
        if (adjacent) return { kind: 'loot', lootId: adjacent.id, detail: 'open-pickup' };
        return moveToward(obs, nearbyLoot.tile, 'loot-peek');
    }

    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, obs.extractionGoal, 'extract-path');
    }
    if (obs.remainingAp > 0) return { kind: 'endTurn', detail: 'spent' };
    return { kind: 'wait' };
}

function randomLegalPolicy(obs: LabObservation): LabDecision {
    if (!obs.actorReady) return { kind: 'wait' };

    // This policy is an intent fuzzer, not a survival policy. Every enumerated
    // executable intent receives equal weight; no low-HP or outcome bias.
    const options: Array<() => LabDecision> = [];
    const add = (decision: LabDecision) => options.push(() => decision);
    const moveGoalKeys = new Set<string>();
    const addMove = (goal: TilePoint, detail: string) => {
        const key = `${goal.x},${goal.y}`;
        if (moveGoalKeys.has(key)) return;
        moveGoalKeys.add(key);
        options.push(() => moveToward(obs, goal, detail));
    };

    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        addMove(obs.extractionGoal, 'random-extract');
        for (const enemy of obs.enemies) addMove(enemy.tile, `random-chase:${enemy.id}`);
        for (const loot of obs.loot) {
            if (!obs.ignoredLootIds.has(loot.id)) addMove(loot.tile, `random-loot:${loot.id}`);
        }
    }
    if (obs.remainingAp >= ATTACK_AP_COST) {
        for (const enemy of attackableEnemies(obs)) {
            add({ kind: 'attack', targetId: enemy.id, detail: `random-attack:${enemy.id}` });
        }
    }
    for (const loot of obs.loot) {
        if (!obs.ignoredLootIds.has(loot.id) && manhattan(obs.tile, loot.tile) <= 1) {
            add({ kind: 'loot', lootId: loot.id, detail: `random-loot-open:${loot.id}` });
        }
    }
    if (obs.healItemId && obs.remainingAp >= USE_ITEM_AP_COST && obs.hp < obs.maxHp) {
        const ratio = obs.hp / Math.max(1, obs.maxHp);
        // Default conserve keeps historical "any missing HP" fuzzing.
        if (obs.conserve !== 'hoard' || ratio <= getConserveHealThreshold(obs.conserve)) {
            add({ kind: 'useItem', itemId: obs.healItemId, detail: 'random-heal' });
        }
    }
    if (obs.remainingAp >= REST_ACTION_GAUGE_COST) add({ kind: 'rest', detail: 'random-rest' });
    if (obs.remainingAp >= DEFEND_ACTION_GAUGE_COST) add({ kind: 'defend', detail: 'random-defend' });
    if (obs.remainingAp > 0) add({ kind: 'endTurn', detail: 'random-end' });
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId) {
        add({ kind: 'leave_town', detail: `extract:${obs.currentTownId}` });
    }
    add({ kind: 'leave_manual', detail: 'random-leave' });

    if (options.length === 0) return { kind: 'wait' };
    return options[pickIndex(obs.random, options.length)]!();
}

function extractPhase(obs: LabObservation, hpRatio: number, detailPrefix: string): LabDecision {
    // Survive first — extractPhase used to skip heal/rest once entered.
    const extractHealAt = getExtractHealThreshold(obs.conserve);
    const extractRestAt = getConserveHealThreshold(obs.conserve);
    if (hpRatio <= extractHealAt && obs.healItemId && obs.remainingAp >= USE_ITEM_AP_COST) {
        return { kind: 'useItem', itemId: obs.healItemId, detail: `${detailPrefix}-heal` };
    }
    if (hpRatio <= extractRestAt && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'rest', detail: `${detailPrefix}-rest` };
    }

    // No extract-clear: seeds 168/321 spent 80–180 attacks with 0 kills then died.
    // Disengage toward town; heal/rest already handled above.
    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, obs.extractionGoal, detailPrefix);
    }
    if (obs.remainingAp > 0) return { kind: 'endTurn', detail: `${detailPrefix}-spent` };
    return { kind: 'wait' };
}

function nearestAttackable(obs: LabObservation): LabEnemyView | null {
    return attackableEnemies(obs)[0] ?? null;
}

function attackableEnemies(obs: LabObservation): LabEnemyView[] {
    const range = normalizeBasicAttackRange(obs.attackRange);
    return obs.enemies
        .filter((enemy) => enemy.hp > 0 && manhattan(obs.tile, enemy.tile) <= range)
        .sort((a, b) => manhattan(obs.tile, a.tile) - manhattan(obs.tile, b.tile) || a.id.localeCompare(b.id));
}

function nearestEnemy(obs: LabObservation, maxDist: number): LabEnemyView | null {
    let best: LabEnemyView | null = null;
    let bestDist = Infinity;
    for (const enemy of obs.enemies) {
        if (enemy.hp <= 0) continue;
        const dist = manhattan(obs.tile, enemy.tile);
        if (dist > maxDist || dist >= bestDist) continue;
        best = enemy;
        bestDist = dist;
    }
    return best;
}

function nearestLoot(obs: LabObservation, maxDist: number): LabLootView | null {
    let best: LabLootView | null = null;
    let bestDist = Infinity;
    for (const loot of obs.loot) {
        if (obs.ignoredLootIds.has(loot.id)) continue;
        const dist = manhattan(obs.tile, loot.tile);
        if (dist > maxDist || dist >= bestDist) continue;
        best = loot;
        bestDist = dist;
    }
    return best;
}

function moveToward(obs: LabObservation, goal: TilePoint, detail: string): LabDecision {
    return { kind: 'move', tile: obs.planStep(goal), detail };
}
