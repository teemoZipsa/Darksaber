import { manhattan, type TilePoint } from '../../src/field/FieldPathing';
import { normalizeBasicAttackRange } from '../../src/combat/BasicAttackRange';
import { ATTACK_AP_COST, MOVE_ACTION_GAUGE_COST, REST_ACTION_GAUGE_COST } from '../../src/field/FieldActionEconomy';
import { pickIndex } from './rng';
import type { RaidLabPolicyId } from './types';

export type LabDecisionKind =
    | 'move'
    | 'attack'
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
    currentTownId: string | null;
    departureTownId: string;
    extractionGoal: TilePoint;
    extractionTownId: string;
    enemies: LabEnemyView[];
    loot: LabLootView[];
    ignoredLootIds: ReadonlySet<string>;
    healItemId: string | null;
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
    if (hpRatio <= 0.35 && obs.healItemId && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'useItem', itemId: obs.healItemId, detail: 'heal' };
    }
    if (hpRatio <= 0.25 && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
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
    if (hpRatio <= 0.55 && obs.healItemId && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'useItem', itemId: obs.healItemId, detail: 'heal' };
    }
    if (hpRatio <= 0.45 && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'rest', detail: 'cautious-rest' };
    }

    const adjacentThreat = nearestAttackable(obs);
    if (adjacentThreat && (adjacentThreat.isAggro || manhattan(obs.tile, adjacentThreat.tile) <= 1)
        && obs.remainingAp >= ATTACK_AP_COST) {
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

    // Cautious extracts early — only a short loot peek near spawn.
    if (!shouldExtract(obs)) {
        const nearbyLoot = nearestLoot(obs, 12);
        if (nearbyLoot && obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
            const adjacent = nearestLoot(obs, 1);
            if (adjacent) return { kind: 'loot', lootId: adjacent.id, detail: 'open-pickup' };
            return moveToward(obs, nearbyLoot.tile, 'loot-peek');
        }
    }

    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, obs.extractionGoal, 'extract-path');
    }
    if (obs.remainingAp > 0) return { kind: 'endTurn', detail: 'spent' };
    return { kind: 'wait' };
}

function randomLegalPolicy(obs: LabObservation): LabDecision {
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId && obs.random() < 0.5) {
        return { kind: 'leave_town', detail: `extract:${obs.currentTownId}` };
    }
    if (!obs.actorReady) return { kind: 'wait' };

    const options: LabDecision[] = [];
    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        options.push(moveToward(obs, obs.extractionGoal, 'random-extract'));
        if (!shouldExtract(obs)) {
            const enemy = nearestEnemy(obs, Number.POSITIVE_INFINITY);
            if (enemy) options.push(moveToward(obs, enemy.tile, 'random-chase'));
            const loot = nearestLoot(obs, 24);
            if (loot) options.push(moveToward(obs, loot.tile, 'random-loot'));
        }
    }
    const attackable = nearestAttackable(obs);
    if (attackable && obs.remainingAp >= ATTACK_AP_COST) {
        options.push({ kind: 'attack', targetId: attackable.id, detail: 'random-attack' });
    }
    if (obs.healItemId && obs.remainingAp >= REST_ACTION_GAUGE_COST && obs.hp < obs.maxHp) {
        options.push({ kind: 'useItem', itemId: obs.healItemId, detail: 'random-heal' });
    }
    if (obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        options.push({ kind: 'rest', detail: 'random-rest' });
    }
    if (obs.remainingAp > 0) options.push({ kind: 'endTurn', detail: 'random-end' });
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId) {
        options.push({ kind: 'leave_town', detail: `extract:${obs.currentTownId}` });
    }
    if (!shouldExtract(obs)) {
        options.push({ kind: 'leave_manual', detail: 'random-leave' });
    }

    if (options.length === 0) return { kind: 'wait' };
    return options[pickIndex(obs.random, options.length)]!;
}

function extractPhase(obs: LabObservation, hpRatio: number, detailPrefix: string): LabDecision {
    // Survive first — extractPhase used to skip heal/rest once entered.
    if (hpRatio <= 0.5 && obs.healItemId && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'useItem', itemId: obs.healItemId, detail: `${detailPrefix}-heal` };
    }
    if (hpRatio <= 0.35 && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
        return { kind: 'rest', detail: `${detailPrefix}-rest` };
    }

    const adjacentThreat = nearestAttackable(obs);
    // Only clear when healthy and the foe sits on the extract axis; otherwise disengage.
    if (adjacentThreat && manhattan(obs.tile, adjacentThreat.tile) <= 1
        && obs.remainingAp >= ATTACK_AP_COST
        && hpRatio > 0.65
        && isOnExtractAxis(obs.tile, adjacentThreat.tile, obs.extractionGoal)) {
        return { kind: 'attack', targetId: adjacentThreat.id, detail: `${detailPrefix}-clear` };
    }

    // No sidestep bypass — prior bypass variants stalled (seeds 10/53/77/194) or
    // cancelled extract progress. Push the extract goal; clear only when blocking.
    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, obs.extractionGoal, detailPrefix);
    }
    if (obs.remainingAp > 0) return { kind: 'endTurn', detail: `${detailPrefix}-spent` };
    return { kind: 'wait' };
}

/** True when the foe lies toward the extract goal on at least one shared axis. */
function isOnExtractAxis(from: TilePoint, foe: TilePoint, goal: TilePoint): boolean {
    const ex = Math.sign(goal.x - from.x);
    const ey = Math.sign(goal.y - from.y);
    const fx = Math.sign(foe.x - from.x);
    const fy = Math.sign(foe.y - from.y);
    return (ex !== 0 && fx === ex) || (ey !== 0 && fy === ey);
}

function nearestAttackable(obs: LabObservation): LabEnemyView | null {
    const range = normalizeBasicAttackRange(obs.attackRange);
    let best: LabEnemyView | null = null;
    let bestDist = Infinity;
    for (const enemy of obs.enemies) {
        if (enemy.hp <= 0) continue;
        const dist = manhattan(obs.tile, enemy.tile);
        if (dist > range) continue;
        if (dist < bestDist) {
            best = enemy;
            bestDist = dist;
        }
    }
    return best;
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
