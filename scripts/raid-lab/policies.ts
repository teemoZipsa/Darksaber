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
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId && obs.random() < 0.5) {
        return { kind: 'leave_town', detail: `extract:${obs.currentTownId}` };
    }
    if (!obs.actorReady) return { kind: 'wait' };

    const hpRatio = obs.hp / Math.max(1, obs.maxHp);
    // Seed 973: random-rest beside aggro while low HP → enemy death. Survive bias first.
    if (hpRatio <= 0.4) {
        if (obs.healItemId && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
            return { kind: 'useItem', itemId: obs.healItemId, detail: 'random-heal-lowhp' };
        }
        if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
            return moveToward(obs, obs.extractionGoal, 'random-extract-lowhp');
        }
        const threatened = nearestEnemy(obs, 4) !== null;
        if (!threatened && obs.remainingAp >= REST_ACTION_GAUGE_COST) {
            return { kind: 'rest', detail: 'random-rest-lowhp' };
        }
        if (obs.remainingAp > 0) return { kind: 'endTurn', detail: 'random-end-lowhp' };
        return { kind: 'wait' };
    }

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
    // Prefer not resting when an enemy is adjacent — rest burns gauge while they swing.
    if (obs.remainingAp >= REST_ACTION_GAUGE_COST && nearestEnemy(obs, 1) === null) {
        options.push({ kind: 'rest', detail: 'random-rest' });
    }
    if (obs.remainingAp > 0) options.push({ kind: 'endTurn', detail: 'random-end' });
    if (obs.currentTownId && obs.currentTownId !== obs.departureTownId) {
        options.push({ kind: 'leave_town', detail: `extract:${obs.currentTownId}` });
    }
    // Do not offer early leave_manual — it made random-legal 100% LEFT in ~1s smokes.
    // Max-actions still forces a manual leave via the runner.

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

    // No extract-clear: seeds 168/321 spent 80–180 attacks with 0 kills then died.
    // Disengage toward town; heal/rest already handled above.
    if (obs.remainingAp >= MOVE_ACTION_GAUGE_COST) {
        return moveToward(obs, obs.extractionGoal, detailPrefix);
    }
    if (obs.remainingAp > 0) return { kind: 'endTurn', detail: `${detailPrefix}-spent` };
    return { kind: 'wait' };
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
        // Curse deaths (seeds 611/852) came from sealed reliquary pickups.
        if (isHazardLootId(loot.id)) continue;
        const dist = manhattan(obs.tile, loot.tile);
        if (dist > maxDist || dist >= bestDist) continue;
        best = loot;
        bestDist = dist;
    }
    return best;
}

function isHazardLootId(lootId: string): boolean {
    const id = lootId.toLowerCase();
    return id.includes('reliquary') || id.includes('cursed') || id.includes('hex');
}

function moveToward(obs: LabObservation, goal: TilePoint, detail: string): LabDecision {
    return { kind: 'move', tile: obs.planStep(goal), detail };
}
